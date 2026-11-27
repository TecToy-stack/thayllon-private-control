import {
  AlertItem,
  AppSettings,
  AppState,
  BankAccount,
  BlockType,
  CategoryRow,
  CreditCardAccount,
  CreditCardPurchase,
  EntryNature,
  MatrixTotals,
  PaymentMethod,
  RecurringBill,
  RecurringBillStatus,
  SavingsGoal,
  TimelineEvent,
  TransactionEntry,
} from '../types/finance';
import { MONTH_NAMES_SHORT } from '../data/initialData';
import { computeAllCreditCardsOverview } from './creditCardsEngine';

export interface InstallmentParsedInfo {
  isInstallment: boolean;
  current: number;
  total: number;
  remainingCount: number;
  installmentAmount: number;
  remainingTotalAmount: number;
  shortLabel: string;
}

export function isDeduplicatedEntry(entry: TransactionEntry): boolean {
  return entry.entryNature === 'internal_transfer' || entry.entryNature === 'invoice_payment';
}

export function parseInstallmentInfo(entry: TransactionEntry): InstallmentParsedInfo {
  let current = entry.installmentCurrent;
  let total = entry.installmentTotal;

  if ((!current || !total) && entry.installments) {
    const match = entry.installments.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
      current = parseInt(match[1], 10);
      total = parseInt(match[2], 10);
    }
  }

  const validCurrent = Number.isFinite(current) && (current ?? 0) >= 1 ? Math.trunc(current!) : 1;
  const validTotal = Number.isFinite(total) && (total ?? 0) >= 1 ? Math.trunc(total!) : 1;

  if (validTotal <= 1) {
    return {
      isInstallment: false,
      current: 1,
      total: 1,
      remainingCount: 0,
      installmentAmount: entry.amount,
      remainingTotalAmount: 0,
      shortLabel: 'À vista',
    };
  }

  const clampedCurrent = Math.min(validCurrent, validTotal);
  const remainingCount = Math.max(0, validTotal - clampedCurrent);
  const safeAmount = Number.isFinite(entry.amount) ? entry.amount : 0;

  return {
    isInstallment: true,
    current: clampedCurrent,
    total: validTotal,
    remainingCount,
    installmentAmount: safeAmount,
    remainingTotalAmount: Number((remainingCount * safeAmount).toFixed(2)),
    shortLabel: `${clampedCurrent}/${validTotal}`,
  };
}

export function formatBRL(value: number, privacyMode = false, showSign = false): string {
  if (privacyMode) {
    return 'R$ ••••••';
  }
  const safeValue = Number.isFinite(value) ? value : 0;
  const absFormatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safeValue));

  if (safeValue < 0) return `-${absFormatted}`;
  if (showSign && safeValue > 0) return `+${absFormatted}`;
  return absFormatted;
}

export function formatCompactDay(refDay?: number): string {
  if (!refDay) return 'Sem dia fixo';
  return `D/${String(refDay).padStart(2, '0')}`;
}

export function formatPaymentMethodLabel(method?: PaymentMethod): string {
  switch (method) {
    case 'credit':
      return 'Crédito';
    case 'debit':
      return 'Débito';
    case 'pix':
      return 'Pix';
    case 'transfer':
      return 'Transferência';
    case 'cash':
      return 'Dinheiro';
    default:
      return 'Débito / Manual';
  }
}

export function computeMatrixTotals(
  rows: CategoryRow[],
  entries: TransactionEntry[],
  year: number
): MatrixTotals {
  const rowMonthly: Record<string, number[]> = {};
  const rowAnnual: Record<string, number> = {};
  const rowAverage: Record<string, number> = {};

  rows.forEach((row) => {
    rowMonthly[row.id] = Array(12).fill(0);
  });

  entries.forEach((entry) => {
    if (entry.year !== year) return;
    if (!rowMonthly[entry.rowId]) return;
    if (!Number.isInteger(entry.month) || entry.month < 0 || entry.month > 11) return;
    if (!Number.isFinite(entry.amount)) return;
    // Open Finance anti-duplicidade: transferências internas e pagamentos de fatura
    // não inflam receitas/despesas reais da matriz consolidada.
    if (isDeduplicatedEntry(entry)) return;
    rowMonthly[entry.rowId][entry.month] += entry.amount;
  });

  rows.forEach((row) => {
    const arr = rowMonthly[row.id];
    const total = arr.reduce((sum, v) => sum + v, 0);
    rowAnnual[row.id] = Number(total.toFixed(2));
    const activeMonths = arr.filter((v) => v > 0).length || 1;
    rowAverage[row.id] = Number((total / activeMonths).toFixed(2));
  });

  const sumBlockMonthly = (block: BlockType) => {
    const monthly = Array(12).fill(0);
    rows
      .filter((r) => r.block === block && !r.hidden)
      .forEach((r) => {
        for (let m = 0; m < 12; m++) {
          monthly[m] += rowMonthly[r.id]?.[m] ?? 0;
        }
      });
    return monthly.map((v) => Number(v.toFixed(2)));
  };

  const incomeMonthly = sumBlockMonthly('income');
  const fixedMonthly = sumBlockMonthly('fixed');
  const variableMonthly = sumBlockMonthly('variable');
  const savingsMonthly = sumBlockMonthly('savings');

  const totalExpenseMonthly = Array.from({ length: 12 }, (_, m) =>
    Number((fixedMonthly[m] + variableMonthly[m]).toFixed(2))
  );
  const resultMonthly = Array.from({ length: 12 }, (_, m) =>
    Number((incomeMonthly[m] - totalExpenseMonthly[m]).toFixed(2))
  );

  const sumArr = (arr: number[]) => Number(arr.reduce((a, b) => a + b, 0).toFixed(2));

  return {
    rowMonthly,
    rowAnnual,
    rowAverage,
    incomeMonthly,
    incomeAnnual: sumArr(incomeMonthly),
    fixedMonthly,
    fixedAnnual: sumArr(fixedMonthly),
    variableMonthly,
    variableAnnual: sumArr(variableMonthly),
    totalExpenseMonthly,
    totalExpenseAnnual: sumArr(totalExpenseMonthly),
    resultMonthly,
    resultAnnual: sumArr(resultMonthly),
    savingsMonthly,
    savingsAnnual: sumArr(savingsMonthly),
  };
}

export interface MonthSpotlightData {
  month: number;
  year: number;
  income: number;
  fixedExpense: number;
  variableExpense: number;
  totalExpense: number;
  result: number;
  savings: number;
  creditSpent: number;
  debitSpent: number;
  pixSpent: number;
  otherSpent: number;
  spotSpent: number;
  installmentSpent: number;
  installmentRemainingTotal: number;
  excludedTransfersCount: number;
  excludedTransfersTotal: number;
  cardInvoices: {
    id: string;
    name: string;
    closingDay?: number;
    dueDay?: number;
    amount: number;
    creditLimit?: number;
    availableLimit?: number;
    accountLabel: string;
    status: string;
    needsReconnect?: boolean;
  }[];
  totalCardInvoices: number;
  transactions: {
    id: string;
    day: number;
    merchant: string;
    description: string;
    categoryName: string;
    rowId: string;
    block: BlockType;
    paymentMethod: PaymentMethod;
    entryNature: EntryNature;
    isDeduplicated: boolean;
    isInstallment: boolean;
    installmentLabel: string;
    installmentRemainingAmount: number;
    accountId: string;
    accountLabel: string;
    amount: number;
    status: string;
    source: string;
  }[];
}

