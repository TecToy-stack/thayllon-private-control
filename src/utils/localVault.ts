import { AppState } from '../types/finance';
import { cleanCPF, formatCPF, isValidCPF, maskCPF } from './cpf';

const DB_NAME = 'ThayllonPrivateVaultDB';
const DB_VERSION = 2;
const STORE_NAME = 'vaults';
const META_STORE_NAME = 'meta';
const CACHE_PREFIX = 'tpc_vault_cache_';

// Limite conservador para gravações únicas em localStorage (WebViews Android costumam limitar a ~5 MB no total)
const MAX_SINGLE_LS_ENTRY_BYTES = 2_400_000;
const APPROX_LS_QUOTA_BYTES = 4_800_000;
const MIN_IDB_FREE_MARGIN_BYTES = 256_000;
const IDB_TIMEOUT_MS = 3_000;

export interface SafeStorageWriteResult {
  ok: boolean;
  reason?: 'unavailable' | 'quota' | 'too_large' | 'error';
  evictedCount?: number;
  usedMemoryFallback?: boolean;
}

export interface StorageQuotaStatus {
  supported: boolean;
  usageBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  lowSpace: boolean;
  localStorageBytes: number;
  localStorageAvailable: boolean;
}

// Fallback em memória volátil para modo privado restrito ou dispositivos sem espaço em disco,
// garantindo que a sessão atual do usuário nunca trave por erros de Storage.
const volatileLsMemory = new Map<string, string>();
const volatileVaultMemory = new Map<string, AppState>();
const volatileMetaMemory = new Map<string, unknown>();

function getStorageHandle(): Storage | null {
  try {
    if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // SecurityError em modo privado restrito ou WebView bloqueada
  }
  return null;
}

function estimateUtf16Bytes(str: string): number {
  try {
    return str.length * 2;
  } catch {
    return 0;
  }
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.name === 'QuotaExceeded' ||
    e.code === 22 ||
    e.code === 1014 ||
    /quota|disk full|no space|storage full/i.test(e.message ?? '')
  );
}

export function safeLocalStorageKeys(): string[] {
  const keySet = new Set<string>();
  const storage = getStorageHandle();
  if (storage) {
    try {
      const len = storage.length;
      for (let i = 0; i < len; i++) {
        try {
          const k = storage.key(i);
          if (typeof k === 'string') keySet.add(k);
        } catch {
          // Ignore single index failure
        }
      }
    } catch {
      // Ignore storage enumeration failure
    }
  }
  for (const k of volatileLsMemory.keys()) {
    keySet.add(k);
  }
  return Array.from(keySet);
}

export function getLocalStorageUsageBytes(): number {
  const storage = getStorageHandle();
  if (!storage) return 0;
  let total = 0;
  try {
    const len = storage.length;
    for (let i = 0; i < len; i++) {
      try {
        const key = storage.key(i);
        if (typeof key !== 'string') continue;
        const val = storage.getItem(key) ?? '';
        total += estimateUtf16Bytes(key) + estimateUtf16Bytes(val);
      } catch {
        // Ignore individual entry read errors
      }
    }
  } catch {
    // Ignore storage iteration error
  }
  return total;
}

export function isLocalStorageAvailable(): boolean {
  const storage = getStorageHandle();
  if (!storage) return false;
  const probeKey = '__orbe_ls_probe__';
  try {
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

export async function checkStorageQuota(): Promise<StorageQuotaStatus> {
  const localStorageBytes = getLocalStorageUsageBytes();
  const localStorageAvailable = isLocalStorageAvailable();
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.estimate === 'function'
    ) {
      const estimate = await navigator.storage.estimate();
      const usageBytes = typeof estimate.usage === 'number' ? estimate.usage : 0;
      const quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : 0;
      const remainingBytes = quotaBytes > 0 ? Math.max(0, quotaBytes - usageBytes) : Number.MAX_SAFE_INTEGER;
      return {
        supported: true,
        usageBytes,
        quotaBytes,
        remainingBytes,
        lowSpace: quotaBytes > 0 && remainingBytes < MIN_IDB_FREE_MARGIN_BYTES,
        localStorageBytes,
        localStorageAvailable,
      };
    }
  } catch {
    // Ignore unsupported navigator.storage in restricted WebViews
  }
  return {
    supported: false,
    usageBytes: localStorageBytes,
    quotaBytes: APPROX_LS_QUOTA_BYTES,
    remainingBytes: Math.max(0, APPROX_LS_QUOTA_BYTES - localStorageBytes),
    lowSpace: false,
    localStorageBytes,
    localStorageAvailable,
  };
}

