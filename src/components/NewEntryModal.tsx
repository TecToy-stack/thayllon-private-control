import React, { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
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
  getMonthNamesFull,
  getTranslations,
  translatePaymentMethod,
} from '../utils/i18n';

interface NewEntryModalProps {
  isOpen: boolean;
  rows: CategoryRow[];
  accounts: BankAccount[];
  activeYear: number;
  defaultMonth: number;
  initialFlowType?: 'income' | 'expense';
  language: AppLanguage;
  onClose: () => void;
  onAddEntry: (entry: Omit<TransactionEntry, 'id' | 'createdAt'>) => void;
}

export const NewEntryModal: React.FC<NewEntryModalProps> = ({
  isOpen,
  rows,
  accounts,
  activeYear,
  defaultMonth,
  initialFlowType,
  language,
  onClose,
  onAddEntry,
}) => {
  const t = getTranslations(language);
  const monthNamesFull = getMonthNamesFull(language);
  const visibleRows = rows.filter((r) => !r.hidden);
  const [rowId, setRowId] = useState(visibleRows[0]?.id ?? 'inc-pizzaria');
  const [month, setMonth] = useState(
    Math.min(11, Math.max(0, Number.isFinite(defaultMonth) ? Math.trunc(defaultMonth) : 10))
  );
  const [day, setDay] = useState('23');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('debit');
  const [entryNature, setEntryNature] = useState<EntryNature>('standard');
  const [installmentCurrent, setInstallmentCurrent] = useState('1');
  const [installmentTotal, setInstallmentTotal] = useState('1');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? 'manual');
  const [status, setStatus] = useState<EntryStatus>('paid');

  useEffect(() => {
    if (!isOpen) return;
    setMonth(Math.min(11, Math.max(0, Number.isFinite(defaultMonth) ? Math.trunc(defaultMonth) : 10)));
    setEntryNature('standard');
    setInstallmentCurrent('1');
    setInstallmentTotal('1');

    if (initialFlowType === 'income') {
      const firstIncome = visibleRows.find((r) => r.block === 'income');
      if (firstIncome) setRowId(firstIncome.id);
    } else if (initialFlowType === 'expense') {
      const firstExpense = visibleRows.find((r) => r.block === 'variable' || r.block === 'fixed');
      if (firstExpense) setRowId(firstExpense.id);
    } else if (visibleRows.length > 0 && !visibleRows.some((r) => r.id === rowId)) {
      setRowId(visibleRows[0].id);
    }

    if (accountId !== 'manual' && !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0]?.id ?? 'manual');
    }
  }, [isOpen, defaultMonth, accounts, initialFlowType]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0 || !rowId) return;
    const safeMonth = Math.min(11, Math.max(0, Number.isFinite(month) ? Math.trunc(month) : 0));
    const selectedRow = rows.find((r) => r.id === rowId);
    const instTot = Math.min(48, Math.max(1, parseInt(installmentTotal, 10) || 1));
    const instCur = Math.min(instTot, Math.max(1, parseInt(installmentCurrent, 10) || 1));

    onAddEntry({
      rowId,
      year: activeYear,
      month: safeMonth,
      day: Math.min(31, Math.max(1, parseInt(day, 10) || 15)),
      amount: Number(parsed.toFixed(2)),
      description: merchant.trim() || `${selectedRow?.name ?? t.modals.newEntryTitle} · ${monthNamesFull[safeMonth]}`,
      merchant: merchant.trim() || selectedRow?.name || t.modals.newEntryTitle,
      paymentMethod,
      entryNature,
      installments: instTot > 1 ? `${instCur}/${instTot}` : undefined,
      installmentCurrent: instTot > 1 ? instCur : undefined,
      installmentTotal: instTot > 1 ? instTot : undefined,
      accountId,
      source: 'manual',
      status,
    });

    setAmount('');
    setMerchant('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t.modals.newEntryTitle} ({activeYear})
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t.modals.categoryRowLabel}
            </label>
            <select
              value={rowId}
              onChange={(e) => setRowId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            >
              <optgroup label={t.modals.groupIncome}>
                {visibleRows
                  .filter((r) => r.block === 'income')
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.refDay ? `(D/${String(r.refDay).padStart(2, '0')})` : ''}
                    </option>
                  ))}
              </optgroup>
              <optgroup label={t.modals.groupFixed}>
                {visibleRows
                  .filter((r) => r.block === 'fixed')
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.refDay ? `(D/${String(r.refDay).padStart(2, '0')})` : ''}
                    </option>
                  ))}
              </optgroup>
              <optgroup label={t.modals.groupVariable}>
                {visibleRows
                  .filter((r) => r.block === 'variable')
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.refDay ? `(D/${String(r.refDay).padStart(2, '0')})` : ''}
                    </option>
                  ))}
              </optgroup>
              <optgroup label={t.modals.groupSavings}>
                {visibleRows
                  .filter((r) => r.block === 'savings')
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.modals.monthLabel}
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                {monthNamesFull.map((m, idx) => (
                  <option key={m} value={idx}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.modals.dayLabel}
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.modals.amountLabel}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2.5 rounded-lg text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.modals.methodLabel}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                <option value="credit">{translatePaymentMethod('credit', language)}</option>
                <option value="debit">{translatePaymentMethod('debit', language)}</option>
                <option value="pix">{translatePaymentMethod('pix', language)}</option>
                <option value="transfer">{translatePaymentMethod('transfer', language)}</option>
                <option value="cash">{translatePaymentMethod('cash', language)}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.modals.accountLabel}
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                <option value="manual">{t.modals.manualAccount}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institution} ({a.type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.modals.statusLabel}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EntryStatus)}
                className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                <option value="paid">{t.modals.statusPaid}</option>
                <option value="pending">{t.modals.statusPending}</option>
                <option value="projected">{t.modals.statusProjected}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.modals.natureLabel}
              </label>
              <select
                value={entryNature}
                onChange={(e) => setEntryNature(e.target.value as EntryNature)}
                className="w-full px-2.5 py-2.5 rounded-lg text-xs bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                <option value="standard">{t.modals.natureReal}</option>
                <option value="internal_transfer">{t.modals.natureInternal}</option>
                <option value="invoice_payment">{t.modals.natureInvoice}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.modals.installmentLabel}
              </label>
              <input
                type="number"
                min="1"
                max="48"
                value={installmentCurrent}
                onChange={(e) => setInstallmentCurrent(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.modals.ofTotalLabel}
              </label>
              <input
                type="number"
                min="1"
                max="48"
                value={installmentTotal}
                onChange={(e) => setInstallmentTotal(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t.modals.merchantLabel}
            </label>
            <input
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder={t.modals.merchantPlaceholder}
              className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              {t.modals.cancel}
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              {t.modals.saveEntry}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
