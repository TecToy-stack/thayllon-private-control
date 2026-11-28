import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Check, AlertTriangle, Building2, Copy } from 'lucide-react';
import {
  AppLanguage,
  BankAccount,
  CategoryRow,
  EntryNature,
  EntryStatus,
  PaymentMethod,
  TransactionEntry,
} from '../types/finance';
import {
  formatBRL,
  isDeduplicatedEntry,
  parseInstallmentInfo,
} from '../utils/financeEngine';
import { CategoryIconBadge } from '../utils/categoryVisuals';
import {
  getMonthNamesFull,
  getTranslations,
  translateEntryStatus,
  translatePaymentMethod,
} from '../utils/i18n';

interface CellDetailDrawerProps {
  isOpen: boolean;
  row: CategoryRow | null;
  month: number | null;
  year: number;
  entries: TransactionEntry[];
  accounts: BankAccount[];
  categoryAverage: number;
  privacyMode: boolean;
  language: AppLanguage;
  onClose: () => void;
  onAddEntry: (entry: Omit<TransactionEntry, 'id' | 'createdAt'>) => void;
  onUpdateEntry: (id: string, patch: Partial<TransactionEntry>) => void;
  onDeleteEntry: (id: string) => void;
  onReplaceCellTotal: (rowId: string, month: number, newTotal: number, note?: string) => void;
}

