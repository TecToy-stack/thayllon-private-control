import React from 'react';
import { AppLanguage } from '../types/finance';

interface OfflineIndicatorProps {
  language?: AppLanguage;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = () => {
  // Modo 100% local como padrão: não exibe banner ou aviso alarmante quando offline.
  return null;
};
