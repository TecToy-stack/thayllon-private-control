import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AccountStatus,
  AppSettings,
  AppState,
  AutoRule,
  BankAccount,
  BiometricConfig,
  CategoryRow,
  ChatMessage,
  EntryNature,
  NavTab,
  PaymentMethod,
  RecurringBill,
  SavingsGoal,
  TransactionEntry,
  UserProfile,
} from './types/finance';
import {
  createCleanAppState,
  createDemo2026AppState,
  MAX_BANK_ACCOUNTS,
  MONTH_NAMES_SHORT,
} from './data/initialData';
import { computeAlerts, computeMatrixTotals } from './utils/financeEngine';
import { buildConsentExpirationDate, evaluateAccountHealth } from './utils/openFinance';
import { generatePrivateBankingAnnualPDF } from './utils/pdfReport';
import {
  AutoBackupStatus,
  BackupMeta,
  createBackupSnapshotAndPersist,
  exportVaultBackupJSON,
  getAutoBackupStatus,
  hasOperationalDataForBackup,
  loadBackupMeta,
  markBackupCompleted,
  markBackupDirty,
  runAutoBackupIfDue,
  shareOrDownloadLatestBackupJSON,
} from './utils/backup';
import { clearLocalVaultCache, saveLocalVaultCache } from './utils/localVault';
import {
  refreshVaultFromServer,
  syncVaultState,
  uploadServerBackupSnapshot,
} from './utils/vaultApi';
import {
  loadStoredLanguage,
  normalizeLanguage,
  saveStoredLanguage,
} from './utils/i18n';
import {
  TableProperties,
  PlusCircle,
  Landmark,
  Settings as SettingsIcon,
} from 'lucide-react';
import { OfflineIndicator } from './components/PWAInstallButton';
import {
  AuthenticatedSessionPayload,
  AuthOnboardingScreen,
} from './components/AuthOnboardingScreen';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { MatrixGridView } from './components/MatrixGridView';
import { TimelineView } from './components/TimelineView';
import { OpenFinanceView } from './components/OpenFinanceView';
import { AccountsSecurityView } from './components/AccountsSecurityView';
import { InvestmentSimulatorView } from './components/InvestmentSimulatorView';
import { AssistantChatView } from './components/AssistantChatView';
import { DownloadCenterView } from './components/DownloadCenterView';
import { SettingsView } from './components/SettingsView';
import { CellDetailDrawer } from './components/CellDetailDrawer';
import { NewEntryModal } from './components/NewEntryModal';
import { LockScreenModal } from './components/LockScreenModal';

interface AuthSession {
  token: string;
  cpfId: string;
  profile: UserProfile;
  biometric: BiometricConfig;
}

function normalizeRestoredState(rawState?: Partial<AppState> | null): AppState {
  const clean = createCleanAppState();
  if (!rawState || !Array.isArray(rawState.rows) || rawState.rows.length === 0) {
    return clean;
  }
  const rawSettings = rawState.settings ?? ({} as Partial<AppSettings>);
  const rawFocus = Number(rawSettings.focusMonth);
  const safeFocusMonth = Number.isFinite(rawFocus)
    ? Math.min(11, Math.max(0, Math.trunc(rawFocus)))
    : clean.settings.focusMonth;
  const rawYear = Number(rawSettings.activeYear);
  const rawClosingDay = Number(rawSettings.closingDay);
  const rawAutoLock = Number(rawSettings.autoLockMinutes);
  const rawThreshold = Number(rawSettings.anomalyThresholdPct);

  const mergedSettings: AppSettings = {
    ...clean.settings,
    ...rawSettings,
    language: normalizeLanguage(rawSettings.language ?? loadStoredLanguage()),
    activeYear: Number.isFinite(rawYear) && rawYear >= 2000 && rawYear <= 2100 ? Math.trunc(rawYear) : clean.settings.activeYear,
    focusMonth: safeFocusMonth,
    closingDay: Number.isFinite(rawClosingDay) ? Math.min(31, Math.max(1, Math.trunc(rawClosingDay))) : clean.settings.closingDay,
    autoLockMinutes: Number.isFinite(rawAutoLock) ? Math.max(1, Math.trunc(rawAutoLock)) : clean.settings.autoLockMinutes,
    anomalyThresholdPct: Number.isFinite(rawThreshold) ? Math.max(10, rawThreshold) : clean.settings.anomalyThresholdPct,
  };
  if (mergedSettings.privacyDefaultOnBoot) {
    mergedSettings.privacyMode = true;
  }

  const sanitizedEntries: TransactionEntry[] = Array.isArray(rawState.entries)
    ? rawState.entries
        .filter((e): e is TransactionEntry => Boolean(e && typeof e === 'object' && e.id && e.rowId))
        .map((e) => {
          const amt = Number(e.amount);
          const mo = Number(e.month);
          const dy = Number(e.day);
          const yr = Number(e.year);
          const instCur = Number(e.installmentCurrent);
          const instTot = Number(e.installmentTotal);
          const validNature: EntryNature =
            e.entryNature === 'internal_transfer' || e.entryNature === 'invoice_payment'
              ? e.entryNature
              : 'standard';
          return {
            ...e,
            year: Number.isFinite(yr) ? Math.trunc(yr) : mergedSettings.activeYear,
            month: Number.isFinite(mo) ? Math.min(11, Math.max(0, Math.trunc(mo))) : 0,
            day: Number.isFinite(dy) ? Math.min(31, Math.max(1, Math.trunc(dy))) : 15,
            amount: Number.isFinite(amt) && amt >= 0 ? amt : 0,
            entryNature: validNature,
            installmentCurrent: Number.isFinite(instCur) && instCur >= 1 ? Math.trunc(instCur) : undefined,
            installmentTotal: Number.isFinite(instTot) && instTot >= 1 ? Math.trunc(instTot) : undefined,
          };
        })
    : [];

  const sanitizedAccounts: BankAccount[] = Array.isArray(rawState.accounts)
    ? rawState.accounts.filter((a): a is BankAccount => Boolean(a && typeof a === 'object' && a.id))
    : [];

  const sanitizedRevoked: BankAccount[] = Array.isArray(rawState.revokedConsents)
    ? rawState.revokedConsents.filter((a): a is BankAccount => Boolean(a && typeof a === 'object' && a.id))
    : [];

  const sanitizedRecurringBills: RecurringBill[] = Array.isArray(rawState.recurringBills)
    ? rawState.recurringBills
        .filter((b): b is RecurringBill => Boolean(b && typeof b === 'object' && b.id && b.title))
        .map((b) => {
          const amt = Number(b.amount);
          const due = Number(b.dueDay);
          return {
            ...b,
            amount: Number.isFinite(amt) && amt >= 0 ? Number(amt.toFixed(2)) : 0,
            dueDay: Number.isFinite(due) ? Math.min(31, Math.max(1, Math.trunc(due))) : 15,
            statusByMonth:
              b.statusByMonth && typeof b.statusByMonth === 'object' ? b.statusByMonth : {},
          };
        })
    : [];

  return {
    rows: rawState.rows,
    entries: sanitizedEntries,
    accounts: sanitizedAccounts,
    revokedConsents: sanitizedRevoked,
    rules: Array.isArray(rawState.rules) ? rawState.rules : clean.rules,
    goals: Array.isArray(rawState.goals) ? rawState.goals : [],
    recurringBills: sanitizedRecurringBills,
    auditLog: Array.isArray(rawState.auditLog) ? rawState.auditLog : [],
    settings: mergedSettings,
    chatHistory: Array.isArray(rawState.chatHistory) ? rawState.chatHistory : [],
  };
}

