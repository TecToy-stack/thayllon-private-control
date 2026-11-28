import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Pencil,
  Plus,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  AppSettings,
  CreditCardAccount,
  CreditCardPurchase,
} from '../types/finance';
import { BRAZILIAN_BANKS } from '../data/brazilBanks';
import {
  CARD_PURCHASE_CATEGORIES,
  computeAllCreditCardsOverview,
  expandPurchaseIntoSlices,
  formatMonthYearShort,
  getInvoiceMonthKey,
} from '../utils/creditCardsEngine';
import { formatBRL, shiftYearMonth } from '../utils/financeEngine';
import { getMonthNamesFull, getMonthNamesShort } from '../utils/i18n';
import { BankSelectionValue, BankSelectorField } from './BankSelectorField';
import { CreditCardPieChart } from './CreditCardPieChart';

interface CreditCardsViewProps {
  cards: CreditCardAccount[];
  purchases: CreditCardPurchase[];
  paidCardInvoices: Record<string, boolean>;
  settings: AppSettings;
  openNewPurchaseTrigger?: number;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onAddCard: (card: Omit<CreditCardAccount, 'id' | 'createdAt'>) => void;
  onUpdateCard: (cardId: string, patch: Partial<CreditCardAccount>) => void;
  onDeleteCard: (cardId: string) => void;
  onAddPurchase: (purchase: Omit<CreditCardPurchase, 'id' | 'createdAt'>) => void;
  onUpdatePurchase: (purchaseId: string, patch: Partial<CreditCardPurchase>) => void;
  onDeletePurchase: (purchaseId: string) => void;
  onToggleInvoicePaid: (cardId: string, year: number, month: number) => void;
}

const DEFAULT_BANK = BRAZILIAN_BANKS.find((b) => b.id === 'nubank') ?? BRAZILIAN_BANKS[0];

