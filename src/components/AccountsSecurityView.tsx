import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Pause,
  Play,
  Unplug,
  Plus,
  Lock,
  Activity,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Zap,
  X,
  ExternalLink,
  CreditCard,
  ShieldAlert,
} from 'lucide-react';
import {
  AccountStatus,
  AccountType,
  AppSettings,
  AuditEvent,
  BankAccount,
  CategoryRow,
  ConnectorProvider,
  EntryNature,
  InvoiceState,
  PaymentMethod,
} from '../types/finance';
import { MAX_BANK_ACCOUNTS, MONTH_NAMES_FULL } from '../data/initialData';
import { formatBRL, formatCompactDay } from '../utils/financeEngine';
import {
  buildConsentExpirationDate,
  evaluateAccountHealth,
} from '../utils/openFinance';
import { getTranslations } from '../utils/i18n';

interface AccountsSecurityViewProps {
  accounts: BankAccount[];
  rows: CategoryRow[];
  auditLog: AuditEvent[];
  settings: AppSettings;
  onConnectAccount: (account: Omit<BankAccount, 'id' | 'slot' | 'lastSync'>) => void;
  onSyncAccount: (accountId: string) => void;
  onRenewConsent: (accountId: string, termMonths?: number) => void;
  onSetAccountStatus: (accountId: string, status: AccountStatus, statusMessage?: string) => void;
  onTogglePauseAccount: (accountId: string) => void;
  onDisconnectAccount: (accountId: string) => void;
  onSimulateTransaction: (payload: {
    accountId: string;
    description: string;
    merchant: string;
    paymentMethod: PaymentMethod;
    entryNature?: EntryNature;
    installmentCurrent?: number;
    installmentTotal?: number;
    amount: number;
    month: number;
    day: number;
    type: 'inflow' | 'outflow';
  }) => { matchedRowName: string; isDeduplicated: boolean };
}

const INSTITUTION_PRESETS = [
  { name: 'Itaú Personnalité', code: '341', color: '#EA580C' },
  { name: 'Banco Inter', code: '077', color: '#F97316' },
  { name: 'BTG Pactual', code: '208', color: '#1E40AF' },
  { name: 'Nubank Ultravioleta', code: '260', color: '#8B5CF6' },
  { name: 'Santander Select', code: '033', color: '#EF4444' },
  { name: 'C6 Carbon', code: '336', color: '#475569' },
  { name: 'Caixa Econômica', code: '104', color: '#0284C7' },
];

const CONNECTOR_PROVIDERS: ConnectorProvider[] = [
  'Open Finance Brasil (FAPI)',
  'Pluggy',
  'Belvo',
];

const SIMULATION_PRESETS = [
  {
    label: 'Mercado Assaí · Débito à vista (R$ 189,40)',
    description: 'Supermercado Assaí Atacadista',
    merchant: 'Assaí Atacadista',
    paymentMethod: 'debit' as PaymentMethod,
    entryNature: 'standard' as EntryNature,
    installmentCurrent: 1,
    installmentTotal: 1,
    amount: 189.4,
    type: 'outflow' as const,
  },
  {
    label: 'Notebook · Crédito Parcela 2/6 (R$ 349,90)',
    description: 'Compra Cartão SA Loja Tech',
    merchant: 'Loja Tech (Cartão SA)',
    paymentMethod: 'credit' as PaymentMethod,
    entryNature: 'standard' as EntryNature,
    installmentCurrent: 2,
    installmentTotal: 6,
    amount: 349.9,
    type: 'outflow' as const,
  },
  {
    label: 'Pagamento de Fatura (Não duplica gasto · R$ 442,35)',
    description: 'Pagamento Fatura Cartão SA',
    merchant: 'Quitação Fatura Cartão SA',
    paymentMethod: 'transfer' as PaymentMethod,
    entryNature: 'invoice_payment' as EntryNature,
    installmentCurrent: 1,
    installmentTotal: 1,
    amount: 442.35,
    type: 'outflow' as const,
  },
  {
    label: 'Transferência Interna (Não duplica · R$ 500,00)',
    description: 'Transferência Entre Contas Próprias',
    merchant: 'Mesma Titularidade',
    paymentMethod: 'pix' as PaymentMethod,
    entryNature: 'internal_transfer' as EntryNature,
    installmentCurrent: 1,
    installmentTotal: 1,
    amount: 500.0,
    type: 'outflow' as const,
  },
  {
    label: 'Pix Pizzaria · Entrada (R$ 320,00)',
    description: 'Pix Recebido Pizzaria Turno Extra',
    merchant: 'Pizzaria Repasse',
    paymentMethod: 'pix' as PaymentMethod,
    entryNature: 'standard' as EntryNature,
    installmentCurrent: 1,
    installmentTotal: 1,
    amount: 320.0,
    type: 'inflow' as const,
  },
];

