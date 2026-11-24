import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Pause,
  Play,
  Unplug,
  Plus,
  Lock,
  Activity,
  AlertCircle,
  AlertTriangle,
  X,
  ExternalLink,
  Search,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import {
  AccountType,
  AppSettings,
  AuditEvent,
  BankAccount,
} from '../types/finance';
import { MAX_BANK_ACCOUNTS } from '../data/initialData';
import { BRAZILIAN_BANKS } from '../data/brazilBanks';
import { formatBRL, formatCompactDay } from '../utils/financeEngine';
import { evaluateAccountHealth } from '../utils/openFinance';
import {
  fetchOpenFinanceStatus,
  initiateOpenFinanceConsent,
  OpenFinanceBackendStatus,
  revokeOpenFinanceConsent,
  syncOpenFinanceConsent,
} from '../utils/openFinanceApi';
import { getTranslations } from '../utils/i18n';

interface AccountsSecurityViewProps {
  authToken: string;
  accounts: BankAccount[];
  auditLog: AuditEvent[];
  settings: AppSettings;
  onTogglePauseAccount: (accountId: string) => void;
  onDisconnectAccount: (accountId: string) => void;
  onRefreshVault: () => Promise<void>;
  onApplySyncedState: (patch: {
    accounts?: BankAccount[];
    revokedConsents?: BankAccount[];
    auditLog?: AuditEvent[];
  }) => void;
}

