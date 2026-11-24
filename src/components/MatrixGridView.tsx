import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Search,
  Plus,
  ArrowUp,
  ArrowDown,
  EyeOff,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  CreditCard,
  Landmark,
  FileDown,
  Target,
  Calendar,
} from 'lucide-react';
import {
  AlertItem,
  AppSettings,
  BankAccount,
  BlockType,
  CategoryRow,
  MatrixTotals,
  RecurringBill,
  SavingsGoal,
  TransactionEntry,
} from '../types/finance';
import {
  BackupReminderBanner,
  DailyControlHub,
  MonthComparisonStrip,
} from './DailyControlWidgets';
import {
  computeGoalProgress,
  computeMonthSpotlight,
  formatBRL,
  formatCompactDay,
} from '../utils/financeEngine';
import { evaluateAccountHealth } from '../utils/openFinance';
import {
  getMonthNamesFull,
  getMonthNamesShort,
  getTranslations,
  translateGoalStatus,
  translatePaymentMethod,
} from '../utils/i18n';

interface MatrixGridViewProps {
  rows: CategoryRow[];
  entries: TransactionEntry[];
  accounts: BankAccount[];
  goals: SavingsGoal[];
  recurringBills: RecurringBill[];
  totals: MatrixTotals;
  alerts: AlertItem[];
  settings: AppSettings;
  backupReminderVisible: boolean;
  isOfflineVault: boolean;
  lastBackupAt: string | null;
  onSelectCell: (row: CategoryRow, month: number) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateRow: (rowId: string, patch: Partial<CategoryRow>) => void;
  onAddRow: (row: Omit<CategoryRow, 'id' | 'order'>) => void;
  onMoveRow: (rowId: string, direction: 'up' | 'down') => void;
  onToggleHideRow: (rowId: string) => void;
  onAddRecurringBill: (bill: Omit<RecurringBill, 'id' | 'createdAt'>) => void;
  onUpdateRecurringBill: (id: string, patch: Partial<RecurringBill>) => void;
  onDeleteRecurringBill: (id: string) => void;
  onExportPDF: () => void;
  onExportJSON: () => void;
  onDismissBackupReminder: () => void;
  onOpenGoalSettings: () => void;
  onOpenAccountsHub: () => void;
  onQuickEntry: (flowType: 'income' | 'expense') => void;
}

