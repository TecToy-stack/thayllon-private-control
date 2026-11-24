import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
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
} from 'lucide-react';
import {
  AccountType,
  AppSettings,
  AuditEvent,
  AuditEventType,
  AutoRule,
  BankAccount,
  CategoryRow,
} from '../types/finance';
import { MAX_BANK_ACCOUNTS } from '../data/initialData';
import { BRAZILIAN_BANKS, BankCategory } from '../data/brazilBanks';
import { formatBRL } from '../utils/financeEngine';
import { evaluateAccountHealth } from '../utils/openFinance';
import {
  fetchOpenFinanceStatus,
  initiateOpenFinanceConsent,
  OpenFinanceBackendStatus,
  revokeOpenFinanceConsent,
  syncOpenFinanceConsent,
} from '../utils/openFinanceApi';
import { getTranslations } from '../utils/i18n';

interface OpenFinanceViewProps {
  authToken: string;
  accounts: BankAccount[];
  revokedConsents: BankAccount[];
  rows: CategoryRow[];
  rules: AutoRule[];
  auditLog: AuditEvent[];
  settings: AppSettings;
  onTogglePauseAccount: (accountId: string) => void;
  onDisconnectAccount: (accountId: string) => void;
  onAddRule: (rule: Omit<AutoRule, 'id'>) => void;
  onToggleRule: (ruleId: string) => void;
  onDeleteRule: (ruleId: string) => void;
  onRefreshVault: () => Promise<void>;
  onApplySyncedState: (patch: {
    accounts?: BankAccount[];
    revokedConsents?: BankAccount[];
    auditLog?: AuditEvent[];
  }) => void;
}

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
    code: 'CREDIT_CARDS_ACCOUNTS_READ',
    label: 'Limites de crédito',
    desc: 'Limite total e disponível do cartão sem expor número ou CVV.',
  },
  {
    code: 'CREDIT_CARDS_BILLS_READ',
    label: 'Faturas de cartão',
    desc: 'Faturas abertas, fechadas e datas de vencimento.',
  },
];

const SCOPE_LABELS: Record<string, string> = {
  ACCOUNTS_READ: 'Dados cadastrais',
  BALANCES_READ: 'Saldos',
  TRANSACTIONS_READ: 'Extratos / Transações',
  CREDIT_CARD_READ: 'Cartão de crédito',
  CREDIT_CARDS_ACCOUNTS_READ: 'Limites de crédito',
  CREDIT_CARDS_BILLS_READ: 'Faturas de cartão',
};

const BANK_CATEGORIES: ('all' | BankCategory)[] = [
  'all',
  'Tradicional',
  'Digital',
  'Cooperativa',
  'Corretora / Pagamentos',
];

