import {
  AppState,
  BiometricConfig,
  KycDocumentType,
  KycStatus,
  UserProfile,
} from '../types/finance';
import { cleanCPF, isValidCPF, maskCPF } from './cpf';
import { createCleanAppState } from '../data/initialData';
import {
  loadRememberedCpf,
  rehydrateIdentityFromIdb,
  saveCadastralDraft,
  saveRememberedCpf,
  saveRememberedUsername,
  safeLocalStorageGet,
  safeLocalStorageKeys,
  safeLocalStorageSet,
} from './localVault';
import {
  getLocalBiometricHandle,
  rehydrateLocalBiometricHandleFromIdb,
  saveLocalBiometricHandle,
} from './biometrics';
import {
  findLatestLocalBackupAcrossDevice,
  parseBackupSnapshotState,
  RecoverableDeviceBackupInfo,
} from './backup';
import { loadNativeVaultMirror, saveNativeVaultMirror } from './permissions';

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

export function isRemoteSyncConfigured(): boolean {
  try {
    const optIn = (import.meta.env?.VITE_ENABLE_REMOTE_SYNC ?? '').trim().toLowerCase() === 'true';
    if (!optIn) return false;
  } catch {
    return false;
  }
  return Boolean(getConfiguredApiBase());
}

export function getApiBaseUrl(): string {
  return getConfiguredApiBase();
}

function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

// ==================== 100% LOCAL-FIRST & RESILIENT VAULT ENGINE ====================
// Armazena o cofre financeiro no dispositivo (IndexedDB + localStorage + espelho nativo Android)
// com hash SHA-256 com salt por credencial (PIN, senha e chave biométrica).
// Modo 100% local como padrão: não depende de servidor remoto e nunca bloqueia acesso offline.

const OFFLINE_DB_NAME = 'ThayllonPrivateOfflineAuthDB';
const OFFLINE_STORE = 'offline_vaults';
const OFFLINE_USERNAME_INDEX_KEY = 'tpc_offline_usernames_v1';
const OFFLINE_VAULT_LS_PREFIX = 'tpc_offline_vault_';
const NATIVE_MIRROR_VAULT_KEY = 'orbe_vault_mirror_v1';
const NATIVE_MIRROR_VAULT_PREFIX = 'orbe_vault_mirror_';
const NATIVE_MIRROR_ACCOUNT_KEY = 'orbe_remembered_account_v1';
const NATIVE_MIRROR_BIO_PREFIX = 'orbe_bio_mirror_';

interface OfflineVaultRecord {
  cpfId: string;
  profile: UserProfile;
  pinSalt: string;
  pinHash: string;
  passwordSalt?: string;
  passwordHash?: string;
  biometric: BiometricConfig & { deviceKeySalt?: string; deviceKeyHash?: string };
  appState: AppState;
  rememberedCpfDigits?: string;
  biometricHandle?: { credentialId: string; deviceKey: string };
}

interface NativeAccountMirrorPayload {
  cpfDigits?: string;
  cpfId: string;
  fullName: string;
  birthDate: string;
  email?: string;
  phone?: string;
  username?: string;
  maskedCpf: string;
  kycDocumentType?: KycDocumentType;
  kycDocumentLast4?: string;
  updatedAt: string;
}

function normalizeOfflineUsername(raw?: string): string | null {
  if (!raw) return null;
  const clean = raw.trim().toLowerCase();
  return /^[a-z0-9._-]{3,32}$/.test(clean) ? clean : null;
}

