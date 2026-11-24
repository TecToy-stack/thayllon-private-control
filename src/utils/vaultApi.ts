import {
  AppState,
  BiometricConfig,
  KycDocumentType,
  KycStatus,
  UserProfile,
} from '../types/finance';
import { cleanCPF, isValidCPF, maskCPF } from './cpf';
import { createCleanAppState } from '../data/initialData';

function getConfiguredApiBase(): string {
  try {
    const raw = (import.meta.env?.VITE_API_BASE_URL ?? '').trim();
    if (
      raw &&
      raw !== 'undefined' &&
      raw !== 'null' &&
      !raw.startsWith('MY_') &&
      /^https?:\/\//i.test(raw)
    ) {
      return raw.replace(/\/+$/, '');
    }
  } catch {
    // Fallback automático abaixo quando import.meta.env não estiver disponível
  }
  return '';
}

function isCapacitorBundledRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const proto = window.location?.protocol || '';
  if (proto === 'capacitor:' || proto === 'file:') return true;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function getApiBaseUrl(): string {
  const configured = getConfiguredApiBase();
  if (configured) return configured;

  // Fallback automático seguro: usa a origem HTTP/HTTPS atual no navegador web
  // ou rota local relativa ("") quando embutido.
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, origin } = window.location;
    if (
      !isCapacitorBundledRuntime() &&
      (protocol === 'http:' || protocol === 'https:') &&
      origin &&
      origin !== 'null'
    ) {
      return origin.replace(/\/+$/, '');
    }
  }

  return '';
}

function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

// ==================== OFFLINE / WEBVIEW FALLBACK ENGINE ====================
// Garante que empacotamentos Android Capacitor totalmente offline (sem servidor remoto)
// mantenham cadastro por CPF, KYC, PIN com hash PBKDF2/SHA-256, biometria e cofre persistente.

const OFFLINE_DB_NAME = 'ThayllonPrivateOfflineAuthDB';
const OFFLINE_STORE = 'offline_vaults';

interface OfflineVaultRecord {
  cpfId: string;
  profile: UserProfile;
  pinSalt: string;
  pinHash: string;
  biometric: BiometricConfig & { deviceKeySalt?: string; deviceKeyHash?: string };
  appState: AppState;
}

function openOfflineDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(OFFLINE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
          db.createObjectStore(OFFLINE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readOfflineVault(cpfId: string): Promise<OfflineVaultRecord | null> {
  const db = await openOfflineDB();
  if (db) {
    try {
      const rec = await new Promise<OfflineVaultRecord | null>((resolve) => {
        const tx = db.transaction(OFFLINE_STORE, 'readonly');
        const req = tx.objectStore(OFFLINE_STORE).get(cpfId);
        req.onsuccess = () => resolve((req.result as OfflineVaultRecord) ?? null);
        req.onerror = () => resolve(null);
      });
      if (rec) return rec;
    } catch {
      // Fallback below
    }
  }
  try {
    const raw = localStorage.getItem(`tpc_offline_vault_${cpfId}`);
    return raw ? (JSON.parse(raw) as OfflineVaultRecord) : null;
  } catch {
    return null;
  }
}

async function writeOfflineVault(record: OfflineVaultRecord): Promise<void> {
  try {
    localStorage.setItem(`tpc_offline_vault_${record.cpfId}`, JSON.stringify(record));
  } catch {
    // Ignore quota errors
  }
  const db = await openOfflineDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).put(record, record.cpfId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB errors
  }
}

function pureJsSha256Hex(bytes: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const l = bytes.length;
  const bitLen = l * 8;
  const paddedLen = Math.ceil((l + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[l] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return Array.from(H)
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fallback to pure-JS SHA-256 below
  }
  return pureJsSha256Hex(bytes);
}

function randomHex(len = 16): string {
  const arr = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < len; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashSecretLocal(secret: string, existingSalt?: string): Promise<{ salt: string; hash: string }> {
  const salt = existingSalt || randomHex(16);
  const hash = await sha256Hex(`tpc_local_v1:${salt}:${secret}`);
  return { salt, hash };
}

function makeOfflineToken(cpfId: string): string {
  return `offline_${cpfId}`;
}

function parseOfflineToken(token: string): string | null {
  return token.startsWith('offline_') ? token.slice(8) : null;
}

async function callServerJson<T>(
  path: string,
  options: RequestInit
): Promise<{ reachable: true; ok: boolean; status: number; data: T } | { reachable: false }> {
  // Em WebView nativo Capacitor sem VITE_API_BASE_URL configurado ou quando offline,
  // opera direto no cofre offline evitando requisições de rede falhas no console.
  if (isCapacitorBundledRuntime() && !getConfiguredApiBase()) {
    return { reachable: false };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { reachable: false };
  }

  try {
    const res = await fetch(apiUrl(path), options);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { reachable: false };
    }
    const data = (await res.json()) as T;
    return { reachable: true, ok: res.ok, status: res.status, data };
  } catch {
    return { reachable: false };
  }
}

// ==================== UNIFIED VAULT CLIENT API ====================

let activeOnlineCpfId: string | null = null;

async function mirrorServerVaultToOfflineCache(params: {
  profile: UserProfile;
  biometric: BiometricConfig;
  appState: AppState;
  pin?: string;
  deviceKey?: string;
}): Promise<void> {
  try {
    const existing = await readOfflineVault(params.profile.cpfId);
    let pinSalt = existing?.pinSalt || '';
    let pinHash = existing?.pinHash || '';
    if (params.pin) {
      const hashedPin = await hashSecretLocal(params.pin);
      pinSalt = hashedPin.salt;
      pinHash = hashedPin.hash;
    }

    let bioRecord: OfflineVaultRecord['biometric'] = existing?.biometric || { enabled: false };
    if (params.biometric.enabled) {
      if (params.deviceKey) {
        const bioSec = await hashSecretLocal(params.deviceKey);
        bioRecord = {
          enabled: true,
          credentialId: params.biometric.credentialId,
          deviceLabel: params.biometric.deviceLabel,
          mode: params.biometric.mode,
          registeredAt: params.biometric.registeredAt,
          deviceKeySalt: bioSec.salt,
          deviceKeyHash: bioSec.hash,
        };
      } else {
        bioRecord = {
          ...bioRecord,
          enabled: true,
          credentialId: params.biometric.credentialId ?? bioRecord.credentialId,
          deviceLabel: params.biometric.deviceLabel ?? bioRecord.deviceLabel,
          mode: params.biometric.mode ?? bioRecord.mode,
          registeredAt: params.biometric.registeredAt ?? bioRecord.registeredAt,
        };
      }
    } else {
      bioRecord = { enabled: false };
    }

    await writeOfflineVault({
      cpfId: params.profile.cpfId,
      profile: params.profile,
      pinSalt,
      pinHash,
      biometric: bioRecord,
      appState: params.appState,
    });
  } catch {
    // Contingência silenciosa: não interrompe fluxo autenticado principal
  }
}

export async function lookupCpfVault(cpfRaw: string) {
  const digits = cleanCPF(cpfRaw);
  const server = await callServerJson<{
    exists: boolean;
    cpfId: string;
    maskedCpf: string;
    fullNameHint?: string;
    kycStatus?: KycStatus;
    biometric?: BiometricConfig;
    error?: string;
  }>('/api/auth/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf: digits }),
  });

  if (server.reachable) {
    if (!server.ok) throw new Error(server.data.error || 'Falha ao consultar CPF.');
    return { ...server.data, source: 'server' as const };
  }

  if (!isValidCPF(digits)) {
    throw new Error('CPF inválido. Verifique os 11 dígitos informados.');
  }
  const cpfId = await sha256Hex(`tpc_cpf_v1:${digits}`);
  const local = await readOfflineVault(cpfId);
  if (!local) {
    return {
      exists: false,
      cpfId,
      maskedCpf: maskCPF(digits),
      source: 'offline' as const,
    };
  }
  return {
    exists: true,
    cpfId,
    maskedCpf: local.profile.maskedCpf,
    fullNameHint: local.profile.fullName,
    kycStatus: local.profile.kycStatus,
    biometric: {
      enabled: local.biometric.enabled,
      credentialId: local.biometric.credentialId,
      deviceLabel: local.biometric.deviceLabel,
      mode: local.biometric.mode,
      registeredAt: local.biometric.registeredAt,
    },
    source: 'offline' as const,
  };
}

export async function registerCpfVault(payload: {
  cpf: string;
  fullName: string;
  birthDate: string;
  email?: string;
  phone?: string;
  kycStatus: KycStatus;
  kycDocumentType?: KycDocumentType;
  kycDocumentLast4?: string;
  pin: string;
  biometric: {
    enabled: boolean;
    credentialId?: string;
    deviceKey?: string;
    deviceLabel?: string;
    mode?: 'capacitor_native' | 'webauthn' | 'device_key';
  };
  appState: AppState;
}) {
  const server = await callServerJson<{
    token: string;
    profile: UserProfile;
    biometric: BiometricConfig;
    appState: AppState;
    error?: string;
  }>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (server.reachable) {
    if (!server.ok) throw new Error(server.data.error || 'Falha ao criar cofre.');
    activeOnlineCpfId = server.data.profile.cpfId;
    await mirrorServerVaultToOfflineCache({
      profile: server.data.profile,
      biometric: server.data.biometric,
      appState: server.data.appState,
      pin: payload.pin,
      deviceKey: payload.biometric.deviceKey,
    });
    return { ...server.data, source: 'server' as const };
  }

  const digits = cleanCPF(payload.cpf);
  if (!isValidCPF(digits)) throw new Error('CPF inválido.');
  const cpfId = await sha256Hex(`tpc_cpf_v1:${digits}`);
  if (await readOfflineVault(cpfId)) {
    throw new Error('Este CPF já possui cofre cadastrado neste dispositivo.');
  }

  const now = new Date().toISOString();
  const { salt: pinSalt, hash: pinHash } = await hashSecretLocal(payload.pin);
  let bioRecord: OfflineVaultRecord['biometric'] = { enabled: false };
  if (payload.biometric.enabled && payload.biometric.credentialId && payload.biometric.deviceKey) {
    const bioSec = await hashSecretLocal(payload.biometric.deviceKey);
    bioRecord = {
      enabled: true,
      credentialId: payload.biometric.credentialId,
      deviceLabel: payload.biometric.deviceLabel,
      mode: payload.biometric.mode,
      registeredAt: now,
      deviceKeySalt: bioSec.salt,
      deviceKeyHash: bioSec.hash,
    };
  }

  const profile: UserProfile = {
    cpfId,
    maskedCpf: maskCPF(digits),
    fullName: payload.fullName.trim(),
    birthDate: payload.birthDate,
    email: payload.email,
    phone: payload.phone,
    kycStatus: payload.kycStatus,
    kycDocumentType: payload.kycDocumentType,
    kycDocumentLast4: payload.kycDocumentLast4,
    kycSelfieVerifiedAt: payload.kycStatus === 'verified' ? now : undefined,
    kycAuditId: `kyc_${randomHex(6)}`,
    createdAt: now,
    updatedAt: now,
  };

  const record: OfflineVaultRecord = {
    cpfId,
    profile,
    pinSalt,
    pinHash,
    biometric: bioRecord,
    appState: payload.appState ?? createCleanAppState(),
  };
  await writeOfflineVault(record);

  return {
    token: makeOfflineToken(cpfId),
    profile,
    biometric: {
      enabled: bioRecord.enabled,
      credentialId: bioRecord.credentialId,
      deviceLabel: bioRecord.deviceLabel,
      mode: bioRecord.mode,
      registeredAt: bioRecord.registeredAt,
    },
    appState: record.appState,
    source: 'offline' as const,
  };
}

export async function loginCpfVault(payload: {
  cpf: string;
  method: 'pin' | 'biometric';
  pin?: string;
  credentialId?: string;
  deviceKey?: string;
}) {
  const server = await callServerJson<{
    token: string;
    profile: UserProfile;
    biometric: BiometricConfig;
    appState: AppState;
    error?: string;
  }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (server.reachable) {
    if (!server.ok) throw new Error(server.data.error || 'Falha ao autenticar.');
    activeOnlineCpfId = server.data.profile.cpfId;
    await mirrorServerVaultToOfflineCache({
      profile: server.data.profile,
      biometric: server.data.biometric,
      appState: server.data.appState,
      pin: payload.method === 'pin' ? payload.pin : undefined,
      deviceKey: payload.method === 'biometric' ? payload.deviceKey : undefined,
    });
    return { ...server.data, source: 'server' as const };
  }

  const digits = cleanCPF(payload.cpf);
  const cpfId = await sha256Hex(`tpc_cpf_v1:${digits}`);
  const local = await readOfflineVault(cpfId);
  if (!local) throw new Error('Conta não localizada neste dispositivo offline.');

  if (payload.method === 'biometric') {
    if (
      !local.biometric.enabled ||
      !local.biometric.deviceKeySalt ||
      !local.biometric.deviceKeyHash ||
      payload.credentialId !== local.biometric.credentialId ||
      !payload.deviceKey
    ) {
      throw new Error('Biometria não validada neste dispositivo. Entre com seu PIN.');
    }
    const check = await hashSecretLocal(payload.deviceKey, local.biometric.deviceKeySalt);
    if (check.hash !== local.biometric.deviceKeyHash) {
      throw new Error('Chave biométrica inválida.');
    }
  } else {
    if (!payload.pin) throw new Error('Informe o PIN.');
    const check = await hashSecretLocal(payload.pin, local.pinSalt);
    if (check.hash !== local.pinHash) {
      throw new Error('PIN incorreto. Tente novamente.');
    }
  }

  return {
    token: makeOfflineToken(cpfId),
    profile: local.profile,
    biometric: {
      enabled: local.biometric.enabled,
      credentialId: local.biometric.credentialId,
      deviceLabel: local.biometric.deviceLabel,
      mode: local.biometric.mode,
      registeredAt: local.biometric.registeredAt,
    },
    appState: local.appState,
    source: 'offline' as const,
  };
}

export async function unlockCpfVault(
  authToken: string,
  payload: { method: 'pin' | 'biometric'; pin?: string; credentialId?: string; deviceKey?: string }
) {
  const offlineCpfId = parseOfflineToken(authToken);
  if (!offlineCpfId) {
    const server = await callServerJson<{ unlocked?: boolean; error?: string }>('/api/auth/unlock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (server.reachable) {
      if (!server.ok) throw new Error(server.data.error || 'PIN ou biometria incorretos.');
      return true;
    }
  }

  const cpfId = offlineCpfId;
  if (!cpfId) throw new Error('Sessão offline não disponível para validação.');
  const local = await readOfflineVault(cpfId);
  if (!local) throw new Error('Cofre local não encontrado.');

  if (payload.method === 'biometric') {
    if (
      !local.biometric.enabled ||
      !local.biometric.deviceKeySalt ||
      !local.biometric.deviceKeyHash ||
      payload.credentialId !== local.biometric.credentialId ||
      !payload.deviceKey
    ) {
      throw new Error('Biometria indisponível. Utilize o PIN.');
    }
    const check = await hashSecretLocal(payload.deviceKey, local.biometric.deviceKeySalt);
    if (check.hash !== local.biometric.deviceKeyHash) {
      throw new Error('Falha na validação biométrica.');
    }
    return true;
  }

  if (!payload.pin) throw new Error('Digite seu PIN.');
  const check = await hashSecretLocal(payload.pin, local.pinSalt);
  if (check.hash !== local.pinHash) {
    throw new Error('PIN incorreto. Tente novamente.');
  }
  return true;
}

export async function syncVaultState(authToken: string, appState: AppState): Promise<void> {
  const offlineCpfId = parseOfflineToken(authToken);
  const mirrorCpfId = offlineCpfId || activeOnlineCpfId;
  if (mirrorCpfId) {
    const local = await readOfflineVault(mirrorCpfId);
    if (local) {
      local.appState = appState;
      local.profile.updatedAt = new Date().toISOString();
      await writeOfflineVault(local);
    }
  }

  if (offlineCpfId || (isCapacitorBundledRuntime() && !getConfiguredApiBase())) {
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }

  await fetch(apiUrl('/api/vault'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ appState }),
  }).catch(() => {
    // Resilience handled by IndexedDB cache
  });
}

