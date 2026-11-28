import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Minus,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Target,
  Calendar,
  Mic,
  Copy,
  PiggyBank,
  Pencil,
  Trash2,
  Check,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import {
  AlertItem,
  AppSettings,
  BankAccount,
  BlockType,
  CategoryRow,
  CreditCardAccount,
  CreditCardPurchase,
  MatrixTotals,
  RecurringBill,
  SavingsGoal,
  TransactionEntry,
} from '../types/finance';
import {
  DailyControlHub,
  MonthComparisonStrip,
} from './DailyControlWidgets';
import { MonthlyBudgetHero } from './MonthlyBudgetHero';
import { CreditCardPieChart } from './CreditCardPieChart';
import {
  computeContinuousCarryoverAndSavings,
  computeGoalProgress,
  computeMonthSpotlight,
  formatBRL,
  formatCompactDay,
  shiftYearMonth,
} from '../utils/financeEngine';
import { computeAllCreditCardsOverview } from '../utils/creditCardsEngine';
import {
  getMonthNamesFull,
  getMonthNamesShort,
  getTranslations,
  translateGoalStatus,
  translatePaymentMethod,
} from '../utils/i18n';
import {
  CategoryIconBadge,
  CategoryIconKey,
  CategoryVisualPicker,
  getCategoryVisual,
  getDefaultCategoryColor,
  getDefaultCategoryIcon,
} from '../utils/categoryVisuals';

interface MatrixGridViewProps {
  rows: CategoryRow[];
  entries: TransactionEntry[];
  accounts: BankAccount[];
  creditCards: CreditCardAccount[];
  cardPurchases: CreditCardPurchase[];
  paidCardInvoices: Record<string, boolean>;
  goals: SavingsGoal[];
  recurringBills: RecurringBill[];
  totals: MatrixTotals;
  alerts: AlertItem[];
  settings: AppSettings;
  onSelectCell: (row: CategoryRow, month: number) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateRow: (rowId: string, patch: Partial<CategoryRow>) => void;
  onAddRow: (row: Omit<CategoryRow, 'id' | 'order'>) => void;
  onDeleteRow: (rowId: string) => void;
  onMoveRow: (rowId: string, direction: 'up' | 'down') => void;
  onToggleHideRow: (rowId: string) => void;
  onAddRecurringBill: (bill: Omit<RecurringBill, 'id' | 'createdAt'>) => void;
  onUpdateRecurringBill: (id: string, patch: Partial<RecurringBill>) => void;
  onDeleteRecurringBill: (id: string) => void;
  onOpenGoalSettings: () => void;
  onOpenAccountsHub: () => void;
  onOpenCardsHub: () => void;
  onQuickEntry: (flowType: 'income' | 'expense') => void;
  onQuickVoiceEntry?: () => void;
  onDuplicateEntryById?: (entryId: string) => void;
  onQuickCardPurchase: () => void;
}

