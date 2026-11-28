import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { X, Plus, Mic, Square, Sparkles, Settings, CheckCircle2, Search, Check } from 'lucide-react';
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
  CategoryIconBadge,
  CategoryIconKey,
  CategoryVisualPicker,
  getDefaultCategoryColor,
  getDefaultCategoryIcon,
} from '../utils/categoryVisuals';
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
  onAddRow?: (row: Omit<CategoryRow, 'id' | 'order'>) => CategoryRow | void;
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

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
  onAddRow,
}) => {
  const t = getTranslations(language);
  const monthNamesFull = getMonthNamesFull(language);
  const [flowType, setFlowType] = useState<'expense' | 'income' | 'savings'>(
    initialFlowType === 'income' ? 'income' : 'expense'
  );
  const [showVoicePanel, setShowVoicePanel] = useState(Boolean(autoStartVoice));
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Inline date-free category creator & search
  const [categorySearch, setCategorySearch] = useState('');
  const deferredCategorySearch = useDeferredValue(categorySearch);
  const [showNewCatForm, setShowNewCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatBlock, setNewCatBlock] = useState<'fixed' | 'variable'>('variable');
  const [newCatColor, setNewCatColor] = useState('#2563EB');
  const [newCatIcon, setNewCatIcon] = useState<CategoryIconKey>('tag');

  const visibleRows = rows.filter((r) => !r.hidden);
  const [rowId, setRowId] = useState(visibleRows[0]?.id ?? 'inc-pizzaria');
  const [month, setMonth] = useState(
    Math.min(11, Math.max(0, Number.isFinite(defaultMonth) ? Math.trunc(defaultMonth) : 10))
  );
  const [entryYear, setEntryYear] = useState(
    Number.isFinite(activeYear) ? Math.trunc(activeYear) : new Date().getFullYear()
  );
  const [day, setDay] = useState(String(new Date().getDate()));
  const [amount, setAmount] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
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
  const voiceTextRef = useRef('');
  const monthRef = useRef(month);
  const yearRef = useRef(entryYear);
  const rowsRef = useRef(rows);

  useEffect(() => {
    voiceTextRef.current = voiceText;
  }, [voiceText]);

  useEffect(() => {
    monthRef.current = month;
  }, [month]);

  useEffect(() => {
    yearRef.current = entryYear;
  }, [entryYear]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const selectedRow = rows.find((r) => r.id === rowId);
  const isIncomeRow = flowType === 'income' || selectedRow?.block === 'income';

  const handleSelectFlowType = (nextFlow: 'expense' | 'income' | 'savings') => {
    setFlowType(nextFlow);
    setCategorySearch('');
    const matchesFlow = (r: CategoryRow) =>
      nextFlow === 'income'
        ? r.block === 'income'
        : nextFlow === 'savings'
        ? r.block === 'savings'
        : r.block === 'fixed' || r.block === 'variable';

    const current = visibleRows.find((r) => r.id === rowId);
    if (!current || !matchesFlow(current)) {
      const firstMatch = visibleRows.find(matchesFlow);
      if (firstMatch) setRowId(firstMatch.id);
    }
    if (nextFlow === 'income' && paymentMethod === 'credit') {
      setPaymentMethod('pix');
    }
  };

  const applyParsedVoice = useCallback((transcript: string) => {
    const trimmed = transcript.trim();
    if (!trimmed) return;
    const parsed = parseVoiceTransaction(
      trimmed,
      rowsRef.current,
      monthRef.current,
      new Date(),
      yearRef.current
    );
    setParsedPreview(parsed);
    if (parsed.matchedRowId) {
      setRowId(parsed.matchedRowId);
      const matched = rowsRef.current.find((r) => r.id === parsed.matchedRowId);
      if (matched) {
        setFlowType(
          matched.block === 'income'
            ? 'income'
            : matched.block === 'savings'
            ? 'savings'
            : 'expense'
        );
      }
    } else if (parsed.flowType === 'income') {
      setFlowType('income');
    } else if (parsed.flowType === 'savings') {
      setFlowType('savings');
    } else {
      setFlowType('expense');
    }
    if (parsed.amount !== null) setAmount(parsed.amount.toFixed(2));
    if (parsed.foundExplicitDay) setDay(String(parsed.day));
    if (parsed.foundExplicitMonth) setMonth(parsed.month);
    if (parsed.foundExplicitYear) setEntryYear(parsed.year);
    if (parsed.hasExplicitPaymentMethod || parsed.flowType === 'income') {
      setPaymentMethod(parsed.paymentMethod);
    }
    setStatus(parsed.status);
    const mergedDesc = parsed.description || parsed.merchant || '';
    if (mergedDesc) setShortDescription(mergedDesc);
    if (parsed.installmentCurrent) setInstallmentCurrent(String(parsed.installmentCurrent));
    if (parsed.installmentTotal) {
      setInstallmentTotal(String(parsed.installmentTotal));
      if (parsed.installmentTotal > 1) setShowAdvanced(true);
    }
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
        rec.continuous = true;
        try {
          rec.interimResults = true;
        } catch {
          // Fallback when interimResults is unsupported
        }
        try {
          rec.maxAlternatives = 1;
        } catch {
          // Ignore unsupported maxAlternatives
        }

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

  const startVoiceCapture = useCallback(
    async (options?: { resetTranscript?: boolean }) => {
      setVoiceError(null);
      setVoiceDeniedSettings(false);
      setShowVoicePanel(true);

      if (!options?.resetTranscript && (isListening || keepListeningRef.current)) {
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
      accumulatedTranscriptRef.current = options?.resetTranscript
        ? ''
        : voiceTextRef.current.trim();
      currentSegmentRef.current = '';

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

      const win = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      };
      const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;

      if (!SpeechCtor) {
        setVoiceError(
          'Reconhecimento de voz direto não disponível neste ambiente. Use o ditado do teclado ou digite a frase.'
        );
        return;
      }

      keepListeningRef.current = true;
      usingNativeSpeechRef.current = false;
      setIsListening(true);
      startWebSpeechSession(SpeechCtor, speechLang);
    },
    [applyParsedVoice, isListening, language, startWebSpeechSession, stopListening]
  );

  useEffect(() => {
    if (!isOpen) {
      void stopListening();
      return;
    }
    accumulatedTranscriptRef.current = '';
    currentSegmentRef.current = '';
    voiceTextRef.current = '';
    setMonth(Math.min(11, Math.max(0, Number.isFinite(defaultMonth) ? Math.trunc(defaultMonth) : 10)));
    setEntryYear(Number.isFinite(activeYear) ? Math.trunc(activeYear) : new Date().getFullYear());
    setDay(String(new Date().getDate()));
    setAmount('');
    setShortDescription('');
    setEntryNature('standard');
    setInstallmentCurrent('1');
    setInstallmentTotal('1');
    setShowAdvanced(false);
    setCategorySearch('');
    setShowNewCatForm(false);
    setNewCatName('');
    setStatus('paid');
    setVoiceText('');
    setParsedPreview(null);
    setVoiceError(null);
    setVoiceDeniedSettings(false);
    setShowVoicePanel(Boolean(autoStartVoice));

    if (initialFlowType === 'income') {
      setFlowType('income');
      setPaymentMethod('pix');
      const firstIncome = visibleRows.find((r) => r.block === 'income');
      if (firstIncome) setRowId(firstIncome.id);
    } else if (initialFlowType === 'expense') {
      setFlowType('expense');
      setPaymentMethod('pix');
      const firstExpense = visibleRows.find((r) => r.block === 'variable' || r.block === 'fixed');
      if (firstExpense) setRowId(firstExpense.id);
    } else {
      setFlowType('expense');
      const firstExpense = visibleRows.find((r) => r.block === 'variable' || r.block === 'fixed') ?? visibleRows[0];
      if (firstExpense) setRowId(firstExpense.id);
    }

    if (accountId !== 'manual' && !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0]?.id ?? 'manual');
    }

    if (autoStartVoice) {
      void startVoiceCapture({ resetTranscript: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultMonth, activeYear, accounts, initialFlowType, autoStartVoice]);

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
    const safeYear =
      Number.isFinite(entryYear) && entryYear >= 1900 && entryYear <= 9999
        ? Math.trunc(entryYear)
        : activeYear;
    const currentRow = rows.find((r) => r.id === rowId);
    const instTot = Math.min(48, Math.max(1, parseInt(installmentTotal, 10) || 1));
    const instCur = Math.min(instTot, Math.max(1, parseInt(installmentCurrent, 10) || 1));
    const cleanDesc = shortDescription.trim();

    onAddEntry({
      rowId,
      year: safeYear,
      month: safeMonth,
      day: Math.min(31, Math.max(1, parseInt(day, 10) || 15)),
      amount: Number(parsed.toFixed(2)),
      description: cleanDesc || `${currentRow?.name ?? t.modals.newEntryTitle} · ${monthNamesFull[safeMonth]}`,
      merchant: cleanDesc || currentRow?.name || t.modals.newEntryTitle,
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
    setShortDescription('');
    setVoiceText('');
    setParsedPreview(null);
    onClose();
  };

  const filteredCategoryRows = visibleRows.filter((r) => {
    if (flowType === 'income') return r.block === 'income';
    if (flowType === 'savings') return r.block === 'savings';
    return r.block === 'fixed' || r.block === 'variable';
  });

  const normalizedCategoryQuery = normalizeSearchText(deferredCategorySearch);
  const searchedCategoryRows = normalizedCategoryQuery
    ? filteredCategoryRows.filter((r) =>
        normalizeSearchText(r.name).includes(normalizedCategoryQuery)
      )
    : filteredCategoryRows;

  const paymentOptions: PaymentMethod[] = ['pix', 'debit', 'credit', 'cash', 'transfer'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 pt-safe-screen pb-safe-nav overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={handleClose} />
      <div className="relative z-10 my-auto w-full max-w-md max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.25rem)] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-2 sticky top-0 bg-white dark:bg-[#111827] z-10">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
            {t.modals.newEntryTitle}
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isListening) {
                  void stopListening();
                } else {
                  setShowVoicePanel((prev) => !prev);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                isListening
                  ? 'bg-red-600 text-white'
                  : showVoicePanel
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-950/60'
              }`}
            >
              {isListening ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  <span>Ouvindo...</span>
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" />
                  <span>Por Voz</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Optional Compact Voice Shortcut */}
          {showVoicePanel && (
            <div
              className={`p-3 rounded-xl border space-y-2 transition-colors ${
                isListening
                  ? 'bg-red-50/80 dark:bg-red-950/25 border-red-300 dark:border-red-500/40'
                  : 'bg-blue-50/70 dark:bg-[#0D1320] border-blue-200/80 dark:border-blue-500/25'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`flex items-center gap-1.5 text-xs font-semibold ${
                    isListening ? 'text-red-700 dark:text-red-300' : 'text-blue-700 dark:text-blue-300'
                  }`}
                >
                  {isListening ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-red-600 animate-ping shrink-0" />
                      <span>Ouvindo...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      <span>Preenchimento por Voz ou Frase</span>
                    </>
                  )}
                </span>
                {isListening ? (
                  <button
                    type="button"
                    onClick={() => void stopListening()}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    <span>Parar / Encerrar</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startVoiceCapture()}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Mic className="h-3.5 w-3.5" />
                    <span>Falar</span>
                  </button>
                )}
              </div>

              {isListening && (
                <div
                  role="status"
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-red-100/90 dark:bg-red-900/35 border border-red-200 dark:border-red-500/30"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse shrink-0" />
                    <span className="text-[11px] font-medium text-red-800 dark:text-red-200 truncate">
                      Ouvindo... fale livremente até tocar em Parar / Encerrar
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void stopListening()}
                    className="px-2 py-0.5 rounded bg-red-700 text-white text-[10px] font-bold shrink-0"
                  >
                    Parar
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
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
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyParsedVoice(voiceText);
                    }
                  }}
                  placeholder="Ex: mercado 85 reais no pix hoje"
                  className="flex-1 min-w-0 px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  disabled={!voiceText.trim()}
                  onClick={() => applyParsedVoice(voiceText)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] disabled:opacity-40 shrink-0"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Aplicar</span>
                </button>
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
                      <span>Ajustes</span>
                    </button>
                  )}
                </div>
              )}

              {parsedPreview && parsedPreview.confidenceHints.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {parsedPreview.confidenceHints.slice(0, 4).map((hint) => (
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
          )}

          {/* 1. Tipo (Saída / Entrada / Caixinha) */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => handleSelectFlowType('expense')}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                flowType === 'expense'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Saída (Despesa)
            </button>
            <button
              type="button"
              onClick={() => handleSelectFlowType('income')}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                flowType === 'income'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Entrada (Receita)
            </button>
            <button
              type="button"
              onClick={() => handleSelectFlowType('savings')}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                flowType === 'savings'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Caixinha
            </button>
          </div>

          {/* 2. Valor + Dia + Mês + Ano */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.modals.amountLabel}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus={!autoStartVoice}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2.5 rounded-xl text-base font-semibold font-mono tabular-nums bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.modals.dayLabel}
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="w-full px-1.5 py-2.5 rounded-xl text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white text-center"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.modals.monthLabel}
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full px-1.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                {monthNamesFull.map((m, idx) => (
                  <option key={m} value={idx}>
                    {m.slice(0, 3)}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ano
              </label>
              <input
                type="number"
                min="1900"
                max="9999"
                value={entryYear}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  if (Number.isFinite(y)) setEntryYear(y);
                }}
                className="w-full px-2 py-2.5 rounded-xl text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white text-center"
              />
            </div>
          </div>

          {/* 3. Descrição Curta */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Descrição curta
            </label>
            <input
              type="text"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder={
                flowType === 'income'
                  ? 'Ex.: Salário, Freelance, Venda Pix...'
                  : flowType === 'savings'
                  ? 'Ex.: Reserva do mês, Cofrinho...'
                  : 'Ex.: Mercado, Posto, Farmácia, Aluguel...'
              }
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            />
          </div>

          {/* 4. Categoria (busca em tempo real + cor/ícone + criação rápida sem data) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.modals.categoryRowLabel}
              </label>
              {onAddRow && (
                <button
                  type="button"
                  onClick={() => {
                    const targetBlock =
                      flowType === 'income' ? 'income' : flowType === 'savings' ? 'savings' : newCatBlock;
                    setNewCatColor(getDefaultCategoryColor(targetBlock));
                    setNewCatIcon(getDefaultCategoryIcon(targetBlock));
                    setShowNewCatForm((prev) => !prev);
                  }}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
                >
                  {showNewCatForm ? 'Cancelar nova categoria' : '+ Nova categoria'}
                </button>
              )}
            </div>

            {/* Active selection bar */}
            {selectedRow && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CategoryIconBadge row={selectedRow} size="sm" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {selectedRow.name}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {selectedRow.block === 'income'
                        ? 'Receita'
                        : selectedRow.block === 'fixed'
                        ? 'Despesa Fixa'
                        : selectedRow.block === 'variable'
                        ? 'Despesa Variável'
                        : 'Caixinha'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap shrink-0">
                  Selecionada
                </span>
              </div>
            )}

            {/* Searchable input field */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Buscar categoria por nome..."
                aria-label="Buscar categoria"
                className="w-full pl-8 pr-8 py-2 rounded-xl text-xs bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder:text-slate-400"
              />
              {categorySearch && (
                <button
                  type="button"
                  onClick={() => setCategorySearch('')}
                  aria-label="Limpar busca de categoria"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Real-time filtered category list */}
            <div
              role="listbox"
              aria-label={t.modals.categoryRowLabel}
              className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#0D1320] divide-y divide-slate-100 dark:divide-white/[0.05]"
            >
              {searchedCategoryRows.length === 0 ? (
                <div className="p-3 text-center space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Nenhuma categoria encontrada para "{categorySearch.trim()}".
                  </p>
                  {onAddRow && categorySearch.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetBlock =
                          flowType === 'income' ? 'income' : flowType === 'savings' ? 'savings' : newCatBlock;
                        setNewCatColor(getDefaultCategoryColor(targetBlock));
                        setNewCatIcon(getDefaultCategoryIcon(targetBlock));
                        setNewCatName(categorySearch.trim().toUpperCase());
                        setShowNewCatForm(true);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Criar "{categorySearch.trim().toUpperCase()}"</span>
                    </button>
                  )}
                </div>
              ) : (
                searchedCategoryRows.map((r) => {
                  const isSelected = r.id === rowId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setRowId(r.id);
                      }}
                      className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-50/90 dark:bg-blue-950/35 text-blue-900 dark:text-blue-100'
                          : 'hover:bg-white dark:hover:bg-[#151E30] text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CategoryIconBadge row={r} size="xs" />
                        <span className="text-xs font-medium truncate">{r.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-slate-400">
                          {r.block === 'income'
                            ? 'Receita'
                            : r.block === 'fixed'
                            ? 'Fixa'
                            : r.block === 'variable'
                            ? 'Variável'
                            : 'Caixinha'}
                        </span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {showNewCatForm && onAddRow && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-blue-200 dark:border-blue-500/30 space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Nome da categoria (sem data)"
                    className="flex-1 min-w-[150px] px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                  />
                  {flowType === 'expense' && (
                    <select
                      value={newCatBlock}
                      onChange={(e) => setNewCatBlock(e.target.value as 'fixed' | 'variable')}
                      className="px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    >
                      <option value="variable">Despesa Variável</option>
                      <option value="fixed">Despesa Fixa</option>
                    </select>
                  )}
                </div>

                <CategoryVisualPicker
                  color={newCatColor}
                  icon={newCatIcon}
                  onChangeColor={setNewCatColor}
                  onChangeIcon={setNewCatIcon}
                  compact
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!newCatName.trim()}
                    onClick={() => {
                      const clean = newCatName.trim();
                      if (!clean) return;
                      const targetBlock =
                        flowType === 'income'
                          ? 'income'
                          : flowType === 'savings'
                          ? 'savings'
                          : newCatBlock;
                      const created = onAddRow({
                        block: targetBlock,
                        name: clean.toUpperCase(),
                        color: newCatColor,
                        icon: newCatIcon,
                      });
                      if (created && created.id) {
                        setRowId(created.id);
                      }
                      setCategorySearch('');
                      setNewCatName('');
                      setShowNewCatForm(false);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Criar e usar</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 5. Forma de Pagamento (1 toque) */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t.modals.methodLabel}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {paymentOptions.map((method) => {
                const active = paymentMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                        : 'bg-slate-50 dark:bg-[#1A2234] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232D42]'
                    }`}
                  >
                    {translatePaymentMethod(method, language)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6. Situação Individual (Pago / Recebido vs Pendente / Previsto) */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Situação
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'paid' as EntryStatus, label: getPaidStatusLabel(isIncomeRow, language) },
                  { id: 'pending' as EntryStatus, label: t.modals.statusPending },
                  { id: 'projected' as EntryStatus, label: t.modals.statusProjected },
                ] as const
              ).map((opt) => {
                const active = status === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStatus(opt.id)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                      active
                        ? opt.id === 'paid'
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : opt.id === 'pending'
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-slate-50 dark:bg-[#1A2234] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#232D42]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Advanced Fields (Collapsed by default) */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAdvanced ? 'Ocultar conta e parcelas' : '+ Mais opções (conta ou parcelas)'}
            </button>

            {showAdvanced && (
              <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-white/[0.08] space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {t.modals.accountLabel}
                    </label>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
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
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {t.modals.natureLabel}
                    </label>
                    <select
                      value={entryNature}
                      onChange={(e) => setEntryNature(e.target.value as EntryNature)}
                      className="w-full px-2.5 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    >
                      <option value="standard">{t.modals.natureReal}</option>
                      <option value="internal_transfer">{t.modals.natureInternal}</option>
                      <option value="invoice_payment">{t.modals.natureInvoice}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {t.modals.installmentLabel}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="48"
                      value={installmentCurrent}
                      onChange={(e) => setInstallmentCurrent(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {t.modals.ofTotalLabel}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="48"
                      value={installmentTotal}
                      onChange={(e) => setInstallmentTotal(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              {t.modals.cancel}
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
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