export function safeLocalStorageGet(key: string): string | null {
  try {
    const storage = getStorageHandle();
    if (storage) {
      try {
        const value = storage.getItem(key);
        if (value !== null) return value;
      } catch {
        // Fallback para memória volátil em modo privado/bloqueado
      }
    }
    return volatileLsMemory.has(key) ? volatileLsMemory.get(key) ?? null : null;
  } catch {
    return null;
  }
}

export function safeLocalStorageRemove(key: string): boolean {
  let removed = false;
  try {
    volatileLsMemory.delete(key);
    const storage = getStorageHandle();
    if (!storage) return true;
    storage.removeItem(key);
    removed = true;
  } catch {
    removed = false;
  }
  return removed;
}

/**
 * Libera espaço removendo apenas caches secundários redundantes (que já residem no IndexedDB),
 * preservando sempre chaves de identidade, CPF lembrado, rascunho cadastral e índice de usuários.
 */
function evictSecondaryCachesForQuota(excludeKey: string): number {
  const storage = getStorageHandle();
  if (!storage) return 0;
  let evicted = 0;

  const evictablePrefixes = [
    CACHE_PREFIX,
    'tpc_autobackup_v1_',
    'orbe_notified_alerts_v1',
  ];

  let keys: string[] = [];
  try {
    const len = storage.length;
    for (let i = 0; i < len; i++) {
      const k = storage.key(i);
      if (typeof k === 'string') keys.push(k);
    }
  } catch {
    keys = [];
  }

  for (const prefix of evictablePrefixes) {
    for (const key of keys) {
      if (key === excludeKey) continue;
      if (key === prefix || key.startsWith(prefix)) {
        try {
          storage.removeItem(key);
          evicted++;
        } catch {
          // Ignore single key error
        }
      }
    }
  }
  return evicted;
}

export function safeLocalStorageSet(
  key: string,
  value: string,
  options: { allowEvict?: boolean } = {}
): SafeStorageWriteResult {
  try {
    // Sempre atualiza fallback em memória para resiliência durante a sessão
    volatileLsMemory.set(key, value);
  } catch {
    // Ignore memory map errors
  }

  const storage = getStorageHandle();
  if (!storage) {
    return { ok: false, reason: 'unavailable', usedMemoryFallback: true };
  }

  const allowEvict = options.allowEvict !== false;
  const incomingBytes = estimateUtf16Bytes(key) + estimateUtf16Bytes(value);
  if (incomingBytes > MAX_SINGLE_LS_ENTRY_BYTES) {
    return { ok: false, reason: 'too_large', usedMemoryFallback: true };
  }

  // Verificação preventiva de cota aproximada antes de tentar gravar payloads grandes
  let evictedCount = 0;
  try {
    if (allowEvict && incomingBytes > 32_000) {
      const existingRaw = safeLocalStorageGet(key);
      const existingBytes = existingRaw
        ? estimateUtf16Bytes(key) + estimateUtf16Bytes(existingRaw)
        : 0;
      const projectedTotal = getLocalStorageUsageBytes() - existingBytes + incomingBytes;
      if (projectedTotal > APPROX_LS_QUOTA_BYTES) {
        evictedCount = evictSecondaryCachesForQuota(key);
      }
    }
  } catch {
    // Ignore pre-check failures and attempt write directly
  }

  try {
    storage.setItem(key, value);
    return { ok: true, evictedCount };
  } catch (err) {
    if (isQuotaError(err)) {
      if (allowEvict) {
        try {
          const freed = evictSecondaryCachesForQuota(key);
          evictedCount += freed;
          storage.setItem(key, value);
          return { ok: true, evictedCount };
        } catch {
          return { ok: false, reason: 'quota', evictedCount, usedMemoryFallback: true };
        }
      }
      return { ok: false, reason: 'quota', evictedCount, usedMemoryFallback: true };
    }
    return { ok: false, reason: 'error', evictedCount, usedMemoryFallback: true };
  }
}

function openVaultDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        try {
          clearTimeout(timer);
        } catch {
          // Ignore timer clear errors
        }
      }
      resolve(db);
    };

    const timer =
      typeof setTimeout !== 'undefined'
        ? setTimeout(() => finish(null), IDB_TIMEOUT_MS)
        : null;

    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
          if (!db.objectStoreNames.contains(META_STORE_NAME)) {
            db.createObjectStore(META_STORE_NAME);
          }
        } catch {
          // Ignore store creation race
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          db.onversionchange = () => {
            try {
              db.close();
            } catch {
              // Ignore close errors
            }
          };
        } catch {
          // Ignore handler assignment failure
        }
        finish(db);
      };
      req.onerror = () => finish(null);
      req.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