export function computeMonthSpotlight(
  rows: CategoryRow[],
  entries: TransactionEntry[],
  accounts: BankAccount[],
  totals: MatrixTotals,
  year: number,
  month: number
): MonthSpotlightData {
  const safeMonth = Math.min(11, Math.max(0, Number.isFinite(month) ? Math.trunc(month) : 10));
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const accMap = new Map(accounts.map((a) => [a.id, a]));

  const monthEntries = entries
    .filter((e) => e.year === year && e.month === safeMonth)
    .filter((e) => {
      const r = rowMap.get(e.rowId);
      return r && !r.hidden;
    })
    .sort((a, b) => b.day - a.day);

  let creditSpent = 0;
  let debitSpent = 0;
  let pixSpent = 0;
  let otherSpent = 0;
  let spotSpent = 0;
  let installmentSpent = 0;
  let installmentRemainingTotal = 0;
  let excludedTransfersCount = 0;
  let excludedTransfersTotal = 0;

  monthEntries.forEach((e) => {
    const r = rowMap.get(e.rowId);
    if (!r) return;
    const amt = Number.isFinite(e.amount) ? e.amount : 0;

    if (isDeduplicatedEntry(e)) {
      excludedTransfersCount += 1;
      excludedTransfersTotal += amt;
      return;
    }

    if (r.block !== 'fixed' && r.block !== 'variable') return;

    const pm = e.paymentMethod ?? (r.id.includes('cartao') ? 'credit' : 'debit');
    if (pm === 'credit') creditSpent += amt;
    else if (pm === 'debit') debitSpent += amt;
    else if (pm === 'pix') pixSpent += amt;
    else otherSpent += amt;

    const inst = parseInstallmentInfo({ ...e, amount: amt });
    if (inst.isInstallment) {
      installmentSpent += amt;
      installmentRemainingTotal += inst.remainingTotalAmount;
    } else {
      spotSpent += amt;
    }
  });

  // Card Invoices for the selected month
  const cardRows = rows.filter(
    (r) =>
      !r.hidden &&
      (r.id.includes('cartao') || r.name.toUpperCase().includes('CARTÃO'))
  );

  const cardInvoices = cardRows.map((r) => {
    const amount = totals.rowMonthly[r.id]?.[safeMonth] ?? 0;
    const matchingEntry = monthEntries.find((e) => e.rowId === r.id && !isDeduplicatedEntry(e));
    const acc =
      (matchingEntry ? accMap.get(matchingEntry.accountId) : undefined) ??
      accounts.find((a) => a.defaultRowId === r.id && a.type === 'Cartão de Crédito');

    const availableLimit =
      acc?.creditLimit !== undefined
        ? Number(
            Math.max(
              0,
              acc.availableLimit !== undefined ? acc.availableLimit : acc.creditLimit - amount
            ).toFixed(2)
          )
        : undefined;

    let statusText = 'Sem fatura';
    if (acc?.status === 'paused') {
      statusText = 'Pausada';
    } else if (acc?.currentInvoiceStatus === 'paid') {
      statusText = 'Paga / Conciliada';
    } else if (acc?.currentInvoiceStatus === 'closed') {
      statusText = 'Fechada';
    } else if (acc?.currentInvoiceStatus === 'open' || matchingEntry?.status === 'projected') {
      statusText = 'Em aberto';
    } else if (amount > 0) {
      statusText = matchingEntry?.status === 'paid' ? 'Fechada / Conciliada' : 'Em aberto';
    }

    return {
      id: r.id,
      name: r.name,
      closingDay: acc?.invoiceClosingDay,
      dueDay: acc?.invoiceDueDay ?? r.refDay,
      amount,
      creditLimit: acc?.creditLimit,
      availableLimit,
      accountLabel: acc ? `${acc.institution} (${acc.maskedAccount})` : 'Cartão Vinculado',
      status: statusText,
      needsReconnect: false,
    };
  });

  const totalCardInvoices = cardInvoices.reduce((s, c) => s + (Number.isFinite(c.amount) ? c.amount : 0), 0);

  const transactions = monthEntries.map((e) => {
    const r = rowMap.get(e.rowId)!;
    const acc = accMap.get(e.accountId);
    const pm: PaymentMethod =
      e.paymentMethod ?? (r.id.includes('cartao') ? 'credit' : r.block === 'income' ? 'pix' : 'debit');
    const amt = Number.isFinite(e.amount) ? e.amount : 0;
    const inst = parseInstallmentInfo({ ...e, amount: amt });
    const entryNature: EntryNature = e.entryNature ?? 'standard';
    return {
      id: e.id,
      day: e.day,
      merchant: e.merchant?.trim() || e.description,
      description: e.description,
      categoryName: r.name,
      rowId: r.id,
      block: r.block,
      paymentMethod: pm,
      entryNature,
      isDeduplicated: isDeduplicatedEntry(e),
      isInstallment: inst.isInstallment,
      installmentLabel: inst.shortLabel,
      installmentRemainingAmount: inst.remainingTotalAmount,
      accountId: e.accountId,
      accountLabel: acc ? acc.institution : 'Manual',
      amount: amt,
      status: e.status,
      source: e.source,
    };
  });

  return {
    month: safeMonth,
    year,
    income: totals.incomeMonthly[safeMonth] ?? 0,
    fixedExpense: totals.fixedMonthly[safeMonth] ?? 0,
    variableExpense: totals.variableMonthly[safeMonth] ?? 0,
    totalExpense: totals.totalExpenseMonthly[safeMonth] ?? 0,
    result: totals.resultMonthly[safeMonth] ?? 0,
    savings: totals.savingsMonthly[safeMonth] ?? 0,
    creditSpent: Number(creditSpent.toFixed(2)),
    debitSpent: Number(debitSpent.toFixed(2)),
    pixSpent: Number(pixSpent.toFixed(2)),
    otherSpent: Number(otherSpent.toFixed(2)),
    spotSpent: Number(spotSpent.toFixed(2)),
    installmentSpent: Number(installmentSpent.toFixed(2)),
    installmentRemainingTotal: Number(installmentRemainingTotal.toFixed(2)),
    excludedTransfersCount,
    excludedTransfersTotal: Number(excludedTransfersTotal.toFixed(2)),
    cardInvoices,
    totalCardInvoices: Number(totalCardInvoices.toFixed(2)),
    transactions,
  };
}

export interface GoalProgressResult {
  goal: SavingsGoal;
  currentAmount: number;
  pct: number;
  remaining: number;
  status: 'achieved' | 'ontrack' | 'behind';
  statusLabel: string;
}

export function computeGoalProgress(
  goal: SavingsGoal,
  totals: MatrixTotals,
  activeYear: number
): GoalProgressResult {
  let currentAmount = 0;
  const clampedDeadlineMonth = Math.min(
    11,
    Math.max(0, Number.isFinite(goal.deadlineMonth) ? Math.trunc(goal.deadlineMonth) : 11)
  );
  const maxMonth = goal.deadlineYear === activeYear ? clampedDeadlineMonth : 11;
  const safeTarget = Number.isFinite(goal.targetAmount) && goal.targetAmount > 0 ? goal.targetAmount : 0;

  if (goal.trackingMode === 'savings') {
    currentAmount = totals.savingsMonthly
      .slice(0, maxMonth + 1)
      .reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  } else if (goal.trackingMode === 'result') {
    currentAmount = totals.resultMonthly
      .slice(0, maxMonth + 1)
      .reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  } else {
    const sav = totals.savingsMonthly
      .slice(0, maxMonth + 1)
      .reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    const res = totals.resultMonthly
      .slice(0, maxMonth + 1)
      .reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    currentAmount = sav + Math.max(0, res);
  }

  currentAmount = Number((Number.isFinite(currentAmount) ? currentAmount : 0).toFixed(2));
  const rawPct = safeTarget > 0 ? (currentAmount / safeTarget) * 100 : 0;
  const pct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, Number(rawPct.toFixed(1)))) : 0;
  const remaining = safeTarget > 0 ? Math.max(0, Number((safeTarget - currentAmount).toFixed(2))) : 0;

  let status: GoalProgressResult['status'] = 'ontrack';
  let statusLabel = 'Em andamento';
  if (safeTarget > 0 && currentAmount >= safeTarget) {
    status = 'achieved';
    statusLabel = 'Meta Atingida';
  } else if (pct < 40) {
    status = 'behind';
    statusLabel = 'Atenção ao ritmo';
  } else {
    status = 'ontrack';
    statusLabel = 'Ritmo Saudável';
  }

  return { goal, currentAmount, pct, remaining, status, statusLabel };
}

