import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Fingerprint,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck2,
  ScanFace,
  Sparkles,
  UserPlus,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import {
  AppLanguage,
  AppState,
  BiometricConfig,
  KycDocumentType,
  KycStatus,
  UserProfile,
} from '../types/finance';
import { getTranslations, loadStoredLanguage } from '../utils/i18n';
import { cleanCPF, formatCPF, isValidCPF } from '../utils/cpf';
import {
  BiometricMode,
  BiometryAvailabilityInfo,
  checkNativeBiometryAvailability,
  enrollBiometricForCpf,
  getLocalBiometricHandle,
  verifyBiometricOnDevice,
} from '../utils/biometrics';
import { createCleanAppState } from '../data/initialData';
import {
  clearRememberedCpf,
  loadLastCpfHint,
  loadLastCpfPrivacyMask,
  loadRememberedCpf,
  RememberedCpfRecord,
  saveLastCpfPrivacyMask,
  saveRememberedCpf,
} from '../utils/localVault';
import { lookupCpfVault, loginCpfVault, registerCpfVault } from '../utils/vaultApi';

export interface AuthenticatedSessionPayload {
  token: string;
  cpfId: string;
  profile: UserProfile;
  biometric: BiometricConfig;
  appState: AppState;
  restoredFromServer: boolean;
}

interface LookupResult {
  exists: boolean;
  cpfId: string;
  maskedCpf: string;
  fullNameHint?: string;
  kycStatus?: KycStatus;
  biometric?: BiometricConfig;
  source?: 'server' | 'offline';
}

interface AuthOnboardingScreenProps {
  language?: AppLanguage;
  onAuthenticated: (payload: AuthenticatedSessionPayload) => void;
}

