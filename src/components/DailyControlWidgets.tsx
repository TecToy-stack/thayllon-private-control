import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  Gauge,
  Minus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  AppLanguage,
  BankAccount,
  CategoryRow,
  MatrixTotals,
  RecurringBill,
  RecurringBillStatus,
  TransactionEntry,
} from '../types/finance';
import {
  computeCategoryLimitProgress,
  computeInstallmentsSummary,
  computeMonthComparison,
  formatBRL,
  getEffectiveRecurringStatus,
  getRecurringMonthKey,
} from '../utils/financeEngine';
import {
  getIntlLocale,
  getMonthNamesShort,
  getTranslations,
  translateEntryStatus,
} from '../utils/i18n';

interface BackupReminderBannerProps {
  visible: boolean;
  isOfflineVault: boolean;
  lastBackupAt: string | null;
  language: AppLanguage;
  onExportJSON: () => void;
  onDismiss: () => void;
}

export const BackupReminderBanner: React.FC<BackupReminderBannerProps> = ({
  visible,
  isOfflineVault,
  lastBackupAt,
  language,
  onExportJSON,
  onDismiss,
}) => {
  if (!visible) return null;
  const t = getTranslations(language);
  const locale = getIntlLocale(language);

  const formattedLastBackup = lastBackupAt
    ? new Date(lastBackupAt).toLocaleString(locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : t.daily.backup.neverBackedUp;

  return (
    <div
      role="status"
      className="px-4 py-3 rounded-xl bg-amber-50/70 dark:bg-[#171C28] border border-amber-300/60 dark:border-[#C9A86A]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <Download className="h-4 w-4 text-[#A68342] dark:text-[#E5C88F] shrink-0 mt-0.5 sm:mt-0" />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            {t.daily.backup.reminderTitle}
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-400">
            {isOfflineVault ? t.daily.backup.offlineHint : t.daily.backup.onlineHint} ·{' '}
            <span className="font-mono">
              {t.daily.backup.lastBackupPrefix} {formattedLastBackup}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onExportJSON}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5" />
          <span>{t.daily.backup.exportBtn}</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-white/[0.06] whitespace-nowrap"
        >
          {t.daily.backup.dismissBtn}
        </button>
      </div>
    </div>
  );
};

interface MonthComparisonStripProps {
  rows: CategoryRow[];
  entries: TransactionEntry[];
  totals: MatrixTotals;
  activeYear: number;
  focusMonth: number;
  privacyMode: boolean;
  language: AppLanguage;
}

export const MonthComparisonStrip: React.FC<MonthComparisonStripProps> = ({
  rows,
  entries,
  totals,
  activeYear,
  focusMonth,
  privacyMode,
  language,
}) => {
  const t = getTranslations(language);
  const monthNamesShort = getMonthNamesShort(language);

  const comp = useMemo(
    () => computeMonthComparison(rows, entries, totals, activeYear, focusMonth),
    [rows, entries, totals, activeYear, focusMonth]
  );

  const curLabel = `${monthNamesShort[comp.currentMonth]}/${String(comp.currentYear).slice(-2)}`;
  const prevLabel = `${monthNamesShort[comp.prevMonth]}/${String(comp.prevYear).slice(-2)}`;

  const cards = [
    {
      key: 'income',
      label: t.daily.comparison.income,
      data: comp.income,
      positiveIsGood: true,
    },
    {
      key: 'expense',
      label: t.daily.comparison.expenses,
      data: comp.expense,
      positiveIsGood: false,
    },
    {
      key: 'result',
      label: t.daily.comparison.netResult,
      data: comp.result,
      positiveIsGood: true,
    },
  ];

  return (
    <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            {t.daily.comparison.title}
          </h3>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {curLabel} {t.daily.comparison.vsLabel} {prevLabel}
          </span>
        </div>
        {!comp.hasPrevData && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {t.daily.comparison.noPrevMonthData}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((card) => {
          const { current, previous, delta, deltaPct } = card.data;
          const isZeroDelta = Math.abs(delta) < 0.01;
          const isUp = delta > 0;
          const isGood = isZeroDelta ? true : card.positiveIsGood ? isUp : !isUp;

          const badgeClass = isZeroDelta
            ? 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.05]'
            : isGood
            ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10'
            : 'text-red-700 dark:text-red-300 bg-red-500/10';

          return (
            <div
              key={card.key}
              className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums ${badgeClass}`}
                >
                  {isZeroDelta ? (
                    <Minus className="h-3 w-3" />
                  ) : isUp ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  <span>
                    {deltaPct !== null
                      ? `${deltaPct > 0 ? '+' : ''}${deltaPct}%`
                      : formatBRL(delta, privacyMode, true)}
                  </span>
                </span>
              </div>

              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatBRL(current, privacyMode, card.key === 'result')}
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span>
                  {t.daily.comparison.prevPrefix} {formatBRL(previous, privacyMode, card.key === 'result')}
                </span>
                <span>{formatBRL(delta, privacyMode, true)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

interface DailyControlHubProps {
  rows: CategoryRow[];
  entries: TransactionEntry[];
  accounts: BankAccount[];
  recurringBills: RecurringBill[];
  totals: MatrixTotals;
  activeYear: number;
  focusMonth: number;
  privacyMode: boolean;
  language: AppLanguage;
  onAddRecurringBill: (bill: Omit<RecurringBill, 'id' | 'createdAt'>) => void;
  onUpdateRecurringBill: (id: string, patch: Partial<RecurringBill>) => void;
  onDeleteRecurringBill: (id: string) => void;
  onUpdateRow: (rowId: string, patch: Partial<CategoryRow>) => void;
  onSelectCell: (row: CategoryRow, month: number) => void;
}

type DailyTab = 'recurring' | 'limits' | 'installments' | 'search';

export const DailyControlHub: React.FC<DailyControlHubProps> = ({
  rows,
  entries,
  accounts,
  recurringBills,
  totals,
  activeYear,
  focusMonth,
  privacyMode,
  language,
  onAddRecurringBill,
  onUpdateRecurringBill,
  onDeleteRecurringBill,
  onUpdateRow,
  onSelectCell,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<DailyTab>('recurring');
  const t = getTranslations(language);
  const monthNamesShort = getMonthNamesShort(language);
  const monthKey = getRecurringMonthKey(activeYear, focusMonth);

  // ---- Recurring Bills State ----
  const [showAddBill, setShowAddBill] = useState(false);
  const [billTitle, setBillTitle] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDay, setBillDueDay] = useState('15');
  const [billCategoryId, setBillCategoryId] = useState('');

  const resolvedBills = useMemo(() => {
    return recurringBills
      .map((bill) => ({
        bill,
        ...getEffectiveRecurringStatus(bill, activeYear, focusMonth),
      }))
      .sort((a, b) => a.bill.dueDay - b.bill.dueDay);
  }, [recurringBills, activeYear, focusMonth]);

  const billMetrics = useMemo(() => {
    let pendingTotal = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;
    let paidCount = 0;

    resolvedBills.forEach(({ bill, status, isDueSoon }) => {
      if (status === 'paid') {
        paidCount += 1;
      } else {
        pendingTotal += bill.amount;
        if (status === 'overdue') overdueCount += 1;
        if (isDueSoon) dueSoonCount += 1;
      }
    });

    return {
      pendingTotal: Number(pendingTotal.toFixed(2)),
      overdueCount,
      dueSoonCount,
      paidCount,
      openCount: resolvedBills.length - paidCount,
    };
  }, [resolvedBills]);

  const expenseCategories = useMemo(
    () =>
      rows
        .filter((r) => (r.block === 'fixed' || r.block === 'variable') && !r.hidden)
        .sort((a, b) => a.order - b.order),
    [rows]
  );

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = billTitle.trim();
    const parsedAmount = parseFloat(billAmount.replace(',', '.'));
    const parsedDay = parseInt(billDueDay, 10);
    if (!cleanTitle || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;

    const safeDay = Number.isFinite(parsedDay) ? Math.min(31, Math.max(1, parsedDay)) : 15;
    onAddRecurringBill({
      title: cleanTitle,
      amount: Number(parsedAmount.toFixed(2)),
      dueDay: safeDay,
      categoryRowId: billCategoryId || undefined,
      statusByMonth: { [monthKey]: 'pending' },
    });

    setBillTitle('');
    setBillAmount('');
    setBillDueDay('15');
    setBillCategoryId('');
    setShowAddBill(false);
  };

  const handleSetBillStatus = (bill: RecurringBill, nextStatus: RecurringBillStatus) => {
    onUpdateRecurringBill(bill.id, {
      statusByMonth: {
        ...bill.statusByMonth,
        [monthKey]: nextStatus,
      },
    });
  };

  // ---- Category Limits State ----
  const [editingLimitRowId, setEditingLimitRowId] = useState<string | null>(null);
  const [limitDraft, setLimitDraft] = useState('');

  const limitItems = useMemo(
    () => computeCategoryLimitProgress(rows, totals, focusMonth),
    [rows, totals, focusMonth]
  );

  const alertLimitsCount = useMemo(
    () => limitItems.filter((item) => item.status === 'over' || item.status === 'near').length,
    [limitItems]
  );

  const handleSaveLimit = (rowId: string) => {
    const parsed = parseFloat(limitDraft.replace(',', '.'));
    onUpdateRow(rowId, {
      alertLimit: Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : undefined,
    });
    setEditingLimitRowId(null);
    setLimitDraft('');
  };

  // ---- Installments Summary ----
  const installmentsSummary = useMemo(
    () => computeInstallmentsSummary(entries, rows, accounts, activeYear, focusMonth),
    [entries, rows, accounts, activeYear, focusMonth]
  );

  // ---- Quick Entry Search State ----
  const [quickQuery, setQuickQuery] = useState('');

  const quickSearchResults = useMemo(() => {
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    const q = quickQuery.trim().toLowerCase();

    const yearEntries = entries
      .filter((e) => e.year === activeYear)
      .map((entry) => {
        const row = rowMap.get(entry.rowId);
        const acc = accMap.get(entry.accountId);
        const localizedStatus = translateEntryStatus(entry.status, language);
        const shortStatus =
          entry.status === 'paid'
            ? t.daily.search.statusPaid
            : entry.status === 'pending'
            ? t.daily.search.statusPending
            : t.daily.search.statusProjected;
        return {
          entry,
          row,
          categoryName: row?.name ?? '—',
          accountLabel: acc ? acc.institution : 'Manual',
          localizedStatus,
          shortStatus,
        };
      })
      .sort((a, b) => {
        if (b.entry.month !== a.entry.month) return b.entry.month - a.entry.month;
        return b.entry.day - a.entry.day;
      });

    if (!q) {
      return yearEntries.slice(0, 20);
    }

    const qNumClean = q.replace(',', '.');
    return yearEntries.filter(({ entry, categoryName, accountLabel, localizedStatus, shortStatus }) => {
      const amountStr = entry.amount.toFixed(2);
      const amountBr = amountStr.replace('.', ',');
      return (
        entry.description.toLowerCase().includes(q) ||
        (entry.merchant ?? '').toLowerCase().includes(q) ||
        categoryName.toLowerCase().includes(q) ||
        accountLabel.toLowerCase().includes(q) ||
        entry.status.toLowerCase().includes(q) ||
        localizedStatus.toLowerCase().includes(q) ||
        shortStatus.toLowerCase().includes(q) ||
        amountStr.includes(qNumClean) ||
        amountBr.includes(q)
      );
    });
  }, [entries, rows, accounts, activeYear, quickQuery, language, t]);

  const tabItems: { id: DailyTab; label: string; countBadge?: string; alertTone?: boolean }[] = [
    {
      id: 'recurring',
      label: t.daily.tabs.recurring,
      countBadge: billMetrics.openCount > 0 ? String(billMetrics.openCount) : undefined,
      alertTone: billMetrics.overdueCount > 0,
    },
    {
      id: 'limits',
      label: t.daily.tabs.limits,
      countBadge: alertLimitsCount > 0 ? String(alertLimitsCount) : undefined,
      alertTone: alertLimitsCount > 0,
    },
    {
      id: 'installments',
      label: t.daily.tabs.installments,
      countBadge:
        installmentsSummary.activePlansCount > 0
          ? String(installmentsSummary.activePlansCount)
          : undefined,
    },
    {
      id: 'search',
      label: t.daily.tabs.search,
    },
  ];

  return (
    <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-4 sm:p-5 space-y-4">
      {/* Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-white/[0.07] pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabItems.map((tab) => {
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[38px] ${
                  active
                    ? 'bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F] border border-transparent dark:border-[#C9A86A]/35'
                    : 'bg-slate-50 dark:bg-[#0D1320] text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-white/[0.06] hover:bg-slate-100 dark:hover:bg-[#161F31]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.countBadge && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded tabular-nums ${
                      tab.alertTone
                        ? 'bg-red-500/15 text-red-600 dark:text-red-300'
                        : active
                        ? 'bg-white/15 text-white dark:text-[#E5C88F]'
                        : 'bg-slate-200/80 dark:bg-white/[0.08] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab.countBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          {monthNamesShort[focusMonth]}/{activeYear}
        </div>
      </div>

      {/* TAB 1: RECURRING BILLS & DUE ALERTS */}
      {activeSubTab === 'recurring' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-[#C9A86A]" />
                {t.daily.recurring.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.daily.recurring.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.07] text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  {t.daily.recurring.pendingMonthTotal}:{' '}
                </span>
                <strong className="font-mono tabular-nums text-slate-900 dark:text-[#E5C88F]">
                  {formatBRL(billMetrics.pendingTotal, privacyMode)}
                </strong>
              </div>

              <button
                type="button"
                onClick={() => setShowAddBill((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t.daily.recurring.addBtn}</span>
              </button>
            </div>
          </div>

          {(billMetrics.overdueCount > 0 || billMetrics.dueSoonCount > 0) && (
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {billMetrics.overdueCount > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong className="font-mono">{billMetrics.overdueCount}</strong>{' '}
                    {billMetrics.overdueCount === 1
                      ? t.daily.recurring.overdueAlertSingular
                      : t.daily.recurring.overdueAlertPlural}
                  </span>
                </div>
              )}
              {billMetrics.dueSoonCount > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong className="font-mono">{billMetrics.dueSoonCount}</strong>{' '}
                    {t.daily.recurring.dueSoonAlert}
                  </span>
                </div>
              )}
            </div>
          )}

          {showAddBill && (
            <form
              onSubmit={handleCreateBill}
              className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-[#C9A86A]/40 grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end"
            >
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.daily.recurring.titleLabel}
                </label>
                <input
                  type="text"
                  required
                  value={billTitle}
                  onChange={(e) => setBillTitle(e.target.value)}
                  placeholder={t.daily.recurring.titlePlaceholder}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.daily.recurring.amountLabel}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.daily.recurring.dueDayLabel}
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  required
                  value={billDueDay}
                  onChange={(e) => setBillDueDay(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.daily.recurring.categoryLabel}
                </label>
                <select
                  value={billCategoryId}
                  onChange={(e) => setBillCategoryId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-slate-100"
                >
                  <option value="">{t.daily.recurring.noCategory}</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                >
                  {t.daily.recurring.saveBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddBill(false)}
                  className="px-2.5 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/[0.06]"
                >
                  {t.daily.recurring.cancelBtn}
                </button>
              </div>
            </form>
          )}

          {resolvedBills.length === 0 ? (
            <div className="p-5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] text-xs text-slate-500 dark:text-slate-400">
              {t.daily.recurring.emptyTitle}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] divide-y divide-slate-100 dark:divide-white/[0.05] max-h-[320px] overflow-y-auto">
              {resolvedBills.map(({ bill, status, isDueSoon, daysUntilDue }) => {
                const catName = bill.categoryRowId
                  ? rows.find((r) => r.id === bill.categoryRowId)?.name
                  : undefined;

                return (
                  <div
                    key={bill.id}
                    className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs bg-white dark:bg-[#111827]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-[11px] tabular-nums px-2 py-1 rounded bg-slate-100 dark:bg-[#0D1320] text-slate-700 dark:text-slate-300 shrink-0">
                        {t.daily.recurring.dueDayShort}
                        {String(bill.dueDay).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {bill.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                          {catName && <span>{catName}</span>}
                          {catName && isDueSoon && <span>·</span>}
                          {isDueSoon && daysUntilDue !== null && (
                            <span className="text-amber-700 dark:text-amber-300 font-medium">
                              {daysUntilDue === 0
                                ? t.daily.recurring.dueToday
                                : `${t.daily.recurring.dueInDaysPrefix} ${daysUntilDue}${t.daily.recurring.dueInDaysSuffix}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 ml-auto">
                      <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatBRL(bill.amount, privacyMode)}
                      </span>

                      <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/[0.08] overflow-hidden">
                        {(
                          [
                            { id: 'paid', label: t.daily.recurring.statusPaid },
                            { id: 'pending', label: t.daily.recurring.statusPending },
                            { id: 'overdue', label: t.daily.recurring.statusOverdue },
                          ] as const
                        ).map((opt) => {
                          const isSelected = status === opt.id;
                          const activeColor =
                            opt.id === 'paid'
                              ? 'bg-emerald-600 text-white'
                              : opt.id === 'overdue'
                              ? 'bg-red-600 text-white'
                              : 'bg-amber-500 text-slate-950';
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleSetBillStatus(bill, opt.id)}
                              className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                                isSelected
                                  ? activeColor
                                  : 'bg-slate-50 dark:bg-[#0D1320] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteRecurringBill(bill.id)}
                        title={t.daily.recurring.deleteTitle}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CATEGORY LIMITS & PROGRESS */}
      {activeSubTab === 'limits' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-[#C9A86A]" />
              {t.daily.limits.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.daily.limits.subtitle}</p>
          </div>

          {limitItems.length === 0 ? (
            <div className="p-5 rounded-lg bg-slate-50 dark:bg-[#0D1320] text-xs text-slate-500 dark:text-slate-400">
              {t.daily.limits.emptyCategories}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-0.5">
              {limitItems.map((item) => {
                const isEditing = editingLimitRowId === item.row.id;
                const barWidth = Math.min(100, Math.max(0, item.pct));
                const barColor =
                  item.status === 'over'
                    ? 'bg-red-500'
                    : item.status === 'near'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';
                const badgeStyle =
                  item.status === 'over'
                    ? 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/25'
                    : item.status === 'near'
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                    : item.status === 'ok'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                    : 'bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/[0.08]';

                const badgeLabel =
                  item.status === 'over'
                    ? `${t.daily.limits.overCeilingBadge} (${item.pct}%)`
                    : item.status === 'near'
                    ? `${t.daily.limits.nearCeilingBadge} (${item.pct}%)`
                    : item.status === 'ok'
                    ? `${t.daily.limits.healthyBadge} (${item.pct}%)`
                    : t.daily.limits.noLimitBadge;

                return (
                  <div
                    key={item.row.id}
                    className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.row.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium shrink-0 ${badgeStyle}`}
                      >
                        {item.status === 'over' && <AlertTriangle className="h-3 w-3" />}
                        {item.status === 'ok' && <CheckCircle2 className="h-3 w-3" />}
                        <span>{badgeLabel}</span>
                      </span>
                    </div>

                    {item.limit ? (
                      <>
                        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
                          <div
                            style={{ width: `${barWidth}%` }}
                            className={`h-full transition-all duration-300 ${barColor}`}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                          <span className="text-slate-700 dark:text-slate-200">
                            {formatBRL(item.spent, privacyMode)} {t.daily.limits.spentOf}{' '}
                            <strong>{formatBRL(item.limit, privacyMode)}</strong>
                          </span>
                          <span
                            className={
                              (item.remaining ?? 0) < 0
                                ? 'text-red-600 dark:text-red-400 font-semibold'
                                : 'text-slate-500 dark:text-slate-400'
                            }
                          >
                            {(item.remaining ?? 0) >= 0
                              ? `${t.daily.limits.remainingPrefix} ${formatBRL(
                                  item.remaining ?? 0,
                                  privacyMode
                                )}`
                              : `${t.daily.limits.exceededPrefix} ${formatBRL(
                                  Math.abs(item.remaining ?? 0),
                                  privacyMode
                                )}`}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {monthNamesShort[focusMonth]}: {formatBRL(item.spent, privacyMode)}
                      </div>
                    )}

                    {isEditing ? (
                      <div className="flex items-center gap-1.5 pt-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={limitDraft}
                          onChange={(e) => setLimitDraft(e.target.value)}
                          placeholder={t.daily.limits.limitPlaceholder}
                          className="flex-1 px-2.5 py-1.5 rounded-md text-xs font-mono bg-white dark:bg-[#111827] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveLimit(item.row.id)}
                          className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                        >
                          {t.daily.limits.saveBtn}
                        </button>
                        {item.limit && (
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateRow(item.row.id, { alertLimit: undefined });
                              setEditingLimitRowId(null);
                              setLimitDraft('');
                            }}
                            className="px-2 py-1.5 rounded-md text-[11px] text-red-600 dark:text-red-400 hover:bg-red-500/10"
                          >
                            {t.daily.limits.clearBtn}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingLimitRowId(null)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLimitRowId(item.row.id);
                            setLimitDraft(item.limit ? String(item.limit) : '');
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#A68342] dark:text-[#E5C88F] hover:underline"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>
                            {item.limit ? t.daily.limits.editLimitBtn : t.daily.limits.setLimitBtn}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FUTURE INSTALLMENTS TRACKER */}
      {activeSubTab === 'installments' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[#C9A86A]" />
              {t.daily.installments.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.daily.installments.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t.daily.installments.activePlans}
              </div>
              <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                {installmentsSummary.activePlansCount}{' '}
                <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                  ({installmentsSummary.totalPaidInstallments} {t.daily.installments.paidCountLabel}{' '}
                  · {installmentsSummary.totalRemainingInstallments}{' '}
                  {t.daily.installments.remainingCountLabel})
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t.daily.installments.totalRemaining}
              </div>
              <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-[#A68342] dark:text-[#E5C88F]">
                {formatBRL(installmentsSummary.totalRemainingAmount, privacyMode)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t.daily.installments.nextMonthCommitted}
              </div>
              <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatBRL(installmentsSummary.nextMonthCommitment, privacyMode)}
              </div>
            </div>
          </div>

          {installmentsSummary.items.length === 0 ? (
            <div className="p-5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] text-xs text-slate-500 dark:text-slate-400">
              {t.daily.installments.emptyTitle}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t.daily.installments.upcomingTitle}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {installmentsSummary.upcomingMonths.map((um) => (
                    <div
                      key={`${um.year}-${um.month}`}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]"
                    >
                      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        {monthNamesShort[um.month]}/{String(um.year).slice(-2)}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {formatBRL(um.amount, privacyMode)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] divide-y divide-slate-100 dark:divide-white/[0.05] max-h-[260px] overflow-y-auto">
                {installmentsSummary.items.map((item) => {
                  const pctPaid = Math.min(100, Math.round((item.current / item.total) * 100));
                  const targetRow = rows.find((r) => r.id === item.rowId);
                  return (
                    <div
                      key={item.id}
                      onClick={() => targetRow && onSelectCell(targetRow, item.month)}
                      className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-[#1A2234]/60 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {item.title}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#C9A86A]/15 text-[#8C6A2E] dark:text-[#E5C88F] shrink-0">
                            {item.shortLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {item.categoryName} · {item.accountLabel} · {t.daily.installments.paidLabel}{' '}
                          <span className="font-mono">{item.current}</span> ·{' '}
                          {t.daily.installments.remainingLabel}{' '}
                          <span className="font-mono">{item.remainingCount}</span> ({pctPaid}%)
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {formatBRL(item.remainingTotalAmount, privacyMode)}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {formatBRL(item.installmentAmount, privacyMode)}
                          {t.daily.installments.perMonthShort}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: QUICK ENTRY SEARCH */}
      {activeSubTab === 'search' && (
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Search className="h-4 w-4 text-[#C9A86A]" />
                {t.daily.search.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.daily.search.subtitle}
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {quickSearchResults.length} {t.daily.search.resultsSuffix}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                placeholder={t.daily.search.placeholder}
                className="w-full pl-9 pr-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C9A86A]/40"
              />
            </div>

            {quickQuery && (
              <button
                type="button"
                onClick={() => setQuickQuery('')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-200/70"
              >
                <X className="h-3.5 w-3.5" />
                <span>{t.daily.search.clearBtn}</span>
              </button>
            )}
          </div>

          {quickSearchResults.length === 0 ? (
            <div className="p-5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] text-xs text-slate-500 dark:text-slate-400">
              {entries.length === 0
                ? `${t.daily.search.emptyHint} ${activeYear}.`
                : t.daily.search.noResults}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] divide-y divide-slate-100 dark:divide-white/[0.05] max-h-[300px] overflow-y-auto">
              {quickSearchResults.map(({ entry, row, categoryName, accountLabel, shortStatus }) => {
                const isIncome = row?.block === 'income';
                const statusBadge =
                  entry.status === 'paid'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : entry.status === 'pending'
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'bg-slate-200/70 dark:bg-white/[0.08] text-slate-600 dark:text-slate-300';

                return (
                  <div
                    key={entry.id}
                    onClick={() => row && onSelectCell(row, entry.month)}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-[#1A2234]/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                        {String(entry.day).padStart(2, '0')}/{monthNamesShort[entry.month]}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {entry.merchant || entry.description}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {categoryName} · {accountLabel}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusBadge}`}>
                        {shortStatus}
                      </span>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          isIncome
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {formatBRL(isIncome ? entry.amount : -entry.amount, privacyMode, isIncome)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
