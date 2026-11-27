import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Plus, Mic, Square, Sparkles, Settings, CheckCircle2 } from 'lucide-react';
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
import { parseVoiceTransaction, ParsedVoiceEntry } from '../utils/voiceEntryParser';
import {
  isAndroidNativeApp,
  isNativeSpeechRecognitionAvailable,
  openNativeAppSettings,
  requestAppPermission,
  startNativeSpeechRecognition,
  stopNativeSpeechRecognition,
  subscribeNativeSpeechEvents,
} from '../utils/permissions';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

interface NewEntryModalProps {
  isOpen: boolean;
  rows: CategoryRow[];
  accounts: BankAccount[];
  activeYear: number;
  defaultMonth: number;
  initialFlowType?: 'income' | 'expense';
  autoStartVoice?: boolean;
  language: AppLanguage;
  onClose: () => void;
  onAddEntry: (entry: Omit<TransactionEntry, 'id' | 'createdAt'>) => void;
}

function getPaidStatusLabel(isIncome: boolean, language: AppLanguage): string {
  if (language === 'en') return isIncome ? 'Received' : 'Paid';
  if (language === 'es') return isIncome ? 'Recibido' : 'Pagado';
  return isIncome ? 'Recebido' : 'Pago';
}

function joinTranscriptSegments(accumulated: string, currentSegment: string): string {
  const a = accumulated.trim();
  const b = currentSegment.trim();
  if (a && b) return `${a} ${b}`;
  return a || b;
}