export function computeAlerts(
  rows: CategoryRow[],
  entries: TransactionEntry[],
  totals: MatrixTotals,
  settings: AppSettings
): AlertItem[] {
  const alerts: AlertItem[] = [];

  rows.forEach((row) => {
    if (row.hidden) return;
    const monthly = totals.rowMonthly[row.id] ?? [];
    const avg = totals.rowAverage[row.id] ?? 0;

    let latestMonth = -1;
    for (let m = 11; m >= 0; m--) {
      if (monthly[m] > 0) {
        latestMonth = m;
        break;
      }
    }

    if (row.block === 'fixed' || row.block === 'variable') {
      if (row.alertLimit && latestMonth >= 0 && monthly[latestMonth] > row.alertLimit) {
        alerts.push({
          id: `alert-limit-${row.id}-${latestMonth}`,
          severity: monthly[latestMonth] > row.alertLimit * 1.2 ? 'critical' : 'warning',
          type: 'ceiling',
          title: `${row.name} acima do teto em ${MONTH_NAMES_SHORT[latestMonth]}`,
          description: `Gasto de ${formatBRL(monthly[latestMonth])} superou o teto definido de ${formatBRL(row.alertLimit)}.`,
          rowId: row.id,
          month: latestMonth,
          amount: monthly[latestMonth],
        });
      }

      if (avg > 0) {
        let peakMonth = -1;
        let peakVal = 0;
        monthly.forEach((v, m) => {
          if (v > peakVal) {
            peakVal = v;
            peakMonth = m;
          }
        });
        const thresholdPct = row.alertPctThreshold ?? settings.anomalyThresholdPct;
        if (peakMonth >= 0 && peakVal > avg * (1 + thresholdPct / 100) && peakVal > 200) {
          alerts.push({
            id: `alert-spike-${row.id}-${peakMonth}`,
            severity: 'warning',
            type: 'anomaly',
            title: `Pico atípico em ${row.name} (${MONTH_NAMES_SHORT[peakMonth]})`,
            description: `Atingiu ${formatBRL(peakVal)}, ${Math.round(((peakVal - avg) / avg) * 100)}% acima da média (${formatBRL(avg)}).`,
            rowId: row.id,
            month: peakMonth,
            amount: peakVal,
          });
        }
      }
    } else if (row.block === 'income' && avg > 0) {
      monthly.forEach((v, m) => {
        if (v > avg * 2.5 && v > 2500) {
          alerts.push({
            id: `alert-inflow-${row.id}-${m}`,
            severity: 'info',
            type: 'extraordinary',
            title: `Entrada extraordinária em ${row.name} (${MONTH_NAMES_SHORT[m]})`,
            description: `Recebimento de ${formatBRL(v)} muito acima da média mensal (${formatBRL(avg)}).`,
            rowId: row.id,
            month: m,
            amount: v,
          });
        }
      });
    }
  });

  totals.resultMonthly.forEach((res, m) => {
    if (totals.incomeMonthly[m] === 0 && totals.totalExpenseMonthly[m] === 0) return;
    if (res < 0) {
      alerts.push({
        id: `alert-neg-result-${m}`,
        severity: 'critical',
        type: 'cashflow',
        title: `Déficit mensal em ${MONTH_NAMES_SHORT[m]}`,
        description: `Despesas superaram receitas em ${formatBRL(Math.abs(res))} no fechamento de ${MONTH_NAMES_SHORT[m]}.`,
        month: m,
        amount: res,
      });
    }
  });

  const weight = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => weight[a.severity] - weight[b.severity]);
}

export interface TimelineFilter {
  window: 'month' | 'quarter' | 'semester' | 'year' | 'projection12';
  referenceMonth: number;
  types: Record<BlockType | 'cards' | 'alerts', boolean>;
  accountId: string;
  search: string;
}

export function buildTimelineEvents(
  rows: CategoryRow[],
  entries: TransactionEntry[],
  accounts: BankAccount[],
  alerts: AlertItem[],
  year: number,
  filter: TimelineFilter
): TimelineEvent[] {
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const alertByCell = new Map<string, AlertItem>();
  alerts.forEach((al) => {
    if (al.rowId && al.month !== undefined) {
      alertByCell.set(`${al.rowId}-${al.month}`, al);
    }
  });

  const baseEntries: TransactionEntry[] = entries.filter((e) => e.year === year);

  const allCandidateEntries: TransactionEntry[] = [...baseEntries];
  if (filter.window === 'projection12') {
    const totals = computeMatrixTotals(rows, entries, year);
    for (let offset = 0; offset < 6; offset++) {
      const projYear = year + 1;
      const projMonth = offset;
      rows.forEach((row) => {
        if (row.hidden) return;
        const avg = totals.rowAverage[row.id] ?? 0;
        if (avg <= 0) return;
        let projectedAmount = avg;
        if (row.id === 'inc-leticia') projectedAmount = 135;
        if (row.id === 'sav-guardado') projectedAmount = 500;
        if (row.id === 'var-ipva' || row.id === 'var-iptu') {
          projectedAmount = projMonth <= 3 ? 95 : 0;
        }
        if (projectedAmount <= 0) return;

        allCandidateEntries.push({
          id: `proj-${row.id}-${projYear}-${projMonth}`,
          rowId: row.id,
          year: projYear,
          month: projMonth,
          day: row.refDay ?? 15,
          amount: Number(projectedAmount.toFixed(2)),
          description: `${row.name} · Projeção ${MONTH_NAMES_SHORT[projMonth]}/${projYear}`,
          merchant: row.name,
          paymentMethod: row.id.includes('cartao') ? 'credit' : 'debit',
          accountId: 'manual',
          source: 'auto',
          status: 'projected',
          createdAt: `${projYear}-${String(projMonth + 1).padStart(2, '0')}-01T08:00:00Z`,
        });
      });
    }
  }

  const inWindow = (e: TransactionEntry) => {
    if (filter.window === 'month') return e.year === year && e.month === filter.referenceMonth;
    if (filter.window === 'quarter') {
      const start = Math.max(0, filter.referenceMonth - 2);
      return e.year === year && e.month >= start && e.month <= filter.referenceMonth;
    }
    if (filter.window === 'semester') {
      const start = Math.max(0, filter.referenceMonth - 5);
      return e.year === year && e.month >= start && e.month <= filter.referenceMonth;
    }
    if (filter.window === 'year') return e.year === year;
    return (e.year === year && e.month >= 6) || e.year === year + 1;
  };

  const filtered = allCandidateEntries
    .filter(inWindow)
    .filter((e) => {
      const row = rowMap.get(e.rowId);
      if (!row || row.hidden) return false;

      const isCard = row.id.includes('cartao') || row.name.includes('CARTÃO');
      if (isCard && !filter.types.cards && !filter.types[row.block]) return false;
      if (!isCard && !filter.types[row.block]) return false;
      if (isCard && !filter.types.cards) return false;

      if (filter.accountId !== 'all' && e.accountId !== filter.accountId) return false;

      if (filter.search.trim()) {
        const q = filter.search.toLowerCase();
        const match =
          row.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.merchant ?? '').toLowerCase().includes(q) ||
          (e.note ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.month !== b.month) return a.month - b.month;
      return a.day - b.day;
    });

  let runningBalance = 0;
  const events: TimelineEvent[] = [];

  filtered.forEach((e) => {
    const row = rowMap.get(e.rowId);
    if (!row) return;
    const safeMonth = Math.min(11, Math.max(0, Number.isFinite(e.month) ? Math.trunc(e.month) : 0));
    const safeDay = Math.min(31, Math.max(1, Number.isFinite(e.day) ? Math.trunc(e.day) : 15));
    const safeAmount = Number.isFinite(e.amount) ? e.amount : 0;
    const deduplicated = isDeduplicatedEntry(e);
    const isOutflow = row.block === 'fixed' || row.block === 'variable' || row.block === 'savings';
    const signedAmount = deduplicated ? 0 : isOutflow ? -safeAmount : safeAmount;
    runningBalance = Number((runningBalance + signedAmount).toFixed(2));

    const acc = accMap.get(e.accountId);
    const cellAlert = alertByCell.get(`${e.rowId}-${safeMonth}`);
    if (!filter.types.alerts && cellAlert && safeAmount === 0) return;

    const inst = parseInstallmentInfo({ ...e, amount: safeAmount });
    const dateISO = `${e.year}-${String(safeMonth + 1).padStart(2, '0')}-${String(
      Math.min(28, safeDay)
    ).padStart(2, '0')}`;

    events.push({
      id: e.id,
      dateISO,
      year: e.year,
      month: safeMonth,
      day: safeDay,
      title: e.merchant ? `${e.merchant} — ${e.description}` : e.description,
      categoryName: row.name,
      rowId: row.id,
      block: row.block,
      amount: safeAmount,
      signedAmount,
      accountId: e.accountId,
      accountLabel: acc ? acc.institution : 'Manual / Planilha',
      paymentMethod: e.paymentMethod,
      entryNature: e.entryNature ?? 'standard',
      isDeduplicated: deduplicated,
      installmentLabel: inst.isInstallment ? inst.shortLabel : undefined,
      installmentRemainingAmount: inst.isInstallment ? inst.remainingTotalAmount : undefined,
      merchant: e.merchant,
      source: e.source,
      status: e.status,
      projectedBalanceAfter: runningBalance,
      isAlert: Boolean(cellAlert),
      alertNote: cellAlert?.title,
    });
  });

  return events;
}

