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
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#090D16]/90 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.08] px-4 sm:px-6 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
            aria-label={t.topBar.openMenu}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              <span>{info.section}</span>
              <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
              <span className="font-mono text-xs sm:text-sm text-[#A68342] dark:text-[#C9A86A] tabular-nums">
                CF {activeYear}
              </span>
            </div>
            <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 truncate">
              {info.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onTogglePrivacy}
            title={privacyMode ? t.topBar.showValuesTitle : t.topBar.hideValuesTitle}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              privacyMode
                ? 'bg-[#C9A86A]/15 border-[#C9A86A]/50 text-[#A68342] dark:text-[#E5C88F]'
                : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A2234]'
            }`}
          >
            {privacyMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">
              {privacyMode ? t.topBar.hiddenValues : t.topBar.hideValues}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? t.topBar.toLightTheme : t.topBar.toDarkTheme}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A2234] transition-colors shrink-0"
            aria-label={t.topBar.toggleThemeAria}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-[#C9A86A]" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenNewEntry}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:bg-slate-800 dark:hover:bg-[#D8BA7F] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t.topBar.newEntry}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
