import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  PiggyBank,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  AppLanguage,
  AppSettings,
  BankAccount,
  CategoryRow,
  CreditCardAccount,
  CreditCardPurchase,
  MatrixTotals,
  RecurringBill,
  TransactionEntry,
} from '../types/finance';
import {
  computeMonthlyBudgetForecast,
  computeUpcomingCashflowAlerts,
  formatBRL,
} from '../utils/financeEngine';
import { getMonthNamesFull, getMonthNamesShort } from '../utils/i18n';

interface MonthlyBudgetHeroProps {
  rows: CategoryRow[];
  entries: TransactionEntry[];
  accounts: BankAccount[];
  recurringBills: RecurringBill[];
  creditCards: CreditCardAccount[];
  cardPurchases: CreditCardPurchase[];
  paidCardInvoices: Record<string, boolean>;
  totals: MatrixTotals;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onFocusRecurrences?: () => void;
}

export const MonthlyBudgetHero: React.FC<MonthlyBudgetHeroProps> = ({
  rows,
  entries,
  accounts,
  recurringBills,
  creditCards,
  cardPurchases,
  paidCardInvoices,
  totals,
  settings,
  onUpdateSettings,
  onFocusRecurrences,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const { activeYear, focusMonth, privacyMode, language } = settings;
  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));
  const leadDays = settings.alertLeadDays ?? 3;

  const monthNamesFull = getMonthNamesFull(language);
  const monthNamesShort = getMonthNamesShort(language);

  const filterableRows = useMemo(
    () =>
      rows
        .filter((r) => !r.hidden && (r.block === 'income' || r.block === 'fixed' || r.block === 'variable'))
        .sort((a, b) => a.block.localeCompare(b.block) || a.order - b.order),
    [rows]
  );

  const forecast = useMemo(
    () =>
      computeMonthlyBudgetForecast({
        rows,
        entries,
        accounts,
        recurringBills,
        creditCards,
        cardPurchases,
        paidCardInvoices,
        totals,
        year: activeYear,
        focusMonth: safeMonth,
        categoryRowId: categoryFilter,
      }),
    [
      rows,
      entries,
      accounts,
      recurringBills,
      creditCards,
      cardPurchases,
      paidCardInvoices,
      totals,
      activeYear,
      safeMonth,
      categoryFilter,
    ]
  );

  const cashflowAlerts = useMemo(
    () =>
      computeUpcomingCashflowAlerts({
        recurringBills,
        entries,
        creditCards,
        cardPurchases,
        paidCardInvoices,
        rows,
        year: activeYear,
        focusMonth: safeMonth,
        leadDays,
      }),
    [recurringBills, entries, creditCards, cardPurchases, paidCardInvoices, rows, activeYear, safeMonth, leadDays]
  );

  const healthMeta =
    forecast.healthStatus === 'over'
      ? {
          label: 'Acima do Limite',
          textClass: 'text-red-600 dark:text-red-400',
          barClass: 'bg-red-500',
          boxClass: 'bg-red-50/80 dark:bg-red-950/25 border-red-200 dark:border-red-500/30',
        }
      : forecast.healthStatus === 'attention'
      ? {
          label: 'Em Atenção',
          textClass: 'text-amber-700 dark:text-amber-300',
          barClass: 'bg-amber-500',
          boxClass: 'bg-amber-50/80 dark:bg-amber-950/25 border-amber-200 dark:border-amber-500/30',
        }
      : {
          label: 'Ritmo Seguro',
          textClass: 'text-emerald-700 dark:text-emerald-400',
          barClass: 'bg-emerald-500',
          boxClass: 'bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-500/30',
        };

  const chartMax = Math.max(
    1,
    forecast.realizedIncome,
    forecast.totalForecastIncome,
    forecast.realizedExpense,
    forecast.totalForecastExpense
  );

  const pctHeight = (val: number) => Math.max(4, Math.min(100, Math.round((Math.max(0, val) / chartMax) * 100)));
  const progressBarPct = Math.min(100, Math.max(0, forecast.budgetUtilizationPct));

  const labels = getHeroLabels(language);

  return (
    <div className="space-y-4">
      {/* HERO: QUANTO AINDA PODE GASTAR NO MÊS + PREVISÃO CONSOLIDADA */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        {/* Top Bar with Category Filter */}
        <div className="px-5 py-3.5 bg-slate-50/90 dark:bg-[#0D1320] border-b border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
              {labels.heroTitle} · {monthNamesFull[safeMonth]} {activeYear}
            </div>
          </div>

          <select
            aria-label="Filtrar previsão por categoria"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:w-auto sm:max-w-[240px] px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-800 dark:text-slate-200"
          >
            <option value="all">{labels.allCategories}</option>
            {filterableRows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Main Asymmetric 12-Col Grid */}
        <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
          {/* Left 7 Cols: Hero Margin + 4-Term Breakdown */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-5 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {labels.availableLabel} ({monthNamesShort[safeMonth]})
                </div>
                <div
                  className={`mt-1.5 text-3xl sm:text-4xl font-semibold font-mono tabular-nums tracking-tight ${
                    forecast.safeToSpendRemaining >= 0
                      ? 'text-slate-900 dark:text-white'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatBRL(forecast.safeToSpendRemaining, privacyMode, forecast.safeToSpendRemaining < 0)}
                </div>
                <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {labels.projectedClose}:{' '}
                  <strong
                    className={
                      forecast.projectedMonthClose >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }
                  >
                    {formatBRL(forecast.projectedMonthClose, privacyMode, true)}
                  </strong>
                </div>
              </div>

              <div className={`px-3 py-2 rounded-xl border text-right shrink-0 ${healthMeta.boxClass}`}>
                <div className={`text-xs font-semibold inline-flex items-center gap-1.5 ${healthMeta.textClass}`}>
                  {forecast.healthStatus === 'over' ? (
                    <ShieldAlert className="h-3.5 w-3.5" />
                  ) : forecast.healthStatus === 'attention' ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span>{healthMeta.label}</span>
                </div>
                <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {forecast.budgetUtilizationPct}% {labels.budgetUsed}
                </div>
              </div>
            </div>

            {/* Utilization Bar */}
            <div className="space-y-1.5">
              <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/[0.08] overflow-hidden">
                <div
                  style={{ width: `${progressBarPct}%` }}
                  className={`h-full transition-all duration-300 ${healthMeta.barClass}`}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                <span>
                  {labels.committedLabel}: {formatBRL(forecast.totalForecastExpense, privacyMode)}
                </span>
                <span>
                  {labels.baseCapacity}: {formatBRL(forecast.currentAccountBalance + forecast.totalForecastIncome, privacyMode)}
                </span>
              </div>
            </div>

            {/* 4-Term Formula Hairline Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 dark:bg-white/[0.08] rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
              <div className="p-3 bg-slate-50/90 dark:bg-[#0D1320] min-w-0">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  {accounts.some((a) => a.status === 'active' && a.type !== 'Cartão de Crédito')
                    ? labels.termBalance
                    : 'Saldo ant. (M-1)'}
                </div>
                <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatBRL(forecast.currentAccountBalance, privacyMode)}
                </div>
                {forecast.isolatedSavingsTotal > 0 && (
                  <div className="mt-0.5 text-[10px] font-mono tabular-nums text-blue-600 dark:text-blue-400 leading-snug break-words">
                    Caixinha: {formatBRL(forecast.isolatedSavingsTotal, privacyMode)}
                  </div>
                )}
              </div>
              <div className="p-3 bg-slate-50/90 dark:bg-[#0D1320] min-w-0">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  + {labels.termForecastIncome}
                </div>
                <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatBRL(forecast.totalForecastIncome, privacyMode)}
                </div>
                <div className="mt-0.5 text-[10px] font-mono tabular-nums text-slate-400 leading-snug break-words">
                  Previsto: {formatBRL(forecast.expectedPendingIncome, privacyMode)}
                </div>
              </div>
              <div className="p-3 bg-slate-50/90 dark:bg-[#0D1320] min-w-0">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  − {labels.termRealizedExpense}
                </div>
                <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatBRL(forecast.realizedExpense, privacyMode)}
                </div>
              </div>
              <div className="p-3 bg-slate-50/90 dark:bg-[#0D1320] min-w-0">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  − {labels.termPendingCommitments}
                </div>
                <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-amber-700 dark:text-amber-300">
                  {formatBRL(forecast.totalPendingCommitments, privacyMode)}
                </div>
                <div className="mt-0.5 text-[10px] font-mono tabular-nums text-slate-400 leading-snug break-words">
                  Fixas {formatBRL(forecast.pendingRecurringDebits, privacyMode)} · Fat.{' '}
                  {formatBRL(forecast.unpaidCardInvoices, privacyMode)}
                </div>
              </div>
            </div>

            {/* 3 Pilares de Previsibilidade: Dinheiro na Mão · Comprometido · Futuro */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-500/25 min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                  <Wallet className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{labels.cashInHandTitle}</span>
                </div>
                <div
                  className={`mt-1 text-sm sm:text-base font-semibold font-mono tabular-nums ${
                    forecast.cashInHand >= 0
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatBRL(forecast.cashInHand, privacyMode, forecast.cashInHand < 0)}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-400 leading-snug break-words">
                  {labels.cashInHandHint}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-500/25 min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {labels.committedMonthTitle} ({monthNamesShort[safeMonth]})
                  </span>
                </div>
                <div className="mt-1 text-sm sm:text-base font-semibold font-mono tabular-nums text-amber-700 dark:text-amber-300">
                  {formatBRL(forecast.committedInMonth, privacyMode)}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-400 leading-snug break-words font-mono tabular-nums">
                  {labels.committedMonthHint}: {formatBRL(forecast.totalPendingCommitments, privacyMode)}
                  {forecast.pendingSavingsInMonth > 0
                    ? ` + Caixinha ${formatBRL(forecast.pendingSavingsInMonth, privacyMode)}`
                    : ''}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-500/25 min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-800 dark:text-blue-300">
                  <CreditCard className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {labels.futureTitle} ({monthNamesShort[forecast.nextCycleMonth]}/{String(forecast.nextCycleYear).slice(-2)})
                  </span>
                </div>
                <div className="mt-1 text-sm sm:text-base font-semibold font-mono tabular-nums text-blue-700 dark:text-blue-300">
                  {formatBRL(forecast.futureNextMonthCommitments, privacyMode)}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-400 leading-snug break-words font-mono tabular-nums">
                  {labels.future3mHint}: {formatBRL(forecast.futureNext3MonthsTotal, privacyMode)}
                </div>
              </div>
            </div>

            {/* Virada de Mês Consciente: Caixinha Isolada vs Saldo Transportado */}
            {categoryFilter === 'all' && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200/90 dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <div className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <PiggyBank className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 break-words">
                      {labels.rolloverTitle} ({monthNamesShort[safeMonth]}/{activeYear} → {monthNamesShort[forecast.nextCycleMonth]}/{forecast.nextCycleYear})
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                      {labels.rolloverSavingsLabel}:{' '}
                      <strong className="font-mono text-blue-600 dark:text-blue-400">
                        {formatBRL(forecast.savingsInMonth, privacyMode)}
                      </strong>{' '}
                      ({labels.rolloverAccumulated}:{' '}
                      <span className="font-mono">{formatBRL(forecast.isolatedSavingsTotal, privacyMode)}</span>)
                    </div>
                  </div>
                </div>

                <div className="sm:text-right shrink-0 pl-9 sm:pl-0">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {labels.rolloverCarryLabel} {monthNamesShort[forecast.nextCycleMonth]}/{String(forecast.nextCycleYear).slice(-2)}
                  </div>
                  <div
                    className={`text-xs sm:text-sm font-semibold font-mono tabular-nums ${
                      forecast.projectedCarryoverToNextMonth >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {formatBRL(
                      forecast.projectedCarryoverToNextMonth,
                      privacyMode,
                      forecast.projectedCarryoverToNextMonth < 0
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right 5 Cols: Receitas vs Gastos (Realizado vs Previsto) Chart */}
          <div className="lg:col-span-5 p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.07] flex flex-col justify-between space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {labels.chartTitle}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {labels.chartSub}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-emerald-500" />
                  Receitas
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-blue-500" />
                  Gastos
                </span>
              </div>
            </div>

            {/* Clean Visual Comparison Bars */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <div className="h-28 flex items-end justify-center gap-3 px-2 border-b border-slate-200 dark:border-white/[0.08]">
                  <div className="w-9 flex flex-col items-center justify-end h-full">
                    <div
                      style={{ height: `${pctHeight(forecast.realizedIncome)}%` }}
                      className="w-full rounded-t-md bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
                      title={`Receita realizada: ${formatBRL(forecast.realizedIncome, privacyMode)}`}
                    />
                  </div>
                  <div className="w-9 flex flex-col items-center justify-end h-full">
                    <div
                      style={{ height: `${pctHeight(forecast.totalForecastIncome)}%` }}
                      className="w-full rounded-t-md bg-emerald-500/35 border border-emerald-500/60 transition-all duration-300"
                      title={`Receita prevista total: ${formatBRL(forecast.totalForecastIncome, privacyMode)}`}
                    />
                  </div>
                </div>
                <div className="text-center space-y-0.5">
                  <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                    Receitas
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    Real {formatBRL(forecast.realizedIncome, privacyMode)}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Prev {formatBRL(forecast.totalForecastIncome, privacyMode)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="h-28 flex items-end justify-center gap-3 px-2 border-b border-slate-200 dark:border-white/[0.08]">
                  <div className="w-9 flex flex-col items-center justify-end h-full">
                    <div
                      style={{ height: `${pctHeight(forecast.realizedExpense)}%` }}
                      className="w-full rounded-t-md bg-blue-600 dark:bg-blue-500 transition-all duration-300"
                      title={`Gasto realizado: ${formatBRL(forecast.realizedExpense, privacyMode)}`}
                    />
                  </div>
                  <div className="w-9 flex flex-col items-center justify-end h-full">
                    <div
                      style={{ height: `${pctHeight(forecast.totalForecastExpense)}%` }}
                      className="w-full rounded-t-md bg-blue-500/35 border border-blue-500/60 transition-all duration-300"
                      title={`Gasto previsto total: ${formatBRL(forecast.totalForecastExpense, privacyMode)}`}
                    />
                  </div>
                </div>
                <div className="text-center space-y-0.5">
                  <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                    Gastos
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-blue-600 dark:text-blue-400">
                    Real {formatBRL(forecast.realizedExpense, privacyMode)}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Prev {formatBRL(forecast.totalForecastExpense, privacyMode)}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/80 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                {forecast.activeRecurringIncomeCount} recebimentos · {forecast.activeRecurringDebitCount} débitos ativos
              </span>
              {onFocusRecurrences && (
                <button
                  type="button"
                  onClick={onFocusRecurrences}
                  className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
                >
                  Configurar recorrências
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* UPCOMING DEBITS & RECEIPTS NOTIFICATIONS */}
      <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {cashflowAlerts.length > 0 ? (
              <BellRing className="h-4 w-4 text-[#C9A86A] shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            )}
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
              {cashflowAlerts.length > 0
                ? `${labels.alertsTitle} (${cashflowAlerts.length})`
                : `Sem vencimentos em ${leadDays}d (${monthNamesShort[safeMonth]}/${activeYear})`}
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            <label className="text-[11px] text-slate-500 dark:text-slate-400">
              {labels.leadDaysLabel}:
            </label>
            <select
              aria-label="Antecedência dos alertas"
              value={leadDays}
              onChange={(e) => onUpdateSettings({ alertLeadDays: Number(e.target.value) })}
              className="px-2 py-1 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-slate-100"
            >
              <option value={1}>1d</option>
              <option value={3}>3d</option>
              <option value={5}>5d</option>
              <option value={7}>7d</option>
              <option value={10}>10d</option>
            </select>
          </div>
        </div>

        {cashflowAlerts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {cashflowAlerts.slice(0, 6).map((al) => {
              const isIncome = al.kind === 'income';
              const toneClass =
                al.urgency === 'overdue'
                  ? 'border-red-200 dark:border-red-500/30 bg-red-50/70 dark:bg-red-950/20'
                  : al.urgency === 'today'
                  ? 'border-amber-300 dark:border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/20'
                  : 'border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#0D1320]';

              const whenText =
                al.urgency === 'overdue'
                  ? isIncome
                    ? 'Recebimento pendente'
                    : 'Atrasado'
                  : al.urgency === 'today'
                  ? 'Hoje'
                  : `Em ${al.daysDiff}d (Dia ${String(al.day).padStart(2, '0')})`;

              return (
                <div
                  key={al.id}
                  className={`px-3.5 py-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs ${toneClass}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {al.sourceType === 'card_invoice' ? (
                      <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    ) : isIncome ? (
                      <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {al.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {isIncome ? 'Recebimento' : 'Débito'} · {al.categoryLabel} ·{' '}
                        <span
                          className={
                            al.urgency === 'overdue'
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : al.urgency === 'today'
                              ? 'text-amber-700 dark:text-amber-300 font-semibold'
                              : 'text-slate-700 dark:text-slate-300'
                          }
                        >
                          {whenText}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`font-mono font-semibold tabular-nums shrink-0 ${
                      isIncome
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {formatBRL(isIncome ? al.amount : -al.amount, privacyMode, isIncome)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

function getHeroLabels(language: AppLanguage) {
  if (language === 'en') {
    return {
      heroTitle: 'Monthly Budget & Cashflow Forecast',
      heroFormulaHint: 'Balance + Expected Income − Realized Expenses − Pending Fixed Commitments',
      allCategories: 'All categories',
      availableLabel: 'Safe to Spend This Month',
      projectedClose: 'Projected month close',
      budgetUsed: 'of monthly capacity committed',
      committedLabel: 'Forecast Expenses',
      baseCapacity: 'Balance + Forecast Income',
      termBalance: 'Current Balance',
      termForecastIncome: 'Forecast Income',
      termRealizedExpense: 'Realized Expenses',
      termPendingCommitments: 'Pending Fixed & Bills',
      cashInHandTitle: 'Cash on Hand',
      cashInHandHint: 'Received − paid − saved',
      committedMonthTitle: 'Committed',
      committedMonthHint: 'Pending bills',
      futureTitle: 'Future',
      future3mHint: 'Next 3m',
      rolloverTitle: 'Conscious Month Rollover',
      rolloverSavingsLabel: 'Vault saved',
      rolloverAccumulated: 'total isolated',
      rolloverCarryLabel: 'Carries free to',
      chartTitle: 'Income vs. Expenses',
      chartSub: 'Realized vs. Forecast for the month',
      alertsTitle: 'Upcoming Debits & Receipts',
      leadDaysLabel: 'Alert lead time',
    };
  }
  if (language === 'es') {
    return {
      heroTitle: 'Presupuesto Mensual y Previsión',
      heroFormulaHint: 'Saldo + Ingresos Previstos − Gastos Realizados − Compromisos Pendientes',
      allCategories: 'Todas las categorías',
      availableLabel: 'Cuánto Aún Puedes Gastar',
      projectedClose: 'Proyección de cierre',
      budgetUsed: 'de la capacidad comprometida',
      committedLabel: 'Gastos Previstos',
      baseCapacity: 'Saldo + Ingresos Previstos',
      termBalance: 'Saldo Actual',
      termForecastIncome: 'Ingresos Previstos',
      termRealizedExpense: 'Gastos Realizados',
      termPendingCommitments: 'Fijos y Pendientes',
      cashInHandTitle: 'Dinero en Mano',
      cashInHandHint: 'Recibido − pagado − alcancía',
      committedMonthTitle: 'Comprometido',
      committedMonthHint: 'Pendientes',
      futureTitle: 'Futuro',
      future3mHint: 'Próx. 3 meses',
      rolloverTitle: 'Cierre Consciente de Ciclo',
      rolloverSavingsLabel: 'Alcancía del mes',
      rolloverAccumulated: 'acumulado',
      rolloverCarryLabel: 'Pasa libre a',
      chartTitle: 'Ingresos vs. Gastos',
      chartSub: 'Realizado vs. Previsto del mes',
      alertsTitle: 'Próximos Débitos e Ingresos',
      leadDaysLabel: 'Anticipación de alertas',
    };
  }
  return {
    heroTitle: 'Previsão do Mês',
    heroFormulaHint: 'Saldo Atual + Receitas Previstas − Gastos Realizados − Pendências',
    allCategories: 'Todas as categorias',
    availableLabel: 'Quanto Ainda Pode Gastar',
    projectedClose: 'Fechamento previsto',
    budgetUsed: 'comprometido',
    committedLabel: 'Gastos previstos',
    baseCapacity: 'Capacidade total',
    termBalance: 'Saldo Atual',
    termForecastIncome: 'Receitas Previstas',
    termRealizedExpense: 'Gastos Realizados',
    termPendingCommitments: 'Pendências & Faturas',
    cashInHandTitle: 'Dinheiro na Mão',
    cashInHandHint: 'Já recebido − já pago − caixinha',
    committedMonthTitle: 'Comprometido',
    committedMonthHint: 'Pendências',
    futureTitle: 'Futuro',
    future3mHint: 'Próx. 3 meses',
    rolloverTitle: 'Virada de Mês Consciente',
    rolloverSavingsLabel: 'Caixinha do mês',
    rolloverAccumulated: 'acumulado',
    rolloverCarryLabel: 'Transporta livre p/',
    chartTitle: 'Receitas vs. Gastos',
    chartSub: 'Realizado vs. Previsto',
    alertsTitle: 'Vencimentos & Recebimentos Próximos',
    leadDaysLabel: 'Alerta',
  };
}