export interface InvestmentSimParams {
  initialCapital: number;
  monthlyContribution: number;
  months: number;
  cdiAnnualPct: number;
  ipcaAnnualPct: number;
  profile: 'conservador' | 'moderado' | 'arrojado';
}

export interface InvestmentScenarioPoint {
  month: number;
  contributed: number;
  conservative: number;
  base: number;
  optimistic: number;
}

export interface InvestmentSimResult {
  points: InvestmentScenarioPoint[];
  finalContributed: number;
  scenarios: {
    key: 'conservative' | 'base' | 'optimistic';
    label: string;
    annualRatePct: number;
    finalValue: number;
    interestEarned: number;
    realReturnPct: number;
  }[];
  allocation: {
    name: string;
    pct: number;
    vehicle: string;
    role: string;
  }[];
}

export function buildInvestmentProjection(params: InvestmentSimParams): InvestmentSimResult {
  const initialCapital =
    Number.isFinite(params.initialCapital) && params.initialCapital >= 0 ? params.initialCapital : 0;
  const monthlyContribution =
    Number.isFinite(params.monthlyContribution) && params.monthlyContribution >= 0
      ? params.monthlyContribution
      : 0;
  const months = Math.min(360, Math.max(1, Number.isFinite(params.months) ? Math.trunc(params.months) : 12));
  const cdiAnnualPct =
    Number.isFinite(params.cdiAnnualPct) && params.cdiAnnualPct >= 0 ? params.cdiAnnualPct : 0;
  const ipcaAnnualPct =
    Number.isFinite(params.ipcaAnnualPct) && params.ipcaAnnualPct >= 0 ? params.ipcaAnnualPct : 0;
  const { profile } = params;

  const profileSpread =
    profile === 'conservador'
      ? { cons: 0.92, base: 1.0, opt: 1.08 }
      : profile === 'moderado'
      ? { cons: 0.96, base: 1.12, opt: 1.28 }
      : { cons: 0.90, base: 1.24, opt: 1.52 };

  const consAnnual = Number((cdiAnnualPct * profileSpread.cons).toFixed(2));
  const baseAnnual = Number((cdiAnnualPct * profileSpread.base).toFixed(2));
  const optAnnual = Number((cdiAnnualPct * profileSpread.opt).toFixed(2));

  const toMonthlyRate = (annualPct: number) => Math.pow(1 + Math.max(0, annualPct) / 100, 1 / 12) - 1;
  const rCons = toMonthlyRate(consAnnual);
  const rBase = toMonthlyRate(baseAnnual);
  const rOpt = toMonthlyRate(optAnnual);

  let balCons = initialCapital;
  let balBase = initialCapital;
  let balOpt = initialCapital;
  let contributed = initialCapital;

  const points: InvestmentScenarioPoint[] = [
    {
      month: 0,
      contributed: Number(contributed.toFixed(2)),
      conservative: Number(balCons.toFixed(2)),
      base: Number(balBase.toFixed(2)),
      optimistic: Number(balOpt.toFixed(2)),
    },
  ];

  for (let m = 1; m <= months; m++) {
    balCons = balCons * (1 + rCons) + monthlyContribution;
    balBase = balBase * (1 + rBase) + monthlyContribution;
    balOpt = balOpt * (1 + rOpt) + monthlyContribution;
    contributed += monthlyContribution;

    points.push({
      month: m,
      contributed: Number(contributed.toFixed(2)),
      conservative: Number(balCons.toFixed(2)),
      base: Number(balBase.toFixed(2)),
      optimistic: Number(balOpt.toFixed(2)),
    });
  }

  const realReturn = (nominalAnnualPct: number) =>
    Number((((1 + nominalAnnualPct / 100) / (1 + ipcaAnnualPct / 100) - 1) * 100).toFixed(2));

  const allocation =
    profile === 'conservador'
      ? [
          { name: 'Liquidez Diária (Reserva)', pct: 55, vehicle: 'Tesouro Selic / CDB 100% CDI', role: 'Segurança imediata e colchão de caixa' },
          { name: 'Renda Fixa Pós-Fixada', pct: 30, vehicle: 'LCI / LCA Isentas (92–96% CDI)', role: 'Ganho líquido sem IR para PF' },
          { name: 'Inflação Protegida', pct: 15, vehicle: 'Tesouro IPCA+ 2029', role: 'Preservação de poder de compra' },
        ]
      : profile === 'moderado'
      ? [
          { name: 'Liquidez Diária (Reserva)', pct: 35, vehicle: 'Tesouro Selic / CDB 102% CDI', role: 'Reserva de emergência para 6 meses' },
          { name: 'Pós-Fixado & Isentos', pct: 30, vehicle: 'LCI / LCA Bancos Primeira Linha', role: 'Eficiência tributária de médio prazo' },
          { name: 'Inflação & Prefixado', pct: 25, vehicle: 'Tesouro IPCA+ / CDB Prefixado', role: 'Trava de juros reais acima da inflação' },
          { name: 'Multimercado / FIIs', pct: 10, vehicle: 'Fundos Imobiliários de Papel/Tijolo', role: 'Renda passiva mensal isenta' },
        ]
      : [
          { name: 'Liquidez Diária (Reserva)', pct: 25, vehicle: 'Tesouro Selic / CDB 100% CDI', role: 'Caixa tático e segurança essencial' },
          { name: 'Inflação Longa', pct: 30, vehicle: 'Tesouro IPCA+ 2035 / Debêntures Incentivadas', role: 'Aceleração patrimonial acima do IPCA' },
          { name: 'Renda Variável & FIIs', pct: 30, vehicle: 'ETFs / Ações Dividendos / FIIs', role: 'Crescimento real e proventos mensais' },
          { name: 'Internacional / Dólar', pct: 15, vehicle: 'ETF S&P 500 / Treasury Bonds', role: 'Proteção cambial e diversificação global' },
        ];

  return {
    points,
    finalContributed: Number(contributed.toFixed(2)),
    scenarios: [
      {
        key: 'conservative',
        label: 'Conservador',
        annualRatePct: consAnnual,
        finalValue: Number(balCons.toFixed(2)),
        interestEarned: Number((balCons - contributed).toFixed(2)),
        realReturnPct: realReturn(consAnnual),
      },
      {
        key: 'base',
        label: 'Base (Recomendado)',
        annualRatePct: baseAnnual,
        finalValue: Number(balBase.toFixed(2)),
        interestEarned: Number((balBase - contributed).toFixed(2)),
        realReturnPct: realReturn(baseAnnual),
      },
      {
        key: 'optimistic',
        label: 'Otimista',
        annualRatePct: optAnnual,
        finalValue: Number(balOpt.toFixed(2)),
        interestEarned: Number((balOpt - contributed).toFixed(2)),
        realReturnPct: realReturn(optAnnual),
      },
    ],
    allocation,
  };
}

