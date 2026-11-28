import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Sliders,
  Shield,
  Target,
  Plus,
  Trash2,
  RotateCcw,
  Eye,
  ArrowUp,
  ArrowDown,
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
  Mic,
  Wifi,
  FolderCheck,
  ExternalLink,
  Search,
  Check,
  Download,
  Upload,
  Calendar,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Repeat,
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
import { computeGoalProgress, formatBRL } from '../utils/financeEngine';
import {
  CategoryIconBadge,
  CategoryIconKey,
  CategoryVisualPicker,
  getCategoryVisual,
  getDefaultCategoryColor,
  getDefaultCategoryIcon,
} from '../utils/categoryVisuals';
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
  exportVaultBackupJSON,
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

type SettingsSectionTab = 'account' | 'data' | 'categories' | 'app';

const APP_VERSION_LABEL = 'v1.3.0';
const ANDROID_PACKAGE_ID = 'com.thayllon.privatecontrol';

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mapInitialSubTab(
  initialSubTab?: 'monitoring' | 'goals' | 'grid' | 'security'
): SettingsSectionTab {
  if (initialSubTab === 'grid' || initialSubTab === 'goals') return 'categories';
  if (initialSubTab === 'security') return 'account';
  return 'account';
}

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
  onDeleteRow: (rowId: string) => void;
  onMoveRow: (rowId: string, direction: 'up' | 'down') => void;
  onAddGoal: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => void;
  onUpdateGoal: (goalId: string, patch: Partial<SavingsGoal>) => void;
  onDeleteGoal: (goalId: string) => void;
  onLoadDemo2026Data: () => void;
  onClearOperationalData: () => void;
  onImportBackup: (imported: AppState) => void;
  onProfileUpdated: (profile: UserProfile) => void;
  onBiometricUpdated: (biometric: BiometricConfig) => void;
  onTestReinstallRecovery: () => void;
  autoBackupStatus: AutoBackupStatus | null;
  onRunManualBackupNow: () => Promise<void>;
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
  onDeleteRow,
  onMoveRow,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onLoadDemo2026Data,
  onClearOperationalData,
  onImportBackup,
  onProfileUpdated,
  onBiometricUpdated,
  onTestReinstallRecovery,
  autoBackupStatus,
  onRunManualBackupNow,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsSectionTab>(() =>
    mapInitialSubTab(initialSubTab)
  );
  const [rememberedCpfInfo, setRememberedCpfInfo] = useState(() => loadRememberedCpf());
  const [maskSavedCpfOnLogin, setMaskSavedCpfOnLogin] = useState(() =>
    loadLastCpfPrivacyMask()
  );

  useEffect(() => {
    setActiveTab(mapInitialSubTab(initialSubTab));
    if (initialSubTab === 'goals') {
      setShowGoalsPanel(true);
      window.setTimeout(() => {
        goalsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }, [initialSubTab]);

  // Categories, Grid & Rules State
  const [categorySearch, setCategorySearch] = useState('');
  const [rowBlockFilter, setRowBlockFilter] = useState<'all' | BlockType>('all');
  const [newRowName, setNewRowName] = useState('');
  const [newRowBlock, setNewRowBlock] = useState<BlockType>('variable');
  const [newRowColor, setNewRowColor] = useState<string>('#2563EB');
  const [newRowIcon, setNewRowIcon] = useState<CategoryIconKey>('tag');
  const [editingVisualRowId, setEditingVisualRowId] = useState<string | null>(null);

  const [newKeyword, setNewKeyword] = useState('');
  const [newRuleRowId, setNewRuleRowId] = useState('var-mercado');
  const [ruleCategorySearch, setRuleCategorySearch] = useState('');
  const [showGoalsPanel, setShowGoalsPanel] = useState(initialSubTab === 'goals');
  const [showRulesPanel, setShowRulesPanel] = useState(false);

  // Account & Security Collapsible Sections (mobile-friendly)
  const [showPinSection, setShowPinSection] = useState(false);
  const [showCadastralSection, setShowCadastralSection] = useState(false);
  const [showCredentialsSection, setShowCredentialsSection] = useState(false);
  const [showKycSection, setShowKycSection] = useState(profile.kycStatus !== 'verified');
  const [showMaintenanceSection, setShowMaintenanceSection] = useState(false);

  // Confirmation toggles for data actions
  const [confirmLoadDemo, setConfirmLoadDemo] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [dataFeedback, setDataFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);
  const goalsSectionRef = useRef<HTMLDivElement | null>(null);

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

  // Backup snapshots (24h auto + manual local)
  const [localSnapshots, setLocalSnapshots] = useState<AutoBackupSnapshot[]>([]);

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
    if (activeTab === 'data') {
      void reloadSnapshots();
    }
    if (activeTab === 'app') {
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

  const renderPermissionStatusText = (status: AppPermissionStatus) => {
    if (status === 'granted') {
      return (
        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          Concedida
        </span>
      );
    }
    if (status === 'denied') {
      return (
        <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
          Negada
        </span>
      );
    }
    if (status === 'unsupported') {
      return (
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Indisponível
        </span>
      );
    }
    return (
      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">
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
  const [goalYear, setGoalYear] = useState<number>(state.settings.activeYear);
  const [goalMode, setGoalMode] = useState<SavingsGoal['trackingMode']>('result');

  const { settings, rows, rules, goals } = state;
  const lang = normalizeLanguage(settings.language);
  const t = getTranslations(lang);
  const monthNamesFull = getMonthNamesFull(lang);
  const [langNotice, setLangNotice] = useState<string | null>(null);
  const deferredCategorySearch = useDeferredValue(categorySearch);
  const deferredRuleCategorySearch = useDeferredValue(ruleCategorySearch);

  const visibleRows = useMemo(() => rows.filter((r) => !r.hidden), [rows]);
  const recurringRows = useMemo(() => rows.filter((r) => r.isRecurring && !r.hidden), [rows]);

  useEffect(() => {
    if (visibleRows.length > 0 && !visibleRows.some((r) => r.id === newRuleRowId)) {
      setNewRuleRowId(visibleRows[0].id);
    }
  }, [visibleRows, newRuleRowId]);

  const hasLocalBiometric = Boolean(
    biometric.enabled &&
      getLocalBiometricHandle(profile.cpfId)?.credentialId === biometric.credentialId
  );

  const filteredCategoryList = useMemo(() => {
    const normalizedCatQuery = normalizeSearchText(deferredCategorySearch);
    return rows
      .filter((r) => rowBlockFilter === 'all' || r.block === rowBlockFilter)
      .filter((r) =>
        normalizedCatQuery ? normalizeSearchText(r.name).includes(normalizedCatQuery) : true
      )
      .slice()
      .sort((a, b) => a.block.localeCompare(b.block) || a.order - b.order);
  }, [rows, rowBlockFilter, deferredCategorySearch]);

  const filteredRuleTargetRows = useMemo(() => {
    const normalizedRuleCatQuery = normalizeSearchText(deferredRuleCategorySearch);
    return visibleRows.filter((r) =>
      normalizedRuleCatQuery ? normalizeSearchText(r.name).includes(normalizedRuleCatQuery) : true
    );
  }, [visibleRows, deferredRuleCategorySearch]);

  const selectedRuleTargetRow = useMemo(
    () => visibleRows.find((r) => r.id === newRuleRowId),
    [visibleRows, newRuleRowId]
  );

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim() || !newRuleRowId) return;
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
    onAddRow({
      name: newRowName.trim().toUpperCase(),
      block: newRowBlock,
      color: newRowColor,
      icon: newRowIcon,
    });
    setNewRowName('');
    setNewRowColor(getDefaultCategoryColor(newRowBlock));
    setNewRowIcon(getDefaultCategoryIcon(newRowBlock));
  };

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedTarget = parseFloat(goalTarget.replace(',', '.'));
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) return;
    const safeGoalMonth = Math.min(
      11,
      Math.max(0, Number.isFinite(goalMonth) ? Math.trunc(goalMonth) : 11)
    );
    const safeGoalYear =
      Number.isFinite(goalYear) && goalYear >= 1900 && goalYear <= 9999
        ? Math.trunc(goalYear)
        : settings.activeYear;

    onAddGoal({
      title:
        goalTitle.trim() ||
        `${formatBRL(parsedTarget)} · ${monthNamesFull[safeGoalMonth]} ${safeGoalYear}`,
      targetAmount: Number(parsedTarget.toFixed(2)),
      deadlineMonth: safeGoalMonth,
      deadlineYear: safeGoalYear,
      trackingMode: goalMode,
    });

    setGoalTitle('');
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
        text: 'Dados cadastrais atualizados e salvos no aparelho.',
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
    setDataFeedback({
      type: 'ok',
      text: `Backup "${label}" restaurado com sucesso.`,
    });
  };

  const handleJsonBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBackupSnapshotState(text);
      if (!parsed) {
        setDataFeedback({
          type: 'err',
          text: 'Arquivo JSON inválido ou incompatível com o backup do ORBE Finanças.',
        });
        return;
      }
      handleRestoreFromParsedState(parsed, file.name);
    } catch {
      setDataFeedback({
        type: 'err',
        text: 'Não foi possível ler o arquivo de backup selecionado.',
      });
    }
  };

  const renderKycStatusLabel = (status: KycStatus) => {
    if (status === 'verified') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 shrink-0 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>{t.settings.security.verified}</span>
        </span>
      );
    }
    if (status === 'under_review') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 shrink-0 whitespace-nowrap">
          <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>{t.settings.security.underReview}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0 whitespace-nowrap">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>{t.settings.security.pending}</span>
      </span>
    );
  };

  const sectionTabs: Array<{
    id: SettingsSectionTab;
    label: string;
    shortDesc: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'account',
      label: 'Conta e Segurança',
      shortDesc: 'CPF lembrado, PIN e biometria',
      icon: Shield,
    },
    {
      id: 'data',
      label: 'Dados Locais',
      shortDesc: 'Cofre offline, backup 24h e JSON',
      icon: Database,
    },
    {
      id: 'categories',
      label: 'Categorias e Grade',
      shortDesc: 'Categorias, linhas e recorrências',
      icon: Sliders,
    },
    {
      id: 'app',
      label: 'Permissões e App',
      shortDesc: 'Permissões, calendário e versão',
      icon: Smartphone,
    },
  ];

  return (
    <div className="space-y-5 pb-4 sm:pb-6">
      {/* Compact Header & 4 Intuitive Section Cards */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {sectionTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`p-3.5 rounded-xl border text-left transition-colors min-h-[76px] h-full w-full flex flex-col justify-between gap-2 ${
                isActive
                  ? 'bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F] border-slate-900 dark:border-[#C9A86A]/60 shadow-xs'
                  : 'bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-200 border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 mt-0.5 ${
                    isActive ? 'text-[#E5C88F]' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                <span className="text-xs font-semibold leading-snug break-words min-w-0">
                  {tab.label}
                </span>
              </div>
              <span
                className={`text-[11px] leading-snug break-words ${
                  isActive ? 'text-slate-300 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {tab.shortDesc}
              </span>
            </button>
          );
        })}
      </div>

      {/* ==================== 1. CONTA E SEGURANÇA ==================== */}
      {activeTab === 'account' && (
        <div className="space-y-4">
          {secFeedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start sm:items-center gap-2.5 ${
                secFeedback.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
              }`}
            >
              {secFeedback.type === 'ok' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" />
              )}
              <span className="min-w-0 flex-1 leading-snug break-words">{secFeedback.text}</span>
            </div>
          )}

          {/* Conta & CPF Lembrado */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                  Conta e Acesso Lembrado
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug break-words">
                  Sua conta e seu cofre permanecem salvos neste aparelho mesmo após atualizar o app.
                </p>
              </div>
              {renderKycStatusLabel(profile.kycStatus)}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                  {profile.fullName}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums leading-snug break-all sm:break-words">
                  CPF lembrado: {rememberedCpfInfo ? rememberedCpfInfo.maskedCpf : profile.maskedCpf}
                  {profile.username ? ` · @${profile.username}` : ''}
                </div>
              </div>
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
                  className="self-start sm:self-auto min-h-[36px] inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                >
                  {t.settings.security.forgetCpf}
                </button>
              )}
            </div>

            <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[48px] rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-snug break-words">
                  {t.settings.security.maskCpfOnLogin}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                  Mostra o CPF parcialmente oculto na tela inicial de entrada.
                </div>
              </div>
              <input
                type="checkbox"
                checked={maskSavedCpfOnLogin}
                onChange={(e) => {
                  const next = e.target.checked;
                  setMaskSavedCpfOnLogin(next);
                  saveLastCpfPrivacyMask(next);
                }}
                className="h-4 w-4 accent-[#C9A86A] shrink-0"
              />
            </label>
          </div>

          {/* Acesso Rápido: Biometria, PIN e Bloqueio */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-start sm:items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-[#C9A86A] shrink-0" />
                  <span className="leading-snug break-words">Acesso Rápido por Biometria e PIN</span>
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug break-words">
                  Desbloqueie o cofre com digital/rosto ou PIN sem redigitar todo o cadastro.
                </p>
              </div>
              <span
                className={`text-xs font-semibold shrink-0 whitespace-nowrap ${
                  biometric.enabled
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {biometric.enabled ? 'Biometria ativa' : 'Apenas PIN'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
              <button
                type="button"
                disabled={secBusy}
                onClick={handleEnrollOrReenrollBiometric}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 disabled:opacity-40 text-center break-words sm:whitespace-nowrap shrink-0"
              >
                <Fingerprint className="h-3.5 w-3.5 shrink-0" />
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
                  className="w-full sm:w-auto px-3.5 py-2.5 min-h-[42px] rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08] text-center break-words sm:whitespace-nowrap shrink-0"
                >
                  {t.settings.security.testBio}
                </button>
              )}

              {biometric.enabled && (
                <button
                  type="button"
                  disabled={secBusy}
                  onClick={handleDisableBiometric}
                  className="w-full sm:w-auto px-3 py-2.5 min-h-[42px] rounded-lg text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-950/30 text-center break-words sm:whitespace-nowrap shrink-0"
                >
                  {t.settings.security.disableBio}
                </button>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {t.settings.security.autoLock}
                </label>
                <select
                  value={settings.autoLockMinutes}
                  onChange={(e) => onUpdateSettings({ autoLockMinutes: Number(e.target.value) })}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value={5}>5 {t.settings.security.minutesSuffix}</option>
                  <option value={15}>15 {t.settings.security.minutesSuffix}</option>
                  <option value={30}>30 {t.settings.security.minutesSuffix}</option>
                  <option value={60}>60 {t.settings.security.minutesSuffix}</option>
                </select>
              </div>

              <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[44px] sm:self-end rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 min-w-0 flex-1 leading-snug break-words">
                  {t.settings.security.hideOnOpen}
                </span>
                <input
                  type="checkbox"
                  checked={settings.privacyDefaultOnBoot}
                  onChange={(e) =>
                    onUpdateSettings({ privacyDefaultOnBoot: e.target.checked })
                  }
                  className="h-4 w-4 accent-[#C9A86A] shrink-0"
                />
              </label>

              <label className="sm:col-span-2 flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[48px] rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-snug break-words">
                    {t.settings.security.lockOnBackground}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                    Exige PIN ou biometria ao retornar para o app.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.lockOnBackground)}
                  onChange={(e) =>
                    onUpdateSettings({ lockOnBackground: e.target.checked })
                  }
                  className="h-4 w-4 accent-[#C9A86A] shrink-0"
                />
              </label>
            </div>
          </div>

          {/* Redefinição Segura & Dados Cadastrais (blocos recolhíveis) */}
          <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] divide-y divide-slate-100 dark:divide-white/[0.06]">
            {/* Alterar PIN */}
            <div>
              <button
                type="button"
                onClick={() => setShowPinSection((v) => !v)}
                className="w-full min-h-[56px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <KeyRound className="h-4 w-4 text-[#C9A86A] shrink-0 mt-0.5 sm:mt-0" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                      Redefinir PIN de acesso
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                      Altera seu código numérico de 4 a 6 dígitos com segurança.
                    </div>
                  </div>
                </div>
                {showPinSection ? (
                  <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                )}
              </button>

              {showPinSection && (
                <form onSubmit={handleChangePin} className="px-4 sm:px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
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
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono text-center bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
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
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono text-center bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
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
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono text-center bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-3">
                    <button
                      type="submit"
                      disabled={secBusy}
                      className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 disabled:opacity-40"
                    >
                      {t.settings.security.updatePinBtn}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Usuário e Senha */}
            <div>
              <button
                type="button"
                onClick={() => setShowCredentialsSection((v) => !v)}
                className="w-full min-h-[56px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <Shield className="h-4 w-4 text-[#C9A86A] shrink-0 mt-0.5 sm:mt-0" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                      Usuário e Senha ({profile.hasPasswordLogin ? 'Ativa' : 'Opcional'})
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                      Configure login alternativo com usuário e senha para recuperação.
                    </div>
                  </div>
                </div>
                {showCredentialsSection ? (
                  <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                )}
              </button>

              {showCredentialsSection && (
                <form onSubmit={handleSaveCredentials} className="px-4 sm:px-5 pb-5 space-y-3">
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
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
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
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
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
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
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
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={secBusy}
                    className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 disabled:opacity-40"
                  >
                    {profile.hasPasswordLogin ? 'Atualizar usuário e senha' : 'Ativar usuário e senha'}
                  </button>
                </form>
              )}
            </div>

            {/* Dados Cadastrais Pré-Salvos */}
            <div>
              <button
                type="button"
                onClick={() => setShowCadastralSection((v) => !v)}
                className="w-full min-h-[56px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <UserCheck className="h-4 w-4 text-[#C9A86A] shrink-0 mt-0.5 sm:mt-0" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                      Dados Cadastrais do Titular
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                      Mantém nome, e-mail e telefone salvos para preenchimento automático.
                    </div>
                  </div>
                </div>
                {showCadastralSection ? (
                  <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                )}
              </button>

              {showCadastralSection && (
                <form onSubmit={handleSaveProfileCadastral} className="px-4 sm:px-5 pb-5 space-y-3">
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
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
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
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
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
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
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
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
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
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1]"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <button
                      type="submit"
                      disabled={secBusy}
                      className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 disabled:opacity-40"
                    >
                      Salvar dados cadastrais
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearCadastralDraft();
                        setSecFeedback({
                          type: 'ok',
                          text: 'Rascunho local de preenchimento automático limpo deste aparelho.',
                        });
                      }}
                      className="min-h-[38px] px-2 py-1.5 text-left sm:text-right text-[11px] text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                    >
                      Limpar rascunho local
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Verificação de Documento (KYC) */}
            <div>
              <button
                type="button"
                onClick={() => setShowKycSection((v) => !v)}
                className="w-full min-h-[56px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <FileCheck2 className="h-4 w-4 text-[#C9A86A] shrink-0 mt-0.5 sm:mt-0" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                      {t.settings.security.kycTitle}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                      {profile.kycStatus === 'verified'
                        ? `Documento ${profile.kycDocumentType ?? 'ID'} ••••${profile.kycDocumentLast4 ?? ''} validado`
                        : 'Valide os 4 últimos dígitos do documento para proteção adicional.'}
                    </div>
                  </div>
                </div>
                {showKycSection ? (
                  <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                )}
              </button>

              {showKycSection && (
                <div className="px-4 sm:px-5 pb-5">
                  {profile.kycStatus === 'verified' ? (
                    <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 leading-snug break-words">
                      <span>
                        {t.settings.security.kycConfirmedPrefix} {profile.kycDocumentType ?? 'ID'}{' '}
                        {profile.kycDocumentLast4
                          ? `(${t.settings.security.kycLast4Prefix} ••••${profile.kycDocumentLast4})`
                          : ''}{' '}
                        {t.settings.security.kycConfirmedSuffix}
                      </span>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      <div className="sm:col-span-4">
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          {t.settings.security.officialDoc}
                        </label>
                        <select
                          value={kycDocType}
                          onChange={(e) => setKycDocType(e.target.value as KycDocumentType)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
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
                          className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono tracking-widest bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                        />
                      </div>
                      <div className="sm:col-span-5">
                        <button
                          type="button"
                          disabled={kycBusy}
                          onClick={handleVerifyKyc}
                          className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 disabled:opacity-40"
                        >
                          <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. DADOS E ARMAZENAMENTO LOCAL ==================== */}
      {activeTab === 'data' && (
        <div className="space-y-4">
          {dataFeedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start sm:items-center gap-2.5 ${
                dataFeedback.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
              }`}
            >
              {dataFeedback.type === 'ok' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" />
              )}
              <span className="min-w-0 flex-1 leading-snug break-words">{dataFeedback.text}</span>
            </div>
          )}

          {/* Modo 100% Local & Regras de Saldo */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-3">
            <div className="flex flex-wrap items-start sm:items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 min-w-0 flex-1">
                <Database className="h-4 w-4 text-[#C9A86A] shrink-0" />
                <span className="leading-snug break-words">Armazenamento 100% Local e Regras de Saldo</span>
              </h3>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap shrink-0">
                Offline ativo
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06] space-y-1">
                <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                  Sem servidor de sincronização
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                  Todos os lançamentos, categorias e configurações ficam salvos direto no aparelho (IndexedDB + localStorage), sem depender de internet.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06] space-y-1">
                <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                  Saldo transportado e Caixinha isolada
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                  O saldo positivo não gasto do mês anterior soma no disponível do mês seguinte; valores guardados na Caixinha ficam separados do gasto livre.
                </p>
              </div>
            </div>
          </div>

          {/* Backup Automático 24h */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-start sm:items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#C9A86A] shrink-0" />
                  <span className="leading-snug break-words">Backup Automático a cada 24 horas</span>
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug break-words">
                  Cria cópias locais automáticas sem senhas ou PINs para restauração rápida.
                </p>
              </div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap shrink-0">
                Ativo (24h)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06]">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Último backup local
                </span>
                <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100 break-words">
                  {autoBackupStatus?.lastAutoBackupAt
                    ? new Date(autoBackupStatus.lastAutoBackupAt).toLocaleString(
                        getIntlLocale(settings.language)
                      )
                    : 'Aguardando execução inicial'}
                </strong>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06]">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Próximo backup automático
                </span>
                <strong className="font-mono tabular-nums text-[#A68342] dark:text-[#E5C88F] break-words">
                  {autoBackupStatus && autoBackupStatus.msRemaining > 0
                    ? `Em ${Math.floor(autoBackupStatus.msRemaining / 3600000)}h ${Math.floor(
                        (autoBackupStatus.msRemaining % 3600000) / 60000
                      )}m`
                    : 'Em execução / Imediato'}
                </strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await onRunManualBackupNow();
                  await reloadSnapshots();
                  setDataFeedback({
                    type: 'ok',
                    text: 'Snapshot de backup salvo no armazenamento local deste aparelho.',
                  });
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                <span>Fazer backup agora</span>
              </button>
            </div>

            {localSnapshots.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Cópias locais recentes ({localSnapshots.length})
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                  {localSnapshots.map((snap) => (
                    <div
                      key={`loc-${snap.id}`}
                      className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 flex-1">
                        <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 break-words">
                          {new Date(snap.savedAt).toLocaleString(getIntlLocale(settings.language))}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          · {snap.source === 'auto_24h' ? 'Auto 24h' : 'Manual'} ·{' '}
                          {Math.max(1, Math.round(snap.sizeBytes / 1024))} KB
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const parsed = parseBackupSnapshotState(snap.payloadJson);
                          if (!parsed) {
                            setDataFeedback({
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
                        className="w-full sm:w-auto min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 text-[11px] font-semibold hover:opacity-90 text-center whitespace-nowrap shrink-0"
                      >
                        Restaurar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cópia de Segurança Local (.json) — sem duplicar planilhas ou PDF */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                Cópia de Segurança Local (.json)
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug break-words">
                Exporte ou restaure seu cofre completo em arquivo JSON. Planilhas (CSV/Excel) e relatórios em PDF ficam na aba Download.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const res = exportVaultBackupJSON(state, profile);
                  setDataFeedback({
                    type: 'ok',
                    text: `Arquivo de backup "${res.filename}" exportado sem dados sensíveis.`,
                  });
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90 text-center sm:whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span>Exportar Backup (.json)</span>
              </button>

              <button
                type="button"
                onClick={() => jsonFileInputRef.current?.click()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 text-center sm:whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5 shrink-0" />
                <span>Restaurar Backup (.json)</span>
              </button>

              <input
                ref={jsonFileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleJsonBackupFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Manutenção da Base Local (recolhível) */}
          <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => setShowMaintenanceSection((v) => !v)}
              className="w-full min-h-[56px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                  Manutenção e Reinicialização de Dados
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                  Simular recuperação de atualização, carregar exemplo ou zerar lançamentos.
                </div>
              </div>
              {showMaintenanceSection ? (
                <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
              )}
            </button>

            {showMaintenanceSection && (
              <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06] flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={onTestReinstallRecovery}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[40px] rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08] text-center"
                >
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  <span>{t.settings.security.simulateReinstallBtn}</span>
                </button>

                {!confirmLoadDemo ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmLoadDemo(true);
                      setConfirmClearAll(false);
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[40px] rounded-lg text-xs font-medium border border-[#C9A86A]/40 text-[#8C6A2E] dark:text-[#E5C88F] hover:bg-[#C9A86A]/10 text-center"
                  >
                    <Database className="h-3.5 w-3.5 shrink-0" />
                    <span>{t.settings.security.loadDemoBtn}</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        onLoadDemo2026Data();
                        setConfirmLoadDemo(false);
                        setDataFeedback({
                          type: 'ok',
                          text: t.settings.security.msgDemoLoaded,
                        });
                      }}
                      className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#C9A86A] text-[#090D16]"
                    >
                      {t.settings.security.confirmLoadDemoBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmLoadDemo(false)}
                      className="min-h-[40px] px-3 py-2 rounded-lg text-xs text-slate-500"
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
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[40px] rounded-lg text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-950/30 text-center"
                  >
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    <span>{t.settings.security.clearAllBtn}</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        onClearOperationalData();
                        setConfirmClearAll(false);
                        setDataFeedback({
                          type: 'ok',
                          text: t.settings.security.msgClearedAll,
                        });
                      }}
                      className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500"
                    >
                      {t.settings.security.confirmClearAllBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="min-h-[40px] px-3 py-2 rounded-lg text-xs text-slate-500"
                    >
                      {t.settings.security.cancelBtn}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== 3. CATEGORIAS, GRADE E RECORRÊNCIAS ==================== */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          {/* Gerenciamento Completo de Categorias & Linhas da Grade */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-start sm:items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                  Categorias e Linhas da Grade
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug break-words">
                  Crie, busque, personalize cor e ícone, reordene ou exclua categorias sem exigir datas.
                </p>
              </div>
              <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
                {rows.length} categoria(s)
              </span>
            </div>

            {/* Criar Nova Categoria (Sem Data) */}
            <form
              onSubmit={handleCreateRow}
              className="p-3.5 sm:p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.07] space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <select
                  value={newRowBlock}
                  onChange={(e) => {
                    const nextBlock = e.target.value as BlockType;
                    setNewRowBlock(nextBlock);
                    setNewRowColor(getDefaultCategoryColor(nextBlock));
                    setNewRowIcon(getDefaultCategoryIcon(nextBlock));
                  }}
                  className="w-full sm:w-auto min-h-[40px] px-3 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value="income">{t.settings.grid.blockIncome}</option>
                  <option value="fixed">{t.settings.grid.blockFixed}</option>
                  <option value="variable">{t.settings.grid.blockVariable}</option>
                  <option value="savings">{t.settings.grid.blockSavings}</option>
                </select>
                <input
                  type="text"
                  value={newRowName}
                  onChange={(e) => setNewRowName(e.target.value)}
                  placeholder={t.settings.grid.newRowPlaceholder}
                  className="w-full sm:flex-1 min-w-0 min-h-[40px] px-3 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span>{t.settings.grid.createRowBtn}</span>
                </button>
              </div>

              <CategoryVisualPicker
                color={newRowColor}
                icon={newRowIcon}
                onChangeColor={setNewRowColor}
                onChangeIcon={setNewRowIcon}
              />
            </form>

            {/* Busca em Tempo Real + Filtro por Bloco */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Buscar categoria por nome..."
                  aria-label="Buscar categoria por nome"
                  className="w-full min-h-[40px] pl-8 pr-16 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white placeholder:text-slate-400"
                />
                {categorySearch && (
                  <button
                    type="button"
                    onClick={() => setCategorySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: `Todas (${rows.length})` },
                    {
                      id: 'income',
                      label: `${t.settings.grid.blockIncome} (${
                        rows.filter((r) => r.block === 'income').length
                      })`,
                    },
                    {
                      id: 'fixed',
                      label: `${t.settings.grid.blockFixed} (${
                        rows.filter((r) => r.block === 'fixed').length
                      })`,
                    },
                    {
                      id: 'variable',
                      label: `${t.settings.grid.blockVariable} (${
                        rows.filter((r) => r.block === 'variable').length
                      })`,
                    },
                    {
                      id: 'savings',
                      label: `${t.settings.grid.blockSavings} (${
                        rows.filter((r) => r.block === 'savings').length
                      })`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRowBlockFilter(tab.id)}
                    className={`min-h-[34px] px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      rowBlockFilter === tab.id
                        ? 'bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] border-transparent'
                        : 'bg-slate-50 dark:bg-[#0D1320] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.08]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista Filtrada de Categorias */}
            <div className="divide-y divide-slate-100 dark:divide-white/[0.05] max-h-[440px] overflow-y-auto pr-0.5">
              {filteredCategoryList.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Nenhuma categoria encontrada para o filtro atual.
                </div>
              ) : (
                filteredCategoryList.map((row) => {
                  const visual = getCategoryVisual(row);
                  const isEditingVisual = editingVisualRowId === row.id;

                  return (
                    <div key={row.id} className="py-3 space-y-2.5 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex flex-wrap min-[400px]:flex-nowrap items-center gap-2 w-full sm:flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingVisualRowId(isEditingVisual ? null : row.id)
                            }
                            title="Alterar cor e ícone"
                            className={`min-h-[36px] min-w-[36px] flex items-center justify-center p-1 rounded-lg border transition-colors shrink-0 ${
                              isEditingVisual
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                                : 'border-transparent hover:border-slate-200 dark:hover:border-white/15'
                            }`}
                          >
                            <CategoryIconBadge row={row} size="sm" />
                          </button>

                          <select
                            aria-label={`Bloco de ${row.name}`}
                            value={row.block}
                            onChange={(e) =>
                              onUpdateRow(row.id, { block: e.target.value as BlockType })
                            }
                            className="min-h-[36px] max-w-full px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1A2234] text-[10px] font-medium uppercase text-slate-600 dark:text-slate-300 border border-transparent focus:border-[#C9A86A] shrink-0"
                          >
                            <option value="income">{t.settings.grid.blockIncome}</option>
                            <option value="fixed">{t.settings.grid.blockFixed}</option>
                            <option value="variable">{t.settings.grid.blockVariable}</option>
                            <option value="savings">{t.settings.grid.blockSavings}</option>
                          </select>

                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => onUpdateRow(row.id, { name: e.target.value })}
                            className="flex-1 min-w-[140px] w-full min-[400px]:w-auto min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-50/70 dark:bg-[#0D1320]/70 sm:bg-transparent border border-slate-200/70 dark:border-white/[0.08] sm:border-transparent hover:border-slate-200 dark:hover:border-white/10 focus:border-[#C9A86A] text-slate-900 dark:text-slate-100 font-medium"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-start sm:justify-end shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateRow(row.id, { isRecurring: !row.isRecurring })
                            }
                            title="Marcar ou desmarcar como item recorrente"
                            className={`inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                              row.isRecurring
                                ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <Repeat className="h-3 w-3 shrink-0" />
                            <span>{row.isRecurring ? 'Recorrente' : 'Avulsa'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setEditingVisualRowId(isEditingVisual ? null : row.id)
                            }
                            className={`min-h-[34px] px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                              isEditingVisual
                                ? 'border-blue-500/40 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-300'
                                : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                            }`}
                          >
                            Cor/Ícone
                          </button>
                          <button
                            type="button"
                            onClick={() => onMoveRow(row.id, 'up')}
                            title="Mover para cima"
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onMoveRow(row.id, 'down')}
                            title="Mover para baixo"
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateRow(row.id, { hidden: !row.hidden })}
                            className={`inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1.5 rounded-lg border text-[11px] whitespace-nowrap shrink-0 ${
                              row.hidden
                                ? 'border-amber-500/40 text-amber-600 dark:text-amber-300'
                                : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <Eye className="h-3 w-3 shrink-0" />
                            <span>
                              {row.hidden ? t.settings.grid.hiddenLabel : t.settings.grid.visibleLabel}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteRow(row.id)}
                            title={`Excluir categoria ${row.name}`}
                            aria-label={`Excluir categoria ${row.name}`}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {isEditingVisual && (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-3">
                          <CategoryVisualPicker
                            color={visual.color}
                            icon={visual.iconKey}
                            onChangeColor={(nextColor) => onUpdateRow(row.id, { color: nextColor })}
                            onChangeIcon={(nextIcon) => onUpdateRow(row.id, { icon: nextIcon })}
                          />
                          {(row.block === 'fixed' || row.block === 'variable') && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-white/[0.06]">
                              <span className="min-w-0 flex-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                                Teto mensal de alerta (opcional) · Média atual:{' '}
                                <strong className="font-mono tabular-nums">
                                  {formatBRL(totals.rowAverage[row.id] ?? 0, settings.privacyMode)}
                                </strong>
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="10"
                                value={row.alertLimit ?? ''}
                                placeholder={t.settings.monitoring.noLimitPlaceholder}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  onUpdateRow(row.id, {
                                    alertLimit: isNaN(v) || v <= 0 ? undefined : v,
                                  });
                                }}
                                className="w-full sm:w-28 min-h-[36px] px-2.5 py-1.5 rounded-md text-right text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white shrink-0"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Preferências da Grade */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] grid grid-cols-1 md:grid-cols-3 gap-4">
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
                className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
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
                className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
              >
                <option value="both">{t.settings.grid.varBoth}</option>
                <option value="currency">{t.settings.grid.varCurrency}</option>
                <option value="percent">{t.settings.grid.varPercent}</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center justify-between gap-3 w-full min-h-[44px] px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 min-w-0 flex-1 leading-snug break-words">
                  {t.settings.grid.showZeroMonths}
                </span>
                <input
                  type="checkbox"
                  checked={settings.showZeroMonths}
                  onChange={(e) => onUpdateSettings({ showZeroMonths: e.target.checked })}
                  className="h-4 w-4 accent-[#C9A86A] shrink-0"
                />
              </label>
            </div>
          </div>

          {/* Regras Automáticas & Itens Recorrentes (com busca de categoria) */}
          <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => setShowRulesPanel((v) => !v)}
              className="w-full min-h-[56px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                  Regras Automáticas ({rules.length}) e Categorias Recorrentes ({recurringRows.length})
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                  Associe palavras-chave às categorias com busca rápida e confira itens recorrentes.
                </div>
              </div>
              {showRulesPanel ? (
                <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
              )}
            </button>

            {showRulesPanel && (
              <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-5">
                <form onSubmit={handleCreateRule} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                        Palavra-chave na descrição
                      </label>
                      <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        placeholder={t.settings.monitoring.keywordPlaceholder}
                        className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1 leading-snug break-words">
                        Buscar categoria destino ({selectedRuleTargetRow?.name ?? 'Selecionar'})
                      </label>
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="search"
                          value={ruleCategorySearch}
                          onChange={(e) => setRuleCategorySearch(e.target.value)}
                          placeholder="Filtrar categoria destino..."
                          aria-label="Filtrar categoria destino da regra"
                          className="w-full min-h-[40px] pl-8 pr-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#0D1320] divide-y divide-slate-100 dark:divide-white/[0.05]">
                    {filteredRuleTargetRows.length === 0 ? (
                      <div className="p-2.5 text-center text-xs text-slate-500 dark:text-slate-400">
                        Nenhuma categoria encontrada para "{ruleCategorySearch}".
                      </div>
                    ) : (
                      filteredRuleTargetRows.map((r) => {
                        const active = r.id === newRuleRowId;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setNewRuleRowId(r.id)}
                            className={`w-full min-h-[38px] px-3 py-2 flex items-center justify-between gap-2 text-left text-xs ${
                              active
                                ? 'bg-blue-50 dark:bg-blue-950/35 text-blue-900 dark:text-blue-100 font-semibold'
                                : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-[#151E30]'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2 min-w-0 flex-1">
                              <CategoryIconBadge row={r} size="xs" />
                              <span className="truncate">{r.name}</span>
                            </span>
                            {active && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span>{t.settings.monitoring.addRule}</span>
                  </button>
                </form>

                {rules.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {rules.map((rule) => {
                      const target = rows.find((r) => r.id === rule.targetRowId);
                      return (
                        <div
                          key={rule.id}
                          className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-2.5 text-xs"
                        >
                          <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={() => onToggleRule(rule.id)}
                              className="h-4 w-4 accent-[#C9A86A] shrink-0"
                            />
                            <span className="min-w-0 flex-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-snug">
                              <span className="font-mono text-slate-900 dark:text-slate-100 break-all">
                                "{rule.keyword}"
                              </span>
                              <span className="text-slate-400 shrink-0">→</span>
                              <span className="font-medium text-[#A68342] dark:text-[#E5C88F] break-words">
                                {target?.name ?? 'OUTROS'}
                              </span>
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => onDeleteRule(rule.id)}
                            aria-label={`Remover regra ${rule.keyword}`}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {recurringRows.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-2">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Categorias marcadas como recorrentes ({recurringRows.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {recurringRows.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between gap-2.5 min-h-[42px] px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]"
                        >
                          <span className="inline-flex items-center gap-2 text-slate-800 dark:text-slate-200 min-w-0 flex-1">
                            <CategoryIconBadge row={r} size="xs" />
                            <span className="leading-snug break-words">{r.name}</span>
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
                            {formatBRL(totals.rowAverage[r.id] ?? 0, settings.privacyMode)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Metas de Economia (recolhível, abre automaticamente quando acionado pelo Painel) */}
          <div
            ref={goalsSectionRef}
            className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]"
          >
            <button
              type="button"
              onClick={() => setShowGoalsPanel((v) => !v)}
              className="w-full min-h-[56px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left"
            >
              <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                <Target className="h-4 w-4 text-[#C9A86A] shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                    Metas de Economia ({goals.length})
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                    Objetivos por mês e ano (2026, 2027, 2028+) acompanhados na Caixinha ou Resultado.
                  </div>
                </div>
              </div>
              {showGoalsPanel ? (
                <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
              )}
            </button>

            {showGoalsPanel && (
              <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-4">
                <form
                  onSubmit={handleCreateGoal}
                  className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end"
                >
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      {t.settings.goals.titleLabel}
                    </label>
                    <input
                      type="text"
                      value={goalTitle}
                      onChange={(e) => setGoalTitle(e.target.value)}
                      placeholder={t.settings.goals.titlePlaceholder}
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
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
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      {t.settings.goals.deadlineLabel}
                    </label>
                    <select
                      value={goalMonth}
                      onChange={(e) => setGoalMonth(Number(e.target.value))}
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
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
                      Ano
                    </label>
                    <input
                      type="number"
                      min="1900"
                      max="9999"
                      required
                      value={goalYear}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v)) setGoalYear(v);
                      }}
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      {t.settings.goals.baseLabel}
                    </label>
                    <select
                      value={goalMode}
                      onChange={(e) => setGoalMode(e.target.value as SavingsGoal['trackingMode'])}
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    >
                      <option value="result">{t.settings.goals.baseResult}</option>
                      <option value="savings">{t.settings.goals.baseSavings}</option>
                      <option value="combined">{t.settings.goals.baseCombined}</option>
                    </select>
                  </div>
                  <div className="sm:col-span-6">
                    <button
                      type="submit"
                      className="w-full sm:w-auto min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      <span>{t.settings.goals.createBtn}</span>
                    </button>
                  </div>
                </form>

                {goals.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t.settings.goals.noGoals}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {goals.map((g) => {
                      const prog = computeGoalProgress(
                        g,
                        totals,
                        g.deadlineYear || settings.activeYear
                      );
                      return (
                        <div
                          key={g.id}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-2.5"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <input
                              type="text"
                              value={g.title}
                              onChange={(e) => onUpdateGoal(g.id, { title: e.target.value })}
                              className="w-full sm:flex-1 min-w-0 min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                            />
                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
                                className="w-24 min-h-[36px] px-2 py-1.5 rounded-lg text-right text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                              />
                              <input
                                type="number"
                                min="1900"
                                max="9999"
                                value={g.deadlineYear}
                                onChange={(e) => {
                                  const yr = parseInt(e.target.value, 10);
                                  if (Number.isFinite(yr) && yr >= 1900 && yr <= 9999) {
                                    onUpdateGoal(g.id, { deadlineYear: yr });
                                  }
                                }}
                                aria-label="Ano da meta"
                                className="w-20 min-h-[36px] px-2 py-1.5 rounded-lg text-center text-xs font-mono bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                              />
                              <select
                                value={g.trackingMode}
                                onChange={(e) =>
                                  onUpdateGoal(g.id, {
                                    trackingMode: e.target.value as SavingsGoal['trackingMode'],
                                  })
                                }
                                className="flex-1 sm:flex-none min-w-[120px] min-h-[36px] px-2 py-1.5 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1]"
                              >
                                <option value="result">{t.settings.goals.baseResult}</option>
                                <option value="savings">{t.settings.goals.baseSavings}</option>
                                <option value="combined">{t.settings.goals.baseCombined}</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => onDeleteGoal(g.id)}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                                title={t.settings.goals.removeGoal}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
                              <div
                                style={{ width: `${prog.pct}%` }}
                                className={`h-full ${
                                  prog.status === 'achieved' ? 'bg-emerald-500' : 'bg-[#C9A86A]'
                                }`}
                              />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              <span>
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
            )}
          </div>
        </div>
      )}

      {/* ==================== 4. PERMISSÕES E APP ==================== */}
      {activeTab === 'app' && (
        <div className="space-y-4">
          {/* Permissões do Aparelho */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="leading-snug break-words">
                    Permissões ({permissionsSnapshot?.platform === 'android' ? 'Android' : 'Navegador'})
                  </span>
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug break-words">
                  Notificações, microfone para lançamento por voz e acesso a arquivos para backups.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={permBusy}
                  onClick={() => void handleRequestPermissionItem('all')}
                  className="w-full sm:w-auto min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 text-center sm:whitespace-nowrap shrink-0"
                >
                  {permBusy ? 'Solicitando...' : 'Solicitar Permissões'}
                </button>
                {(isAndroidNativeApp() || permissionsSnapshot?.requiresSettings) && (
                  <button
                    type="button"
                    onClick={() => void openNativeAppSettings()}
                    className="w-full sm:w-auto min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.08] text-center sm:whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span>Ajustes do App</span>
                  </button>
                )}
              </div>
            </div>

            {permissionsSnapshot && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      <Bell className="h-3.5 w-3.5 text-[#C9A86A] shrink-0" />
                      <span className="break-words">Notificações</span>
                      <span aria-hidden="true">·</span>
                      {renderPermissionStatusText(permissionsSnapshot.notifications)}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                      Avisos de vencimentos e contas próximas.
                    </p>
                  </div>
                  {permissionsSnapshot.notifications !== 'granted' &&
                    permissionsSnapshot.notifications !== 'unsupported' && (
                      <button
                        type="button"
                        disabled={permBusy}
                        onClick={() => void handleRequestPermissionItem('notifications')}
                        className="w-full sm:w-auto min-h-[38px] px-3.5 py-2 rounded-lg text-xs sm:text-[11px] font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] text-center shrink-0"
                      >
                        Ativar
                      </button>
                    )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      <Mic className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="break-words">Microfone (Voz)</span>
                      <span aria-hidden="true">·</span>
                      {renderPermissionStatusText(permissionsSnapshot.microphone)}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                      Ditado contínuo para novos lançamentos.
                    </p>
                  </div>
                  {permissionsSnapshot.microphone !== 'granted' &&
                    permissionsSnapshot.microphone !== 'unsupported' && (
                      <button
                        type="button"
                        disabled={permBusy}
                        onClick={() => void handleRequestPermissionItem('microphone')}
                        className="w-full sm:w-auto min-h-[38px] px-3.5 py-2 rounded-lg text-xs sm:text-[11px] font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] text-center shrink-0"
                      >
                        Ativar
                      </button>
                    )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      <FolderCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="break-words">Arquivos e Armazenamento</span>
                      <span aria-hidden="true">·</span>
                      {renderPermissionStatusText(permissionsSnapshot.storage)}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                      Salvar backups JSON, planilhas e relatórios PDF.
                    </p>
                  </div>
                  {permissionsSnapshot.storage !== 'granted' &&
                    permissionsSnapshot.storage !== 'unsupported' && (
                      <button
                        type="button"
                        disabled={permBusy}
                        onClick={() => void handleRequestPermissionItem('storage')}
                        className="w-full sm:w-auto min-h-[38px] px-3.5 py-2 rounded-lg text-xs sm:text-[11px] font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] text-center shrink-0"
                      >
                        Ativar
                      </button>
                    )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      <Fingerprint className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="break-words">Biometria</span>
                      <span aria-hidden="true">·</span>
                      {renderPermissionStatusText(permissionsSnapshot.biometrics)}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                      {permissionsSnapshot.biometricsLabel} ·{' '}
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Wifi className="h-3 w-3 inline shrink-0" />
                        {permissionsSnapshot.networkOnline ? 'Online' : 'Offline'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {permissionsSnapshot?.requiresSettings && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 leading-snug break-words">
                Alguma permissão foi negada anteriormente.{' '}
                {isAndroidNativeApp()
                  ? 'Toque em "Ajustes do App" acima para liberar em Permissões.'
                  : 'Libere o acesso nas permissões do site no navegador.'}
              </div>
            )}
          </div>

          {/* Alertas & Calendário Contínuo */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#C9A86A] shrink-0" />
              <span className="leading-snug break-words">Alertas e Calendário Contínuo</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Antecedência dos alertas
                </label>
                <select
                  value={settings.alertLeadDays ?? 3}
                  onChange={(e) => onUpdateSettings({ alertLeadDays: Number(e.target.value) })}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                >
                  <option value={1}>1 dia antes</option>
                  <option value={3}>3 dias antes</option>
                  <option value={5}>5 dias antes</option>
                  <option value={7}>7 dias antes</option>
                  <option value={10}>10 dias antes</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {t.settings.monitoring.anomalySensitivity}
                </label>
                <input
                  type="number"
                  min="10"
                  max="200"
                  value={settings.anomalyThresholdPct}
                  onChange={(e) =>
                    onUpdateSettings({
                      anomalyThresholdPct: Math.max(10, Number(e.target.value) || 45),
                    })
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center justify-between gap-3 w-full min-h-[44px] px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] cursor-pointer">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 min-w-0 flex-1 leading-snug break-words">
                    {t.settings.monitoring.alertsInCenter}
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.notificationsEnabled}
                    onChange={(e) => onUpdateSettings({ notificationsEnabled: e.target.checked })}
                    className="h-4 w-4 accent-[#C9A86A] shrink-0"
                  />
                </label>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                    Calendário Contínuo Ilimitado (2026, 2027, 2028+)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                    Meses, recorrências, metas e saldos avançam sem limite de ano. Alertas ativos no painel: {alerts.length}.
                  </div>
                </div>
              </div>
              <span className="font-mono tabular-nums text-xs font-semibold text-slate-800 dark:text-slate-200 shrink-0 whitespace-nowrap">
                Ano em foco: {settings.activeYear}
              </span>
            </div>
          </div>

          {/* Idioma do Aplicativo */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="h-4 w-4 text-[#C9A86A] shrink-0" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                  {t.settings.languageCardTitle}
                </h3>
              </div>
              {langNotice && (
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 leading-snug break-words">
                  {langNotice}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                    className={`min-h-[54px] px-3.5 py-2.5 rounded-lg border text-left transition-colors flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F] border-slate-900 dark:border-[#C9A86A]/50'
                        : 'bg-slate-50 dark:bg-[#0D1320] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/[0.08]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold leading-snug break-words">
                        {opt.nativeLabel}
                      </div>
                      <div
                        className={`text-[10px] font-mono ${
                          isSelected ? 'opacity-80' : 'text-slate-400'
                        }`}
                      >
                        {opt.codeLabel}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-semibold text-[#E5C88F] shrink-0 whitespace-nowrap">
                        {t.settings.languageActiveLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Versão e Build do App */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                ORBE Finanças · {APP_VERSION_LABEL}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono leading-snug break-all sm:break-words">
                {ANDROID_PACKAGE_ID} · {isAndroidNativeApp() ? 'Android APK' : 'Web Local'}
              </div>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words sm:text-right">
              Atualização por cima preserva conta, PIN e dados locais.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
