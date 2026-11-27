import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Sliders,
  Shield,
  Target,
  Plus,
  Trash2,
  Upload,
  RotateCcw,
  Eye,
  ArrowUp,
  ArrowDown,
  FileDown,
  Fingerprint,
  CheckCircle2,
  Clock,
  RefreshCw,
  FileCheck2,
  Database,
  KeyRound,
  AlertCircle,
  Globe,
  UserCheck,
  FileSpreadsheet,
  Mic,
  Wifi,
  FolderCheck,
  ExternalLink,
} from 'lucide-react';
import {
  AlertItem,
  AppSettings,
  AppState,
  AutoRule,
  BiometricConfig,
  BlockType,
  CategoryRow,
  KycDocumentType,
  KycStatus,
  MatrixTotals,
  SavingsGoal,
  UserProfile,
} from '../types/finance';
import { computeGoalProgress, formatBRL, formatCompactDay } from '../utils/financeEngine';
import {
  getIntlLocale,
  getMonthNamesFull,
  getTranslations,
  LANGUAGE_OPTIONS,
  normalizeLanguage,
  translateGoalStatus,
} from '../utils/i18n';
import {
  enrollBiometricForCpf,
  getLocalBiometricHandle,
  verifyBiometricOnDevice,
} from '../utils/biometrics';
import {
  fetchLatestServerBackup,
  unlockCpfVault,
  updateVaultKyc,
  updateVaultProfile,
  updateVaultSecurity,
} from '../utils/vaultApi';
import {
  clearCadastralDraft,
  clearRememberedCpf,
  loadLastCpfPrivacyMask,
  loadRememberedCpf,
  saveCadastralDraft,
  saveLastCpfPrivacyMask,
} from '../utils/localVault';
import {
  AutoBackupSnapshot,
  AutoBackupStatus,
  listAutoBackupSnapshots,
  parseBackupSnapshotState,
} from '../utils/backup';
import {
  AppPermissionKind,
  AppPermissionStatus,
  getPermissionsSnapshot,
  isAndroidNativeApp,
  openNativeAppSettings,
  PermissionsSnapshot,
  requestAppPermission,
} from '../utils/permissions';