export function buildFinancialContextSummary(state: AppState): Record<string, unknown> {
  const year = state.settings.activeYear;
  const safeFocusMonth = Math.min(
    11,
    Math.max(0, Number.isFinite(state.settings.focusMonth) ? Math.trunc(state.settings.focusMonth) : 10)
  );
  const totals = computeMatrixTotals(state.rows, state.entries, year);
  const alerts = computeAlerts(state.rows, state.entries, totals, state.settings);
  const spotlight = computeMonthSpotlight(
    state.rows,
    state.entries,
    state.accounts,
    totals,
    year,
    safeFocusMonth
  );

  const topExpenses = state.rows
    .filter((r) => (r.block === 'fixed' || r.block === 'variable') && !r.hidden)
    .map((r) => ({
      categoria: r.name,
      bloco: r.block === 'fixed' ? 'Fixa' : 'Variável',
      totalAnual: totals.rowAnnual[r.id] ?? 0,
      mediaMensal: totals.rowAverage[r.id] ?? 0,
      mesEmFoco: totals.rowMonthly[r.id]?.[safeFocusMonth] ?? 0,
    }))
    .sort((a, b) => b.totalAnual - a.totalAnual)
    .slice(0, 10);

  const monthlySummary = MONTH_NAMES_SHORT.map((mName, idx) => ({
    mes: mName,
    receitas: totals.incomeMonthly[idx],
    despesasFixas: totals.fixedMonthly[idx],
    despesasVariaveis: totals.variableMonthly[idx],
    gastoTotal: totals.totalExpenseMonthly[idx],
    resultado: totals.resultMonthly[idx],
    guardado: totals.savingsMonthly[idx],
  }));

  return {
    anoReferencia: year,
    mesEmFoco: MONTH_NAMES_SHORT[safeFocusMonth],
    detalheMesEmFoco: {
      receitas: spotlight.income,
      gastosReais: spotlight.totalExpense,
      resultado: spotlight.result,
      gastoCredito: spotlight.creditSpent,
      gastoDebito: spotlight.debitSpent,
      gastoPix: spotlight.pixSpent,
      gastoAVista: spotlight.spotSpent,
      gastoParceladoNoMes: spotlight.installmentSpent,
      saldoRestanteParcelamentos: spotlight.installmentRemainingTotal,
      transferenciasEPagamentosFaturaDesduplicados: {
        quantidade: spotlight.excludedTransfersCount,
        valorTotalIgnoradoNosGastos: spotlight.excludedTransfersTotal,
      },
      faturasCartao: spotlight.cardInvoices.map((c) => ({
        cartao: c.name,
        valor: c.amount,
        statusFatura: c.status,
        fechamentoDia: c.closingDay ?? null,
        vencimentoDia: c.dueDay ?? null,
        limiteTotal: c.creditLimit ?? null,
        limiteDisponivel: c.availableLimit ?? null,
      })),
    },
    metasEconomia: (state.goals ?? []).map((g) => {
      const prog = computeGoalProgress(g, totals, year);
      return {
        meta: g.title,
        alvo: g.targetAmount,
        atual: prog.currentAmount,
        percentual: `${prog.pct}%`,
      };
    }),
    resumoAnual: {
      ganhoTotalAnual: totals.incomeAnnual,
      gastoTotalAnual: totals.totalExpenseAnnual,
      despesasFixasAnual: totals.fixedAnnual,
      despesasVariaveisAnual: totals.variableAnnual,
      resultadoAnualLiquido: totals.resultAnnual,
      valorTotalGuardado: totals.savingsAnnual,
    },
    resumoMensal: monthlySummary,
    maioresDespesas: topExpenses,
    contasBancarias: state.accounts.map((a) => ({
      instituicao: a.institution,
      tipo: a.type,
      saldo: a.balance,
      status: a.status,
    })),
    cartoesCredito: (() => {
      const overview = computeAllCreditCardsOverview(
        state.creditCards ?? [],
        state.cardPurchases ?? [],
        state.paidCardInvoices ?? {},
        year,
        safeFocusMonth
      );
      return {
        limiteTotal: overview.totalLimit,
        limiteComprometido: overview.totalCommitted,
        limiteLivre: overview.totalAvailable,
        faturaTotalMes: overview.monthTotalInvoice,
        faturaEmAbertoMes: overview.monthUnpaidInvoice,
        comprometidoAte: overview.committedUntil?.label ?? null,
        cartoes: overview.summaries.map((s) => ({
          banco: s.card.bankName,
          apelido: s.card.nickname ?? null,
          limiteTotal: s.card.totalLimit,
          limiteLivre: s.availableLimit,
          limiteComprometido: s.committedLimit,
          faturaMes: s.monthInvoiceAmount,
          faturaPaga: s.monthInvoicePaid,
          fechamentoDia: s.card.closingDay,
          vencimentoDia: s.card.dueDay,
          comprometidoAte: s.committedUntil?.label ?? null,
        })),
      };
    })(),
    alertasAtivos: alerts.slice(0, 8).map((al) => ({
      severidade: al.severity,
      titulo: al.title,
      detalhe: al.description,
    })),
    orcamentoDisponivelMes: computeMonthlyBudgetForecast({
      rows: state.rows,
      entries: state.entries,
      accounts: state.accounts,
      recurringBills: state.recurringBills ?? [],
      creditCards: state.creditCards ?? [],
      cardPurchases: state.cardPurchases ?? [],
      paidCardInvoices: state.paidCardInvoices ?? {},
      totals,
      year,
      focusMonth: safeFocusMonth,
    }),
    itensRecorrentes: (state.recurringBills ?? []).map((b) => ({
      nome: b.title,
      tipo: b.type ?? 'debit',
      valor: b.amount,
      dia: b.dueDay,
      ativo: b.active !== false,
      statusMes: getEffectiveRecurringStatus(
        b,
        year,
        safeFocusMonth,
        new Date(),
        state.settings.alertLeadDays ?? 3
      ).status,
    })),
  };
}

export interface MonthComparisonData {
  currentYear: number;
  currentMonth: number;
  prevYear: number;
  prevMonth: number;
  hasPrevData: boolean;
  income: {
    current: number;
    previous: number;
    delta: number;
    deltaPct: number | null;
  };
  expense: {
    current: number;
    previous: number;
    delta: number;
    deltaPct: number | null;
  };
  result: {
    current: number;
    previous: number;
    delta: number;
    deltaPct: number | null;
  };
}

