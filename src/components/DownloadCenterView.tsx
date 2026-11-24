import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Download,
  ExternalLink,
  Copy,
  Check,
  FileJson,
  Terminal,
  ShieldCheck,
  RefreshCw,
  QrCode,
  PackageCheck,
} from 'lucide-react';
import { AppLanguage, AppState, UserProfile } from '../types/finance';
import { getApiEndpoint } from '../utils/vaultApi';
import { buildSanitizedBackupPayload, triggerJsonBlobDownload } from '../utils/backup';

interface ApkStatusResponse {
  available: boolean;
  filename: string;
  sizeBytes: number;
  updatedAt: string | null;
  githubRepo: string;
  workflowUrl: string;
  buildCommand: string;
  reason?: string;
}

interface DownloadCenterViewProps {
  state: AppState;
  profile: UserProfile;
  language: AppLanguage;
  onExportJSON: () => void;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DEFAULT_WORKFLOW_URL =
  'https://github.com/TecToy-stack/thayllon-private-control/actions/workflows/build-android-apk.yml';

export const DownloadCenterView: React.FC<DownloadCenterViewProps> = ({
  state,
  profile,
  language,
  onExportJSON,
}) => {
  const [apkStatus, setApkStatus] = useState<ApkStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const activeAppUrl =
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin.startsWith('http')
      ? window.location.origin
      : 'https://ais-dev-zat6feg3ag2ennlct2lc5k-920027888558.us-east1.run.app';

  const loadApkStatus = async () => {
    setLoadingStatus(true);
    try {
      const resp = await fetch(getApiEndpoint('/api/download/apk/status'));
      if (resp.ok) {
        const data = (await resp.json()) as ApkStatusResponse;
        setApkStatus(data);
      } else {
        setApkStatus({
          available: false,
          filename: 'thayllon-private-control-debug.apk',
          sizeBytes: 0,
          updatedAt: null,
          githubRepo: 'TecToy-stack/thayllon-private-control',
          workflowUrl: DEFAULT_WORKFLOW_URL,
          buildCommand: 'npm run android:debug-apk',
          reason: 'Servidor offline ou build local não localizado. Utilize o GitHub Actions.',
        });
      }
    } catch {
      setApkStatus({
        available: false,
        filename: 'thayllon-private-control-debug.apk',
        sizeBytes: 0,
        updatedAt: null,
        githubRepo: 'TecToy-stack/thayllon-private-control',
        workflowUrl: DEFAULT_WORKFLOW_URL,
        buildCommand: 'npm run android:debug-apk',
        reason: 'Ambiente local sem servidor HTTP ativo. Gere o APK via GitHub Actions.',
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void loadApkStatus();
    QRCode.toDataURL(activeAppUrl, {
      width: 192,
      margin: 2,
      color: { dark: '#090D16', light: '#FFFFFF' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [activeAppUrl]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(activeAppUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      setFeedback('Copie manualmente o endereço exibido acima.');
    }
  };

  const handleInstallPwa = async () => {
    if (!deferredPrompt) {
      setFeedback(
        language === 'en'
          ? 'Use browser menu > "Install App" or "Add to Home Screen".'
          : language === 'es'
          ? 'Usa el menú del navegador > "Instalar aplicación" o "Añadir a pantalla de inicio".'
          : 'No Chrome/Safari móvel, abra o menu do navegador e toque em "Instalar aplicativo" ou "Adicionar à tela inicial".'
      );
      return;
    }
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const handleDownloadManifestBundle = () => {
    const now = new Date().toISOString();
    const manifestBundle = {
      appName: 'Thayllon Private Control',
      appId: 'com.thayllon.privatecontrol',
      webDir: 'dist',
      androidScheme: 'https',
      generatedAt: now,
      activeWebUrl: activeAppUrl,
      githubRepository: 'TecToy-stack/thayllon-private-control',
      githubWorkflowUrl: apkStatus?.workflowUrl ?? DEFAULT_WORKFLOW_URL,
      commands: {
        install: 'npm install --legacy-peer-deps',
        buildWeb: 'npm run build:web',
        syncCapacitor: 'npx cap sync android',
        buildApk: 'cd android && ./gradlew assembleDebug',
      },
      accountSnapshotMeta: buildSanitizedBackupPayload(state, profile, now),
    };
    const stamp = now.slice(0, 10);
    triggerJsonBlobDownload(
      JSON.stringify(manifestBundle, null, 2),
      `thayllon-private-control-android-manifest-${stamp}.json`
    );
    setFeedback('Pacote de manifesto e configurações Capacitor (.json) baixado com sucesso.');
  };

  const handleDownloadBuildScript = () => {
    const scriptContent = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      '',
      '# Thayllon Private Control (CF 2026+) - Gerador de APK Android (Capacitor)',
      `# URL backend opcional para reinstalacao: ${activeAppUrl}`,
      'export VITE_API_BASE_URL="${VITE_API_BASE_URL:-' + activeAppUrl + '}"',
      '',
      'npm install --legacy-peer-deps',
      'npm run build:web',
      'npx cap sync android',
      'chmod +x android/gradlew',
      'cd android',
      './gradlew assembleDebug',
      'cd ..',
      'mkdir -p release-apks',
      'cp android/app/build/outputs/apk/debug/app-debug.apk release-apks/thayllon-private-control-debug.apk',
      'echo "APK pronto em: release-apks/thayllon-private-control-debug.apk"',
      '',
    ].join('\n');

    const blob = new Blob([scriptContent], { type: 'text/x-shellscript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'build-thayllon-apk.sh';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setFeedback('Script de build Android (.sh) baixado.');
  };

  const labels =
    language === 'en'
      ? {
          title: 'App Download & Installation Center',
          subtitle:
            'Install on Android via APK (GitHub Actions / Capacitor) or PWA with full CPF vault recovery.',
          apkTitle: 'Android APK Installer (.apk)',
          apkReady: 'Compiled APK available for direct download:',
          apkPending: 'APK binary not compiled inside this web container yet.',
          apkDownloadBtn: 'Download APK Now',
          githubBtn: 'Open GitHub Actions APK Build',
          pwaTitle: 'Instant Mobile Web / PWA Install',
          pwaBtn: 'Install App (PWA)',
          filesTitle: 'Portable Account Backup & Build Files',
          backupJsonBtn: 'Download Complete Account Backup (.json)',
          manifestJsonBtn: 'Download Capacitor Manifest & Guide (.json)',
          scriptShBtn: 'Download Android APK Build Script (.sh)',
          qrTitle: 'Quick Access QR Code & Active Link',
          copyLink: 'Copy link',
          copied: 'Copied',
          openNewTab: 'Open in new tab',
        }
      : language === 'es'
      ? {
          title: 'Centro de Descarga e Instalación de la App',
          subtitle:
            'Instala en Android mediante APK (GitHub Actions / Capacitor) o PWA con recuperación por CPF.',
          apkTitle: 'Instalador Android APK (.apk)',
          apkReady: 'APK compilado disponible para descarga directa:',
          apkPending: 'Binario APK aún no compilado en este servidor web.',
          apkDownloadBtn: 'Descargar APK Ahora',
          githubBtn: 'Abrir Build APK en GitHub Actions',
          pwaTitle: 'Instalación Web Móvil / PWA',
          pwaBtn: 'Instalar Aplicación (PWA)',
          filesTitle: 'Respaldo de Cuenta y Archivos de Empaquetado',
          backupJsonBtn: 'Descargar Respaldo Completo (.json)',
          manifestJsonBtn: 'Descargar Manifiesto Capacitor (.json)',
          scriptShBtn: 'Descargar Script de Build APK (.sh)',
          qrTitle: 'Código QR y Enlace Activo',
          copyLink: 'Copiar enlace',
          copied: 'Copiado',
          openNewTab: 'Abrir en nueva pestaña',
        }
      : {
          title: 'Central de Download & Instalação do App',
          subtitle:
            'Instale no celular Android via .apk (GitHub Actions / Capacitor) ou PWA, preservando a recuperação por CPF após reinstalação.',
          apkTitle: 'Instalador Android (.apk)',
          apkReady: 'Arquivo .apk compilado disponível para download direto:',
          apkPending: 'Nenhum binário .apk foi compilado dentro deste servidor web no momento.',
          apkDownloadBtn: 'Baixar APK Instalável',
          githubBtn: 'Baixar / Gerar APK no GitHub Actions',
          pwaTitle: 'Instalação Direta no Celular (PWA)',
          pwaBtn: 'Instalar como App (PWA)',
          filesTitle: 'Backups & Arquivos Reais para Download',
          backupJsonBtn: 'Baixar Backup Completo da Conta (.json)',
          manifestJsonBtn: 'Baixar Manifesto & Pacote Capacitor (.json)',
          scriptShBtn: 'Baixar Script de Build Android (.sh)',
          qrTitle: 'QR Code & Link Ativo para Celular',
          copyLink: 'Copiar link',
          copied: 'Copiado',
          openNewTab: 'Abrir em nova aba',
        };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-[#C9A86A]" />
              {labels.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              {labels.subtitle}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.08] text-[11px] font-mono text-slate-700 dark:text-slate-300">
            <PackageCheck className="h-3.5 w-3.5 text-[#C9A86A]" />
            <span>com.thayllon.privatecontrol</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Android APK + GitHub Actions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-[#C9A86A]" />
                {labels.apkTitle}
              </h3>
              <button
                type="button"
                onClick={loadApkStatus}
                disabled={loadingStatus}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-700 dark:text-slate-300 hover:opacity-85"
              >
                <RefreshCw className={`h-3 w-3 ${loadingStatus ? 'animate-spin' : ''}`} />
                <span>Verificar</span>
              </button>
            </div>

            {apkStatus?.available ? (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-500/30 space-y-3">
                <p className="text-xs text-emerald-800 dark:text-emerald-200 font-medium">
                  {labels.apkReady}{' '}
                  <span className="font-mono">
                    {apkStatus.filename} ({(apkStatus.sizeBytes / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                </p>
                <a
                  href={getApiEndpoint('/api/download/apk')}
                  download={apkStatus.filename}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  <Download className="h-4 w-4" />
                  <span>{labels.apkDownloadBtn}</span>
                </a>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 space-y-3">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {apkStatus?.reason || labels.apkPending}
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <a
                    href={apkStatus?.workflowUrl ?? DEFAULT_WORKFLOW_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{labels.githubBtn}</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleInstallPwa}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-800 dark:text-slate-200"
                  >
                    <Smartphone className="h-3.5 w-3.5 text-[#C9A86A]" />
                    <span>{labels.pwaBtn}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] pt-1">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06]">
                <div className="text-slate-500 dark:text-slate-400">Repositório GitHub</div>
                <div className="font-mono text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                  TecToy-stack/thayllon-private-control
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06]">
                <div className="text-slate-500 dark:text-slate-400">Esquema Capacitor</div>
                <div className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                  https · webDir: dist
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06]">
                <div className="text-slate-500 dark:text-slate-400">Biometria Nativa</div>
                <div className="font-mono text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                  BiometricAuth Plugin
                </div>
              </div>
            </div>
          </div>

          {/* Real Browser Blob Downloads */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileJson className="h-4 w-4 text-[#C9A86A]" />
              {labels.filesTitle}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  onExportJSON();
                  setFeedback('Backup completo da conta (.json) exportado sem expor credenciais.');
                }}
                className="flex flex-col items-start gap-2 p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] hover:border-[#C9A86A]/50 text-left transition-colors"
              >
                <Download className="h-4 w-4 text-[#C9A86A]" />
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {labels.backupJsonBtn}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Estado financeiro, metas e regras sem PIN/tokens.
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownloadManifestBundle}
                className="flex flex-col items-start gap-2 p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] hover:border-[#C9A86A]/50 text-left transition-colors"
              >
                <ShieldCheck className="h-4 w-4 text-[#C9A86A]" />
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {labels.manifestJsonBtn}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Metadados Capacitor Android + snapshot sanitizado.
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownloadBuildScript}
                className="flex flex-col items-start gap-2 p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] hover:border-[#C9A86A]/50 text-left transition-colors"
              >
                <Terminal className="h-4 w-4 text-[#C9A86A]" />
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {labels.scriptShBtn}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Executa build web, cap sync e gradlew assembleDebug.
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* QR Code & Direct URL */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <QrCode className="h-4 w-4 text-[#C9A86A]" />
              {labels.qrTitle}
            </h3>

            <div className="flex items-center justify-center p-4 rounded-xl bg-white border border-slate-200">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code de acesso Thayllon Private Control"
                  className="w-40 h-40"
                />
              ) : (
                <div className="w-40 h-40 flex items-center justify-center text-xs text-slate-400">
                  QR Code
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-[11px] font-mono text-slate-600 dark:text-slate-300 break-all">
              {activeAppUrl}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-200"
            >
              {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedUrl ? labels.copied : labels.copyLink}</span>
            </button>
            <a
              href={activeAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>{labels.openNewTab}</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