export const CreditCardsView: React.FC<CreditCardsViewProps> = ({
  cards,
  purchases,
  paidCardInvoices,
  settings,
  openNewPurchaseTrigger = 0,
  onUpdateSettings,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onAddPurchase,
  onUpdatePurchase,
  onDeletePurchase,
  onToggleInvoicePaid,
}) => {
  const { activeYear, focusMonth, privacyMode, language } = settings;
  const monthNamesFull = getMonthNamesFull(language);
  const monthNamesShort = getMonthNamesShort(language);

  const [selectedCardFilter, setSelectedCardFilter] = useState<string>('all');

  // Card Modal State
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [bankValue, setBankValue] = useState<BankSelectionValue>({
    bankId: DEFAULT_BANK.id,
    bankName: DEFAULT_BANK.name,
    bankColor: DEFAULT_BANK.color,
    bankCategory: DEFAULT_BANK.category,
    bankCode: DEFAULT_BANK.code,
  });
  const [cardNickname, setCardNickname] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [cardTotalLimit, setCardTotalLimit] = useState('5000');
  const [cardClosingDay, setCardClosingDay] = useState('8');
  const [cardDueDay, setCardDueDay] = useState('15');

  // Purchase Modal State
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [purchaseCardId, setPurchaseCardId] = useState(cards[0]?.id ?? '');
  const [purchaseDescription, setPurchaseDescription] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseInstallments, setPurchaseInstallments] = useState('1');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [purchaseCategory, setPurchaseCategory] = useState<string>(CARD_PURCHASE_CATEGORIES[0]);

  useEffect(() => {
    if (openNewPurchaseTrigger > 0) {
      if (cards.length === 0) {
        openCreateCardModal();
      } else {
        openCreatePurchaseModal(cards[0].id);
      }
    }
  }, [openNewPurchaseTrigger]);

  const overview = useMemo(
    () =>
      computeAllCreditCardsOverview(
        cards,
        purchases,
        paidCardInvoices,
        activeYear,
        focusMonth
      ),
    [cards, purchases, paidCardInvoices, activeYear, focusMonth]
  );

  const openCreateCardModal = () => {
    setEditingCardId(null);
    setBankValue({
      bankId: DEFAULT_BANK.id,
      bankName: DEFAULT_BANK.name,
      bankColor: DEFAULT_BANK.color,
      bankCategory: DEFAULT_BANK.category,
      bankCode: DEFAULT_BANK.code,
    });
    setCardNickname('');
    setCardLast4('');
    setCardTotalLimit('5000');
    setCardClosingDay('8');
    setCardDueDay('15');
    setCardModalOpen(true);
  };

  const openEditCardModal = (card: CreditCardAccount) => {
    setEditingCardId(card.id);
    setBankValue({
      bankId: card.bankId,
      bankName: card.bankName,
      bankColor: card.bankColor,
      bankCategory: card.bankCategory || 'Banco',
      bankCode: '000',
    });
    setCardNickname(card.nickname ?? '');
    setCardLast4(card.last4 ?? '');
    setCardTotalLimit(String(card.totalLimit));
    setCardClosingDay(String(card.closingDay));
    setCardDueDay(String(card.dueDay));
    setCardModalOpen(true);
  };

  const handleSaveCard = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLimit = parseFloat(cardTotalLimit.replace(',', '.'));
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 0;
    const safeClosing = Math.min(31, Math.max(1, parseInt(cardClosingDay, 10) || 10));
    const safeDue = Math.min(31, Math.max(1, parseInt(cardDueDay, 10) || 17));
    const cleanLast4 = cardLast4.replace(/\D/g, '').slice(-4) || undefined;

    if (editingCardId) {
      onUpdateCard(editingCardId, {
        bankId: bankValue.bankId,
        bankName: bankValue.bankName,
        bankColor: bankValue.bankColor,
        bankCategory: bankValue.bankCategory,
        nickname: cardNickname.trim() || undefined,
        last4: cleanLast4,
        totalLimit: Number(safeLimit.toFixed(2)),
        closingDay: safeClosing,
        dueDay: safeDue,
      });
    } else {
      onAddCard({
        bankId: bankValue.bankId,
        bankName: bankValue.bankName,
        bankColor: bankValue.bankColor,
        bankCategory: bankValue.bankCategory,
        nickname: cardNickname.trim() || undefined,
        last4: cleanLast4,
        totalLimit: Number(safeLimit.toFixed(2)),
        closingDay: safeClosing,
        dueDay: safeDue,
      });
    }
    setCardModalOpen(false);
  };

  const openCreatePurchaseModal = (defaultCardId?: string) => {
    setEditingPurchaseId(null);
    setPurchaseCardId(defaultCardId || cards[0]?.id || '');
    setPurchaseDescription('');
    setPurchaseAmount('');
    setPurchaseInstallments('1');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseCategory(CARD_PURCHASE_CATEGORIES[0]);
    setPurchaseModalOpen(true);
  };

  const openEditPurchaseModal = (purchase: CreditCardPurchase) => {
    setEditingPurchaseId(purchase.id);
    setPurchaseCardId(purchase.cardId);
    setPurchaseDescription(purchase.description);
    setPurchaseAmount(String(purchase.totalAmount));
    setPurchaseInstallments(String(purchase.installments));
    setPurchaseDate(purchase.purchaseDate);
    setPurchaseCategory(purchase.category || CARD_PURCHASE_CATEGORIES[0]);
    setPurchaseModalOpen(true);
  };

  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCard = purchaseCardId || cards[0]?.id;
    const parsedAmount = parseFloat(purchaseAmount.replace(',', '.'));
    if (!targetCard || !purchaseDescription.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }
    const safeInstallments = Math.min(24, Math.max(1, parseInt(purchaseInstallments, 10) || 1));

    if (editingPurchaseId) {
      onUpdatePurchase(editingPurchaseId, {
        cardId: targetCard,
        description: purchaseDescription.trim(),
        totalAmount: Number(parsedAmount.toFixed(2)),
        installments: safeInstallments,
        purchaseDate,
        category: purchaseCategory,
      });
    } else {
      onAddPurchase({
        cardId: targetCard,
        description: purchaseDescription.trim(),
        totalAmount: Number(parsedAmount.toFixed(2)),
        installments: safeInstallments,
        purchaseDate,
        category: purchaseCategory,
      });
    }
    setPurchaseModalOpen(false);
  };

  const visibleMonthSlices = useMemo(() => {
    const items = overview.summaries
      .filter((s) => selectedCardFilter === 'all' || s.card.id === selectedCardFilter)
      .flatMap((s) =>
        s.monthSlices.map((slice) => ({
          ...slice,
          bankName: s.card.bankName,
          bankColor: s.card.bankColor,
          cardNickname: s.card.nickname,
        }))
      );
    return items.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [overview.summaries, selectedCardFilter]);

  const cardMap = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const filteredPurchases = useMemo(() => {
    return purchases
      .filter((p) => selectedCardFilter === 'all' || p.cardId === selectedCardFilter)
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [purchases, selectedCardFilter]);

  const consolidatedFutureSchedule = useMemo(() => {
    const focusAbs = activeYear * 12 + focusMonth;
    const monthBuckets = new Map<
      number,
      { year: number; month: number; label: string; totalAmount: number; unpaidAmount: number }
    >();

    overview.summaries.forEach((s) => {
      s.futureSchedule.forEach((item) => {
        const abs = item.year * 12 + item.month;
        if (abs < focusAbs) return;
        const paid = Boolean(paidCardInvoices[getInvoiceMonthKey(s.card.id, item.year, item.month)]);
        const existing = monthBuckets.get(abs);
        if (existing) {
          existing.totalAmount = Number((existing.totalAmount + item.totalAmount).toFixed(2));
          if (!paid) {
            existing.unpaidAmount = Number((existing.unpaidAmount + item.totalAmount).toFixed(2));
          }
        } else {
          monthBuckets.set(abs, {
            year: item.year,
            month: item.month,
            label: item.label,
            totalAmount: Number(item.totalAmount.toFixed(2)),
            unpaidAmount: paid ? 0 : Number(item.totalAmount.toFixed(2)),
          });
        }
      });
    });

    return Array.from(monthBuckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, bucket]) => bucket);
  }, [overview.summaries, paidCardInvoices, activeYear, focusMonth]);

  return (
    <div className="space-y-6 pb-2 lg:pb-6">
      {/* Header & Quick Actions */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Cartões de Crédito & Parcelamentos
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Limites livres, parcelas de 1x a 24x, fechamento da fatura e melhor dia para comprar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openCreateCardModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-200/70 transition-colors whitespace-nowrap shrink-0"
          >
            <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Novo Cartão</span>
          </button>

          <button
            type="button"
            onClick={() =>
              cards.length === 0 ? openCreateCardModal() : openCreatePurchaseModal()
            }
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Compra no Cartão</span>
          </button>
        </div>
      </div>

      {/* Month & Unlimited Year Selector */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span>Fatura em Foco: {monthNamesFull[focusMonth]} {activeYear}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => {
                const prev = shiftYearMonth(activeYear, focusMonth, -1);
                onUpdateSettings({ activeYear: prev.year, focusMonth: prev.month });
              }}
              className="px-2 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              title="Mês anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Ano anterior"
              onClick={() => onUpdateSettings({ activeYear: Math.max(1900, activeYear - 1) })}
              className="px-2 py-1 rounded-lg text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              title="Ano anterior"
            >
              −
            </button>
            {[activeYear - 1, activeYear, activeYear + 1].map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => onUpdateSettings({ activeYear: yr })}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
                  activeYear === yr
                    ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {yr}
              </button>
            ))}
            <button
              type="button"
              aria-label="Próximo ano"
              onClick={() => onUpdateSettings({ activeYear: activeYear + 1 })}
              className="px-2 py-1 rounded-lg text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
              className="px-2 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              title="Próximo mês (cruza virada de ano)"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
            {monthNamesShort.map((mName, idx) => (
              <button
                key={mName}
                type="button"
                onClick={() => onUpdateSettings({ focusMonth: idx })}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors ${
                  focusMonth === idx
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {mName}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Consolidated KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Limite Total Somado</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatBRL(overview.totalLimit, privacyMode)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {cards.length} cartão(ões) cadastrado(s)
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Limite Livre Total</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatBRL(overview.totalAvailable, privacyMode)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Disponível imediato para novas compras
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Limite Comprometido</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-blue-600 dark:text-blue-400">
            {formatBRL(overview.totalCommitted, privacyMode)}
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {overview.utilizationPct}% utilizado ·{' '}
            {overview.committedUntil
              ? `Comprometido até ${overview.committedUntil.label}`
              : 'Sem parcelas em aberto'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Fatura de {monthNamesShort[focusMonth]}/{activeYear}
          </div>
          <div className="mt-1.5 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatBRL(overview.monthTotalInvoice, privacyMode)}
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Em aberto: {formatBRL(overview.monthUnpaidInvoice, privacyMode)}
          </div>
        </div>
      </div>

      {/* Pie / Donut Chart */}
      <CreditCardPieChart
        summaries={overview.summaries}
        totalLimit={overview.totalLimit}
        totalCommitted={overview.totalCommitted}
        totalAvailable={overview.totalAvailable}
        privacyMode={privacyMode}
      />

      {/* Consolidated Future Card Installments Projection (Infinite Years) */}
      {cards.length > 0 && consolidatedFutureSchedule.length > 0 && (
        <section className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Projeção Consolidada de Faturas & Parcelas ({consolidatedFutureSchedule.length}{' '}
                {consolidatedFutureSchedule.length === 1 ? 'mês' : 'meses'})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Impacto mensal somado de todos os cartões, incluindo viradas de ano. Toque no mês para inspecionar.
              </p>
            </div>
            <div className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400 font-semibold shrink-0">
              Total em aberto: {formatBRL(overview.totalCommitted, privacyMode)}
            </div>
          </div>

          <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {consolidatedFutureSchedule.map((item) => {
              const isSelected = item.year === activeYear && item.month === focusMonth;
              return (
                <button
                  key={`${item.year}-${item.month}`}
                  type="button"
                  onClick={() => onUpdateSettings({ activeYear: item.year, focusMonth: item.month })}
                  className={`min-w-[112px] px-3 py-2 rounded-xl border text-left shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 text-blue-700 dark:text-blue-300'
                      : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.07] hover:border-blue-300'
                  }`}
                >
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatBRL(item.totalAmount, privacyMode)}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {item.unpaidAmount > 0
                      ? `Em aberto ${formatBRL(item.unpaidAmount, privacyMode)}`
                      : 'Faturas pagas'}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Cards Grid */}
      {cards.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-[#111827] border border-dashed border-slate-300 dark:border-white/[0.12] text-center space-y-3">
          <div className="mx-auto h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <CreditCard className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Nenhum cartão cadastrado ainda
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Cadastre seus cartões escolhendo entre dezenas de bancos do Brasil ou digitando o nome da instituição para acompanhar limites, faturas e parcelas.
          </p>
          <button
            type="button"
            onClick={openCreateCardModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            <span>Cadastrar Primeiro Cartão</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {overview.summaries.map((summary) => {
            const { card, closingInfo } = summary;
            return (
              <div
                key={card.id}
                className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-semibold text-xs shrink-0"
                      style={{ backgroundColor: card.bankColor || '#2563EB' }}
                    >
                      {card.bankName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {card.bankName}
                        {card.nickname ? ` · ${card.nickname}` : ''}
                      </h3>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {card.last4 ? `•••• ${card.last4} · ` : ''}
                        Fech. D/{String(card.closingDay).padStart(2, '0')} · Venc. D/
                        {String(card.dueDay).padStart(2, '0')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditCardModal(card)}
                      className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-white/5"
                      title="Editar cartão"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCard(card.id)}
                      className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                      title="Excluir cartão"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Closing & Best Purchase Day Indicator */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06] space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`font-semibold ${
                        closingInfo.status === 'closes_today'
                          ? 'text-amber-700 dark:text-amber-300'
                          : closingInfo.status === 'closed_best_window'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-blue-700 dark:text-blue-400'
                      }`}
                    >
                      {closingInfo.closingNotice}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      Melhor dia: D/{String(closingInfo.bestPurchaseDay).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{closingInfo.bestDayNotice}</span>
                  </div>
                </div>

                {/* Limits & Progress */}
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                    <div>
                      <span className="font-sans text-[11px] text-slate-500 dark:text-slate-400 block">
                        Limite Total
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatBRL(card.totalLimit, privacyMode)}
                      </span>
                    </div>
                    <div>
                      <span className="font-sans text-[11px] text-slate-500 dark:text-slate-400 block">
                        Limite Livre
                      </span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatBRL(summary.availableLimit, privacyMode)}
                      </span>
                    </div>
                    <div>
                      <span className="font-sans text-[11px] text-slate-500 dark:text-slate-400 block">
                        Comprometido
                      </span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {formatBRL(summary.committedLimit, privacyMode)}
                      </span>
                    </div>
                  </div>

                  <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/[0.08] overflow-hidden">
                    <div
                      style={{
                        width: `${summary.utilizationPct}%`,
                        backgroundColor:
                          summary.utilizationPct >= 85
                            ? '#EF4444'
                            : card.bankColor || '#2563EB',
                      }}
                      className="h-full transition-all duration-300"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Uso do limite: {summary.utilizationPct}%</span>
                    <span className="font-mono">
                      {summary.committedUntil
                        ? `Comprometido até ${summary.committedUntil.label}`
                        : 'Sem parcelas pendentes'}
                    </span>
                  </div>
                </div>

                {/* Month Invoice & Pay Toggle */}
                <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Fatura de {formatMonthYearShort(activeYear, focusMonth)}
                    </div>
                    <div className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                      {formatBRL(summary.monthInvoiceAmount, privacyMode)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openCreatePurchaseModal(card.id)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 hover:bg-slate-200/70 whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Compra</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleInvoicePaid(card.id, activeYear, focusMonth)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                        summary.monthInvoicePaid
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {summary.monthInvoicePaid ? (
                        <>
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Fatura paga · Reabrir</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Marcar fatura como paga</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Future Schedule Mini Strip */}
                {summary.futureSchedule.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] space-y-2">
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Cronograma de faturas ({summary.futureSchedule.length} meses)
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {summary.futureSchedule.map((item) => {
                        const isSelectedMonth =
                          item.year === activeYear && item.month === focusMonth;
                        const paid = Boolean(
                          paidCardInvoices[getInvoiceMonthKey(card.id, item.year, item.month)]
                        );
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() =>
                              onUpdateSettings({ activeYear: item.year, focusMonth: item.month })
                            }
                            className={`px-2.5 py-1.5 rounded-lg border text-left shrink-0 transition-colors ${
                              isSelectedMonth
                                ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 text-blue-700 dark:text-blue-300'
                                : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.06]'
                            }`}
                          >
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {item.label} {paid ? '· Paga' : ''}
                            </div>
                            <div className="text-xs font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                              {formatBRL(item.totalAmount, privacyMode)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Purchases & Installments Lists */}
      {cards.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Selected Month Slices */}
          <div className="xl:col-span-6 p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Lançamentos na Fatura de {monthNamesShort[focusMonth]}/{activeYear}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Parcelas alocadas conforme data da compra e dia de fechamento
                </p>
              </div>

              <select
                value={selectedCardFilter}
                onChange={(e) => setSelectedCardFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                <option value="all">Todos os cartões</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.bankName} {c.nickname ? `(${c.nickname})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {visibleMonthSlices.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Nenhuma parcela ou compra prevista nesta fatura.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/[0.06] max-h-96 overflow-y-auto">
                {visibleMonthSlices.map((slice) => (
                  <div
                    key={`${slice.purchaseId}-${slice.installmentNumber}`}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: slice.bankColor }}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {slice.description}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {slice.bankName} · {slice.category} · Compra em{' '}
                          {slice.purchaseDate.split('-').reverse().join('/')}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono tabular-nums">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {formatBRL(slice.amount, privacyMode)}
                      </div>
                      <div className="text-[11px] text-blue-600 dark:text-blue-400">
                        {slice.installmentNumber}/{slice.totalInstallments}
                        {slice.isPaid ? ' · Paga' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All Registered Card Purchases (Edit / Delete) */}
          <div className="xl:col-span-6 p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span>Compras Registradas nos Cartões ({filteredPurchases.length})</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Edite ou remova compras à vista ou parceladas (1x–24x)
                </p>
              </div>
            </div>

            {filteredPurchases.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Nenhuma compra cadastrada. Clique em <strong>Nova Compra no Cartão</strong> acima.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/[0.06] max-h-96 overflow-y-auto">
                {filteredPurchases.map((purchase) => {
                  const card = cardMap.get(purchase.cardId);
                  const sliceAmt = purchase.totalAmount / Math.max(1, purchase.installments);
                  const unpaidSlices = card
                    ? expandPurchaseIntoSlices(purchase, card, paidCardInvoices).filter((s) => !s.isPaid)
                    : [];
                  const unpaidTotal = Number(
                    unpaidSlices.reduce((sum, s) => sum + s.amount, 0).toFixed(2)
                  );
                  return (
                    <div
                      key={purchase.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {purchase.description}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 break-words">
                          {card ? card.bankName : 'Cartão'} · {purchase.installments}x de{' '}
                          {formatBRL(sliceAmt, privacyMode)} ·{' '}
                          {purchase.purchaseDate.split('-').reverse().join('/')}
                          {card && purchase.installments > 1 && (
                            <span className="ml-1.5 font-mono text-blue-600 dark:text-blue-400">
                              ·{' '}
                              {unpaidSlices.length > 0
                                ? `Restam ${unpaidSlices.length} (${formatBRL(unpaidTotal, privacyMode)})`
                                : 'Quitada'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatBRL(purchase.totalAmount, privacyMode)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditPurchaseModal(purchase)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-white/5"
                          title="Editar compra"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePurchase(purchase.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                          title="Remover compra"
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
        </div>
      )}

      {/* Modal: Cadastrar / Editar Cartão */}
      {cardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 pt-safe-screen pb-safe-nav overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setCardModalOpen(false)}
          />
          <div className="relative z-10 my-auto w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.25rem)] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingCardId ? 'Editar Cartão de Crédito' : 'Cadastrar Cartão de Crédito'}
              </h3>
              <button
                type="button"
                onClick={() => setCardModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="p-6 space-y-4">
              <BankSelectorField
                value={bankValue}
                onChange={setBankValue}
                label="Escolha o Banco do Cartão"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Apelido do Cartão (opcional)
                  </label>
                  <input
                    type="text"
                    value={cardNickname}
                    onChange={(e) => setCardNickname(e.target.value)}
                    placeholder="Ex.: Ultravioleta, Black, Principal"
                    className="w-full px-3 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    4 Últimos Dígitos (opcional)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={cardLast4}
                    onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Limite Total (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={cardTotalLimit}
                    onChange={(e) => setCardTotalLimit(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Dia Fechamento
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={cardClosingDay}
                    onChange={(e) => setCardClosingDay(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Dia Vencimento
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={cardDueDay}
                    onChange={(e) => setCardDueDay(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCardModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                >
                  {editingCardId ? 'Salvar Alterações' : 'Salvar Cartão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nova / Editar Compra no Cartão */}
      {purchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 pt-safe-screen pb-safe-nav overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setPurchaseModalOpen(false)}
          />
          <div className="relative z-10 my-auto w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.25rem)] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingPurchaseId ? 'Editar Compra no Cartão' : 'Nova Compra no Cartão'}
              </h3>
              <button
                type="button"
                onClick={() => setPurchaseModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cartão
                </label>
                <select
                  value={purchaseCardId}
                  onChange={(e) => setPurchaseCardId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.bankName} {c.nickname ? `(${c.nickname})` : ''} — Fecha D/{c.closingDay}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descrição da Compra
                </label>
                <input
                  type="text"
                  required
                  value={purchaseDescription}
                  onChange={(e) => setPurchaseDescription(e.target.value)}
                  placeholder="Ex.: Supermercado, Notebook, Farmácia..."
                  className="w-full px-3 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Valor Total (R$)
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={purchaseAmount}
                    onChange={(e) => setPurchaseAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Parcelamento (1x a 24x)
                  </label>
                  <select
                    value={purchaseInstallments}
                    onChange={(e) => setPurchaseInstallments(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  >
                    {Array.from({ length: 24 }, (_, idx) => idx + 1).map((n) => (
                      <option key={n} value={String(n)}>
                        {n}x {n === 1 ? '(À vista na fatura)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Data da Compra
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Categoria
                  </label>
                  <select
                    value={purchaseCategory}
                    onChange={(e) => setPurchaseCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  >
                    {CARD_PURCHASE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {Number(purchaseAmount) > 0 && Number(purchaseInstallments) > 1 && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-500/30 text-xs text-blue-800 dark:text-blue-200 font-mono tabular-nums">
                  {purchaseInstallments}x de{' '}
                  {formatBRL(
                    Number(purchaseAmount) / Math.max(1, Number(purchaseInstallments)),
                    false
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPurchaseModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{editingPurchaseId ? 'Atualizar Compra' : 'Registrar Compra'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
