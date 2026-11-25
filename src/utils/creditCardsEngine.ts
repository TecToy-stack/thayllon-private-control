import { CreditCardAccount, CreditCardPurchase } from '../types/finance';
import { MONTH_NAMES_SHORT } from '../data/initialData';

export const CARD_PURCHASE_CATEGORIES = [
  'Mercado & Alimentação',
  'Restaurante & Lazer',
  'Transporte & Combustível',
  'Casa & Utilidades',
  'Saúde & Farmácia',
  'Educação & Cursos',
  'Assinaturas & Apps',
  'Compras & Vestuário',
  'Eletrônicos & Parcelados',
  'Viagem & Hospedagem',
  'Outros',
] as const;

export interface CardInstallmentSlice {
  purchaseId: string;
  cardId: string;
  description: string;
  category: string;
  purchaseDate: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  totalPurchaseAmount: number;
  billYear: number;
  billMonth: number; // 0..11
  isPaid: boolean;
}

export interface CardMonthlyCommitment {
  year: number;
  month: number; // 0..11
  label: string;
  totalAmount: number;
  isPaid: boolean;
  itemsCount: number;
}

export interface CardClosingBestDayInfo {
  todayDay: number;
  closingDay: number;
  dueDay: number;
  status: 'closes_today' | 'open_closing_soon' | 'closed_best_window';
  daysUntilClosing: number;
  closingNotice: string;
  bestPurchaseDay: number;
  isInBestWindow: boolean;
  bestDayNotice: string;
}

export interface CreditCardComputedSummary {
  card: CreditCardAccount;
  committedLimit: number;
  availableLimit: number;
  utilizationPct: number;
  monthInvoiceAmount: number;
  monthInvoicePaid: boolean;
  monthSlices: CardInstallmentSlice[];
  committedUntil: { year: number; month: number; label: string } | null;
  futureSchedule: CardMonthlyCommitment[];
  closingInfo: CardClosingBestDayInfo;
}

export interface AllCreditCardsOverview {
  totalLimit: number;
  totalCommitted: number;
  totalAvailable: number;
  utilizationPct: number;
  monthTotalInvoice: number;
  monthUnpaidInvoice: number;
  committedUntil: { year: number; month: number; label: string } | null;
  summaries: CreditCardComputedSummary[];
}

export function getInvoiceMonthKey(cardId: string, year: number, month: number): string {
  return `${cardId}:${year}-${String(month).padStart(2, '0')}`;
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const total = year * 12 + month + offset;
  const nextYear = Math.floor(total / 12);
  const nextMonth = ((total % 12) + 12) % 12;
  return { year: nextYear, month: nextMonth };
}

function compareYearMonth(aYear: number, aMonth: number, bYear: number, bMonth: number): number {
  return aYear * 12 + aMonth - (bYear * 12 + bMonth);
}

export function formatMonthYearShort(year: number, month: number): string {
  const safeMonth = Math.min(11, Math.max(0, Math.trunc(month)));
  return `${MONTH_NAMES_SHORT[safeMonth]}/${year}`;
}