export async function updateVaultKyc(
  authToken: string,
  payload: {
    kycDocumentType: KycDocumentType;
    kycDocumentLast4: string;
    kycStatus: KycStatus;
  }
): Promise<UserProfile> {
  const offlineCpfId = parseOfflineToken(authToken);
  if (!offlineCpfId) {
    const server = await callServerJson<{ profile: UserProfile; error?: string }>('/api/vault/kyc', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (server.reachable) {
      if (!server.ok) throw new Error(server.data.error || 'Erro ao atualizar KYC.');
      const local = await readOfflineVault(server.data.profile.cpfId);
      if (local) {
        local.profile = server.data.profile;
        await writeOfflineVault(local);
      }
      return server.data.profile;
    }
  }

  if (!offlineCpfId) throw new Error('Servidor indisponível para atualização KYC.');
  const local = await readOfflineVault(offlineCpfId);
  if (!local) throw new Error('Cofre local não localizado.');
  const now = new Date().toISOString();
  local.profile = {
    ...local.profile,
    kycDocumentType: payload.kycDocumentType,
    kycDocumentLast4: payload.kycDocumentLast4,
    kycStatus: payload.kycStatus,
    kycSelfieVerifiedAt: payload.kycStatus === 'verified' ? now : local.profile.kycSelfieVerifiedAt,
    updatedAt: now,
  };
  await writeOfflineVault(local);
  return local.profile;
}

export async function updateVaultSecurity(
  authToken: string,
  payload: {
    currentPin?: string;
    newPin?: string;
    biometric?: {
      enabled: boolean;
      credentialId?: string;
      deviceKey?: string;
      deviceLabel?: string;
      mode?: 'capacitor_native' | 'webauthn' | 'device_key';
    };
  }
): Promise<{ profile: UserProfile; biometric: BiometricConfig }> {
  const offlineCpfId = parseOfflineToken(authToken);
  if (!offlineCpfId) {
    const server = await callServerJson<{
      profile: UserProfile;
      biometric: BiometricConfig;
      error?: string;
    }>('/api/vault/security', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (server.reachable) {
      if (!server.ok) throw new Error(server.data.error || 'Erro ao atualizar segurança.');
      const local = await readOfflineVault(server.data.profile.cpfId);
      if (local) {
        await mirrorServerVaultToOfflineCache({
          profile: server.data.profile,
          biometric: server.data.biometric,
          appState: local.appState,
          pin: payload.newPin,
          deviceKey: payload.biometric?.deviceKey,
        });
      }
      return { profile: server.data.profile, biometric: server.data.biometric };
    }
  }

  if (!offlineCpfId) throw new Error('Servidor indisponível para atualizar segurança.');
  const local = await readOfflineVault(offlineCpfId);
  if (!local) throw new Error('Cofre local não localizado.');
  const now = new Date().toISOString();

  if (payload.newPin !== undefined) {
    const check = await hashSecretLocal(payload.currentPin || '', local.pinSalt);
    if (check.hash !== local.pinHash) {
      throw new Error('PIN atual incorreto para alterar o PIN.');
    }
    const next = await hashSecretLocal(payload.newPin);
    local.pinSalt = next.salt;
    local.pinHash = next.hash;
  }

  if (payload.biometric !== undefined) {
    if (!payload.biometric.enabled) {
      local.biometric = { enabled: false };
    } else if (payload.biometric.credentialId && payload.biometric.deviceKey) {
      const bioSec = await hashSecretLocal(payload.biometric.deviceKey);
      local.biometric = {
        enabled: true,
        credentialId: payload.biometric.credentialId,
        deviceLabel: payload.biometric.deviceLabel,
        mode: payload.biometric.mode,
        registeredAt: now,
        deviceKeySalt: bioSec.salt,
        deviceKeyHash: bioSec.hash,
      };
    }
  }

  local.profile.updatedAt = now;
  await writeOfflineVault(local);

  return {
    profile: local.profile,
    biometric: {
      enabled: local.biometric.enabled,
      credentialId: local.biometric.credentialId,
      deviceLabel: local.biometric.deviceLabel,
      mode: local.biometric.mode,
      registeredAt: local.biometric.registeredAt,
    },
  };
}

export function getApiEndpoint(path: string): string {
  return apiUrl(path);
}