export const NewEntryModal: React.FC<NewEntryModalProps> = ({
  isOpen,
  rows,
  accounts,
  activeYear,
  defaultMonth,
  initialFlowType,
  autoStartVoice = false,
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
  const [day, setDay] = useState(String(new Date().getDate()));
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [voiceDescription, setVoiceDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('debit');
  const [entryNature, setEntryNature] = useState<EntryNature>('standard');
  const [installmentCurrent, setInstallmentCurrent] = useState('1');
  const [installmentTotal, setInstallmentTotal] = useState('1');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? 'manual');
  const [status, setStatus] = useState<EntryStatus>('paid');

  // Voice entry state
  const [voiceText, setVoiceText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceDeniedSettings, setVoiceDeniedSettings] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedVoiceEntry | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const keepListeningRef = useRef(false);
  const usingNativeSpeechRef = useRef(false);
  const nativeUnsubscribeRef = useRef<(() => void) | null>(null);
  const accumulatedTranscriptRef = useRef('');
  const currentSegmentRef = useRef('');
  const restartTimerRef = useRef<number | null>(null);
  const monthRef = useRef(month);
  const rowsRef = useRef(rows);

  useEffect(() => {
    monthRef.current = month;
  }, [month]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const selectedRow = rows.find((r) => r.id === rowId);
  const isIncomeRow = selectedRow?.block === 'income';

  const applyParsedVoice = useCallback((transcript: string) => {
    const trimmed = transcript.trim();
    if (!trimmed) return;
    const parsed = parseVoiceTransaction(trimmed, rowsRef.current, monthRef.current);
    setParsedPreview(parsed);
    if (parsed.matchedRowId) setRowId(parsed.matchedRowId);
    if (parsed.amount !== null) setAmount(parsed.amount.toFixed(2));
    if (parsed.foundExplicitDay) setDay(String(parsed.day));
    if (parsed.foundExplicitMonth) setMonth(parsed.month);
    if (parsed.hasExplicitPaymentMethod || parsed.flowType === 'income') {
      setPaymentMethod(parsed.paymentMethod);
    }
    setStatus(parsed.status);
    if (parsed.merchant) setMerchant(parsed.merchant);
    if (parsed.description) setVoiceDescription(parsed.description);
    if (parsed.installmentCurrent) setInstallmentCurrent(String(parsed.installmentCurrent));
    if (parsed.installmentTotal) setInstallmentTotal(String(parsed.installmentTotal));
  }, []);

  const clearRestartTimer = () => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const stopListening = useCallback(async () => {
    keepListeningRef.current = false;
    clearRestartTimer();

    const finalCombined = joinTranscriptSegments(
      accumulatedTranscriptRef.current,
      currentSegmentRef.current
    );
    if (finalCombined) {
      accumulatedTranscriptRef.current = finalCombined;
      currentSegmentRef.current = '';
      setVoiceText(finalCombined);
      applyParsedVoice(finalCombined);
    }

    if (usingNativeSpeechRef.current) {
      usingNativeSpeechRef.current = false;
      try {
        await stopNativeSpeechRecognition();
      } catch {
        // Ignore stop errors
      }
      if (nativeUnsubscribeRef.current) {
        nativeUnsubscribeRef.current();
        nativeUnsubscribeRef.current = null;
      }
    }

    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        // Ignore
      }
    }

    setIsListening(false);
  }, [applyParsedVoice]);

  const startWebSpeechSession = useCallback(
    (SpeechCtor: new () => SpeechRecognitionLike, speechLang: string) => {
      if (!keepListeningRef.current) return;
      clearRestartTimer();

      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.stop();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
      }

      try {
        const rec = new SpeechCtor();
        rec.lang = speechLang;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.continuous = true;

        rec.onresult = (event) => {
          let sessionTranscript = '';
          let hasFinal = false;
          for (let i = 0; i < event.results.length; i++) {
            const r = event.results[i];
            if (r && r[0]?.transcript) {
              sessionTranscript += `${r[0].transcript} `;
              if (r.isFinal) hasFinal = true;
            }
          }
          const cleanSeg = sessionTranscript.trim();
          currentSegmentRef.current = cleanSeg;
          const combined = joinTranscriptSegments(accumulatedTranscriptRef.current, cleanSeg);
          if (combined) {
            setVoiceText(combined);
            if (hasFinal) {
              applyParsedVoice(combined);
            }
          }
        };

        rec.onerror = (ev) => {
          const code = ev?.error || '';
          if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
            keepListeningRef.current = false;
            recognitionRef.current = null;
            setIsListening(false);
            setVoiceDeniedSettings(isAndroidNativeApp());
            setVoiceError(
              code === 'audio-capture'
                ? 'Microfone indisponível ou ocupado por outro aplicativo.'
                : 'Acesso ao microfone negado. Libere a permissão ou digite a frase abaixo.'
            );
            return;
          }

          if ((code === 'no-speech' || code === 'aborted') && keepListeningRef.current) {
            // Natural pause/silence: let onend seamlessly restart while user keeps mic open
            return;
          }

          if (code === 'network' && keepListeningRef.current) {
            keepListeningRef.current = false;
            recognitionRef.current = null;
            setIsListening(false);
            setVoiceError(
              'O reconhecimento de voz do navegador requer internet ativa no momento, ou use o ditado offline do teclado.'
            );
          }
        };

        rec.onend = () => {
          recognitionRef.current = null;
          const committed = joinTranscriptSegments(
            accumulatedTranscriptRef.current,
            currentSegmentRef.current
          );
          if (committed) {
            accumulatedTranscriptRef.current = committed;
            currentSegmentRef.current = '';
            setVoiceText(committed);
            applyParsedVoice(committed);
          }

          if (keepListeningRef.current) {
            restartTimerRef.current = window.setTimeout(() => {
              if (keepListeningRef.current) {
                startWebSpeechSession(SpeechCtor, speechLang);
              }
            }, 180);
          } else {
            setIsListening(false);
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch {
        if (keepListeningRef.current) {
          restartTimerRef.current = window.setTimeout(() => {
            if (keepListeningRef.current) {
              startWebSpeechSession(SpeechCtor, speechLang);
            }
          }, 300);
        } else {
          setIsListening(false);
          setVoiceError('Digite ou dite pelo teclado no campo abaixo e toque em Preencher.');
        }
      }
    },
    [applyParsedVoice]
  );

  const startVoiceCapture = useCallback(async () => {
    setVoiceError(null);
    setVoiceDeniedSettings(false);

    if (isListening || keepListeningRef.current) {
      await stopListening();
      return;
    }

    const perms = await requestAppPermission('microphone');
    if (perms.microphone === 'denied') {
      setVoiceDeniedSettings(isAndroidNativeApp());
      setVoiceError(
        isAndroidNativeApp()
          ? 'Permissão de microfone negada no Android. Libere nos Ajustes do App ou digite a frase abaixo.'
          : 'Permissão de microfone bloqueada no navegador. Você pode digitar ou colar a frase abaixo.'
      );
      return;
    }

    const speechLang = language === 'en' ? 'en-US' : language === 'es' ? 'es-ES' : 'pt-BR';
    accumulatedTranscriptRef.current = voiceText.trim();
    currentSegmentRef.current = '';

    // 1. Prefer Android Native SpeechRecognizer on Capacitor Android APK
    if (isAndroidNativeApp()) {
      const nativeAvailable = await isNativeSpeechRecognitionAvailable();
      if (nativeAvailable) {
        if (nativeUnsubscribeRef.current) {
          nativeUnsubscribeRef.current();
          nativeUnsubscribeRef.current = null;
        }

        keepListeningRef.current = true;
        usingNativeSpeechRef.current = true;
        setIsListening(true);

        nativeUnsubscribeRef.current = await subscribeNativeSpeechEvents({
          onPartial: (text) => {
            if (!keepListeningRef.current) return;
            currentSegmentRef.current = text;
            setVoiceText(joinTranscriptSegments(accumulatedTranscriptRef.current, text));
          },
          onFinal: (text) => {
            const combined = joinTranscriptSegments(accumulatedTranscriptRef.current, text);
            accumulatedTranscriptRef.current = combined;
            currentSegmentRef.current = '';
            setVoiceText(combined);
            applyParsedVoice(combined);
          },
          onState: (listening) => {
            if (!listening && !keepListeningRef.current) {
              setIsListening(false);
            }
          },
          onError: (code, message) => {
            keepListeningRef.current = false;
            usingNativeSpeechRef.current = false;
            setIsListening(false);
            if (nativeUnsubscribeRef.current) {
              nativeUnsubscribeRef.current();
              nativeUnsubscribeRef.current = null;
            }
            if (code === 'not-allowed') {
              setVoiceDeniedSettings(true);
            }
            setVoiceError(message || 'Não foi possível captar áudio agora. Use o campo de texto abaixo.');
          },
        });

        const started = await startNativeSpeechRecognition(speechLang);
        if (started.started) {
          return;
        }

        keepListeningRef.current = false;
        usingNativeSpeechRef.current = false;
        setIsListening(false);
        if (nativeUnsubscribeRef.current) {
          nativeUnsubscribeRef.current();
          nativeUnsubscribeRef.current = null;
        }
      }
    }

    // 2. Web Speech API with continuous = true & auto-restart until user clicks Encerrar
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechCtor) {
      setVoiceError(
        'Reconhecimento de voz direto não disponível neste ambiente. Use o ditado por voz do teclado no campo abaixo e toque em Preencher.'
      );
      return;
    }

    keepListeningRef.current = true;
    usingNativeSpeechRef.current = false;
    setIsListening(true);
    startWebSpeechSession(SpeechCtor, speechLang);
  }, [applyParsedVoice, isListening, language, startWebSpeechSession, stopListening, voiceText]);

  useEffect(() => {
    if (!isOpen) {
      void stopListening();
      return;
    }
    accumulatedTranscriptRef.current = '';
    currentSegmentRef.current = '';
    setMonth(Math.min(11, Math.max(0, Number.isFinite(defaultMonth) ? Math.trunc(defaultMonth) : 10)));
    setDay(String(new Date().getDate()));
    setEntryNature('standard');
    setInstallmentCurrent('1');
    setInstallmentTotal('1');
    setVoiceText('');
    setVoiceDescription('');
    setParsedPreview(null);
    setVoiceError(null);
    setVoiceDeniedSettings(false);

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

    if (autoStartVoice) {
      void startVoiceCapture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultMonth, accounts, initialFlowType, autoStartVoice]);

  useEffect(() => {
    return () => {
      void stopListening();
    };
  }, [stopListening]);

  if (!isOpen) return null;

  const handleClose = () => {
    void stopListening();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void stopListening();
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0 || !rowId) return;
    const safeMonth = Math.min(11, Math.max(0, Number.isFinite(month) ? Math.trunc(month) : 0));
    const currentRow = rows.find((r) => r.id === rowId);
    const instTot = Math.min(48, Math.max(1, parseInt(installmentTotal, 10) || 1));
    const instCur = Math.min(instTot, Math.max(1, parseInt(installmentCurrent, 10) || 1));

    onAddEntry({
      rowId,
      year: activeYear,
      month: safeMonth,
      day: Math.min(31, Math.max(1, parseInt(day, 10) || 15)),
      amount: Number(parsed.toFixed(2)),
      description:
        voiceDescription.trim() ||
        merchant.trim() ||
        `${currentRow?.name ?? t.modals.newEntryTitle} · ${monthNamesFull[safeMonth]}`,
      merchant: merchant.trim() || currentRow?.name || t.modals.newEntryTitle,
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
    setVoiceDescription('');
    setVoiceText('');
    setParsedPreview(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between sticky top-0 bg-white dark:bg-[#111827] z-10">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t.modals.newEntryTitle} ({activeYear})
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Smart Voice / Natural Phrase Entry */}
          <div
            className={`p-3.5 rounded-xl border space-y-2.5 transition-colors ${
              isListening
                ? 'bg-red-50/80 dark:bg-red-950/25 border-red-300 dark:border-red-500/40'
                : 'bg-blue-50/70 dark:bg-[#0D1320] border-blue-200/80 dark:border-blue-500/25'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className={`flex items-center gap-1.5 text-xs font-semibold ${
                  isListening ? 'text-red-700 dark:text-red-300' : 'text-blue-700 dark:text-blue-300'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Lançamento Rápido por Voz ou Frase</span>
              </div>
              {isListening ? (
                <button
                  type="button"
                  onClick={() => void stopListening()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span>Encerrar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startVoiceCapture()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  <Mic className="h-3.5 w-3.5" />
                  <span>Falar</span>
                </button>
              )}
            </div>

            {isListening && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-red-100/90 dark:bg-red-900/35 border border-red-200 dark:border-red-500/30">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-ping shrink-0" />
                  <span className="text-[11px] font-semibold text-red-800 dark:text-red-200 leading-tight">
                    Microfone ativo — fale livremente (toque em Encerrar para parar)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void stopListening()}
                  className="px-2 py-1 rounded bg-red-700 hover:bg-red-800 text-white text-[10px] font-bold shrink-0"
                >
                  Concluir
                </button>
              </div>
            )}

            <div className="space-y-2">
              <textarea
                rows={2}
                value={voiceText}
                onChange={(e) => {
                  const val = e.target.value;
                  setVoiceText(val);
                  if (!isListening) {
                    accumulatedTranscriptRef.current = val;
                    currentSegmentRef.current = '';
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    applyParsedVoice(voiceText);
                  }
                }}
                placeholder="Ex: abasteci a moto com 50 reais no débito no posto GMC próximo ao Campo Goytacazes..."
                className="w-full px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white resize-y leading-relaxed"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {isListening
                    ? 'Transcrevendo ao vivo...'
                    : 'Você pode editar a frase antes de preencher ou salvar.'}
                </span>
                <button
                  type="button"
                  disabled={!voiceText.trim()}
                  onClick={() => applyParsedVoice(voiceText)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] disabled:opacity-40 whitespace-nowrap"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Preencher</span>
                </button>
              </div>
            </div>

            {voiceError && (
              <div className="text-[11px] text-amber-700 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2">
                <span>{voiceError}</span>
                {voiceDeniedSettings && (
                  <button
                    type="button"
                    onClick={() => void openNativeAppSettings()}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-600 text-white font-semibold"
                  >
                    <Settings className="h-3 w-3" />
                    <span>Ajustes do App</span>
                  </button>
                )}
              </div>
            )}

            {parsedPreview && parsedPreview.confidenceHints.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {parsedPreview.confidenceHints.map((hint) => (
                  <span
                    key={hint}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-200 font-medium"
                  >
                    {hint}
                  </span>
                ))}
              </div>
            )}
          </div>

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
                <option value="paid">{getPaidStatusLabel(isIncomeRow, language)}</option>
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

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Descrição / Detalhes do Lançamento
            </label>
            <input
              type="text"
              value={voiceDescription}
              onChange={(e) => setVoiceDescription(e.target.value)}
              placeholder="Ex.: Abastecimento da moto - Posto GMC (próximo ao Campo Goytacazes)"
              className="w-full px-3 py-2.5 rounded-lg text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
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