export function computeCardClosingAndBestDay(
  card: CreditCardAccount,
  referenceDate = new Date()
): CardClosingBestDayInfo {
  const todayYear = referenceDate.getFullYear();
  const todayMonth = referenceDate.getMonth();
  const todayDay = referenceDate.getDate();
  const closingDay = Math.min(31, Math.max(1, Math.trunc(card.closingDay || 10)));
  const dueDay = Math.min(31, Math.max(1, Math.trunc(card.dueDay || 17)));

  const daysInCurrentMonth = new Date(todayYear, todayMonth + 1, 0).getDate();
  const effectiveClosingThisMonth = Math.min(closingDay, daysInCurrentMonth);

  if (todayDay === effectiveClosingThisMonth) {
    return {
      todayDay,
      closingDay,
      dueDay,
      status: 'closes_today',
      daysUntilClosing: 0,
      closingNotice: 'Fecha hoje',
      bestPurchaseDay: closingDay,
      isInBestWindow: true,
      bestDayNotice: `Melhor dia de compra hoje (D/${String(closingDay).padStart(2, '0')}) — compras já vão para a próxima fatura`,
    };
  }

  if (todayDay < effectiveClosingThisMonth) {
    const diff = effectiveClosingThisMonth - todayDay;
    return {
      todayDay,
      closingDay,
      dueDay,
      status: 'open_closing_soon',
      daysUntilClosing: diff,
      closingNotice: diff === 1 ? 'Fecha em 1 dia' : `Fecha em ${diff} dias`,
      bestPurchaseDay: closingDay,
      isInBestWindow: false,
      bestDayNotice: `Melhor dia de compra: a partir de D/${String(closingDay).padStart(2, '0')}`,
    };
  }

  // Já passou do fechamento no mês atual: calcula dias até o fechamento do próximo mês
  const nextMonthDate = new Date(todayYear, todayMonth + 1, 1);
  const daysInNextMonth = new Date(
    nextMonthDate.getFullYear(),
    nextMonthDate.getMonth() + 1,
    0
  ).getDate();
  const effectiveClosingNextMonth = Math.min(closingDay, daysInNextMonth);
  const nextClosingFull = new Date(
    nextMonthDate.getFullYear(),
    nextMonthDate.getMonth(),
    effectiveClosingNextMonth
  );
  const todayFloor = new Date(todayYear, todayMonth, todayDay);
  const daysUntilNextClosing = Math.max(
    1,
    Math.round((nextClosingFull.getTime() - todayFloor.getTime()) / (24 * 60 * 60 * 1000))
  );

  return {
    todayDay,
    closingDay,
    dueDay,
    status: 'closed_best_window',
    daysUntilClosing: daysUntilNextClosing,
    closingNotice: `Fechada · próximo fechamento em ${daysUntilNextClosing} dias`,
    bestPurchaseDay: closingDay,
    isInBestWindow: true,
    bestDayNotice: `Janela ideal ativa (melhor dia D/${String(closingDay).padStart(2, '0')}) — cai só na próxima fatura`,
  };
}

export function expandPurchaseIntoSlices(
  purchase: CreditCardPurchase,
  card: CreditCardAccount,
  paidCardInvoices: Record<string, boolean>
): CardInstallmentSlice[] {
  const parts = String(purchase.purchaseDate || '').split('-');
  const parsedYear = Number(parts[0]);
  const parsedMonth = Number(parts[1]) - 1;
  const parsedDay = Number(parts[2]);

  const now = new Date();
  const pYear = Number.isFinite(parsedYear) && parsedYear >= 2000 ? parsedYear : now.getFullYear();
  const pMonth =
    Number.isFinite(parsedMonth) && parsedMonth >= 0 && parsedMonth <= 11
      ? parsedMonth
      : now.getMonth();
  const pDay =
    Number.isFinite(parsedDay) && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : now.getDate();

  const closingDay = Math.min(31, Math.max(1, Math.trunc(card.closingDay || 10)));
  // Compras feitas no dia do fechamento ou depois entram na fatura do mês seguinte
  const firstMonthOffset = pDay >= closingDay ? 1 : 0;

  const n = Math.min(24, Math.max(1, Math.trunc(purchase.installments || 1)));
  const totalCents = Math.max(0, Math.round((Number(purchase.totalAmount) || 0) * 100));
  const baseCents = Math.floor(totalCents / n);
  const remainderCents = totalCents - baseCents * n;

  const slices: CardInstallmentSlice[] = [];
  for (let i = 0; i < n; i++) {
    const sliceCents = baseCents + (i < remainderCents ? 1 : 0);
    const { year: billYear, month: billMonth } = addMonths(pYear, pMonth, firstMonthOffset + i);
    const invoiceKey = getInvoiceMonthKey(card.id, billYear, billMonth);
    const isPaid = Boolean(paidCardInvoices[invoiceKey]);

    slices.push({
      purchaseId: purchase.id,
      cardId: card.id,
      description: purchase.description,
      category: purchase.category || 'Outros',
      purchaseDate: purchase.purchaseDate,
      installmentNumber: i + 1,
      totalInstallments: n,
      amount: Number((sliceCents / 100).toFixed(2)),
      totalPurchaseAmount: Number((totalCents / 100).toFixed(2)),
      billYear,
      billMonth,
      isPaid,
    });
  }

  return slices;
}

