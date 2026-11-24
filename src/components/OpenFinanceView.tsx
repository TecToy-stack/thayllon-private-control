import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Filter,
  Landmark,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unplug,
  X,
  Zap,
} from 'lucide-react';
import {
  AccountStatus,
  AccountType,
  AppSettings,
  AuditEvent,
  AuditEventType,
  AutoRule,
  BankAccount,
  CategoryRow,
  ConnectorProvider,
  EntryNature,
  InvoiceState,
  PaymentMethod,
} from '../types/finance';
import { MAX_BANK_ACCOUNTS, MONTH_NAMES_FULL } from '../data/initialData';
import { formatBRL, formatCompactDay } from '../utils/financeEngine';
import { buildConsentExpirationDate, evaluateAccountHealth } from '../utils/openFinance';
import { getTranslations } from '../utils/i18n';

interface OpenFinanceViewProps {
  accounts: BankAccount[];
  revokedConsents: BankAccount[];
  rows: CategoryRow[];
  rules: AutoRule[];
  auditLog: AuditEvent[];
  settings: AppSettings;
  onConnectAccount: (account: Omit<BankAccount, 'id' | 'slot' | 'lastSync'>) => void;
  onSyncAccount: (accountId: string) => void;
  onRenewConsent: (accountId: string, termMonths?: number) => void;
  onSetAccountStatus: (accountId: string, status: AccountStatus, statusMessage?: string) => void;
  onTogglePauseAccount: (accountId: string) => void;
  onDisconnectAccount: (accountId: string) => void;
  onAddRule: (rule: Omit<AutoRule, 'id'>) => void;
  onToggleRule: (ruleId: string) => void;
  onDeleteRule: (ruleId: string) => void;
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
  { name: 'Nubank Ultravioleta', code: '260', color: '#8B5CF6' },
  { name: 'Santander Select', code: '033', color: '#EF4444' },
  { name: 'Mercado Pago', code: '323', color: '#0EA5E9' },
  { name: 'Itaú Personnalité', code: '341', color: '#EA580C' },
  { name: 'Banco Inter', code: '077', color: '#F97316' },
  { name: 'BTG Pactual', code: '208', color: '#1E40AF' },
  { name: 'C6 Carbon', code: '336', color: '#475569' },
  { name: 'Caixa Econômica', code: '104', color: '#0284C7' },
];

const CONNECTOR_PROVIDERS: ConnectorProvider[] = [
  'Open Finance Brasil (FAPI)',
  'Pluggy',
  'Belvo',
];

const SCOPE_OPTIONS: { code: string; label: string; desc: string }[] = [
  {
    code: 'ACCOUNTS_READ',
    label: 'Dados cadastrais',
    desc: 'Titularidade mascarada, agência e identificação da conta.',
  },
  {
    code: 'BALANCES_READ',
    label: 'Saldos',
    desc: 'Saldo disponível e bloqueado para consolidação patrimonial.',
  },
  {
    code: 'TRANSACTIONS_READ',
    label: 'Extratos / Transações',
    desc: 'Histórico de entradas, débitos, Pix e compras para a Grade Mensal.',
  },
  {
    code: 'CREDIT_CARD_READ',
    label: 'Limite de crédito',
    desc: 'Faturas abertas/fechadas, vencimentos e limite disponível.',
  },
];

const SCOPE_LABELS: Record<string, string> = {
  ACCOUNTS_READ: 'Dados cadastrais',
  BALANCES_READ: 'Saldos',
  TRANSACTIONS_READ: 'Extratos / Transações',
  CREDIT_CARD_READ: 'Limite de crédito',
};

const QUICK_MOVEMENT_PRESETS = [
  {
    label: 'Pix recebido · Pizzaria',
    description: 'Pix Recebido Pizzaria Turno',
    merchant: 'Repasse Pizzaria',
    paymentMethod: 'pix' as PaymentMethod,
    entryNature: 'standard' as EntryNature,
    type: 'inflow' as const,
    amount: '420.00',
    day: '8',
    installmentCurrent: '1',
    installmentTotal: '1',
  },
  {
    label: 'Compra no cartão · Mercado',
    description: 'Compra Cartão SA Supermercado',
    merchant: 'Supermercado Central',
    paymentMethod: 'credit' as PaymentMethod,
    entryNature: 'standard' as EntryNature,
    type: 'outflow' as const,
    amount: '248.90',
    day: '14',
    installmentCurrent: '1',
    installmentTotal: '1',
  },
  {
    label: 'Débito em conta · Combustível/Moto',
    description: 'Posto Shell Combustivel Moto',
    merchant: 'Posto Shell',
    paymentMethod: 'debit' as PaymentMethod,
    entryNature: 'standard' as EntryNature,
    type: 'outflow' as const,
    amount: '65.00',
    day: '16',
    installmentCurrent: '1',
    installmentTotal: '1',
  },
  {
    label: 'Boleto / Transferência · Energia',
    description: 'Boleto Enel Energia Eletrica',
    merchant: 'Enel Distribuição',
    paymentMethod: 'transfer' as PaymentMethod,
    entryNature: 'standard' as EntryNature,
    type: 'outflow' as const,
    amount: '194.50',
    day: '15',
    installmentCurrent: '1',
    installmentTotal: '1',
  },
  {
    label: 'Pagamento de Fatura (Anti-Duplicidade)',
    description: 'Pagamento Fatura Cartão MP',
    merchant: 'Quitação Fatura MP',
    paymentMethod: 'transfer' as PaymentMethod,
    entryNature: 'invoice_payment' as EntryNature,
    type: 'outflow' as const,
    amount: '240.03',
    day: '17',
    installmentCurrent: '1',
    installmentTotal: '1',
  },
];