export const AccountsSecurityView: React.FC<AccountsSecurityViewProps> = ({
  accounts,
  rows,
  auditLog,
  settings,
  onConnectAccount,
  onSyncAccount,
  onRenewConsent,
  onSetAccountStatus,
  onTogglePauseAccount,
  onDisconnectAccount,
  onSimulateTransaction,
}) => {
  const [connectOpen, setConnectOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [instName, setInstName] = useState(INSTITUTION_PRESETS[0].name);
  const [connectorProvider, setConnectorProvider] = useState<ConnectorProvider>(
    'Open Finance Brasil (FAPI)'
  );
  const [instType, setInstType] = useState<AccountType>('Corrente');
  const [nickname, setNickname] = useState('Conta Reserva & Giro');
  const [initialBalance, setInitialBalance] = useState('0.00');
  const [creditLimit, setCreditLimit] = useState('5000.00');
  const [closingDay, setClosingDay] = useState('3');
  const [dueDay, setDueDay] = useState('10');
  const [invoiceState, setInvoiceState] = useState<InvoiceState>('open');
  const [consentTermMonths, setConsentTermMonths] = useState(12);
  const [defaultRowId, setDefaultRowId] = useState('var-outros');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  const [simAccountId, setSimAccountId] = useState(accounts[0]?.id ?? '');
  const [simDesc, setSimDesc] = useState('Supermercado Assaí Atacadista');
  const [simMerchant, setSimMerchant] = useState('Assaí Atacadista');
  const [simPaymentMethod, setSimPaymentMethod] = useState<PaymentMethod>('debit');
  const [simNature, setSimNature] = useState<EntryNature>('standard');
  const [simInstallmentCurrent, setSimInstallmentCurrent] = useState('1');
  const [simInstallmentTotal, setSimInstallmentTotal] = useState('1');
  const [simAmount, setSimAmount] = useState('189.40');
  const [simMonth, setSimMonth] = useState(
    Math.min(11, Math.max(0, settings.focusMonth ?? 10))
  );
  const [simType, setSimType] = useState<'inflow' | 'outflow'>('outflow');
  const [simFeedback, setSimFeedback] = useState<string | null>(null);
  const syncTimerRef = useRef<number | null>(null);

  const { privacyMode, language } = settings;
  const t = getTranslations(language);
  const isAtLimit = accounts.length >= MAX_BANK_ACCOUNTS;

  useEffect(() => {
    return () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (accounts.length === 0) {
      setSimAccountId('');
    } else if (!accounts.some((a) => a.id === simAccountId)) {
      setSimAccountId(accounts[0].id);
    }
  }, [accounts, simAccountId]);

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

  const handleOpenConnect = () => {
    if (isAtLimit) return;
    setStep(1);
    setConnectOpen(true);
  };

  const handleFinishConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAtLimit) return;
    const preset = INSTITUTION_PRESETS.find((p) => p.name === instName) ?? INSTITUTION_PRESETS[0];
    const parsedBal = parseFloat(initialBalance.replace(',', '.'));
    const safeBal = Number.isFinite(parsedBal) ? Number(parsedBal.toFixed(2)) : 0;
    const parsedLimit = parseFloat(creditLimit.replace(',', '.'));
    const safeLimit =
      instType === 'Cartão de Crédito' && Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Number(parsedLimit.toFixed(2))
        : undefined;
    const safeClosing = Math.min(31, Math.max(1, parseInt(closingDay, 10) || 3));
    const safeDue = Math.min(31, Math.max(1, parseInt(dueDay, 10) || 10));
    const availableLimit =
      safeLimit !== undefined
        ? Number(Math.max(0, safeLimit - Math.abs(Math.min(0, safeBal))).toFixed(2))
        : undefined;

    const randomSuffix = Math.floor(1000 + Math.random() * 8999);
    const challenge = `pkce_${Math.random().toString(36).slice(2, 10)}`;
    const nowDate = new Date();

    onConnectAccount({
      institution: preset.name,
      institutionCode: preset.code,
      type: instType,
      nickname: nickname.trim() || preset.name,
      balance: safeBal,
      color: preset.color,
      status: 'active',
      connectorProvider,
      consentGrantedAt: nowDate.toISOString().slice(0, 10),
      consentExpiresAt: buildConsentExpirationDate(consentTermMonths, nowDate),
      consentScope:
        instType === 'Cartão de Crédito'
          ? ['CREDIT_CARD_READ', 'TRANSACTIONS_READ']
          : ['ACCOUNTS_READ', 'BALANCES_READ', 'TRANSACTIONS_READ'],
      pkceChallengeId: challenge,
      maskedAccount:
        instType === 'Cartão de Crédito'
          ? `Final •••• ${randomSuffix}`
          : `Ag 0001 · CC •••• ${randomSuffix}-0`,
      defaultRowId,
      ...(instType === 'Cartão de Crédito'
        ? {
            creditLimit: safeLimit,
            availableLimit,
            invoiceClosingDay: safeClosing,
            invoiceDueDay: safeDue,
            currentInvoiceStatus: invoiceState,
          }
        : {}),
    });
    setConnectOpen(false);
  };

  const handleSync = (id: string) => {
    setSyncingId(id);
    onSyncAccount(id);
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      setSyncingId(null);
    }, 500);
  };

  const handleRenew = (id: string) => {
    setRenewingId(id);
    onRenewConsent(id, 12);
    window.setTimeout(() => setRenewingId(null), 500);
  };

  const handleRunSimulation = (e: React.FormEvent) => {
    e.preventDefault();
    const targetAcc = accounts.find((a) => a.id === simAccountId) ?? accounts[0];
    if (!targetAcc) return;
    const parsed = parseFloat(simAmount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const safeMonth = Math.min(11, Math.max(0, Number.isFinite(simMonth) ? Math.trunc(simMonth) : 10));

    const totInst = Math.min(48, Math.max(1, parseInt(simInstallmentTotal, 10) || 1));
    const curInst = Math.min(totInst, Math.max(1, parseInt(simInstallmentCurrent, 10) || 1));

    const result = onSimulateTransaction({
      accountId: targetAcc.id,
      description: simDesc.trim() || 'Movimentação Open Finance',
      merchant: simMerchant.trim() || simDesc.trim() || 'Estabelecimento',
      paymentMethod: simPaymentMethod,
      entryNature: simNature,
      installmentCurrent: curInst,
      installmentTotal: totInst,
      amount: Number(parsed.toFixed(2)),
      month: safeMonth,
      day: 23,
      type: simType,
    });

    if (result.isDeduplicated) {
      setSimFeedback(
        `Conciliação anti-duplicidade registrada: ${formatBRL(parsed, privacyMode)} (${
          simNature === 'invoice_payment' ? 'Pagamento de Fatura' : 'Transferência Interna'
        }) NÃO somado aos gastos reais.`
      );
    } else {
      const instText = totInst > 1 ? ` · Parcela ${curInst}/${totInst}` : ' · À vista';
      setSimFeedback(
        `Movimentação (${simPaymentMethod.toUpperCase()}${instText}) de ${formatBRL(
          parsed,
          privacyMode
        )} em "${simMerchant || simDesc}" injetada em "${result.matchedRowName}" (${MONTH_NAMES_FULL[safeMonth]}).`
      );
    }
  };

  const instTotalNum = Math.max(1, parseInt(simInstallmentTotal, 10) || 1);
  const instCurrentNum = Math.min(instTotalNum, Math.max(1, parseInt(simInstallmentCurrent, 10) || 1));
  const simAmountNum = parseFloat(simAmount.replace(',', '.')) || 0;
  const remainingInstallments = Math.max(0, instTotalNum - instCurrentNum);
  const remainingInstallmentTotal = Number((simAmountNum * remainingInstallments).toFixed(2));

  const attentionAccounts = accounts.filter((a) => evaluateAccountHealth(a).needsAction);

  return (
    <div className="space-y-6">
      {/* Slot Limit & Open Finance Brasil Compliance Header */}
      <div className="p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t.accounts.title}
            </h2>
            <span
              className={`font-mono text-xs font-semibold tabular-nums px-2.5 py-0.5 rounded-md border ${
                isAtLimit
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
              }`}
            >
              {accounts.length} / {MAX_BANK_ACCOUNTS} {t.openFinance.connectedSuffix}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t.accounts.subtitle}
          </p>

          <div className="mt-3 flex items-center gap-1.5 max-w-xs">
            {Array.from({ length: MAX_BANK_ACCOUNTS }).map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 flex-1 rounded-full ${
                  idx < accounts.length
                    ? 'bg-[#C9A86A]'
                    : 'bg-slate-200 dark:bg-white/[0.08]'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-2">
          <button
            type="button"
            disabled={isAtLimit}
            onClick={handleOpenConnect}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              isAtLimit
                ? 'bg-slate-200 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500 cursor-not-allowed'
                : 'bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>{t.accounts.connectBank}</span>
          </button>
          {isAtLimit && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              {t.accounts.limitReached}
            </span>
          )}
        </div>
      </div>

      {/* Attention Banner for Expired Consents / Connector Errors */}
      {attentionAccounts.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-300 dark:border-amber-500/40 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {attentionAccounts.length} conexão(ões) Open Finance requerem ação do titular
            </span>
          </div>
          <div className="space-y-1.5">
            {attentionAccounts.map((acc) => {
              const health = evaluateAccountHealth(acc);
              return (
                <div
                  key={acc.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300"
                >
                  <span>
                    <strong>{acc.institution}:</strong> {health.userMessage}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRenew(acc.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold bg-amber-600 text-white hover:bg-amber-500"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>{health.actionLabel || 'Renovar Consentimento'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Connected Accounts Grid */}
      {accounts.length === 0 ? (
        <div className="p-8 rounded-xl bg-white dark:bg-[#111827] border border-dashed border-slate-300 dark:border-white/[0.12] text-center space-y-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Nenhuma conta bancária conectada (0 / {MAX_BANK_ACCOUNTS})
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            Você está no estado inicial limpo. Clique em <strong>Autorizar Conta no Banco Oficial</strong> acima para iniciar o fluxo OAuth 2.0 / FAPI com consentimento explícito e zero solicitação de senhas bancárias ou dados de cartão físico.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const health = evaluateAccountHealth(acc);
            const isCreditCard = acc.type === 'Cartão de Crédito';
            const needsRenewal =
              health.effectiveStatus === 'consent_expired' ||
              health.effectiveStatus === 'sync_error' ||
              health.expiringSoon;

            return (
              <div
                key={acc.id}
                className={`p-5 rounded-xl bg-white dark:bg-[#111827] border flex flex-col justify-between gap-4 ${
                  health.effectiveStatus === 'consent_expired' ||
                  health.effectiveStatus === 'sync_error'
                    ? 'border-amber-400/70 dark:border-amber-500/50'
                    : 'border-slate-200 dark:border-white/[0.08]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Slot {acc.slot} · {acc.type} · {acc.connectorProvider ?? 'Open Finance Brasil (FAPI)'}
                      </div>
                      <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {acc.institution}
                      </h3>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {acc.nickname} · <span className="font-mono">{acc.maskedAccount}</span>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded border shrink-0 ${
                        health.effectiveStatus === 'active' && !health.expiringSoon
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                          : health.effectiveStatus === 'paused'
                          ? 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {health.badgeLabel}
                    </span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        {isCreditCard ? 'Fatura Atual' : 'Saldo Disponível em Conta'}
                      </span>
                      {isCreditCard && acc.currentInvoiceStatus && (
                        <span className="font-medium text-[#A68342] dark:text-[#E5C88F]">
                          {acc.currentInvoiceStatus === 'open'
                            ? 'Fatura Aberta'
                            : acc.currentInvoiceStatus === 'closed'
                            ? 'Fatura Fechada'
                            : 'Fatura Paga'}
                        </span>
                      )}
                    </div>
                    <div
                      className={`mt-0.5 text-xl font-semibold font-mono tabular-nums ${
                        acc.balance < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatBRL(acc.balance, privacyMode)}
                    </div>

                    {isCreditCard && acc.creditLimit !== undefined && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] space-y-1 text-[11px] font-mono tabular-nums">
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                          <span className="font-sans">Limite Disponível</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatBRL(acc.availableLimit ?? acc.creditLimit, privacyMode)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                          <span className="font-sans">Limite Total</span>
                          <span>{formatBRL(acc.creditLimit, privacyMode)}</span>
                        </div>
                        {(acc.invoiceClosingDay || acc.invoiceDueDay) && (
                          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-white/[0.05]">
                            <span className="font-sans">Fechamento / Venc.</span>
                            <span>
                              {formatCompactDay(acc.invoiceClosingDay)} / {formatCompactDay(acc.invoiceDueDay)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {(health.effectiveStatus === 'consent_expired' ||
                    health.effectiveStatus === 'sync_error' ||
                    health.expiringSoon) && (
                    <div className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{health.userMessage}</span>
                    </div>
                  )}

                  <div className="mt-3 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <div>
                      Última sinc.:{' '}
                      <span className="font-mono">
                        {formatSafeDateTime(acc.lastSync)}
                      </span>
                    </div>
                    <div>
                      Consentimento válido até:{' '}
                      <span className="font-mono">{acc.consentExpiresAt}</span>
                    </div>
                    <div className="truncate">
                      Escopo: <span className="font-mono">{acc.consentScope.join(', ')}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center gap-2">
                  {needsRenewal ? (
                    <button
                      type="button"
                      onClick={() => handleRenew(acc.id)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-500 transition-colors"
                    >
                      <ExternalLink className={`h-3.5 w-3.5 ${renewingId === acc.id ? 'animate-pulse' : ''}`} />
                      <span>Renovar no Banco</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSync(acc.id)}
                      disabled={health.effectiveStatus === 'paused'}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-[#232D42] disabled:opacity-40 transition-colors"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncingId === acc.id ? 'animate-spin' : ''}`} />
                      <span>Sincronizar</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onTogglePauseAccount(acc.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    {acc.status === 'active' ? (
                      <>
                        <Pause className="h-3.5 w-3.5" />
                        <span>Pausar</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        <span>Retomar</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDisconnectAccount(acc.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    <span>Revogar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Real-Time Transaction Simulator + LGPD / BACEN Security Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#C9A86A]" />
              Simulador Open Finance (À Vista, Parcelamentos & Anti-Duplicidade)
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Simule compras à vista ou parceladas no Crédito/Débito, Pix, transferências internas e pagamentos de fatura sem duplicar gastos reais.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SIMULATION_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setSimDesc(preset.description);
                  setSimMerchant(preset.merchant);
                  setSimPaymentMethod(preset.paymentMethod);
                  setSimNature(preset.entryNature);
                  setSimInstallmentCurrent(String(preset.installmentCurrent));
                  setSimInstallmentTotal(String(preset.installmentTotal));
                  setSimAmount(String(preset.amount));
                  setSimType(preset.type);
                }}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-700 dark:text-slate-300 hover:bg-[#C9A86A]/20 hover:text-[#8C6A2E] dark:hover:text-[#E5C88F] transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleRunSimulation} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Conta Conectada
                </label>
                <select
                  value={simAccountId}
                  onChange={(e) => setSimAccountId(e.target.value)}
                  disabled={accounts.length === 0}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  {accounts.length === 0 && <option value="">Nenhuma conta</option>}
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.institution}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Modalidade
                </label>
                <select
                  value={simPaymentMethod}
                  onChange={(e) => setSimPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value="credit">Crédito (Fatura)</option>
                  <option value="debit">Débito em Conta</option>
                  <option value="pix">Pix</option>
                  <option value="transfer">Transferência</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Natureza (Anti-Duplicidade)
                </label>
                <select
                  value={simNature}
                  onChange={(e) => setSimNature(e.target.value as EntryNature)}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value="standard">Gasto / Receita Real</option>
                  <option value="internal_transfer">Transferência Interna (Não duplica)</option>
                  <option value="invoice_payment">Pagamento de Fatura (Não duplica)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Tipo de Fluxo
                </label>
                <select
                  value={simType}
                  onChange={(e) => setSimType(e.target.value as 'inflow' | 'outflow')}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value="outflow">Saída / Compra</option>
                  <option value="inflow">Entrada / Recebimento</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Parcela Atual (1 = à vista)
                </label>
                <input
                  type="number"
                  min="1"
                  max="48"
                  value={simInstallmentCurrent}
                  onChange={(e) => setSimInstallmentCurrent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Total de Parcelas
                </label>
                <input
                  type="number"
                  min="1"
                  max="48"
                  value={simInstallmentTotal}
                  onChange={(e) => setSimInstallmentTotal(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {instTotalNum > 1 && (
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Parcelamento: <strong>{instCurrentNum}/{instTotalNum}</strong>
                </span>
                <span>
                  Restam <strong>{remainingInstallments}</strong> parcela(s) · Compromisso futuro:{' '}
                  <strong className="text-[#A68342] dark:text-[#E5C88F]">
                    {formatBRL(remainingInstallmentTotal, privacyMode)}
                  </strong>
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Onde foi gasto (Estabelecimento)
                </label>
                <input
                  type="text"
                  value={simMerchant}
                  onChange={(e) => setSimMerchant(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Descrição Bancária (Auto-Categorização)
                </label>
                <input
                  type="text"
                  value={simDesc}
                  onChange={(e) => setSimDesc(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Valor da Parcela / Lançamento (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Mês
                </label>
                <select
                  value={simMonth}
                  onChange={(e) => setSimMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  {MONTH_NAMES_FULL.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={accounts.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 disabled:opacity-40"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Simular Nova Movimentação Open Finance</span>
            </button>
          </form>

          {simFeedback && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{simFeedback}</span>
            </div>
          )}
        </div>

        {/* LGPD / BACEN Security Architecture & Connector Diagnostics */}
        <div className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Conformidade LGPD & BACEN (Open Finance)
            </h3>
          </div>

          <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Zero Senhas Bancárias, PINs, MFA ou CVV
              </div>
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                Nunca solicitamos, simulamos campos ou armazenamos senhas bancárias, tokens SMS/MFA, PINs de transação ou dados completos de cartão físico (número, CVV ou validade).
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                OAuth 2.0 / FAPI + Consentimento Revogável
              </div>
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                A autorização ocorre sempre fora do app, no ambiente oficial da instituição participante, com prazo explícito, leitura mascarada sob a LGPD e revogação imediata (RFC 7009).
              </p>
            </div>

            {accounts.length > 0 && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] space-y-2">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Diagnóstico de Conectores (Simular Falha / Expiração)
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Teste a transparência de estados sem expor dados sensíveis ou logs técnicos:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onSetAccountStatus(
                        simAccountId || accounts[0].id,
                        'consent_expired',
                        'Consentimento expirado pelo prazo configurado. Renove diretamente no ambiente oficial do banco.'
                      )
                    }
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                  >
                    Simular Consentimento Expirado
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSetAccountStatus(
                        simAccountId || accounts[0].id,
                        'sync_error',
                        'Instituição indisponível temporariamente no conector Open Finance. Tente novamente em instantes ou reconecte.'
                      )
                    }
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30 hover:bg-red-500/20"
                  >
                    Simular Erro de Conector
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#0D1320] border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <Activity className="h-3.5 w-3.5 text-[#C9A86A]" />
            <span>Trilha de Auditoria LGPD (Sem Dados Sensíveis)</span>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {auditLog.length} eventos registrados
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
                    {ev.action} · <span className="text-slate-500 dark:text-slate-400">{ev.actor}</span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 truncate">{ev.detail}</div>
                </div>
                <div className="text-right shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  <div>{ev.securityProtocol}</div>
                  <div>
                    {formatSafeDateTime(ev.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Official External OAuth 2.0 + FAPI Consent Modal */}
      {connectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setConnectOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Autorizar Conexão via Open Finance (OAuth 2.0 / FAPI)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Etapa {step} de 3 · Slot {accounts.length + 1} de {MAX_BANK_ACCOUNTS}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConnectOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleFinishConnect} className="p-6 space-y-4">
              {step === 1 && (
                <>
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>Segurança LGPD / BACEN:</strong> A autenticação ocorrerá fora deste app, no ambiente oficial da instituição escolhida. Nunca digite senhas bancárias, tokens MFA/SMS, PINs ou CVV aqui.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Instituição Financeira
                      </label>
                      <select
                        value={instName}
                        onChange={(e) => setInstName(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                      >
                        {INSTITUTION_PRESETS.map((p) => (
                          <option key={p.code} value={p.name}>
                            {p.name} (Banco {p.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Conector / API Oficial
                      </label>
                      <select
                        value={connectorProvider}
                        onChange={(e) => setConnectorProvider(e.target.value as ConnectorProvider)}
                        className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                      >
                        {CONNECTOR_PROVIDERS.map((prov) => (
                          <option key={prov} value={prov}>
                            {prov}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Tipo de Vínculo
                      </label>
                      <select
                        value={instType}
                        onChange={(e) => setInstType(e.target.value as AccountType)}
                        className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                      >
                        <option value="Corrente">Conta Corrente</option>
                        <option value="Digital">Conta Digital</option>
                        <option value="Cartão de Crédito">Cartão de Crédito (Fatura)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Saldo / Fatura Inicial (Opcional)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={initialBalance}
                        onChange={(e) => setInitialBalance(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {instType === 'Cartão de Crédito' && (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <CreditCard className="h-3.5 w-3.5 text-[#C9A86A]" />
                        <span>Parâmetros da Fatura (Sem número do cartão, CVV ou validade)</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="col-span-2">
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            Limite Total (R$)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={creditLimit}
                            onChange={(e) => setCreditLimit(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs font-mono tabular-nums bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            Fechamento
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={closingDay}
                            onChange={(e) => setClosingDay(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            Vencimento
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={dueDay}
                            onChange={(e) => setDueDay(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          Estado da Fatura Atual
                        </label>
                        <select
                          value={invoiceState}
                          onChange={(e) => setInvoiceState(e.target.value as InvoiceState)}
                          className="w-full px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                        >
                          <option value="open">Aberta (Recebendo compras)</option>
                          <option value="closed">Fechada (Aguardando vencimento)</option>
                          <option value="paid">Paga / Conciliada</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Apelido da Conta
                    </label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                    >
                      Avançar para Consentimento FAPI
                    </button>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-2.5 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                      <Lock className="h-4 w-4 text-emerald-500" />
                      <span>Consentimento Explícito OAuth 2.0 + FAPI ({connectorProvider})</span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                      A autenticação ocorre no ambiente oficial de <strong>{instName}</strong>. Nenhuma senha bancária é digitada neste aplicativo e nenhuma permissão de movimentação financeira é solicitada.
                    </p>
                    <ul className="space-y-1 text-slate-600 dark:text-slate-300 font-mono text-[11px] pt-1">
                      <li>
                        • Escopo:{' '}
                        {instType === 'Cartão de Crédito'
                          ? 'CREDIT_CARD_READ · TRANSACTIONS_READ'
                          : 'ACCOUNTS_READ · BALANCES_READ · TRANSACTIONS_READ'}
                      </li>
                      <li>• Criptografia: TLS 1.3 + PKCE (FAPI Brasil)</li>
                      <li>• Dados mascarados sob conformidade LGPD</li>
                    </ul>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Prazo Definido do Consentimento (Revogável a qualquer momento)
                    </label>
                    <select
                      value={consentTermMonths}
                      onChange={(e) => setConsentTermMonths(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    >
                      <option value={3}>3 meses (90 dias)</option>
                      <option value={6}>6 meses (180 dias)</option>
                      <option value={12}>12 meses (365 dias · Máximo BACEN)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                    >
                      Confirmar Escopo e Mapear
                    </button>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Linha Padrão na Grade para Transações Não Classificadas
                    </label>
                    <select
                      value={defaultRowId}
                      onChange={(e) => setDefaultRowId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    >
                      {rows
                        .filter((r) => !r.hidden)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.block === 'income' ? 'Receita' : r.block === 'fixed' ? 'Fixa' : r.block === 'variable' ? 'Variável' : 'Guardado'})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Ao confirmar, o fluxo OAuth 2.0 / FAPI conclui a vinculação somente leitura, evitando duplicidade entre pagamentos de fatura, transferências internas e compras reais.
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Concluir Autorização Oficial</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