function getBackupDataSignature(s: AppState): string {
  return JSON.stringify([s.entries, s.rows, s.accounts, s.goals, s.recurringBills ?? []]);
}

export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [state, setState] = useState<AppState>(() => createCleanAppState());
  const [activeTab, setActiveTab] = useState<NavTab>('matrix');
  const [settingsSubTab, setSettingsSubTab] = useState<
    'monitoring' | 'goals' | 'grid' | 'security'
  >('monitoring');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newEntryModalOpen, setNewEntryModalOpen] = useState(false);
  const [newEntryFlowType, setNewEntryFlowType] = useState<'income' | 'expense' | undefined>(
    undefined
  );
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; month: number } | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [backupMeta, setBackupMeta] = useState<BackupMeta>({ lastBackupAt: null, dirty: false });
  const [autoBackupStatus, setAutoBackupStatus] = useState<AutoBackupStatus | null>(null);
  const [backupReminderDismissed, setBackupReminderDismissed] = useState(false);

  const syncTimeoutRef = useRef<number | null>(null);
  const skipNextSyncRef = useRef(false);
  const lastBackupDataSigRef = useRef<string>('');
  const stateRef = useRef(state);
  stateRef.current = state;

  // Limpa chave legada v1 para garantir Primeiro Acesso Real limpo
  useEffect(() => {
    try {
      localStorage.removeItem('thayllon_private_control_cf2026_v1');
    } catch {
      // Ignore
    }
  }, []);

  // Theme class sync (dark default on auth screen too)
  useEffect(() => {
    const root = document.documentElement;
    if (!authSession || state.settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [authSession, state.settings.theme]);

  // Language persistence & document lang attribute sync
  useEffect(() => {
    saveStoredLanguage(state.settings.language);
  }, [state.settings.language]);

  // Persist to IndexedDB cache + Server Vault (debounced) whenever authenticated state updates
  useEffect(() => {
    if (!authSession) return;
    void saveLocalVaultCache(authSession.cpfId, state);

    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      lastBackupDataSigRef.current = getBackupDataSignature(state);
      return;
    }

    const currentSig = getBackupDataSignature(state);
    if (currentSig !== lastBackupDataSigRef.current) {
      lastBackupDataSigRef.current = currentSig;
      if (hasOperationalDataForBackup(state)) {
        setBackupMeta(markBackupDirty(authSession.cpfId));
        setBackupReminderDismissed(false);
      }
    }

    if (syncTimeoutRef.current !== null) {
      window.clearTimeout(syncTimeoutRef.current);
    }

    const tokenSnapshot = authSession.token;
    const stateSnapshot = state;
    syncTimeoutRef.current = window.setTimeout(() => {
      void syncVaultState(tokenSnapshot, stateSnapshot);
    }, 350);

    return () => {
      if (syncTimeoutRef.current !== null) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [state, authSession]);

  // Auto-Lock timer when authenticated
  useEffect(() => {
    if (!authSession || isLocked) return;
    const ms = Math.max(1, state.settings.autoLockMinutes) * 60 * 1000;
    let timer = window.setTimeout(() => setIsLocked(true), ms);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIsLocked(true), ms);
    };

    window.addEventListener('pointerdown', resetTimer);
    window.addEventListener('keydown', resetTimer);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [authSession, state.settings.autoLockMinutes, isLocked]);

  // Auto-Lock immediately when app goes to background / tab minimized / screen locked
  useEffect(() => {
    if (!authSession || !state.settings.lockOnBackground || isLocked) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setIsLocked(true);
      }
    };
    const handleBackgroundEvent = () => {
      setIsLocked(true);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('pause', handleBackgroundEvent);
    window.addEventListener('pagehide', handleBackgroundEvent);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('pause', handleBackgroundEvent);
      window.removeEventListener('pagehide', handleBackgroundEvent);
    };
  }, [authSession, state.settings.lockOnBackground, isLocked]);

  // 24-hour Automatic Backup Scheduler (IndexedDB + Authenticated Server Vault)
  useEffect(() => {
    if (!authSession) {
      setAutoBackupStatus(null);
      return;
    }

    const executeCheck = async () => {
      try {
        const res = await runAutoBackupIfDue(
          authSession.cpfId,
          stateRef.current,
          authSession.profile,
          (sanitizedState, source) =>
            uploadServerBackupSnapshot(authSession.token, sanitizedState, source)
        );
        setAutoBackupStatus(res.status);
        if (res.ran) {
          setBackupMeta(loadBackupMeta(authSession.cpfId));
        }
      } catch {
        const fallback = await getAutoBackupStatus(authSession.cpfId);
        setAutoBackupStatus(fallback);
      }
    };

    void executeCheck();
    const interval = window.setInterval(() => {
      void executeCheck();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [authSession]);

  const totals = useMemo(
    () => computeMatrixTotals(state.rows, state.entries, state.settings.activeYear),
    [state.rows, state.entries, state.settings.activeYear]
  );

  const alerts = useMemo(
    () => computeAlerts(state.rows, state.entries, totals, state.settings),
    [state.rows, state.entries, totals, state.settings]
  );

  const openFinanceAttentionCount = useMemo(
    () => state.accounts.filter((a) => evaluateAccountHealth(a).needsAction).length,
    [state.accounts]
  );

  const handleAuthenticated = (payload: AuthenticatedSessionPayload) => {
    const normalized = normalizeRestoredState(payload.appState);
    skipNextSyncRef.current = true;
    lastBackupDataSigRef.current = getBackupDataSignature(normalized);
    setState(normalized);
    setAuthSession({
      token: payload.token,
      cpfId: payload.cpfId,
      profile: payload.profile,
      biometric: payload.biometric,
    });
    setBackupMeta(loadBackupMeta(payload.cpfId));
    setBackupReminderDismissed(false);
    setActiveTab('matrix');
    setIsLocked(false);
    setSelectedCell(null);
  };

  const handleLogout = () => {
    if (syncTimeoutRef.current !== null) {
      window.clearTimeout(syncTimeoutRef.current);
    }
    setAuthSession(null);
    setState(createCleanAppState());
    setIsLocked(false);
    setSelectedCell(null);
    setNewEntryModalOpen(false);
    setMobileMenuOpen(false);
    setActiveTab('matrix');
  };

  const handleTestReinstallRecovery = async () => {
    if (!authSession) return;
    const currentCpfId = authSession.cpfId;
    const tokenSnapshot = authSession.token;
    const stateSnapshot = state;

    // Garante flush final no servidor/cofre antes de simular desinstalação local
    try {
      await syncVaultState(tokenSnapshot, stateSnapshot);
    } catch {
      // Ignore
    }

    await clearLocalVaultCache(currentCpfId);
    handleLogout();
  };

  if (!authSession) {
    const authLang = loadStoredLanguage();
    return (
      <>
        <AuthOnboardingScreen key={authLang} language={authLang} onAuthenticated={handleAuthenticated} />
        <OfflineIndicator language={authLang} />
      </>
    );
  }

  const updateSettings = (patch: Partial<AppSettings>) => {
    if (patch.language) {
      saveStoredLanguage(patch.language);
    }
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  };

  const handleAddEntry = (entry: Omit<TransactionEntry, 'id' | 'createdAt'>) => {
    const newItem: TransactionEntry = {
      ...entry,
      id: `ent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      entries: [...prev.entries, newItem],
    }));
  };

  const handleUpdateEntry = (id: string, patch: Partial<TransactionEntry>) => {
    setState((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  };

  const handleDeleteEntry = (id: string) => {
    setState((prev) => ({
      ...prev,
      entries: prev.entries.filter((e) => e.id !== id),
    }));
  };

  const handleReplaceCellTotal = (rowId: string, month: number, newTotal: number, note?: string) => {
    setState((prev) => {
      const year = prev.settings.activeYear;
      const row = prev.rows.find((r) => r.id === rowId);
      const remaining = prev.entries.filter(
        (e) => !(e.rowId === rowId && e.month === month && e.year === year)
      );
      if (newTotal <= 0) {
        return { ...prev, entries: remaining };
      }
      const replacement: TransactionEntry = {
        id: `ent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        rowId,
        year,
        month,
        day: row?.refDay ?? 15,
        amount: newTotal,
        description: `${row?.name ?? 'Lançamento'} · ${MONTH_NAMES_SHORT[month]}/${year}`,
        merchant: row?.name ?? 'Ajuste Direto',
        paymentMethod: row?.id.includes('cartao') ? 'credit' : 'debit',
        accountId: 'manual',
        source: 'manual',
        status: month === 11 ? 'projected' : 'paid',
        note,
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        entries: [...remaining, replacement],
      };
    });
  };

  const handleAddRow = (row: Omit<CategoryRow, 'id' | 'order'>) => {
    setState((prev) => {
      const blockRows = prev.rows.filter((r) => r.block === row.block);
      const maxOrder = blockRows.reduce((m, r) => Math.max(m, r.order), 0);
      const newRow: CategoryRow = {
        ...row,
        id: `row-${row.block}-${Date.now()}`,
        order: maxOrder + 1,
      };
      return { ...prev, rows: [...prev.rows, newRow] };
    });
  };

  const handleUpdateRow = (rowId: string, patch: Partial<CategoryRow>) => {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));
  };

  const handleMoveRow = (rowId: string, direction: 'up' | 'down') => {
    setState((prev) => {
      const target = prev.rows.find((r) => r.id === rowId);
      if (!target) return prev;
      const siblings = prev.rows
        .filter((r) => r.block === target.block && !r.hidden)
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex((r) => r.id === rowId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return prev;

      const other = siblings[swapIdx];
      return {
        ...prev,
        rows: prev.rows.map((r) => {
          if (r.id === target.id) return { ...r, order: other.order };
          if (r.id === other.id) return { ...r, order: target.order };
          return r;
        }),
      };
    });
  };

  const handleToggleHideRow = (rowId: string) => {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === rowId ? { ...r, hidden: !r.hidden } : r)),
    }));
  };

  const handleConnectAccount = (account: Omit<BankAccount, 'id' | 'slot' | 'lastSync'>) => {
    setState((prev) => {
      if (prev.accounts.length >= MAX_BANK_ACCOUNTS) return prev;
      const usedSlots = new Set(prev.accounts.map((a) => a.slot));
      let freeSlot = 1;
      while (usedSlots.has(freeSlot) && freeSlot <= MAX_BANK_ACCOUNTS) freeSlot++;

      const newAcc: BankAccount = {
        ...account,
        id: `acc-${Date.now()}`,
        slot: freeSlot,
        lastSync: new Date().toISOString(),
      };

      const audit = {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'Nova Conexão Open Finance',
        actor: `Titular (Slot ${freeSlot}/5)`,
        detail: `${newAcc.institution} (${newAcc.type}) conectada com consentimento somente leitura.`,
        securityProtocol: `OAuth 2.0 + PKCE (${newAcc.pkceChallengeId}) · TLS 1.3`,
        institution: newAcc.institution,
        scope: newAcc.consentScope.join(', '),
        status: 'success' as const,
        eventType: 'auth' as const,
      };

      return {
        ...prev,
        accounts: [...prev.accounts, newAcc],
        auditLog: [audit, ...prev.auditLog],
      };
    });
  };

  const handleSyncAccount = (accountId: string) => {
    setState((prev) => {
      const acc = prev.accounts.find((a) => a.id === accountId);
      if (!acc) return prev;
      const health = evaluateAccountHealth(acc);
      if (health.effectiveStatus === 'consent_expired' || health.effectiveStatus === 'paused') {
        return prev;
      }
      const now = new Date().toISOString();
      return {
        ...prev,
        accounts: prev.accounts.map((a) =>
          a.id === accountId
            ? { ...a, status: 'active', statusMessage: undefined, lastSync: now }
            : a
        ),
        auditLog: [
          {
            id: `aud-${Date.now()}`,
            timestamp: now,
            action: 'Sincronização Open Finance',
            actor: `Slot ${acc.slot} · ${acc.institution}`,
            detail: 'Saldos, limites, modalidades (crédito/débito) e lançamentos verificados sem duplicidade.',
            securityProtocol: `${acc.connectorProvider ?? 'OAuth 2.0 + FAPI'} · TLS 1.3`,
            institution: acc.institution,
            scope: acc.consentScope.join(', '),
            status: 'success' as const,
            eventType: 'sync' as const,
          },
          ...prev.auditLog,
        ],
      };
    });
  };

  const handleRenewAccountConsent = (accountId: string, termMonths = 12) => {
    setState((prev) => {
      const acc = prev.accounts.find((a) => a.id === accountId);
      if (!acc) return prev;
      const now = new Date();
      const nowIso = now.toISOString();
      const newChallenge = `pkce_${Math.random().toString(36).slice(2, 10)}`;
      const newExpiry = buildConsentExpirationDate(termMonths, now);

      return {
        ...prev,
        accounts: prev.accounts.map((a) =>
          a.id === accountId
            ? {
                ...a,
                status: 'active',
                statusMessage: undefined,
                consentGrantedAt: nowIso.slice(0, 10),
                consentExpiresAt: newExpiry,
                pkceChallengeId: newChallenge,
                lastSync: nowIso,
              }
            : a
        ),
        auditLog: [
          {
            id: `aud-${Date.now()}`,
            timestamp: nowIso,
            action: 'Consentimento Renovado via Banco Oficial',
            actor: `Titular (Slot ${acc.slot})`,
            detail: `${acc.institution} reautorizada em ambiente oficial OAuth 2.0 / FAPI até ${newExpiry}.`,
            securityProtocol: `OAuth 2.0 + FAPI (${newChallenge}) · TLS 1.3`,
            institution: acc.institution,
            scope: acc.consentScope.join(', '),
            status: 'success' as const,
            eventType: 'renew' as const,
          },
          ...prev.auditLog,
        ],
      };
    });
  };

  const handleSetAccountStatus = (
    accountId: string,
    status: AccountStatus,
    statusMessage?: string
  ) => {
    setState((prev) => {
      const acc = prev.accounts.find((a) => a.id === accountId);
      if (!acc) return prev;
      const nowIso = new Date().toISOString();
      const actionLabel =
        status === 'consent_expired'
          ? 'Consentimento Expirado'
          : status === 'sync_error'
          ? 'Falha Temporária de Conector'
          : status === 'paused'
          ? 'Monitoramento Pausado'
          : 'Monitoramento Retomado';

      return {
        ...prev,
        accounts: prev.accounts.map((a) =>
          a.id === accountId
            ? {
                ...a,
                status,
                statusMessage,
                ...(status === 'consent_expired'
                  ? { consentExpiresAt: new Date(Date.now() - 86400000).toISOString().slice(0, 10) }
                  : {}),
              }
            : a
        ),
        auditLog: [
          {
            id: `aud-${Date.now()}`,
            timestamp: nowIso,
            action: actionLabel,
            actor: `Slot ${acc.slot} · ${acc.institution}`,
            detail:
              statusMessage ||
              (status === 'paused'
                ? 'Sincronização automática suspensa pelo titular.'
                : 'Estado do conector atualizado no cofre LGPD.'),
            securityProtocol: 'Governança Open Finance (BACEN/LGPD)',
            institution: acc.institution,
            scope: acc.consentScope.join(', '),
            status:
              status === 'consent_expired' || status === 'sync_error'
                ? ('warning' as const)
                : ('success' as const),
            eventType: 'status' as const,
          },
          ...prev.auditLog,
        ],
      };
    });
  };

  const handleTogglePauseAccount = (accountId: string) => {
    const acc = state.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const nextStatus: AccountStatus = acc.status === 'active' ? 'paused' : 'active';
    handleSetAccountStatus(
      accountId,
      nextStatus,
      nextStatus === 'paused'
        ? 'Sincronização automática suspensa pelo titular.'
        : 'Sincronização automática reativada.'
    );
  };

  const handleDisconnectAccount = (accountId: string) => {
    setState((prev) => {
      const acc = prev.accounts.find((a) => a.id === accountId);
      if (!acc) return prev;
      const nowIso = new Date().toISOString();
      const remaining = prev.accounts
        .filter((a) => a.id !== accountId)
        .map((a, idx) => ({ ...a, slot: idx + 1 }));
      const revokedEntry: BankAccount = { ...acc, revokedAt: nowIso };

      return {
        ...prev,
        accounts: remaining,
        revokedConsents: [revokedEntry, ...(prev.revokedConsents ?? [])].slice(0, 20),
        auditLog: [
          {
            id: `aud-${Date.now()}`,
            timestamp: nowIso,
            action: 'Consentimento Revogado',
            actor: 'Titular',
            detail: `${acc.institution} desconectada e tokens PKCE destruídos.`,
            securityProtocol: 'Revogação OAuth 2.0 RFC 7009',
            institution: acc.institution,
            scope: acc.consentScope.join(', '),
            status: 'revoked' as const,
            eventType: 'revoke' as const,
          },
          ...prev.auditLog,
        ],
      };
    });
  };

  const handleSimulateTransaction = (payload: {
    accountId: string;
    description: string;
    merchant: string;
    paymentMethod: PaymentMethod;
    entryNature?: EntryNature;
    installmentCurrent?: number;
    installmentTotal?: number;
    amount: number;
    month: number;
    day: number;
    type: 'inflow' | 'outflow';
  }): { matchedRowName: string; isDeduplicated: boolean } => {
    const nature: EntryNature = payload.entryNature ?? 'standard';
    const isDeduplicated = nature === 'internal_transfer' || nature === 'invoice_payment';
    const descLower = `${payload.description} ${payload.merchant}`.toLowerCase();
    const matchedRule = state.rules.find(
      (r) => r.enabled && descLower.includes(r.keyword.toLowerCase())
    );

    let targetRow = matchedRule
      ? state.rows.find((r) => r.id === matchedRule.targetRowId && !r.hidden)
      : undefined;

    if (!targetRow) {
      const acc = state.accounts.find((a) => a.id === payload.accountId);
      if (payload.type === 'inflow') {
        targetRow =
          state.rows.find((r) => r.id === 'inc-extras') ??
          state.rows.find((r) => r.block === 'income');
      } else {
        targetRow =
          (acc?.defaultRowId ? state.rows.find((r) => r.id === acc.defaultRowId) : undefined) ??
          state.rows.find((r) => r.id === 'var-outros');
      }
    }

    const rowId = targetRow?.id ?? 'var-outros';
    const matchedRowName = targetRow?.name ?? 'OUTROS';
    const hasInstallments =
      Number.isFinite(payload.installmentTotal) &&
      (payload.installmentTotal ?? 1) > 1 &&
      Number.isFinite(payload.installmentCurrent) &&
      (payload.installmentCurrent ?? 1) >= 1;

    setState((prev) => {
      const acc = prev.accounts.find((a) => a.id === payload.accountId);
      const newEntry: TransactionEntry = {
        id: `sim-${Date.now()}`,
        rowId,
        year: prev.settings.activeYear,
        month: payload.month,
        day: payload.day,
        amount: payload.amount,
        description: payload.description,
        merchant: payload.merchant,
        paymentMethod: payload.paymentMethod,
        entryNature: nature,
        installments: hasInstallments
          ? `${payload.installmentCurrent}/${payload.installmentTotal}`
          : undefined,
        installmentCurrent: hasInstallments ? payload.installmentCurrent : undefined,
        installmentTotal: hasInstallments ? payload.installmentTotal : undefined,
        accountId: payload.accountId,
        source: 'simulated',
        status: 'paid',
        note: isDeduplicated
          ? `Conciliado via Open Finance (${acc?.institution ?? 'Conta'}) · Excluído da soma de gastos reais para evitar duplicidade.`
          : `Capturado via Open Finance (${acc?.institution ?? 'Conta'})`,
        createdAt: new Date().toISOString(),
      };

      const updatedAccounts = prev.accounts.map((a) => {
        if (a.id !== payload.accountId) return a;
        const delta = payload.type === 'inflow' ? payload.amount : -payload.amount;
        const nextBalance = Number((a.balance + delta).toFixed(2));
        let nextAvailable = a.availableLimit;
        if (a.type === 'Cartão de Crédito' && a.creditLimit !== undefined) {
          const baseAvail = a.availableLimit ?? Math.max(0, a.creditLimit - Math.abs(a.balance));
          nextAvailable = Number(
            Math.max(0, Math.min(a.creditLimit, baseAvail + delta)).toFixed(2)
          );
        }
        return {
          ...a,
          balance: nextBalance,
          availableLimit: nextAvailable,
          lastSync: new Date().toISOString(),
        };
      });

      return {
        ...prev,
        entries: [...prev.entries, newEntry],
        accounts: updatedAccounts,
        auditLog: [
          {
            id: `aud-${Date.now()}`,
            timestamp: new Date().toISOString(),
            action: isDeduplicated
              ? 'Conciliação Anti-Duplicidade Open Finance'
              : 'Transação Open Finance Recebida',
            actor: acc ? `${acc.institution} (Slot ${acc.slot})` : 'Open Finance',
            detail: isDeduplicated
              ? `${payload.merchant} classificada como ${
                  nature === 'invoice_payment' ? 'Pagamento de Fatura' : 'Transferência Interna'
                } — não duplicada nos gastos.`
              : `${payload.merchant} (${payload.paymentMethod.toUpperCase()} · D/${String(
                  payload.day
                ).padStart(2, '0')}) → Auto-categorizada em "${matchedRowName}".`,
            securityProtocol: 'Webhook Assinado · TLS 1.3',
            institution: acc?.institution ?? 'Open Finance',
            scope: 'TRANSACTIONS_READ',
            status: 'success' as const,
            eventType: 'transaction' as const,
          },
          ...prev.auditLog,
        ],
      };
    });

    return { matchedRowName, isDeduplicated };
  };

  // Auto Rules
  const handleAddRule = (rule: Omit<AutoRule, 'id'>) => {
    setState((prev) => ({
      ...prev,
      rules: [...prev.rules, { ...rule, id: `rule-${Date.now()}` }],
    }));
  };

  const handleToggleRule = (ruleId: string) => {
    setState((prev) => ({
      ...prev,
      rules: prev.rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
    }));
  };

  const handleDeleteRule = (ruleId: string) => {
    setState((prev) => ({
      ...prev,
      rules: prev.rules.filter((r) => r.id !== ruleId),
    }));
  };

  // Savings Goals
  const handleAddGoal = (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => {
    setState((prev) => ({
      ...prev,
      goals: [
        ...prev.goals,
        { ...goal, id: `goal-${Date.now()}`, createdAt: new Date().toISOString() },
      ],
    }));
  };

  const handleUpdateGoal = (goalId: string, patch: Partial<SavingsGoal>) => {
    setState((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => (g.id === goalId ? { ...g, ...patch } : g)),
    }));
  };

  const handleDeleteGoal = (goalId: string) => {
    setState((prev) => ({
      ...prev,
      goals: prev.goals.filter((g) => g.id !== goalId),
    }));
  };

  // Recurring Bills
  const handleAddRecurringBill = (bill: Omit<RecurringBill, 'id' | 'createdAt'>) => {
    const newBill: RecurringBill = {
      ...bill,
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      recurringBills: [...(prev.recurringBills ?? []), newBill],
    }));
  };

  const handleUpdateRecurringBill = (id: string, patch: Partial<RecurringBill>) => {
    setState((prev) => ({
      ...prev,
      recurringBills: (prev.recurringBills ?? []).map((b) =>
        b.id === id ? { ...b, ...patch } : b
      ),
    }));
  };

  const handleDeleteRecurringBill = (id: string) => {
    setState((prev) => ({
      ...prev,
      recurringBills: (prev.recurringBills ?? []).filter((b) => b.id !== id),
    }));
  };

  // PDF Report & JSON Backup Export
  const handleExportPDF = () => {
    try {
      generatePrivateBankingAnnualPDF(state, totals);
    } catch {
      // Silencia erro eventual caso navegador bloqueie download
    }
  };

  const handleExportJSONBackup = () => {
    if (!authSession) return;
    try {
      exportVaultBackupJSON(state, authSession.profile);
      setBackupMeta(markBackupCompleted(authSession.cpfId));
      setBackupReminderDismissed(false);
    } catch {
      // Ignore eventual browser download restriction
    }
  };

  // Chat Handlers
  const handleAppendMessages = (messages: ChatMessage[]) => {
    setState((prev) => ({
      ...prev,
      chatHistory: [...prev.chatHistory, ...messages],
    }));
  };

  const handleClearChat = () => {
    setState((prev) => ({ ...prev, chatHistory: [] }));
  };

  // Explicit Demo 2026 & Zero-Data Handlers
  const handleLoadDemo2026Data = () => {
    const demo = createDemo2026AppState();
    setSelectedCell(null);
    setState((prev) => ({
      ...demo,
      settings: {
        ...demo.settings,
        language: prev.settings.language,
        theme: prev.settings.theme,
        privacyMode: prev.settings.privacyMode,
      },
    }));
  };

  const handleClearOperationalData = () => {
    const clean = createCleanAppState();
    setSelectedCell(null);
    setState((prev) => ({
      ...clean,
      settings: {
        ...clean.settings,
        language: prev.settings.language,
        theme: prev.settings.theme,
        privacyMode: prev.settings.privacyMode,
      },
    }));
  };

  const handleImportBackup = (imported: AppState) => {
    setSelectedCell(null);
    setState(normalizeRestoredState(imported));
  };

  const handleRunManualBackupNow = async () => {
    if (!authSession) return;
    const status = await createBackupSnapshotAndPersist(
      authSession.cpfId,
      state,
      authSession.profile,
      'manual',
      (sanitizedState, source) =>
        uploadServerBackupSnapshot(authSession.token, sanitizedState, source)
    );
    setAutoBackupStatus(status);
    setBackupMeta(loadBackupMeta(authSession.cpfId));
  };

  const handleShareOrDownloadBackup = async () => {
    if (!authSession) return;
    await shareOrDownloadLatestBackupJSON(authSession.cpfId, state, authSession.profile);
    setBackupMeta(markBackupCompleted(authSession.cpfId));
  };

  const handleRefreshVaultFromServer = async () => {
    if (!authSession) return;
    const fresh = await refreshVaultFromServer(authSession.token);
    if (fresh) {
      skipNextSyncRef.current = true;
      setState(normalizeRestoredState(fresh));
    }
  };

  const handleApplyOpenFinanceState = (patch: {
    accounts?: BankAccount[];
    revokedConsents?: BankAccount[];
    auditLog?: AppState['auditLog'];
  }) => {
    setState((prev) => ({
      ...prev,
      ...(patch.accounts ? { accounts: patch.accounts } : {}),
      ...(patch.revokedConsents ? { revokedConsents: patch.revokedConsents } : {}),
      ...(patch.auditLog ? { auditLog: patch.auditLog } : {}),
    }));
  };

  const selectedRow = selectedCell
    ? state.rows.find((r) => r.id === selectedCell.rowId) ?? null
    : null;
  const selectedCellEntries = selectedCell
    ? state.entries.filter(
        (e) =>
          e.rowId === selectedCell.rowId &&
          e.month === selectedCell.month &&
          e.year === state.settings.activeYear
      )
    : [];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'settings') setSettingsSubTab('monitoring');
        }}
        alertCount={alerts.length}
        connectedAccountsCount={state.accounts.length}
        openFinanceAttentionCount={openFinanceAttentionCount}
        maxAccounts={MAX_BANK_ACCOUNTS}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onLockSession={() => setIsLocked(true)}
        onLogout={handleLogout}
        profile={authSession.profile}
        language={state.settings.language}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeTab={activeTab}
          activeYear={state.settings.activeYear}
          privacyMode={state.settings.privacyMode}
          theme={state.settings.theme}
          language={state.settings.language}
          onTogglePrivacy={() =>
            updateSettings({ privacyMode: !state.settings.privacyMode })
          }
          onToggleTheme={() =>
            updateSettings({ theme: state.settings.theme === 'dark' ? 'light' : 'dark' })
          }
          onOpenNewEntry={() => {
            setNewEntryFlowType(undefined);
            setNewEntryModalOpen(true);
          }}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'matrix' && (
                <MatrixGridView
                  rows={state.rows}
                  entries={state.entries}
                  accounts={state.accounts}
                  goals={state.goals}
                  recurringBills={state.recurringBills ?? []}
                  totals={totals}
                  alerts={alerts}
                  settings={state.settings}
                  backupReminderVisible={
                    backupMeta.dirty &&
                    !backupReminderDismissed &&
                    hasOperationalDataForBackup(state)
                  }
                  isOfflineVault={
                    authSession.token.startsWith('offline_') ||
                    (typeof navigator !== 'undefined' && navigator.onLine === false)
                  }
                  lastBackupAt={backupMeta.lastBackupAt}
                  onSelectCell={(row, month) => setSelectedCell({ rowId: row.id, month })}
                  onUpdateSettings={updateSettings}
                  onUpdateRow={handleUpdateRow}
                  onAddRow={handleAddRow}
                  onMoveRow={handleMoveRow}
                  onToggleHideRow={handleToggleHideRow}
                  onAddRecurringBill={handleAddRecurringBill}
                  onUpdateRecurringBill={handleUpdateRecurringBill}
                  onDeleteRecurringBill={handleDeleteRecurringBill}
                  onExportPDF={handleExportPDF}
                  onExportJSON={handleExportJSONBackup}
                  onDismissBackupReminder={() => setBackupReminderDismissed(true)}
                  onOpenGoalSettings={() => {
                    setSettingsSubTab('goals');
                    setActiveTab('settings');
                  }}
                  onOpenAccountsHub={() => setActiveTab('openfinance')}
                  onQuickEntry={(flowType) => {
                    setNewEntryFlowType(flowType);
                    setNewEntryModalOpen(true);
                  }}
                />
              )}

              {activeTab === 'timeline' && (
                <TimelineView
                  rows={state.rows}
                  entries={state.entries}
                  accounts={state.accounts}
                  alerts={alerts}
                  settings={state.settings}
                />
              )}

              {activeTab === 'openfinance' && (
                <OpenFinanceView
                  authToken={authSession.token}
                  accounts={state.accounts}
                  revokedConsents={state.revokedConsents ?? []}
                  rows={state.rows}
                  rules={state.rules}
                  auditLog={state.auditLog}
                  settings={state.settings}
                  onTogglePauseAccount={handleTogglePauseAccount}
                  onDisconnectAccount={handleDisconnectAccount}
                  onAddRule={handleAddRule}
                  onToggleRule={handleToggleRule}
                  onDeleteRule={handleDeleteRule}
                  onRefreshVault={handleRefreshVaultFromServer}
                  onApplySyncedState={handleApplyOpenFinanceState}
                />
              )}

              {activeTab === 'accounts' && (
                <AccountsSecurityView
                  authToken={authSession.token}
                  accounts={state.accounts}
                  auditLog={state.auditLog}
                  settings={state.settings}
                  onTogglePauseAccount={handleTogglePauseAccount}
                  onDisconnectAccount={handleDisconnectAccount}
                  onRefreshVault={handleRefreshVaultFromServer}
                  onApplySyncedState={handleApplyOpenFinanceState}
                />
              )}

              {activeTab === 'investments' && (
                <InvestmentSimulatorView totals={totals} settings={state.settings} />
              )}

              {activeTab === 'assistant' && (
                <AssistantChatView
                  state={state}
                  totals={totals}
                  alerts={alerts}
                  authToken={authSession.token}
                  onAppendMessages={handleAppendMessages}
                  onClearHistory={handleClearChat}
                />
              )}

              {activeTab === 'downloads' && (
                <DownloadCenterView
                  state={state}
                  profile={authSession.profile}
                  language={state.settings.language}
                  onExportJSON={handleExportJSONBackup}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  state={state}
                  totals={totals}
                  alerts={alerts}
                  authToken={authSession.token}
                  profile={authSession.profile}
                  biometric={authSession.biometric}
                  initialSubTab={settingsSubTab}
                  onUpdateSettings={updateSettings}
                  onAddRule={handleAddRule}
                  onToggleRule={handleToggleRule}
                  onDeleteRule={handleDeleteRule}
                  onUpdateRow={handleUpdateRow}
                  onAddRow={handleAddRow}
                  onMoveRow={handleMoveRow}
                  onAddGoal={handleAddGoal}
                  onUpdateGoal={handleUpdateGoal}
                  onDeleteGoal={handleDeleteGoal}
                  onExportPDF={handleExportPDF}
                  onExportJSON={handleExportJSONBackup}
                  onLoadDemo2026Data={handleLoadDemo2026Data}
                  onClearOperationalData={handleClearOperationalData}
                  onImportBackup={handleImportBackup}
                  onProfileUpdated={(updatedProfile) =>
                    setAuthSession((prev) =>
                      prev ? { ...prev, profile: updatedProfile } : prev
                    )
                  }
                  onBiometricUpdated={(updatedBio) =>
                    setAuthSession((prev) =>
                      prev ? { ...prev, biometric: updatedBio } : prev
                    )
                  }
                  onTestReinstallRecovery={handleTestReinstallRecovery}
                  autoBackupStatus={autoBackupStatus}
                  onRunManualBackupNow={handleRunManualBackupNow}
                  onShareOrDownloadBackup={handleShareOrDownloadBackup}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Quick Nav (4 core actions for < 2 minute daily workflow) */}
      <nav
        aria-label="Navegação rápida mobile"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#0D1320]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/[0.08] grid grid-cols-4 px-2 py-1.5"
      >
        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg text-[10px] font-medium ${
            activeTab === 'matrix'
              ? 'text-[#A68342] dark:text-[#E5C88F]'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <TableProperties className="h-4 w-4" />
          <span>Saldo / Matriz</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setNewEntryFlowType('expense');
            setNewEntryModalOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
        >
          <PlusCircle className="h-4 w-4" />
          <span>+ / − Rápido</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('openfinance')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg text-[10px] font-medium ${
            activeTab === 'openfinance'
              ? 'text-[#A68342] dark:text-[#E5C88F]'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Landmark className="h-4 w-4" />
          <span>Open Finance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg text-[10px] font-medium ${
            activeTab === 'settings'
              ? 'text-[#A68342] dark:text-[#E5C88F]'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <SettingsIcon className="h-4 w-4" />
          <span>Ajustes</span>
        </button>
      </nav>

      <CellDetailDrawer
        isOpen={Boolean(selectedCell && selectedRow)}
        row={selectedRow}
        month={selectedCell?.month ?? null}
        year={state.settings.activeYear}
        entries={selectedCellEntries}
        accounts={state.accounts}
        categoryAverage={selectedRow ? totals.rowAverage[selectedRow.id] ?? 0 : 0}
        privacyMode={state.settings.privacyMode}
        language={state.settings.language}
        onClose={() => setSelectedCell(null)}
        onAddEntry={handleAddEntry}
        onUpdateEntry={handleUpdateEntry}
        onDeleteEntry={handleDeleteEntry}
        onReplaceCellTotal={handleReplaceCellTotal}
      />

      <NewEntryModal
        isOpen={newEntryModalOpen}
        rows={state.rows}
        accounts={state.accounts}
        activeYear={state.settings.activeYear}
        defaultMonth={state.settings.focusMonth ?? 10}
        initialFlowType={newEntryFlowType}
        language={state.settings.language}
        onClose={() => setNewEntryModalOpen(false)}
        onAddEntry={handleAddEntry}
      />

      <LockScreenModal
        isLocked={isLocked}
        authToken={authSession.token}
        profile={authSession.profile}
        biometric={authSession.biometric}
        language={state.settings.language}
        onUnlock={() => setIsLocked(false)}
        onLogout={handleLogout}
      />

      <OfflineIndicator language={state.settings.language} />
    </div>
  );
}