export const OpenFinanceView: React.FC<OpenFinanceViewProps> = ({
  accounts,
  revokedConsents,
  rows,
  rules,
  auditLog,
  settings,
  onConnectAccount,
  onSyncAccount,
  onRenewConsent,
  onSetAccountStatus,
  onTogglePauseAccount,
  onDisconnectAccount,
  onAddRule,
  onToggleRule,
  onDeleteRule,
  onSimulateTransaction,
}) => {
  const { privacyMode, language } = settings;
  const t = getTranslations(language);
  const isAtLimit = accounts.length >= MAX_BANK_ACCOUNTS;

  // Sub-section filter / tabs inside Open Finance view
  const [sectionView, setSectionView] = useState<'all' | 'consents' | 'simulator' | 'audit'>('all');

  // Consent actions state
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  // 4-Step Guided Connection Wizard State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [instName, setInstName] = useState(INSTITUTION_PRESETS[0].name);
  const [connectorProvider, setConnectorProvider] = useState<ConnectorProvider>(
    'Open Finance Brasil (FAPI)'
  );
  const [instType, setInstType] = useState<AccountType>('Digital');
  const [nickname, setNickname] = useState('Conta Principal Open Finance');
  const [initialBalance, setInitialBalance] = useState('0.00');
  const [creditLimit, setCreditLimit] = useState('6000.00');
  const [closingDay, setClosingDay] = useState('3');
  const [dueDay, setDueDay] = useState('10');
  const [invoiceState, setInvoiceState] = useState<InvoiceState>('open');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'ACCOUNTS_READ',
    'BALANCES_READ',
    'TRANSACTIONS_READ',
  ]);
  const [consentTermMonths, setConsentTermMonths] = useState(12);
  const [pkceAuthorized, setPkceAuthorized] = useState(false);
  const [pkceHandshakeChallenge, setPkceHandshakeChallenge] = useState('');
  const [defaultRowId, setDefaultRowId] = useState('var-outros');
  const [wizardNewKeyword, setWizardNewKeyword] = useState('');
  const [wizardNewRuleRowId, setWizardNewRuleRowId] = useState('inc-pizzaria');

  // Transaction Simulator State
  const [simAccountId, setSimAccountId] = useState(accounts[0]?.id ?? '');
  const [simDesc, setSimDesc] = useState('Compra Cartão SA Supermercado');
  const [simMerchant, setSimMerchant] = useState('Supermercado Central');
  const [simPaymentMethod, setSimPaymentMethod] = useState<PaymentMethod>('credit');
  const [simNature, setSimNature] = useState<EntryNature>('standard');
  const [simType, setSimType] = useState<'inflow' | 'outflow'>('outflow');
  const [simAmount, setSimAmount] = useState('248.90');
  const [simDay, setSimDay] = useState('14');
  const [simMonth, setSimMonth] = useState(
    Math.min(11, Math.max(0, settings.focusMonth ?? 10))
  );
  const [simInstallmentCurrent, setSimInstallmentCurrent] = useState('1');
  const [simInstallmentTotal, setSimInstallmentTotal] = useState('1');
  const [simFeedback, setSimFeedback] = useState<string | null>(null);

  // Rules management quick form
  const [newRuleKeyword, setNewRuleKeyword] = useState('');
  const [newRuleRowId, setNewRuleRowId] = useState('var-mercado');

  // Audit log filter
  const [auditTypeFilter, setAuditTypeFilter] = useState<'all' | AuditEventType>('all');
  const [auditSearch, setAuditSearch] = useState('');

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
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

  const visibleRows = useMemo(() => rows.filter((r) => !r.hidden), [rows]);

  const formatSafeDateTime = (iso: string) => {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const attentionAccounts = useMemo(
    () => accounts.filter((a) => evaluateAccountHealth(a).needsAction),
    [accounts]
  );

  // Preview auto-categorization match in real time for the simulator
  const matchedRulePreview = useMemo(() => {
    const text = `${simDesc} ${simMerchant}`.toLowerCase();
    const matchedRule = rules.find((r) => r.enabled && text.includes(r.keyword.toLowerCase()));
    if (matchedRule) {
      const target = rows.find((r) => r.id === matchedRule.targetRowId && !r.hidden);
      if (target) {
        return { rowName: target.name, ruleKeyword: matchedRule.keyword };
      }
    }
    const acc = accounts.find((a) => a.id === simAccountId);
    if (simType === 'inflow') {
      const fallback = rows.find((r) => r.id === 'inc-extras') ?? rows.find((r) => r.block === 'income');
      return { rowName: fallback?.name ?? 'EXTRAS', ruleKeyword: null };
    }
    const fallback =
      (acc?.defaultRowId ? rows.find((r) => r.id === acc.defaultRowId) : undefined) ??
      rows.find((r) => r.id === 'var-outros');
    return { rowName: fallback?.name ?? 'OUTROS', ruleKeyword: null };
  }, [simDesc, simMerchant, simType, simAccountId, rules, rows, accounts]);

  // Filtered Audit Log
  const filteredAuditLog = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLog.filter((ev) => {
      if (auditTypeFilter !== 'all') {
        const inferredType: AuditEventType =
          ev.eventType ??
          (ev.action.toLowerCase().includes('revog')
            ? 'revoke'
            : ev.action.toLowerCase().includes('renov')
            ? 'renew'
            : ev.action.toLowerCase().includes('conex') || ev.action.toLowerCase().includes('autoriz')
            ? 'auth'
            : ev.action.toLowerCase().includes('transa') || ev.action.toLowerCase().includes('concilia')
            ? 'transaction'
            : ev.action.toLowerCase().includes('sincron') || ev.action.toLowerCase().includes('fatura')
            ? 'sync'
            : 'status');
        if (inferredType !== auditTypeFilter) return false;
      }
      if (!q) return true;
      return (
        ev.action.toLowerCase().includes(q) ||
        ev.actor.toLowerCase().includes(q) ||
        ev.detail.toLowerCase().includes(q) ||
        (ev.institution ?? '').toLowerCase().includes(q) ||
        ev.securityProtocol.toLowerCase().includes(q)
      );
    });
  }, [auditLog, auditTypeFilter, auditSearch]);

  const handleOpenWizard = () => {
    if (isAtLimit) return;
    setWizardStep(1);
    setPkceAuthorized(false);
    setPkceHandshakeChallenge(`pkce_${Math.random().toString(36).slice(2, 10)}`);
    setSelectedScopes(
      instType === 'Cartão de Crédito'
        ? ['ACCOUNTS_READ', 'CREDIT_CARD_READ', 'TRANSACTIONS_READ']
        : ['ACCOUNTS_READ', 'BALANCES_READ', 'TRANSACTIONS_READ']
    );
    setWizardOpen(true);
  };

  const handleToggleScope = (code: string) => {
    setSelectedScopes((prev) =>
      prev.includes(code)
        ? prev.length > 1
          ? prev.filter((c) => c !== code)
          : prev
        : [...prev, code]
    );
  };

  const handleWizardAddRule = () => {
    if (!wizardNewKeyword.trim()) return;
    onAddRule({
      keyword: wizardNewKeyword.trim().toLowerCase(),
      targetRowId: wizardNewRuleRowId,
      enabled: true,
    });
    setWizardNewKeyword('');
  };

  const handleCompleteWizard = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAtLimit || !pkceAuthorized) return;

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
      consentScope: selectedScopes,
      pkceChallengeId: pkceHandshakeChallenge || `pkce_${Math.random().toString(36).slice(2, 10)}`,
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
    setWizardOpen(false);
  };

  const handleSync = (id: string) => {
    setSyncingId(id);
    onSyncAccount(id);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setSyncingId(null);
    }, 500);
  };

  const handleRenew = (id: string) => {
    setRenewingId(id);
    onRenewConsent(id, 12);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setRenewingId(null);
    }, 500);
  };

  const handleRunSimulation = (e: React.FormEvent) => {
    e.preventDefault();
    const targetAcc = accounts.find((a) => a.id === simAccountId) ?? accounts[0];
    if (!targetAcc) return;
    const parsed = parseFloat(simAmount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const safeMonth = Math.min(11, Math.max(0, Number.isFinite(simMonth) ? Math.trunc(simMonth) : 10));
    const safeDay = Math.min(31, Math.max(1, parseInt(simDay, 10) || 15));
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
      day: safeDay,
      type: simType,
    });

    if (result.isDeduplicated) {
      setSimFeedback(
        `Conciliação anti-duplicidade registrada em D/${String(safeDay).padStart(2, '0')}: ${formatBRL(
          parsed,
          privacyMode
        )} (${
          simNature === 'invoice_payment' ? 'Pagamento de Fatura' : 'Transferência Interna'
        }) não duplicado nos gastos reais.`
      );
    } else {
      setSimFeedback(
        `Movimentação (${simPaymentMethod.toUpperCase()} · D/${String(safeDay).padStart(
          2,
          '0'
        )}) de ${formatBRL(parsed, privacyMode)} categorizada em "${
          result.matchedRowName
        }" (${MONTH_NAMES_FULL[safeMonth]}), refletida na Grade, Timeline e Auditoria.`
      );
    }
  };

  const handleAddInlineRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleKeyword.trim()) return;
    onAddRule({
      keyword: newRuleKeyword.trim().toLowerCase(),
      targetRowId: newRuleRowId,
      enabled: true,
    });
    setNewRuleKeyword('');
  };

  return (
    <div className="space-y-6">
      {/* Top Open Finance Overview & Slot Meter */}
      <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-[#C9A86A]" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t.openFinance.title}
                </h2>
              </div>
              <span
                className={`font-mono text-xs font-semibold tabular-nums px-2.5 py-0.5 rounded-md border ${
                  isAtLimit
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                }`}
              >
                {accounts.length} / {MAX_BANK_ACCOUNTS} {t.openFinance.connectedSuffix}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              {t.openFinance.subtitle}
            </p>
            <div className="pt-1 flex items-center gap-1.5 max-w-xs">
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

          <div className="flex flex-col items-start lg:items-end gap-2 shrink-0">
            <button
              type="button"
              disabled={isAtLimit}
              onClick={handleOpenWizard}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                isAtLimit
                  ? 'bg-slate-200 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90'
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>{t.openFinance.connectInstitution}</span>
            </button>
            {isAtLimit && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                {t.openFinance.limitReached}
              </span>
            )}
          </div>
        </div>

        {/* Section Filter Tabs */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08]">
            {(
              [
                { id: 'all', label: t.openFinance.tabAll },
                { id: 'consents', label: `${t.openFinance.tabConsents} (${accounts.length}/5)` },
                { id: 'simulator', label: t.openFinance.tabSimulator },
                { id: 'audit', label: `${t.openFinance.tabAudit} (${auditLog.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSectionView(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  sectionView === tab.id
                    ? 'bg-white dark:bg-[#1A2234] text-slate-900 dark:text-[#E5C88F] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>Ativas: {accounts.filter((a) => evaluateAccountHealth(a).effectiveStatus === 'active').length}</span>
            <span>·</span>
            <span>Pausadas: {accounts.filter((a) => a.status === 'paused').length}</span>
            <span>·</span>
            <span>Revogadas: {revokedConsents.length}</span>
          </div>
        </div>
      </div>

      {/* Attention Banner */}
      {attentionAccounts.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-300 dark:border-amber-500/40 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {attentionAccounts.length} consentimento(s) Open Finance requerem ação
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
                    <span>{health.actionLabel || 'Renovar consentimento'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 1. RESUMO & GESTÃO DE CONSENTIMENTOS */}
      {(sectionView === 'all' || sectionView === 'consents') && (
        <div className="space-y-4">
          {accounts.length === 0 ? (
            <div className="p-8 rounded-xl bg-white dark:bg-[#111827] border border-dashed border-slate-300 dark:border-white/[0.12] text-center space-y-3">
              <div className="mx-auto h-10 w-10 rounded-xl bg-slate-100 dark:bg-[#1A2234] flex items-center justify-center text-[#C9A86A]">
                <Landmark className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Nenhuma conta conectada ao Open Finance (0 / {MAX_BANK_ACCOUNTS})
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                Conecte até 5 instituições financeiras com consentimento explícito OAuth 2.0 + PKCE para acompanhar saldos, faturas e lançar transações automaticamente na Grade Mensal.
              </p>
              <button
                type="button"
                onClick={handleOpenWizard}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Conectar via Open Finance</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {accounts.map((acc) => {
                const health = evaluateAccountHealth(acc);
                const isCreditCard = acc.type === 'Cartão de Crédito';
                const confirmingRevoke = confirmRevokeId === acc.id;

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
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Slot {acc.slot}/5 · {acc.type} · {acc.connectorProvider ?? 'Open Finance Brasil (FAPI)'}
                          </div>
                          <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {acc.institution}
                          </h3>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
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

                      {/* Financial Snapshot */}
                      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{isCreditCard ? 'Fatura Atual' : 'Saldo em Conta'}</span>
                          {isCreditCard && acc.creditLimit !== undefined && (
                            <span className="font-mono tabular-nums">
                              Disp: {formatBRL(acc.availableLimit ?? acc.creditLimit, privacyMode)}
                            </span>
                          )}
                        </div>
                        <div
                          className={`mt-0.5 text-lg font-semibold font-mono tabular-nums ${
                            acc.balance < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {formatBRL(acc.balance, privacyMode)}
                        </div>
                      </div>

                      {/* Consent Details: Scopes & Dates */}
                      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Escopos autorizados: </span>
                          <span className="font-medium">
                            {acc.consentScope.map((s) => SCOPE_LABELS[s] || s).join(' · ')}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span>Criado: {acc.consentGrantedAt ?? '—'}</span>
                          <span>Expira: {acc.consentExpiresAt}</span>
                        </div>
                        <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          Última sincronização: {formatSafeDateTime(acc.lastSync)}
                        </div>
                      </div>

                      {(health.effectiveStatus === 'consent_expired' ||
                        health.effectiveStatus === 'sync_error' ||
                        health.expiringSoon) && (
                        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{health.userMessage}</span>
                        </div>
                      )}
                    </div>

                    {/* Quick Actions */}
                    {confirmingRevoke ? (
                      <div className="pt-3 border-t border-red-200 dark:border-red-500/30 space-y-2">
                        <div className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                          Revogar consentimento e destruir token PKCE de {acc.institution}?
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onDisconnectAccount(acc.id);
                              setConfirmRevokeId(null);
                            }}
                            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500"
                          >
                            Confirmar revogação
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRevokeId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleSync(acc.id)}
                          disabled={
                            health.effectiveStatus === 'paused' ||
                            health.effectiveStatus === 'consent_expired'
                          }
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-[#232D42] disabled:opacity-40 transition-colors"
                        >
                          <RefreshCw className={`h-3 w-3 ${syncingId === acc.id ? 'animate-spin' : ''}`} />
                          <span>Sincronizar agora</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRenew(acc.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-[#E5C88F] hover:bg-slate-200/70 dark:hover:bg-[#232D42] transition-colors"
                        >
                          <ExternalLink className={`h-3 w-3 ${renewingId === acc.id ? 'animate-pulse' : ''}`} />
                          <span>Renovar consentimento</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onTogglePauseAccount(acc.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                          {acc.status === 'active' ? (
                            <>
                              <Pause className="h-3 w-3" />
                              <span>Pausar</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" />
                              <span>Retomar</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmRevokeId(acc.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/25 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Unplug className="h-3 w-3" />
                          <span>Revogar consentimento</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending / Revoked Consents History */}
          {(wizardOpen || revokedConsents.length > 0) && (
            <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Consentimentos Pendentes & Revogados
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {revokedConsents.length} revogado(s)
                </span>
              </div>

              {wizardOpen && !pkceAuthorized && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-500/30 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-amber-900 dark:text-amber-200">
                      Pendente · {instName} ({instType})
                    </strong>
                    <div className="text-[11px] text-amber-800 dark:text-amber-300">
                      Aguardando conclusão da etapa OAuth 2.0 + PKCE ({pkceHandshakeChallenge}).
                    </div>
                  </div>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    Pendente
                  </span>
                </div>
              )}

              {revokedConsents.length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {revokedConsents.slice(0, 5).map((rev) => (
                    <div
                      key={`${rev.id}-${rev.revokedAt ?? ''}`}
                      className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {rev.institution} · <span className="text-slate-500">{rev.type}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Escopos encerrados: {rev.consentScope.map((s) => SCOPE_LABELS[s] || s).join(', ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                          {rev.revokedAt ? formatSafeDateTime(rev.revokedAt) : '—'}
                        </span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/25">
                          Revogado
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. SIMULADOR DE MOVIMENTAÇÕES EM TEMPO REAL + REGRAS DE AUTO-CATEGORIZAÇÃO */}
      {(sectionView === 'all' || sectionView === 'simulator') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#C9A86A]" />
                Simular Nova Movimentação Bancária (Tempo Real)
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Injete Pix recebido, compra no cartão, débito em conta ou boleto/transferência com auto-categorização direta na Grade Mensal, Timeline, Alertas e Auditoria.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_MOVEMENT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setSimDesc(preset.description);
                    setSimMerchant(preset.merchant);
                    setSimPaymentMethod(preset.paymentMethod);
                    setSimNature(preset.entryNature);
                    setSimType(preset.type);
                    setSimAmount(preset.amount);
                    setSimDay(preset.day);
                    setSimInstallmentCurrent(preset.installmentCurrent);
                    setSimInstallmentTotal(preset.installmentTotal);
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
                    {accounts.length === 0 && <option value="">Conecte uma conta primeiro</option>}
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.institution} ({a.type})
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
                    <option value="pix">Pix</option>
                    <option value="credit">Compra no Cartão (Crédito)</option>
                    <option value="debit">Débito em Conta</option>
                    <option value="transfer">Boleto / Transferência</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Fluxo & Conciliação
                  </label>
                  <select
                    value={`${simType}:${simNature}`}
                    onChange={(e) => {
                      const [nextType, nextNature] = e.target.value.split(':') as [
                        'inflow' | 'outflow',
                        EntryNature
                      ];
                      setSimType(nextType);
                      setSimNature(nextNature);
                    }}
                    className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  >
                    <option value="outflow:standard">Saída / Despesa Real</option>
                    <option value="inflow:standard">Entrada / Recebimento</option>
                    <option value="outflow:invoice_payment">Pagamento de Fatura (Anti-Duplicidade)</option>
                    <option value="outflow:internal_transfer">Transferência Interna (Anti-Duplicidade)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Estabelecimento / Origem
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
                    Descrição Bancária (dispara auto-categorização)
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Valor (R$)
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
                    Dia (D/XX)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={simDay}
                    onChange={(e) => setSimDay(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Mês ({settings.activeYear})
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

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Destino automático na Grade Mensal:
                </span>
                <span className="font-semibold text-[#8C6A2E] dark:text-[#E5C88F] font-mono">
                  {matchedRulePreview.rowName}
                  {matchedRulePreview.ruleKeyword ? ` (regra: "${matchedRulePreview.ruleKeyword}")` : ' (padrão)'}
                </span>
              </div>

              <button
                type="submit"
                disabled={accounts.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 disabled:opacity-40"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Simular Nova Movimentação Bancária</span>
              </button>
            </form>

            {simFeedback && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{simFeedback}</span>
              </div>
            )}
          </div>

          {/* Auto-Categorization Rules Panel */}
          <div className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#C9A86A]" />
                  Regras de Auto-Categorização (Grade Mensal)
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Mapeia palavras-chave dos extratos diretamente para linhas como Pizzaria, 2PB, Vale, Mercado, Combustível/Moto, Cartão SA, Cartão MP, Energia e Gás.
                </p>
              </div>

              <form onSubmit={handleAddInlineRule} className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  value={newRuleKeyword}
                  onChange={(e) => setNewRuleKeyword(e.target.value)}
                  placeholder="Palavra-chave (ex: uber)"
                  className="col-span-5 px-2.5 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                />
                <select
                  value={newRuleRowId}
                  onChange={(e) => setNewRuleRowId(e.target.value)}
                  className="col-span-5 px-2 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                >
                  {visibleRows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="col-span-2 inline-flex items-center justify-center rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                  title="Adicionar regra"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </form>

              <div className="divide-y divide-slate-100 dark:divide-white/[0.05] max-h-64 overflow-y-auto border border-slate-100 dark:border-white/[0.06] rounded-lg">
                {rules.map((rule) => {
                  const targetRow = rows.find((r) => r.id === rule.targetRowId);
                  return (
                    <div
                      key={rule.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => onToggleRule(rule.id)}
                          className="accent-[#C9A86A]"
                        />
                        <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                          "{rule.keyword}"
                        </span>
                        <span className="text-slate-400">→</span>
                        <span className="font-medium text-[#8C6A2E] dark:text-[#E5C88F] truncate">
                          {targetRow?.name ?? rule.targetRowId}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteRule(rule.id)}
                        className="p-1 text-slate-400 hover:text-red-500"
                        title="Remover regra"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {accounts.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-2">
                <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Diagnóstico rápido de estados de consentimento:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onSetAccountStatus(
                        simAccountId || accounts[0].id,
                        'consent_expired',
                        'Prazo do consentimento expirado. Renove diretamente no ambiente oficial do banco.'
                      )
                    }
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                  >
                    Simular Expirado
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSetAccountStatus(
                        simAccountId || accounts[0].id,
                        'sync_error',
                        'Instituição indisponível temporariamente no conector Open Finance.'
                      )
                    }
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30 hover:bg-red-500/20"
                  >
                    Simular Erro Conector
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. TRILHA DE AUDITORIA (FILTRÁVEL) & TRANSPARÊNCIA DE SEGURANÇA */}
      {(sectionView === 'all' || sectionView === 'audit') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#0D1320] border-b border-slate-200 dark:border-white/[0.08] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Activity className="h-3.5 w-3.5 text-[#C9A86A]" />
                  <span>Trilha de Auditoria Open Finance (LGPD)</span>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {filteredAuditLog.length} de {auditLog.length} eventos
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Filtrar por instituição, protocolo ou evento..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>

                <div className="inline-flex items-center gap-1">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={auditTypeFilter}
                    onChange={(e) => setAuditTypeFilter(e.target.value as 'all' | AuditEventType)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                  >
                    <option value="all">Todos os eventos</option>
                    <option value="auth">Autorização / Conexão</option>
                    <option value="sync">Sincronização</option>
                    <option value="renew">Renovação</option>
                    <option value="revoke">Revogação</option>
                    <option value="transaction">Movimentações</option>
                    <option value="status">Alertas / Status</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/[0.05] max-h-96 overflow-y-auto">
              {filteredAuditLog.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  Nenhum evento encontrado para o filtro selecionado.
                </div>
              ) : (
                filteredAuditLog.map((ev) => {
                  const statusTone =
                    ev.status === 'revoked'
                      ? 'text-red-600 dark:text-red-400'
                      : ev.status === 'warning' || ev.status === 'blocked'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400';
                  const statusText =
                    ev.status === 'revoked'
                      ? 'Revogado'
                      : ev.status === 'warning'
                      ? 'Alerta'
                      : ev.status === 'blocked'
                      ? 'Bloqueado'
                      : 'OK';

                  return (
                    <div
                      key={ev.id}
                      className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                          <span>{ev.action}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {ev.institution || ev.actor}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className={`font-mono text-[11px] font-semibold ${statusTone}`}>
                            {statusText}
                          </span>
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">{ev.detail}</div>
                        {ev.scope && (
                          <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate">
                            Escopo: {ev.scope}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        <div>{ev.securityProtocol}</div>
                        <div>{formatSafeDateTime(ev.timestamp)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Security & Privacy Transparency Block */}
          <div className="lg:col-span-4 p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Arquitetura & Transparência LGPD
              </h3>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  OAuth 2.0 + PKCE (FAPI Brasil)
                </div>
                <p className="mt-1 text-slate-500 dark:text-slate-400 leading-relaxed">
                  Redirecionamento criptografado com desafio PKCE efêmero, transporte TLS 1.3 e tokens AES-256 restritos ao escopo autorizado.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Zero Senhas Bancárias ou Dados de Cartão
                </div>
                <p className="mt-1 text-slate-500 dark:text-slate-400 leading-relaxed">
                  Jamais pedimos ou armazenamos senha bancária, token SMS/MFA, PIN transacional, número completo de cartão, CVV ou validade.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Revogação Imediata & Anti-Duplicidade
                </div>
                <p className="mt-1 text-slate-500 dark:text-slate-400 leading-relaxed">
                  Você pode pausar, renovar ou revogar qualquer consentimento a qualquer momento (RFC 7009), sem duplicar pagamentos de fatura ou transferências internas.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4-STEP GUIDED CONNECTION WIZARD MODAL */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-xs"
            onClick={() => setWizardOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-xl rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Conectar Instituição via Open Finance
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Etapa {wizardStep} de 4 · Slot {accounts.length + 1} de {MAX_BANK_ACCOUNTS}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                aria-label="Fechar assistente"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Progress indicator */}
            <div className="px-6 pt-4 grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-colors ${
                    s <= wizardStep ? 'bg-[#C9A86A]' : 'bg-slate-200 dark:bg-white/[0.08]'
                  }`}
                />
              ))}
            </div>

            <form onSubmit={handleCompleteWizard} className="p-6 space-y-4">
              {/* STEP 1: INSTITUTION & ACCOUNT TYPE */}
              {wizardStep === 1 && (
                <>
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
                        Provedor Oficial (FAPI)
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
                        Tipo de Conta
                      </label>
                      <select
                        value={instType}
                        onChange={(e) => setInstType(e.target.value as AccountType)}
                        className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                      >
                        <option value="Corrente">Conta Corrente</option>
                        <option value="Digital">Conta Digital</option>
                        <option value="Cartão de Crédito">Cartão de Crédito</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Saldo / Fatura Atual (R$)
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
                            className="w-full px-2.5 py-2 rounded-lg text-xs font-mono tabular-nums bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
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
                            className="w-full px-2.5 py-2 rounded-lg text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
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
                            className="w-full px-2.5 py-2 rounded-lg text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          Estado da Fatura
                        </label>
                        <select
                          value={invoiceState}
                          onChange={(e) => setInvoiceState(e.target.value as InvoiceState)}
                          className="w-full px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                        >
                          <option value="open">Aberta</option>
                          <option value="closed">Fechada</option>
                          <option value="paid">Paga</option>
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
                      onClick={() => setWizardStep(2)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                    >
                      <span>Selecionar Escopos e Prazo</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}

              {/* STEP 2: EXPLICIT SCOPES & VALIDITY */}
              {wizardStep === 2 && (
                <>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      Escopos Somente Leitura (LGPD)
                    </div>
                    <div className="space-y-2">
                      {SCOPE_OPTIONS.map((sc) => {
                        const checked = selectedScopes.includes(sc.code);
                        return (
                          <label
                            key={sc.code}
                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                              checked
                                ? 'bg-slate-50 dark:bg-[#0D1320] border-[#C9A86A]/50'
                                : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-white/[0.08]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleScope(sc.code)}
                              className="mt-0.5 accent-[#C9A86A]"
                            />
                            <div className="text-xs">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {sc.label}{' '}
                                <span className="font-mono text-[10px] text-slate-400">
                                  ({sc.code})
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {sc.desc}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Prazo de Validade do Consentimento
                    </label>
                    <select
                      value={consentTermMonths}
                      onChange={(e) => setConsentTermMonths(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    >
                      <option value={3}>3 meses (90 dias)</option>
                      <option value={6}>6 meses (180 dias)</option>
                      <option value={12}>12 meses (365 dias · Padrão BACEN)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                    >
                      <span>Ir para Redirecionamento PKCE</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}

              {/* STEP 3: OAUTH 2.0 + PKCE SECURE HANDSHAKE (ZERO BANK PASSWORDS) */}
              {wizardStep === 3 && (
                <>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                        <Lock className="h-4 w-4 text-emerald-500" />
                        <span>Redirecionamento Seguro OAuth 2.0 + PKCE</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                          pkceAuthorized
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {pkceAuthorized ? 'Autorizado (PKCE)' : 'Consentimento Pendente'}
                      </span>
                    </div>

                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                      O consentimento para <strong>{instName}</strong> é assinado fora deste app em ambiente oficial via{' '}
                      <span className="font-mono">TLS 1.3</span> e tokenizado em <span className="font-mono">AES-256</span>. Nenhuma senha bancária, PIN, código SMS ou CVV é solicitado aqui.
                    </p>

                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] font-mono text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                      <div>Provider: {connectorProvider}</div>
                      <div>Challenge PKCE: {pkceHandshakeChallenge}</div>
                      <div>Escopos: {selectedScopes.join(' · ')}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPkceAuthorized(true)}
                      disabled={pkceAuthorized}
                      className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                        pkceAuthorized
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 cursor-default'
                          : 'bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F] border border-transparent dark:border-[#C9A86A]/40 hover:opacity-90'
                      }`}
                    >
                      {pkceAuthorized ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Token OAuth 2.0 + PKCE Confirmado</span>
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4" />
                          <span>Autorizar no Banco Oficial (Simular Handshake PKCE)</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      disabled={!pkceAuthorized}
                      onClick={() => setWizardStep(4)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] disabled:opacity-40"
                    >
                      <span>Mapear Auto-Categorização</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}

              {/* STEP 4: AUTO-CATEGORIZATION MAPPING TO GRADE MENSAL */}
              {wizardStep === 4 && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Categoria padrão na Grade Mensal (para transações sem palavra-chave)
                    </label>
                    <select
                      value={defaultRowId}
                      onChange={(e) => setDefaultRowId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    >
                      {visibleRows.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.block === 'income' ? 'Receita' : r.block === 'fixed' ? 'Fixa' : r.block === 'variable' ? 'Variável' : 'Guardado'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-2.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Adicionar Regra Rápida para Grade Mensal ({rules.filter((r) => r.enabled).length} ativas)
                    </div>
                    <div className="grid grid-cols-12 gap-2">
                      <input
                        type="text"
                        value={wizardNewKeyword}
                        onChange={(e) => setWizardNewKeyword(e.target.value)}
                        placeholder="Ex: pizzaria, 2pb, mercado..."
                        className="col-span-5 px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                      />
                      <select
                        value={wizardNewRuleRowId}
                        onChange={(e) => setWizardNewRuleRowId(e.target.value)}
                        className="col-span-5 px-2 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                      >
                        {visibleRows.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleWizardAddRule}
                        className="col-span-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F] border border-transparent dark:border-[#C9A86A]/40"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Tudo pronto! Ao concluir, {instName} ocupará o Slot {accounts.length + 1}/{MAX_BANK_ACCOUNTS} com sincronização automática na Grade Mensal e na Timeline.
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Concluir Conexão Open Finance</span>
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