async function runIdbTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore, resolve: (val: T) => void) => void,
  fallbackValue: T
): Promise<T> {
  const db = await openVaultDB();
  if (!db) return fallbackValue;

  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (val: T) => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        try {
          clearTimeout(timer);
        } catch {
          // Ignore
        }
      }
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
      resolve(val);
    };

    const timer =
      typeof setTimeout !== 'undefined'
        ? setTimeout(() => finish(fallbackValue), IDB_TIMEOUT_MS)
        : null;

    try {
      const tx = db.transaction(storeName, mode);
      tx.onabort = () => finish(fallbackValue);
      tx.onerror = () => finish(fallbackValue);
      const store = tx.objectStore(storeName);
      executor(store, finish);
    } catch {
      finish(fallbackValue);
    }
  });
}

export async function saveLocalMetaRecord<T>(key: string, value: T): Promise<boolean> {
  try {
    volatileMetaMemory.set(key, value);
  } catch {
    // Ignore memory cache errors
  }

  try {
    const quota = await checkStorageQuota();
    if (quota.lowSpace) {
      evictSecondaryCachesForQuota(key);
    }
  } catch {
    // Continue gracefully
  }

  return runIdbTransaction<boolean>(
    META_STORE_NAME,
    'readwrite',
    (store, finish) => {
      try {
        const req = store.put(value, key);
        req.onsuccess = () => finish(true);
        req.onerror = () => finish(false);
      } catch {
        finish(false);
      }
    },
    false
  );
}

export async function loadLocalMetaRecord<T>(key: string): Promise<T | null> {
  const fromIdb = await runIdbTransaction<T | null>(
    META_STORE_NAME,
    'readonly',
    (store, finish) => {
      try {
        const req = store.get(key);
        req.onsuccess = () => finish((req.result as T) ?? null);
        req.onerror = () => finish(null);
      } catch {
        finish(null);
      }
    },
    null
  );

  if (fromIdb !== null) return fromIdb;
  try {
    return volatileMetaMemory.has(key) ? (volatileMetaMemory.get(key) as T) : null;
  } catch {
    return null;
  }
}

export async function deleteLocalMetaRecord(key: string): Promise<void> {
  try {
    volatileMetaMemory.delete(key);
  } catch {
    // Ignore
  }

  await runIdbTransaction<void>(
    META_STORE_NAME,
    'readwrite',
    (store, finish) => {
      try {
        const req = store.delete(key);
        req.onsuccess = () => finish(undefined);
        req.onerror = () => finish(undefined);
      } catch {
        finish(undefined);
      }
    },
    undefined
  );
}

export async function saveLocalVaultCache(cpfId: string, state: AppState): Promise<void> {
  try {
    volatileVaultMemory.set(cpfId, state);
  } catch {
    // Ignore memory cache errors
  }

  try {
    const serialized = JSON.stringify(state);
    safeLocalStorageSet(`${CACHE_PREFIX}${cpfId}`, serialized, { allowEvict: true });
  } catch {
    // Ignore serialization or quota failures cleanly
  }

  try {
    const quota = await checkStorageQuota();
    if (quota.lowSpace) {
      evictSecondaryCachesForQuota(`${CACHE_PREFIX}${cpfId}`);
    }
  } catch {
    // Ignore quota probe errors
  }

  await runIdbTransaction<boolean>(
    STORE_NAME,
    'readwrite',
    (store, finish) => {
      try {
        const req = store.put(state, cpfId);
        req.onsuccess = () => finish(true);
        req.onerror = () => finish(false);
      } catch {
        finish(false);
      }
    },
    false
  );
}

export async function loadLocalVaultCache(cpfId: string): Promise<AppState | null> {
  const idbData = await runIdbTransaction<AppState | null>(
    STORE_NAME,
    'readonly',
    (store, finish) => {
      try {
        const req = store.get(cpfId);
        req.onsuccess = () => finish((req.result as AppState) ?? null);
        req.onerror = () => finish(null);
      } catch {
        finish(null);
      }
    },
    null
  );
  if (idbData) return idbData;

  try {
    const raw = safeLocalStorageGet(`${CACHE_PREFIX}${cpfId}`);
    if (raw) {
      return JSON.parse(raw) as AppState;
    }
  } catch {
    // Fallback to volatile session memory
  }

  try {
    return volatileVaultMemory.get(cpfId) ?? null;
  } catch {
    return null;
  }
}