function safeDeltaPct(current: number, previous: number): number | null {
  if (Math.abs(previous) < 0.01) {
    return null;
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return Number.isFinite(pct) ? Number(pct.toFixed(1)) : null;
}

export function computeMonthComparison(
  rows: CategoryRow[],
  entries: TransactionEntry[],
  totals: MatrixTotals,
  year: number,
  focusMonth: number
): MonthComparisonData {
  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));
  const prevMonth = safeMonth === 0 ? 11 : safeMonth - 1;
  const prevYear = safeMonth === 0 ? year - 1 : year;

  const curIncome = totals.incomeMonthly[safeMonth] ?? 0;
  const curExpense = totals.totalExpenseMonthly[safeMonth] ?? 0;
  const curResult = totals.resultMonthly[safeMonth] ?? 0;

  let prevIncome = 0;
  let prevExpense = 0;
  let prevResult = 0;

  if (prevYear === year) {
    prevIncome = totals.incomeMonthly[prevMonth] ?? 0;
    prevExpense = totals.totalExpenseMonthly[prevMonth] ?? 0;
    prevResult = totals.resultMonthly[prevMonth] ?? 0;
  } else {
    const prevTotals = computeMatrixTotals(rows, entries, prevYear);
    prevIncome = prevTotals.incomeMonthly[prevMonth] ?? 0;
    prevExpense = prevTotals.totalExpenseMonthly[prevMonth] ?? 0;
    prevResult = prevTotals.resultMonthly[prevMonth] ?? 0;
  }

  const hasPrevData = prevIncome > 0 || prevExpense > 0;

  return {
    currentYear: year,
    currentMonth: safeMonth,
    prevYear,
    prevMonth,
    hasPrevData,
    income: {
      current: curIncome,
      previous: prevIncome,
      delta: Number((curIncome - prevIncome).toFixed(2)),
      deltaPct: safeDeltaPct(curIncome, prevIncome),
    },
    expense: {
      current: curExpense,
      previous: prevExpense,
      delta: Number((curExpense - prevExpense).toFixed(2)),
      deltaPct: safeDeltaPct(curExpense, prevExpense),
    },
    result: {
      current: curResult,
      previous: prevResult,
      delta: Number((curResult - prevResult).toFixed(2)),
      deltaPct: safeDeltaPct(curResult, prevResult),
    },
  };
}

export interface CategoryLimitProgressItem {
  row: CategoryRow;
  spent: number;
  limit: number | null;
  pct: number;
  remaining: number | null;
  status: 'over' | 'near' | 'ok' | 'no_limit';
}

export function computeCategoryLimitProgress(
  rows: CategoryRow[],
  totals: MatrixTotals,
  focusMonth: number
): CategoryLimitProgressItem[] {
  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));

  const items: CategoryLimitProgressItem[] = rows
    .filter((r) => (r.block === 'fixed' || r.block === 'variable') && !r.hidden)
    .map((row) => {
      const spent = Number((totals.rowMonthly[row.id]?.[safeMonth] ?? 0).toFixed(2));
      const limit =
        typeof row.alertLimit === 'number' && Number.isFinite(row.alertLimit) && row.alertLimit > 0
          ? Number(row.alertLimit.toFixed(2))
          : null;

      if (!limit) {
        return {
          row,
          spent,
          limit: null,
          pct: 0,
          remaining: null,
          status: 'no_limit' as const,
        };
      }

      const rawPct = (spent / limit) * 100;
      const pct = Number.isFinite(rawPct) ? Math.round(rawPct) : 0;
      const remaining = Number((limit - spent).toFixed(2));
      const status: CategoryLimitProgressItem['status'] =
        spent > limit ? 'over' : rawPct >= 80 ? 'near' : 'ok';

      return {
        row,
        spent,
        limit,
        pct,
        remaining,
        status,
      };
    });

  // Sort: over first, then near, then ok with limits, then by spent desc
  const priority: Record<CategoryLimitProgressItem['status'], number> = {
    over: 0,
    near: 1,
    ok: 2,
    no_limit: 3,
  };

  return items.sort((a, b) => {
    if (priority[a.status] !== priority[b.status]) {
      return priority[a.status] - priority[b.status];
    }
    if (a.limit && b.limit) {
      return b.pct - a.pct;
    }
    return b.spent - a.spent;
  });
}

export interface InstallmentTrackerItem {
  id: string;
  title: string;
  categoryName: string;
  rowId: string;
  accountLabel: string;
  year: number;
  month: number;
  day: number;
  current: number;
  total: number;
  remainingCount: number;
  installmentAmount: number;
  remainingTotalAmount: number;
  shortLabel: string;
}

export interface UpcomingMonthCommitment {
  offset: number;
  year: number;
  month: number;
  amount: number;
  count: number;
}

export interface InstallmentsSummary {
  items: InstallmentTrackerItem[];
  activePlansCount: number;
  totalPaidInstallments: number;
  totalRemainingInstallments: number;
  totalRemainingAmount: number;
  nextMonthCommitment: number;
  upcomingMonths: UpcomingMonthCommitment[];
}

export function computeInstallmentsSummary(
  entries: TransactionEntry[],
  rows: CategoryRow[],
  accounts: BankAccount[],
  activeYear: number,
  focusMonth: number
): InstallmentsSummary {
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const safeFocusMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));

  const items: InstallmentTrackerItem[] = [];

  entries.forEach((entry) => {
    if (isDeduplicatedEntry(entry)) return;
    const inst = parseInstallmentInfo(entry);
    if (!inst.isInstallment) return;

    const row = rowMap.get(entry.rowId);
    const acc = accMap.get(entry.accountId);

    items.push({
      id: entry.id,
      title: entry.merchant || entry.description,
      categoryName: row?.name ?? 'Geral',
      rowId: entry.rowId,
      accountLabel: acc ? `${acc.institution} (${acc.maskedAccount})` : 'Lançamento Manual',
      year: entry.year,
      month: entry.month,
      day: entry.day,
      current: inst.current,
      total: inst.total,
      remainingCount: inst.remainingCount,
      installmentAmount: inst.installmentAmount,
      remainingTotalAmount: inst.remainingTotalAmount,
      shortLabel: inst.shortLabel,
    });
  });

  // Sort by remaining total amount descending, then most recent
  items.sort((a, b) => {
    if (b.remainingTotalAmount !== a.remainingTotalAmount) {
      return b.remainingTotalAmount - a.remainingTotalAmount;
    }
    return b.year * 12 + b.month - (a.year * 12 + a.month);
  });

  const upcomingMonths: UpcomingMonthCommitment[] = Array.from({ length: 6 }, (_, idx) => {
    const offset = idx + 1;
    const absMonth = activeYear * 12 + safeFocusMonth + offset;
    const targetYear = Math.floor(absMonth / 12);
    const targetMonth = absMonth % 12;

    let amount = 0;
    let count = 0;

    items.forEach((item) => {
      const startAbs = item.year * 12 + item.month;
      const diff = absMonth - startAbs;
      if (diff >= 1 && diff <= item.remainingCount) {
        amount += item.installmentAmount;
        count += 1;
      }
    });

    return {
      offset,
      year: targetYear,
      month: targetMonth,
      amount: Number(amount.toFixed(2)),
      count,
    };
  });

  const activeItems = items.filter((it) => it.remainingCount > 0);
  const totalPaidInstallments = items.reduce((s, it) => s + it.current, 0);
  const totalRemainingInstallments = items.reduce((s, it) => s + it.remainingCount, 0);
  const totalRemainingAmount = Number(
    items.reduce((s, it) => s + it.remainingTotalAmount, 0).toFixed(2)
  );

  return {
    items,
    activePlansCount: activeItems.length,
    totalPaidInstallments,
    totalRemainingInstallments,
    totalRemainingAmount,
    nextMonthCommitment: upcomingMonths[0]?.amount ?? 0,
    upcomingMonths,
  };
}

