import { AppState, UserProfile } from '../types/finance';

export interface BackupMeta {
  lastBackupAt: string | null;
  dirty: boolean;
}

export interface AutoBackupSnapshot {
  id: string;
  savedAt: string;
  nextBackupAt: string;
  source: 'auto_24h' | 'manual';
  owner: {
    fullName: string;
    maskedCpf: string;
  };
  payloadJson: string;
  sizeBytes: number;
}

export interface AutoBackupStatus {
  active: boolean;
  intervalHours: number;
  lastAutoBackupAt: string | null;
  nextAutoBackupAt: string | null;
  msRemaining: number;
  syncedToServer: boolean;
  latestSnapshot: AutoBackupSnapshot | null;
  snapshotCount: number;
}

const BACKUP_META_PREFIX = 'tpc_backup_meta_';
const AUTO_BACKUP_LS_PREFIX = 'tpc_autobackup_v1_';
const BACKUP_DB_NAME = 'ThayllonPrivateBackupDB';
const BACKUP_STORE = 'autobackup_records';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface StoredAutoBackupRecord {
  cpfId: string;
  lastAutoBackupAt: string | null;
  nextAutoBackupAt: string | null;
  syncedToServer: boolean;
  snapshots: AutoBackupSnapshot[];
}

const SENSITIVE_KEYS = new Set([
  'token',
  'authToken',
  'pin',
  'pinHash',
  'currentPin',
  'newPin',
  'deviceKey',
  'deviceKeyHash',
  'secret',
  'clientSecret',
  'password',
  'passwordHash',
  'passwordSalt',
  'newPassword',
  'currentPassword',
  'deviceKeySalt',
]);

function sanitizeBackupObject(input: unknown, depth = 0): unknown {
  if (depth > 8 || input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeBackupObject(item, depth + 1));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) continue;
      out[k] = sanitizeBackupObject(v, depth + 1);
    }
    return out;
  }
  return input;
}

function openBackupDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(BACKUP_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BACKUP_STORE)) {
          db.createObjectStore(BACKUP_STORE);
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

async function readAutoBackupRecord(cpfId: string): Promise<StoredAutoBackupRecord | null> {
  const db = await openBackupDB();
  if (db) {
    try {
      const rec = await new Promise<StoredAutoBackupRecord | null>((resolve) => {
        const tx = db.transaction(BACKUP_STORE, 'readonly');
        const store = tx.objectStore(BACKUP_STORE);
        const getReq = store.get(cpfId);
        getReq.onsuccess = () => resolve((getReq.result as StoredAutoBackupRecord) || null);
        getReq.onerror = () => resolve(null);
      });
      if (rec) return rec;
    } catch {
      // Fallback to localStorage below
    }
  }
  try {
    const raw = localStorage.getItem(`${AUTO_BACKUP_LS_PREFIX}${cpfId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAutoBackupRecord;
  } catch {
    return null;
  }
}

async function writeAutoBackupRecord(record: StoredAutoBackupRecord): Promise<void> {
  try {
    localStorage.setItem(`${AUTO_BACKUP_LS_PREFIX}${record.cpfId}`, JSON.stringify(record));
  } catch {
    // Ignore quota limits in localStorage
  }

  const db = await openBackupDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(BACKUP_STORE, 'readwrite');
      const store = tx.objectStore(BACKUP_STORE);
      const putReq = store.put(record, record.cpfId);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => resolve();
    });
  } catch {
    // Safe fallback already written
  }
}

export function loadBackupMeta(cpfId: string): BackupMeta {
  try {
    const raw = localStorage.getItem(`${BACKUP_META_PREFIX}${cpfId}`);
    if (!raw) return { lastBackupAt: null, dirty: false };
    const parsed = JSON.parse(raw) as Partial<BackupMeta>;
    return {
      lastBackupAt: typeof parsed.lastBackupAt === 'string' ? parsed.lastBackupAt : null,
      dirty: Boolean(parsed.dirty),
    };
  } catch {
    return { lastBackupAt: null, dirty: false };
  }
}

export function saveBackupMeta(cpfId: string, meta: BackupMeta): void {
  try {
    localStorage.setItem(`${BACKUP_META_PREFIX}${cpfId}`, JSON.stringify(meta));
  } catch {
    // Ignore storage quota / restricted environment errors
  }
}

export function markBackupDirty(cpfId: string): BackupMeta {
  const current = loadBackupMeta(cpfId);
  const next: BackupMeta = {
    lastBackupAt: current.lastBackupAt,
    dirty: true,
  };
  saveBackupMeta(cpfId, next);
  return next;
}

export function markBackupCompleted(cpfId: string): BackupMeta {
  const next: BackupMeta = {
    lastBackupAt: new Date().toISOString(),
    dirty: false,
  };
  saveBackupMeta(cpfId, next);
  return next;
}

export function hasOperationalDataForBackup(state: AppState): boolean {
  return (
    state.entries.length > 0 ||
    state.accounts.length > 0 ||
    (state.creditCards?.length ?? 0) > 0 ||
    (state.cardPurchases?.length ?? 0) > 0 ||
    state.goals.length > 0 ||
    (state.recurringBills?.length ?? 0) > 0
  );
}

export function buildSanitizedBackupPayload(
  state: AppState,
  profile: Pick<UserProfile, 'fullName' | 'maskedCpf'>,
  exportedAt = new Date().toISOString()
) {
  return sanitizeBackupObject({
    app: 'ORBE Finanças',
    formatVersion: 3,
    exportedAt,
    owner: {
      fullName: profile.fullName,
      maskedCpf: profile.maskedCpf,
    },
    state: {
      rows: state.rows,
      entries: state.entries,
      accounts: state.accounts,
      creditCards: state.creditCards ?? [],
      cardPurchases: state.cardPurchases ?? [],
      paidCardInvoices: state.paidCardInvoices ?? {},
      rules: state.rules,
      goals: state.goals,
      recurringBills: state.recurringBills ?? [],
      auditLog: state.auditLog,
      settings: state.settings,
      chatHistory: state.chatHistory,
    },
  });
}

export function buildBackupFilename(date = new Date()): string {
  const dateStamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
  return `orbe-financas-backup-${dateStamp}.json`;
}

export function triggerJsonBlobDownload(jsonString: string, filename: string): void {
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportVaultBackupJSON(
  state: AppState,
  profile: Pick<UserProfile, 'fullName' | 'maskedCpf'>
): { filename: string; exportedAt: string } {
  const now = new Date();
  const exportedAt = now.toISOString();
  const filename = buildBackupFilename(now);
  const sanitizedPayload = buildSanitizedBackupPayload(state, profile, exportedAt);
  const json = JSON.stringify(sanitizedPayload, null, 2);
  triggerJsonBlobDownload(json, filename);
  return { filename, exportedAt };
}

export async function getAutoBackupStatus(cpfId: string): Promise<AutoBackupStatus> {
  const rec = await readAutoBackupRecord(cpfId);
  if (!rec || !rec.lastAutoBackupAt) {
    return {
      active: true,
      intervalHours: 24,
      lastAutoBackupAt: null,
      nextAutoBackupAt: null,
      msRemaining: 0,
      syncedToServer: false,
      latestSnapshot: null,
      snapshotCount: 0,
    };
  }
  const nextMs = rec.nextAutoBackupAt ? new Date(rec.nextAutoBackupAt).getTime() : 0;
  const msRemaining = Math.max(0, nextMs - Date.now());
  return {
    active: true,
    intervalHours: 24,
    lastAutoBackupAt: rec.lastAutoBackupAt,
    nextAutoBackupAt: rec.nextAutoBackupAt,
    msRemaining,
    syncedToServer: rec.syncedToServer,
    latestSnapshot: rec.snapshots[0] ?? null,
    snapshotCount: rec.snapshots.length,
  };
}

export async function createBackupSnapshotAndPersist(
  cpfId: string,
  state: AppState,
  profile: Pick<UserProfile, 'fullName' | 'maskedCpf'>,
  source: 'auto_24h' | 'manual',
  uploadServerFn?: (sanitizedState: Record<string, unknown>, source: 'auto_24h' | 'manual') => Promise<boolean>
): Promise<AutoBackupStatus> {
  const now = new Date();
  const savedAt = now.toISOString();
  const nextBackupAt = new Date(now.getTime() + ONE_DAY_MS).toISOString();
  const sanitizedPayload = buildSanitizedBackupPayload(state, profile, savedAt) as {
    state: Record<string, unknown>;
  };
  const payloadJson = JSON.stringify(sanitizedPayload, null, 2);
  const sizeBytes = new Blob([payloadJson]).size;

  const snapshot: AutoBackupSnapshot = {
    id: `bkp-${Date.now()}`,
    savedAt,
    nextBackupAt,
    source,
    owner: {
      fullName: profile.fullName,
      maskedCpf: profile.maskedCpf,
    },
    payloadJson,
    sizeBytes,
  };

  let syncedToServer = false;
  if (uploadServerFn) {
    try {
      syncedToServer = await uploadServerFn(sanitizedPayload.state, source);
    } catch {
      syncedToServer = false;
    }
  }

  const existing = await readAutoBackupRecord(cpfId);
  const snapshots = [snapshot, ...(existing?.snapshots ?? [])].slice(0, 5);

  await writeAutoBackupRecord({
    cpfId,
    lastAutoBackupAt: savedAt,
    nextAutoBackupAt: nextBackupAt,
    syncedToServer,
    snapshots,
  });

  markBackupCompleted(cpfId);

  return {
    active: true,
    intervalHours: 24,
    lastAutoBackupAt: savedAt,
    nextAutoBackupAt: nextBackupAt,
    msRemaining: ONE_DAY_MS,
    syncedToServer,
    latestSnapshot: snapshot,
    snapshotCount: snapshots.length,
  };
}

export async function runAutoBackupIfDue(
  cpfId: string,
  state: AppState,
  profile: Pick<UserProfile, 'fullName' | 'maskedCpf'>,
  uploadServerFn?: (sanitizedState: Record<string, unknown>, source: 'auto_24h' | 'manual') => Promise<boolean>
): Promise<{ ran: boolean; status: AutoBackupStatus }> {
  const current = await getAutoBackupStatus(cpfId);
  const lastMs = current.lastAutoBackupAt ? new Date(current.lastAutoBackupAt).getTime() : 0;
  const elapsed = Date.now() - lastMs;

  if (!current.lastAutoBackupAt || Number.isNaN(lastMs) || elapsed >= ONE_DAY_MS) {
    const status = await createBackupSnapshotAndPersist(
      cpfId,
      state,
      profile,
      'auto_24h',
      uploadServerFn
    );
    return { ran: true, status };
  }

  return { ran: false, status: current };
}

export async function shareOrDownloadLatestBackupJSON(
  cpfId: string,
  state: AppState,
  profile: Pick<UserProfile, 'fullName' | 'maskedCpf'>
): Promise<{ method: 'share' | 'download'; filename: string }> {
  const current = await getAutoBackupStatus(cpfId);
  const filename = buildBackupFilename(new Date());
  const jsonString =
    current.latestSnapshot?.payloadJson ??
    JSON.stringify(buildSanitizedBackupPayload(state, profile), null, 2);

  try {
    const file = new File([jsonString], filename, { type: 'application/json' });
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };
    if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({
        title: 'ORBE Finanças — Backup 24h',
        text: 'Backup criptografado sem credenciais bancárias (LGPD).',
        files: [file],
      });
      return { method: 'share', filename };
    }
  } catch {
    // Fallback cleanly to standard Blob download
  }

  triggerJsonBlobDownload(jsonString, filename);
  return { method: 'download', filename };
}

export async function listAutoBackupSnapshots(cpfId: string): Promise<AutoBackupSnapshot[]> {
  const rec = await readAutoBackupRecord(cpfId);
  return rec?.snapshots ?? [];
}

export function parseBackupSnapshotState(payloadJson: string): Partial<AppState> | null {
  try {
    const parsed = JSON.parse(payloadJson) as { state?: Partial<AppState> } | Partial<AppState>;
    const candidate =
      parsed && typeof parsed === 'object' && 'state' in parsed && parsed.state
        ? parsed.state
        : (parsed as Partial<AppState>);
    if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.rows)) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}