interface SettingsViewProps {
  state: AppState;
  totals: MatrixTotals;
  alerts: AlertItem[];
  authToken: string;
  profile: UserProfile;
  biometric: BiometricConfig;
  initialSubTab?: 'monitoring' | 'goals' | 'grid' | 'security';
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onAddRule: (rule: Omit<AutoRule, 'id'>) => void;
  onToggleRule: (ruleId: string) => void;
  onDeleteRule: (ruleId: string) => void;
  onUpdateRow: (rowId: string, patch: Partial<CategoryRow>) => void;
  onAddRow: (row: Omit<CategoryRow, 'id' | 'order'>) => void;
  onMoveRow: (rowId: string, direction: 'up' | 'down') => void;
  onAddGoal: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => void;
  onUpdateGoal: (goalId: string, patch: Partial<SavingsGoal>) => void;
  onDeleteGoal: (goalId: string) => void;
  onExportPDF: () => void;
  onExportJSON: () => void;
  onOpenReportsModal: (mode: 'export' | 'import') => void;
  onLoadDemo2026Data: () => void;
  onClearOperationalData: () => void;
  onImportBackup: (imported: AppState) => void;
  onProfileUpdated: (profile: UserProfile) => void;
  onBiometricUpdated: (biometric: BiometricConfig) => void;
  onTestReinstallRecovery: () => void;
  autoBackupStatus: AutoBackupStatus | null;
  onRunManualBackupNow: () => Promise<void>;
  onShareOrDownloadBackup: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  state,
  totals,
  alerts,
  authToken,
  profile,
  biometric,
  initialSubTab = 'monitoring',
  onUpdateSettings,
  onAddRule,
  onToggleRule,
  onDeleteRule,
  onUpdateRow,
  onAddRow,
  onMoveRow,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onExportPDF,
  onExportJSON,
  onOpenReportsModal,
  onLoadDemo2026Data,
  onClearOperationalData,
  onImportBackup,
  onProfileUpdated,
  onBiometricUpdated,
  onTestReinstallRecovery,
  autoBackupStatus,
  onRunManualBackupNow,
  onShareOrDownloadBackup,
}) => {
  const [activeTab, setActiveTab] = useState<'monitoring' | 'goals' | 'grid' | 'security'>(
    initialSubTab
  );
  const [rememberedCpfInfo, setRememberedCpfInfo] = useState(() => loadRememberedCpf());
  const [maskSavedCpfOnLogin, setMaskSavedCpfOnLogin] = useState(() =>
    loadLastCpfPrivacyMask()
  );

  useEffect(() => {
    setActiveTab(initialSubTab);
  }, [initialSubTab]);

  const [newKeyword, setNewKeyword] = useState('');
  const [newRuleRowId, setNewRuleRowId] = useState('var-mercado');
  const [newRowName, setNewRowName] = useState('');
  const [newRowBlock, setNewRowBlock] = useState<BlockType>('variable');
  const [newRowDay, setNewRowDay] = useState('');

  // Confirmation toggles for data actions
  const [confirmLoadDemo, setConfirmLoadDemo] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Security / PIN / Biometry / KYC states
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [secFeedback, setSecFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [secBusy, setSecBusy] = useState(false);

  const [kycDocType, setKycDocType] = useState<KycDocumentType>(profile.kycDocumentType ?? 'CNH');
  const [kycDocLast4, setKycDocLast4] = useState(profile.kycDocumentLast4 ?? '');
  const [kycBusy, setKycBusy] = useState(false);

  // Pre-saved Cadastral Profile state
  const [profName, setProfName] = useState(profile.fullName);
  const [profBirthDate, setProfBirthDate] = useState(profile.birthDate);
  const [profEmail, setProfEmail] = useState(profile.email ?? '');
  const [profPhone, setProfPhone] = useState(profile.phone ?? '');
  const [profUsername, setProfUsername] = useState(profile.username ?? '');

  // Credentials (Username + Password) state
  const [credUsername, setCredUsername] = useState(profile.username ?? '');
  const [credChallenge, setCredChallenge] = useState('');
  const [credNewPassword, setCredNewPassword] = useState('');
  const [credConfirmPassword, setCredConfirmPassword] = useState('');

  // Backup snapshots (24h auto + manual + server)
  const [localSnapshots, setLocalSnapshots] = useState<AutoBackupSnapshot[]>([]);
  const [serverSnapshots, setServerSnapshots] = useState<
    Array<{
      id: string;
      savedAt: string;
      source: 'auto_24h' | 'manual';
      sizeBytes: number;
      state: AppState;
    }>
  >([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const kycTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    setProfName(profile.fullName);
    setProfBirthDate(profile.birthDate);
    setProfEmail(profile.email ?? '');
    setProfPhone(profile.phone ?? '');
    setProfUsername(profile.username ?? '');
    setCredUsername(profile.username ?? '');
  }, [profile]);

  const reloadSnapshots = async () => {
    try {
      const localList = await listAutoBackupSnapshots(profile.cpfId);
      if (isMountedRef.current) setLocalSnapshots(localList);
    } catch {
      // Ignore
    }
    try {
      const srv = await fetchLatestServerBackup(authToken);
      if (isMountedRef.current && Array.isArray(srv.snapshots)) {
        setServerSnapshots(srv.snapshots);
      }
    } catch {
      // Ignore
    }
  };

  const [permissionsSnapshot, setPermissionsSnapshot] = useState<PermissionsSnapshot | null>(null);
  const [permBusy, setPermBusy] = useState(false);

  const reloadPermissions = async () => {
    try {
      const snap = await getPermissionsSnapshot();
      if (isMountedRef.current) setPermissionsSnapshot(snap);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    if (activeTab === 'security') {
      void reloadSnapshots();
      void reloadPermissions();
    }
  }, [activeTab, profile.cpfId, autoBackupStatus?.lastAutoBackupAt]);

  const handleRequestPermissionItem = async (kind: AppPermissionKind | 'all') => {
    setPermBusy(true);
    try {
      const next = await requestAppPermission(kind);
      if (isMountedRef.current) setPermissionsSnapshot(next);
    } finally {
      if (isMountedRef.current) setPermBusy(false);
    }
  };

  const renderPermissionBadge = (status: AppPermissionStatus) => {
    if (status === 'granted') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          Concedida
        </span>
      );
    }
    if (status === 'denied') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30">
          Negada
        </span>
      );
    }
    if (status === 'unsupported') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400">
          Indisponível
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
        Pendente
      </span>
    );
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (kycTimerRef.current !== null) {
        window.clearTimeout(kycTimerRef.current);
      }
    };
  }, []);

  // Goal Form State
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('10000');
  const [goalMonth, setGoalMonth] = useState(11);
  const [goalMode, setGoalMode] = useState<SavingsGoal['trackingMode']>('result');

  const { settings, rows, rules, goals } = state;
  const lang = normalizeLanguage(settings.language);
  const t = getTranslations(lang);
  const monthNamesFull = getMonthNamesFull(lang);
  const [langNotice, setLangNotice] = useState<string | null>(null);
  const visibleRows = rows.filter((r) => !r.hidden);
  const recurringRows = rows.filter((r) => r.isRecurring && !r.hidden);

  useEffect(() => {
    if (visibleRows.length > 0 && !visibleRows.some((r) => r.id === newRuleRowId)) {
      setNewRuleRowId(visibleRows[0].id);
    }
  }, [rows, newRuleRowId]);

  const hasLocalBiometric = Boolean(
    biometric.enabled &&
      getLocalBiometricHandle(profile.cpfId)?.credentialId === biometric.credentialId
  );

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    onAddRule({
      keyword: newKeyword.trim().toLowerCase(),
      targetRowId: newRuleRowId,
      enabled: true,
    });
    setNewKeyword('');
  };

  const handleCreateRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRowName.trim()) return;
    const d = parseInt(newRowDay, 10);
    onAddRow({
      name: newRowName.trim().toUpperCase(),
      block: newRowBlock,
      refDay: !isNaN(d) && d >= 1 && d <= 31 ? d : undefined,
    });
    setNewRowName('');
    setNewRowDay('');
  };

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedTarget = parseFloat(goalTarget.replace(',', '.'));
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) return;
    const safeGoalMonth = Math.min(11, Math.max(0, Number.isFinite(goalMonth) ? Math.trunc(goalMonth) : 11));

    onAddGoal({
      title:
        goalTitle.trim() ||
        `${formatBRL(parsedTarget)} · ${monthNamesFull[safeGoalMonth]}`,
      targetAmount: Number(parsedTarget.toFixed(2)),
      deadlineMonth: safeGoalMonth,
      deadlineYear: settings.activeYear,
      trackingMode: goalMode,
    });

    setGoalTitle('');
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rawParsed = JSON.parse(String(reader.result || '')) as
          | Partial<AppState>
          | { state?: Partial<AppState> };
        const parsed: Partial<AppState> =
          rawParsed &&
          typeof rawParsed === 'object' &&
          'state' in rawParsed &&
          rawParsed.state &&
          typeof rawParsed.state === 'object'
            ? rawParsed.state
            : (rawParsed as Partial<AppState>);

        if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.entries) || !parsed.settings) {
          throw new Error(t.settings.security.msgJsonInvalid);
        }
        onImportBackup({
          rows: parsed.rows,
          entries: parsed.entries,
          accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
          creditCards: Array.isArray(parsed.creditCards) ? parsed.creditCards : [],
          cardPurchases: Array.isArray(parsed.cardPurchases) ? parsed.cardPurchases : [],
          paidCardInvoices:
            parsed.paidCardInvoices && typeof parsed.paidCardInvoices === 'object'
              ? parsed.paidCardInvoices
              : {},
          rules: Array.isArray(parsed.rules) ? parsed.rules : state.rules,
          goals: Array.isArray(parsed.goals) ? parsed.goals : [],
          recurringBills: Array.isArray(parsed.recurringBills) ? parsed.recurringBills : [],
          auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
          settings: {
            ...state.settings,
            ...parsed.settings,
            language: normalizeLanguage(parsed.settings.language ?? state.settings.language),
          },
          chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : [],
        });
        setSecFeedback({ type: 'ok', text: t.settings.security.msgJsonOk });
      } catch (err: unknown) {
        setSecFeedback({
          type: 'err',
          text: err instanceof Error ? err.message : t.settings.security.msgJsonInvalid,
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecFeedback(null);
    if (!/^\d{4,6}$/.test(currentPin.trim()) || !/^\d{4,6}$/.test(newPin.trim())) {
      setSecFeedback({ type: 'err', text: t.settings.security.msgPinDigits });
      return;
    }
    if (newPin.trim() !== confirmNewPin.trim()) {
      setSecFeedback({ type: 'err', text: t.settings.security.msgPinMismatch });
      return;
    }

    setSecBusy(true);
    try {
      await updateVaultSecurity(authToken, {
        currentPin: currentPin.trim(),
        newPin: newPin.trim(),
      });
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      setSecFeedback({ type: 'ok', text: t.settings.security.msgPinUpdated });
    } catch (err: unknown) {
      setSecFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : t.settings.security.msgPinError,
      });
    } finally {
      setSecBusy(false);
    }
  };

  const handleEnrollOrReenrollBiometric = async () => {
    setSecFeedback(null);
    setSecBusy(true);
    try {
      const enrolled = await enrollBiometricForCpf(profile.cpfId, profile.fullName);
      const data = await updateVaultSecurity(authToken, {
        biometric: {
          enabled: true,
          credentialId: enrolled.credentialId,
          deviceKey: enrolled.deviceKey,
          deviceLabel: enrolled.deviceLabel,
          mode: enrolled.mode,
        },
      });
      onBiometricUpdated(data.biometric);
      setSecFeedback({
        type: 'ok',
        text: `${t.settings.security.msgBioLinked} (${enrolled.deviceLabel}).`,
      });
    } catch (err: unknown) {
      setSecFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : t.settings.security.msgBioConfigError,
      });
    } finally {
      setSecBusy(false);
    }
  };

  const handleTestBiometric = async () => {
    setSecFeedback(null);
    setSecBusy(true);
    try {
      const proof = await verifyBiometricOnDevice(profile.cpfId, biometric.credentialId);
      if (!proof) {
        setSecFeedback({
          type: 'err',
          text: t.settings.security.msgBioMissingLocal,
        });
        return;
      }
      await unlockCpfVault(authToken, {
        method: 'biometric',
        credentialId: proof.credentialId,
        deviceKey: proof.deviceKey,
      });
      setSecFeedback({
        type: 'ok',
        text: `${t.settings.security.msgBioValidated} (${
          proof.mode === 'capacitor_native'
            ? 'Android BiometricPrompt'
            : proof.mode === 'webauthn'
            ? 'WebAuthn'
            : 'Device Key'
        }).`,
      });
    } catch (err: unknown) {
      setSecFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : t.settings.security.msgBioTestError,
      });
    } finally {
      setSecBusy(false);
    }
  };

  const handleDisableBiometric = async () => {
    setSecFeedback(null);
    setSecBusy(true);
    try {
      const data = await updateVaultSecurity(authToken, {
        biometric: { enabled: false },
      });
      onBiometricUpdated(data.biometric);
      setSecFeedback({ type: 'ok', text: t.settings.security.msgBioDisabled });
    } catch (err: unknown) {
      setSecFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : t.settings.security.msgBioDisableError,
      });
    } finally {
      setSecBusy(false);
    }
  };

  const handleVerifyKyc = async () => {
    setSecFeedback(null);
    if (kycDocLast4.replace(/\D/g, '').length < 4) {
      setSecFeedback({
        type: 'err',
        text: t.settings.security.msgKycDigits,
      });
      return;
    }
    setKycBusy(true);
    const docLast4Sanitized = kycDocLast4.replace(/\D/g, '').slice(-4);
    try {
      const reviewProfile = await updateVaultKyc(authToken, {
        kycDocumentType: kycDocType,
        kycDocumentLast4: docLast4Sanitized,
        kycStatus: 'under_review',
      });
      if (!isMountedRef.current) return;
      onProfileUpdated(reviewProfile);

      if (kycTimerRef.current !== null) {
        window.clearTimeout(kycTimerRef.current);
      }
      kycTimerRef.current = window.setTimeout(async () => {
        kycTimerRef.current = null;
        try {
          const verifiedProfile = await updateVaultKyc(authToken, {
            kycDocumentType: kycDocType,
            kycDocumentLast4: docLast4Sanitized,
            kycStatus: 'verified',
          });
          if (!isMountedRef.current) return;
          onProfileUpdated(verifiedProfile);
          setSecFeedback({
            type: 'ok',
            text: t.settings.security.msgKycSuccess,
          });
        } catch {
          if (isMountedRef.current) {
            setSecFeedback({ type: 'err', text: t.settings.security.msgKycError });
          }
        } finally {
          if (isMountedRef.current) {
            setKycBusy(false);
          }
        }
      }, 900);
    } catch {
      if (isMountedRef.current) {
        setKycBusy(false);
        setSecFeedback({ type: 'err', text: t.settings.security.msgKycError });
      }
    }
  };

  const handleSaveProfileCadastral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecFeedback(null);
    if (profName.trim().length < 3) {
      setSecFeedback({ type: 'err', text: 'Nome completo deve ter ao menos 3 caracteres.' });
      return;
    }
    setSecBusy(true);
    try {
      const updated = await updateVaultProfile(authToken, {
        fullName: profName.trim(),
        birthDate: profBirthDate,
        email: profEmail.trim(),
        phone: profPhone.trim(),
        username: profUsername.trim(),
      });
      onProfileUpdated(updated);
      saveCadastralDraft({
        fullName: updated.fullName,
        birthDate: updated.birthDate,
        email: updated.email,
        phone: updated.phone,
        username: updated.username,
        kycDocumentType: updated.kycDocumentType,
        kycDocumentLast4: updated.kycDocumentLast4,
      });
      setSecFeedback({
        type: 'ok',
        text: 'Dados cadastrais atualizados e pré-salvos para futuros acessos.',
      });
    } catch (err: unknown) {
      setSecFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao atualizar dados cadastrais.',
      });
    } finally {
      setSecBusy(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecFeedback(null);
    if (credNewPassword.length < 6) {
      setSecFeedback({ type: 'err', text: 'A nova senha deve ter no mínimo 6 caracteres.' });
      return;
    }
    if (credNewPassword !== credConfirmPassword) {
      setSecFeedback({ type: 'err', text: 'A confirmação da nova senha não confere.' });
      return;
    }
    if (!credChallenge.trim()) {
      setSecFeedback({ type: 'err', text: 'Informe seu PIN atual ou senha atual para confirmar.' });
      return;
    }

    setSecBusy(true);
    try {
      const isPinChallenge = /^\d{4,6}$/.test(credChallenge.trim());
      const res = await updateVaultSecurity(authToken, {
        ...(isPinChallenge
          ? { currentPin: credChallenge.trim() }
          : { currentPassword: credChallenge.trim() }),
        username: credUsername.trim() || undefined,
        newPassword: credNewPassword,
      });
      onProfileUpdated(res.profile);
      saveCadastralDraft({
        fullName: res.profile.fullName,
        birthDate: res.profile.birthDate,
        email: res.profile.email,
        phone: res.profile.phone,
        username: res.profile.username,
      });
      setCredChallenge('');
      setCredNewPassword('');
      setCredConfirmPassword('');
      setSecFeedback({
        type: 'ok',
        text: 'Usuário e senha atualizados com segurança no cofre.',
      });
    } catch (err: unknown) {
      setSecFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao atualizar usuário/senha.',
      });
    } finally {
      setSecBusy(false);
    }
  };

  const handleRestoreFromParsedState = (candidate: Partial<AppState>, label: string) => {
    onImportBackup({
      rows: Array.isArray(candidate.rows) ? candidate.rows : state.rows,
      entries: Array.isArray(candidate.entries) ? candidate.entries : [],
      accounts: Array.isArray(candidate.accounts) ? candidate.accounts : [],
      creditCards: Array.isArray(candidate.creditCards) ? candidate.creditCards : [],
      cardPurchases: Array.isArray(candidate.cardPurchases) ? candidate.cardPurchases : [],
      paidCardInvoices:
        candidate.paidCardInvoices && typeof candidate.paidCardInvoices === 'object'
          ? candidate.paidCardInvoices
          : {},
      rules: Array.isArray(candidate.rules) ? candidate.rules : state.rules,
      goals: Array.isArray(candidate.goals) ? candidate.goals : [],
      recurringBills: Array.isArray(candidate.recurringBills) ? candidate.recurringBills : [],
      auditLog: Array.isArray(candidate.auditLog) ? candidate.auditLog : [],
      settings: {
        ...state.settings,
        ...(candidate.settings ?? {}),
        language: normalizeLanguage(candidate.settings?.language ?? state.settings.language),
      },
      chatHistory: Array.isArray(candidate.chatHistory) ? candidate.chatHistory : [],
    });
    setSecFeedback({
      type: 'ok',
      text: `Backup "${label}" restaurado com sucesso.`,
    });
  };

  const renderKycStatusBadge = (status: KycStatus) => {
    if (status === 'verified') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3" />
          {t.settings.security.verified}
        </span>
      );
    }
    if (status === 'under_review') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
          <RefreshCw className="h-3 w-3 animate-spin" />
          {t.settings.security.underReview}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/10">
        <Clock className="h-3 w-3" />
        {t.settings.security.pending}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Language Switcher Card */}
      <div className="p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-[#1A2234] border border-slate-200 dark:border-[#C9A86A]/30 text-[#C9A86A] shrink-0">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t.settings.languageCardTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.settings.languageCardSubtitle}
              </p>
            </div>
          </div>
          {langNotice && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3" />
              {langNotice}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {LANGUAGE_OPTIONS.map((opt) => {
            const isSelected = lang === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onUpdateSettings({ language: opt.id });
                  setLangNotice(getTranslations(opt.id).settings.languageSwitchedNotice);
                }}
                className={`px-3.5 py-2.5 rounded-lg border text-left transition-colors flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F] border-slate-900 dark:border-[#C9A86A]/50'
                    : 'bg-slate-50 dark:bg-[#0D1320] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/[0.08] hover:border-[#C9A86A]/40'
                }`}
              >
                <div>
                  <div className="text-xs font-semibold">{opt.nativeLabel}</div>
                  <div className={`text-[10px] font-mono ${isSelected ? 'opacity-80' : 'text-slate-400'}`}>
                    {opt.codeLabel}
                  </div>
                </div>
                {isSelected && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#C9A86A]/20 text-[#E5C88F]">
                    {t.settings.languageActiveLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('monitoring')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'monitoring'
                ? 'bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            <span>{t.settings.subTabs.monitoring}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('goals')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'goals'
                ? 'bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Target className="h-3.5 w-3.5" />
            <span>{t.settings.subTabs.goals}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('grid')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'grid'
                ? 'bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>{t.settings.subTabs.grid}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'security'
                ? 'bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>{t.settings.subTabs.security}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: MONITORAMENTO AUTOMÁTICO */}
      {activeTab === 'monitoring' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.settings.monitoring.syncFrequency}
              </label>
              <select
                value={settings.syncFrequencyMinutes}
                onChange={(e) =>
                  onUpdateSettings({ syncFrequencyMinutes: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                <option value={15}>{t.settings.monitoring.every15m}</option>
                <option value={30}>{t.settings.monitoring.every30m}</option>
                <option value={60}>{t.settings.monitoring.every1h}</option>
                <option value={360}>{t.settings.monitoring.every6h}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.settings.monitoring.anomalySensitivity}
              </label>
              <input
                type="number"
                min="10"
                max="200"
                value={settings.anomalyThresholdPct}
                onChange={(e) =>
                  onUpdateSettings({ anomalyThresholdPct: Math.max(10, Number(e.target.value) || 45) })
                }
                className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Antecedência dos alertas (débitos/recebimentos)
              </label>
              <select
                value={settings.alertLeadDays ?? 3}
                onChange={(e) =>
                  onUpdateSettings({ alertLeadDays: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                <option value={1}>1 dia antes</option>
                <option value={3}>3 dias antes</option>
                <option value={5}>5 dias antes</option>
                <option value={7}>7 dias antes</option>
                <option value={10}>10 dias antes</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.settings.monitoring.alertsInCenter}
                </span>
                <input
                  type="checkbox"
                  checked={settings.notificationsEnabled}
                  onChange={(e) => onUpdateSettings({ notificationsEnabled: e.target.checked })}
                  className="accent-[#C9A86A]"
                />
              </label>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t.settings.monitoring.autoRulesTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.settings.monitoring.autoRulesDesc}
              </p>
            </div>

            <form onSubmit={handleCreateRule} className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder={t.settings.monitoring.keywordPlaceholder}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
              <select
                value={newRuleRowId}
                onChange={(e) => setNewRuleRowId(e.target.value)}
                className="px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                {rows
                  .filter((r) => !r.hidden)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t.settings.monitoring.addRule}</span>
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {rules.map((rule) => {
                const target = rows.find((r) => r.id === rule.targetRowId);
                return (
                  <div
                    key={rule.id}
                    className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-2 text-xs"
                  >
                    <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => onToggleRule(rule.id)}
                        className="accent-[#C9A86A]"
                      />
                      <span className="font-mono text-slate-900 dark:text-slate-100 truncate">
                        "{rule.keyword}"
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="font-medium text-[#A68342] dark:text-[#E5C88F] truncate">
                        {target?.name ?? 'OUTROS'}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => onDeleteRule(rule.id)}
                      className="text-slate-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.settings.monitoring.limitsTitle}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rows
                .filter((r) => (r.block === 'fixed' || r.block === 'variable') && !r.hidden)
                .map((row) => (
                  <div
                    key={row.id}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {row.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {t.settings.monitoring.averageLabel}:{' '}
                        {formatBRL(totals.rowAverage[row.id] ?? 0, settings.privacyMode)}
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={row.alertLimit ?? ''}
                      placeholder={t.settings.monitoring.noLimitPlaceholder}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        onUpdateRow(row.id, { alertLimit: isNaN(v) || v <= 0 ? undefined : v });
                      }}
                      className="w-24 px-2.5 py-1.5 rounded-md text-right text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    />
                  </div>
                ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-3">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.settings.monitoring.recurringTitle} ({recurringRows.length})
              </h4>
              <div className="space-y-2 text-xs">
                {recurringRows.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-white/[0.05] last:border-0"
                  >
                    <span className="text-slate-800 dark:text-slate-200">
                      {r.name}{' '}
                      <span className="text-slate-400 font-mono text-[11px]">
                        ({formatCompactDay(r.refDay)})
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {t.settings.monitoring.averageLabel}{' '}
                      {formatBRL(totals.rowAverage[r.id] ?? 0, settings.privacyMode)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-3">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.settings.monitoring.anomaliesTitle} ({alerts.length})
              </h4>
              {alerts.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.settings.monitoring.noAnomalies}
                </p>
              ) : (
                <div className="space-y-2 text-xs max-h-60 overflow-y-auto">
                  {alerts.map((al) => (
                    <div
                      key={al.id}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]"
                    >
                      <div className="font-medium text-slate-900 dark:text-slate-100">{al.title}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {al.description}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: METAS DE ECONOMIA */}
      {activeTab === 'goals' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t.settings.goals.createTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.settings.goals.createDesc}
              </p>
            </div>

            <form onSubmit={handleCreateGoal} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-4">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.settings.goals.titleLabel}
                </label>
                <input
                  type="text"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder={t.settings.goals.titlePlaceholder}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.settings.goals.targetLabel}
                </label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  required
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.settings.goals.deadlineLabel}
                </label>
                <select
                  value={goalMonth}
                  onChange={(e) => setGoalMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  {monthNamesFull.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {t.settings.goals.baseLabel}
                </label>
                <select
                  value={goalMode}
                  onChange={(e) => setGoalMode(e.target.value as SavingsGoal['trackingMode'])}
                  className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value="result">{t.settings.goals.baseResult}</option>
                  <option value="savings">{t.settings.goals.baseSavings}</option>
                  <option value="combined">{t.settings.goals.baseCombined}</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t.settings.goals.createBtn}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.settings.goals.monitoredTitle} ({goals.length})
            </h3>
            {goals.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.settings.goals.noGoals}
              </p>
            ) : (
              <div className="space-y-3">
                {goals.map((g) => {
                  const prog = computeGoalProgress(g, totals, settings.activeYear);
                  return (
                    <div
                      key={g.id}
                      className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <input
                          type="text"
                          value={g.title}
                          onChange={(e) => onUpdateGoal(g.id, { title: e.target.value })}
                          className="flex-1 min-w-[220px] px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                        />

                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="100"
                            step="100"
                            value={g.targetAmount}
                            onChange={(e) =>
                              onUpdateGoal(g.id, {
                                targetAmount: Math.max(100, Number(e.target.value) || 100),
                              })
                            }
                            className="w-28 px-2.5 py-1.5 rounded-lg text-right text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                          />
                          <select
                            value={g.trackingMode}
                            onChange={(e) =>
                              onUpdateGoal(g.id, {
                                trackingMode: e.target.value as SavingsGoal['trackingMode'],
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                          >
                            <option value="result">{t.settings.goals.baseResult}</option>
                            <option value="savings">{t.settings.goals.baseSavings}</option>
                            <option value="combined">{t.settings.goals.baseCombined}</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => onDeleteGoal(g.id)}
                            className="p-1.5 rounded text-slate-400 hover:text-red-500"
                            title={t.settings.goals.removeGoal}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
                          <div
                            style={{ width: `${prog.pct}%` }}
                            className={`h-full ${
                              prog.status === 'achieved' ? 'bg-emerald-500' : 'bg-[#C9A86A]'
                            }`}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span>
                            {t.settings.goals.realProgress}:{' '}
                            {formatBRL(prog.currentAmount, settings.privacyMode)} ({prog.pct}%)
                          </span>
                          <span>{translateGoalStatus(prog.status, lang)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TIMELINE & GRADE */}
      {activeTab === 'grid' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.settings.grid.closingDay}
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={settings.closingDay}
                onChange={(e) =>
                  onUpdateSettings({
                    closingDay: Math.min(31, Math.max(1, Number(e.target.value) || 30)),
                  })
                }
                className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.settings.grid.variationDisplay}
              </label>
              <select
                value={settings.variationDisplay}
                onChange={(e) =>
                  onUpdateSettings({
                    variationDisplay: e.target.value as AppSettings['variationDisplay'],
                  })
                }
                className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                <option value="both">{t.settings.grid.varBoth}</option>
                <option value="currency">{t.settings.grid.varCurrency}</option>
                <option value="percent">{t.settings.grid.varPercent}</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.settings.grid.showZeroMonths}
                </span>
                <input
                  type="checkbox"
                  checked={settings.showZeroMonths}
                  onChange={(e) => onUpdateSettings({ showZeroMonths: e.target.checked })}
                  className="accent-[#C9A86A]"
                />
              </label>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.settings.grid.manageRowsTitle}
            </h3>

            <form onSubmit={handleCreateRow} className="flex flex-wrap items-center gap-2.5">
              <select
                value={newRowBlock}
                onChange={(e) => setNewRowBlock(e.target.value as BlockType)}
                className="px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                <option value="income">{t.settings.grid.blockIncome}</option>
                <option value="fixed">{t.settings.grid.blockFixed}</option>
                <option value="variable">{t.settings.grid.blockVariable}</option>
              </select>
              <input
                type="text"
                value={newRowName}
                onChange={(e) => setNewRowName(e.target.value)}
                placeholder={t.settings.grid.newRowPlaceholder}
                className="flex-1 min-w-[180px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
              <input
                type="number"
                min="1"
                max="31"
                value={newRowDay}
                onChange={(e) => setNewRowDay(e.target.value)}
                placeholder={t.settings.grid.dayPlaceholder}
                className="w-28 px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t.settings.grid.createRowBtn}</span>
              </button>
            </form>

            <div className="divide-y divide-slate-100 dark:divide-white/[0.05] max-h-96 overflow-y-auto">
              {rows
                .slice()
                .sort((a, b) => a.block.localeCompare(b.block) || a.order - b.order)
                .map((row) => (
                  <div
                    key={row.id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#1A2234] text-[10px] font-medium uppercase text-slate-600 dark:text-slate-300">
                        {row.block === 'income'
                          ? t.settings.grid.blockIncome
                          : row.block === 'fixed'
                          ? t.settings.grid.blockFixed
                          : row.block === 'variable'
                          ? t.settings.grid.blockVariable
                          : t.settings.grid.blockSavings}
                      </span>
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => onUpdateRow(row.id, { name: e.target.value })}
                        className="px-2 py-1 rounded bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-white/10 focus:border-[#C9A86A] text-slate-900 dark:text-slate-100 font-medium"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-slate-500">{t.settings.grid.dayLabel}:</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        placeholder="—"
                        value={row.refDay ?? ''}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          onUpdateRow(row.id, {
                            refDay: !isNaN(v) && v >= 1 && v <= 31 ? v : undefined,
                          });
                        }}
                        className="w-16 px-2 py-1 rounded text-center font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                      />
                      <button
                        type="button"
                        onClick={() => onMoveRow(row.id, 'up')}
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveRow(row.id, 'down')}
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateRow(row.id, { hidden: !row.hidden })}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] ${
                          row.hidden
                            ? 'border-amber-500/40 text-amber-600 dark:text-amber-300'
                            : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Eye className="h-3 w-3" />
                        <span>{row.hidden ? t.settings.grid.hiddenLabel : t.settings.grid.visibleLabel}</span>
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SEGURANÇA, IDENTIDADE (KYC), BIOMETRIA & RECUPERAÇÃO */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {secFeedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                secFeedback.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
              }`}
            >
              {secFeedback.type === 'ok' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{secFeedback.text}</span>
            </div>
          )}

          {/* 1. Identity & KYC Profile */}
          <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-[#C9A86A]" />
                  {t.settings.security.kycTitle}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t.settings.security.holderLabel}:{' '}
                  <strong className="text-slate-900 dark:text-slate-200">{profile.fullName}</strong> · CPF{' '}
                  <span className="font-mono">{profile.maskedCpf}</span>
                  {profile.kycAuditId ? ` · ${t.settings.security.recordLabel} ${profile.kycAuditId}` : ''}
                </p>
              </div>
              {renderKycStatusBadge(profile.kycStatus)}
            </div>

            {profile.kycStatus === 'verified' ? (
              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 flex flex-wrap items-center justify-between gap-2">
                <span>
                  {t.settings.security.kycConfirmedPrefix} {profile.kycDocumentType ?? 'ID'}{' '}
                  {profile.kycDocumentLast4
                    ? `(${t.settings.security.kycLast4Prefix} ••••${profile.kycDocumentLast4})`
                    : ''}{' '}
                  {t.settings.security.kycConfirmedSuffix}
                </span>
                {profile.kycSelfieVerifiedAt && !Number.isNaN(new Date(profile.kycSelfieVerifiedAt).getTime()) && (
                  <span className="font-mono text-[11px]">
                    {t.settings.security.verifiedAt}{' '}
                    {new Date(profile.kycSelfieVerifiedAt).toLocaleString(getIntlLocale(lang))}
                  </span>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    {t.settings.security.officialDoc}
                  </label>
                  <select
                    value={kycDocType}
                    onChange={(e) => setKycDocType(e.target.value as KycDocumentType)}
                    className="w-full px-3 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                  >
                    <option value="CNH">CNH</option>
                    <option value="RG">RG</option>
                    <option value="CIN">CIN</option>
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    {t.settings.security.last4Digits}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={kycDocLast4}
                    onChange={(e) => setKycDocLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono tracking-widest bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div className="sm:col-span-5">
                  <button
                    type="button"
                    disabled={kycBusy}
                    onClick={handleVerifyKyc}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 disabled:opacity-40"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" />
                    <span>
                      {kycBusy
                        ? t.settings.security.validatingDoc
                        : t.settings.security.validateDocBtn}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Biometrics & PIN & Session Preferences */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-[#C9A86A]" />
                  {t.settings.security.bioTitle}
                </h3>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                    biometric.enabled
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10'
                  }`}
                >
                  {biometric.enabled
                    ? t.settings.security.bioActive
                    : t.settings.security.bioInactive}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06] text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <div>
                  {t.settings.security.registeredDevice}{' '}
                  <strong>{biometric.deviceLabel || t.settings.security.noDeviceLinked}</strong>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {biometric.enabled
                    ? hasLocalBiometric
                      ? t.settings.security.bioReady
                      : t.settings.security.bioReinstallHint
                    : t.settings.security.bioEnableHint}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={secBusy}
                  onClick={handleEnrollOrReenrollBiometric}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 disabled:opacity-40"
                >
                  <Fingerprint className="h-3.5 w-3.5" />
                  <span>
                    {biometric.enabled
                      ? t.settings.security.reenableBio
                      : t.settings.security.enableBio}
                  </span>
                </button>

                {biometric.enabled && hasLocalBiometric && (
                  <button
                    type="button"
                    disabled={secBusy}
                    onClick={handleTestBiometric}
                    className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08]"
                  >
                    {t.settings.security.testBio}
                  </button>
                )}

                {biometric.enabled && (
                  <button
                    type="button"
                    disabled={secBusy}
                    onClick={handleDisableBiometric}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    {t.settings.security.disableBio}
                  </button>
                )}
              </div>
            </div>

            <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#C9A86A]" />
                {t.settings.security.pinTitle}
              </h3>

              <form onSubmit={handleChangePin} className="grid grid-cols-3 gap-2.5 items-end">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    {t.settings.security.currentPin}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono text-center bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    {t.settings.security.newPin}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono text-center bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    {t.settings.security.confirmPin}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono text-center bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div className="col-span-3">
                  <button
                    type="submit"
                    disabled={secBusy}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F] border border-transparent dark:border-[#C9A86A]/30 hover:opacity-90"
                  >
                    {t.settings.security.updatePinBtn}
                  </button>
                </div>
              </form>

              <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    {t.settings.security.autoLock}
                  </label>
                  <select
                    value={settings.autoLockMinutes}
                    onChange={(e) => onUpdateSettings({ autoLockMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  >
                    <option value={5}>5 {t.settings.security.minutesSuffix}</option>
                    <option value={15}>15 {t.settings.security.minutesSuffix}</option>
                    <option value={30}>30 {t.settings.security.minutesSuffix}</option>
                    <option value={60}>60 {t.settings.security.minutesSuffix}</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t.settings.security.hideOnOpen}
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.privacyDefaultOnBoot}
                      onChange={(e) =>
                        onUpdateSettings({ privacyDefaultOnBoot: e.target.checked })
                      }
                      className="accent-[#C9A86A]"
                    />
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-start justify-between gap-3 w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
                    <div>
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t.settings.security.lockOnBackground}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {t.settings.security.lockOnBackgroundHint}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.lockOnBackground)}
                      onChange={(e) =>
                        onUpdateSettings({ lockOnBackground: e.target.checked })
                      }
                      className="accent-[#C9A86A] mt-0.5 shrink-0"
                    />
                  </label>
                </div>
              </div>

              {/* Remembered Last CPF Controls */}
              <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-300">
                    {t.settings.security.rememberedCpfLabel}{' '}
                    <strong className="font-mono text-slate-900 dark:text-[#E5C88F]">
                      {rememberedCpfInfo ? rememberedCpfInfo.maskedCpf : t.settings.security.noSavedCpf}
                    </strong>
                  </span>
                  {rememberedCpfInfo && (
                    <button
                      type="button"
                      onClick={() => {
                        clearRememberedCpf();
                        setRememberedCpfInfo(null);
                        setSecFeedback({
                          type: 'ok',
                          text: t.settings.security.msgCpfForgotten,
                        });
                      }}
                      className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
                    >
                      {t.settings.security.forgetCpf}
                    </button>
                  )}
                </div>
                <label className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
                  <span className="text-xs text-slate-700 dark:text-slate-300">
                    {t.settings.security.maskCpfOnLogin}
                  </span>
                  <input
                    type="checkbox"
                    checked={maskSavedCpfOnLogin}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setMaskSavedCpfOnLogin(next);
                      saveLastCpfPrivacyMask(next);
                    }}
                    className="accent-[#C9A86A]"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* 2B. Dados Cadastrais Pré-Salvos & Login por Usuário/Senha */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleSaveProfileCadastral}
              className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-[#C9A86A]" />
                  <span>Dados Cadastrais Pré-Salvos</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    clearCadastralDraft();
                    setSecFeedback({
                      type: 'ok',
                      text: 'Rascunho local de preenchimento automático limpo deste aparelho.',
                    });
                  }}
                  className="text-[11px] text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                >
                  Limpar rascunho local
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mantém seus dados não sensíveis prontos para preenchimento rápido e recuperação de conta.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    required
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Data de nascimento
                  </label>
                  <input
                    type="date"
                    value={profBirthDate}
                    onChange={(e) => setProfBirthDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={profPhone}
                    onChange={(e) => setProfPhone(e.target.value)}
                    placeholder="(00) 90000-0000"
                    className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={profEmail}
                    onChange={(e) => setProfEmail(e.target.value)}
                    placeholder="nome@dominio.com"
                    className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Usuário de acesso
                  </label>
                  <input
                    type="text"
                    value={profUsername}
                    onChange={(e) => setProfUsername(e.target.value)}
                    placeholder="seu.usuario"
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={secBusy}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 disabled:opacity-40"
              >
                Salvar dados cadastrais
              </button>
            </form>

            <form
              onSubmit={handleSaveCredentials}
              className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-[#C9A86A]" />
                  <span>Credenciais (Usuário e Senha)</span>
                </h3>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                    profile.hasPasswordLogin
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10'
                  }`}
                >
                  {profile.hasPasswordLogin ? 'Senha Ativa' : 'Não configurada'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Defina usuário e senha com hash seguro no cofre e compatível com preenchimento automático do navegador/sistema.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Usuário
                  </label>
                  <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={credUsername}
                    onChange={(e) => setCredUsername(e.target.value)}
                    placeholder="seu.usuario"
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    PIN atual ou Senha atual
                  </label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={credChallenge}
                    onChange={(e) => setCredChallenge(e.target.value)}
                    placeholder="••••"
                    className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Nova senha (mín. 6)
                  </label>
                  <input
                    type="password"
                    name="new-password"
                    autoComplete="new-password"
                    value={credNewPassword}
                    onChange={(e) => setCredNewPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Confirmar nova senha
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={credConfirmPassword}
                    onChange={(e) => setCredConfirmPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={secBusy}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F] border border-transparent dark:border-[#C9A86A]/30 hover:opacity-90 disabled:opacity-40"
              >
                {profile.hasPasswordLogin ? 'Atualizar usuário e senha' : 'Ativar usuário e senha'}
              </button>
            </form>
          </div>

          {/* 2B. App Permissions (Notifications, Microphone Voice, Storage, Biometrics, Network) */}
          <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Permissões do Aplicativo ({permissionsSnapshot?.platform === 'android' ? 'Android' : 'Navegador'})
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Gerencie as permissões usadas pelo ORBE Finanças para lembretes de vencimentos, lançamento por voz, exportação de backups/relatórios e biometria.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={permBusy}
                  onClick={() => void handleRequestPermissionItem('all')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  {permBusy ? 'Solicitando...' : 'Solicitar Permissões'}
                </button>
                {(isAndroidNativeApp() || permissionsSnapshot?.requiresSettings) && (
                  <button
                    type="button"
                    onClick={() => void openNativeAppSettings()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Ajustes do App</span>
                  </button>
                )}
              </div>
            </div>

            {permissionsSnapshot && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                      <Bell className="h-3.5 w-3.5 text-[#C9A86A]" />
                      <span>Notificações</span>
                      {renderPermissionBadge(permissionsSnapshot.notifications)}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Alertas de débitos próximos, faturas e recebimentos.
                    </p>
                  </div>
                  {permissionsSnapshot.notifications !== 'granted' &&
                    permissionsSnapshot.notifications !== 'unsupported' && (
                      <button
                        type="button"
                        disabled={permBusy}
                        onClick={() => void handleRequestPermissionItem('notifications')}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] shrink-0"
                      >
                        Ativar
                      </button>
                    )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                      <Mic className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Microfone (Voz)</span>
                      {renderPermissionBadge(permissionsSnapshot.microphone)}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Lançamento rápido de gastos e receitas por comando de voz.
                    </p>
                  </div>
                  {permissionsSnapshot.microphone !== 'granted' &&
                    permissionsSnapshot.microphone !== 'unsupported' && (
                      <button
                        type="button"
                        disabled={permBusy}
                        onClick={() => void handleRequestPermissionItem('microphone')}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] shrink-0"
                      >
                        Ativar
                      </button>
                    )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                      <FolderCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Arquivos & Backups</span>
                      {renderPermissionBadge(permissionsSnapshot.storage)}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Importação de CSV e exportação de relatórios PDF / backups JSON.
                    </p>
                  </div>
                  {permissionsSnapshot.storage !== 'granted' &&
                    permissionsSnapshot.storage !== 'unsupported' && (
                      <button
                        type="button"
                        disabled={permBusy}
                        onClick={() => void handleRequestPermissionItem('storage')}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] shrink-0"
                      >
                        Ativar
                      </button>
                    )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                      <Fingerprint className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Biometria</span>
                      {renderPermissionBadge(permissionsSnapshot.biometrics)}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {permissionsSnapshot.biometricsLabel} ·{' '}
                      <span className="inline-flex items-center gap-1">
                        <Wifi className="h-3 w-3 inline" />
                        {permissionsSnapshot.networkOnline ? 'Rede online' : 'Modo offline'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {permissionsSnapshot?.requiresSettings && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300">
                Alguma permissão foi negada anteriormente.{' '}
                {isAndroidNativeApp()
                  ? 'Toque em "Ajustes do App" acima para liberar manualmente em Permissões.'
                  : 'Libere o acesso nas configurações de site do navegador (ícone de cadeado ao lado do endereço).'}
              </div>
            )}
          </div>

          {/* 3. Portability, Operational Base & Reinstall Recovery */}
          <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Database className="h-4 w-4 text-[#C9A86A]" />
                {t.settings.security.portabilityTitle}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t.settings.security.portabilityDesc}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onExportPDF}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>{t.settings.security.exportPdfBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenReportsModal('export')}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Exportar Relatórios (CSV / Excel)</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenReportsModal('import')}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Importar Planilha (CSV / Excel)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onExportJSON();
                  setSecFeedback({ type: 'ok', text: t.settings.security.msgJsonExported });
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08]"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>{t.settings.security.exportJsonBtn}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportJSON}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08]"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{t.settings.security.importJsonBtn}</span>
              </button>

              <button
                type="button"
                onClick={onTestReinstallRecovery}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{t.settings.security.simulateReinstallBtn}</span>
              </button>
            </div>

            {/* 24-Hour Automatic Backup Scheduler Card */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Clock className="h-4 w-4 text-[#C9A86A]" />
                  <span>Backup Automático a cada 24 horas</span>
                </div>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  Ativo (24h)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-white/[0.06]">
                  <span className="text-slate-500 dark:text-slate-400 block">Último backup automático</span>
                  <strong className="font-mono text-slate-900 dark:text-slate-100">
                    {autoBackupStatus?.lastAutoBackupAt
                      ? new Date(autoBackupStatus.lastAutoBackupAt).toLocaleString(
                          getIntlLocale(settings.language)
                        )
                      : 'Aguardando execução inicial'}
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-white/[0.06]">
                  <span className="text-slate-500 dark:text-slate-400 block">Próximo backup previsto</span>
                  <strong className="font-mono text-[#A68342] dark:text-[#E5C88F]">
                    {autoBackupStatus && autoBackupStatus.msRemaining > 0
                      ? `Em ${Math.floor(autoBackupStatus.msRemaining / 3600000)}h ${Math.floor(
                          (autoBackupStatus.msRemaining % 3600000) / 60000
                        )}m`
                      : 'Em execução / Imediato'}
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-white/[0.06]">
                  <span className="text-slate-500 dark:text-slate-400 block">Armazenamento Cofre</span>
                  <strong className="font-mono text-slate-900 dark:text-slate-100">
                    100% Local (IndexedDB + Dispositivo)
                  </strong>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Os snapshots automáticos ficam salvos com segurança no armazenamento interno deste dispositivo (IndexedDB + localStorage, sem senhas/PINs). Para salvar uma cópia externa na pasta Downloads ou trocar de celular, utilize os botões voluntários de exportação abaixo.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await onRunManualBackupNow();
                    await reloadSnapshots();
                    setSecFeedback({
                      type: 'ok',
                      text: 'Snapshot de backup atualizado com segurança no cofre local deste aparelho.',
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Fazer backup agora</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onShareOrDownloadBackup();
                    setSecFeedback({
                      type: 'ok',
                      text: 'Último backup (.json) preparado para download/compartilhamento.',
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-800 dark:text-slate-200"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  <span>Baixar / Compartilhar último backup (.json)</span>
                </button>
              </div>

              {(localSnapshots.length > 0 || serverSnapshots.length > 0) && (
                <div className="pt-3 border-t border-slate-200/80 dark:border-white/[0.06] space-y-2">
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Snapshots disponíveis para restauração em 1 clique ({localSnapshots.length + serverSnapshots.length})
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {localSnapshots.map((snap) => (
                      <div
                        key={`loc-${snap.id}`}
                        className="px-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-slate-900 dark:text-slate-100">
                            {new Date(snap.savedAt).toLocaleString(getIntlLocale(settings.language))}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            · {snap.source === 'auto_24h' ? 'Auto 24h' : 'Manual'} (Local ·{' '}
                            {Math.max(1, Math.round(snap.sizeBytes / 1024))} KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const parsed = parseBackupSnapshotState(snap.payloadJson);
                            if (!parsed) {
                              setSecFeedback({
                                type: 'err',
                                text: 'Snapshot local inválido ou corrompido.',
                              });
                              return;
                            }
                            handleRestoreFromParsedState(
                              parsed,
                              new Date(snap.savedAt).toLocaleString(getIntlLocale(settings.language))
                            );
                          }}
                          className="px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 font-semibold hover:opacity-90"
                        >
                          Restaurar
                        </button>
                      </div>
                    ))}
                    {serverSnapshots.map((srv) => (
                      <div
                        key={`srv-${srv.id}`}
                        className="px-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-slate-900 dark:text-slate-100">
                            {new Date(srv.savedAt).toLocaleString(getIntlLocale(settings.language))}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            · {srv.source === 'auto_24h' ? 'Auto 24h' : 'Manual'} (Servidor ·{' '}
                            {Math.max(1, Math.round(srv.sizeBytes / 1024))} KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleRestoreFromParsedState(
                              srv.state,
                              `${new Date(srv.savedAt).toLocaleString(
                                getIntlLocale(settings.language)
                              )} (Servidor)`
                            )
                          }
                          className="px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 font-semibold hover:opacity-90"
                        >
                          Restaurar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center gap-3">
              {!confirmLoadDemo ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmLoadDemo(true);
                    setConfirmClearAll(false);
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-[#C9A86A]/40 text-[#8C6A2E] dark:text-[#E5C88F] hover:bg-[#C9A86A]/10"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>{t.settings.security.loadDemoBtn}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onLoadDemo2026Data();
                      setConfirmLoadDemo(false);
                      setSecFeedback({
                        type: 'ok',
                        text: t.settings.security.msgDemoLoaded,
                      });
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#C9A86A] text-[#090D16]"
                  >
                    {t.settings.security.confirmLoadDemoBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmLoadDemo(false)}
                    className="px-3 py-2 rounded-lg text-xs text-slate-500"
                  >
                    {t.settings.security.cancelBtn}
                  </button>
                </div>
              )}

              {!confirmClearAll ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmClearAll(true);
                    setConfirmLoadDemo(false);
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{t.settings.security.clearAllBtn}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearOperationalData();
                      setConfirmClearAll(false);
                      setSecFeedback({
                        type: 'ok',
                        text: t.settings.security.msgClearedAll,
                      });
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500"
                  >
                    {t.settings.security.confirmClearAllBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="px-3 py-2 rounded-lg text-xs text-slate-500"
                  >
                    {t.settings.security.cancelBtn}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
