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
  KeyRound,
  UserCheck,
  Upload,
  RotateCcw,
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
  clearCadastralDraft,
  clearRememberedCpf,
  clearRememberedUsername,
  loadCadastralDraft,
  loadLastCpfHint,
  loadLastCpfPrivacyMask,
  loadRememberedCpf,
  loadRememberedUsername,
  RememberedCpfRecord,
  saveCadastralDraft,
  saveLastCpfPrivacyMask,
  saveRememberedCpf,
  saveRememberedUsername,
  SavedCadastralDraft,
} from '../utils/localVault';
import {
  lookupCpfVault,
  lookupVaultByCpfId,
  loginCpfVault,
  registerCpfVault,
  rehydrateResilientLocalAccount,
  ResilientAccountSummary,
  restoreVaultFromBackupOnLogin,
} from '../utils/vaultApi';
import { RecoverableDeviceBackupInfo } from '../utils/backup';

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
  usernameHint?: string;
  hasPasswordLogin?: boolean;
  kycStatus?: KycStatus;
  biometric?: BiometricConfig;
  source?: 'server' | 'offline' | 'local';
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
  const [authMode, setAuthMode] = useState<'cpf' | 'credentials'>('cpf');
  const [cpfInput, setCpfInput] = useState(() => loadRememberedCpf()?.formattedCpf ?? '');
  const [maskSavedCpf, setMaskSavedCpf] = useState(() => loadLastCpfPrivacyMask());
  const [isCpfFocused, setIsCpfFocused] = useState(false);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [bioAvailability, setBioAvailability] = useState<BiometryAvailabilityInfo | null>(null);
  const cpfInputRef = useRef<HTMLInputElement>(null);

  // Resilient Recovery State (auto-discovered backup or manual 1-click .json import)
  const [recoverableBackup, setRecoverableBackup] = useState<RecoverableDeviceBackupInfo | null>(null);
  const [recoveredAccount, setRecoveredAccount] = useState<ResilientAccountSummary | null>(null);
  const [allLocalAccounts, setAllLocalAccounts] = useState<ResilientAccountSummary[]>([]);
  const [mirrorRecoveredNotice, setMirrorRecoveredNotice] = useState(false);
  const [showJsonRestorePanel, setShowJsonRestorePanel] = useState(false);
  const [restoreJsonText, setRestoreJsonText] = useState<string | null>(null);
  const [restoreFileName, setRestoreFileName] = useState<string>('');
  const [restoreCpfInput, setRestoreCpfInput] = useState(() => loadRememberedCpf()?.formattedCpf ?? '');
  const [restorePinInput, setRestorePinInput] = useState('');
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  // Credentials Login State (Stage 1 & Stage 2)
  const [credUsername, setCredUsername] = useState(() => loadRememberedUsername());
  const [credPassword, setCredPassword] = useState('');
  const [rememberUsername, setRememberUsername] = useState(true);
  const [loginMethod, setLoginMethod] = useState<'pin' | 'password'>('pin');
  const [loginPin, setLoginPin] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register 3-step Wizard State (pre-filled from saved cadastral draft if present)
  const initialDraft = loadCadastralDraft();
  const [draftProfile, setDraftProfile] = useState<SavedCadastralDraft | null>(initialDraft);
  const [hasPrefilledDraft, setHasPrefilledDraft] = useState(() => Boolean(initialDraft?.fullName));
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState(() => initialDraft?.fullName ?? '');
  const [birthDate, setBirthDate] = useState(() => initialDraft?.birthDate ?? '');
  const [email, setEmail] = useState(() => initialDraft?.email ?? '');
  const [phone, setPhone] = useState(() => initialDraft?.phone ?? '');

  // KYC Step State
  const [docType, setDocType] = useState<KycDocumentType>(() => initialDraft?.kycDocumentType ?? 'CNH');
  const [docLast4, setDocLast4] = useState(() => initialDraft?.kycDocumentLast4 ?? '');
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

    rehydrateResilientLocalAccount()
      .then((scan) => {
        if (!active) return;
        const refreshedCpf = loadRememberedCpf();
        const refreshedDraft = loadCadastralDraft();
        const refreshedUser = loadRememberedUsername();
        if (refreshedCpf) {
          setRememberedCpf(refreshedCpf);
          setCpfInput((prev) => prev || refreshedCpf.formattedCpf);
          setRestoreCpfInput((prev) => prev || refreshedCpf.formattedCpf);
        }
        if (refreshedDraft) {
          setDraftProfile(refreshedDraft);
        }
        if (refreshedUser) {
          setCredUsername((prev) => prev || refreshedUser);
        }
        if (scan.existingAccount) {
          setRecoveredAccount(scan.existingAccount);
        }
        if (scan.allAccounts.length > 0) {
          setAllLocalAccounts(scan.allAccounts);
        }
        if (scan.recoveredFromMirror) {
          setMirrorRecoveredNotice(true);
        }
        if (!scan.existingAccount && scan.recoverableBackup) {
          setRecoverableBackup(scan.recoverableBackup);
        }
      })
      .catch(() => {
        // Resilient scan stays silent on error
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
  const [regUsername, setRegUsername] = useState(() => initialDraft?.username ?? '');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');
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
        setLoginPassword('');
        setLoginMethod('pin');
        setStage('login');
      } else {
        const draft = loadCadastralDraft();
        if (draft) {
          setFullName((prev) => prev || draft.fullName);
          setBirthDate((prev) => prev || draft.birthDate);
          setEmail((prev) => prev || draft.email || '');
          setPhone((prev) => prev || draft.phone || '');
          setRegUsername((prev) => prev || draft.username || '');
          if (draft.kycDocumentType) setDocType(draft.kycDocumentType);
          if (draft.kycDocumentLast4) setDocLast4((prev) => prev || draft.kycDocumentLast4 || '');
          setHasPrefilledDraft(Boolean(draft.fullName));
        }
        setRegStep(1);
        setKycStatus('pending');
        setStage('register');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível verificar os dados informados.');
    } finally {
      setLoading(false);
    }
  };

  const runCpfIdLookup = async (cpfIdToLookup: string) => {
    setError(null);
    setInfoNotice(null);
    setLoading(true);
    try {
      const data = await lookupVaultByCpfId(cpfIdToLookup);
      if (!data.exists) {
        setError('Conta não encontrada neste aparelho. Informe seu CPF ou crie um novo cofre.');
        return;
      }
      setLookup(data as LookupResult);
      setLoginPin('');
      setLoginPassword('');
      setLoginMethod('pin');
      setStage('login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o cofre salvo.');
    } finally {
      setLoading(false);
    }
  };

  const persistSessionProfileCadastral = (profile: UserProfile) => {
    const savedDraft = saveCadastralDraft({
      fullName: profile.fullName,
      birthDate: profile.birthDate,
      email: profile.email,
      phone: profile.phone,
      username: profile.username,
      kycDocumentType: profile.kycDocumentType,
      kycDocumentLast4: profile.kycDocumentLast4,
    });
    if (savedDraft) setDraftProfile(savedDraft);
    if (profile.username && rememberUsername) {
      saveRememberedUsername(profile.username);
    }
  };

  const handleRestoreJsonFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      setRestoreJsonText(text);
      setRestoreFileName(file.name);
      setShowJsonRestorePanel(true);
    } catch {
      setError('Não foi possível ler o arquivo .json selecionado.');
    }
  };

  const handleExecuteBackupRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    const payloadJson = restoreJsonText || recoverableBackup?.payloadJson;
    if (!payloadJson) {
      setError('Selecione um arquivo de backup .json válido.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await restoreVaultFromBackupOnLogin({
        jsonText: payloadJson,
        cpf: restoreCpfInput,
        pin: restorePinInput,
        fullName: recoverableBackup?.fullName,
      });
      const saved = saveRememberedCpf(restoreCpfInput);
      if (saved) setRememberedCpf(saved);
      persistSessionProfileCadastral(res.profile);
      onAuthenticated({
        token: res.token,
        cpfId: res.profile.cpfId,
        profile: res.profile,
        biometric: res.biometric,
        appState: res.appState,
        restoredFromServer: false,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao restaurar backup JSON.');
    } finally {
      setLoading(false);
    }
  };

  const handleCpfLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    await runCpfLookup(cpfDigits);
  };

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanUser = credUsername.trim().toLowerCase();
    if (cleanUser.length < 3) {
      setError('Informe seu nome de usuário cadastrado.');
      return;
    }
    if (credPassword.length < 4) {
      setError('Informe sua senha de acesso.');
      return;
    }

    setLoading(true);
    try {
      const data = await loginCpfVault({
        username: cleanUser,
        method: 'password',
        password: credPassword,
      });

      if (rememberUsername) {
        saveRememberedUsername(cleanUser);
      } else {
        clearRememberedUsername();
      }
      persistSessionProfileCadastral(data.profile);

      onAuthenticated({
        token: data.token,
        cpfId: data.profile.cpfId,
        profile: data.profile,
        biometric: data.biometric,
        appState: data.appState,
        restoredFromServer: data.source === 'server',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Usuário ou senha inválidos.');
    } finally {
      setLoading(false);
    }
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

  const handlePinOrPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookup) return;
    setError(null);

    if (loginMethod === 'password') {
      if (loginPassword.length < 4) {
        setError('Digite sua senha de acesso.');
        return;
      }
      setLoading(true);
      try {
        const data = await loginCpfVault({
          cpf: isValidCPF(cpfDigits) ? cpfDigits : undefined,
          cpfId: lookup.cpfId,
          method: 'password',
          password: loginPassword,
        });
        const refreshedSaved = isValidCPF(cpfDigits)
          ? saveRememberedCpf(cpfDigits)
          : loadRememberedCpf();
        if (refreshedSaved) setRememberedCpf(refreshedSaved);
        persistSessionProfileCadastral(data.profile);
        onAuthenticated({
          token: data.token,
          cpfId: data.profile.cpfId,
          profile: data.profile,
          biometric: data.biometric,
          appState: data.appState,
          restoredFromServer: data.source === 'server',
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Senha incorreta.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!/^\d{4,6}$/.test(loginPin.trim())) {
      setError('Digite seu PIN de 4 a 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const data = await loginCpfVault({
        cpf: isValidCPF(cpfDigits) ? cpfDigits : undefined,
        cpfId: lookup.cpfId,
        method: 'pin',
        pin: loginPin.trim(),
      });

      const refreshedSaved = isValidCPF(cpfDigits)
        ? saveRememberedCpf(cpfDigits)
        : loadRememberedCpf();
      if (refreshedSaved) setRememberedCpf(refreshedSaved);
      persistSessionProfileCadastral(data.profile);
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
          'Credencial biométrica não encontrada neste dispositivo. Entre com seu PIN para reativar a biometria.'
        );
        setLoading(false);
        return;
      }

      const data = await loginCpfVault({
        cpf: isValidCPF(cpfDigits) ? cpfDigits : undefined,
        cpfId: lookup.cpfId,
        method: 'biometric',
        credentialId: proof.credentialId,
        deviceKey: proof.deviceKey,
      });

      const refreshedSaved = isValidCPF(cpfDigits)
        ? saveRememberedCpf(cpfDigits)
        : loadRememberedCpf();
      if (refreshedSaved) setRememberedCpf(refreshedSaved);
      persistSessionProfileCadastral(data.profile);
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
    if (regPassword && regPassword.length < 6) {
      setError('A senha de acesso deve conter no mínimo 6 caracteres.');
      return;
    }
    if (regPassword && regPassword !== regPasswordConfirm) {
      setError('A confirmação da senha não confere.');
      return;
    }
    if (regPassword && !regUsername.trim()) {
      setError('Informe um nome de usuário para ativar o login por Usuário e Senha.');
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
        username: regUsername.trim() || undefined,
        password: regPassword || undefined,
        kycStatus,
        kycDocumentType: docType,
        kycDocumentLast4: docLast4.replace(/\D/g, '').slice(-4),
        pin: regPin.trim(),
        biometric: biometricPayload,
        appState: cleanState,
      });

      const saved = saveRememberedCpf(cpfDigits);
      if (saved) setRememberedCpf(saved);
      persistSessionProfileCadastral(data.profile);
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
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3" />
          {t.settings.security.verified} (KYC)
        </span>
      );
    }
    if (status === 'under_review') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
          <RefreshCw className="h-3 w-3 animate-spin" />
          {t.settings.security.underReview}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10">
        <Clock className="h-3 w-3" />
        {t.settings.security.pending}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#090D16] text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center px-safe sm:p-6 pt-safe-screen pb-safe-nav">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center">
            <img
              src="/orbe-logo-dark.png"
              alt="ORBE Finanças"
              className="h-16 w-16 object-contain dark:hidden"
            />
            <img
              src="/orbe-logo.png"
              alt="ORBE Finanças"
              className="hidden h-16 w-16 object-contain dark:block"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            ORBE Finanças
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t.auth.brandSubtitle}
          </p>
        </div>

        {/* Main Card */}
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.09] shadow-xl overflow-hidden">
          {/* STAGE 1: CPF OR USERNAME+PASSWORD IDENTIFICATION */}
          {stage === 'cpf' && (
            <div className="p-6 sm:p-8 space-y-5">
              {(rememberedCpf || credUsername || draftProfile?.fullName || recoveredAccount) && (
                <div className="p-4 rounded-xl bg-blue-50/80 dark:bg-[#0D1320] border border-blue-200 dark:border-blue-500/30 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white text-xs font-bold shrink-0">
                        {(
                          recoveredAccount?.fullName ||
                          draftProfile?.fullName ||
                          credUsername ||
                          'OR'
                        )
                          .trim()
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-blue-700 dark:text-blue-400">
                          Conta lembrada neste aparelho
                        </div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {recoveredAccount?.fullName ||
                            draftProfile?.fullName ||
                            (credUsername ? `@${credUsername}` : 'Titular cadastrado')}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {(rememberedCpf?.maskedCpf || recoveredAccount?.maskedCpf) && (
                            <span>{rememberedCpf?.maskedCpf || recoveredAccount?.maskedCpf}</span>
                          )}
                          {(credUsername || recoveredAccount?.username || draftProfile?.username) && (
                            <span className="text-blue-600 dark:text-blue-400">
                              @{credUsername || recoveredAccount?.username || draftProfile?.username}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleClearCpfInput(true);
                        clearRememberedUsername();
                        setCredUsername('');
                        setDraftProfile(null);
                        setRecoveredAccount(null);
                      }}
                      className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                    >
                      Trocar conta
                    </button>
                  </div>

                  {mirrorRecoveredNotice && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                      Conta e dados locais preservados e recuperados automaticamente neste aparelho.
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      if (rememberedCpf) {
                        setAuthMode('cpf');
                        setCpfInput(rememberedCpf.formattedCpf);
                        void runCpfLookup(rememberedCpf.cpfDigits);
                      } else if (recoveredAccount?.cpfId) {
                        setAuthMode('cpf');
                        void runCpfIdLookup(recoveredAccount.cpfId);
                      } else {
                        setAuthMode('credentials');
                      }
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    <UserCheck className="h-4 w-4" />
                    <span>
                      {rememberedCpf || recoveredAccount?.cpfId
                        ? 'Acessar Cofre Agora (PIN / Biometria)'
                        : 'Entrar com Usuário Lembrado'}
                    </span>
                  </button>

                  {allLocalAccounts.length > 1 && (
                    <div className="pt-2 border-t border-blue-200/70 dark:border-white/[0.08] space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                        Outras contas salvas neste dispositivo
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {allLocalAccounts.slice(0, 4).map((acc) => (
                          <button
                            key={acc.cpfId}
                            type="button"
                            disabled={loading}
                            onClick={() => {
                              if (acc.cpfDigits) {
                                setCpfInput(formatCPF(acc.cpfDigits));
                                void runCpfLookup(acc.cpfDigits);
                              } else {
                                void runCpfIdLookup(acc.cpfId);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] bg-white dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-slate-200 hover:border-blue-400"
                          >
                            {acc.fullName.split(' ')[0]} · {acc.maskedCpf}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {recoverableBackup && !rememberedCpf && (
                <div className="p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-500/35 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <RotateCcw className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          Backup local detectado neste dispositivo
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300">
                          {recoverableBackup.fullName}
                          {recoverableBackup.maskedCpf ? ` · ${recoverableBackup.maskedCpf}` : ''} ·{' '}
                          {new Date(recoverableBackup.savedAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRestoreJsonText(recoverableBackup.payloadJson);
                        setRestoreFileName('Backup Automático Local');
                        setShowJsonRestorePanel(true);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shrink-0"
                    >
                      Restaurar em 1 clique
                    </button>
                  </div>
                </div>
              )}

              <div>
                <div className="text-[11px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">
                  {t.auth.stageCpfKicker}
                </div>
                <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {authMode === 'credentials' ? 'Entrar com Usuário e Senha' : t.auth.stageCpfTitle}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {authMode === 'credentials'
                    ? 'Use seu nome de usuário e senha salvos no cofre ou no gerenciador de senhas do dispositivo.'
                    : t.auth.stageCpfDesc}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('cpf');
                    setError(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                    authMode === 'cpf'
                      ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  CPF (Biometria / PIN)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('credentials');
                    setError(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                    authMode === 'credentials'
                      ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Usuário e Senha</span>
                </button>
              </div>

              {authMode === 'cpf' ? (
                <form onSubmit={handleCpfLookup} className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {t.auth.cpfLabel}
                      </label>
                      <div className="flex items-center gap-2">
                        {rememberedCpf && cpfDigits === rememberedCpf.cpfDigits && (
                          <button
                            type="button"
                            onClick={handleToggleCpfMask}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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
                            className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
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
                      className="w-full px-4 py-3 rounded-xl text-base font-mono tabular-nums tracking-wider bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />

                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      {cpfDigits.length === 0 ? (
                        <span className="text-slate-500">
                          {t.auth.cpfHintEmpty}
                        </span>
                      ) : cpfDigits.length < 11 ? (
                        <span className="text-slate-500 dark:text-slate-400 font-mono">
                          {cpfDigits.length}/11 {t.auth.cpfDigitsCount}
                        </span>
                      ) : cpfValid ? (
                        <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {rememberedCpf && cpfDigits === rememberedCpf.cpfDigits
                            ? t.auth.cpfRememberedReady
                            : t.auth.cpfValid}
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {t.auth.cpfInvalidCheck}
                        </span>
                      )}
                    </div>
                  </div>

                  {lastHint && (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-[11px] text-slate-600 dark:text-slate-300 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">{t.auth.lastVaultDevice}</span>
                        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{lastHint}</span>
                      </div>
                      {rememberedCpf && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                              setCpfInput(rememberedCpf.formattedCpf);
                              void runCpfLookup(rememberedCpf.cpfDigits);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-[#1A2234] text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/35 hover:bg-blue-100/80 dark:hover:bg-[#232D42] transition-colors"
                          >
                            <Lock className="h-3 w-3" />
                            <span>{t.auth.quickAccess}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleClearCpfInput(true)}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>{t.auth.forgetCpf}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !cpfValid}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    <span>{loading ? t.auth.checkingCpf : t.auth.continueBtn}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleCredentialsLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Usuário
                    </label>
                    <input
                      type="text"
                      name="username"
                      autoComplete="username"
                      value={credUsername}
                      onChange={(e) => {
                        setCredUsername(e.target.value);
                        setError(null);
                      }}
                      placeholder="seu.usuario"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Senha
                    </label>
                    <input
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      value={credPassword}
                      onChange={(e) => {
                        setCredPassword(e.target.value);
                        setError(null);
                      }}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>

                  <label className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <span>Lembrar usuário neste dispositivo</span>
                    <input
                      type="checkbox"
                      checked={rememberUsername}
                      onChange={(e) => setRememberUsername(e.target.checked)}
                      className="accent-blue-600"
                    />
                  </label>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || credUsername.trim().length < 3 || credPassword.length < 4}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    <Lock className="h-4 w-4" />
                    <span>{loading ? t.auth.unlockingAccount : 'Entrar com Usuário e Senha'}</span>
                  </button>
                </form>
              )}

              {/* 1-Click Local Backup / .json Recovery */}
              <div className="pt-3 border-t border-slate-200/80 dark:border-white/[0.08] space-y-3">
                <input
                  ref={restoreFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreJsonFilePick}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowJsonRestorePanel((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>
                      {showJsonRestorePanel
                        ? 'Ocultar restauração de backup (.json)'
                        : 'Restaurar backup anterior (.json) sem criar nova conta'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => restoreFileInputRef.current?.click()}
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Selecionar .json
                  </button>
                </div>

                {showJsonRestorePanel && (
                  <form
                    onSubmit={handleExecuteBackupRestore}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        Restauração rápida de backup
                      </span>
                      <button
                        type="button"
                        onClick={() => restoreFileInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-slate-200"
                      >
                        {restoreFileName ? `Arquivo: ${restoreFileName}` : 'Escolher arquivo .json'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          CPF do titular
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={14}
                          value={restoreCpfInput}
                          onChange={(e) => setRestoreCpfInput(formatCPF(e.target.value))}
                          placeholder="000.000.000-00"
                          className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-white dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          PIN do cofre (4–6 dígitos)
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={restorePinInput}
                          onChange={(e) => setRestorePinInput(e.target.value.replace(/\D/g, ''))}
                          placeholder="••••"
                          className="w-full px-3 py-2 rounded-lg text-xs font-mono tracking-widest bg-white dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        loading ||
                        (!restoreJsonText && !recoverableBackup?.payloadJson) ||
                        !isValidCPF(cleanCPF(restoreCpfInput)) ||
                        restorePinInput.length < 4
                      }
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Restaurar Dados e Acessar Agora</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* STAGE 2A: EXISTING ACCOUNT LOGIN */}
          {stage === 'login' && lookup && (
            <div className="p-6 sm:p-8 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">
                    {t.auth.stageCpfKicker}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    {lookup.fullNameHint}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{lookup.maskedCpf}</span>
                    {lookup.usernameHint && (
                      <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                        @{lookup.usernameHint}
                      </span>
                    )}
                    {renderKycBadge(lookup.kycStatus)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStage('cpf');
                    setError(null);
                  }}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t.auth.backChangeCpf}
                </button>
              </div>

              {lookup.biometric?.enabled && (
                <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-[#0D1320] border border-blue-200 dark:border-blue-500/30 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Fingerprint className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          {t.settings.security.bioTitle}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
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
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                    >
                      <Fingerprint className="h-4 w-4" />
                      <span>{loading ? t.auth.validatingBio : t.auth.enterWithBio}</span>
                    </button>
                  ) : (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300/90 leading-relaxed">
                      {t.settings.security.bioReinstallHint}
                    </div>
                  )}
                </div>
              )}

              {lookup.hasPasswordLogin && (
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('pin');
                      setError(null);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      loginMethod === 'pin'
                        ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Entrar com PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('password');
                      setError(null);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      loginMethod === 'password'
                        ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Entrar com Senha
                  </button>
                </div>
              )}

              <form onSubmit={handlePinOrPasswordLogin} className="space-y-3">
                {lookup.usernameHint && (
                  <input
                    type="text"
                    readOnly
                    value={lookup.usernameHint}
                    autoComplete="username"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                  />
                )}

                {loginMethod === 'password' && lookup.hasPasswordLogin ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Senha de Acesso {lookup.usernameHint ? `(@${lookup.usernameHint})` : ''}
                    </label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      autoFocus={!hasLocalBiometricForLookup}
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        setError(null);
                      }}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 rounded-xl text-sm bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
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
                      className="w-full px-4 py-3 rounded-xl text-center text-lg font-mono tracking-[0.45em] bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {infoNotice && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
                    {infoNotice}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    loading ||
                    (loginMethod === 'password' ? loginPassword.length < 4 : loginPin.length < 4)
                  }
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-[#090D16] hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-40 transition-colors"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>
                    {loading
                      ? t.auth.unlockingAccount
                      : loginMethod === 'password'
                      ? 'Entrar com Senha'
                      : t.auth.enterWithPin}
                  </span>
                </button>
              </form>
            </div>
          )}

          {/* STAGE 2B: NEW ACCOUNT REGISTRATION + KYC + BIOMETRY */}
          {stage === 'register' && lookup && (
            <div className="p-6 sm:p-8 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold inline-flex items-center gap-1">
                    <UserPlus className="h-3.5 w-3.5" />
                    {t.auth.newRegKicker} · {t.auth.stepOf3} {regStep} / 3
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    {regStep === 1
                      ? t.auth.step1Title
                      : regStep === 2
                      ? t.auth.step2Title
                      : t.auth.step3Title}
                  </h2>
                  <p className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
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
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t.auth.backChangeCpf}
                </button>
              </div>

              {infoNotice && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                  {infoNotice}
                </div>
              )}

              {/* Step progress bar */}
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`h-1.5 rounded-full transition-colors ${
                      s <= regStep ? 'bg-blue-600' : 'bg-slate-200 dark:bg-white/10'
                    }`}
                  />
                ))}
              </div>

              {/* STEP 1: PERSONAL INFO */}
              {regStep === 1 && (
                <div className="space-y-3.5">
                  {hasPrefilledDraft && (
                    <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-500/30 flex items-center justify-between gap-2 text-[11px] text-blue-800 dark:text-blue-200">
                      <span className="inline-flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 shrink-0" />
                        <span>Dados cadastrais pré-preenchidos do rascunho seguro deste aparelho.</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          clearCadastralDraft();
                          setHasPrefilledDraft(false);
                          setFullName('');
                          setBirthDate('');
                          setEmail('');
                          setPhone('');
                          setRegUsername('');
                          setDocLast4('');
                        }}
                        className="font-semibold underline shrink-0"
                      >
                        Limpar
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t.auth.birthDateLabel}
                      </label>
                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => {
                          setBirthDate(e.target.value);
                          setError(null);
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t.auth.phoneLabel}
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(00) 90000-0000"
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t.auth.emailLabel}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nome@dominio.com"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300">
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
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
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
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t.auth.kycStatusLabel}</span>
                    {renderKycBadge(kycStatus)}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t.auth.officialDocLabel}
                      </label>
                      <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value as KycDocumentType)}
                        className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                      >
                        <option value="CNH">CNH</option>
                        <option value="RG">RG</option>
                        <option value="CIN">CIN</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                        className="w-full px-3 py-2.5 rounded-xl text-sm font-mono tracking-widest bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-3">
                    <div className="flex items-start gap-3">
                      <ScanFace className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {t.auth.step2Title}
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
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
                          ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 cursor-default'
                          : 'bg-blue-50 dark:bg-[#1A2234] hover:bg-blue-100/80 dark:hover:bg-[#232D42] text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/40'
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
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300">
                      {error}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setRegStep(1)}
                      className="px-3.5 py-2.5 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      {t.auth.backBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setRegStep(3);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
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
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                        className="w-full px-3.5 py-2.5 rounded-xl text-center text-base font-mono tracking-[0.35em] bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                        className="w-full px-3.5 py-2.5 rounded-xl text-center text-base font-mono tracking-[0.35em] bg-slate-50 dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                      <KeyRound className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Login por Usuário e Senha (opcional)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          Usuário
                        </label>
                        <input
                          type="text"
                          name="username"
                          autoComplete="username"
                          value={regUsername}
                          onChange={(e) => {
                            setRegUsername(e.target.value);
                            setError(null);
                          }}
                          placeholder="ex.: thayllon"
                          className="w-full px-3 py-2 rounded-lg text-xs bg-white dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          Senha (mín. 6)
                        </label>
                        <input
                          type="password"
                          name="new-password"
                          autoComplete="new-password"
                          value={regPassword}
                          onChange={(e) => {
                            setRegPassword(e.target.value);
                            setError(null);
                          }}
                          placeholder="••••••"
                          className="w-full px-3 py-2 rounded-lg text-xs bg-white dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          Confirmar senha
                        </label>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={regPasswordConfirm}
                          onChange={(e) => {
                            setRegPasswordConfirm(e.target.value);
                            setError(null);
                          }}
                          placeholder="••••••"
                          className="w-full px-3 py-2 rounded-lg text-xs bg-white dark:bg-[#090D16] border border-slate-300 dark:border-white/[0.12] text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <label className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableBiometric}
                      onChange={(e) => setEnableBiometric(e.target.checked)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                        <Fingerprint className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span>{t.auth.enableBioLabel}</span>
                      </div>
                      <p className="mt-1 text-slate-500 dark:text-slate-400 leading-relaxed">
                        {bioAvailability?.native
                          ? `${bioAvailability.label} · ${t.settings.security.bioReady}`
                          : t.settings.security.bioEnableHint}
                      </p>
                    </div>
                  </label>

                  <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-500/25 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t.auth.zeroStartBanner}</span>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300">
                      {error}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setRegStep(2)}
                      className="px-3.5 py-2.5 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      {t.auth.backBtn}
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
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
