import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Send, Sparkles, UserCheck, MessageCircle, AlertCircle, Trash2 } from 'lucide-react';
import { AlertItem, AppState, ChatMessage, MatrixTotals } from '../types/finance';
import { buildFinancialContextSummary, formatBRL } from '../utils/financeEngine';
import { getApiEndpoint } from '../utils/vaultApi';
import { getTranslations } from '../utils/i18n';

interface AssistantChatViewProps {
  state: AppState;
  totals: MatrixTotals;
  alerts: AlertItem[];
  authToken: string;
  onAppendMessages: (messages: ChatMessage[]) => void;
  onClearHistory: () => void;
}

function detectSensitiveCredentialRequest(text: string): {
  blocked: boolean;
  refusalMessage?: string;
} {
  const normalized = text.toLowerCase();
  const forbiddenPatterns = [
    /senha\s+(do|da|de)?\s*(banco|app|conta|cart[aã]o|internet banking)/i,
    /cvv|c[oó]digo de seguran[cç]a|n[uú]mero completo do cart[aã]o/i,
    /\b(token|otp|c[oó]digo)\s*(sms|mfa|2fa)\b/i,
    /burlar\s+(autentica[cç][aã]o|kyc|cofre)/i,
  ];
  if (forbiddenPatterns.some((rx) => rx.test(normalized))) {
    return {
      blocked: true,
      refusalMessage:
        'Por segurança e conformidade LGPD, o ORBE Finanças nunca solicita, processa ou armazena senhas bancárias, CVV, códigos SMS/MFA ou número completo de cartão.',
    };
  }
  return { blocked: false };
}

export const AssistantChatView: React.FC<AssistantChatViewProps> = ({
  state,
  totals,
  alerts,
  authToken,
  onAppendMessages,
  onClearHistory,
}) => {
  const [persona, setPersona] = useState<'integrated' | 'friend' | 'banker'>('integrated');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { privacyMode, language } = state.settings;
  const t = getTranslations(language);
  const financialContext = useMemo(() => buildFinancialContextSummary(state), [state]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.chatHistory.length, loading]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: trimmed,
      persona,
      timestamp: new Date().toISOString(),
    };

    const compliance = detectSensitiveCredentialRequest(trimmed);
    if (compliance.blocked && compliance.refusalMessage) {
      const refusalMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        role: 'assistant',
        content: compliance.refusalMessage,
        persona,
        timestamp: new Date().toISOString(),
        model: 'lgpd-security-guard',
      };
      onAppendMessages([userMsg, refusalMsg]);
      setInput('');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError(t.assistant.offlineError);
      return;
    }

    onAppendMessages([userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(getApiEndpoint('/api/assistant/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          message: trimmed,
          persona,
          language,
          history: state.chatHistory.map((m) => ({ role: m.role, content: m.content })),
          financialContext,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(t.assistant.errorTitle);
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t.assistant.errorTitle);
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        role: 'assistant',
        content: data.reply,
        persona,
        timestamp: new Date().toISOString(),
        model: data.model,
      };
      onAppendMessages([assistantMsg]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.assistant.errorTitle);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const topVarExpense = useMemo(() => {
    return state.rows
      .filter((r) => r.block === 'variable' && !r.hidden)
      .map((r) => ({ name: r.name, total: totals.rowAnnual[r.id] ?? 0 }))
      .sort((a, b) => b.total - a.total)[0];
  }, [state.rows, totals]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-2 lg:pb-6">
      {/* Main Chat Container */}
      <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-col h-[calc(100dvh-13.5rem)] min-h-[400px] max-h-[760px] lg:h-[calc(100dvh-190px)] lg:min-h-[540px]">
        {/* Persona Switcher Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] max-w-full">
            <button
              type="button"
              onClick={() => setPersona('integrated')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                persona === 'integrated'
                  ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t.assistant.integrated}</span>
            </button>
            <button
              type="button"
              onClick={() => setPersona('friend')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                persona === 'friend'
                  ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>{t.assistant.friend}</span>
            </button>
            <button
              type="button"
              onClick={() => setPersona('banker')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                persona === 'banker'
                  ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>{t.assistant.banker}</span>
            </button>
          </div>

          {state.chatHistory.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t.assistant.clearChat}</span>
            </button>
          )}
        </div>

        {/* Messages Feed */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {state.chatHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
              <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t.assistant.emptyTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {t.assistant.emptyDesc}
              </p>
            </div>
          ) : (
            state.chatHistory.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-50 dark:bg-[#1A2234] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-white/[0.08]'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="mb-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                      {msg.persona === 'friend'
                        ? t.assistant.friend
                        : msg.persona === 'banker'
                        ? t.assistant.banker
                        : `${t.assistant.friend} & ${t.assistant.banker}`}
                    </div>
                  )}
                  <div>{msg.content}</div>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 text-xs bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400">
                {t.assistant.loadingText}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">{t.assistant.errorTitle}</div>
                <div className="mt-0.5">{error}</div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Chips & Input */}
        <div className="p-4 border-t border-slate-200 dark:border-white/[0.08] space-y-3 bg-slate-50/70 dark:bg-[#0D1320]">
          <div className="flex flex-wrap gap-1.5">
            {t.assistant.quickPrompts.map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading}
                onClick={() => sendMessage(q)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white dark:bg-[#1A2234] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08] hover:border-blue-400 transition-colors text-left"
              >
                {q}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.assistant.inputPlaceholder}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Live Context Side Panel */}
      <div className="lg:col-span-4 space-y-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.assistant.contextTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.assistant.contextSub} {state.settings.activeYear}
            </p>
          </div>

          <div className="space-y-2.5 text-xs font-mono tabular-nums">
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/[0.06]">
              <span className="font-sans text-slate-500 dark:text-slate-400">{t.assistant.annualIncome}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatBRL(totals.incomeAnnual, privacyMode)}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/[0.06]">
              <span className="font-sans text-slate-500 dark:text-slate-400">{t.assistant.annualExpense}</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {formatBRL(totals.totalExpenseAnnual, privacyMode)}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/[0.06]">
              <span className="font-sans text-slate-500 dark:text-slate-400">{t.assistant.netResult}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatBRL(totals.resultAnnual, privacyMode, true)}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-white/[0.06]">
              <span className="font-sans text-slate-500 dark:text-slate-400">{t.assistant.totalSaved}</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {formatBRL(totals.savingsAnnual, privacyMode)}
              </span>
            </div>
            {topVarExpense && (
              <div className="flex justify-between py-1.5">
                <span className="font-sans text-slate-500 dark:text-slate-400">{t.assistant.topVariable}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {topVarExpense.name} ({formatBRL(topVarExpense.total, privacyMode)})
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-2.5">
          <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            {t.assistant.monitoredAlerts} ({alerts.length})
          </h4>
          {alerts.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.assistant.noActiveAlerts}
            </p>
          ) : (
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              {alerts.slice(0, 4).map((a) => (
                <li
                  key={a.id}
                  className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]"
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100">{a.title}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {a.description}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