export const MatrixGridView: React.FC<MatrixGridViewProps> = ({
  rows,
  entries,
  accounts,
  goals,
  recurringBills,
  totals,
  alerts,
  settings,
  backupReminderVisible,
  isOfflineVault,
  lastBackupAt,
  onSelectCell,
  onUpdateSettings,
  onUpdateRow,
  onAddRow,
  onMoveRow,
  onToggleHideRow,
  onAddRecurringBill,
  onUpdateRecurringBill,
  onDeleteRecurringBill,
  onExportPDF,
  onExportJSON,
  onDismissBackupReminder,
  onOpenGoalSettings,
  onOpenAccountsHub,
  onQuickEntry,
}) => {
  const [search, setSearch] = useState('');
  const [feedFilter, setFeedFilter] = useState<'all' | 'credit' | 'debit' | 'pix' | 'income'>('all');
  const [feedSearch, setFeedSearch] = useState('');
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<BlockType, boolean>>({
    income: false,
    fixed: false,
    variable: false,
    savings: false,
  });
  const [showNewRowForm, setShowNewRowForm] = useState(false);
  const [showMobileMatrix, setShowMobileMatrix] = useState(false);
  const [newRowBlock, setNewRowBlock] = useState<BlockType>('variable');
  const [newRowName, setNewRowName] = useState('');
  const [newRowDay, setNewRowDay] = useState('');
  const [newRowLimit, setNewRowLimit] = useState('');

  const { privacyMode, showZeroMonths, activeYear, language } = settings;
  const t = getTranslations(language);
  const monthNamesFull = getMonthNamesFull(language);
  const monthNamesShort = getMonthNamesShort(language);
  const focusMonth = Math.min(
    11,
    Math.max(0, Number.isFinite(settings.focusMonth) ? Math.trunc(settings.focusMonth) : 10)
  );

  const spotlight = useMemo(
    () => computeMonthSpotlight(rows, entries, accounts, totals, activeYear, focusMonth),
    [rows, entries, accounts, totals, activeYear, focusMonth]
  );

  const goalProgressList = useMemo(
    () => goals.map((g) => computeGoalProgress(g, totals, activeYear)),
    [goals, totals, activeYear]
  );

  const openFinanceAttentionAccounts = useMemo(
    () => accounts.filter((a) => evaluateAccountHealth(a).needsAction),
    [accounts]
  );

  const filteredFeed = useMemo(() => {
    return spotlight.transactions.filter((tx) => {
      if (feedFilter === 'income' && tx.block !== 'income') return false;
      if (feedFilter === 'credit' && (tx.block === 'income' || tx.paymentMethod !== 'credit')) return false;
      if (feedFilter === 'debit' && (tx.block === 'income' || tx.paymentMethod !== 'debit')) return false;
      if (feedFilter === 'pix' && (tx.block === 'income' || tx.paymentMethod !== 'pix')) return false;
      if (feedSearch.trim()) {
        const q = feedSearch.toLowerCase();
        return (
          tx.merchant.toLowerCase().includes(q) ||
          tx.categoryName.toLowerCase().includes(q) ||
          tx.accountLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [spotlight.transactions, feedFilter, feedSearch]);

  const rawMethodTotal =
    spotlight.creditSpent + spotlight.debitSpent + spotlight.pixSpent + spotlight.otherSpent;
  const totalByMethod = rawMethodTotal || 1;
  const creditPct = rawMethodTotal === 0 ? 0 : Math.round((spotlight.creditSpent / totalByMethod) * 100);
  const debitPct = rawMethodTotal === 0 ? 0 : Math.round((spotlight.debitSpent / totalByMethod) * 100);
  const pixPct = rawMethodTotal === 0 ? 0 : Math.max(0, 100 - creditPct - debitPct);

  const visibleMonths = useMemo(() => {
    if (showZeroMonths) return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(
      (m) =>
        totals.incomeMonthly[m] !== 0 ||
        totals.totalExpenseMonthly[m] !== 0 ||
        totals.savingsMonthly[m] !== 0
    );
  }, [showZeroMonths, totals]);

  const alertMap = useMemo(() => {
    const map = new Map<string, AlertItem>();
    alerts.forEach((a) => {
      if (a.rowId && a.month !== undefined) {
        map.set(`${a.rowId}-${a.month}`, a);
      }
    });
    return map;
  }, [alerts]);

  const entryCountMap = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e) => {
      if (e.year !== activeYear) return;
      const key = `${e.rowId}-${e.month}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [entries, activeYear]);

  const filterRow = (row: CategoryRow) => {
    if (row.hidden) return false;
    if (!search.trim()) return true;
    return row.name.toLowerCase().includes(search.trim().toLowerCase());
  };

  const incomeRows = rows.filter((r) => r.block === 'income' && filterRow(r)).sort((a, b) => a.order - b.order);
  const fixedRows = rows.filter((r) => r.block === 'fixed' && filterRow(r)).sort((a, b) => a.order - b.order);
  const variableRows = rows.filter((r) => r.block === 'variable' && filterRow(r)).sort((a, b) => a.order - b.order);
  const savingsRows = rows.filter((r) => r.block === 'savings' && filterRow(r)).sort((a, b) => a.order - b.order);

  const toggleBlock = (block: BlockType) => {
    setCollapsedBlocks((prev) => ({ ...prev, [block]: !prev[block] }));
  };

  const handleCreateRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRowName.trim()) return;
    const refDayNum = parseInt(newRowDay, 10);
    const limitNum = parseFloat(newRowLimit.replace(',', '.'));
    onAddRow({
      block: newRowBlock,
      name: newRowName.trim().toUpperCase(),
      refDay: Number.isFinite(refDayNum) && refDayNum >= 1 && refDayNum <= 31 ? refDayNum : undefined,
      alertLimit: Number.isFinite(limitNum) && limitNum > 0 ? limitNum : undefined,
    });
    setNewRowName('');
    setNewRowDay('');
    setNewRowLimit('');
    setShowNewRowForm(false);
  };

  const renderCategoryRows = (blockRows: CategoryRow[], blockType: BlockType) => {
    if (collapsedBlocks[blockType]) return null;
    return blockRows.map((row) => {
      const monthly = totals.rowMonthly[row.id] ?? Array(12).fill(0);
      const annual = totals.rowAnnual[row.id] ?? 0;

      return (
        <tr
          key={row.id}
          className="group border-b border-slate-100 dark:border-white/[0.05] hover:bg-slate-50/90 dark:hover:bg-[#1A2234]/60 transition-colors"
        >
          <td className="sticky left-0 z-10 bg-white dark:bg-[#111827] group-hover:bg-slate-50 dark:group-hover:bg-[#1A2234] border-r border-slate-200 dark:border-white/[0.08] px-3.5 py-2.5 min-w-[220px] max-w-[250px]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {row.name}
                  </span>
                  {row.refDay && (
                    <span className="font-mono text-[10px] text-[#A68342] dark:text-[#C9A86A] tabular-nums shrink-0">
                      {formatCompactDay(row.refDay)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={() => onMoveRow(row.id, 'up')}
                  className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  title={t.matrix.moveUp}
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveRow(row.id, 'down')}
                  className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  title={t.matrix.moveDown}
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleHideRow(row.id)}
                  className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  title={t.matrix.hideRow}
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              </div>
            </div>
          </td>

          {visibleMonths.map((m) => {
            const val = monthly[m] ?? 0;
            const cellAlert = alertMap.get(`${row.id}-${m}`);
            const count = entryCountMap.get(`${row.id}-${m}`) ?? 0;
            const isFocus = m === focusMonth;

            return (
              <td
                key={m}
                onClick={() => onSelectCell(row, m)}
                className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums cursor-pointer transition-colors border-r border-slate-100/80 dark:border-white/[0.03] min-w-[108px] ${
                  cellAlert?.severity === 'critical'
                    ? 'bg-red-50/70 dark:bg-red-950/20 text-red-700 dark:text-red-300'
                    : cellAlert?.severity === 'warning'
                    ? 'bg-amber-50/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300'
                    : cellAlert?.severity === 'info'
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
                    : isFocus
                    ? 'bg-[#C9A86A]/[0.06] text-slate-900 dark:text-slate-100 hover:bg-[#C9A86A]/15'
                    : val === 0
                    ? 'text-slate-400 dark:text-slate-600 hover:bg-slate-100/80 dark:hover:bg-white/[0.04]'
                    : 'text-slate-800 dark:text-slate-200 hover:bg-[#C9A86A]/10'
                }`}
                title={
                  cellAlert
                    ? `${cellAlert.title} — ${t.matrix.inspectCell}`
                    : `${row.name} · ${monthNamesFull[m]}`
                }
              >
                <div className="flex items-center justify-end gap-1.5">
                  {cellAlert && <AlertTriangle className="h-3 w-3 shrink-0 opacity-80" />}
                  <span>{formatBRL(val, privacyMode)}</span>
                </div>
                {count > 1 && !privacyMode && (
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">
                    {count} {t.matrix.entriesShort}
                  </div>
                )}
              </td>
            );
          })}

          <td className="sticky right-0 z-10 bg-slate-50/95 dark:bg-[#0D1320]/95 group-hover:bg-slate-100 dark:group-hover:bg-[#1A2234] border-l border-slate-200 dark:border-white/[0.08] px-3.5 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100 min-w-[132px]">
            {formatBRL(annual, privacyMode)}
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* ==================== 0A. ACESSO RÁPIDO 2 TOQUES (ENTRADA / DESPESA) ==================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span className="block text-[11px]">Saldo / Resultado ({monthNamesShort[focusMonth]})</span>
            <strong
              className={`text-base sm:text-lg font-mono tabular-nums ${
                spotlight.result >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatBRL(spotlight.result, privacyMode, true)}
            </strong>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onQuickEntry('income')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Entrada</span>
          </button>
          <button
            type="button"
            onClick={() => onQuickEntry('expense')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 transition-opacity"
          >
            <span>- Despesa</span>
          </button>
        </div>
      </div>

      {/* ==================== 0. LEMBRETE DISCRETO DE BACKUP JSON ==================== */}
      <BackupReminderBanner
        visible={backupReminderVisible}
        isOfflineVault={isOfflineVault}
        lastBackupAt={lastBackupAt}
        language={language}
        onExportJSON={onExportJSON}
        onDismiss={onDismissBackupReminder}
      />

      {/* ==================== 1. PRIMARY FOCAL SPOTLIGHT: MÊS EM QUESTÃO & OPEN FINANCE ==================== */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#C9A86A]/30 overflow-hidden">
        {/* Top Spotlight Header with Month Selector */}
        <div className="px-5 py-4 bg-slate-900 dark:bg-[#0D1320] text-white border-b border-slate-800 dark:border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1A2234] border border-[#C9A86A]/40 text-[#C9A86A] shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#C9A86A] font-semibold">
                {t.matrix.monthInFocus}
              </div>
              <h1 className="text-lg sm:text-xl font-semibold text-white">
                {monthNamesFull[focusMonth]} {activeYear}
              </h1>
            </div>
          </div>

          {/* Month Selector Pills */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#1A2234]/80 border border-white/[0.08]">
            {monthNamesShort.map((mName, idx) => (
              <button
                key={mName}
                type="button"
                onClick={() => onUpdateSettings({ focusMonth: idx })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors ${
                  focusMonth === idx
                    ? 'bg-[#C9A86A] text-[#090D16] font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {mName}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Primary KPIs of the Month in Question */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/[0.07] border-b border-slate-200 dark:border-white/[0.08]">
          <div className="p-5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t.matrix.incomeIn} {monthNamesShort[focusMonth]}
            </div>
            <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatBRL(spotlight.income, privacyMode)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {t.matrix.incomeSub}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t.matrix.expensesIn} {monthNamesShort[focusMonth]}
            </div>
            <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatBRL(spotlight.totalExpense, privacyMode)}
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {t.matrix.fixedShort} {formatBRL(spotlight.fixedExpense, privacyMode)} · {t.matrix.varShort} {formatBRL(spotlight.variableExpense, privacyMode)}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t.matrix.resultOf} {monthNamesShort[focusMonth]}
            </div>
            <div
              className={`mt-1.5 text-2xl font-semibold font-mono tabular-nums ${
                spotlight.result >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatBRL(spotlight.result, privacyMode, true)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {spotlight.result >= 0 ? t.matrix.surplusSub : t.matrix.deficitSub}
            </div>
          </div>

          <div className="p-5 bg-slate-50/70 dark:bg-[#151D2E]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t.matrix.cardInvoices} ({monthNamesShort[focusMonth]})
              </span>
              <CreditCard className="h-4 w-4 text-[#C9A86A]" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-[#A68342] dark:text-[#E5C88F]">
              {formatBRL(spotlight.totalCardInvoices, privacyMode)}
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              {spotlight.cardInvoices
                .map((c) => `${c.name.replace('CARTÃO ', '')}: ${formatBRL(c.amount, privacyMode)}`)
                .join(' · ')}
            </div>
          </div>
        </div>

        {/* Connector Health Banner (Expired Consent / Sync Error) */}
        {openFinanceAttentionAccounts.length > 0 && (
          <div className="px-5 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Open Finance:</strong> {openFinanceAttentionAccounts.length} {t.matrix.attentionBanner} (
                {openFinanceAttentionAccounts.map((a) => a.institution).join(', ')})
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenAccountsHub}
              className="px-3 py-1 rounded-md text-[11px] font-semibold bg-amber-600 text-white hover:bg-amber-500 whitespace-nowrap"
            >
              {t.matrix.checkConnectors}
            </button>
          </div>
        )}

        {/* Open Finance Direct Monitoring: Crédito vs Débito + À Vista vs Parcelado + Faturas + Onde Foi Gasto */}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Modalidades (Crédito vs Débito vs Pix) + Detalhamento das Faturas */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-[#C9A86A]" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.matrix.openFinanceTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={onOpenAccountsHub}
                className="text-xs font-medium text-[#A68342] dark:text-[#E5C88F] hover:underline"
              >
                {accounts.length}/5 {t.matrix.accountsRatio}
              </button>
            </div>

            {/* Credit vs Debit vs Pix + À Vista vs Parcelado */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] space-y-3">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.matrix.paymentDist} ({monthNamesShort[focusMonth]})
              </div>

              <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden flex">
                <div
                  style={{ width: `${creditPct}%` }}
                  className="bg-[#C9A86A] transition-all"
                  title={`${t.matrix.credit}: ${creditPct}%`}
                />
                <div
                  style={{ width: `${debitPct}%` }}
                  className="bg-sky-500 transition-all"
                  title={`${t.matrix.debit}: ${debitPct}%`}
                />
                <div
                  style={{ width: `${pixPct}%` }}
                  className="bg-emerald-500 transition-all"
                  title={`${t.matrix.pix}: ${pixPct}%`}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums pt-1">
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                    {t.matrix.credit} ({creditPct}%)
                  </div>
                  <div className="font-semibold text-[#A68342] dark:text-[#E5C88F]">
                    {formatBRL(spotlight.creditSpent, privacyMode)}
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                    {t.matrix.debit} ({debitPct}%)
                  </div>
                  <div className="font-semibold text-sky-600 dark:text-sky-400">
                    {formatBRL(spotlight.debitSpent, privacyMode)}
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                    {t.matrix.pix} ({pixPct}%)
                  </div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatBRL(spotlight.pixSpent + spotlight.otherSpent, privacyMode)}
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-200/70 dark:border-white/[0.06] grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
                <div>
                  <span className="font-sans text-slate-500 dark:text-slate-400 block">
                    {t.matrix.spotMonth}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formatBRL(spotlight.spotSpent, privacyMode)}
                  </span>
                </div>
                <div>
                  <span className="font-sans text-slate-500 dark:text-slate-400 block">
                    {t.matrix.installmentsMonth} ({t.matrix.remShort} {formatBRL(spotlight.installmentRemainingTotal, privacyMode)})
                  </span>
                  <span className="font-semibold text-[#A68342] dark:text-[#E5C88F]">
                    {formatBRL(spotlight.installmentSpent, privacyMode)}
                  </span>
                </div>
              </div>

              {spotlight.excludedTransfersCount > 0 && (
                <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.06] text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
                  <span>
                    {spotlight.excludedTransfersCount} {t.matrix.dedupLabel}
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatBRL(spotlight.excludedTransfersTotal, privacyMode)}
                  </span>
                </div>
              )}
            </div>

            {/* Credit Card Invoices */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t.matrix.invoicesIn} {monthNamesFull[focusMonth]}
              </div>
              {spotlight.cardInvoices.map((inv) => {
                const targetRow = rows.find((r) => r.id === inv.id);
                return (
                  <div
                    key={inv.id}
                    onClick={() => targetRow && onSelectCell(targetRow, focusMonth)}
                    className={`p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                      inv.needsReconnect
                        ? 'border-amber-400/70 dark:border-amber-500/40'
                        : 'border-slate-200 dark:border-white/[0.07] hover:border-[#C9A86A]/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                        <span>{inv.name}</span>
                        {inv.closingDay && (
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {t.matrix.closingShort} {formatCompactDay(inv.closingDay)}
                          </span>
                        )}
                        {inv.dueDay && (
                          <span className="font-mono text-[10px] text-[#A68342] dark:text-[#C9A86A]">
                            {t.matrix.dueShort} {formatCompactDay(inv.dueDay)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {inv.accountLabel} · {inv.status}
                      </div>
                      {inv.availableLimit !== undefined && inv.creditLimit !== undefined && (
                        <div className="mt-0.5 text-[10px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {t.matrix.availLimit} {formatBRL(inv.availableLimit, privacyMode)} {t.matrix.ofWord} {formatBRL(inv.creditLimit, privacyMode)}
                        </div>
                      )}
                    </div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-white shrink-0">
                      {formatBRL(inv.amount, privacyMode)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Extrato Direto das Contas (Onde foi gasto, Valor, Crédito ou Débito) */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.matrix.directFeedTitle} ({monthNamesShort[focusMonth]})
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t.matrix.directFeedSub}
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
                {(
                  [
                    { id: 'all', label: t.matrix.filterAll },
                    { id: 'credit', label: t.matrix.credit },
                    { id: 'debit', label: t.matrix.debit },
                    { id: 'pix', label: t.matrix.pix },
                    { id: 'income', label: t.matrix.filterIncome },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFeedFilter(f.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      feedFilter === f.id
                        ? 'bg-white dark:bg-[#1A2234] text-slate-900 dark:text-[#E5C88F] shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-2.5 relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={feedSearch}
                onChange={(e) => setFeedSearch(e.target.value)}
                placeholder={t.matrix.searchFeedPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex-1 rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden max-h-[300px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.05]">
              {filteredFeed.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t.matrix.noFeedMoves} {monthNamesFull[focusMonth]}.
                </div>
              ) : (
                filteredFeed.map((tx) => {
                  const targetRow = rows.find((r) => r.id === tx.rowId);
                  const isIncome = tx.block === 'income';
                  return (
                    <div
                      key={tx.id}
                      onClick={() => targetRow && onSelectCell(targetRow, focusMonth)}
                      className="px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-[#1A2234]/60 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                          D/{String(tx.day).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                            <span className="truncate">{tx.merchant}</span>
                            {tx.isInstallment && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#C9A86A]/15 text-[#8C6A2E] dark:text-[#E5C88F]">
                                {tx.installmentLabel} · {t.matrix.remShort}{' '}
                                {formatBRL(tx.installmentRemainingAmount, privacyMode)}
                              </span>
                            )}
                            {tx.isDeduplicated && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                {t.matrix.noDuplicateTag}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {tx.categoryName} · {tx.accountLabel} ·{' '}
                            <span
                              className={
                                tx.paymentMethod === 'credit'
                                  ? 'text-[#A68342] dark:text-[#E5C88F] font-medium'
                                  : tx.paymentMethod === 'debit'
                                  ? 'text-sky-600 dark:text-sky-400 font-medium'
                                  : 'text-emerald-600 dark:text-emerald-400 font-medium'
                              }
                            >
                              {translatePaymentMethod(tx.paymentMethod, language)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`font-mono font-semibold tabular-nums shrink-0 ${
                          tx.isDeduplicated
                            ? 'text-slate-400 dark:text-slate-500 line-through'
                            : isIncome
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : tx.block === 'savings'
                            ? 'text-[#A68342] dark:text-[#E5C88F]'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {formatBRL(isIncome ? tx.amount : -tx.amount, privacyMode, isIncome)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== 1B. RESUMO MENSAL COMPARATIVO (OCULTO NO MOBILE COMPACTO) ==================== */}
      <div className="hidden sm:block">
        <MonthComparisonStrip
          rows={rows}
          entries={entries}
          totals={totals}
          activeYear={activeYear}
          focusMonth={focusMonth}
          privacyMode={privacyMode}
          language={language}
        />
      </div>

      {/* ==================== 1C. CENTRAL DE CONTROLE DIÁRIO (RECORRENTES, LIMITES, PARCELAS & BUSCA) ==================== */}
      <DailyControlHub
        rows={rows}
        entries={entries}
        accounts={accounts}
        recurringBills={recurringBills}
        totals={totals}
        activeYear={activeYear}
        focusMonth={focusMonth}
        privacyMode={privacyMode}
        language={language}
        onAddRecurringBill={onAddRecurringBill}
        onUpdateRecurringBill={onUpdateRecurringBill}
        onDeleteRecurringBill={onDeleteRecurringBill}
        onUpdateRow={onUpdateRow}
        onSelectCell={onSelectCell}
      />

      {/* ==================== 2. MONITORAMENTO DE METAS DE ECONOMIA ==================== */}
      <section className="p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[#C9A86A]" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.matrix.goalsTitle} ({activeYear})
            </h2>
          </div>
          <button
            type="button"
            onClick={onOpenGoalSettings}
            className="text-xs font-medium text-[#A68342] dark:text-[#E5C88F] hover:underline"
          >
            {t.matrix.configureGoals}
          </button>
        </div>

        {goalProgressList.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.matrix.noGoalsDefined}{' '}
            <button
              type="button"
              onClick={onOpenGoalSettings}
              className="underline text-[#A68342] dark:text-[#E5C88F]"
            >
              {t.matrix.addFirstGoal}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goalProgressList.map(({ goal, currentAmount, pct, remaining, status }) => (
              <div
                key={goal.id}
                className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06] space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {goal.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t.matrix.deadlinePrefix}{' '}
                      {monthNamesShort[Math.min(11, Math.max(0, goal.deadlineMonth ?? 11))]}/
                      {goal.deadlineYear} ·{' '}
                      {goal.trackingMode === 'savings'
                        ? t.matrix.tracksSavings
                        : goal.trackingMode === 'result'
                        ? t.matrix.tracksResult
                        : t.matrix.tracksCombined}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded border shrink-0 ${
                      status === 'achieved'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                        : status === 'ontrack'
                        ? 'bg-[#C9A86A]/15 text-[#8C6A2E] dark:text-[#E5C88F] border-[#C9A86A]/30'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {translateGoalStatus(status, language)} ({pct}%)
                  </span>
                </div>

                <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full transition-all duration-300 ${
                      status === 'achieved' ? 'bg-emerald-500' : 'bg-[#C9A86A]'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <span>
                    {t.matrix.currentLabel} <strong>{formatBRL(currentAmount, privacyMode)}</strong>
                  </span>
                  <span>
                    {remaining > 0
                      ? `${t.matrix.missingPrefix} ${formatBRL(remaining, privacyMode)}`
                      : `${formatBRL(goal.targetAmount, privacyMode)} ${t.matrix.goalExceeded}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ==================== 3. CONSOLIDADO ANUAL (KPIs) ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.matrix.annualIncome} ({activeYear})
          </div>
          <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatBRL(totals.incomeAnnual, privacyMode)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.matrix.annualExpense} ({activeYear})
          </div>
          <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatBRL(totals.totalExpenseAnnual, privacyMode)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.matrix.annualNetResult}
          </div>
          <div
            className={`mt-1.5 text-xl font-semibold font-mono tabular-nums ${
              totals.resultAnnual >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatBRL(totals.resultAnnual, privacyMode, true)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.matrix.annualSaved}
          </div>
          <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-[#A68342] dark:text-[#E5C88F]">
            {formatBRL(totals.savingsAnnual, privacyMode)}
          </div>
        </div>
      </div>

      {/* Alert Banner */}
      {settings.notificationsEnabled && alerts.length > 0 && (
        <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.matrix.autoDetectedPrefix} {alerts.length} {t.matrix.autoDetectedSuffix}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {t.matrix.highlightPrefix} {alerts[0].title} — {alerts[0].description}
              </div>
            </div>
          </div>
          {alerts[0].rowId && alerts[0].month !== undefined && (
            <button
              type="button"
              onClick={() => {
                const targetRow = rows.find((r) => r.id === alerts[0].rowId);
                if (targetRow && alerts[0].month !== undefined) {
                  onSelectCell(targetRow, alerts[0].month);
                }
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 whitespace-nowrap shrink-0"
            >
              {t.matrix.inspectCell}
            </button>
          )}
        </div>
      )}

      {/* Workspace Controls Toolbar + Private Banking PDF Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06]">
            {[2025, 2026, 2027].map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => onUpdateSettings({ activeYear: yr })}
                className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-colors ${
                  activeYear === yr
                    ? 'bg-white dark:bg-[#1A2234] text-slate-900 dark:text-[#E5C88F] shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.matrix.filterCategoryPlaceholder}
              className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C9A86A]/40"
            />
          </div>

          <button
            type="button"
            onClick={() => onUpdateSettings({ showZeroMonths: !showZeroMonths })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
              showZeroMonths
                ? 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300'
                : 'bg-[#C9A86A]/15 border-[#C9A86A]/40 text-[#A68342] dark:text-[#E5C88F]'
            }`}
          >
            {showZeroMonths ? t.matrix.hideZeroMonths : t.matrix.showAll12Months}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onExportPDF}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{t.matrix.downloadPdf}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNewRowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-200/70 dark:hover:bg-[#232D42] transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t.matrix.addRow}</span>
          </button>
        </div>
      </div>

      {/* Inline Add Row Panel */}
      {showNewRowForm && (
        <form
          onSubmit={handleCreateRow}
          className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-[#C9A86A]/40 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t.matrix.blockLabel}
            </label>
            <select
              value={newRowBlock}
              onChange={(e) => setNewRowBlock(e.target.value as BlockType)}
              className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            >
              <option value="income">{t.settings.grid.blockIncome}</option>
              <option value="fixed">{t.settings.grid.blockFixed}</option>
              <option value="variable">{t.settings.grid.blockVariable}</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t.matrix.rowNameLabel}
            </label>
            <input
              type="text"
              required
              value={newRowName}
              onChange={(e) => setNewRowName(e.target.value)}
              placeholder={t.matrix.rowNamePlaceholder}
              className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t.matrix.refDayOpt}
            </label>
            <input
              type="number"
              min="1"
              max="31"
              value={newRowDay}
              onChange={(e) => setNewRowDay(e.target.value)}
              placeholder="15"
              className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
            >
              {t.matrix.createRow}
            </button>
            <button
              type="button"
              onClick={() => setShowNewRowForm(false)}
              className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              {t.matrix.cancel}
            </button>
          </div>
        </form>
      )}

      {/* Mobile Toggle for Full 12-Month Matrix Table */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setShowMobileMatrix((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-slate-800 dark:text-slate-100"
        >
          <span>{showMobileMatrix ? 'Ocultar Grade Anual Completa (12 meses)' : 'Expandir Grade Anual Completa (12 meses)'}</span>
          {showMobileMatrix ? <ChevronDown className="h-4 w-4 text-[#C9A86A]" /> : <ChevronRight className="h-4 w-4 text-[#C9A86A]" />}
        </button>
      </div>

      {/* Main Matrix Spreadsheet */}
      <div className={`${showMobileMatrix ? 'block' : 'hidden sm:block'} rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#0D1320] border-b border-slate-200 dark:border-white/[0.08]">
                <th className="sticky left-0 z-20 bg-slate-50 dark:bg-[#0D1320] border-r border-slate-200 dark:border-white/[0.08] px-3.5 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 min-w-[220px]">
                  {t.matrix.colCategoryRef}
                </th>
                {visibleMonths.map((m) => (
                  <th
                    key={m}
                    onClick={() => onUpdateSettings({ focusMonth: m })}
                    className={`px-3 py-3 text-right text-xs font-semibold border-r border-slate-200/60 dark:border-white/[0.04] min-w-[108px] cursor-pointer transition-colors ${
                      m === focusMonth
                        ? 'bg-[#C9A86A]/15 text-[#8C6A2E] dark:text-[#E5C88F]'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                    title={monthNamesFull[m]}
                  >
                    {monthNamesShort[m]}
                  </th>
                ))}
                <th className="sticky right-0 z-20 bg-slate-100 dark:bg-[#1A2234] border-l border-slate-200 dark:border-white/[0.08] px-3.5 py-3 text-right text-xs font-semibold text-slate-900 dark:text-[#E5C88F] min-w-[132px]">
                  {t.matrix.colConsolidated} {activeYear}
                </th>
              </tr>
            </thead>

            <tbody>
              {/* BLOCO 1: RECEITAS */}
              <tr
                onClick={() => toggleBlock('income')}
                className="bg-emerald-50/50 dark:bg-emerald-950/20 border-b border-slate-200 dark:border-white/[0.08] cursor-pointer"
              >
                <td className="sticky left-0 z-10 bg-emerald-50/90 dark:bg-[#0F1F1C] border-r border-slate-200 dark:border-white/[0.08] px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <span className="inline-flex items-center gap-1.5">
                    {collapsedBlocks.income ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {t.matrix.block1Title}
                  </span>
                </td>
                <td colSpan={visibleMonths.length + 1} className="px-3 py-2 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                  {t.matrix.block1Sub}
                </td>
              </tr>
              {renderCategoryRows(incomeRows, 'income')}
              <tr className="bg-emerald-50/70 dark:bg-emerald-950/30 border-b-2 border-slate-200 dark:border-white/[0.1] font-semibold">
                <td className="sticky left-0 z-10 bg-emerald-50 dark:bg-[#10241F] border-r border-slate-200 dark:border-white/[0.08] px-3.5 py-2.5 text-xs text-emerald-900 dark:text-emerald-300">
                  {t.matrix.totalIncome}
                </td>
                {visibleMonths.map((m) => (
                  <td
                    key={m}
                    className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-emerald-800 dark:text-emerald-300 border-r border-emerald-200/40 dark:border-white/[0.04]"
                  >
                    {formatBRL(totals.incomeMonthly[m], privacyMode)}
                  </td>
                ))}
                <td className="sticky right-0 z-10 bg-emerald-100/80 dark:bg-[#122D26] border-l border-slate-200 dark:border-white/[0.08] px-3.5 py-2.5 text-right font-mono text-xs tabular-nums text-emerald-900 dark:text-emerald-200">
                  <div>{formatBRL(totals.incomeAnnual, privacyMode)}</div>
                  <div className="text-[10px] font-sans font-normal opacity-80">
                    {t.matrix.annualGainSub}
                  </div>
                </td>
              </tr>

              {/* BLOCO 2: DESPESAS FIXAS */}
              <tr
                onClick={() => toggleBlock('fixed')}
                className="bg-slate-100/70 dark:bg-[#161E2E] border-b border-slate-200 dark:border-white/[0.08] cursor-pointer"
              >
                <td className="sticky left-0 z-10 bg-slate-100 dark:bg-[#161E2E] border-r border-slate-200 dark:border-white/[0.08] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <span className="inline-flex items-center gap-1.5">
                    {collapsedBlocks.fixed ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {t.matrix.block2Title}
                  </span>
                </td>
                <td colSpan={visibleMonths.length + 1} className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {t.matrix.block2Sub}
                </td>
              </tr>
              {renderCategoryRows(fixedRows, 'fixed')}
              <tr className="bg-slate-100/80 dark:bg-[#1A2234] border-b-2 border-slate-200 dark:border-white/[0.1] font-semibold">
                <td className="sticky left-0 z-10 bg-slate-100 dark:bg-[#1A2234] border-r border-slate-200 dark:border-white/[0.08] px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100">
                  {t.matrix.totalFixed}
                </td>
                {visibleMonths.map((m) => (
                  <td
                    key={m}
                    className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-200 border-r border-slate-200/50 dark:border-white/[0.04]"
                  >
                    {formatBRL(totals.fixedMonthly[m], privacyMode)}
                  </td>
                ))}
                <td className="sticky right-0 z-10 bg-slate-200/70 dark:bg-[#1F293D] border-l border-slate-200 dark:border-white/[0.08] px-3.5 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white">
                  {formatBRL(totals.fixedAnnual, privacyMode)}
                </td>
              </tr>

              {/* BLOCO 3: DESPESAS VARIÁVEIS */}
              <tr
                onClick={() => toggleBlock('variable')}
                className="bg-slate-100/70 dark:bg-[#161E2E] border-b border-slate-200 dark:border-white/[0.08] cursor-pointer"
              >
                <td className="sticky left-0 z-10 bg-slate-100 dark:bg-[#161E2E] border-r border-slate-200 dark:border-white/[0.08] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <span className="inline-flex items-center gap-1.5">
                    {collapsedBlocks.variable ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {t.matrix.block3Title}
                  </span>
                </td>
                <td colSpan={visibleMonths.length + 1} className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {t.matrix.block3Sub}
                </td>
              </tr>
              {renderCategoryRows(variableRows, 'variable')}
              <tr className="bg-slate-100/80 dark:bg-[#1A2234] border-b-2 border-slate-200 dark:border-white/[0.1] font-semibold">
                <td className="sticky left-0 z-10 bg-slate-100 dark:bg-[#1A2234] border-r border-slate-200 dark:border-white/[0.08] px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100">
                  {t.matrix.totalVariable}
                </td>
                {visibleMonths.map((m) => (
                  <td
                    key={m}
                    className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-200 border-r border-slate-200/50 dark:border-white/[0.04]"
                  >
                    {formatBRL(totals.variableMonthly[m], privacyMode)}
                  </td>
                ))}
                <td className="sticky right-0 z-10 bg-slate-200/70 dark:bg-[#1F293D] border-l border-slate-200 dark:border-white/[0.08] px-3.5 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white">
                  {formatBRL(totals.variableAnnual, privacyMode)}
                </td>
              </tr>

              {/* BLOCO 4: CONSOLIDAÇÃO & PATRIMÔNIO */}
              <tr className="bg-slate-900 text-white dark:bg-[#090D16] border-b border-slate-700 dark:border-white/[0.1]">
                <td className="sticky left-0 z-10 bg-slate-900 dark:bg-[#090D16] border-r border-slate-700 dark:border-white/[0.08] px-3.5 py-2.5 text-xs font-semibold">
                  {t.matrix.totalExpenseRow}
                </td>
                {visibleMonths.map((m) => (
                  <td
                    key={m}
                    className="px-3 py-2.5 text-right font-mono text-xs font-semibold tabular-nums border-r border-slate-800 dark:border-white/[0.04]"
                  >
                    {formatBRL(totals.totalExpenseMonthly[m], privacyMode)}
                  </td>
                ))}
                <td className="sticky right-0 z-10 bg-slate-800 dark:bg-[#111827] border-l border-slate-700 dark:border-white/[0.1] px-3.5 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-white">
                  <div>{formatBRL(totals.totalExpenseAnnual, privacyMode)}</div>
                  <div className="text-[10px] font-sans font-normal text-slate-300">
                    {t.matrix.annualSpendSub}
                  </div>
                </td>
              </tr>

              {/* RESULTADO MENSAL */}
              <tr className="bg-slate-50 dark:bg-[#0F172A] border-b border-slate-200 dark:border-white/[0.08] font-semibold">
                <td className="sticky left-0 z-10 bg-slate-50 dark:bg-[#0F172A] border-r border-slate-200 dark:border-white/[0.08] px-3.5 py-3 text-xs text-slate-900 dark:text-slate-100">
                  {t.matrix.resultRow}
                </td>
                {visibleMonths.map((m) => {
                  const res = totals.resultMonthly[m];
                  const hasActivity = totals.incomeMonthly[m] > 0 || totals.totalExpenseMonthly[m] > 0;
                  const statusText = !hasActivity
                    ? t.matrix.neutral
                    : res > 300
                    ? t.matrix.surplus
                    : res >= 0
                    ? t.matrix.attention
                    : t.matrix.deficit;
                  const colorClass = !hasActivity
                    ? 'text-slate-400 dark:text-slate-600'
                    : res > 300
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : res >= 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400';

                  return (
                    <td
                      key={m}
                      className={`px-3 py-3 text-right font-mono text-xs tabular-nums border-r border-slate-200/60 dark:border-white/[0.04] ${colorClass}`}
                    >
                      <div>{formatBRL(res, privacyMode, hasActivity && res !== 0)}</div>
                      {hasActivity && (
                        <div className="text-[10px] font-sans font-normal opacity-85">
                          {statusText}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td
                  className={`sticky right-0 z-10 bg-slate-100 dark:bg-[#1A2234] border-l border-slate-200 dark:border-white/[0.08] px-3.5 py-3 text-right font-mono text-xs tabular-nums ${
                    totals.resultAnnual >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  <div>{formatBRL(totals.resultAnnual, privacyMode, true)}</div>
                  <div className="text-[10px] font-sans font-normal opacity-80">
                    {totals.resultAnnual >= 0 ? t.matrix.positiveBalance : t.matrix.negativeBalance}
                  </div>
                </td>
              </tr>

              {/* GUARDADO */}
              {savingsRows.map((row) => {
                const monthly = totals.rowMonthly[row.id] ?? Array(12).fill(0);
                const annual = totals.rowAnnual[row.id] ?? 0;
                return (
                  <tr
                    key={row.id}
                    className="group bg-[#C9A86A]/10 dark:bg-[#C9A86A]/[0.07] hover:bg-[#C9A86A]/15 transition-colors"
                  >
                    <td className="sticky left-0 z-10 bg-[#FAF6EE] dark:bg-[#161922] border-r border-slate-200 dark:border-white/[0.08] px-3.5 py-3 text-xs font-semibold text-[#8C6A2E] dark:text-[#E5C88F]">
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-[#C9A86A]" />
                        {row.name} ({t.matrix.reserveContribution})
                      </span>
                    </td>
                    {visibleMonths.map((m) => (
                      <td
                        key={m}
                        onClick={() => onSelectCell(row, m)}
                        className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums text-[#8C6A2E] dark:text-[#E5C88F] cursor-pointer hover:bg-[#C9A86A]/20 border-r border-[#C9A86A]/15"
                        title={monthNamesFull[m]}
                      >
                        {formatBRL(monthly[m] ?? 0, privacyMode)}
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 bg-[#F4ECDC] dark:bg-[#1E212B] border-l border-slate-200 dark:border-white/[0.08] px-3.5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-[#8C6A2E] dark:text-[#E5C88F]">
                      <div>{formatBRL(annual, privacyMode)}</div>
                      <div className="text-[10px] font-sans font-normal opacity-80">
                        {t.matrix.totalValueSub}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 bg-slate-50 dark:bg-[#0D1320] border-t border-slate-200 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>{t.matrix.footerHint}</span>
          </div>
          <span className="font-mono text-[11px] tabular-nums">
            {rows.filter((r) => !r.hidden).length} {t.matrix.activeCategories}
          </span>
        </div>
      </div>
    </div>
  );
};