export const AccountsSecurityView: React.FC<AccountsSecurityViewProps> = ({
  authToken,
  accounts,
  auditLog,
  settings,
  onTogglePauseAccount,
  onDisconnectAccount,
  onRefreshVault,
  onApplySyncedState,
}) => {
  const [connectOpen, setConnectOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [selectedBankId, setSelectedBankId] = useState(BRAZILIAN_BANKS[0].id);
  const [instType, setInstType] = useState<AccountType>('Corrente');
  const [consentTermMonths, setConsentTermMonths] = useState(6);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [initiating, setInitiating] = useState(false);
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<OpenFinanceBackendStatus | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(
    null
  );

  const { privacyMode, language } = settings;
  const t = getTranslations(language);
  const isAtLimit = accounts.length >= MAX_BANK_ACCOUNTS;

  const filteredBanks = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    if (!q) return BRAZILIAN_BANKS;
    return BRAZILIAN_BANKS.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.shortName.toLowerCase().includes(q) ||
        b.code.includes(q)
    );
  }, [bankSearch]);

  const selectedBank = useMemo(
    () => BRAZILIAN_BANKS.find((b) => b.id === selectedBankId) ?? BRAZILIAN_BANKS[0],
    [selectedBankId]
  );

  useEffect(() => {
    void fetchOpenFinanceStatus().then(setBackendStatus);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (typeof window !== 'undefined' && event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        status?: 'active' | 'error';
        institution?: string;
        error?: string | null;
      } | null;
      if (!data || data.type !== 'TPC_OPEN_FINANCE_CALLBACK') return;

      void onRefreshVault();
      setPendingAuthUrl(null);
      setConnectOpen(false);
      setFeedback(
        data.status === 'active'
          ? {
              type: 'ok',
              text: `Autorização concluída em ${data.institution ?? 'instituição financeira'}.`,
            }
          : {
              type: 'err',
              text: data.error || 'Falha na autorização oficial Open Finance.',
            }
      );
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleStartOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAtLimit || initiating) return;
    setInitiating(true);
    setFeedback(null);
    setPendingAuthUrl(null);

    try {
      const resp = await initiateOpenFinanceConsent(authToken, {
        institutionId: selectedBank.id,
        institutionName: selectedBank.name,
        accountType: instType,
        termMonths: consentTermMonths,
        scope:
          instType === 'Cartão de Crédito'
            ? ['ACCOUNTS_READ', 'CREDIT_CARDS_ACCOUNTS_READ', 'CREDIT_CARDS_BILLS_READ', 'TRANSACTIONS_READ']
            : ['ACCOUNTS_READ', 'BALANCES_READ', 'TRANSACTIONS_READ'],
      });

      if (!resp.configured || !resp.authorizationUrl) {
        setFeedback({
          type: 'warn',
          text:
            resp.message ||
            resp.error ||
            'Aguardando configuração do provedor/credenciais Open Finance no backend.',
        });
        setInitiating(false);
        return;
      }

      await onRefreshVault();
      setPendingAuthUrl(resp.authorizationUrl);
      window.open(resp.authorizationUrl, 'tpc_open_finance_oauth', 'width=520,height=740');
    } catch {
      setFeedback({
        type: 'err',
        text: 'Não foi possível iniciar o consentimento Open Finance no servidor.',
      });
    } finally {
      setInitiating(false);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    setFeedback(null);
    try {
      const result = await syncOpenFinanceConsent(authToken, id);
      if (!result.ok) {
        setFeedback({
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
        setFeedback({ type: 'ok', text: 'Conta sincronizada com sucesso.' });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Erro de comunicação ao sincronizar.' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    setFeedback(null);
    try {
      const res = await revokeOpenFinanceConsent(authToken, id);
      if (res.ok) {
        onApplySyncedState({
          accounts: res.accounts,
          revokedConsents: res.revokedConsents,
          auditLog: res.auditLog,
        });
        setFeedback({ type: 'ok', text: 'Consentimento revogado sob conformidade LGPD.' });
      } else {
        onDisconnectAccount(id);
      }
    } catch {
      onDisconnectAccount(id);
    } finally {
      setRevokingId(null);
    }
  };

  const attentionAccounts = accounts.filter((a) => evaluateAccountHealth(a).needsAction);

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
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
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.accounts.subtitle}</p>
        </div>

        <button
          type="button"
          disabled={isAtLimit}
          onClick={() => setConnectOpen(true)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
            isAtLimit
              ? 'bg-slate-200 dark:bg-white/[0.06] text-slate-400 cursor-not-allowed'
              : 'bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90'
          }`}
        >
          <Plus className="h-4 w-4" />
          <span>{t.accounts.connectBank}</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : feedback.type === 'warn'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
          }`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {attentionAccounts.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-300 dark:border-amber-500/40 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{attentionAccounts.length} conexão(ões) Open Finance requerem atenção</span>
          </div>
          {attentionAccounts.map((acc) => {
            const health = evaluateAccountHealth(acc);
            return (
              <div key={acc.id} className="text-xs text-amber-800 dark:text-amber-300">
                <strong>{acc.institution}:</strong> {health.userMessage}
              </div>
            );
          })}
        </div>
      )}

      {/* Connected Accounts */}
      {accounts.length === 0 ? (
        <div className="p-8 rounded-xl bg-white dark:bg-[#111827] border border-dashed border-slate-300 dark:border-white/[0.12] text-center space-y-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Nenhuma conta bancária conectada (0 / {MAX_BANK_ACCOUNTS})
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            Clique em <strong>{t.accounts.connectBank}</strong> para iniciar o fluxo OAuth 2.0 / FAPI com consentimento explícito diretamente pelo servidor.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const health = evaluateAccountHealth(acc);
            const isCreditCard = acc.type === 'Cartão de Crédito';

            return (
              <div
                key={acc.id}
                className="p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Slot {acc.slot} · {acc.type}
                      </div>
                      <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {acc.institution}
                      </h3>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {acc.maskedAccount}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded border bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10">
                      {health.badgeLabel}
                    </span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {isCreditCard ? 'Fatura Atual' : 'Saldo Disponível'}
                    </div>
                    <div className="mt-0.5 text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                      {formatBRL(acc.balance, privacyMode)}
                    </div>
                    {(acc.invoiceClosingDay || acc.invoiceDueDay) && (
                      <div className="mt-1 text-[11px] text-slate-500 font-mono">
                        Fech/Venc: {formatCompactDay(acc.invoiceClosingDay)} /{' '}
                        {formatCompactDay(acc.invoiceDueDay)}
                      </div>
                    )}
                  </div>

                  {health.needsAction && (
                    <div className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{health.userMessage}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSync(acc.id)}
                    disabled={syncingId === acc.id || health.effectiveStatus === 'paused'}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncingId === acc.id ? 'animate-spin' : ''}`} />
                    <span>Sincronizar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onTogglePauseAccount(acc.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.08]"
                  >
                    {acc.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    <span>{acc.status === 'active' ? 'Pausar' : 'Retomar'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={revokingId === acc.id}
                    onClick={() => handleRevoke(acc.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20"
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

      {/* Provider Readiness & LGPD / BACEN Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#C9A86A]" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Status do Provedor Open Finance (Backend)
            </h3>
          </div>
          {backendStatus?.configured ? (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Provedor ativo: {backendStatus.providerLabel}</div>
                <div className="mt-1 font-mono text-[11px]">{backendStatus.callbackUrl}</div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
              <div className="font-semibold">
                Aguardando configuração do provedor/credenciais Open Finance no backend
              </div>
              <div className="text-[11px]">
                Configure no servidor as variáveis de ambiente do conector oficial (Pluggy, Belvo ou FAPI) antes de vincular contas bancárias reais.
              </div>
              {backendStatus?.callbackUrl && (
                <div className="font-mono text-[11px] break-all">
                  Callback: {backendStatus.callbackUrl}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Conformidade LGPD & BACEN
            </h3>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            Zero solicitação ou armazenamento de senhas bancárias, PINs, códigos SMS/MFA, CVV ou número completo de cartão. Todas as autorizações acontecem externamente no ambiente oficial da instituição via OAuth 2.0 / FAPI.
          </p>
        </div>
      </div>

      {/* Audit Log */}
      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#0D1320] border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <Activity className="h-3.5 w-3.5 text-[#C9A86A]" />
            <span>Trilha de Auditoria LGPD</span>
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

      {/* Modal de Conexão Real OAuth 2.0 / FAPI */}
      {connectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setConnectOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Autorizar Instituição (Open Finance Brasil)
              </h3>
              <button
                type="button"
                onClick={() => setConnectOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleStartOAuth} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Buscar Banco / Instituição
                </label>
                <div className="relative mb-2">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    placeholder="Buscar por nome ou código..."
                    className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <select
                  value={selectedBankId}
                  onChange={(e) => setSelectedBankId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1]"
                >
                  {filteredBanks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} (Cód. {b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Prazo do Consentimento
                  </label>
                  <select
                    value={consentTermMonths}
                    onChange={(e) => setConsentTermMonths(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1]"
                  >
                    <option value={3}>3 meses</option>
                    <option value={6}>6 meses</option>
                    <option value={12}>12 meses</option>
                  </select>
                </div>
              </div>

              {!backendStatus?.configured && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/40 text-xs text-amber-800 dark:text-amber-200">
                  Aguardando configuração do provedor/credenciais Open Finance no backend.
                </div>
              )}

              {pendingAuthUrl && (
                <a
                  href={pendingAuthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir Ambiente Oficial do Banco</span>
                </a>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConnectOpen(false)}
                  className="px-3 py-2 rounded-lg text-xs text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={initiating || !backendStatus?.configured}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] disabled:opacity-40"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>{initiating ? 'Conectando...' : 'Autorizar no Banco Oficial'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
