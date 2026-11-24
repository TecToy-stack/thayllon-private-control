import { AppState, UserProfile } from '../types/finance';

export interface BackupMeta {
  lastBackupAt: string | null;
  dirty: boolean;
}

const BACKUP_META_PREFIX = 'tpc_backup_meta_';

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
    state.goals.length > 0 ||
    (state.recurringBills?.length ?? 0) > 0
  );
}

export function exportVaultBackupJSON(
  state: AppState,
  profile: Pick<UserProfile, 'fullName' | 'maskedCpf'>
): { filename: string; exportedAt: string } {
  const now = new Date();
  const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const filename = `thayllon-private-control-backup-${dateStamp}.json`;

  const sanitizedPayload = {
    app: 'Thayllon Private Control (CF 2026+)',
    formatVersion: 2,
    exportedAt: now.toISOString(),
    owner: {
      fullName: profile.fullName,
      maskedCpf: profile.maskedCpf,
    },
    state: {
      rows: state.rows,
      entries: state.entries,
      accounts: state.accounts,
      revokedConsents: state.revokedConsents ?? [],
      rules: state.rules,
      goals: state.goals,
      recurringBills: state.recurringBills ?? [],
      auditLog: state.auditLog,
      settings: state.settings,
      chatHistory: state.chatHistory,
    },
  };

  const json = JSON.stringify(sanitizedPayload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);

  return { filename, exportedAt: now.toISOString() };
}
