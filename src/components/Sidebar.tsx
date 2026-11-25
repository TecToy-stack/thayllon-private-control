import React from 'react';
import {
  TableProperties,
  Clock,
  CreditCard,
  ShieldCheck,
  TrendingUp,
  MessageSquareText,
  Settings,
  Lock,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Download,
  X,
} from 'lucide-react';
import { AppLanguage, NavTab, UserProfile } from '../types/finance';
import { getTranslations } from '../utils/i18n';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  alertCount: number;
  connectedAccountsCount: number;
  creditCardsCount?: number;
  maxAccounts: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLockSession: () => void;
  onLogout: () => void;
  profile: UserProfile;
  language: AppLanguage;
}

const NAV_ITEMS: { id: NavTab; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'matrix', icon: TableProperties },
  { id: 'timeline', icon: Clock },
  { id: 'cards', icon: CreditCard },
  { id: 'accounts', icon: ShieldCheck },
  { id: 'investments', icon: TrendingUp },
  { id: 'assistant', icon: MessageSquareText },
  { id: 'downloads', icon: Download },
  { id: 'settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  alertCount,
  connectedAccountsCount,
  creditCardsCount = 0,
  maxAccounts,
  mobileOpen,
  onCloseMobile,
  onLockSession,
  onLogout,
  profile,
  language,
}) => {
  const t = getTranslations(language);

  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#0D1320] border-r border-slate-200 dark:border-white/[0.08] px-4 pt-safe-screen lg:pt-6 pb-safe-nav lg:pb-6">
      <div className="overflow-y-auto">
        <div className="flex items-center justify-between px-2 pb-6 mb-4 border-b border-slate-200/80 dark:border-white/[0.07]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              <img
                src="/orbe-logo-dark.png"
                alt="ORBE Finanças"
                className="h-10 w-10 object-contain dark:hidden"
              />
              <img
                src="/orbe-logo.png"
                alt="ORBE Finanças"
                className="hidden h-10 w-10 object-contain dark:block"
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                ORBE Finanças
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {t.sidebar.subtitle}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
            aria-label={t.sidebar.closeMenu}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1" aria-label={t.sidebar.navAria}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isCards = item.id === 'cards';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isCards
                    ? 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-500/25 hover:bg-blue-100/70'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-white' : isCards ? 'text-blue-600 dark:text-blue-400' : ''
                    }`}
                  />
                  <span className="truncate">{t.sidebar.nav[item.id]}</span>
                </span>

                {isCards && creditCardsCount > 0 && (
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      isActive ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {creditCardsCount}
                  </span>
                )}

                {item.id === 'accounts' && (
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      isActive ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {connectedAccountsCount}/{maxAccounts}
                  </span>
                )}

                {item.id === 'timeline' && alertCount > 0 && (
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      isActive ? 'text-white' : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="pt-4 border-t border-slate-200/80 dark:border-white/[0.07] space-y-2">
        <div className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111827] border border-slate-200/70 dark:border-white/[0.06] space-y-1">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
            {profile.fullName}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            CPF {profile.maskedCpf}
          </div>
          <div className="pt-0.5 flex items-center gap-1 text-[11px]">
            {profile.kycStatus === 'verified' ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-3 w-3" />
                {t.sidebar.kycVerified}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                <AlertCircle className="h-3 w-3" />
                {profile.kycStatus === 'under_review'
                  ? t.sidebar.kycReview
                  : t.sidebar.kycPending}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onLockSession}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100/80 dark:bg-[#1A2234]/70 hover:bg-slate-200/70 dark:hover:bg-[#1A2234] border border-slate-200 dark:border-white/[0.08] transition-colors whitespace-nowrap"
        >
          <Lock className="h-3.5 w-3.5" />
          <span>{t.sidebar.lockSession}</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-colors whitespace-nowrap"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{t.sidebar.logoutSwitchCpf}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[252px] shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 w-[264px] max-w-[85vw] h-full">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