export const MatrixGridView: React.FC<MatrixGridViewProps> = ({
  rows,
  entries,
  accounts,
  creditCards,
  cardPurchases,
  paidCardInvoices,
  goals,
  recurringBills,
  totals,
  alerts,
  settings,
  onSelectCell,
  onUpdateSettings,
  onUpdateRow,
  onAddRow,
  onDeleteRow,
  onMoveRow,
  onToggleHideRow,
  onAddRecurringBill,
  onUpdateRecurringBill,
  onDeleteRecurringBill,
  onOpenGoalSettings,
  onOpenAccountsHub,
  onOpenCardsHub,
  onQuickEntry,
  onQuickVoiceEntry,
  onDuplicateEntryById,
  onQuickCardPurchase,
}) => {
  const [search, setSearch] = useState('');
  const [feedFilter, setFeedFilter] = useState<'all' | 'credit' | 'debit' | 'pix' | 'income'>('all');
  const [feedSearch, setFeedSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const deferredFeedSearch = useDeferredValue(feedSearch);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<BlockType, boolean>>({
    income: false,
    fixed: false,
    variable: false,
    savings: false,
  });
  const [showNewRowForm, setShowNewRowForm] = useState(false);
  const [showAnnualSection, setShowAnnualSection] = useState(false);
  const [customizeGridMode, setCustomizeGridMode] = useState(false);
  const [showHiddenRows, setShowHiddenRows] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingRowName, setEditingRowName] = useState('');
  const [newRowBlock, setNewRowBlock] = useState<BlockType>('variable');
  const [newRowName, setNewRowName] = useState('');
  const [newRowColor, setNewRowColor] = useState('#2563EB');
  const [newRowIcon, setNewRowIcon] = useState<CategoryIconKey>('tag');
  const [newRowLimit, setNewRowLimit] = useState('');
  const dailyControlRef = useRef<HTMLDivElement>(null);

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

  const cardsOverview = useMemo(
    () =>
      computeAllCreditCardsOverview(
        creditCards,
        cardPurchases,
        paidCardInvoices,
        activeYear,
        focusMonth
      ),
    [creditCards, cardPurchases, paidCardInvoices, activeYear, focusMonth]
  );

  const activeBankAccounts = useMemo(
    () => accounts.filter((a) => a.status === 'active' && a.type !== 'Cartão de Crédito'),
    [accounts]
  );

  const accountBalanceTotal = useMemo(
    () => activeBankAccounts.reduce((sum, a) => sum + a.balance, 0),
    [activeBankAccounts]
  );

  const continuousSummary = useMemo(
    () => computeContinuousCarryoverAndSavings(rows, entries, activeYear, focusMonth),
    [rows, entries, activeYear, focusMonth]
  );
  const previousMonthCarryover = continuousSummary.previousMonthCarryover;

  const displayAccountBalance =
    activeBankAccounts.length > 0
      ? accountBalanceTotal
      : Number((spotlight.result - spotlight.savings + previousMonthCarryover).toFixed(2));
  const displayMonthInvoice =
    creditCards.length > 0 ? cardsOverview.monthTotalInvoice : spotlight.totalCardInvoices;

  const filteredFeed = useMemo(() => {
    const q = deferredFeedSearch.trim().toLowerCase();
    return spotlight.transactions.filter((tx) => {
      if (feedFilter === 'income' && tx.block !== 'income') return false;
      if (feedFilter === 'credit' && (tx.block === 'income' || tx.paymentMethod !== 'credit')) return false;
      if (feedFilter === 'debit' && (tx.block === 'income' || tx.paymentMethod !== 'debit')) return false;
      if (feedFilter === 'pix' && (tx.block === 'income' || tx.paymentMethod !== 'pix')) return false;
      if (q) {
        return (
          tx.merchant.toLowerCase().includes(q) ||
          tx.categoryName.toLowerCase().includes(q) ||
          tx.accountLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [spotlight.transactions, feedFilter, deferredFeedSearch]);

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

  const rowMap = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const { incomeRows, fixedRows, variableRows, savingsRows } = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const matches = (row: CategoryRow) => {
      if (row.hidden && !showHiddenRows) return false;
      if (!q) return true;
      return row.name.toLowerCase().includes(q);
    };

    const byOrder = (a: CategoryRow, b: CategoryRow) => a.order - b.order;
    return {
      incomeRows: rows.filter((r) => r.block === 'income' && matches(r)).sort(byOrder),
      fixedRows: rows.filter((r) => r.block === 'fixed' && matches(r)).sort(byOrder),
      variableRows: rows.filter((r) => r.block === 'variable' && matches(r)).sort(byOrder),
      savingsRows: rows.filter((r) => r.block === 'savings' && matches(r)).sort(byOrder),
    };
  }, [rows, showHiddenRows, deferredSearch]);

  const toggleBlock = (block: BlockType) => {
    setCollapsedBlocks((prev) => ({ ...prev, [block]: !prev[block] }));
  };

  const handleCreateRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRowName.trim()) return;
    const limitNum = parseFloat(newRowLimit.replace(',', '.'));
    onAddRow({
      block: newRowBlock,
      name: newRowName.trim().toUpperCase(),
      color: newRowColor,
      icon: newRowIcon,
      alertLimit: Number.isFinite(limitNum) && limitNum > 0 ? limitNum : undefined,
    });
    setNewRowName('');
    setNewRowColor(getDefaultCategoryColor(newRowBlock));
    setNewRowIcon(getDefaultCategoryIcon(newRowBlock));
    setNewRowLimit('');
    setShowNewRowForm(false);
  };

  const renderCategoryRows = (blockRows: CategoryRow[], blockType: BlockType) => {
    if (collapsedBlocks[blockType]) return null;
    return blockRows.map((row) => {
      const monthly = totals.rowMonthly[row.id] ?? Array(12).fill(0);
      const annual = totals.rowAnnual[row.id] ?? 0;
      const isEditingThis = editingRowId === row.id;
      const visual = getCategoryVisual(row);

      return (
        <React.Fragment key={row.id}>
          <tr
            className={`group border-b border-slate-100 dark:border-white/[0.05] hover:bg-slate-50/90 dark:hover:bg-[#1A2234]/60 transition-colors ${
              row.hidden ? 'opacity-60' : ''
            }`}
          >
            <td className="sticky left-0 z-10 bg-white dark:bg-[#111827] group-hover:bg-slate-50 dark:group-hover:bg-[#1A2234] border-r border-slate-200 dark:border-white/[0.08] px-2.5 sm:px-3 py-2.5 min-w-[144px] max-w-[172px] sm:min-w-[205px] sm:max-w-[260px]">
              {isEditingThis ? (
                <div className="flex items-center gap-1.5">
                  <CategoryIconBadge row={row} size="xs" />
                  <input
                    type="text"
                    value={editingRowName}
                    onChange={(e) => setEditingRowName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const clean = editingRowName.trim();
                        if (clean) onUpdateRow(row.id, { name: clean.toUpperCase() });
                        setEditingRowId(null);
                      } else if (e.key === 'Escape') {
                        setEditingRowId(null);
                      }
                    }}
                    className="flex-1 min-w-0 px-2 py-1 rounded text-xs bg-slate-50 dark:bg-[#0D1320] border border-blue-400 text-slate-900 dark:text-white"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = editingRowName.trim();
                      if (clean) onUpdateRow(row.id, { name: clean.toUpperCase() });
                      setEditingRowId(null);
                    }}
                    className="p-1 rounded bg-blue-600 text-white shrink-0"
                    title="Concluir"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingRowId(null)}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                    title="Cancelar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CategoryIconBadge row={row} size="xs" />
                    <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {row.name}
                    </span>
                    {row.hidden && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-300 shrink-0">
                        (Oculta)
                      </span>
                    )}
                  </div>
                  <div
                    className={`flex items-center gap-0.5 shrink-0 transition-opacity ${
                      customizeGridMode ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRowId(row.id);
                        setEditingRowName(row.name);
                      }}
                      className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                      title="Editar nome, cor ou ícone"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {customizeGridMode && (
                      <>
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
                          className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-amber-300"
                          title={row.hidden ? 'Mostrar linha' : t.matrix.hideRow}
                        >
                          {row.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRow(row.id)}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500"
                          title="Excluir linha"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
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
                      ? 'bg-blue-50/70 dark:bg-blue-950/25 text-slate-900 dark:text-slate-100 hover:bg-blue-100/70'
                      : val === 0
                      ? 'text-slate-400 dark:text-slate-600 hover:bg-slate-100/80 dark:hover:bg-white/[0.04]'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-blue-50/50 dark:hover:bg-white/[0.04]'
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

            <td className="md:sticky md:right-0 md:z-10 bg-slate-50/95 dark:bg-[#0D1320]/95 group-hover:bg-slate-100 dark:group-hover:bg-[#1A2234] border-l border-slate-200 dark:border-white/[0.08] px-3 sm:px-3.5 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100 min-w-[116px] sm:min-w-[132px]">
              {formatBRL(annual, privacyMode)}
            </td>
          </tr>

          {isEditingThis && (
            <tr className="bg-slate-50 dark:bg-[#0D1320] border-b border-blue-200 dark:border-blue-500/30">
              <td colSpan={visibleMonths.length + 2} className="px-4 py-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 max-w-2xl">
                  <div className="flex-1">
                    <CategoryVisualPicker
                      color={visual.color}
                      icon={visual.iconKey}
                      onChangeColor={(nextColor) => onUpdateRow(row.id, { color: nextColor })}
                      onChangeIcon={(nextIcon) => onUpdateRow(row.id, { icon: nextIcon })}
                      compact
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={row.block}
                      onChange={(e) => onUpdateRow(row.id, { block: e.target.value as BlockType })}
                      className="px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-800 dark:text-slate-200"
                    >
                      <option value="income">{t.settings.grid.blockIncome}</option>
                      <option value="fixed">{t.settings.grid.blockFixed}</option>
                      <option value="variable">{t.settings.grid.blockVariable}</option>
                      <option value="savings">{t.settings.grid.blockSavings}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => onToggleHideRow(row.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-white/[0.1] text-slate-600 dark:text-slate-300"
                    >
                      {row.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      <span>{row.hidden ? 'Mostrar' : 'Ocultar'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRowId(null);
                        onDeleteRow(row.id);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-500/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Excluir</span>
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="space-y-5 sm:space-y-6 pb-2 lg:pb-6">
      {/* ==================== 0A. ACESSO RÁPIDO MOBILE-FIRST (+ ENTRADA / - DESPESA / + COMPRA CARTÃO) ==================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
        <div className="flex items-center gap-4 min-w-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span className="block text-[11px] font-medium">
              {activeBankAccounts.length > 0
                ? `Saldo em Conta (${activeBankAccounts.length} ativa${activeBankAccounts.length === 1 ? '' : 's'})`
                : `Livre c/ Saldo Ant. (${monthNamesShort[focusMonth]})`}
            </span>
            <strong
              className={`text-lg sm:text-xl font-mono tabular-nums ${
                displayAccountBalance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatBRL(displayAccountBalance, privacyMode, true)}
            </strong>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onQuickEntry('income')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Entrada</span>
          </button>
          <button
            type="button"
            onClick={() => onQuickEntry('expense')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <Minus className="h-3.5 w-3.5" />
            <span>Despesa</span>
          </button>
          {onQuickVoiceEntry && (
            <button
              type="button"
              onClick={onQuickVoiceEntry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
              title="Lançar gasto ou receita falando uma frase"
            >
              <Mic className="h-3.5 w-3.5" />
              <span>Por Voz</span>
            </button>
          )}
          <button
            type="button"
            onClick={onQuickCardPurchase}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>Compra Cartão</span>
          </button>
        </div>
      </div>

      {/* ==================== 0B. QUANTO AINDA PODE GASTAR NO MÊS + PREVISÃO & ALERTAS ==================== */}
      <MonthlyBudgetHero
        rows={rows}
        entries={entries}
        accounts={accounts}
        recurringBills={recurringBills}
        creditCards={creditCards}
        cardPurchases={cardPurchases}
        paidCardInvoices={paidCardInvoices}
        totals={totals}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        onFocusRecurrences={() =>
          dailyControlRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      />

      {/* ==================== 1. PAINEL PRINCIPAL: CAIXINHA, CARTÕES & EXTRATO DO MÊS ==================== */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        {/* Top Spotlight Header with Month Selector */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-[#0D1320] border-b border-slate-200 dark:border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">
                Resumo de {monthNamesShort[focusMonth]}
              </div>
              <h1 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
                {monthNamesFull[focusMonth]} {activeYear}
              </h1>
            </div>
          </div>

          {/* Month & Unlimited Year Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl bg-white dark:bg-[#1A2234]/80 border border-slate-200 dark:border-white/[0.08] overflow-hidden shrink-0">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => {
                  const prev = shiftYearMonth(activeYear, focusMonth, -1);
                  onUpdateSettings({ activeYear: prev.year, focusMonth: prev.month });
                }}
                className="px-2 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                title="Mês anterior (navega entre anos)"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Ano anterior"
                onClick={() => onUpdateSettings({ activeYear: Math.max(1900, activeYear - 1) })}
                className="px-2 py-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border-l border-slate-200 dark:border-white/[0.08]"
                title="Ano anterior"
              >
                −
              </button>
              <span className="px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                {activeYear}
              </span>
              <button
                type="button"
                aria-label="Próximo ano"
                onClick={() => onUpdateSettings({ activeYear: activeYear + 1 })}
                className="px-2 py-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border-r border-slate-200 dark:border-white/[0.08]"
                title="Próximo ano (2027, 2028+)"
              >
                +
              </button>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => {
                  const next = shiftYearMonth(activeYear, focusMonth, 1);
                  onUpdateSettings({ activeYear: next.year, focusMonth: next.month });
                }}
                className="px-2 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                title="Próximo mês (cruza Dec → Jan)"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#1A2234]/80 border border-slate-200 dark:border-white/[0.08]">
              {monthNamesShort.map((mName, idx) => (
                <button
                  key={mName}
                  type="button"
                  onClick={() => onUpdateSettings({ focusMonth: idx })}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-colors whitespace-nowrap shrink-0 ${
                    focusMonth === idx
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {mName}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4 Core KPIs: Saldo Disponível, Caixinha (Reserva Isolada), Fatura do Mês, Limite Cartões */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/[0.07] border-b border-slate-200 dark:border-white/[0.08]">
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Saldo Disponível no Mês
            </div>
            <div
              className={`mt-1.5 text-2xl font-semibold font-mono tabular-nums ${
                displayAccountBalance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatBRL(displayAccountBalance, privacyMode, true)}
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Entradas {formatBRL(spotlight.income, privacyMode)} · Saídas {formatBRL(spotlight.totalExpense, privacyMode)}
            </div>
            {previousMonthCarryover !== 0 && (
              <div className="mt-0.5 text-[10px] font-mono tabular-nums text-blue-600 dark:text-blue-400 truncate">
                Inclui saldo ant.: {formatBRL(previousMonthCarryover, privacyMode, true)}
              </div>
            )}
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Caixinha (Guardado)
              </span>
              <PiggyBank className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-blue-600 dark:text-blue-400">
              {formatBRL(continuousSummary.isolatedSavingsTotal, privacyMode)}
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              Em {monthNamesShort[focusMonth]}: {formatBRL(spotlight.savings, privacyMode)} · Isolado dos gastos
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Fatura do Mês ({monthNamesShort[focusMonth]})
              </span>
              <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatBRL(displayMonthInvoice, privacyMode)}
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              {creditCards.length > 0
                ? `Em aberto: ${formatBRL(cardsOverview.monthUnpaidInvoice, privacyMode)}`
                : 'Nenhum cartão cadastrado'}
            </div>
          </div>

          <div className="p-5 bg-slate-50/70 dark:bg-[#151D2E]">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Limite Livre dos Cartões
            </div>
            <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatBRL(cardsOverview.totalAvailable, privacyMode)}
            </div>
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              Comprometido: {formatBRL(cardsOverview.totalCommitted, privacyMode)} de {formatBRL(cardsOverview.totalLimit, privacyMode)}
            </div>
          </div>
        </div>

        {/* Cartões, Modalidades, Gráfico de Pizza e Extrato Direto */}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Cartões Cadastrados + Modalidades (Crédito vs Débito vs Pix) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t.matrix.openFinanceTitle}
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium">
                <button
                  type="button"
                  onClick={onOpenCardsHub}
                  className="text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  Ver Cartões ({creditCards.length})
                </button>
                <button
                  type="button"
                  onClick={onOpenAccountsHub}
                  className="text-slate-500 dark:text-slate-400 hover:underline whitespace-nowrap"
                >
                  {accounts.length}/5 {t.matrix.accountsRatio}
                </button>
              </div>
            </div>

            {/* Credit Cards Overview Cards */}
            <div className="space-y-2">
              {cardsOverview.summaries.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-dashed border-slate-300 dark:border-white/[0.1] flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Nenhum cartão cadastrado.
                  </div>
                  <button
                    type="button"
                    onClick={onOpenCardsHub}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
                  >
                    + Cartão
                  </button>
                </div>
              ) : (
                cardsOverview.summaries.map((s) => (
                  <button
                    key={s.card.id}
                    type="button"
                    onClick={onOpenCardsHub}
                    className="w-full text-left p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] hover:border-blue-400 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: s.card.bankColor || '#2563EB' }}
                        />
                        <span className="truncate">
                          {s.card.bankName}
                          {s.card.nickname ? ` · ${s.card.nickname}` : ''}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            s.closingInfo.status === 'closes_today'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                              : s.closingInfo.status === 'closed_best_window'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                          }`}
                        >
                          {s.closingInfo.closingNotice}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        Livre: {formatBRL(s.availableLimit, privacyMode)} ·{' '}
                        <span className="text-slate-500 dark:text-slate-400">
                          {s.committedUntil ? `Até ${s.committedUntil.label}` : 'Sem parcelas'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatBRL(s.monthInvoiceAmount, privacyMode)}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {s.monthInvoicePaid ? 'Paga' : `Venc. ${formatCompactDay(s.card.dueDay)}`}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Credit vs Debit vs Pix + À Vista vs Parcelado */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] space-y-3">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.matrix.paymentDist} ({monthNamesShort[focusMonth]})
              </div>

              <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden flex">
                <div
                  style={{ width: `${creditPct}%` }}
                  className="bg-blue-600 transition-all"
                  title={`${t.matrix.credit}: ${creditPct}%`}
                />
                <div
                  style={{ width: `${debitPct}%` }}
                  className="bg-indigo-500 transition-all"
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
                  <div className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatBRL(spotlight.creditSpent, privacyMode)}
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                    {t.matrix.debit} ({debitPct}%)
                  </div>
                  <div className="font-semibold text-indigo-600 dark:text-indigo-400">
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
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatBRL(spotlight.installmentSpent, privacyMode)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Gráfico Interativo de Cartões + Extrato Direto */}
          <div className="lg:col-span-7 flex flex-col space-y-5">
            <CreditCardPieChart
              summaries={cardsOverview.summaries}
              totalLimit={cardsOverview.totalLimit}
              totalCommitted={cardsOverview.totalCommitted}
              totalAvailable={cardsOverview.totalAvailable}
              privacyMode={privacyMode}
            />

            <div className="flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t.matrix.directFeedTitle} ({monthNamesShort[focusMonth]})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t.matrix.directFeedSub}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] max-w-full">
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
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                        feedFilter === f.id
                          ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 shadow-xs'
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
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex-1 rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden max-h-[260px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.05]">
                {filteredFeed.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    {t.matrix.noFeedMoves} {monthNamesFull[focusMonth]}.
                  </div>
                ) : (
                  filteredFeed.map((tx) => {
                    const targetRow = rowMap.get(tx.rowId);
                    const isIncome = tx.block === 'income';
                    return (
                      <div
                        key={tx.id}
                        onClick={() => targetRow && onSelectCell(targetRow, focusMonth)}
                        className="px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-[#1A2234]/60 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CategoryIconBadge row={targetRow} size="xs" />
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                            D/{String(tx.day).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                              <span className="truncate">{tx.merchant}</span>
                              {tx.isInstallment && (
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300">
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
                                    ? 'text-blue-600 dark:text-blue-400 font-medium'
                                    : tx.paymentMethod === 'debit'
                                    ? 'text-indigo-600 dark:text-indigo-400 font-medium'
                                    : 'text-emerald-600 dark:text-emerald-400 font-medium'
                                }
                              >
                                {translatePaymentMethod(tx.paymentMethod, language)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div
                            className={`font-mono font-semibold tabular-nums ${
                              tx.isDeduplicated
                                ? 'text-slate-400 dark:text-slate-500 line-through'
                                : isIncome
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : tx.block === 'savings'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {formatBRL(isIncome ? tx.amount : -tx.amount, privacyMode, isIncome)}
                          </div>
                          {onDuplicateEntryById && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDuplicateEntryById(tx.id);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/15 transition-colors"
                              title="Duplicar lançamento em 1 toque"
                              aria-label="Duplicar lançamento"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== 1B. CENTRAL DE CONTROLE DIÁRIO (RECORRENTES, LIMITES, PARCELAS & BUSCA) ==================== */}
      <div ref={dailyControlRef}>
        <DailyControlHub
          rows={rows}
          entries={entries}
          accounts={accounts}
          creditCards={creditCards}
          cardPurchases={cardPurchases}
          paidCardInvoices={paidCardInvoices}
          recurringBills={recurringBills}
          totals={totals}
          activeYear={activeYear}
          focusMonth={focusMonth}
          privacyMode={privacyMode}
          language={language}
          alertLeadDays={settings.alertLeadDays ?? 3}
          onAddRecurringBill={onAddRecurringBill}
          onUpdateRecurringBill={onUpdateRecurringBill}
          onDeleteRecurringBill={onDeleteRecurringBill}
          onUpdateRow={onUpdateRow}
          onSelectCell={onSelectCell}
          onOpenCardsHub={onOpenCardsHub}
        />
      </div>

      {/* Alert Banner (compact) */}
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

      {/* ==================== 2. VISÃO ANUAL, METAS & GRADE COMPLETA (RECOLHÍVEL) ==================== */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowAnnualSection((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-blue-400/60 transition-colors"
        >
          <span>
            {showAnnualSection
              ? `Ocultar Visão Anual, Metas & Grade Completa (${activeYear})`
              : `Ver Visão Anual, Metas & Grade Completa (${activeYear})`}
          </span>
          {showAnnualSection ? (
            <ChevronDown className="h-4 w-4 text-blue-600" />
          ) : (
            <ChevronRight className="h-4 w-4 text-blue-600" />
          )}
        </button>

        {showAnnualSection && (
          <div className="space-y-6">
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

            {/* Metas de Economia */}
            <section className="p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t.matrix.goalsTitle} ({activeYear})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onOpenGoalSettings}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
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
                    className="underline text-blue-600 dark:text-blue-400"
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
                              ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30'
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
                            status === 'achieved' ? 'bg-emerald-500' : 'bg-blue-600'
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

            {/* Consolidado Anual KPIs */}
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
                <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-blue-600 dark:text-blue-400">
                  {formatBRL(totals.savingsAnnual, privacyMode)}
                </div>
              </div>
            </div>

            {/* Grade Workspace Toolbar (sem botões de download/exportação/importação) */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06]">
                  <button
                    type="button"
                    aria-label="Ano anterior na grade"
                    onClick={() => onUpdateSettings({ activeYear: Math.max(1900, activeYear - 1) })}
                    className="px-2 py-1 rounded-md text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    −
                  </button>
                  {[activeYear - 1, activeYear, activeYear + 1, activeYear + 2].map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => onUpdateSettings({ activeYear: yr })}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-colors ${
                        activeYear === yr
                          ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {yr}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="Próximo ano na grade"
                    onClick={() => onUpdateSettings({ activeYear: activeYear + 1 })}
                    className="px-2 py-1 rounded-md text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    +
                  </button>
                </div>

                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t.matrix.filterCategoryPlaceholder}
                    className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => onUpdateSettings({ showZeroMonths: !showZeroMonths })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                    showZeroMonths
                      ? 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300'
                      : 'bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/40 text-blue-700 dark:text-blue-300'
                  }`}
                >
                  {showZeroMonths ? t.matrix.hideZeroMonths : t.matrix.showAll12Months}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {rows.some((r) => r.hidden) && (
                  <button
                    type="button"
                    onClick={() => setShowHiddenRows((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      showHiddenRows
                        ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-300'
                        : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Ocultas ({rows.filter((r) => r.hidden).length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setCustomizeGridMode((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                    customizeGridMode
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>{customizeGridMode ? 'Concluir linhas' : 'Personalizar linhas'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowNewRowForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t.matrix.addRow}</span>
                </button>
              </div>
            </div>

            {showNewRowForm && (
              <form
                onSubmit={handleCreateRow}
                className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-blue-300 dark:border-blue-500/40 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      {t.matrix.blockLabel}
                    </label>
                    <select
                      value={newRowBlock}
                      onChange={(e) => {
                        const nextBlock = e.target.value as BlockType;
                        setNewRowBlock(nextBlock);
                        setNewRowColor(getDefaultCategoryColor(nextBlock));
                        setNewRowIcon(getDefaultCategoryIcon(nextBlock));
                      }}
                      className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    >
                      <option value="income">{t.settings.grid.blockIncome}</option>
                      <option value="fixed">{t.settings.grid.blockFixed}</option>
                      <option value="variable">{t.settings.grid.blockVariable}</option>
                      <option value="savings">{t.settings.grid.blockSavings}</option>
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
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
                    >
                      {t.matrix.createRow}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewRowForm(false)}
                      className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 whitespace-nowrap"
                    >
                      {t.matrix.cancel}
                    </button>
                  </div>
                </div>

                <CategoryVisualPicker
                  color={newRowColor}
                  icon={newRowIcon}
                  onChangeColor={setNewRowColor}
                  onChangeIcon={setNewRowIcon}
                />
              </form>
            )}

            {/* Main Matrix Spreadsheet */}
            <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#0D1320] border-b border-slate-200 dark:border-white/[0.08]">
                <th className="sticky left-0 z-20 bg-slate-50 dark:bg-[#0D1320] border-r border-slate-200 dark:border-white/[0.08] px-2.5 sm:px-3.5 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 min-w-[144px] max-w-[172px] sm:min-w-[205px] sm:max-w-[260px]">
                  {t.matrix.colCategoryRef}
                </th>
                {visibleMonths.map((m) => (
                  <th
                    key={m}
                    onClick={() => onUpdateSettings({ focusMonth: m })}
                    className={`px-3 py-3 text-right text-xs font-semibold border-r border-slate-200/60 dark:border-white/[0.04] min-w-[104px] sm:min-w-[108px] cursor-pointer transition-colors ${
                      m === focusMonth
                        ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                    title={monthNamesFull[m]}
                  >
                    {monthNamesShort[m]}
                  </th>
                ))}
                <th className="md:sticky md:right-0 md:z-20 bg-slate-100 dark:bg-[#1A2234] border-l border-slate-200 dark:border-white/[0.08] px-3 sm:px-3.5 py-3 text-right text-xs font-semibold text-blue-700 dark:text-blue-300 min-w-[116px] sm:min-w-[132px]">
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
                <td className="md:sticky md:right-0 md:z-10 bg-emerald-100/80 dark:bg-[#122D26] border-l border-slate-200 dark:border-white/[0.08] px-3 sm:px-3.5 py-2.5 text-right font-mono text-xs tabular-nums text-emerald-900 dark:text-emerald-200">
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
                <td className="md:sticky md:right-0 md:z-10 bg-slate-200/70 dark:bg-[#1F293D] border-l border-slate-200 dark:border-white/[0.08] px-3 sm:px-3.5 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white">
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
                <td className="md:sticky md:right-0 md:z-10 bg-slate-200/70 dark:bg-[#1F293D] border-l border-slate-200 dark:border-white/[0.08] px-3 sm:px-3.5 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white">
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
                <td className="md:sticky md:right-0 md:z-10 bg-slate-800 dark:bg-[#111827] border-l border-slate-700 dark:border-white/[0.1] px-3 sm:px-3.5 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-white">
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
                  className={`md:sticky md:right-0 md:z-10 bg-slate-100 dark:bg-[#1A2234] border-l border-slate-200 dark:border-white/[0.08] px-3 sm:px-3.5 py-3 text-right font-mono text-xs tabular-nums ${
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

              {/* GUARDADO / CAIXINHA (100% personalizável como os demais blocos) */}
              {savingsRows.map((row) => {
                const monthly = totals.rowMonthly[row.id] ?? Array(12).fill(0);
                const annual = totals.rowAnnual[row.id] ?? 0;
                const isEditingThis = editingRowId === row.id;
                const visual = getCategoryVisual(row);
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`group bg-blue-50/70 dark:bg-blue-950/20 hover:bg-blue-100/60 transition-colors ${
                        row.hidden ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-blue-50 dark:bg-[#161922] border-r border-slate-200 dark:border-white/[0.08] px-3 py-3 text-xs font-semibold text-blue-700 dark:text-blue-300">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1.5">
                            <CategoryIconBadge row={row} size="xs" />
                            <input
                              type="text"
                              value={editingRowName}
                              onChange={(e) => setEditingRowName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const clean = editingRowName.trim();
                                  if (clean) onUpdateRow(row.id, { name: clean.toUpperCase() });
                                  setEditingRowId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingRowId(null);
                                }
                              }}
                              className="flex-1 min-w-0 px-2 py-1 rounded text-xs bg-white dark:bg-[#0D1320] border border-blue-400 text-slate-900 dark:text-white"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const clean = editingRowName.trim();
                                if (clean) onUpdateRow(row.id, { name: clean.toUpperCase() });
                                setEditingRowId(null);
                              }}
                              className="p-1 rounded bg-blue-600 text-white shrink-0"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRowId(null)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2 min-w-0">
                              <CategoryIconBadge row={row} size="xs" />
                              <span className="truncate">
                                {row.name} ({t.matrix.reserveContribution})
                              </span>
                            </span>
                            <div
                              className={`flex items-center gap-0.5 shrink-0 transition-opacity ${
                                customizeGridMode
                                  ? 'opacity-100'
                                  : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRowId(row.id);
                                  setEditingRowName(row.name);
                                }}
                                className="p-1 rounded hover:bg-blue-200/60 dark:hover:bg-white/10 text-blue-500"
                                title="Editar nome, cor ou ícone"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              {customizeGridMode && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onToggleHideRow(row.id)}
                                    className="p-1 rounded hover:bg-blue-200/60 dark:hover:bg-white/10 text-blue-500"
                                    title={row.hidden ? 'Mostrar linha' : t.matrix.hideRow}
                                  >
                                    {row.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteRow(row.id)}
                                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500"
                                    title="Excluir linha"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      {visibleMonths.map((m) => (
                        <td
                          key={m}
                          onClick={() => onSelectCell(row, m)}
                          className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums text-blue-700 dark:text-blue-300 cursor-pointer hover:bg-blue-100/70 border-r border-blue-200/40"
                          title={monthNamesFull[m]}
                        >
                          {formatBRL(monthly[m] ?? 0, privacyMode)}
                        </td>
                      ))}
                      <td className="md:sticky md:right-0 md:z-10 bg-blue-100/80 dark:bg-[#1E212B] border-l border-slate-200 dark:border-white/[0.08] px-3 sm:px-3.5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-blue-800 dark:text-blue-300">
                        <div>{formatBRL(annual, privacyMode)}</div>
                        <div className="text-[10px] font-sans font-normal opacity-80">
                          {t.matrix.totalValueSub}
                        </div>
                      </td>
                    </tr>
                    {isEditingThis && (
                      <tr className="bg-slate-50 dark:bg-[#0D1320] border-b border-blue-200 dark:border-blue-500/30">
                        <td colSpan={visibleMonths.length + 2} className="px-4 py-3">
                          <div className="max-w-xl">
                            <CategoryVisualPicker
                              color={visual.color}
                              icon={visual.iconKey}
                              onChangeColor={(nextColor) => onUpdateRow(row.id, { color: nextColor })}
                              onChangeIcon={(nextIcon) => onUpdateRow(row.id, { icon: nextIcon })}
                              compact
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
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
        )}
      </div>
    </div>
  );
};