export function computeCreditCardSummary(
  card: CreditCardAccount,
  purchases: CreditCardPurchase[],
  paidCardInvoices: Record<string, boolean>,
  focusYear: number,
  focusMonth: number,
  referenceDate = new Date()
): CreditCardComputedSummary {
  const cardPurchases = purchases.filter((p) => p.cardId === card.id);
  const allSlices: CardInstallmentSlice[] = [];

  cardPurchases.forEach((p) => {
    allSlices.push(...expandPurchaseIntoSlices(p, card, paidCardInvoices));
  });

  const committedCents = allSlices
    .filter((s) => !s.isPaid)
    .reduce((sum, s) => sum + Math.round(s.amount * 100), 0);

  const committedLimit = Number((committedCents / 100).toFixed(2));
  const totalLimit = Math.max(0, Number(card.totalLimit) || 0);
  const availableLimit = Number(Math.max(0, totalLimit - committedLimit).toFixed(2));
  const utilizationPct =
    totalLimit > 0 ? Math.min(100, Math.round((committedLimit / totalLimit) * 100)) : 0;

  const monthSlices = allSlices
    .filter((s) => s.billYear === focusYear && s.billMonth === focusMonth)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

  const monthInvoiceCents = monthSlices.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
  const monthInvoiceAmount = Number((monthInvoiceCents / 100).toFixed(2));
  const monthInvoicePaid = Boolean(
    paidCardInvoices[getInvoiceMonthKey(card.id, focusYear, focusMonth)]
  );

  // Agrupamento mensal (todos os meses com parcelas a partir do menor mês ou do mês em foco)
  const monthMap = new Map<string, CardMonthlyCommitment>();
  let latestUnpaid: { year: number; month: number } | null = null;

  for (const s of allSlices) {
    const key = `${s.billYear}-${String(s.billMonth).padStart(2, '0')}`;
    const existing = monthMap.get(key);
    if (existing) {
      existing.totalAmount = Number((existing.totalAmount + s.amount).toFixed(2));
      existing.itemsCount += 1;
    } else {
      monthMap.set(key, {
        year: s.billYear,
        month: s.billMonth,
        label: formatMonthYearShort(s.billYear, s.billMonth),
        totalAmount: s.amount,
        isPaid: s.isPaid,
        itemsCount: 1,
      });
    }

    if (!s.isPaid) {
      if (
        !latestUnpaid ||
        compareYearMonth(s.billYear, s.billMonth, latestUnpaid.year, latestUnpaid.month) > 0
      ) {
        latestUnpaid = { year: s.billYear, month: s.billMonth };
      }
    }
  }

  const futureSchedule = Array.from(monthMap.values()).sort((a, b) =>
    compareYearMonth(a.year, a.month, b.year, b.month)
  );

  const committedUntil = latestUnpaid
    ? {
        year: latestUnpaid.year,
        month: latestUnpaid.month,
        label: formatMonthYearShort(latestUnpaid.year, latestUnpaid.month),
      }
    : null;

  return {
    card,
    committedLimit,
    availableLimit,
    utilizationPct,
    monthInvoiceAmount,
    monthInvoicePaid,
    monthSlices,
    committedUntil,
    futureSchedule,
    closingInfo: computeCardClosingAndBestDay(card, referenceDate),
  };
}

export function computeAllCreditCardsOverview(
  cards: CreditCardAccount[],
  purchases: CreditCardPurchase[],
  paidCardInvoices: Record<string, boolean>,
  focusYear: number,
  focusMonth: number,
  referenceDate = new Date()
): AllCreditCardsOverview {
  const summaries = cards.map((card) =>
    computeCreditCardSummary(card, purchases, paidCardInvoices, focusYear, focusMonth, referenceDate)
  );

  const totalLimit = Number(
    summaries.reduce((s, c) => s + Math.max(0, c.card.totalLimit), 0).toFixed(2)
  );
  const totalCommitted = Number(
    summaries.reduce((s, c) => s + c.committedLimit, 0).toFixed(2)
  );
  const totalAvailable = Number(Math.max(0, totalLimit - totalCommitted).toFixed(2));
  const utilizationPct =
    totalLimit > 0 ? Math.min(100, Math.round((totalCommitted / totalLimit) * 100)) : 0;

  const monthTotalInvoice = Number(
    summaries.reduce((s, c) => s + c.monthInvoiceAmount, 0).toFixed(2)
  );
  const monthUnpaidInvoice = Number(
    summaries
      .filter((c) => !c.monthInvoicePaid)
      .reduce((s, c) => s + c.monthInvoiceAmount, 0)
      .toFixed(2)
  );

  let latestUnpaid: { year: number; month: number; label: string } | null = null;
  summaries.forEach((s) => {
    if (!s.committedUntil) return;
    if (
      !latestUnpaid ||
      compareYearMonth(
        s.committedUntil.year,
        s.committedUntil.month,
        latestUnpaid.year,
        latestUnpaid.month
      ) > 0
    ) {
      latestUnpaid = s.committedUntil;
    }
  });

  return {
    totalLimit,
    totalCommitted,
    totalAvailable,
    utilizationPct,
    monthTotalInvoice,
    monthUnpaidInvoice,
    committedUntil: latestUnpaid,
    summaries,
  };
}