export const CellDetailDrawer: React.FC<CellDetailDrawerProps> = ({
  isOpen,
  row,
  month,
  year,
  entries,
  accounts,
  categoryAverage,
  privacyMode,
  language,
  onClose,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onReplaceCellTotal,
}) => {
  const [newAmount, setNewAmount] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newMerchant, setNewMerchant] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState<PaymentMethod>('debit');
  const [newNature, setNewNature] = useState<EntryNature>('standard');
  const [newInstallmentCurrent, setNewInstallmentCurrent] = useState('1');
  const [newInstallmentTotal, setNewInstallmentTotal] = useState('1');
  const [newDay, setNewDay] = useState('15');
  const [newAccountId, setNewAccountId] = useState('manual');
  const [newStatus, setNewStatus] = useState<EntryStatus>('paid');
  const [newNote, setNewNote] = useState('');
  const [quickTotal, setQuickTotal] = useState('');

  const t = getTranslations(language);
  const monthNamesFull = getMonthNamesFull(language);

  useEffect(() => {
    if (row && month !== null) {
      setNewDay(String(new Date().getDate()));
      setNewDesc(`${row.name}`);
      setNewMerchant('');
      setNewPaymentMethod(row.id.includes('cartao') ? 'credit' : row.block === 'income' ? 'pix' : 'debit');
      setNewNature('standard');
      setNewInstallmentCurrent('1');
      setNewInstallmentTotal('1');
      setNewAmount('');
      setNewNote('');
      if (newAccountId !== 'manual' && !accounts.some((a) => a.id === newAccountId)) {
        setNewAccountId('manual');
      }
      const sum = entries
        .filter((e) => !isDeduplicatedEntry(e))
        .reduce((s, e) => s + e.amount, 0);
      setQuickTotal(sum > 0 ? sum.toFixed(2) : '');
    }
  }, [row?.id, month, entries.length, accounts]);

  if (!isOpen || !row || month === null) return null;

  const safeMonth = Math.min(11, Math.max(0, Number.isFinite(month) ? Math.trunc(month) : 0));
  const cellTotal = entries
    .filter((e) => !isDeduplicatedEntry(e))
    .reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0);
  const blockLabel =
    row.block === 'income'
      ? t.settings.grid.blockIncome
      : row.block === 'fixed'
      ? t.settings.grid.blockFixed
      : row.block === 'variable'
      ? t.settings.grid.blockVariable
      : t.modals.groupSavings;

  const isOverLimit = Boolean(row.alertLimit && cellTotal > row.alertLimit);
  const paidStatusLabel =
    language === 'en'
      ? row.block === 'income'
        ? 'Received'
        : 'Paid'
      : language === 'es'
      ? row.block === 'income'
        ? 'Recibido'
        : 'Pagado'
      : row.block === 'income'
      ? 'Recebido'
      : 'Pago';

  const handleDuplicateEntry = (entry: TransactionEntry) => {
    onAddEntry({
      rowId: entry.rowId,
      year: entry.year,
      month: entry.month,
      day: entry.day,
      amount: entry.amount,
      description: entry.description,
      merchant: entry.merchant,
      paymentMethod: entry.paymentMethod,
      entryNature: entry.entryNature,
      installments: entry.installments,
      installmentCurrent: entry.installmentCurrent,
      installmentTotal: entry.installmentTotal,
      accountId: entry.accountId,
      source: 'manual',
      status: entry.status,
      note: entry.note,
    });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(newAmount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const instTot = Math.min(48, Math.max(1, parseInt(newInstallmentTotal, 10) || 1));
    const instCur = Math.min(instTot, Math.max(1, parseInt(newInstallmentCurrent, 10) || 1));

    onAddEntry({
      rowId: row.id,
      year,
      month: safeMonth,
      day: Math.min(31, Math.max(1, parseInt(newDay, 10) || 15)),
      amount: Number(parsed.toFixed(2)),
      description: newDesc.trim() || `${row.name} · ${monthNamesFull[safeMonth]}`,
      merchant: newMerchant.trim() || newDesc.trim() || row.name,
      paymentMethod: newPaymentMethod,
      entryNature: newNature,
      installments: instTot > 1 ? `${instCur}/${instTot}` : undefined,
      installmentCurrent: instTot > 1 ? instCur : undefined,
      installmentTotal: instTot > 1 ? instTot : undefined,
      accountId: newAccountId,
      source: 'manual',
      status: newStatus,
      note: newNote.trim() || undefined,
    });
    setNewAmount('');
    setNewMerchant('');
    setNewNote('');
  };

  const handleQuickApply = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(quickTotal.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onReplaceCellTotal(row.id, safeMonth, Number(parsed.toFixed(2)));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <aside className="relative z-10 w-full max-w-lg bg-white dark:bg-[#111827] border-l border-slate-200 dark:border-white/[0.08] h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 sm:px-6 pt-safe-header pb-4 border-b border-slate-200 dark:border-white/[0.08] flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <CategoryIconBadge row={row} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">{blockLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="shrink-0">
                  {monthNamesFull[safeMonth]} {year}
                </span>
              </div>
              <h2 className="mt-0.5 text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                {row.name}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 shrink-0"
            aria-label={t.modals.cancel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 pb-safe-nav space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.07]">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t.modals.cellTotal}</div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatBRL(cellTotal, privacyMode)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.07]">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t.modals.monthlyAvg}</div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-200">
                {formatBRL(categoryAverage, privacyMode)}
              </div>
            </div>
          </div>

          {isOverLimit && row.alertLimit && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">{t.modals.overLimitTitle}</div>
                <div className="mt-0.5 opacity-90">
                  {t.modals.overLimitDesc} {formatBRL(row.alertLimit, privacyMode)}.
                </div>
              </div>
            </div>
          )}

          <form
            onSubmit={handleQuickApply}
            className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] space-y-2.5"
          >
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.modals.directEditLabel}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={quickTotal}
                onChange={(e) => setQuickTotal(e.target.value)}
                placeholder="0.00"
                className="flex-1 px-3 py-2 rounded-lg text-sm font-mono tabular-nums bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C9A86A]/50"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                <Check className="h-3.5 w-3.5" />
                {t.modals.applyTotal}
              </button>
            </div>
          </form>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                {t.modals.cellEntriesTitle} ({entries.length})
              </h3>
            </div>

            {entries.length === 0 ? (
              <div className="p-5 text-center rounded-xl border border-dashed border-slate-300 dark:border-white/[0.1] text-xs text-slate-500 dark:text-slate-400">
                {t.modals.noCellEntries}
              </div>
            ) : (
              <div className="space-y-2.5">
                {entries.map((entry) => {
                  const acc = accounts.find((a) => a.id === entry.accountId);
                  const deduplicated = isDeduplicatedEntry(entry);
                  const inst = parseInstallmentInfo(entry);
                  return (
                    <div
                      key={entry.id}
                      className="p-3.5 rounded-xl bg-white dark:bg-[#1A2234]/70 border border-slate-200 dark:border-white/[0.08] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                            <span className="truncate">{entry.merchant || entry.description}</span>
                            {inst.isInstallment && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#C9A86A]/15 text-[#8C6A2E] dark:text-[#E5C88F]">
                                {inst.shortLabel} · {t.matrix.remShort} {inst.remainingCount} ({formatBRL(inst.remainingTotalAmount, privacyMode)})
                              </span>
                            )}
                            {deduplicated && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                {t.modals.notSummedTag}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono tabular-nums">
                              {t.modals.dayShort} {String(entry.day).padStart(2, '0')}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {acc ? acc.institution : t.modals.manualAccount}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-[#A68342] dark:text-[#E5C88F]">
                              {translatePaymentMethod(entry.paymentMethod, language)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div
                            className={`text-sm font-semibold font-mono tabular-nums ${
                              deduplicated
                                ? 'text-slate-400 dark:text-slate-500 line-through'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {formatBRL(entry.amount, privacyMode)}
                          </div>
                        </div>
                      </div>

                      {entry.note && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0D1320] px-2.5 py-1.5 rounded-md">
                          {entry.note}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={entry.paymentMethod ?? 'debit'}
                            onChange={(e) =>
                              onUpdateEntry(entry.id, {
                                paymentMethod: e.target.value as PaymentMethod,
                              })
                            }
                            className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-[#0D1320] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]"
                          >
                            <option value="credit">{translatePaymentMethod('credit', language)}</option>
                            <option value="debit">{translatePaymentMethod('debit', language)}</option>
                            <option value="pix">{translatePaymentMethod('pix', language)}</option>
                            <option value="transfer">{translatePaymentMethod('transfer', language)}</option>
                            <option value="cash">{translatePaymentMethod('cash', language)}</option>
                          </select>

                          <select
                            value={entry.status}
                            onChange={(e) =>
                              onUpdateEntry(entry.id, { status: e.target.value as EntryStatus })
                            }
                            className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-[#0D1320] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]"
                          >
                            <option value="paid">{paidStatusLabel}</option>
                            <option value="pending">{translateEntryStatus('pending', language)}</option>
                            <option value="projected">{translateEntryStatus('projected', language)}</option>
                          </select>

                          <select
                            value={entry.accountId}
                            onChange={(e) => onUpdateEntry(entry.id, { accountId: e.target.value })}
                            className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-[#0D1320] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]"
                          >
                            <option value="manual">{t.modals.manualAccount}</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.institution}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDuplicateEntry(entry)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                            title="Duplicar lançamento"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            <span>Duplicar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteEntry(entry.id)}
                            className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            aria-label="Excluir lançamento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add new entry */}
          <form
            onSubmit={handleAdd}
            className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-3"
          >
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t.modals.addSingleEntryTitle}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.modals.amountLabel}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono tabular-nums bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.modals.methodLabel}
                </label>
                <select
                  value={newPaymentMethod}
                  onChange={(e) => setNewPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value="credit">{translatePaymentMethod('credit', language)}</option>
                  <option value="debit">{translatePaymentMethod('debit', language)}</option>
                  <option value="pix">{translatePaymentMethod('pix', language)}</option>
                  <option value="transfer">{translatePaymentMethod('transfer', language)}</option>
                  <option value="cash">{translatePaymentMethod('cash', language)}</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.modals.dayLabel}
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono tabular-nums bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                {t.modals.merchantLabel}
              </label>
              <input
                type="text"
                value={newMerchant}
                onChange={(e) => setNewMerchant(e.target.value)}
                placeholder={t.modals.merchantPlaceholder}
                className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.modals.natureLabel}
                </label>
                <select
                  value={newNature}
                  onChange={(e) => setNewNature(e.target.value as EntryNature)}
                  className="w-full px-2 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value="standard">{t.modals.natureReal}</option>
                  <option value="internal_transfer">{t.modals.natureInternal}</option>
                  <option value="invoice_payment">{t.modals.natureInvoice}</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.modals.installmentLabel}
                </label>
                <input
                  type="number"
                  min="1"
                  max="48"
                  value={newInstallmentCurrent}
                  onChange={(e) => setNewInstallmentCurrent(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.modals.ofTotalLabel}
                </label>
                <input
                  type="number"
                  min="1"
                  max="48"
                  value={newInstallmentTotal}
                  onChange={(e) => setNewInstallmentTotal(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.modals.accountLabel}
                </label>
                <select
                  value={newAccountId}
                  onChange={(e) => setNewAccountId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value="manual">{t.modals.manualAccount}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.institution}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.modals.statusLabel}
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as EntryStatus)}
                  className="w-full px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value="paid">{paidStatusLabel}</option>
                  <option value="pending">{t.modals.statusPending}</option>
                  <option value="projected">{t.modals.statusProjected}</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              {t.modals.addEntryToCellBtn}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
};