function readOfflineUsernameIndex(): Record<string, string> {
  try {
    const raw = safeLocalStorageGet(OFFLINE_USERNAME_INDEX_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function setOfflineUsernameMapping(
  username: string | undefined,
  cpfId: string,
  prevUsername?: string
): void {
  try {
    const idx = readOfflineUsernameIndex();
    if (prevUsername && idx[prevUsername.toLowerCase()] === cpfId) {
      delete idx[prevUsername.toLowerCase()];
    }
    if (username) {
      idx[username.toLowerCase()] = cpfId;
    }
    safeLocalStorageSet(OFFLINE_USERNAME_INDEX_KEY, JSON.stringify(idx), { allowEvict: true });
  } catch {
    // Ignore storage quota issues
  }
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

async function readAllIdbVaults(): Promise<OfflineVaultRecord[]> {
  const db = await openOfflineDB();
  if (!db) return [];
  try {
    return await new Promise<OfflineVaultRecord[]>((resolve) => {
      const tx = db.transaction(OFFLINE_STORE, 'readonly');
      const req = tx.objectStore(OFFLINE_STORE).getAll();
      req.onsuccess = () =>
        resolve(Array.isArray(req.result) ? (req.result as OfflineVaultRecord[]) : []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function putIdbVault(record: OfflineVaultRecord): Promise<void> {
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

async function readNativeVaultRecord(cpfIdHint?: string): Promise<OfflineVaultRecord | null> {
  const keysToTry = cpfIdHint
    ? [`${NATIVE_MIRROR_VAULT_PREFIX}${cpfIdHint}`, NATIVE_MIRROR_VAULT_KEY]
    : [NATIVE_MIRROR_VAULT_KEY];

  for (const key of keysToTry) {
    try {
      const raw = await loadNativeVaultMirror(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as OfflineVaultRecord;
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.cpfId &&
        parsed.profile &&
        parsed.pinHash &&
        (!cpfIdHint || parsed.cpfId === cpfIdHint)
      ) {
        return parsed;
      }
    } catch {
      // Ignore malformed native mirror
    }
  }
  return null;
}

async function restoreBiometricHandleAcrossLayers(
  cpfId: string,
  embeddedHandle?: { credentialId: string; deviceKey: string }
): Promise<{ credentialId: string; deviceKey: string } | null> {
  const fromIdbOrLs = await rehydrateLocalBiometricHandleFromIdb(cpfId);
  if (fromIdbOrLs) return fromIdbOrLs;

  if (embeddedHandle?.credentialId && embeddedHandle?.deviceKey) {
    saveLocalBiometricHandle(cpfId, embeddedHandle.credentialId, embeddedHandle.deviceKey);
    return embeddedHandle;
  }

  try {
    const rawNativeBio = await loadNativeVaultMirror(`${NATIVE_MIRROR_BIO_PREFIX}${cpfId}`);
    if (rawNativeBio) {
      const parsed = JSON.parse(rawNativeBio) as { credentialId?: string; deviceKey?: string };
      if (parsed?.credentialId && parsed?.deviceKey) {
        saveLocalBiometricHandle(cpfId, parsed.credentialId, parsed.deviceKey);
        return { credentialId: parsed.credentialId, deviceKey: parsed.deviceKey };
      }
    }
  } catch {
    // Ignore native biometric read failure
  }
  return null;
}

async function readOfflineVault(cpfId: string): Promise<OfflineVaultRecord | null> {
  // 1. Camada primária: IndexedDB
  const db = await openOfflineDB();
  if (db) {
    try {
      const rec = await new Promise<OfflineVaultRecord | null>((resolve) => {
        const tx = db.transaction(OFFLINE_STORE, 'readonly');
        const req = tx.objectStore(OFFLINE_STORE).get(cpfId);
        req.onsuccess = () => resolve((req.result as OfflineVaultRecord) ?? null);
        req.onerror = () => resolve(null);
      });
      if (rec) {
        if (rec.rememberedCpfDigits && isValidCPF(rec.rememberedCpfDigits) && !loadRememberedCpf()) {
          saveRememberedCpf(rec.rememberedCpfDigits);
        }
        if (rec.biometric.enabled) {
          void restoreBiometricHandleAcrossLayers(rec.cpfId, rec.biometricHandle);
        }
        return rec;
      }
    } catch {
      // Fallback below
    }
  }

  // 2. Camada secundária: localStorage (auto-cicatriza IndexedDB se encontrado)
  try {
    const raw = safeLocalStorageGet(`${OFFLINE_VAULT_LS_PREFIX}${cpfId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as OfflineVaultRecord;
      if (parsed && parsed.cpfId === cpfId) {
        void putIdbVault(parsed);
        if (parsed.biometric.enabled) {
          void restoreBiometricHandleAcrossLayers(parsed.cpfId, parsed.biometricHandle);
        }
        return parsed;
      }
    }
  } catch {
    // Fallback below
  }

  // 3. Camada nativa Android: SharedPreferences + FilesDir (sobrevive limpezas de WebView)
  const nativeRec = await readNativeVaultRecord(cpfId);
  if (nativeRec && nativeRec.cpfId === cpfId) {
    await writeOfflineVault(nativeRec, { skipNativeMirror: true });
    if (nativeRec.biometric.enabled) {
      await restoreBiometricHandleAcrossLayers(nativeRec.cpfId, nativeRec.biometricHandle);
    }
    return nativeRec;
  }

  return null;
}

async function writeOfflineVault(
  record: OfflineVaultRecord,
  options: { skipNativeMirror?: boolean; cpfDigitsHint?: string } = {}
): Promise<void> {
  const remembered = loadRememberedCpf();
  let resolvedCpfDigits =
    (options.cpfDigitsHint && isValidCPF(options.cpfDigitsHint) ? options.cpfDigitsHint : undefined) ||
    (record.rememberedCpfDigits && isValidCPF(record.rememberedCpfDigits)
      ? record.rememberedCpfDigits
      : undefined);

  if (!resolvedCpfDigits && remembered) {
    try {
      const rememberedId = await sha256Hex(`tpc_cpf_v1:${remembered.cpfDigits}`);
      if (rememberedId === record.cpfId) {
        resolvedCpfDigits = remembered.cpfDigits;
      }
    } catch {
      // Ignore hash error
    }
  }

  let resolvedBioHandle = record.biometricHandle;
  if (record.biometric.enabled) {
    const localBio = getLocalBiometricHandle(record.cpfId);
    if (localBio) {
      resolvedBioHandle = localBio;
    }
  } else {
    resolvedBioHandle = undefined;
  }

  const enrichedRecord: OfflineVaultRecord = {
    ...record,
    rememberedCpfDigits: resolvedCpfDigits ?? record.rememberedCpfDigits,
    biometricHandle: resolvedBioHandle,
  };

  const serialized = JSON.stringify(enrichedRecord);
  safeLocalStorageSet(`${OFFLINE_VAULT_LS_PREFIX}${enrichedRecord.cpfId}`, serialized, {
    allowEvict: true,
  });
  await putIdbVault(enrichedRecord);

  if (enrichedRecord.profile.username) {
    setOfflineUsernameMapping(enrichedRecord.profile.username, enrichedRecord.cpfId);
  }

  if (!options.skipNativeMirror) {
    let existingNativeCpfDigits: string | undefined;
    if (!enrichedRecord.rememberedCpfDigits) {
      try {
        const rawPrevAcc = await loadNativeVaultMirror(NATIVE_MIRROR_ACCOUNT_KEY);
        if (rawPrevAcc) {
          const parsedPrev = JSON.parse(rawPrevAcc) as NativeAccountMirrorPayload;
          if (parsedPrev?.cpfId === enrichedRecord.cpfId && parsedPrev?.cpfDigits && isValidCPF(parsedPrev.cpfDigits)) {
            existingNativeCpfDigits = parsedPrev.cpfDigits;
          }
        }
      } catch {
        // Ignore parse error
      }
    }

    const finalCpfDigits = enrichedRecord.rememberedCpfDigits || existingNativeCpfDigits;
    const accountMirror: NativeAccountMirrorPayload = {
      cpfDigits: finalCpfDigits,
      cpfId: enrichedRecord.cpfId,
      fullName: enrichedRecord.profile.fullName,
      birthDate: enrichedRecord.profile.birthDate,
      email: enrichedRecord.profile.email,
      phone: enrichedRecord.profile.phone,
      username: enrichedRecord.profile.username,
      maskedCpf: enrichedRecord.profile.maskedCpf,
      kycDocumentType: enrichedRecord.profile.kycDocumentType,
      kycDocumentLast4: enrichedRecord.profile.kycDocumentLast4,
      updatedAt: enrichedRecord.profile.updatedAt,
    };

    const nativeOps: Array<Promise<boolean>> = [
      saveNativeVaultMirror(NATIVE_MIRROR_VAULT_KEY, serialized),
      saveNativeVaultMirror(`${NATIVE_MIRROR_VAULT_PREFIX}${enrichedRecord.cpfId}`, serialized),
      saveNativeVaultMirror(NATIVE_MIRROR_ACCOUNT_KEY, JSON.stringify(accountMirror)),
    ];
    if (resolvedBioHandle) {
      nativeOps.push(
        saveNativeVaultMirror(
          `${NATIVE_MIRROR_BIO_PREFIX}${enrichedRecord.cpfId}`,
          JSON.stringify(resolvedBioHandle)
        )
      );
    }
    await Promise.all(nativeOps);
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

async function hashSecretLocal(
  secret: string,
  existingSalt?: string
): Promise<{ salt: string; hash: string }> {
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
  if (!isRemoteSyncConfigured()) {
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

// ==================== RESILIENT ACCOUNT DISCOVERY & RECOVERY ====================

export interface ResilientAccountSummary {
  cpfId: string;
  fullName: string;
  maskedCpf: string;
  username?: string;
  cpfDigits?: string;
  hasPasswordLogin?: boolean;
  biometricEnabled?: boolean;
}

export interface ResilientRecoveryScanResult {
  recoveredFromMirror: boolean;
  existingAccount: ResilientAccountSummary | null;
  allAccounts: ResilientAccountSummary[];
  recoverableBackup: RecoverableDeviceBackupInfo | null;
}

/**
 * Executa verificação silenciosa em todas as camadas locais (IndexedDB, localStorage e armazenamento nativo Android).
 * Se a chave primária de login/identificação estiver vazia após uma atualização ou limpeza de cache WebView,
 * restaura automaticamente o cofre, CPF lembrado, usuário e credencial biométrica sem exigir recriação da conta.
 */
export async function rehydrateResilientLocalAccount(): Promise<ResilientRecoveryScanResult> {
  let recoveredFromMirror = false;
  let existingAccount: ResilientAccountSummary | null = null;

  // 0. Auto-cicatriza identidade (CPF/usuário/rascunho) do IndexedDB caso localStorage tenha sido limpo
  if (await rehydrateIdentityFromIdb()) {
    recoveredFromMirror = true;
  }

  // 1. Verifica todas as contas em IndexedDB e localStorage
  const allVaults: OfflineVaultRecord[] = [...(await readAllIdbVaults())];
  for (const key of safeLocalStorageKeys()) {
    if (!key.startsWith(OFFLINE_VAULT_LS_PREFIX)) continue;
    try {
      const raw = safeLocalStorageGet(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as OfflineVaultRecord;
      if (parsed?.cpfId && !allVaults.some((v) => v.cpfId === parsed.cpfId)) {
        allVaults.push(parsed);
      }
    } catch {
      // Ignore malformed cache item
    }
  }

  let nativeAccount: NativeAccountMirrorPayload | null = null;
  try {
    const rawAcc = await loadNativeVaultMirror(NATIVE_MIRROR_ACCOUNT_KEY);
    if (rawAcc) {
      nativeAccount = JSON.parse(rawAcc) as NativeAccountMirrorPayload;
    }
  } catch {
    nativeAccount = null;
  }

  // 2. Verifica espelho nativo Android caso WebView tenha sido reinicializada
  const nativeVault = await readNativeVaultRecord(nativeAccount?.cpfId);
  if (nativeVault && !allVaults.some((v) => v.cpfId === nativeVault.cpfId)) {
    allVaults.push(nativeVault);
    await writeOfflineVault(nativeVault, { skipNativeMirror: true });
    recoveredFromMirror = true;
  }

  if (allVaults.length > 0) {
    allVaults.sort(
      (a, b) =>
        new Date(b.profile.updatedAt || b.profile.createdAt).getTime() -
        new Date(a.profile.updatedAt || a.profile.createdAt).getTime()
    );
    const primary = allVaults[0];
    const resolvedPrimaryCpf =
      (primary.rememberedCpfDigits && isValidCPF(primary.rememberedCpfDigits)
        ? primary.rememberedCpfDigits
        : undefined) ||
      (nativeAccount?.cpfId === primary.cpfId && nativeAccount?.cpfDigits && isValidCPF(nativeAccount.cpfDigits)
        ? nativeAccount.cpfDigits
        : undefined);

    // Re-garante consistência entre IndexedDB, localStorage e índice de username
    await writeOfflineVault(primary, {
      skipNativeMirror: true,
      cpfDigitsHint: resolvedPrimaryCpf,
    });

    const currentRemembered = loadRememberedCpf();
    if (!currentRemembered && resolvedPrimaryCpf) {
      saveRememberedCpf(resolvedPrimaryCpf);
      recoveredFromMirror = true;
    }

    if (primary.profile.username) {
      saveRememberedUsername(primary.profile.username);
    }
    saveCadastralDraft({
      fullName: primary.profile.fullName,
      birthDate: primary.profile.birthDate,
      email: primary.profile.email,
      phone: primary.profile.phone,
      username: primary.profile.username,
      kycDocumentType: primary.profile.kycDocumentType,
      kycDocumentLast4: primary.profile.kycDocumentLast4,
    });

    if (primary.biometric.enabled) {
      await restoreBiometricHandleAcrossLayers(primary.cpfId, primary.biometricHandle);
    }

    existingAccount = {
      cpfId: primary.cpfId,
      fullName: primary.profile.fullName,
      maskedCpf: primary.profile.maskedCpf,
      username: primary.profile.username,
      cpfDigits: currentRemembered?.cpfDigits || resolvedPrimaryCpf,
      hasPasswordLogin: Boolean(primary.passwordHash || primary.profile.hasPasswordLogin),
      biometricEnabled: Boolean(primary.biometric.enabled),
    };
  } else if (nativeAccount?.cpfDigits && isValidCPF(nativeAccount.cpfDigits)) {
    saveRememberedCpf(nativeAccount.cpfDigits);
    if (nativeAccount.username) saveRememberedUsername(nativeAccount.username);
    saveCadastralDraft({
      fullName: nativeAccount.fullName,
      birthDate: nativeAccount.birthDate,
      email: nativeAccount.email,
      phone: nativeAccount.phone,
      username: nativeAccount.username,
      kycDocumentType: nativeAccount.kycDocumentType,
      kycDocumentLast4: nativeAccount.kycDocumentLast4,
    });
    recoveredFromMirror = true;
  }

  const allAccounts: ResilientAccountSummary[] = allVaults.map((v) => ({
    cpfId: v.cpfId,
    fullName: v.profile.fullName,
    maskedCpf: v.profile.maskedCpf,
    username: v.profile.username,
    cpfDigits:
      v.rememberedCpfDigits && isValidCPF(v.rememberedCpfDigits)
        ? v.rememberedCpfDigits
        : nativeAccount?.cpfId === v.cpfId && nativeAccount?.cpfDigits
        ? nativeAccount.cpfDigits
        : undefined,
    hasPasswordLogin: Boolean(v.passwordHash || v.profile.hasPasswordLogin),
    biometricEnabled: Boolean(v.biometric.enabled),
  }));

  // 3. Procura backups automáticos locais no dispositivo para sugestão em 1 clique caso necessário
  const recoverableBackup = await findLatestLocalBackupAcrossDevice();

  return {
    recoveredFromMirror,
    existingAccount,
    allAccounts,
    recoverableBackup,
  };
}

function mergeParsedBackupWithCleanState(parsed: Partial<AppState>): AppState {
  const base = createCleanAppState();
  return {
    rows: Array.isArray(parsed.rows) && parsed.rows.length > 0 ? parsed.rows : base.rows,
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    creditCards: Array.isArray(parsed.creditCards) ? parsed.creditCards : [],
    cardPurchases: Array.isArray(parsed.cardPurchases) ? parsed.cardPurchases : [],
    paidCardInvoices:
      parsed.paidCardInvoices && typeof parsed.paidCardInvoices === 'object'
        ? parsed.paidCardInvoices
        : {},
    rules: Array.isArray(parsed.rules) ? parsed.rules : base.rules,
    goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    recurringBills: Array.isArray(parsed.recurringBills) ? parsed.recurringBills : [],
    auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
    settings: parsed.settings ? { ...base.settings, ...parsed.settings } : base.settings,
    chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : [],
  };
}

export async function restoreVaultFromBackupOnLogin(params: {
  jsonText: string;
  cpf: string;
  pin: string;
  fullName?: string;
  birthDate?: string;
}) {
  const digits = cleanCPF(params.cpf);
  if (!isValidCPF(digits)) {
    throw new Error('CPF inválido. Informe os 11 dígitos do titular do backup.');
  }
  if (!/^\d{4,6}$/.test(params.pin.trim())) {
    throw new Error('Informe um PIN numérico de 4 a 6 dígitos para proteger o cofre restaurado.');
  }

  const parsedState = parseBackupSnapshotState(params.jsonText);
  if (!parsedState) {
    throw new Error('Arquivo de backup JSON inválido ou sem dados financeiros válidos.');
  }

  let ownerNameHint = params.fullName?.trim() || '';
  try {
    const rawObj = JSON.parse(params.jsonText) as {
      owner?: { fullName?: string };
    };
    if (!ownerNameHint && rawObj?.owner?.fullName) {
      ownerNameHint = rawObj.owner.fullName.trim();
    }
  } catch {
    // Ignore optional owner metadata
  }

  const cpfId = await sha256Hex(`tpc_cpf_v1:${digits}`);
  const restoredState = mergeParsedBackupWithCleanState(parsedState);
  const existing = await readOfflineVault(cpfId);

  if (existing) {
    // Cofre já existe para este CPF: valida o PIN existente antes de atualizar os dados
    const check = await hashSecretLocal(params.pin.trim(), existing.pinSalt);
    if (check.hash !== existing.pinHash) {
      throw new Error(
        'Este CPF já possui cofre salvo neste aparelho. Digite o PIN atual da conta para restaurar o backup.'
      );
    }
    existing.appState = restoredState;
    existing.profile.updatedAt = new Date().toISOString();
    await writeOfflineVault(existing, { cpfDigitsHint: digits });
    saveRememberedCpf(digits);
    activeLocalCpfId = cpfId;
    return {
      token: makeOfflineToken(cpfId),
      profile: existing.profile,
      biometric: {
        enabled: existing.biometric.enabled,
        credentialId: existing.biometric.credentialId,
        deviceLabel: existing.biometric.deviceLabel,
        mode: existing.biometric.mode,
        registeredAt: existing.biometric.registeredAt,
      },
      appState: existing.appState,
      source: 'local' as const,
    };
  }

  const now = new Date().toISOString();
  const { salt: pinSalt, hash: pinHash } = await hashSecretLocal(params.pin.trim());
  const profile: UserProfile = {
    cpfId,
    maskedCpf: maskCPF(digits),
    fullName: ownerNameHint || 'Titular ORBE',
    birthDate: params.birthDate || '1990-01-01',
    hasPasswordLogin: false,
    kycStatus: 'pending',
    kycAuditId: `kyc_${randomHex(6)}`,
    createdAt: now,
    updatedAt: now,
  };

  const record: OfflineVaultRecord = {
    cpfId,
    profile,
    pinSalt,
    pinHash,
    biometric: { enabled: false },
    appState: restoredState,
  };
  await writeOfflineVault(record, { cpfDigitsHint: digits });
  saveRememberedCpf(digits);
  saveCadastralDraft({
    fullName: profile.fullName,
    birthDate: profile.birthDate,
  });
  activeLocalCpfId = cpfId;

  return {
    token: makeOfflineToken(cpfId),
    profile,
    biometric: { enabled: false },
    appState: restoredState,
    source: 'local' as const,
  };
}

// ==================== UNIFIED LOCAL-FIRST VAULT CLIENT API ====================

let activeOnlineCpfId: string | null = null;
let activeLocalCpfId: string | null = null;

function resolveLocalCpfId(authToken: string): string | null {
  return parseOfflineToken(authToken) || activeOnlineCpfId || activeLocalCpfId;
}

async function mirrorServerVaultToOfflineCache(params: {
  profile: UserProfile;
  biometric: BiometricConfig;
  appState: AppState;
  pin?: string;
  password?: string;
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

    let passwordSalt = existing?.passwordSalt;
    let passwordHash = existing?.passwordHash;
    if (params.password) {
      const hashedPass = await hashSecretLocal(params.password);
      passwordSalt = hashedPass.salt;
      passwordHash = hashedPass.hash;
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
      passwordSalt,
      passwordHash,
      biometric: bioRecord,
      appState: params.appState,
    });
    if (params.profile.username) {
      setOfflineUsernameMapping(params.profile.username, params.profile.cpfId, existing?.profile.username);
    }
  } catch {
    // Contingência silenciosa: não interrompe fluxo autenticado principal
  }
}

export async function lookupVaultByCpfId(cpfId: string) {
  const local = await readOfflineVault(cpfId);
  if (!local) {
    return {
      exists: false,
      cpfId,
      maskedCpf: '***.***.***-**',
      source: 'local' as const,
    };
  }
  if (local.biometric.enabled) {
    await restoreBiometricHandleAcrossLayers(local.cpfId, local.biometricHandle);
  }
  return {
    exists: true,
    cpfId: local.cpfId,
    maskedCpf: local.profile.maskedCpf,
    fullNameHint: local.profile.fullName,
    usernameHint: local.profile.username,
    hasPasswordLogin: Boolean(local.passwordHash || local.profile.hasPasswordLogin),
    kycStatus: local.profile.kycStatus,
    biometric: {
      enabled: local.biometric.enabled,
      credentialId: local.biometric.credentialId,
      deviceLabel: local.biometric.deviceLabel,
      mode: local.biometric.mode,
      registeredAt: local.biometric.registeredAt,
    },
    source: 'local' as const,
  };
}

export async function lookupCpfVault(cpfRaw: string) {
  const digits = cleanCPF(cpfRaw);
  if (!isValidCPF(digits)) {
    throw new Error('CPF inválido. Verifique os 11 dígitos informados.');
  }
  const cpfId = await sha256Hex(`tpc_cpf_v1:${digits}`);
  const local = await readOfflineVault(cpfId);
  if (local) {
    if (local.biometric.enabled) {
      await restoreBiometricHandleAcrossLayers(local.cpfId, local.biometricHandle);
    }
    if (!local.rememberedCpfDigits) {
      await writeOfflineVault(local, { cpfDigitsHint: digits });
    }
    return {
      exists: true,
      cpfId,
      maskedCpf: local.profile.maskedCpf,
      fullNameHint: local.profile.fullName,
      usernameHint: local.profile.username,
      hasPasswordLogin: Boolean(local.passwordHash || local.profile.hasPasswordLogin),
      kycStatus: local.profile.kycStatus,
      biometric: {
        enabled: local.biometric.enabled,
        credentialId: local.biometric.credentialId,
        deviceLabel: local.biometric.deviceLabel,
        mode: local.biometric.mode,
        registeredAt: local.biometric.registeredAt,
      },
      source: 'local' as const,
    };
  }

  if (isRemoteSyncConfigured()) {
    const server = await callServerJson<{
      exists: boolean;
      cpfId: string;
      maskedCpf: string;
      fullNameHint?: string;
      usernameHint?: string;
      hasPasswordLogin?: boolean;
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
  }

  return {
    exists: false,
    cpfId,
    maskedCpf: maskCPF(digits),
    source: 'local' as const,
  };
}

export async function lookupUsernameVault(usernameRaw: string) {
  const normalized = normalizeOfflineUsername(usernameRaw);
  if (!normalized) {
    throw new Error('Usuário inválido. Use de 3 a 32 caracteres (letras, números, ., _ ou -).');
  }

  const idx = readOfflineUsernameIndex();
  let cpfId: string | undefined = idx[normalized];
  let local = cpfId ? await readOfflineVault(cpfId) : null;

  if (!local) {
    const idbMatches = (await readAllIdbVaults()).find(
      (v) => v.profile.username?.toLowerCase() === normalized
    );
    if (idbMatches) {
      local = idbMatches;
      cpfId = idbMatches.cpfId;
      setOfflineUsernameMapping(normalized, idbMatches.cpfId);
    }
  }

  if (local) {
    return {
      exists: true,
      cpfId: local.cpfId,
      maskedCpf: local.profile.maskedCpf,
      fullNameHint: local.profile.fullName,
      usernameHint: local.profile.username,
      hasPasswordLogin: Boolean(local.passwordHash || local.profile.hasPasswordLogin),
      kycStatus: local.profile.kycStatus,
      biometric: {
        enabled: local.biometric.enabled,
        credentialId: local.biometric.credentialId,
        deviceLabel: local.biometric.deviceLabel,
        mode: local.biometric.mode,
        registeredAt: local.biometric.registeredAt,
      },
      source: 'local' as const,
    };
  }

  if (isRemoteSyncConfigured()) {
    const server = await callServerJson<{
      exists: boolean;
      cpfId?: string;
      maskedCpf?: string;
      fullNameHint?: string;
      usernameHint?: string;
      hasPasswordLogin?: boolean;
      kycStatus?: KycStatus;
      biometric?: BiometricConfig;
      error?: string;
    }>('/api/auth/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: normalized }),
    });

    if (server.reachable) {
      if (!server.ok) throw new Error(server.data.error || 'Falha ao consultar usuário.');
      return { ...server.data, source: 'server' as const };
    }
  }

  return { exists: false, usernameHint: normalized, source: 'local' as const };
}

export async function registerCpfVault(payload: {
  cpf: string;
  fullName: string;
  birthDate: string;
  email?: string;
  phone?: string;
  username?: string;
  password?: string;
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
  const digits = cleanCPF(payload.cpf);
  if (!isValidCPF(digits)) throw new Error('CPF inválido.');
  const cpfId = await sha256Hex(`tpc_cpf_v1:${digits}`);
  if (await readOfflineVault(cpfId)) {
    throw new Error('Este CPF já possui cofre cadastrado neste dispositivo.');
  }

  let cleanUsername: string | undefined;
  if (payload.username?.trim()) {
    const normalized = normalizeOfflineUsername(payload.username);
    if (!normalized) {
      throw new Error('Usuário deve ter de 3 a 32 caracteres (letras, números, ., _ ou -).');
    }
    const idx = readOfflineUsernameIndex();
    if (idx[normalized] && idx[normalized] !== cpfId) {
      throw new Error('Este nome de usuário já está em uso.');
    }
    cleanUsername = normalized;
  }

  let passwordSalt: string | undefined;
  let passwordHash: string | undefined;
  if (payload.password) {
    if (payload.password.length < 6) {
      throw new Error('A senha deve conter no mínimo 6 caracteres.');
    }
    const hashed = await hashSecretLocal(payload.password);
    passwordSalt = hashed.salt;
    passwordHash = hashed.hash;
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
    username: cleanUsername,
    hasPasswordLogin: Boolean(passwordHash),
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
    passwordSalt,
    passwordHash,
    biometric: bioRecord,
    appState: payload.appState ?? createCleanAppState(),
  };
  await writeOfflineVault(record, { cpfDigitsHint: digits });
  activeLocalCpfId = cpfId;

  if (isRemoteSyncConfigured()) {
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

    if (server.reachable && server.ok) {
      activeOnlineCpfId = server.data.profile.cpfId;
      await mirrorServerVaultToOfflineCache({
        profile: server.data.profile,
        biometric: server.data.biometric,
        appState: server.data.appState,
        pin: payload.pin,
        password: payload.password,
        deviceKey: payload.biometric.deviceKey,
      });
      return { ...server.data, source: 'server' as const };
    }
  }

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
    source: 'local' as const,
  };
}

export async function loginCpfVault(payload: {
  cpf?: string;
  cpfId?: string;
  username?: string;
  method: 'pin' | 'biometric' | 'password';
  pin?: string;
  password?: string;
  credentialId?: string;
  deviceKey?: string;
}) {
  let cpfId: string | null = payload.cpfId?.trim() || null;
  const digits = payload.cpf ? cleanCPF(payload.cpf) : '';
  if (!cpfId && digits.length === 11) {
    cpfId = await sha256Hex(`tpc_cpf_v1:${digits}`);
  } else if (!cpfId && payload.username) {
    const normalized = normalizeOfflineUsername(payload.username);
    if (normalized) {
      cpfId = readOfflineUsernameIndex()[normalized] ?? null;
      if (!cpfId) {
        const idbMatch = (await readAllIdbVaults()).find(
          (v) => v.profile.username?.toLowerCase() === normalized
        );
        if (idbMatch) {
          cpfId = idbMatch.cpfId;
          setOfflineUsernameMapping(normalized, idbMatch.cpfId);
        }
      }
    }
  }

  const local = cpfId ? await readOfflineVault(cpfId) : null;
  if (local && cpfId) {
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
    } else if (payload.method === 'password') {
      if (!payload.password || !local.passwordSalt || !local.passwordHash) {
        throw new Error('Senha não configurada ou inválida neste dispositivo.');
      }
      const check = await hashSecretLocal(payload.password, local.passwordSalt);
      if (check.hash !== local.passwordHash) {
        throw new Error('Usuário ou senha incorretos. Tente novamente.');
      }
    } else {
      if (!payload.pin) throw new Error('Informe o PIN.');
      const check = await hashSecretLocal(payload.pin, local.pinSalt);
      if (check.hash !== local.pinHash) {
        throw new Error('PIN incorreto. Tente novamente.');
      }
    }

    activeLocalCpfId = cpfId;
    const cpfHintToSave =
      digits.length === 11
        ? digits
        : local.rememberedCpfDigits && isValidCPF(local.rememberedCpfDigits)
        ? local.rememberedCpfDigits
        : undefined;
    if (cpfHintToSave) {
      saveRememberedCpf(cpfHintToSave);
    }

    // Atualiza espelho nativo e camadas locais após login bem-sucedido
    await writeOfflineVault(local, {
      cpfDigitsHint: cpfHintToSave,
    });

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
      appState: local.appState ?? createCleanAppState(),
      source: 'local' as const,
    };
  }

  if (isRemoteSyncConfigured()) {
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
      activeLocalCpfId = server.data.profile.cpfId;
      await mirrorServerVaultToOfflineCache({
        profile: server.data.profile,
        biometric: server.data.biometric,
        appState: server.data.appState,
        pin: payload.method === 'pin' ? payload.pin : undefined,
        password: payload.method === 'password' ? payload.password : undefined,
        deviceKey: payload.method === 'biometric' ? payload.deviceKey : undefined,
      });
      return { ...server.data, source: 'server' as const };
    }
  }

  throw new Error(
    'Conta não localizada para este CPF ou usuário neste dispositivo. Confira os dados informados ou crie seu cofre local.'
  );
}

export async function unlockCpfVault(
  authToken: string,
  payload: {
    method: 'pin' | 'biometric' | 'password';
    pin?: string;
    password?: string;
    credentialId?: string;
    deviceKey?: string;
  }
) {
  const cpfId = resolveLocalCpfId(authToken);
  const local = cpfId ? await readOfflineVault(cpfId) : null;

  if (local) {
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

    if (payload.method === 'password') {
      if (!payload.password || !local.passwordSalt || !local.passwordHash) {
        throw new Error('Senha não configurada neste dispositivo.');
      }
      const check = await hashSecretLocal(payload.password, local.passwordSalt);
      if (check.hash !== local.passwordHash) {
        throw new Error('Senha incorreta. Tente novamente.');
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

  if (!parseOfflineToken(authToken) && isRemoteSyncConfigured()) {
    const server = await callServerJson<{ unlocked?: boolean; error?: string }>('/api/auth/unlock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (server.reachable) {
      if (!server.ok) throw new Error(server.data.error || 'Credencial incorreta.');
      return true;
    }
  }

  throw new Error('Cofre local não encontrado neste dispositivo. Entre novamente com seu CPF.');
}

export async function syncVaultState(authToken: string, appState: AppState): Promise<void> {
  const cpfId = resolveLocalCpfId(authToken);
  if (cpfId) {
    const local = await readOfflineVault(cpfId);
    if (local) {
      local.appState = appState;
      local.profile.updatedAt = new Date().toISOString();
      await writeOfflineVault(local);
    }
  }

  if (!isRemoteSyncConfigured() || parseOfflineToken(authToken)) {
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
    // Persistência local já concluída acima
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
  const cpfId = resolveLocalCpfId(authToken);
  if (!cpfId) throw new Error('Cofre local não localizado.');
  const local = await readOfflineVault(cpfId);
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

  if (!parseOfflineToken(authToken) && isRemoteSyncConfigured()) {
    void callServerJson<{ profile: UserProfile }>('/api/vault/kyc', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  return local.profile;
}

export async function updateVaultProfile(
  authToken: string,
  payload: {
    fullName?: string;
    birthDate?: string;
    email?: string;
    phone?: string;
    username?: string;
  }
): Promise<UserProfile> {
  const cpfId = resolveLocalCpfId(authToken);
  if (!cpfId) throw new Error('Cofre local não localizado.');
  const local = await readOfflineVault(cpfId);
  if (!local) throw new Error('Cofre local não localizado.');

  const now = new Date().toISOString();
  const prevUsername = local.profile.username;

  if (payload.fullName !== undefined) {
    const trimmed = payload.fullName.trim();
    if (trimmed.length < 3) throw new Error('Nome completo deve ter ao menos 3 caracteres.');
    local.profile.fullName = trimmed;
  }
  if (payload.birthDate !== undefined) {
    local.profile.birthDate = payload.birthDate;
  }
  if (payload.email !== undefined) {
    local.profile.email = payload.email.trim() || undefined;
  }
  if (payload.phone !== undefined) {
    local.profile.phone = payload.phone.trim() || undefined;
  }
  if (payload.username !== undefined) {
    const rawUser = payload.username.trim();
    if (!rawUser) {
      local.profile.username = undefined;
      setOfflineUsernameMapping(undefined, local.cpfId, prevUsername);
    } else {
      const normalized = normalizeOfflineUsername(rawUser);
      if (!normalized) throw new Error('Usuário deve ter de 3 a 32 caracteres (a-z, 0-9, ., _ ou -).');
      const idx = readOfflineUsernameIndex();
      if (idx[normalized] && idx[normalized] !== local.cpfId) {
        throw new Error('Este nome de usuário já está em uso.');
      }
      local.profile.username = normalized;
      setOfflineUsernameMapping(normalized, local.cpfId, prevUsername);
    }
  }

  local.profile.updatedAt = now;
  await writeOfflineVault(local);

  if (!parseOfflineToken(authToken) && isRemoteSyncConfigured()) {
    void callServerJson<{ profile: UserProfile }>('/api/vault/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  return local.profile;
}

export async function updateVaultSecurity(
  authToken: string,
  payload: {
    currentPin?: string;
    currentPassword?: string;
    newPin?: string;
    username?: string;
    newPassword?: string;
    biometric?: {
      enabled: boolean;
      credentialId?: string;
      deviceKey?: string;
      deviceLabel?: string;
      mode?: 'capacitor_native' | 'webauthn' | 'device_key';
    };
  }
): Promise<{ profile: UserProfile; biometric: BiometricConfig }> {
  const cpfId = resolveLocalCpfId(authToken);
  if (!cpfId) throw new Error('Cofre local não localizado.');
  const local = await readOfflineVault(cpfId);
  if (!local) throw new Error('Cofre local não localizado.');

  const now = new Date().toISOString();

  const verifyOfflineChallenge = async () => {
    if (payload.currentPin) {
      const checkPin = await hashSecretLocal(payload.currentPin, local.pinSalt);
      if (checkPin.hash === local.pinHash) return true;
    }
    if (payload.currentPassword && local.passwordSalt && local.passwordHash) {
      const checkPass = await hashSecretLocal(payload.currentPassword, local.passwordSalt);
      if (checkPass.hash === local.passwordHash) return true;
    }
    return false;
  };

  if (payload.newPin !== undefined) {
    if (!(await verifyOfflineChallenge())) {
      throw new Error('PIN ou senha atual incorreto para alterar o PIN.');
    }
    const next = await hashSecretLocal(payload.newPin);
    local.pinSalt = next.salt;
    local.pinHash = next.hash;
  }

  if (payload.username !== undefined && payload.username.trim()) {
    const normalized = normalizeOfflineUsername(payload.username);
    if (!normalized) throw new Error('Usuário inválido. Use de 3 a 32 caracteres.');
    const idx = readOfflineUsernameIndex();
    if (idx[normalized] && idx[normalized] !== local.cpfId) {
      throw new Error('Este nome de usuário já está em uso.');
    }
    const prevUsername = local.profile.username;
    local.profile.username = normalized;
    setOfflineUsernameMapping(normalized, local.cpfId, prevUsername);
  }

  if (payload.newPassword !== undefined) {
    if (!(await verifyOfflineChallenge())) {
      throw new Error('Informe seu PIN ou senha atual para definir a senha.');
    }
    if (payload.newPassword.length < 6) {
      throw new Error('A senha deve conter no mínimo 6 caracteres.');
    }
    const nextPass = await hashSecretLocal(payload.newPassword);
    local.passwordSalt = nextPass.salt;
    local.passwordHash = nextPass.hash;
    local.profile.hasPasswordLogin = true;
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

  if (!parseOfflineToken(authToken) && isRemoteSyncConfigured()) {
    void callServerJson<{ profile: UserProfile; biometric: BiometricConfig }>('/api/vault/security', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

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

export async function uploadServerBackupSnapshot(
  authToken: string,
  appState: Record<string, unknown>,
  source: 'auto_24h' | 'manual' = 'auto_24h'
): Promise<boolean> {
  if (!isRemoteSyncConfigured() || !authToken || parseOfflineToken(authToken)) return false;
  try {
    const server = await callServerJson<{ savedAt?: string }>('/api/vault/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ appState, source }),
    });
    return Boolean(server.reachable && server.ok);
  } catch {
    return false;
  }
}

export async function fetchLatestServerBackup(authToken: string): Promise<{
  available: boolean;
  lastAutoBackupAt?: string;
  nextAutoBackupAt?: string;
  snapshotCount?: number;
  snapshots?: Array<{
    id: string;
    savedAt: string;
    source: 'auto_24h' | 'manual';
    sizeBytes: number;
    state: AppState;
  }>;
  lastBackup?: {
    id: string;
    savedAt: string;
    state: AppState;
  } | null;
}> {
  if (!isRemoteSyncConfigured() || !authToken || parseOfflineToken(authToken)) {
    return { available: false, snapshots: [], lastBackup: null };
  }
  const server = await callServerJson<{
    available: boolean;
    lastAutoBackupAt?: string;
    nextAutoBackupAt?: string;
    snapshotCount?: number;
    snapshots?: Array<{
      id: string;
      savedAt: string;
      source: 'auto_24h' | 'manual';
      sizeBytes: number;
      state: AppState;
    }>;
    lastBackup?: { id: string; savedAt: string; state: AppState } | null;
  }>('/api/vault/backup/latest', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  if (!server.reachable || !server.ok) {
    return { available: false, snapshots: [], lastBackup: null };
  }
  return server.data;
}

export async function refreshVaultFromServer(authToken: string): Promise<AppState | null> {
  if (!isRemoteSyncConfigured() || !authToken || parseOfflineToken(authToken)) return null;
  const server = await callServerJson<{
    profile: UserProfile;
    appState: AppState;
  }>('/api/vault', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  if (!server.reachable || !server.ok || !server.data.appState) return null;
  const local = await readOfflineVault(server.data.profile.cpfId);
  if (local) {
    local.appState = server.data.appState;
    await writeOfflineVault(local);
  }
  return server.data.appState;
}
