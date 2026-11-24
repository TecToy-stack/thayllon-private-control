import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "4mb" }));

const ALLOWED_ORIGINS = new Set(
  [
    "https://localhost",
    "capacitor://localhost",
    "http://localhost",
    "http://localhost:3000",
    process.env.APP_URL?.replace(/\/+$/, ""),
  ].filter(Boolean) as string[]
);

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith(".run.app"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// ==================== PERSISTENT VAULT STORAGE (.vault_data) ====================
const VAULT_DIR = path.resolve(__dirname, ".vault_data");
fs.mkdirSync(VAULT_DIR, { recursive: true });

const SESSION_SECRET_PATH = path.resolve(VAULT_DIR, ".session_secret");
function resolveSessionSecret(): string {
  if (process.env.VAULT_SESSION_SECRET) {
    return process.env.VAULT_SESSION_SECRET;
  }
  try {
    if (fs.existsSync(SESSION_SECRET_PATH)) {
      const existing = fs.readFileSync(SESSION_SECRET_PATH, "utf8").trim();
      if (/^[a-f0-9]{64}$/.test(existing)) {
        return existing;
      }
    }
    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(SESSION_SECRET_PATH, generated, { encoding: "utf8", mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString("hex");
  }
}

const SESSION_SECRET = resolveSessionSecret();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

type KycStatus = "pending" | "under_review" | "verified";
type KycDocumentType = "CNH" | "RG" | "CIN";

interface StoredBiometric {
  enabled: boolean;
  credentialId?: string;
  deviceKeyHash?: string;
  deviceLabel?: string;
  mode?: "capacitor_native" | "webauthn" | "device_key";
  registeredAt?: string;
}

interface StoredProfile {
  cpfId: string;
  maskedCpf: string;
  fullName: string;
  birthDate: string;
  email?: string;
  phone?: string;
  kycStatus: KycStatus;
  kycDocumentType?: KycDocumentType;
  kycDocumentLast4?: string;
  kycSelfieVerifiedAt?: string;
  kycAuditId?: string;
  createdAt: string;
  updatedAt: string;
}

interface VaultRecord {
  version: number;
  cpfId: string;
  profile: StoredProfile;
  pinHash: string;
  biometric: StoredBiometric;
  appState: Record<string, unknown>;
}

// ==================== CRYPTO & CPF HELPERS ====================
function cleanCpf(raw: string): string {
  return String(raw || "").replace(/\D/g, "").slice(0, 11);
}

function isValidCpfServer(raw: string): boolean {
  const cpf = cleanCpf(raw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(cpf.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  return rem === parseInt(cpf.charAt(10), 10);
}

function maskCpfDigits(cpfDigits: string): string {
  return `•••.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-••`;
}

function hashCpfId(cpfDigits: string): string {
  return crypto.createHash("sha256").update(`tpc_cpf_v1:${cpfDigits}`).digest("hex");
}

function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(secret, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifySecret(secret: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;
    const [salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    const derived = crypto.scryptSync(secret, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function resolveVaultPath(cpfId: string): string | null {
  if (!/^[a-f0-9]{64}$/.test(cpfId)) return null;
  const target = path.resolve(VAULT_DIR, `${cpfId}.json`);
  if (!target.startsWith(VAULT_DIR + path.sep)) return null;
  return target;
}

function readVault(cpfId: string): VaultRecord | null {
  const filePath = resolveVaultPath(cpfId);
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as VaultRecord;
  } catch {
    return null;
  }
}

function writeVault(record: VaultRecord): boolean {
  const filePath = resolveVaultPath(record.cpfId);
  if (!filePath) return false;
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(record, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
  return true;
}

function toClientBiometric(bio: StoredBiometric) {
  return {
    enabled: Boolean(bio.enabled),
    credentialId: bio.credentialId,
    deviceLabel: bio.deviceLabel,
    mode: bio.mode,
    registeredAt: bio.registeredAt,
  };
}

function issueSessionToken(cpfId: string): string {
  const payload = {
    cpfId,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
    jti: crypto.randomBytes(8).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): { cpfId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encoded)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      cpfId?: string;
      exp?: number;
    };
    if (!payload.cpfId || !payload.exp || Date.now() > payload.exp) return null;
    if (!/^[a-f0-9]{64}$/.test(payload.cpfId)) return null;
    return { cpfId: payload.cpfId };
  } catch {
    return null;
  }
}

interface AuthenticatedRequest extends Request {
  authCpfId?: string;
}

function requireVaultAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Sessão não autenticada." });
    return;
  }
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({ error: "Token de sessão inválido ou expirado." });
    return;
  }
  req.authCpfId = verified.cpfId;
  next();
}

function validatePinFormat(pin: unknown): string | null {
  if (typeof pin !== "string") return null;
  const clean = pin.trim();
  if (!/^\d{4,6}$/.test(clean)) return null;
  return clean;
}

// ==================== AUTH & VAULT ENDPOINTS ====================

app.post("/api/auth/lookup", (req, res) => {
  const cpfDigits = cleanCpf(req.body?.cpf);
  if (!isValidCpfServer(cpfDigits)) {
    res.status(400).json({ error: "CPF inválido. Verifique os 11 dígitos informados." });
    return;
  }
  const cpfId = hashCpfId(cpfDigits);
  const vault = readVault(cpfId);

  if (!vault) {
    res.json({
      exists: false,
      cpfId,
      maskedCpf: maskCpfDigits(cpfDigits),
    });
    return;
  }

  res.json({
    exists: true,
    cpfId,
    maskedCpf: vault.profile.maskedCpf,
    fullNameHint: vault.profile.fullName,
    kycStatus: vault.profile.kycStatus,
    biometric: toClientBiometric(vault.biometric),
  });
});

app.post("/api/auth/register", (req, res) => {
  const cpfDigits = cleanCpf(req.body?.cpf);
  if (!isValidCpfServer(cpfDigits)) {
    res.status(400).json({ error: "CPF inválido." });
    return;
  }
  const cpfId = hashCpfId(cpfDigits);
  if (readVault(cpfId)) {
    res.status(409).json({ error: "Este CPF já possui cofre cadastrado. Faça login." });
    return;
  }

  const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  const birthDate = typeof req.body?.birthDate === "string" ? req.body.birthDate.trim() : "";
  if (fullName.length < 3) {
    res.status(400).json({ error: "Informe o nome completo do titular." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    res.status(400).json({ error: "Informe uma data de nascimento válida." });
    return;
  }

  const pin = validatePinFormat(req.body?.pin);
  if (!pin) {
    res.status(400).json({ error: "Defina um PIN numérico de 4 a 6 dígitos." });
    return;
  }

  const now = new Date().toISOString();
  const kycStatusInput = req.body?.kycStatus;
  const kycStatus: KycStatus =
    kycStatusInput === "verified" || kycStatusInput === "under_review"
      ? kycStatusInput
      : "pending";
  const docType = req.body?.kycDocumentType;
  const validDocType: KycDocumentType | undefined =
    docType === "CNH" || docType === "RG" || docType === "CIN" ? docType : undefined;
  const docLast4 =
    typeof req.body?.kycDocumentLast4 === "string"
      ? req.body.kycDocumentLast4.replace(/\D/g, "").slice(-4)
      : undefined;

  const profile: StoredProfile = {
    cpfId,
    maskedCpf: maskCpfDigits(cpfDigits),
    fullName,
    birthDate,
    email: typeof req.body?.email === "string" && req.body.email.trim() ? req.body.email.trim() : undefined,
    phone: typeof req.body?.phone === "string" && req.body.phone.trim() ? req.body.phone.trim() : undefined,
    kycStatus,
    kycDocumentType: validDocType,
    kycDocumentLast4: docLast4 || undefined,
    kycSelfieVerifiedAt: kycStatus === "verified" ? now : undefined,
    kycAuditId: `kyc_${crypto.randomBytes(6).toString("hex")}`,
    createdAt: now,
    updatedAt: now,
  };

  let biometric: StoredBiometric = { enabled: false };
  const bioInput = req.body?.biometric;
  if (
    bioInput?.enabled &&
    typeof bioInput.credentialId === "string" &&
    typeof bioInput.deviceKey === "string" &&
    bioInput.deviceKey.length >= 16
  ) {
    biometric = {
      enabled: true,
      credentialId: bioInput.credentialId,
      deviceKeyHash: hashSecret(bioInput.deviceKey),
      deviceLabel: typeof bioInput.deviceLabel === "string" ? bioInput.deviceLabel : "Dispositivo Autorizado",
      mode:
        bioInput.mode === "capacitor_native" || bioInput.mode === "webauthn"
          ? bioInput.mode
          : "device_key",
      registeredAt: now,
    };
  }

  const initialState =
    req.body?.appState && typeof req.body.appState === "object"
      ? (req.body.appState as Record<string, unknown>)
      : {};

  const record: VaultRecord = {
    version: 1,
    cpfId,
    profile,
    pinHash: hashSecret(pin),
    biometric,
    appState: initialState,
  };

  writeVault(record);
  const token = issueSessionToken(cpfId);

  res.status(201).json({
    token,
    profile: record.profile,
    biometric: toClientBiometric(record.biometric),
    appState: record.appState,
  });
});

app.post("/api/auth/login", (req, res) => {
  const cpfDigits = cleanCpf(req.body?.cpf);
  if (!isValidCpfServer(cpfDigits)) {
    res.status(400).json({ error: "CPF inválido." });
    return;
  }
  const cpfId = hashCpfId(cpfDigits);
  const vault = readVault(cpfId);
  if (!vault) {
    res.status(404).json({ error: "Conta não localizada para este CPF." });
    return;
  }

  const method = req.body?.method === "biometric" ? "biometric" : "pin";
  if (method === "biometric") {
    if (!vault.biometric.enabled || !vault.biometric.deviceKeyHash) {
      res.status(401).json({ error: "Biometria não configurada para esta conta. Use seu PIN." });
      return;
    }
    const credId = req.body?.credentialId;
    const deviceKey = req.body?.deviceKey;
    if (
      typeof credId !== "string" ||
      typeof deviceKey !== "string" ||
      credId !== vault.biometric.credentialId ||
      !verifySecret(deviceKey, vault.biometric.deviceKeyHash)
    ) {
      res.status(401).json({
        error: "Chave biométrica deste dispositivo não validada. Entre com seu PIN e reative a biometria.",
      });
      return;
    }
  } else {
    const pin = validatePinFormat(req.body?.pin);
    if (!pin || !verifySecret(pin, vault.pinHash)) {
      res.status(401).json({ error: "PIN incorreto. Tente novamente." });
      return;
    }
  }

  const token = issueSessionToken(cpfId);
  res.json({
    token,
    profile: vault.profile,
    biometric: toClientBiometric(vault.biometric),
    appState: vault.appState,
  });
});

app.post("/api/auth/unlock", requireVaultAuth, (req: AuthenticatedRequest, res) => {
  const cpfId = req.authCpfId!;
  const vault = readVault(cpfId);
  if (!vault) {
    res.status(404).json({ error: "Cofre não encontrado." });
    return;
  }

  const method = req.body?.method === "biometric" ? "biometric" : "pin";
  if (method === "biometric") {
    if (!vault.biometric.enabled || !vault.biometric.deviceKeyHash) {
      res.status(401).json({ error: "Biometria não configurada. Utilize o PIN." });
      return;
    }
    const credId = req.body?.credentialId;
    const deviceKey = req.body?.deviceKey;
    if (
      typeof credId !== "string" ||
      typeof deviceKey !== "string" ||
      credId !== vault.biometric.credentialId ||
      !verifySecret(deviceKey, vault.biometric.deviceKeyHash)
    ) {
      res.status(401).json({ error: "Falha na validação biométrica deste dispositivo." });
      return;
    }
  } else {
    const pin = validatePinFormat(req.body?.pin);
    if (!pin || !verifySecret(pin, vault.pinHash)) {
      res.status(401).json({ error: "PIN incorreto. Tente novamente." });
      return;
    }
  }

  res.json({ unlocked: true });
});

app.get("/api/vault", requireVaultAuth, (req: AuthenticatedRequest, res) => {
  const vault = readVault(req.authCpfId!);
  if (!vault) {
    res.status(404).json({ error: "Cofre não encontrado." });
    return;
  }
  res.json({
    profile: vault.profile,
    biometric: toClientBiometric(vault.biometric),
    appState: vault.appState,
  });
});

app.put("/api/vault", requireVaultAuth, (req: AuthenticatedRequest, res) => {
  const vault = readVault(req.authCpfId!);
  if (!vault) {
    res.status(404).json({ error: "Cofre não encontrado." });
    return;
  }
  const incomingState = req.body?.appState;
  if (!incomingState || typeof incomingState !== "object") {
    res.status(400).json({ error: "Payload de estado financeiro inválido." });
    return;
  }

  vault.appState = incomingState as Record<string, unknown>;
  vault.profile.updatedAt = new Date().toISOString();
  writeVault(vault);

  res.json({ savedAt: vault.profile.updatedAt });
});

app.put("/api/vault/kyc", requireVaultAuth, (req: AuthenticatedRequest, res) => {
  const vault = readVault(req.authCpfId!);
  if (!vault) {
    res.status(404).json({ error: "Cofre não encontrado." });
    return;
  }
  const now = new Date().toISOString();
  const docType = req.body?.kycDocumentType;
  if (docType === "CNH" || docType === "RG" || docType === "CIN") {
    vault.profile.kycDocumentType = docType;
  }
  if (typeof req.body?.kycDocumentLast4 === "string") {
    const clean4 = req.body.kycDocumentLast4.replace(/\D/g, "").slice(-4);
    if (clean4) vault.profile.kycDocumentLast4 = clean4;
  }
  const status = req.body?.kycStatus;
  if (status === "pending" || status === "under_review" || status === "verified") {
    vault.profile.kycStatus = status;
    if (status === "verified") {
      vault.profile.kycSelfieVerifiedAt = now;
    }
  }
  vault.profile.kycAuditId = vault.profile.kycAuditId || `kyc_${crypto.randomBytes(6).toString("hex")}`;
  vault.profile.updatedAt = now;
  writeVault(vault);

  res.json({ profile: vault.profile });
});

app.put("/api/vault/security", requireVaultAuth, (req: AuthenticatedRequest, res) => {
  const vault = readVault(req.authCpfId!);
  if (!vault) {
    res.status(404).json({ error: "Cofre não encontrado." });
    return;
  }

  const now = new Date().toISOString();

  if (req.body?.newPin !== undefined) {
    const currentPin = validatePinFormat(req.body?.currentPin);
    if (!currentPin || !verifySecret(currentPin, vault.pinHash)) {
      res.status(401).json({ error: "PIN atual incorreto para alterar o PIN." });
      return;
    }
    const newPin = validatePinFormat(req.body?.newPin);
    if (!newPin) {
      res.status(400).json({ error: "O novo PIN deve conter de 4 a 6 dígitos numéricos." });
      return;
    }
    vault.pinHash = hashSecret(newPin);
  }

  if (req.body?.biometric !== undefined) {
    const bio = req.body.biometric;
    if (bio?.enabled === false) {
      vault.biometric = { enabled: false };
    } else if (
      bio?.enabled === true &&
      typeof bio.credentialId === "string" &&
      typeof bio.deviceKey === "string" &&
      bio.deviceKey.length >= 16
    ) {
      vault.biometric = {
        enabled: true,
        credentialId: bio.credentialId,
        deviceKeyHash: hashSecret(bio.deviceKey),
        deviceLabel: typeof bio.deviceLabel === "string" ? bio.deviceLabel : "Dispositivo Autorizado",
        mode:
          bio.mode === "capacitor_native" || bio.mode === "webauthn"
            ? bio.mode
            : "device_key",
        registeredAt: now,
      };
    }
  }

  vault.profile.updatedAt = now;
  writeVault(vault);

  res.json({
    profile: vault.profile,
    biometric: toClientBiometric(vault.biometric),
  });
});

// ==================== GEMINI ASSISTANT ENDPOINT ====================
interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

interface AssistantRequestBody {
  message: string;
  persona: "integrated" | "friend" | "banker";
  language?: "pt" | "en" | "es";
  history?: ChatMessageInput[];
  financialContext: Record<string, unknown>;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function detectComplianceViolationServer(message: string): string | null {
  const normalized = (message || "").toLowerCase();
  const violates =
    /(digitar|informar|inserir|enviar|pedir|salvar|armazenar|simular|coletar|passar|qual)\s+.{0,30}(senha\s*(banc|do\s*banco|do\s*app|da\s*conta|do\s*cart[aã]o)|pin\s*banc|token\s*(banc|sms|seguran)|c[oó]digo\s*(sms|mfa|2fa|token)|cvv|c[oó]digo\s*de\s*seguran[cç]a|validade\s*do\s*cart[aã]o|n[uú]mero\s*completo\s*do\s*cart[aã]o)/i.test(
      normalized
    ) ||
    /(burlar|pular|contornar|ignorar)\s+.{0,30}(consentimento|oauth|fapi|open\s*finance|autentica[cç][aã]o)/i.test(
      normalized
    );

  if (!violates) return null;

  return (
    "Por conformidade obrigatória com a LGPD e as regulamentações do Banco Central (Open Finance Brasil), " +
    "este módulo não solicita, coleta, simula ou armazena senhas bancárias, PINs, tokens de segurança, códigos SMS/MFA, CVV, data de validade ou número completo de cartão.\n\n" +
    "**Caminho oficial:** Toda conexão ou renovação de instituição financeira ocorre exclusivamente fora do aplicativo, no ambiente oficial do banco via **OAuth 2.0 / FAPI + PKCE**, com consentimento explícito, prazo definido e revogação imediata."
  );
}

function buildSystemInstruction(
  persona: "integrated" | "friend" | "banker",
  contextJson: string,
  language: "pt" | "en" | "es" = "pt"
): string {
  const personaGuide =
    persona === "friend"
      ? `VOZ ATIVA: "Chat Amigo" — Seja próximo, humano, parceiro, direto e sem julgamentos. Fale como um amigo de confiança que entende de finanças do dia a dia, apontando vazamentos silenciosos e sugerindo ajustes realistas sem sacrificar o bem-estar.`
      : persona === "banker"
      ? `VOZ ATIVA: "Gerente Bancário Exclusivo (Private Banker)" — Seja objetivo, analítico, elegante e focado em gestão patrimonial. Analise RESULTADO mensal, reserva GUARDADO / VALOR TOTAL, estabilidade das receitas vs. despesas, margem de risco, alocação em liquidez diária (CDI), pós-fixados, prefixados e IPCA+, e projeções com cenários Conservador, Base e Otimista. Inclua sempre uma breve nota de que projeções são educativas e dependem das condições de mercado.`
      : `VOZ ATIVA: "Modo Integrado (Chat Amigo + Gerente Bancário Exclusivo)" — Combine as duas vozes de forma complementar e claramente estruturada: comece com a visão acolhedora e prática do Chat Amigo (hábitos, economia cotidiana, fluxo do mês) e em seguida traga a recomendação estratégica do Gerente Bancário Exclusivo (alocação patrimonial, liquidez, cenários de rentabilidade).`;

  const langRule =
    language === "en"
      ? "English (en), formatting BRL amounts clearly as R$ 1,234.56 or R$ 1.234,56."
      : language === "es"
      ? "Español (es), manteniendo los montos en reales brasileños (R$ 1.234,56)."
      : "Português do Brasil (pt-BR), com formatação monetária R$ 1.234,56.";

  return `Você é o módulo especialista em Open Finance Brasil e consultor financeiro exclusivo do aplicativo "Thayllon Private Control (CF 2026+)".
Idioma obrigatório de resposta: ${langRule}

${personaGuide}

REGRAS OBRIGATÓRIAS DE SEGURANÇA E CONFORMIDADE (LGPD / BACEN):
1. NUNCA solicite, colete, peça para digitar, simule campos ou armazene senhas bancárias, tokens de segurança, PINs bancários, códigos SMS/MFA ou dados sensíveis de cartão físico (número completo, CVV, data de validade).
2. Toda conexão com instituições financeiras ocorre fora do app, no ambiente oficial do banco (OAuth 2.0 / FAPI + PKCE, via Open Finance oficial, Pluggy ou Belvo), com consentimento explícito, prazo definido e possibilidade de revogação a qualquer momento.
3. Trate saldos, extratos, lançamentos, limites e faturas de cartão como dados pessoais sensíveis sob a LGPD. Nunca exponha dados técnicos sensíveis.
4. Se o usuário pedir algo que exija senha bancária ou tentar burlar o fluxo de consentimento, recuse com clareza e oriente o caminho oficial pelo fluxo OAuth 2.0 / FAPI do banco na aba "Contas & Open Finance".

COMO ATUAR COM OS DADOS DO OPEN FINANCE:
1. Leia e cite OS NÚMEROS REAIS do usuário fornecidos no contexto JSON abaixo. Nunca invente valores que contradigam o contexto. Se os valores estiverem zerados (R$ 0,00), oriente o usuário com clareza a preencher os primeiros lançamentos ou conectar contas via fluxo oficial.
2. Consolide contas, transações e faturas sem duplicar transferências internas ou pagamentos de fatura ao analisar gastos reais (observe o campo "transferenciasEPagamentosFaturaDesduplicados" no contexto).
3. Diferencie claramente gastos à vista ("gastoAVista") vs. compras parceladas ("gastoParceladoNoMes" e "saldoRestanteParcelamentos"), limites disponíveis vs. totais e datas de fechamento/vencimento e status das faturas (aberta/fechada/paga).
4. Quando houver ausência de sincronização, consentimento expirado ("consent_expired") ou erro de conector ("sync_error") em "contasBancariasConectadas", informe o estado de forma transparente e indique a renovação no fluxo oficial do banco sem expor detalhes técnicos sensíveis.
5. Quando o usuário perguntar sobre projeções de investimento, calcule e apresente cenários claros (Conservador, Base, Otimista) com base no valor guardado e na capacidade de aporte mensal observada no RESULTADO, incluindo nota discreta de que são simulações educativas sujeitas às condições de mercado.
6. Seja conciso, escaneável (subtítulos curtos e listas objetivas) e acionável.

DADOS FINANCEIROS ATUAIS DO USUÁRIO (OPEN FINANCE & GRADE CF — LGPD SAFE):
${contextJson}`;
}

app.post("/api/assistant/chat", requireVaultAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body as AssistantRequestBody;
    if (!body?.message || typeof body.message !== "string") {
      res.status(400).json({ error: "Mensagem inválida." });
      return;
    }

    const complianceRefusal = detectComplianceViolationServer(body.message);
    if (complianceRefusal) {
      res.json({
        reply: complianceRefusal,
        model: "open-finance-lgpd-guard",
      });
      return;
    }

    const ai = getGeminiClient();
    const contextJson = JSON.stringify(body.financialContext ?? {}, null, 2);
    const reqLang = body.language === "en" || body.language === "es" ? body.language : "pt";
    const systemInstruction = buildSystemInstruction(body.persona ?? "integrated", contextJson, reqLang);

    const historyMessages = (body.history ?? []).slice(-10).map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    const contents = [
      ...historyMessages,
      { role: "user" as const, parts: [{ text: body.message }] },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents,
      config: {
        systemInstruction,
      },
    });

    const reply = response.text?.trim();
    if (!reply) {
      res.status(502).json({ error: "O assistente não retornou texto válido." });
      return;
    }

    res.json({
      reply,
      model: "gemini-4-hydrogen",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor.";
    if (message === "GEMINI_API_KEY_MISSING") {
      res.status(503).json({
        error: "Chave GEMINI_API_KEY não configurada no painel Settings > Secrets.",
        code: "GEMINI_API_KEY_MISSING",
      });
      return;
    }
    console.error("[assistant/chat] Error:", message);
    res.status(500).json({
      error: "Falha temporária ao consultar o assistente. Tente novamente em instantes.",
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Thayllon Private Control" });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Endpoint da API não encontrado." });
});

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const syntaxErr = err as { type?: string; status?: number };
  if (syntaxErr?.type === "entity.parse.failed" || syntaxErr?.status === 400) {
    res.status(400).json({ error: "Corpo da requisição JSON inválido." });
    return;
  }
  if (req.path.startsWith("/api")) {
    const safeMsg = err instanceof Error ? err.message : "Erro interno";
    console.error("[api] Unexpected error:", safeMsg);
    res.status(500).json({ error: "Erro interno ao processar requisição." });
    return;
  }
  next(err);
});

app.get("/favicon.ico", (_req, res) => {
  const iconPath = path.resolve(__dirname, "public", "pwa-192x192.png");
  if (fs.existsSync(iconPath)) {
    res.type("image/png").sendFile(iconPath);
    return;
  }
  res.status(204).end();
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    app.get("/manifest.webmanifest", (_req, res) => {
      const manifestPath = path.resolve(__dirname, "public", "manifest.json");
      if (fs.existsSync(manifestPath)) {
        res.type("application/manifest+json").sendFile(manifestPath);
        return;
      }
      res.status(404).end();
    });

    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Thayllon Private Control server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
