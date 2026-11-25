import React, { useState } from 'react';
import {
  ShieldCheck,
  Pause,
  Play,
  Trash2,
  Plus,
  Activity,
  AlertCircle,
  X,
  Pencil,
  Check,
  Wallet,
} from 'lucide-react';
import {
  AccountType,
  AppSettings,
  AuditEvent,
  BankAccount,
} from '../types/finance';
import { MAX_BANK_ACCOUNTS } from '../data/initialData';
import { BRAZILIAN_BANKS } from '../data/brazilBanks';
import { formatBRL } from '../utils/financeEngine';
import { getTranslations } from '../utils/i18n';
import { BankSelectionValue, BankSelectorField } from './BankSelectorField';

interface AccountsSecurityViewProps {
  accounts: BankAccount[];
  auditLog: AuditEvent[];
  settings: AppSettings;
  onAddAccount: (payload: {
    institution: string;
    institutionCode: string;
    type: AccountType;
    nickname: string;
    balance: number;
    color: string;
  }) => void;
  onUpdateAccountBalance: (accountId: string, balance: number) => void;
  onTogglePauseAccount: (accountId: string) => void;
  onDisconnectAccount: (accountId: string) => void;
}

const DEFAULT_BANK = BRAZILIAN_BANKS.find((b) => b.id === 'nubank') ?? BRAZILIAN_BANKS[0];