export async function clearLocalVaultCache(cpfId: string): Promise<void> {
  try {
    volatileVaultMemory.delete(cpfId);
  } catch {
    // Ignore
  }
  safeLocalStorageRemove(`${CACHE_PREFIX}${cpfId}`);

  await runIdbTransaction<void>(
    STORE_NAME,
    'readwrite',
    (store, finish) => {
      try {
        const req = store.delete(cpfId);
        req.onsuccess = () => finish(undefined);
        req.onerror = () => finish(undefined);
      } catch {
        finish(undefined);
      }
    },
    undefined
  );
}

const LAST_CPF_KEY = 'tpc_last_cpf_v1';
const LAST_CPF_HINT_KEY = 'tpc_last_cpf_hint';
const LAST_CPF_PRIVACY_KEY = 'tpc_last_cpf_privacy_mask';

export interface RememberedCpfRecord {
  cpfDigits: string;
  formattedCpf: string;
  maskedCpf: string;
  updatedAt: string;
}

export function saveLastCpfHint(maskedOrFormatted: string): void {
  try {
    safeLocalStorageSet(LAST_CPF_HINT_KEY, maskedOrFormatted, { allowEvict: true });
  } catch {
    // Ignore
  }
}

export function loadLastCpfHint(): string {
  try {
    return safeLocalStorageGet(LAST_CPF_HINT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveRememberedCpf(rawCpf: string): RememberedCpfRecord | null {
  try {
    const digits = cleanCPF(rawCpf);
    if (!isValidCPF(digits)) return null;
    const record: RememberedCpfRecord = {
      cpfDigits: digits,
      formattedCpf: formatCPF(digits),
      maskedCpf: maskCPF(digits),
      updatedAt: new Date().toISOString(),
    };
    safeLocalStorageSet(LAST_CPF_KEY, JSON.stringify(record), { allowEvict: true });
    safeLocalStorageSet(LAST_CPF_HINT_KEY, record.maskedCpf, { allowEvict: true });
    void saveLocalMetaRecord(LAST_CPF_KEY, record);
    return record;
  } catch {
    return null;
  }
}

export function loadRememberedCpf(): RememberedCpfRecord | null {
  try {
    const raw = safeLocalStorageGet(LAST_CPF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedCpfRecord>;
    const digits = cleanCPF(parsed.cpfDigits ?? '');
    if (!isValidCPF(digits)) return null;
    return {
      cpfDigits: digits,
      formattedCpf: formatCPF(digits),
      maskedCpf: maskCPF(digits),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

export function clearRememberedCpf(): void {
  try {
    safeLocalStorageRemove(LAST_CPF_KEY);
    safeLocalStorageRemove(LAST_CPF_HINT_KEY);
    void deleteLocalMetaRecord(LAST_CPF_KEY);
  } catch {
    // Ignore
  }
}

export function saveLastCpfPrivacyMask(masked: boolean): void {
  try {
    safeLocalStorageSet(LAST_CPF_PRIVACY_KEY, masked ? '1' : '0', { allowEvict: true });
    void saveLocalMetaRecord(LAST_CPF_PRIVACY_KEY, masked ? '1' : '0');
  } catch {
    // Ignore
  }
}

export function loadLastCpfPrivacyMask(): boolean {
  try {
    return safeLocalStorageGet(LAST_CPF_PRIVACY_KEY) === '1';
  } catch {
    return false;
  }
}

const CADASTRAL_DRAFT_KEY = 'tpc_cadastral_draft_v1';
const REMEMBERED_USERNAME_KEY = 'tpc_remembered_username_v1';

export interface SavedCadastralDraft {
  fullName: string;
  birthDate: string;
  email?: string;
  phone?: string;
  username?: string;
  kycDocumentType?: 'CNH' | 'RG' | 'CIN';
  kycDocumentLast4?: string;
  updatedAt: string;
}

export function saveCadastralDraft(draft: Partial<SavedCadastralDraft>): SavedCadastralDraft | null {
  try {
    const existing = loadCadastralDraft();
    const merged: SavedCadastralDraft = {
      fullName: (draft.fullName ?? existing?.fullName ?? '').trim(),
      birthDate: (draft.birthDate ?? existing?.birthDate ?? '').trim(),
      email: (draft.email ?? existing?.email ?? '').trim() || undefined,
      phone: (draft.phone ?? existing?.phone ?? '').trim() || undefined,
      username: (draft.username ?? existing?.username ?? '').trim().toLowerCase() || undefined,
      kycDocumentType: draft.kycDocumentType ?? existing?.kycDocumentType,
      kycDocumentLast4:
        (draft.kycDocumentLast4 ?? existing?.kycDocumentLast4 ?? '').replace(/\D/g, '').slice(-4) ||
        undefined,
      updatedAt: new Date().toISOString(),
    };
    if (
      !merged.fullName &&
      !merged.birthDate &&
      !merged.email &&
      !merged.phone &&
      !merged.username
    ) {
      return null;
    }
    safeLocalStorageSet(CADASTRAL_DRAFT_KEY, JSON.stringify(merged), { allowEvict: true });
    void saveLocalMetaRecord(CADASTRAL_DRAFT_KEY, merged);
    return merged;
  } catch {
    return null;
  }
}

export function loadCadastralDraft(): SavedCadastralDraft | null {
  try {
    const raw = safeLocalStorageGet(CADASTRAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedCadastralDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      fullName: typeof parsed.fullName === 'string' ? parsed.fullName : '',
      birthDate: typeof parsed.birthDate === 'string' ? parsed.birthDate : '',
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
      phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
      username: typeof parsed.username === 'string' ? parsed.username : undefined,
      kycDocumentType:
        parsed.kycDocumentType === 'CNH' ||
        parsed.kycDocumentType === 'RG' ||
        parsed.kycDocumentType === 'CIN'
          ? parsed.kycDocumentType
          : undefined,
      kycDocumentLast4:
        typeof parsed.kycDocumentLast4 === 'string' ? parsed.kycDocumentLast4 : undefined,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

export function clearCadastralDraft(): void {
  try {
    safeLocalStorageRemove(CADASTRAL_DRAFT_KEY);
    void deleteLocalMetaRecord(CADASTRAL_DRAFT_KEY);
  } catch {
    // Ignore
  }
}

export function saveRememberedUsername(username: string): void {
  try {
    const clean = username.trim().toLowerCase();
    if (!clean) {
      safeLocalStorageRemove(REMEMBERED_USERNAME_KEY);
      void deleteLocalMetaRecord(REMEMBERED_USERNAME_KEY);
      return;
    }
    safeLocalStorageSet(REMEMBERED_USERNAME_KEY, clean, { allowEvict: true });
    void saveLocalMetaRecord(REMEMBERED_USERNAME_KEY, clean);
  } catch {
    // Ignore
  }
}

export function loadRememberedUsername(): string {
  try {
    return safeLocalStorageGet(REMEMBERED_USERNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearRememberedUsername(): void {
  try {
    safeLocalStorageRemove(REMEMBERED_USERNAME_KEY);
    void deleteLocalMetaRecord(REMEMBERED_USERNAME_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Restaura CPF lembrado, rascunho cadastral, usuário e máscara de privacidade do IndexedDB
 * caso o localStorage tenha sido limpo por atualização de WebView/PWA.
 */
export async function rehydrateIdentityFromIdb(): Promise<boolean> {
  let healed = false;
  try {
    if (!loadRememberedCpf()) {
      const idbCpf = await loadLocalMetaRecord<RememberedCpfRecord>(LAST_CPF_KEY);
      if (idbCpf?.cpfDigits && isValidCPF(idbCpf.cpfDigits)) {
        saveRememberedCpf(idbCpf.cpfDigits);
        healed = true;
      }
    }
    if (!loadRememberedUsername()) {
      const idbUser = await loadLocalMetaRecord<string>(REMEMBERED_USERNAME_KEY);
      if (typeof idbUser === 'string' && idbUser.trim()) {
        saveRememberedUsername(idbUser);
        healed = true;
      }
    }
    if (!loadCadastralDraft()) {
      const idbDraft = await loadLocalMetaRecord<SavedCadastralDraft>(CADASTRAL_DRAFT_KEY);
      if (idbDraft && (idbDraft.fullName || idbDraft.username)) {
        saveCadastralDraft(idbDraft);
        healed = true;
      }
    }
    if (safeLocalStorageGet(LAST_CPF_PRIVACY_KEY) === null) {
      const idbMask = await loadLocalMetaRecord<string>(LAST_CPF_PRIVACY_KEY);
      if (idbMask === '1' || idbMask === '0') {
        safeLocalStorageSet(LAST_CPF_PRIVACY_KEY, idbMask, { allowEvict: true });
      }
    }
  } catch {
    // Never crash startup recovery on storage errors
  }
  return healed;
}
