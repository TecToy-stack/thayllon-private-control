import { AppState } from '../types/finance';
import { cleanCPF, formatCPF, isValidCPF, maskCPF } from './cpf';

const DB_NAME = 'ThayllonPrivateVaultDB';
const DB_VERSION = 1;
const STORE_NAME = 'vaults';
const CACHE_PREFIX = 'tpc_vault_cache_';

function openVaultDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
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

export async function saveLocalVaultCache(cpfId: string, state: AppState): Promise<void> {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${cpfId}`, JSON.stringify(state));
  } catch {
    // Ignore quota errors
  }

  const db = await openVaultDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(state, cpfId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IndexedDB errors
  }
}

export async function loadLocalVaultCache(cpfId: string): Promise<AppState | null> {
  const db = await openVaultDB();
  if (db) {
    try {
      const idbData = await new Promise<AppState | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(cpfId);
        req.onsuccess = () => resolve((req.result as AppState) ?? null);
        req.onerror = () => resolve(null);
      });
      if (idbData) return idbData;
    } catch {
      // Fallback to localStorage
    }
  }

  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${cpfId}`);
    if (!raw) return null;
    return JSON.parse(raw) as AppState;
  } catch {
    return null;
  }
}

export async function clearLocalVaultCache(cpfId: string): Promise<void> {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${cpfId}`);
  } catch {
    // Ignore
  }
  const db = await openVaultDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(cpfId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
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
    localStorage.setItem(LAST_CPF_HINT_KEY, maskedOrFormatted);
  } catch {
    // Ignore
  }
}

export function loadLastCpfHint(): string {
  try {
    return localStorage.getItem(LAST_CPF_HINT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveRememberedCpf(rawCpf: string): RememberedCpfRecord | null {
  const digits = cleanCPF(rawCpf);
  if (!isValidCPF(digits)) return null;
  const record: RememberedCpfRecord = {
    cpfDigits: digits,
    formattedCpf: formatCPF(digits),
    maskedCpf: maskCPF(digits),
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(LAST_CPF_KEY, JSON.stringify(record));
    localStorage.setItem(LAST_CPF_HINT_KEY, record.maskedCpf);
  } catch {
    // Ignore storage quota errors
  }
  return record;
}

export function loadRememberedCpf(): RememberedCpfRecord | null {
  try {
    const raw = localStorage.getItem(LAST_CPF_KEY);
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
    localStorage.removeItem(LAST_CPF_KEY);
    localStorage.removeItem(LAST_CPF_HINT_KEY);
  } catch {
    // Ignore
  }
}

export function saveLastCpfPrivacyMask(masked: boolean): void {
  try {
    localStorage.setItem(LAST_CPF_PRIVACY_KEY, masked ? '1' : '0');
  } catch {
    // Ignore
  }
}

export function loadLastCpfPrivacyMask(): boolean {
  try {
    return localStorage.getItem(LAST_CPF_PRIVACY_KEY) === '1';
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
    localStorage.setItem(CADASTRAL_DRAFT_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return null;
  }
}

export function loadCadastralDraft(): SavedCadastralDraft | null {
  try {
    const raw = localStorage.getItem(CADASTRAL_DRAFT_KEY);
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
    localStorage.removeItem(CADASTRAL_DRAFT_KEY);
  } catch {
    // Ignore
  }
}

export function saveRememberedUsername(username: string): void {
  try {
    const clean = username.trim().toLowerCase();
    if (!clean) {
      localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      return;
    }
    localStorage.setItem(REMEMBERED_USERNAME_KEY, clean);
  } catch {
    // Ignore
  }
}

export function loadRememberedUsername(): string {
  try {
    return localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearRememberedUsername(): void {
  try {
    localStorage.removeItem(REMEMBERED_USERNAME_KEY);
  } catch {
    // Ignore
  }
}