export function getRecurringMonthKey(year: number, month: number): string {
  return `${year}-${String(Math.min(11, Math.max(0, Math.trunc(month)))).padStart(2, '0')}`;
}

export function getEffectiveRecurringStatus(
  bill: RecurringBill,
  year: number,
  month: number,
  referenceDate: Date = new Date(),
  leadDays = 3
): { status: RecurringBillStatus; isDueSoon: boolean; daysUntilDue: number | null } {
  const key = getRecurringMonthKey(year, month);
  const stored = bill.statusByMonth?.[key];
  const safeLead = Math.max(0, Math.min(30, Number.isFinite(leadDays) ? Math.trunc(leadDays) : 3));

  if (bill.active === false) {
    return {
      status: stored ?? 'pending',
      isDueSoon: false,
      daysUntilDue: null,
    };
  }

  if (stored === 'paid') {
    return { status: 'paid', isDueSoon: false, daysUntilDue: null };
  }

  const todayYear = referenceDate.getFullYear();
  const todayMonth = referenceDate.getMonth();
  const todayDay = referenceDate.getDate();

  if (stored === 'overdue') {
    return { status: 'overdue', isDueSoon: false, daysUntilDue: bill.dueDay - todayDay };
  }

  const isPastMonth = year < todayYear || (year === todayYear && month < todayMonth);
  const isCurrentMonth = year === todayYear && month === todayMonth;

  if (isPastMonth || (isCurrentMonth && bill.dueDay < todayDay)) {
    return { status: 'overdue', isDueSoon: false, daysUntilDue: bill.dueDay - todayDay };
  }

  if (isCurrentMonth) {
    const diff = bill.dueDay - todayDay;
    return {
      status: 'pending',
      isDueSoon: diff >= 0 && diff <= safeLead,
      daysUntilDue: diff,
    };
  }

  return { status: 'pending', isDueSoon: false, daysUntilDue: null };
}

export function computePreviousMonthCarryover(
  totals: MatrixTotals,
  focusMonth: number
): number {
  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));
  let running = 0;
  for (let m = 0; m < safeMonth; m++) {
    const inc = totals.incomeMonthly[m] ?? 0;
    const exp = totals.totalExpenseMonthly[m] ?? 0;
    const sav = totals.savingsMonthly[m] ?? 0;
    if (inc !== 0 || exp !== 0) {
      running += inc - exp - sav;
    }
  }
  return Number(running.toFixed(2));
}

export interface MonthlyBudgetForecast {
  year: number;
  month: number;
  categoryRowId: string | 'all';
  currentAccountBalance: number;
  previousMonthCarryover: number;
  isolatedSavingsTotal: number;
  realizedIncome: number;
  expectedPendingIncome: number;
  totalForecastIncome: number;
  realizedExpense: number;
  pendingRecurringDebits: number;
  pendingScheduledDebits: number;
  unpaidCardInvoices: number;
  totalPendingCommitments: number;
  totalForecastExpense: number;
  safeToSpendRemaining: number;
  projectedMonthClose: number;
  budgetUtilizationPct: number;
  healthStatus: 'safe' | 'attention' | 'over';
  activeRecurringDebitCount: number;
  activeRecurringIncomeCount: number;
}

export function computeMonthlyBudgetForecast(params: {
  rows: CategoryRow[];
  entries: TransactionEntry[];
  accounts: BankAccount[];
  recurringBills: RecurringBill[];
  creditCards: CreditCardAccount[];
  cardPurchases: CreditCardPurchase[];
  paidCardInvoices: Record<string, boolean>;
  totals: MatrixTotals;
  year: number;
  focusMonth: number;
  categoryRowId?: string | 'all';
}): MonthlyBudgetForecast {
  const {
    rows,
    entries,
    accounts,
    recurringBills,
    creditCards,
    cardPurchases,
    paidCardInvoices,
    totals,
    year,
    focusMonth,
    categoryRowId = 'all',
  } = params;

  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));
  const rowMap = new Map(rows.map((r) => [r.id, r]));

  const hasManualAccounts = accounts.some((a) => a.status === 'active' && a.type !== 'Cartão de Crédito');
  const currentAccountBalance = Number(
    accounts
      .filter((a) => a.status === 'active' && a.type !== 'Cartão de Crédito')
      .reduce((sum, a) => sum + (Number.isFinite(a.balance) ? a.balance : 0), 0)
      .toFixed(2)
  );
  const previousMonthCarryover =
    categoryRowId === 'all' ? computePreviousMonthCarryover(totals, safeMonth) : 0;
  const isolatedSavingsTotal = Number((totals.savingsAnnual ?? 0).toFixed(2));
  const effectiveCarryOrBalance = hasManualAccounts
    ? currentAccountBalance
    : previousMonthCarryover;

  const monthEntries = entries.filter((e) => {
    if (e.year !== year || e.month !== safeMonth) return false;
    if (isDeduplicatedEntry(e)) return false;
    if (categoryRowId !== 'all' && e.rowId !== categoryRowId) return false;
    const row = rowMap.get(e.rowId);
    return Boolean(row && !row.hidden);
  });

  let realizedIncome = 0;
  let pendingEntryIncome = 0;
  let realizedExpense = 0;
  let pendingScheduledDebits = 0;

  monthEntries.forEach((e) => {
    const row = rowMap.get(e.rowId);
    if (!row) return;
    const amt = Number.isFinite(e.amount) ? e.amount : 0;
    if (row.block === 'income') {
      if (e.status === 'paid') realizedIncome += amt;
      else pendingEntryIncome += amt;
    } else if (row.block === 'fixed' || row.block === 'variable') {
      if (e.status === 'paid') realizedExpense += amt;
      else pendingScheduledDebits += amt;
    }
    // Note: block === 'savings' (Caixinha / Guardado) stays strictly isolated in isolatedSavingsTotal
  });

  let pendingRecurringIncome = 0;
  let pendingRecurringDebits = 0;
  let activeRecurringIncomeCount = 0;
  let activeRecurringDebitCount = 0;

  const activeBills = recurringBills.filter((b) => {
    if (b.active === false) return false;
    if (categoryRowId !== 'all' && b.categoryRowId !== categoryRowId) return false;
    return true;
  });

  activeBills.forEach((bill) => {
    const kind = bill.type ?? 'debit';
    const eff = getEffectiveRecurringStatus(bill, year, safeMonth);
    const amt = Number.isFinite(bill.amount) ? bill.amount : 0;
    if (kind === 'income') {
      activeRecurringIncomeCount += 1;
      if (eff.status !== 'paid') {
        pendingRecurringIncome += amt;
      }
    } else {
      activeRecurringDebitCount += 1;
      if (eff.status !== 'paid') {
        pendingRecurringDebits += amt;
      }
    }
  });

  const cardsOverview =
    categoryRowId === 'all'
      ? computeAllCreditCardsOverview(creditCards, cardPurchases, paidCardInvoices, year, safeMonth)
      : null;
  const unpaidCardInvoices = cardsOverview ? cardsOverview.monthUnpaidInvoice : 0;

  const expectedPendingIncome = Number((pendingEntryIncome + pendingRecurringIncome).toFixed(2));
  const totalForecastIncome = Number((realizedIncome + expectedPendingIncome).toFixed(2));
  const totalPendingCommitments = Number(
    (pendingRecurringDebits + pendingScheduledDebits + unpaidCardInvoices).toFixed(2)
  );
  const totalForecastExpense = Number((realizedExpense + totalPendingCommitments).toFixed(2));

  // Formula:
  // (saldoAtual ou saldoAnteriorLivre) + receitasPrevistasConfirmadas - gastosJaRealizados - contasFixasECompromissosPendentes
  const safeToSpendRemaining = Number(
    (effectiveCarryOrBalance + totalForecastIncome - realizedExpense - totalPendingCommitments).toFixed(2)
  );
  const projectedMonthClose = Number((totalForecastIncome - totalForecastExpense).toFixed(2));

  const budgetBase = Math.max(0, effectiveCarryOrBalance + totalForecastIncome);
  const budgetUtilizationPct =
    budgetBase > 0
      ? Number(Math.min(180, (totalForecastExpense / budgetBase) * 100).toFixed(1))
      : totalForecastExpense > 0
      ? 100
      : 0;

  let healthStatus: MonthlyBudgetForecast['healthStatus'] = 'safe';
  if (safeToSpendRemaining < 0 || (budgetBase > 0 && budgetUtilizationPct > 100)) {
    healthStatus = 'over';
  } else if (budgetBase > 0 && budgetUtilizationPct >= 80) {
    healthStatus = 'attention';
  }

  return {
    year,
    month: safeMonth,
    categoryRowId,
    currentAccountBalance: effectiveCarryOrBalance,
    previousMonthCarryover,
    isolatedSavingsTotal,
    realizedIncome: Number(realizedIncome.toFixed(2)),
    expectedPendingIncome,
    totalForecastIncome,
    realizedExpense: Number(realizedExpense.toFixed(2)),
    pendingRecurringDebits: Number(pendingRecurringDebits.toFixed(2)),
    pendingScheduledDebits: Number(pendingScheduledDebits.toFixed(2)),
    unpaidCardInvoices: Number(unpaidCardInvoices.toFixed(2)),
    totalPendingCommitments,
    totalForecastExpense,
    safeToSpendRemaining,
    projectedMonthClose,
    budgetUtilizationPct,
    healthStatus,
    activeRecurringDebitCount,
    activeRecurringIncomeCount,
  };
}

