import React from 'react';
import { Eye, EyeOff, Sun, Moon, Plus, Menu } from 'lucide-react';
import { AppLanguage, NavTab } from '../types/finance';
import { getTranslations } from '../utils/i18n';

interface TopBarProps {
  activeTab: NavTab;
  activeYear: number;
  privacyMode: boolean;
  theme: 'dark' | 'light';
  language: AppLanguage;
  onTogglePrivacy: () => void;
  onToggleTheme: () => void;
  onOpenNewEntry: () => void;
  onOpenMobileMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  activeYear,
  privacyMode,
  theme,
  language,
  onTogglePrivacy,
  onToggleTheme,
  onOpenNewEntry,
  onOpenMobileMenu,
}) => {
  const t = getTranslations(language);
  const info = t.topBar.tabs[activeTab];

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#090D16]/90 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.08] px-safe sm:px-6 pt-safe-header pb-3">
      <div className="flex items-center justify-between gap-2.5 sm:gap-4 min-h-[44px]">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 shrink-0"
            aria-label={t.topBar.openMenu}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 min-w-0">
              <span className="truncate">{info.section}</span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600 shrink-0">·</span>
              <span className="font-mono text-xs sm:text-sm text-blue-600 dark:text-blue-400 tabular-nums whitespace-nowrap shrink-0">
                {activeYear}
              </span>
            </div>
            <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 truncate">
              {info.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onTogglePrivacy}
            title={privacyMode ? t.topBar.showValuesTitle : t.topBar.hideValuesTitle}
            aria-label={privacyMode ? t.topBar.showValuesTitle : t.topBar.hideValuesTitle}
            className={`inline-flex items-center justify-center gap-2 min-h-[40px] min-w-[40px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              privacyMode
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-500/40 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A2234]'
            }`}
          >
            {privacyMode ? <EyeOff className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> : <Eye className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
            <span className="hidden md:inline">
              {privacyMode ? t.topBar.hiddenValues : t.topBar.hideValues}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? t.topBar.toLightTheme : t.topBar.toDarkTheme}
            className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] p-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A2234] transition-colors shrink-0"
            aria-label={t.topBar.toggleThemeAria}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenNewEntry}
            aria-label={t.topBar.newEntry}
            title={t.topBar.newEntry}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">{t.topBar.newEntry}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