export const OpenFinanceView: React.FC<OpenFinanceViewProps> = ({
  authToken,
  accounts,
  revokedConsents,
  rows,
  rules,
  auditLog,
  settings,
  onTogglePauseAccount,
  onDisconnectAccount,
  onAddRule,
  onToggleRule,
  onDeleteRule,
  onRefreshVault,
  onApplySyncedState,
}) => {
  const { privacyMode, language } = settings;
  const t = getTranslations(language);
  const isAtLimit = accounts.length >= MAX_BANK_ACCOUNTS;

  const [sectionView, setSectionView] = useState<'all' | 'consents' | 'rules' | 'audit'>('all');
  const [backendStatus, setBackendStatus] = useState<OpenFinanceBackendStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'ok' | 'warn' | 'err';
    text: string;
  } | null>(null);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  // Real OAuth Wizard State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [bankSearch, setBankSearch] = useState('');
  const [bankCategory, setBankCategory] = useState<'all' | BankCategory>('all');
  const [selectedBankId, setSelectedBankId] = useState(BRAZILIAN_BANKS[0].id);
  const [instType, setInstType] = useState<AccountType>('Corrente');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'ACCOUNTS_READ',
    'BALANCES_READ',
    'TRANSACTIONS_READ',
  ]);
  const [consentTermMonths, setConsentTermMonths] = useState(6);
  const [initiatingConsent, setInitiatingConsent] = useState(false);
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);

  // Rules management
  const [newRuleKeyword, setNewRuleKeyword] = useState('');
  const [newRuleRowId, setNewRuleRowId] = useState('var-mercado');

  // Audit log filter
  const [auditTypeFilter, setAuditTypeFilter] = useState<'all' | AuditEventType>('all');
  const [auditSearch, setAuditSearch] = useState('');

  const visibleRows = useMemo(() => rows.filter((r) => !r.hidden), [rows]);

  const filteredBanks = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    return BRAZILIAN_BANKS.filter((bank) => {
      if (bankCategory !== 'all' && bank.category !== bankCategory) return false;
      if (!q) return true;
      return (
        bank.name.toLowerCase().includes(q) ||
        bank.shortName.toLowerCase().includes(q) ||
        bank.code.includes(q) ||
        bank.ispb.includes(q)
      );
    });
  }, [bankSearch, bankCategory]);

  const selectedBank = useMemo(
    () => BRAZILIAN_BANKS.find((b) => b.id === selectedBankId) ?? BRAZILIAN_BANKS[0],
    [selectedBankId]
  );

  const loadStatus = async () => {
    setLoadingStatus(true);
    const status = await fetchOpenFinanceStatus();
    setBackendStatus(status);
    setLoadingStatus(false);
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  // Listen to OAuth Callback postMessage from popup
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (typeof window !== 'undefined' && event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as {
        type?: string;
        status?: 'active' | 'error';
        institution?: string;
        error?: string | null;
      } | null;
      if (!data || data.type !== 'TPC_OPEN_FINANCE_CALLBACK') return;

      void onRefreshVault();
      setPendingAuthUrl(null);
      setWizardOpen(false);
      if (data.status === 'active') {
        setActionFeedback({
          type: 'ok',
          text: `Autorização concluída no banco (${data.institution ?? 'Instituição'}). Utilize "Sincronizar agora" para ler os dados reais.`,
        });
      } else {
        setActionFeedback({
          type: 'err',
          text: data.error || 'A autorização no banco oficial não foi concluída.',
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onRefreshVault]);

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
    setPendingAuthUrl(null);
    setActionFeedback(null);
    setSelectedScopes(
      instType === 'Cartão de Crédito'
        ? ['ACCOUNTS_READ', 'CREDIT_CARDS_ACCOUNTS_READ', 'CREDIT_CARDS_BILLS_READ', 'TRANSACTIONS_READ']
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

  const handleStartOfficialOAuth = async () => {
    if (isAtLimit || initiatingConsent) return;
    setInitiatingConsent(true);
    setActionFeedback(null);
    setPendingAuthUrl(null);

    try {
      const resp = await initiateOpenFinanceConsent(authToken, {
        institutionId: selectedBank.id,
        institutionName: selectedBank.name,
        accountType: instType,
        termMonths: consentTermMonths,
        scope: selectedScopes,
      });

      if (!resp.configured || !resp.authorizationUrl) {
        setActionFeedback({
          type: 'warn',
          text:
            resp.message ||
            resp.error ||
            'Aguardando configuração do provedor/credenciais Open Finance no backend.',
        });
        setInitiatingConsent(false);
        return;
      }

      await onRefreshVault();
      setPendingAuthUrl(resp.authorizationUrl);

      const popup = window.open(
        resp.authorizationUrl,
        'tpc_open_finance_oauth',
        'width=520,height=740,noopener=no'
      );
      if (!popup) {
        setActionFeedback({
          type: 'warn',
          text: 'Pop-up bloqueado pelo navegador. Clique no link direto exibido no modal para concluir no banco.',
        });
      } else {
        setActionFeedback({
          type: 'ok',
          text: `Fluxo oficial aberto para ${selectedBank.name}. Conclua a autorização no ambiente do banco.`,
        });
      }
    } catch {
      setActionFeedback({
        type: 'err',
        text: 'Não foi possível comunicar com o servidor para iniciar o consentimento Open Finance.',
      });
    } finally {
      setInitiatingConsent(false);
    }
  };

  const handleSyncReal = async (consentId: string) => {
    setSyncingId(consentId);
    setActionFeedback(null);
    try {
      const result = await syncOpenFinanceConsent(authToken, consentId);
      if (!result.ok) {
        setActionFeedback({
          type: 'warn',
          text:
            result.error ||
            'Aguardando configuração do provedor/credenciais Open Finance no backend.',
        });
      } else {
        onApplySyncedState({
          accounts: result.accounts,
          auditLog: result.auditLog,
        });
        setActionFeedback({
          type: 'ok',
          text: 'Sincronização executada diretamente pelo conector oficial.',
        });
      }
    } catch {
      setActionFeedback({
        type: 'err',
        text: 'Erro ao consultar o endpoint de sincronização Open Finance.',
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleRevokeReal = async (consentId: string) => {
    setRevokingId(consentId);
    setActionFeedback(null);
    try {
      const result = await revokeOpenFinanceConsent(authToken, consentId);
      if (result.ok) {
        onApplySyncedState({
          accounts: result.accounts,
          revokedConsents: result.revokedConsents,
          auditLog: result.auditLog,
        });
        setActionFeedback({
          type: 'ok',
          text: 'Consentimento revogado no servidor e registrado na trilha LGPD.',
        });
      } else {
        onDisconnectAccount(consentId);
      }
    } catch {
      onDisconnectAccount(consentId);
    } finally {
      setRevokingId(null);
      setConfirmRevokeId(null);
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
    <div className="space-y-6 pb-20 lg:pb-6">
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
                    idx < accounts.length ? 'bg-[#C9A86A]' : 'bg-slate-200 dark:bg-white/[0.08]'
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

        {/* Backend Provider Readiness Status Banner (Zero Fake Data) */}
        <div
          className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            backendStatus?.configured
              ? 'bg-emerald-50 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
              : 'bg-amber-50 dark:bg-amber-950/25 border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="space-y-1 min-w-0">
            <div className="font-semibold flex items-center gap-2">
              {backendStatus?.configured ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <span>
                {loadingStatus
                  ? 'Verificando provedor Open Finance no backend...'
                  : backendStatus?.configured
                  ? `Provedor ativo: ${backendStatus.providerLabel}`
                  : 'Aguardando configuração do provedor/credenciais Open Finance no backend'}
              </span>
            </div>
            {backendStatus && (
              <div className="text-[11px] opacity-90 space-y-0.5">
                {!backendStatus.configured && (
                  <div>
                    Variáveis de servidor necessárias:{' '}
                    <span className="font-mono">{backendStatus.missingEnvVars.join(', ')}</span>
                  </div>
                )}
                <div className="truncate">
                  Callback OAuth oficial:{' '}
                  <span className="font-mono">{backendStatus.callbackUrl}</span>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={loadStatus}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/80 dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shrink-0"
          >
            <RefreshCw className={`h-3 w-3 ${loadingStatus ? 'animate-spin' : ''}`} />
            <span>Atualizar status</span>
          </button>
        </div>

        {/* Section Filter Tabs */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08]">
            {(
              [
                { id: 'all', label: t.openFinance.tabAll },
                { id: 'consents', label: `${t.openFinance.tabConsents} (${accounts.length}/5)` },
                { id: 'rules', label: 'Regras de Auto-Categorização' },
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
            <span>
              Ativas: {accounts.filter((a) => evaluateAccountHealth(a).effectiveStatus === 'active').length}
            </span>
            <span>·</span>
            <span>Pausadas: {accounts.filter((a) => a.status === 'paused').length}</span>
            <span>·</span>
            <span>Revogadas: {revokedConsents.length}</span>
          </div>
        </div>
      </div>

      {actionFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            actionFeedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : actionFeedback.type === 'warn'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
          }`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actionFeedback.text}</span>
        </div>
      )}

      {/* Attention Banner */}
      {attentionAccounts.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-300 dark:border-amber-500/40 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{attentionAccounts.length} consentimento(s) Open Finance requerem ação</span>
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
                    onClick={handleOpenWizard}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold bg-amber-600 text-white hover:bg-amber-500"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>{health.actionLabel || 'Autorizar no Banco'}</span>
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
                Selecione entre mais de 40 bancos e instituições do Brasil para iniciar o consentimento oficial OAuth 2.0 / FAPI. Nenhuma senha bancária ou dado fictício é gerado.
              </p>
              <button
                type="button"
                onClick={handleOpenWizard}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Conectar Instituição Real</span>
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
                      health.effectiveStatus === 'sync_error' ||
                      health.effectiveStatus === 'pending_bank_confirmation'
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

                      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Escopos: </span>
                          <span className="font-medium">
                            {acc.consentScope.map((s) => SCOPE_LABELS[s] || s).join(' · ')}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span>Criado: {acc.consentGrantedAt ?? '—'}</span>
                          <span>Expira: {acc.consentExpiresAt}</span>
                        </div>
                        <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          Última sinc.: {formatSafeDateTime(acc.lastSync)}
                        </div>
                      </div>

                      {health.needsAction && (
                        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{health.userMessage}</span>
                        </div>
                      )}
                    </div>

                    {confirmingRevoke ? (
                      <div className="pt-3 border-t border-red-200 dark:border-red-500/30 space-y-2">
                        <div className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                          Revogar consentimento de {acc.institution} na API oficial e no cofre?
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={revokingId === acc.id}
                            onClick={() => handleRevokeReal(acc.id)}
                            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500"
                          >
                            {revokingId === acc.id ? 'Revogando...' : 'Confirmar revogação'}
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
                          onClick={() => handleSyncReal(acc.id)}
                          disabled={
                            syncingId === acc.id ||
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
                          className="col-span-2 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/25 hover:bg-red-50 dark:hover:bg-red-950/30"
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

          {revokedConsents.length > 0 && (
            <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Histórico de Consentimentos Revogados (LGPD)
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {revokedConsents.length} revogado(s)
                </span>
              </div>
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
            </div>
          )}
        </div>
      )}

      {/* 2. REGRAS DE AUTO-CATEGORIZAÇÃO & DIRETÓRIO DE INSTITUIÇÕES */}
      {(sectionView === 'all' || sectionView === 'rules') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#C9A86A]" />
                Regras de Auto-Categorização (Grade Mensal)
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Mapeia descrições reais sincronizadas via Open Finance para as linhas da sua Grade Mensal.
              </p>
            </div>

            <form onSubmit={handleAddInlineRule} className="grid grid-cols-12 gap-2">
              <input
                type="text"
                value={newRuleKeyword}
                onChange={(e) => setNewRuleKeyword(e.target.value)}
                placeholder="Palavra-chave (ex: mercado, uber)"
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

          <div className="lg:col-span-6 p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Landmark className="h-4 w-4 text-[#C9A86A]" />
                Diretório Oficial de Instituições ({BRAZILIAN_BANKS.length})
              </h3>
              <button
                type="button"
                disabled={isAtLimit}
                onClick={handleOpenWizard}
                className="text-xs font-semibold text-[#A68342] dark:text-[#E5C88F] hover:underline disabled:opacity-40"
              >
                Conectar banco →
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bancos tradicionais, bancos digitais, cooperativas e instituições de pagamento participantes do ecossistema brasileiro.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
              {BRAZILIAN_BANKS.map((bank) => (
                <button
                  key={bank.id}
                  type="button"
                  disabled={isAtLimit}
                  onClick={() => {
                    setSelectedBankId(bank.id);
                    handleOpenWizard();
                  }}
                  className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.07] hover:border-[#C9A86A]/50 text-left transition-colors disabled:opacity-40"
                >
                  <div className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {bank.shortName}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    COMPE {bank.code} · {bank.category}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. TRILHA DE AUDITORIA & CONFORMIDADE LGPD */}
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

          <div className="lg:col-span-4 p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Arquitetura & Conformidade LGPD
              </h3>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  OAuth 2.0 + PKCE (FAPI Brasil)
                </div>
                <p className="mt-1 text-slate-500 dark:text-slate-400 leading-relaxed">
                  Consentimento criado exclusivamente no servidor backend com state anti-CSRF e redirecionamento oficial ao banco.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Zero Senhas Bancárias ou Dados de Cartão
                </div>
                <p className="mt-1 text-slate-500 dark:text-slate-400 leading-relaxed">
                  Jamais solicitamos ou armazenamos senha bancária, token SMS/MFA, PIN transacional, número completo de cartão, CVV ou validade.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3-STEP REAL CONSENT WIZARD MODAL */}
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
                  Conectar Instituição via Open Finance Brasil
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Etapa {wizardStep} de 3 · Slot {accounts.length + 1} de {MAX_BANK_ACCOUNTS}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {wizardStep === 1 && (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Buscar Instituição Financeira (Nome, Código COMPE ou ISPB)
                    </label>
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={bankSearch}
                        onChange={(e) => setBankSearch(e.target.value)}
                        placeholder="Ex: Nubank, Itaú, 260, Sicredi, BTG..."
                        className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1]"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {BANK_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setBankCategory(cat)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                            bankCategory === cat
                              ? 'bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]'
                              : 'bg-slate-100 dark:bg-[#1A2234] text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {cat === 'all' ? 'Todos' : cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1 border border-slate-200 dark:border-white/[0.08] rounded-xl bg-slate-50 dark:bg-[#0D1320]">
                    {filteredBanks.map((bank) => {
                      const active = bank.id === selectedBankId;
                      return (
                        <button
                          key={bank.id}
                          type="button"
                          onClick={() => setSelectedBankId(bank.id)}
                          className={`p-2.5 rounded-lg border text-left transition-colors ${
                            active
                              ? 'bg-white dark:bg-[#1A2234] border-[#C9A86A] ring-1 ring-[#C9A86A]/40'
                              : 'bg-white/70 dark:bg-[#111827] border-slate-200/70 dark:border-white/[0.06]'
                          }`}
                        >
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {bank.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            Cód. {bank.code} · {bank.category}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Tipo de Vínculo
                    </label>
                    <select
                      value={instType}
                      onChange={(e) => setInstType(e.target.value as AccountType)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1]"
                    >
                      <option value="Corrente">Conta Corrente</option>
                      <option value="Digital">Conta Digital</option>
                      <option value="Cartão de Crédito">Cartão de Crédito</option>
                    </select>
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

              {wizardStep === 2 && (
                <>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      Escopos Somente Leitura (LGPD) — {selectedBank.name}
                    </div>
                    <div className="space-y-2">
                      {SCOPE_OPTIONS.map((sc) => {
                        const checked = selectedScopes.includes(sc.code);
                        return (
                          <label
                            key={sc.code}
                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${
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
                                {sc.label}
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
                      Prazo do Consentimento
                    </label>
                    <select
                      value={consentTermMonths}
                      onChange={(e) => setConsentTermMonths(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1]"
                    >
                      <option value={3}>3 meses (90 dias)</option>
                      <option value={6}>6 meses (180 dias)</option>
                      <option value={12}>12 meses (365 dias · Máximo BACEN)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="px-3 py-2 rounded-lg text-xs text-slate-500"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                    >
                      <span>Revisar & Autorizar no Banco</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}

              {wizardStep === 3 && (
                <>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-2.5 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                      <Lock className="h-4 w-4 text-emerald-500" />
                      <span>Autorização Externa OAuth 2.0 / FAPI</span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                      Você será direcionado ao ambiente oficial de <strong>{selectedBank.name}</strong> (Código {selectedBank.code}). Nenhuma senha ou dado de cartão é solicitado neste app.
                    </p>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] font-mono text-[11px] space-y-1">
                      <div>Provedor Backend: {backendStatus?.providerLabel ?? 'Não configurado'}</div>
                      <div>Escopos: {selectedScopes.join(' · ')}</div>
                      <div>Validade: {consentTermMonths} meses</div>
                    </div>

                    {!backendStatus?.configured && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-200">
                        <strong>Aguardando configuração do provedor/credenciais Open Finance no backend.</strong>{' '}
                        Configure as credenciais no servidor antes de autorizar contas reais.
                      </div>
                    )}

                    {pendingAuthUrl && (
                      <a
                        href={pendingAuthUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Abrir Página Oficial de Autorização do Banco</span>
                      </a>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="px-3 py-2 rounded-lg text-xs text-slate-500"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      disabled={initiatingConsent || !backendStatus?.configured}
                      onClick={handleStartOfficialOAuth}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] disabled:opacity-40"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>
                        {initiatingConsent
                          ? 'Iniciando consentimento...'
                          : 'Autorizar no Banco Oficial'}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