export interface UpcomingCashflowAlert {
  id: string;
  kind: 'debit' | 'income';
  sourceType: 'recurring' | 'entry' | 'card_invoice';
  title: string;
  categoryLabel: string;
  amount: number;
  day: number;
  daysDiff: number;
  urgency: 'overdue' | 'today' | 'soon';
}

export function computeUpcomingCashflowAlerts(params: {
  recurringBills: RecurringBill[];
  entries: TransactionEntry[];
  creditCards: CreditCardAccount[];
  cardPurchases: CreditCardPurchase[];
  paidCardInvoices: Record<string, boolean>;
  rows: CategoryRow[];
  year: number;
  focusMonth: number;
  leadDays?: number;
  referenceDate?: Date;
}): UpcomingCashflowAlert[] {
  const {
    recurringBills,
    entries,
    creditCards,
    cardPurchases,
    paidCardInvoices,
    rows,
    year,
    focusMonth,
    leadDays = 3,
    referenceDate = new Date(),
  } = params;

  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));
  const safeLead = Math.max(0, Math.min(30, Math.trunc(leadDays)));
  const todayYear = referenceDate.getFullYear();
  const todayMonth = referenceDate.getMonth();
  const todayDay = referenceDate.getDate();
  const isCurrentMonth = year === todayYear && safeMonth === todayMonth;
  const isPastMonth = year < todayYear || (year === todayYear && safeMonth < todayMonth);

  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const alerts: UpcomingCashflowAlert[] = [];

  // 1. Active recurring debits & incomes
  recurringBills.forEach((bill) => {
    if (bill.active === false) return;
    const eff = getEffectiveRecurringStatus(bill, year, safeMonth, referenceDate, safeLead);
    if (eff.status === 'paid') return;

    const kind = bill.type ?? 'debit';
    const rowName = bill.categoryRowId ? rowMap.get(bill.categoryRowId)?.name : undefined;
    const categoryLabel = rowName ?? (kind === 'income' ? 'Recebimento Recorrente' : 'Conta Fixa');

    if (eff.status === 'overdue') {
      alerts.push({
        id: `cf-rec-${bill.id}`,
        kind,
        sourceType: 'recurring',
        title: bill.title,
        categoryLabel,
        amount: bill.amount,
        day: bill.dueDay,
        daysDiff: eff.daysUntilDue ?? -1,
        urgency: 'overdue',
      });
    } else if (isCurrentMonth && eff.daysUntilDue !== null && eff.daysUntilDue >= 0 && eff.daysUntilDue <= safeLead) {
      alerts.push({
        id: `cf-rec-${bill.id}`,
        kind,
        sourceType: 'recurring',
        title: bill.title,
        categoryLabel,
        amount: bill.amount,
        day: bill.dueDay,
        daysDiff: eff.daysUntilDue,
        urgency: eff.daysUntilDue === 0 ? 'today' : 'soon',
      });
    }
  });

  // 2. Scheduled/pending transaction entries
  entries.forEach((e) => {
    if (e.year !== year || e.month !== safeMonth || e.status === 'paid' || isDeduplicatedEntry(e)) return;
    const row = rowMap.get(e.rowId);
    if (!row || row.hidden) return;
    const kind: 'debit' | 'income' = row.block === 'income' ? 'income' : 'debit';
    const diff = e.day - todayDay;
    if (isPastMonth || (isCurrentMonth && diff < 0)) {
      alerts.push({
        id: `cf-ent-${e.id}`,
        kind,
        sourceType: 'entry',
        title: e.merchant || e.description,
        categoryLabel: row.name,
        amount: e.amount,
        day: e.day,
        daysDiff: isPastMonth ? -1 : diff,
        urgency: 'overdue',
      });
    } else if (isCurrentMonth && diff >= 0 && diff <= safeLead) {
      alerts.push({
        id: `cf-ent-${e.id}`,
        kind,
        sourceType: 'entry',
        title: e.merchant || e.description,
        categoryLabel: row.name,
        amount: e.amount,
        day: e.day,
        daysDiff: diff,
        urgency: diff === 0 ? 'today' : 'soon',
      });
    }
  });

  // 3. Unpaid credit card invoices due soon or overdue
  if (creditCards.length > 0) {
    const cardsOverview = computeAllCreditCardsOverview(
      creditCards,
      cardPurchases,
      paidCardInvoices,
      year,
      safeMonth
    );
    cardsOverview.summaries.forEach((s) => {
      if (s.monthInvoicePaid || s.monthInvoiceAmount <= 0) return;
      const diff = s.card.dueDay - todayDay;
      if (isPastMonth || (isCurrentMonth && diff < 0)) {
        alerts.push({
          id: `cf-card-${s.card.id}`,
          kind: 'debit',
          sourceType: 'card_invoice',
          title: `Fatura ${s.card.nickname || s.card.bankName}`,
          categoryLabel: 'Cartão de Crédito',
          amount: s.monthInvoiceAmount,
          day: s.card.dueDay,
          daysDiff: isPastMonth ? -1 : diff,
          urgency: 'overdue',
        });
      } else if (isCurrentMonth && diff >= 0 && diff <= safeLead) {
        alerts.push({
          id: `cf-card-${s.card.id}`,
          kind: 'debit',
          sourceType: 'card_invoice',
          title: `Fatura ${s.card.nickname || s.card.bankName}`,
          categoryLabel: 'Cartão de Crédito',
          amount: s.monthInvoiceAmount,
          day: s.card.dueDay,
          daysDiff: diff,
          urgency: diff === 0 ? 'today' : 'soon',
        });
      }
    });
  }

  const urgencyWeight = { overdue: 0, today: 1, soon: 2 };
  return alerts.sort((a, b) => {
    if (urgencyWeight[a.urgency] !== urgencyWeight[b.urgency]) {
      return urgencyWeight[a.urgency] - urgencyWeight[b.urgency];
    }
    return a.daysDiff - b.daysDiff;
  });
}

