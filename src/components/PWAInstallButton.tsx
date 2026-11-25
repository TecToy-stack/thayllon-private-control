import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { AppLanguage } from '../types/finance';
import { getTranslations, loadStoredLanguage } from '../utils/i18n';

interface OfflineIndicatorProps {
  language?: AppLanguage;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ language }) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  const t = getTranslations(language ?? loadStoredLanguage());

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 left-4 z-50 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-lg">
      <WifiOff className="h-3.5 w-3.5" />
      <span>{t.modals.offlineBanner}</span>
    </div>
  );
};