export const AccountsSecurityView: React.FC<AccountsSecurityViewProps> = ({
  accounts,
  auditLog,
  settings,
  onAddAccount,
  onUpdateAccountBalance,
  onTogglePauseAccount,
  onDisconnectAccount,
}) => {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bankValue, setBankValue] = useState<BankSelectionValue>({
    bankId: DEFAULT_BANK.id,
    bankName: DEFAULT_BANK.name,
    bankColor: DEFAULT_BANK.color,
    bankCategory: DEFAULT_BANK.category,
    bankCode: DEFAULT_BANK.code,
  });
  const [instType, setInstType] = useState<AccountType>('Corrente');
  const [nickname, setNickname] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null);
  const [editingBalanceValue, setEditingBalanceValue] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { privacyMode, language } = settings;
  const t = getTranslations(language);
  const isAtLimit = accounts.length >= MAX_BANK_ACCOUNTS;

  const totalActiveBalance = accounts
    .filter((a) => a.status === 'active')
    .reduce((sum, a) => sum + a.balance, 0);

  const formatSafeDateTime = (iso: string) => {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openAddModal = () => {
    setBankValue({
      bankId: DEFAULT_BANK.id,
      bankName: DEFAULT_BANK.name,
      bankColor: DEFAULT_BANK.color,
      bankCategory: DEFAULT_BANK.category,
      bankCode: DEFAULT_BANK.code,
    });
    setInstType('Corrente');
    setNickname('');
    setInitialBalance('');
    setFeedback(null);
    setAddModalOpen(true);
  };

  const handleSaveNewAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAtLimit) return;
    const parsedBalance = parseFloat(initialBalance.replace(',', '.'));
    const safeBalance = Number.isFinite(parsedBalance) ? Number(parsedBalance.toFixed(2)) : 0;

    onAddAccount({
      institution: bankValue.bankName,
      institutionCode: bankValue.bankCode,
      type: instType,
      nickname: nickname.trim() || `${bankValue.bankName} · ${instType}`,
      balance: safeBalance,
      color: bankValue.bankColor,
    });

    setAddModalOpen(false);
    setFeedback({
      type: 'ok',
      text: `Conta ${bankValue.bankName} adicionada ao cofre com sucesso.`,
    });
  };

  const handleCommitBalance = (accountId: string) => {
    const parsed = parseFloat(editingBalanceValue.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setFeedback({ type: 'err', text: 'Informe um valor numérico válido para o saldo.' });
      return;
    }
    onUpdateAccountBalance(accountId, Number(parsed.toFixed(2)));
    setEditingBalanceId(null);
    setEditingBalanceValue('');
    setFeedback({ type: 'ok', text: 'Saldo da conta atualizado.' });
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t.accounts.title}
            </h2>
            <span
              className={`font-mono text-xs font-semibold tabular-nums px-2.5 py-0.5 rounded-md border ${
                isAtLimit
                  ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                  : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
              }`}
            >
              {accounts.length} / {MAX_BANK_ACCOUNTS}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.accounts.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {accounts.length > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-right">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Saldo Consolidado</div>
              <div className="text-sm font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatBRL(totalActiveBalance, privacyMode, true)}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={isAtLimit}
            onClick={openAddModal}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              isAtLimit
                ? 'bg-slate-200 dark:bg-white/[0.06] text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>{t.accounts.connectBank}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
          }`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Accounts List */}
      {accounts.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-[#111827] border border-dashed border-slate-300 dark:border-white/[0.12] text-center space-y-3">
          <div className="mx-auto h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Nenhuma conta cadastrada (0 / {MAX_BANK_ACCOUNTS})
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            Adicione suas contas correntes ou digitais para acompanhar seu saldo em conta diretamente no painel principal. Para cartões de crédito e faturas parceladas, use a aba <strong>Cartões</strong>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const isEditing = editingBalanceId === acc.id;
            const isPaused = acc.status === 'paused';

            return (
              <div
                key={acc.id}
                className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className="mt-1 h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: acc.color || '#2563EB' }}
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Slot {acc.slot} · {acc.type}
                        </div>
                        <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {acc.institution}
                        </h3>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {acc.nickname}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-md border shrink-0 ${
                        isPaused
                          ? 'bg-slate-100 dark:bg-white/5 text-slate-500 border-slate-200 dark:border-white/10'
                          : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                      }`}
                    >
                      {isPaused ? 'Pausada' : 'Ativa'}
                    </span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Saldo Atual
                      </span>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBalanceId(acc.id);
                            setEditingBalanceValue(String(acc.balance));
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Atualizar saldo</span>
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editingBalanceValue}
                          onChange={(e) => setEditingBalanceValue(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg text-sm font-mono bg-slate-50 dark:bg-[#0D1320] border border-blue-400 text-slate-900 dark:text-white focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleCommitBalance(acc.id)}
                          className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                          aria-label="Confirmar saldo"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingBalanceId(null)}
                          className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500"
                          aria-label="Cancelar edição"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-0.5 text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatBRL(acc.balance, privacyMode, true)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onTogglePauseAccount(acc.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-[#232D42] transition-colors"
                  >
                    {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    <span>{isPaused ? 'Reativar' : 'Pausar'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDisconnectAccount(acc.id)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remover</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Privacy & LGPD Vault Architecture */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-2 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Privacidade Local & Conformidade LGPD
          </h3>
        </div>
        <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
          O cofre não solicita nem armazena senhas bancárias, CVV, códigos SMS/MFA ou número completo de cartão. Todos os lançamentos, saldos e cartões ficam protegidos sob seu CPF com PIN, biometria nativa e backup automático a cada 24h.
        </p>
      </div>

      {/* Audit Log */}
      <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#0D1320] border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <Activity className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>Trilha de Auditoria do Cofre</span>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {auditLog.length} eventos
          </span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.05] max-h-80 overflow-y-auto">
          {auditLog.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Nenhum evento de auditoria registrado ainda.
            </div>
          ) : (
            auditLog.map((ev) => (
              <div
                key={ev.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {ev.action} · <span className="text-slate-500">{ev.actor}</span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 truncate">{ev.detail}</div>
                </div>
                <div className="text-right shrink-0 font-mono text-[11px] text-slate-500">
                  <div>{ev.securityProtocol}</div>
                  <div>{formatSafeDateTime(ev.timestamp)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Manual Bank Account Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setAddModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-xl rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Adicionar Conta Bancária
              </h3>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewAccount} className="p-6 space-y-4">
              <BankSelectorField value={bankValue} onChange={setBankValue} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Tipo de Conta
                  </label>
                  <select
                    value={instType}
                    onChange={(e) => setInstType(e.target.value as AccountType)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  >
                    <option value="Corrente">Conta Corrente</option>
                    <option value="Digital">Conta Digital / Carteira</option>
                    <option value="Cartão de Crédito">Conta Cartão</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Saldo Atual (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-mono bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Apelido da Conta (opcional)
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={`Ex.: ${bankValue.bankName} Principal`}
                  className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Salvar Conta</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
