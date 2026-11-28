import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AccountStatus,
  AccountType,
  AppSettings,
  AppState,
  AutoRule,
  BankAccount,
  BiometricConfig,
  CategoryRow,
  ChatMessage,
  CreditCardAccount,
  CreditCardPurchase,
  EntryNature,
  NavTab,
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
import {
  computeAlerts,
  computeMatrixTotals,
  computeUpcomingCashflowAlerts,
} from './utils/financeEngine';
import { sendCashflowAlertNotification } from './utils/permissions';
import { getInvoiceMonthKey } from './utils/creditCardsEngine';
import {
  AutoBackupStatus,
  createBackupSnapshotAndPersist,
  getAutoBackupStatus,
  hasOperationalDataForBackup,
  markBackupDirty,
  runAutoBackupIfDue,
} from './utils/backup';
import { clearLocalVaultCache, saveCadastralDraft, saveLocalVaultCache } from './utils/localVault';
import {
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
  CreditCard,
  Settings as SettingsIcon,
  RotateCcw,
  X,
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
import { CreditCardsView } from './components/CreditCardsView';
import { AccountsSecurityView } from './components/AccountsSecurityView';
import { InvestmentSimulatorView } from './components/InvestmentSimulatorView';
import { AssistantChatView } from './components/AssistantChatView';
import { DownloadCenterView } from './components/DownloadCenterView';
import { SettingsView } from './components/SettingsView';
import { CellDetailDrawer } from './components/CellDetailDrawer';
import { NewEntryModal } from './components/NewEntryModal';
import { LockScreenModal } from './components/LockScreenModal';
import { ValidatedImportRow } from './utils/spreadsheetReports';

interface AuthSession {
  token: string;
  cpfId: string;
  profile: UserProfile;
  biometric: BiometricConfig;
}

function normalizeRestoredState(rawState?: Partial<AppState> | null): AppState {
  const clean = createCleanAppState();
  if (!rawState || !Array.isArray(rawState.rows)) {
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
  const rawLeadDays = Number(rawSettings.alertLeadDays);

  const mergedSettings: AppSettings = {
    ...clean.settings,
    ...rawSettings,
    language: normalizeLanguage(rawSettings.language ?? loadStoredLanguage()),
    activeYear: Number.isFinite(rawYear) && rawYear >= 1900 && rawYear <= 9999 ? Math.trunc(rawYear) : clean.settings.activeYear,
    focusMonth: safeFocusMonth,
    closingDay: Number.isFinite(rawClosingDay) ? Math.min(31, Math.max(1, Math.trunc(rawClosingDay))) : clean.settings.closingDay,
    autoLockMinutes: Number.isFinite(rawAutoLock) ? Math.max(1, Math.trunc(rawAutoLock)) : clean.settings.autoLockMinutes,
    anomalyThresholdPct: Number.isFinite(rawThreshold) ? Math.max(10, rawThreshold) : clean.settings.anomalyThresholdPct,
    alertLeadDays: Number.isFinite(rawLeadDays) ? Math.min(30, Math.max(1, Math.trunc(rawLeadDays))) : clean.settings.alertLeadDays ?? 3,
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

  const sanitizedCreditCards: CreditCardAccount[] = Array.isArray(rawState.creditCards)
    ? rawState.creditCards
        .filter((c): c is CreditCardAccount => Boolean(c && typeof c === 'object' && c.id && c.bankName))
        .map((c) => {
          const limit = Number(c.totalLimit);
          const closing = Number(c.closingDay);
          const due = Number(c.dueDay);
          return {
            ...c,
            bankColor: c.bankColor || '#2563EB',
            totalLimit: Number.isFinite(limit) && limit >= 0 ? Number(limit.toFixed(2)) : 0,
            closingDay: Number.isFinite(closing) ? Math.min(31, Math.max(1, Math.trunc(closing))) : 10,
            dueDay: Number.isFinite(due) ? Math.min(31, Math.max(1, Math.trunc(due))) : 17,
          };
        })
    : [];

  const sanitizedCardPurchases: CreditCardPurchase[] = Array.isArray(rawState.cardPurchases)
    ? rawState.cardPurchases
        .filter((p): p is CreditCardPurchase => Boolean(p && typeof p === 'object' && p.id && p.cardId))
        .map((p) => {
          const amt = Number(p.totalAmount);
          const inst = Number(p.installments);
          return {
            ...p,
            totalAmount: Number.isFinite(amt) && amt >= 0 ? Number(amt.toFixed(2)) : 0,
            installments: Number.isFinite(inst) ? Math.min(24, Math.max(1, Math.trunc(inst))) : 1,
          };
        })
    : [];

  const sanitizedPaidInvoices: Record<string, boolean> =
    rawState.paidCardInvoices && typeof rawState.paidCardInvoices === 'object'
      ? rawState.paidCardInvoices
      : {};

  const sanitizedRecurringBills: RecurringBill[] = Array.isArray(rawState.recurringBills)
    ? rawState.recurringBills
        .filter((b): b is RecurringBill => Boolean(b && typeof b === 'object' && b.id && b.title))
        .map((b) => {
          const amt = Number(b.amount);
          const due = Number(b.dueDay);
          return {
            ...b,
            type: b.type === 'income' ? 'income' : 'debit',
            active: b.active !== false,
            amount: Number.isFinite(amt) && amt >= 0 ? Number(amt.toFixed(2)) : 0,
            dueDay: Number.isFinite(due) ? Math.min(31, Math.max(1, Math.trunc(due))) : 15,
            statusByMonth:
              b.statusByMonth && typeof b.statusByMonth === 'object' ? b.statusByMonth : {},
          };
        })
    : [];

  const sanitizedRows = rawState.rows
    .filter((r) => Boolean(r && typeof r === 'object' && r.id && r.name))
    .map((r, idx) => ({
      ...r,
      block:
        r.block === 'income' || r.block === 'fixed' || r.block === 'variable' || r.block === 'savings'
          ? r.block
          : 'variable',
      name: String(r.name).trim() || `CATEGORIA ${idx + 1}`,
      color: typeof r.color === 'string' && r.color.trim() ? r.color.trim() : undefined,
      icon: typeof r.icon === 'string' && r.icon.trim() ? r.icon.trim() : undefined,
      order: Number.isFinite(Number(r.order)) ? Number(r.order) : idx + 1,
      hidden: Boolean(r.hidden),
    }));

  return {
    rows: sanitizedRows,
    entries: sanitizedEntries,
    accounts: sanitizedAccounts,
    creditCards: sanitizedCreditCards,
    cardPurchases: sanitizedCardPurchases,
    paidCardInvoices: sanitizedPaidInvoices,
    rules: Array.isArray(rawState.rules) ? rawState.rules : clean.rules,
    goals: Array.isArray(rawState.goals) ? rawState.goals : [],
    recurringBills: sanitizedRecurringBills,
    auditLog: Array.isArray(rawState.auditLog) ? rawState.auditLog : [],
    settings: mergedSettings,
    chatHistory: Array.isArray(rawState.chatHistory) ? rawState.chatHistory : [],
  };
}

function getBackupDataSignature(s: AppState): string {
  return JSON.stringify([
    s.entries,
    s.rows,
    s.accounts,
    s.creditCards ?? [],
    s.cardPurchases ?? [],
    s.paidCardInvoices ?? {},
    s.goals,
    s.recurringBills ?? [],
  ]);
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
  const [newEntryVoiceAutoStart, setNewEntryVoiceAutoStart] = useState(false);
  const [cardPurchaseTrigger, setCardPurchaseTrigger] = useState(0);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; month: number } | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [autoBackupStatus, setAutoBackupStatus] = useState<AutoBackupStatus | null>(null);
  const [undoToast, setUndoToast] = useState<{
    id: string;
    label: string;
    restore: () => void;
  } | null>(null);

  const syncTimeoutRef = useRef<number | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const skipNextSyncRef = useRef(false);
  const lastBackupDataSigRef = useRef<string>('');
  const stateRef = useRef(state);
  stateRef.current = state;

  const triggerUndoToast = (label: string, restore: () => void) => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    const toastId = `undo-${Date.now()}`;
    setUndoToast({ id: toastId, label, restore });
    undoTimerRef.current = window.setTimeout(() => {
      setUndoToast((cur) => (cur?.id === toastId ? null : cur));
    }, 6500);
  };

  // Limpa chave legada v1 para garantir Primeiro Acesso Real limpo
  useEffect(() => {
    try {
      localStorage.removeItem('thayllon_private_control_cf2026_v1');
    } catch {
      // Ignore
    }
  }, []);

  // Theme class sync (light default, dark optional)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', state.settings.theme === 'dark');
  }, [state.settings.theme]);

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
        markBackupDirty(authSession.cpfId);
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

  // Dispatch daily deduplicated local/browser notifications for due/upcoming cashflow alerts
  useEffect(() => {
    if (!authSession || isLocked || state.settings.notificationsEnabled === false) return;
    const upcoming = computeUpcomingCashflowAlerts({
      recurringBills: state.recurringBills ?? [],
      entries: state.entries,
      creditCards: state.creditCards ?? [],
      cardPurchases: state.cardPurchases ?? [],
      paidCardInvoices: state.paidCardInvoices ?? {},
      rows: state.rows,
      year: state.settings.activeYear,
      focusMonth: state.settings.focusMonth ?? new Date().getMonth(),
      leadDays: state.settings.alertLeadDays ?? 3,
    });
    upcoming.slice(0, 4).forEach((item) => {
      const prefix =
        item.kind === 'income'
          ? 'Recebimento previsto'
          : item.urgency === 'overdue'
          ? 'Débito vencido'
          : item.urgency === 'today'
          ? 'Vence hoje'
          : `Vence em ${item.daysDiff} dia(s)`;
      const formattedAmt = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(item.amount);
      void sendCashflowAlertNotification(
        `${prefix}: ${item.title}`,
        `${item.categoryLabel} · ${formattedAmt} (Dia ${String(item.day).padStart(2, '0')})`,
        item.id
      );
    });
  }, [
    authSession,
    isLocked,
    state.settings.notificationsEnabled,
    state.settings.alertLeadDays,
    state.settings.activeYear,
    state.settings.focusMonth,
    state.recurringBills,
    state.entries,
    state.creditCards,
    state.cardPurchases,
    state.paidCardInvoices,
    state.rows,
  ]);

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
    saveCadastralDraft({
      fullName: payload.profile.fullName,
      birthDate: payload.profile.birthDate,
      email: payload.profile.email,
      phone: payload.profile.phone,
      username: payload.profile.username,
      kycDocumentType: payload.profile.kycDocumentType,
      kycDocumentLast4: payload.profile.kycDocumentLast4,
    });
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
    const removed = stateRef.current.entries.find((e) => e.id === id);
    setState((prev) => ({
      ...prev,
      entries: prev.entries.filter((e) => e.id !== id),
    }));
    if (removed) {
      triggerUndoToast(`Lançamento "${removed.merchant || removed.description}" removido`, () => {
        setState((prev) =>
          prev.entries.some((e) => e.id === removed.id)
            ? prev
            : { ...prev, entries: [...prev.entries, removed] }
        );
      });
    }
  };

  const handleDuplicateEntryById = (id: string) => {
    const source = stateRef.current.entries.find((e) => e.id === id);
    if (!source) return;
    handleAddEntry({
      rowId: source.rowId,
      year: source.year,
      month: source.month,
      day: source.day,
      amount: source.amount,
      description: source.description,
      merchant: source.merchant,
      paymentMethod: source.paymentMethod,
      entryNature: source.entryNature,
      installments: source.installments,
      installmentCurrent: source.installmentCurrent,
      installmentTotal: source.installmentTotal,
      accountId: source.accountId,
      source: 'manual',
      status: source.status,
      note: source.note,
    });
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
        day: 15,
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

  const handleAddRow = (row: Omit<CategoryRow, 'id' | 'order'>): CategoryRow => {
    const cleanName = row.name.trim().toUpperCase();
    const existingBlockRows = stateRef.current.rows.filter((r) => r.block === row.block);
    const maxOrder = existingBlockRows.reduce((m, r) => Math.max(m, r.order), 0);
    const newRow: CategoryRow = {
      id: `row-${row.block}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      block: row.block,
      name: cleanName,
      color: row.color,
      icon: row.icon,
      order: maxOrder + 1,
      hidden: row.hidden,
      alertLimit: row.alertLimit,
      alertPctThreshold: row.alertPctThreshold,
      isRecurring: row.isRecurring,
    };
    setState((prev) => {
      const blockRows = prev.rows.filter((r) => r.block === row.block);
      const prevMaxOrder = blockRows.reduce((m, r) => Math.max(m, r.order), 0);
      const syncedRow: CategoryRow = {
        ...newRow,
        order: prevMaxOrder + 1,
      };
      return { ...prev, rows: [...prev.rows, syncedRow] };
    });
    return newRow;
  };

  const handleUpdateRow = (rowId: string, patch: Partial<CategoryRow>) => {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));
  };

  const handleDeleteRow = (rowId: string) => {
    const snapshot = stateRef.current;
    const removedRow = snapshot.rows.find((r) => r.id === rowId);
    if (!removedRow) return;

    const removedEntries = snapshot.entries.filter((e) => e.rowId === rowId);
    const removedRules = snapshot.rules.filter((rule) => rule.targetRowId === rowId);
    const affectedBillIds = new Set(
      (snapshot.recurringBills ?? [])
        .filter((b) => b.categoryRowId === rowId)
        .map((b) => b.id)
    );

    if (selectedCell?.rowId === rowId) {
      setSelectedCell(null);
    }

    setState((prev) => ({
      ...prev,
      rows: prev.rows.filter((r) => r.id !== rowId),
      entries: prev.entries.filter((e) => e.rowId !== rowId),
      rules: prev.rules.filter((rule) => rule.targetRowId !== rowId),
      recurringBills: (prev.recurringBills ?? []).map((b) =>
        b.categoryRowId === rowId ? { ...b, categoryRowId: undefined } : b
      ),
    }));

    triggerUndoToast(`Categoria "${removedRow.name}" excluída`, () => {
      setState((prev) => ({
        ...prev,
        rows: prev.rows.some((r) => r.id === removedRow.id)
          ? prev.rows
          : [...prev.rows, removedRow],
        entries: [
          ...prev.entries,
          ...removedEntries.filter((re) => !prev.entries.some((e) => e.id === re.id)),
        ],
        rules: [
          ...prev.rules,
          ...removedRules.filter((rr) => !prev.rules.some((r) => r.id === rr.id)),
        ],
        recurringBills: (prev.recurringBills ?? []).map((b) =>
          affectedBillIds.has(b.id) ? { ...b, categoryRowId: removedRow.id } : b
        ),
      }));
    });
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

  // Contas Bancárias Manuais
  const handleAddAccount = (payload: {
    institution: string;
    institutionCode: string;
    type: AccountType;
    nickname: string;
    balance: number;
    color: string;
  }) => {
    setState((prev) => {
      if (prev.accounts.length >= MAX_BANK_ACCOUNTS) return prev;
      const usedSlots = new Set(prev.accounts.map((a) => a.slot));
      let freeSlot = 1;
      while (usedSlots.has(freeSlot) && freeSlot <= MAX_BANK_ACCOUNTS) freeSlot++;

      const nowIso = new Date().toISOString();
      const newAcc: BankAccount = {
        id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        slot: freeSlot,
        institution: payload.institution,
        institutionCode: payload.institutionCode,
        type: payload.type,
        nickname: payload.nickname,
        balance: payload.balance,
        color: payload.color,
        status: 'active',
        lastSync: nowIso,
        maskedAccount: `•••• ${String(1000 + freeSlot * 137).slice(-4)}`,
      };

      return {
        ...prev,
        accounts: [...prev.accounts, newAcc],
        auditLog: [
          {
            id: `aud-${Date.now()}`,
            timestamp: nowIso,
            action: 'Conta Adicionada ao Cofre',
            actor: `Titular (Slot ${freeSlot}/${MAX_BANK_ACCOUNTS})`,
            detail: `${newAcc.institution} (${newAcc.type}) cadastrada com controle privado local.`,
            securityProtocol: 'Cofre Privado CPF · LGPD',
            institution: newAcc.institution,
            status: 'success' as const,
            eventType: 'auth' as const,
          },
          ...prev.auditLog,
        ],
      };
    });
  };

  const handleUpdateAccountBalance = (accountId: string, balance: number) => {
    const nowIso = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) =>
        a.id === accountId ? { ...a, balance, lastSync: nowIso } : a
      ),
    }));
  };

  const handleTogglePauseAccount = (accountId: string) => {
    setState((prev) => {
      const acc = prev.accounts.find((a) => a.id === accountId);
      if (!acc) return prev;
      const nextStatus: AccountStatus = acc.status === 'active' ? 'paused' : 'active';
      const nowIso = new Date().toISOString();

      return {
        ...prev,
        accounts: prev.accounts.map((a) =>
          a.id === accountId ? { ...a, status: nextStatus } : a
        ),
        auditLog: [
          {
            id: `aud-${Date.now()}`,
            timestamp: nowIso,
            action: nextStatus === 'paused' ? 'Conta Pausada' : 'Conta Reativada',
            actor: `Slot ${acc.slot} · ${acc.institution}`,
            detail:
              nextStatus === 'paused'
                ? 'Conta excluída temporariamente do saldo consolidado.'
                : 'Conta incluída novamente no saldo consolidado.',
            securityProtocol: 'Cofre Privado CPF',
            institution: acc.institution,
            status: 'success' as const,
            eventType: 'status' as const,
          },
          ...prev.auditLog,
        ],
      };
    });
  };

  const handleDisconnectAccount = (accountId: string) => {
    setState((prev) => {
      const acc = prev.accounts.find((a) => a.id === accountId);
      if (!acc) return prev;
      const nowIso = new Date().toISOString();
      const remaining = prev.accounts
        .filter((a) => a.id !== accountId)
        .map((a, idx) => ({ ...a, slot: idx + 1 }));

      return {
        ...prev,
        accounts: remaining,
        auditLog: [
          {
            id: `aud-${Date.now()}`,
            timestamp: nowIso,
            action: 'Conta Removida do Cofre',
            actor: 'Titular',
            detail: `${acc.institution} removida da lista de contas.`,
            securityProtocol: 'Cofre Privado CPF',
            institution: acc.institution,
            status: 'revoked' as const,
            eventType: 'revoke' as const,
          },
          ...prev.auditLog,
        ],
      };
    });
  };

  // Cartões de Crédito & Compras Parceladas
  const handleAddCard = (card: Omit<CreditCardAccount, 'id' | 'createdAt'>) => {
    const nowIso = new Date().toISOString();
    const newCard: CreditCardAccount = {
      ...card,
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: nowIso,
    };
    setState((prev) => ({
      ...prev,
      creditCards: [...(prev.creditCards ?? []), newCard],
      auditLog: [
        {
          id: `aud-${Date.now()}`,
          timestamp: nowIso,
          action: 'Cartão Cadastrado',
          actor: 'Titular',
          detail: `${newCard.bankName} adicionado com fechamento dia ${newCard.closingDay} e vencimento dia ${newCard.dueDay}.`,
          securityProtocol: 'Cofre Privado CPF',
          institution: newCard.bankName,
          status: 'success' as const,
          eventType: 'auth' as const,
        },
        ...prev.auditLog,
      ],
    }));
  };

  const handleUpdateCard = (cardId: string, patch: Partial<CreditCardAccount>) => {
    setState((prev) => ({
      ...prev,
      creditCards: (prev.creditCards ?? []).map((c) =>
        c.id === cardId ? { ...c, ...patch } : c
      ),
    }));
  };

  const handleDeleteCard = (cardId: string) => {
    setState((prev) => {
      const nextPaid: Record<string, boolean> = {};
      Object.entries(prev.paidCardInvoices ?? {}).forEach(([k, v]) => {
        if (!k.startsWith(`${cardId}:`)) {
          nextPaid[k] = v;
        }
      });
      return {
        ...prev,
        creditCards: (prev.creditCards ?? []).filter((c) => c.id !== cardId),
        cardPurchases: (prev.cardPurchases ?? []).filter((p) => p.cardId !== cardId),
        paidCardInvoices: nextPaid,
      };
    });
  };

  const handleAddCardPurchase = (purchase: Omit<CreditCardPurchase, 'id' | 'createdAt'>) => {
    const newPurchase: CreditCardPurchase = {
      ...purchase,
      id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      cardPurchases: [...(prev.cardPurchases ?? []), newPurchase],
    }));
  };

  const handleUpdateCardPurchase = (purchaseId: string, patch: Partial<CreditCardPurchase>) => {
    setState((prev) => ({
      ...prev,
      cardPurchases: (prev.cardPurchases ?? []).map((p) =>
        p.id === purchaseId ? { ...p, ...patch } : p
      ),
    }));
  };

  const handleDeleteCardPurchase = (purchaseId: string) => {
    const removed = (stateRef.current.cardPurchases ?? []).find((p) => p.id === purchaseId);
    setState((prev) => ({
      ...prev,
      cardPurchases: (prev.cardPurchases ?? []).filter((p) => p.id !== purchaseId),
    }));
    if (removed) {
      triggerUndoToast(`Compra "${removed.description}" removida`, () => {
        setState((prev) =>
          (prev.cardPurchases ?? []).some((p) => p.id === removed.id)
            ? prev
            : { ...prev, cardPurchases: [...(prev.cardPurchases ?? []), removed] }
        );
      });
    }
  };

  const handleToggleCardInvoicePaid = (cardId: string, year: number, month: number) => {
    const key = getInvoiceMonthKey(cardId, year, month);
    setState((prev) => {
      const current = Boolean(prev.paidCardInvoices?.[key]);
      return {
        ...prev,
        paidCardInvoices: {
          ...(prev.paidCardInvoices ?? {}),
          [key]: !current,
        },
      };
    });
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
    const removed = (stateRef.current.recurringBills ?? []).find((b) => b.id === id);
    setState((prev) => ({
      ...prev,
      recurringBills: (prev.recurringBills ?? []).filter((b) => b.id !== id),
    }));
    if (removed) {
      triggerUndoToast(`Recorrência "${removed.title}" removida`, () => {
        setState((prev) =>
          (prev.recurringBills ?? []).some((b) => b.id === removed.id)
            ? prev
            : { ...prev, recurringBills: [...(prev.recurringBills ?? []), removed] }
        );
      });
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

  const handleConfirmSpreadsheetImport = (
    validRows: ValidatedImportRow[],
    options: { syncRecurrences: boolean }
  ) => {
    if (validRows.length === 0) return;
    const nowIso = new Date().toISOString();

    setState((prev) => {
      const nextRows = [...prev.rows];
      const createdRowIdMap = new Map<string, string>();
      const newEntries: TransactionEntry[] = [];
      const nextRecurring = [...(prev.recurringBills ?? [])];

      const normalizeKey = (block: string, name: string) =>
        `${block}::${name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()}`;

      for (const item of validRows) {
        let rowId = item.matchedRowId;

        if (!rowId) {
          const key = normalizeKey(item.block, item.categoryName);
          rowId = createdRowIdMap.get(key) ?? null;

          if (!rowId) {
            const existingMatch = nextRows.find(
              (r) => !r.hidden && normalizeKey(r.block, r.name) === key
            );
            if (existingMatch) {
              rowId = existingMatch.id;
            } else {
              const blockRows = nextRows.filter((r) => r.block === item.block);
              const maxOrder = blockRows.reduce((m, r) => Math.max(m, r.order), 0);
              rowId = `row-${item.block}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              nextRows.push({
                id: rowId,
                block: item.block,
                name: item.categoryName.toUpperCase(),
                order: maxOrder + 1,
                isRecurring: item.isRecurring,
              });
            }
            createdRowIdMap.set(key, rowId);
          }
        }

        newEntries.push({
          id: `ent-imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          rowId,
          year: item.year,
          month: item.month,
          day: item.day,
          amount: item.amount,
          description: item.description,
          merchant: item.description,
          paymentMethod: item.paymentMethod,
          entryNature: 'standard',
          installments: item.installments,
          installmentCurrent: item.installmentCurrent,
          installmentTotal: item.installmentTotal,
          accountId: item.accountId,
          source: 'manual',
          status: item.status,
          note: item.note,
          createdAt: nowIso,
        });

        if (options.syncRecurrences && item.isRecurring && item.block !== 'savings') {
          const recType = item.block === 'income' ? 'income' : 'debit';
          const titleKey = item.description.trim().toLowerCase();
          const alreadyExists = nextRecurring.some(
            (b) => b.title.trim().toLowerCase() === titleKey && b.dueDay === item.day && (b.type ?? 'debit') === recType
          );
          if (!alreadyExists) {
            const monthKey = `${item.year}-${String(item.month).padStart(2, '0')}`;
            nextRecurring.push({
              id: `rec-imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: item.description,
              type: recType,
              amount: item.amount,
              dueDay: item.day,
              categoryRowId: rowId,
              active: true,
              statusByMonth: {
                [monthKey]: item.status === 'paid' ? 'paid' : 'pending',
              },
              notes: item.note,
              createdAt: nowIso,
            });
          }
        }
      }

      return {
        ...prev,
        rows: nextRows,
        entries: [...prev.entries, ...newEntries],
        recurringBills: nextRecurring,
        auditLog: [
          {
            id: `aud-${Date.now()}`,
            timestamp: nowIso,
            action: 'Importação de Planilha',
            actor: 'Titular',
            detail: `${newEntries.length} lançamento(s) importado(s) via CSV/Excel.`,
            securityProtocol: 'Cofre Privado CPF',
            status: 'success' as const,
            eventType: 'transaction' as const,
          },
          ...prev.auditLog,
        ],
      };
    });
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
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#090D16] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'settings') setSettingsSubTab('monitoring');
        }}
        alertCount={alerts.length}
        connectedAccountsCount={state.accounts.length}
        creditCardsCount={(state.creditCards ?? []).length}
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

        <main className="flex-1 min-w-0 overflow-x-hidden px-3.5 pt-4 sm:px-6 sm:pt-6 pb-safe-main max-w-[1600px] w-full mx-auto">
          <AnimatePresence initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0.4, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
            >
              {activeTab === 'matrix' && (
                <MatrixGridView
                  rows={state.rows}
                  entries={state.entries}
                  accounts={state.accounts}
                  creditCards={state.creditCards ?? []}
                  cardPurchases={state.cardPurchases ?? []}
                  paidCardInvoices={state.paidCardInvoices ?? {}}
                  goals={state.goals}
                  recurringBills={state.recurringBills ?? []}
                  totals={totals}
                  alerts={alerts}
                  settings={state.settings}
                  onSelectCell={(row, month) => setSelectedCell({ rowId: row.id, month })}
                  onUpdateSettings={updateSettings}
                  onUpdateRow={handleUpdateRow}
                  onAddRow={handleAddRow}
                  onDeleteRow={handleDeleteRow}
                  onMoveRow={handleMoveRow}
                  onToggleHideRow={handleToggleHideRow}
                  onAddRecurringBill={handleAddRecurringBill}
                  onUpdateRecurringBill={handleUpdateRecurringBill}
                  onDeleteRecurringBill={handleDeleteRecurringBill}
                  onOpenGoalSettings={() => {
                    setSettingsSubTab('goals');
                    setActiveTab('settings');
                  }}
                  onOpenAccountsHub={() => setActiveTab('accounts')}
                  onOpenCardsHub={() => setActiveTab('cards')}
                  onQuickEntry={(flowType) => {
                    setNewEntryVoiceAutoStart(false);
                    setNewEntryFlowType(flowType);
                    setNewEntryModalOpen(true);
                  }}
                  onQuickVoiceEntry={() => {
                    setNewEntryFlowType(undefined);
                    setNewEntryVoiceAutoStart(true);
                    setNewEntryModalOpen(true);
                  }}
                  onDuplicateEntryById={handleDuplicateEntryById}
                  onQuickCardPurchase={() => {
                    setActiveTab('cards');
                    setCardPurchaseTrigger((n) => n + 1);
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
                  onUpdateSettings={updateSettings}
                />
              )}

              {activeTab === 'cards' && (
                <CreditCardsView
                  cards={state.creditCards ?? []}
                  purchases={state.cardPurchases ?? []}
                  paidCardInvoices={state.paidCardInvoices ?? {}}
                  settings={state.settings}
                  openNewPurchaseTrigger={cardPurchaseTrigger}
                  onUpdateSettings={updateSettings}
                  onAddCard={handleAddCard}
                  onUpdateCard={handleUpdateCard}
                  onDeleteCard={handleDeleteCard}
                  onAddPurchase={handleAddCardPurchase}
                  onUpdatePurchase={handleUpdateCardPurchase}
                  onDeletePurchase={handleDeleteCardPurchase}
                  onToggleInvoicePaid={handleToggleCardInvoicePaid}
                />
              )}

              {activeTab === 'accounts' && (
                <AccountsSecurityView
                  accounts={state.accounts}
                  auditLog={state.auditLog}
                  settings={state.settings}
                  onAddAccount={handleAddAccount}
                  onUpdateAccountBalance={handleUpdateAccountBalance}
                  onTogglePauseAccount={handleTogglePauseAccount}
                  onDisconnectAccount={handleDisconnectAccount}
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
                  totals={totals}
                  language={state.settings.language}
                  onConfirmImport={handleConfirmSpreadsheetImport}
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
                  onDeleteRow={handleDeleteRow}
                  onMoveRow={handleMoveRow}
                  onAddGoal={handleAddGoal}
                  onUpdateGoal={handleUpdateGoal}
                  onDeleteGoal={handleDeleteGoal}
                  onLoadDemo2026Data={handleLoadDemo2026Data}
                  onClearOperationalData={handleClearOperationalData}
                  onImportBackup={handleImportBackup}
                  onProfileUpdated={(updatedProfile) => {
                    saveCadastralDraft({
                      fullName: updatedProfile.fullName,
                      birthDate: updatedProfile.birthDate,
                      email: updatedProfile.email,
                      phone: updatedProfile.phone,
                      username: updatedProfile.username,
                      kycDocumentType: updatedProfile.kycDocumentType,
                      kycDocumentLast4: updatedProfile.kycDocumentLast4,
                    });
                    setAuthSession((prev) =>
                      prev ? { ...prev, profile: updatedProfile } : prev
                    );
                  }}
                  onBiometricUpdated={(updatedBio) =>
                    setAuthSession((prev) =>
                      prev ? { ...prev, biometric: updatedBio } : prev
                    )
                  }
                  onTestReinstallRecovery={handleTestReinstallRecovery}
                  autoBackupStatus={autoBackupStatus}
                  onRunManualBackupNow={handleRunManualBackupNow}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Quick Nav (4 core actions for < 2 minute daily workflow) */}
      <nav
        aria-label="Navegação rápida mobile"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#0D1320]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/[0.08] grid grid-cols-4 px-2 pt-1.5 pb-safe-nav"
      >
        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 min-w-0 rounded-lg text-[10px] font-medium ${
            activeTab === 'matrix'
              ? 'text-blue-600 dark:text-blue-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <TableProperties className="h-4 w-4 shrink-0" />
          <span className="truncate max-w-full">Painel</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setNewEntryFlowType('expense');
            setNewEntryModalOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-0.5 py-1 min-w-0 rounded-lg text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
        >
          <PlusCircle className="h-4 w-4 shrink-0" />
          <span className="truncate max-w-full">+ / − Rápido</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cards')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 min-w-0 rounded-lg text-[10px] font-medium ${
            activeTab === 'cards'
              ? 'text-blue-600 dark:text-blue-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <CreditCard className="h-4 w-4 shrink-0" />
          <span className="truncate max-w-full">Cartões</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 min-w-0 rounded-lg text-[10px] font-medium ${
            activeTab === 'settings'
              ? 'text-blue-600 dark:text-blue-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <SettingsIcon className="h-4 w-4 shrink-0" />
          <span className="truncate max-w-full">Ajustes</span>
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
        autoStartVoice={newEntryVoiceAutoStart}
        language={state.settings.language}
        onClose={() => {
          setNewEntryModalOpen(false);
          setNewEntryVoiceAutoStart(false);
        }}
        onAddEntry={handleAddEntry}
        onAddRow={handleAddRow}
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

      {undoToast && (
        <div
          role="status"
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-[#1A2234] text-white border border-white/15 shadow-2xl text-xs max-w-[92vw]"
        >
          <span className="truncate">{undoToast.label}</span>
          <button
            type="button"
            onClick={() => {
              undoToast.restore();
              setUndoToast(null);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#C9A86A] text-[#090D16] font-semibold hover:opacity-90 shrink-0"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Desfazer</span>
          </button>
          <button
            type="button"
            onClick={() => setUndoToast(null)}
            className="p-1 rounded text-slate-400 hover:text-white shrink-0"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <OfflineIndicator language={state.settings.language} />
    </div>
  );
}