export const AuthOnboardingScreen: React.FC<AuthOnboardingScreenProps> = ({
  language,
  onAuthenticated,
}) => {
  const activeLang = language ?? loadStoredLanguage();
  const t = getTranslations(activeLang);
  const [rememberedCpf, setRememberedCpf] = useState<RememberedCpfRecord | null>(() =>
    loadRememberedCpf()
  );
  const [stage, setStage] = useState<'cpf' | 'login' | 'register'>('cpf');
  const [cpfInput, setCpfInput] = useState(() => loadRememberedCpf()?.formattedCpf ?? '');
  const [maskSavedCpf, setMaskSavedCpf] = useState(() => loadLastCpfPrivacyMask());
  const [isCpfFocused, setIsCpfFocused] = useState(false);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [bioAvailability, setBioAvailability] = useState<BiometryAvailabilityInfo | null>(null);
  const cpfInputRef = useRef<HTMLInputElement>(null);

  // Login State
  const [loginPin, setLoginPin] = useState('');

  // Register 3-step Wizard State
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // KYC Step State
  const [docType, setDocType] = useState<KycDocumentType>('CNH');
  const [docLast4, setDocLast4] = useState('');
  const [kycStatus, setKycStatus] = useState<KycStatus>('pending');
  const [kycAnimating, setKycAnimating] = useState(false);
  const kycTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    checkNativeBiometryAvailability()
      .then((info) => {
        if (active) setBioAvailability(info);
      })
      .catch(() => {
        if (active) setBioAvailability(null);
      });
    return () => {
      active = false;
      if (kycTimerRef.current !== null) {
        window.clearTimeout(kycTimerRef.current);
      }
    };
  }, []);

  // Security Setup State
  const [regPin, setRegPin] = useState('');
  const [regPinConfirm, setRegPinConfirm] = useState('');
  const [enableBiometric, setEnableBiometric] = useState(true);

  const lastHint = rememberedCpf?.maskedCpf || loadLastCpfHint();
  const cpfDigits = cleanCPF(cpfInput);
  const cpfValid = isValidCPF(cpfDigits);
  const isShowingMaskedValue = Boolean(
    maskSavedCpf &&
      !isCpfFocused &&
      rememberedCpf &&
      cpfDigits === rememberedCpf.cpfDigits
  );

  const runCpfLookup = async (digitsToLookup: string) => {
    setError(null);
    setInfoNotice(null);

    if (!isValidCPF(digitsToLookup)) {
      setError('CPF inválido. Confira os 11 dígitos e os dígitos verificadores.');
      return;
    }

    setLoading(true);
    try {
      const data = await lookupCpfVault(digitsToLookup);

      setLookup(data as LookupResult);
      if (data.exists) {
        setLoginPin('');
        if (data.source === 'offline') {
          setInfoNotice(
            'Servidor indisponível no momento. Conta localizada no cache seguro deste aparelho.'
          );
        }
        setStage('login');
      } else {
        if (data.source === 'offline') {
          setInfoNotice(
            'Servidor de sincronização inacessível agora. Se você já tinha conta em outro aparelho ou antes de reinstalar, conecte-se à internet ou importe seu backup JSON em Configurações.'
          );
        }
        setRegStep(1);
        setKycStatus('pending');
        setStage('register');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleCpfLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    await runCpfLookup(cpfDigits);
  };

  const handleClearCpfInput = (forgetDeviceRecord = false) => {
    setCpfInput('');
    setLookup(null);
    setError(null);
    setInfoNotice(null);
    if (forgetDeviceRecord) {
      clearRememberedCpf();
      setRememberedCpf(null);
    }
    window.setTimeout(() => {
      cpfInputRef.current?.focus();
    }, 20);
  };

  const handleToggleCpfMask = () => {
    const next = !maskSavedCpf;
    setMaskSavedCpf(next);
    saveLastCpfPrivacyMask(next);
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookup) return;
    setError(null);

    if (!/^\d{4,6}$/.test(loginPin.trim())) {
      setError('Digite seu PIN de 4 a 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const data = await loginCpfVault({
        cpf: cpfDigits,
        method: 'pin',
        pin: loginPin.trim(),
      });

      const saved = saveRememberedCpf(cpfDigits);
      if (saved) setRememberedCpf(saved);
      onAuthenticated({
        token: data.token,
        cpfId: data.profile.cpfId,
        profile: data.profile,
        biometric: data.biometric,
        appState: data.appState,
        restoredFromServer: data.source === 'server',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'PIN incorreto.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!lookup) return;
    setError(null);
    setInfoNotice(null);
    setLoading(true);

    try {
      const proof = await verifyBiometricOnDevice(lookup.cpfId, lookup.biometric?.credentialId);
      if (!proof) {
        setError(
          'Credencial biométrica não encontrada neste dispositivo (ex.: após reinstalação). Entre com seu PIN para restaurar sua conta e reativar a biometria.'
        );
        setLoading(false);
        return;
      }

      const data = await loginCpfVault({
        cpf: cpfDigits,
        method: 'biometric',
        credentialId: proof.credentialId,
        deviceKey: proof.deviceKey,
      });

      const saved = saveRememberedCpf(cpfDigits);
      if (saved) setRememberedCpf(saved);
      onAuthenticated({
        token: data.token,
        cpfId: data.profile.cpfId,
        profile: data.profile,
        biometric: data.biometric,
        appState: data.appState,
        restoredFromServer: data.source === 'server',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha na biometria. Utilize seu PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleRunKycVerification = () => {
    setError(null);
    if (docLast4.replace(/\D/g, '').length < 4) {
      setError('Informe os 4 últimos dígitos do documento escolhido para validação.');
      return;
    }
    setKycAnimating(true);
    setKycStatus('under_review');
    if (kycTimerRef.current !== null) {
      window.clearTimeout(kycTimerRef.current);
    }
    kycTimerRef.current = window.setTimeout(() => {
      kycTimerRef.current = null;
      setKycStatus('verified');
      setKycAnimating(false);
    }, 950);
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookup) return;
    setError(null);

    if (!/^\d{4,6}$/.test(regPin.trim())) {
      setError('O PIN deve ter entre 4 e 6 dígitos numéricos.');
      return;
    }
    if (regPin.trim() !== regPinConfirm.trim()) {
      setError('A confirmação do PIN não confere.');
      return;
    }

    setLoading(true);
    try {
      let biometricPayload: {
        enabled: boolean;
        credentialId?: string;
        deviceKey?: string;
        deviceLabel?: string;
        mode?: BiometricMode;
      } = { enabled: false };
      if (enableBiometric) {
        try {
          const enrolled = await enrollBiometricForCpf(lookup.cpfId, fullName.trim());
          biometricPayload = {
            enabled: true,
            credentialId: enrolled.credentialId,
            deviceKey: enrolled.deviceKey,
            deviceLabel: enrolled.deviceLabel,
            mode: enrolled.mode,
          };
        } catch {
          // Caso o navegador web ou usuário cancele a biometria no cadastro inicial, conclui com PIN seguro
          biometricPayload = { enabled: false };
        }
      }

      const cleanState = createCleanAppState();
      const data = await registerCpfVault({
        cpf: cpfDigits,
        fullName: fullName.trim(),
        birthDate,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        kycStatus,
        kycDocumentType: docType,
        kycDocumentLast4: docLast4.replace(/\D/g, '').slice(-4),
        pin: regPin.trim(),
        biometric: biometricPayload,
        appState: cleanState,
      });

      const saved = saveRememberedCpf(cpfDigits);
      if (saved) setRememberedCpf(saved);
      onAuthenticated({
        token: data.token,
        cpfId: data.profile.cpfId,
        profile: data.profile,
        biometric: data.biometric,
        appState: data.appState,
        restoredFromServer: data.source === 'server',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao concluir cadastro.');
    } finally {
      setLoading(false);
    }
  };

  const hasLocalBiometricForLookup = Boolean(
    lookup?.exists &&
      lookup.biometric?.enabled &&
      getLocalBiometricHandle(lookup.cpfId)?.credentialId === lookup.biometric.credentialId &&
      bioAvailability?.available
  );

  const renderKycBadge = (status?: KycStatus) => {
    if (status === 'verified') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3" />
          {t.settings.security.verified} (KYC)
        </span>
      );
    }
    if (status === 'under_review') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
          <RefreshCw className="h-3 w-3 animate-spin" />
          {t.settings.security.underReview}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-500/15 text-slate-300 border border-white/10">
        <Clock className="h-3 w-3" />
        {t.settings.security.pending}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Private Banking Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#111827] border border-[#C9A86A]/40 text-sm font-semibold tracking-wider text-[#C9A86A] shadow-lg">
            TC
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
            Thayllon Private Control <span className="text-[#C9A86A] font-mono">CF 2026+</span>
          </h1>
          <p className="text-xs text-slate-400">
            {t.auth.brandSubtitle}
          </p>
        </div>

        {/* Main Card */}
        <div className="rounded-2xl bg-[#111827] border border-white/[0.09] shadow-2xl overflow-hidden">
          {/* STAGE 1: CPF IDENTIFICATION */}
          {stage === 'cpf' && (
            <form onSubmit={handleCpfLookup} className="p-6 sm:p-8 space-y-5">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[#C9A86A] font-semibold">
                  {t.auth.stageCpfKicker}
                </div>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  {t.auth.stageCpfTitle}
                </h2>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  {t.auth.stageCpfDesc}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    {t.auth.cpfLabel}
                  </label>
                  <div className="flex items-center gap-2">
                    {rememberedCpf && cpfDigits === rememberedCpf.cpfDigits && (
                      <button
                        type="button"
                        onClick={handleToggleCpfMask}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#E5C88F] transition-colors"
                        title={maskSavedCpf ? t.auth.revealCpf : t.auth.maskCpf}
                      >
                        {maskSavedCpf ? (
                          <>
                            <Eye className="h-3 w-3" />
                            <span>{t.auth.revealCpf}</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3" />
                            <span>{t.auth.maskCpf}</span>
                          </>
                        )}
                      </button>
                    )}
                    {cpfInput.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleClearCpfInput(false)}
                        className="text-[11px] text-slate-400 hover:text-white transition-colors"
                      >
                        {t.auth.clearSwitchCpf}
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={cpfInputRef}
                  type="text"
                  inputMode="numeric"
                  autoFocus={!rememberedCpf}
                  value={isShowingMaskedValue ? rememberedCpf!.maskedCpf : cpfInput}
                  onFocus={() => setIsCpfFocused(true)}
                  onBlur={() => setIsCpfFocused(false)}
                  onChange={(e) => {
                    setCpfInput(formatCPF(e.target.value));
                    setError(null);
                  }}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="w-full px-4 py-3 rounded-xl text-base font-mono tabular-nums tracking-wider bg-[#090D16] border border-white/[0.12] text-white focus:outline-none focus:ring-2 focus:ring-[#C9A86A]/60"
                />

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  {cpfDigits.length === 0 ? (
                    <span className="text-slate-500">
                      {t.auth.cpfHintEmpty}
                    </span>
                  ) : cpfDigits.length < 11 ? (
                    <span className="text-slate-400 font-mono">
                      {cpfDigits.length}/11 {t.auth.cpfDigitsCount}
                    </span>
                  ) : cpfValid ? (
                    <span className="text-emerald-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {rememberedCpf && cpfDigits === rememberedCpf.cpfDigits
                        ? t.auth.cpfRememberedReady
                        : t.auth.cpfValid}
                    </span>
                  ) : (
                    <span className="text-red-400 inline-flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {t.auth.cpfInvalidCheck}
                    </span>
                  )}
                </div>
              </div>

              {lastHint && (
                <div className="p-3.5 rounded-xl bg-[#0D1320] border border-white/[0.08] text-[11px] text-slate-300 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">{t.auth.lastVaultDevice}</span>
                    <span className="font-mono text-[#E5C88F]">{lastHint}</span>
                  </div>
                  {rememberedCpf && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setCpfInput(rememberedCpf.formattedCpf);
                          void runCpfLookup(rememberedCpf.cpfDigits);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#1A2234] text-[#E5C88F] border border-[#C9A86A]/35 hover:bg-[#232D42] transition-colors"
                      >
                        <Lock className="h-3 w-3" />
                        <span>{t.auth.quickAccess}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearCpfInput(true)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>{t.auth.forgetCpf}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !cpfValid}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-[#C9A86A] text-[#090D16] hover:bg-[#D8BA7F] disabled:opacity-40 transition-colors"
              >
                <span>{loading ? t.auth.checkingCpf : t.auth.continueBtn}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* STAGE 2A: EXISTING ACCOUNT LOGIN */}
          {stage === 'login' && lookup && (
            <div className="p-6 sm:p-8 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#C9A86A] font-semibold">
                    {lookup.source === 'offline'
                      ? t.modals.offlineBanner
                      : t.auth.stageCpfKicker}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    {lookup.fullNameHint}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">{lookup.maskedCpf}</span>
                    {renderKycBadge(lookup.kycStatus)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStage('cpf');
                    setError(null);
                  }}
                  className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t.auth.backChangeCpf}
                </button>
              </div>

              {lookup.biometric?.enabled && (
                <div className="p-4 rounded-xl bg-[#0D1320] border border-[#C9A86A]/30 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Fingerprint className="h-5 w-5 text-[#C9A86A]" />
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {t.settings.security.bioTitle}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {lookup.biometric.deviceLabel || t.settings.security.bioActive}
                        </div>
                      </div>
                    </div>
                  </div>

                  {hasLocalBiometricForLookup ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleBiometricLogin}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#C9A86A] text-[#090D16] hover:bg-[#D8BA7F] disabled:opacity-40 transition-colors"
                    >
                      <Fingerprint className="h-4 w-4" />
                      <span>{loading ? t.auth.validatingBio : t.auth.enterWithBio}</span>
                    </button>
                  ) : (
                    <div className="text-[11px] text-amber-300/90 leading-relaxed">
                      {t.settings.security.bioReinstallHint}
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handlePinLogin} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.auth.pinLabel}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus={!hasLocalBiometricForLookup}
                    value={loginPin}
                    onChange={(e) => {
                      setLoginPin(e.target.value.replace(/\D/g, ''));
                      setError(null);
                    }}
                    placeholder="••••••"
                    className="w-full px-4 py-3 rounded-xl text-center text-lg font-mono tracking-[0.45em] bg-[#090D16] border border-white/[0.12] text-white focus:outline-none focus:ring-2 focus:ring-[#C9A86A]/60"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {infoNotice && (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300">
                    {infoNotice}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || loginPin.length < 4}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-white text-[#090D16] hover:bg-slate-100 disabled:opacity-40 transition-colors"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{loading ? t.auth.unlockingAccount : t.auth.enterWithPin}</span>
                </button>
              </form>
            </div>
          )}

          {/* STAGE 2B: NEW ACCOUNT REGISTRATION + KYC + BIOMETRY */}
          {stage === 'register' && lookup && (
            <div className="p-6 sm:p-8 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#C9A86A] font-semibold inline-flex items-center gap-1">
                    <UserPlus className="h-3.5 w-3.5" />
                    {t.auth.newRegKicker} · {t.auth.stepOf3} {regStep} / 3
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    {regStep === 1
                      ? t.auth.step1Title
                      : regStep === 2
                      ? t.auth.step2Title
                      : t.auth.step3Title}
                  </h2>
                  <p className="mt-0.5 text-xs font-mono text-slate-400">
                    CPF {lookup.maskedCpf} · {t.auth.zeroGridTag}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStage('cpf');
                    setError(null);
                    setInfoNotice(null);
                  }}
                  className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t.auth.backChangeCpf}
                </button>
              </div>

              {infoNotice && (
                <div className="p-3 rounded-xl bg-amber-950/35 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
                  {infoNotice}
                </div>
              )}

              {/* Step progress bar */}
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`h-1.5 rounded-full transition-colors ${
                      s <= regStep ? 'bg-[#C9A86A]' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>

              {/* STEP 1: PERSONAL INFO */}
              {regStep === 1 && (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {t.auth.fullNameLabel}
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        setError(null);
                      }}
                      placeholder="Ex.: Thayllon Silva"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#090D16] border border-white/[0.12] text-white focus:outline-none focus:ring-2 focus:ring-[#C9A86A]/60"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        {t.auth.birthDateLabel}
                      </label>
                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => {
                          setBirthDate(e.target.value);
                          setError(null);
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono bg-[#090D16] border border-white/[0.12] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        {t.auth.phoneLabel}
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(00) 90000-0000"
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#090D16] border border-white/[0.12] text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {t.auth.emailLabel}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nome@dominio.com"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#090D16] border border-white/[0.12] text-white"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300">
                      {error}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (fullName.trim().length < 3) {
                        setError('Informe seu nome completo (mínimo 3 caracteres).');
                        return;
                      }
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
                        setError('Informe uma data de nascimento válida.');
                        return;
                      }
                      setError(null);
                      setRegStep(2);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-[#C9A86A] text-[#090D16] hover:bg-[#D8BA7F]"
                  >
                    <span>{t.auth.goToKyc}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* STEP 2: KYC DOCUMENT & LIVENESS */}
              {regStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{t.auth.kycStatusLabel}</span>
                    {renderKycBadge(kycStatus)}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        {t.auth.officialDocLabel}
                      </label>
                      <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value as KycDocumentType)}
                        className="w-full px-3 py-2.5 rounded-xl text-sm bg-[#090D16] border border-white/[0.12] text-white"
                      >
                        <option value="CNH">CNH</option>
                        <option value="RG">RG</option>
                        <option value="CIN">CIN</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        {t.auth.docLast4Label}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={docLast4}
                        onChange={(e) => {
                          setDocLast4(e.target.value.replace(/\D/g, '').slice(0, 4));
                          setError(null);
                        }}
                        placeholder="0000"
                        className="w-full px-3 py-2.5 rounded-xl text-sm font-mono tracking-widest bg-[#090D16] border border-white/[0.12] text-white"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0D1320] border border-white/[0.08] space-y-3">
                    <div className="flex items-start gap-3">
                      <ScanFace className="h-5 w-5 text-[#C9A86A] shrink-0 mt-0.5" />
                      <div className="text-xs text-slate-300 space-y-1">
                        <div className="font-semibold text-white">
                          {t.auth.step2Title}
                        </div>
                        <p className="text-slate-400 leading-relaxed">
                          {t.auth.footerSecurity}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={kycAnimating || kycStatus === 'verified'}
                      onClick={handleRunKycVerification}
                      className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                        kycStatus === 'verified'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                          : 'bg-[#1A2234] hover:bg-[#232D42] text-[#E5C88F] border border-[#C9A86A]/40'
                      }`}
                    >
                      <FileCheck2 className="h-4 w-4" />
                      <span>
                        {kycAnimating
                          ? t.auth.validatingDocBtn
                          : kycStatus === 'verified'
                          ? t.auth.docValidatedBtn
                          : t.auth.validateDocBtn}
                      </span>
                    </button>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300">
                      {error}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setRegStep(1)}
                      className="px-3.5 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/5"
                    >
                      {t.auth.backBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setRegStep(3);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-[#C9A86A] text-[#090D16] hover:bg-[#D8BA7F]"
                    >
                      <span>
                        {kycStatus === 'verified'
                          ? t.auth.goToPinBio
                          : t.auth.continueLaterKyc}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: PIN & BIOMETRICS */}
              {regStep === 3 && (
                <form onSubmit={handleCompleteRegistration} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        {t.auth.regPinLabel}
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={regPin}
                        onChange={(e) => {
                          setRegPin(e.target.value.replace(/\D/g, ''));
                          setError(null);
                        }}
                        placeholder="••••"
                        className="w-full px-3.5 py-2.5 rounded-xl text-center text-base font-mono tracking-[0.35em] bg-[#090D16] border border-white/[0.12] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        {t.auth.confirmPinLabel}
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={regPinConfirm}
                        onChange={(e) => {
                          setRegPinConfirm(e.target.value.replace(/\D/g, ''));
                          setError(null);
                        }}
                        placeholder="••••"
                        className="w-full px-3.5 py-2.5 rounded-xl text-center text-base font-mono tracking-[0.35em] bg-[#090D16] border border-white/[0.12] text-white"
                      />
                    </div>
                  </div>

                  <label className="flex items-start gap-3 p-4 rounded-xl bg-[#0D1320] border border-white/[0.08] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableBiometric}
                      onChange={(e) => setEnableBiometric(e.target.checked)}
                      className="mt-0.5 accent-[#C9A86A]"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-white inline-flex items-center gap-1.5">
                        <Fingerprint className="h-4 w-4 text-[#C9A86A]" />
                        <span>{t.auth.enableBioLabel}</span>
                      </div>
                      <p className="mt-1 text-slate-400 leading-relaxed">
                        {bioAvailability?.native
                          ? `${bioAvailability.label} · ${t.settings.security.bioReady}`
                          : t.settings.security.bioEnableHint}
                      </p>
                    </div>
                  </label>

                  <div className="p-3.5 rounded-xl bg-emerald-950/25 border border-emerald-500/25 text-xs text-emerald-300 flex items-start gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t.auth.zeroStartBanner}</span>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300">
                      {error}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setRegStep(2)}
                      className="px-3.5 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/5"
                    >
                      {t.auth.backBtn}
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-[#C9A86A] text-[#090D16] hover:bg-[#D8BA7F] disabled:opacity-40"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>{loading ? t.auth.creatingVaultBtn : t.auth.finishCreateBtn}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer Security Note */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>{t.auth.footerSecurity}</span>
        </div>
      </div>
    </div>
  );
};
