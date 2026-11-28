import React, { useMemo, useState } from 'react';
import { Search, AlertTriangle, ArrowUpRight, ArrowDownRight, Calendar } from 'lucide-react';
import {
  AlertItem,
  AppSettings,
  BankAccount,
  CategoryRow,
  TransactionEntry,
} from '../types/finance';
import {
  buildTimelineEvents,
  formatBRL,
  TimelineFilter,
} from '../utils/financeEngine';
import {
  getMonthNamesFull,
  getMonthNamesShort,
  getTranslations,
  translateEntryStatus,
} from '../utils/i18n';

interface TimelineViewProps {
  rows: CategoryRow[];
  entries: TransactionEntry[];
  accounts: BankAccount[];
  alerts: AlertItem[];
  settings: AppSettings;
  onUpdateSettings?: (patch: Partial<AppSettings>) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  rows,
  entries,
  accounts,
  alerts,
  settings,
  onUpdateSettings,
}) => {
  const [filter, setFilter] = useState<TimelineFilter>({
    window: 'year',
    referenceMonth: 10, // Novembro 2026
    types: {
      income: true,
      fixed: true,
      variable: true,
      savings: true,
      cards: true,
      alerts: true,
    },
    accountId: 'all',
    search: '',
  });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { privacyMode, activeYear, language } = settings;
  const t = getTranslations(language);
  const monthNamesFull = getMonthNamesFull(language);
  const monthNamesShort = getMonthNamesShort(language);

  const events = useMemo(
    () => buildTimelineEvents(rows, entries, accounts, alerts, activeYear, filter),
    [rows, entries, accounts, alerts, activeYear, filter]
  );

  const toggleType = (key: keyof TimelineFilter['types']) => {
    setFilter((prev) => ({
      ...prev,
      types: { ...prev.types, [key]: !prev.types[key] },
    }));
  };

  // Chart calculations for Saldo Projetado
  const chartData = useMemo(() => {
    if (events.length === 0) return null;
    // Sample up to 60 points if too many, preserving peaks/troughs
    const step = Math.max(1, Math.floor(events.length / 60));
    const sampled = events.filter((_, idx) => idx % step === 0 || idx === events.length - 1);
    const values = sampled.map((e) => e.projectedBalanceAfter);
    const minVal = Math.min(0, ...values);
    const maxVal = Math.max(1000, ...values);
    const range = maxVal - minVal || 1;
    const width = 900;
    const height = 220;
    const padX = 20;
    const padY = 24;

    const coords = sampled.map((ev, i) => {
      const x =
        sampled.length === 1
          ? width / 2
          : padX + (i / (sampled.length - 1)) * (width - padX * 2);
      const y = height - padY - ((ev.projectedBalanceAfter - minVal) / range) * (height - padY * 2);
      return { x, y, ev };
    });

    const zeroY = height - padY - ((0 - minVal) / range) * (height - padY * 2);
    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
    const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height - padY} L ${coords[0].x} ${height - padY} Z`;

    return { coords, linePath, areaPath, zeroY, minVal, maxVal, width, height };
  }, [events]);

  // Group events by Year-Month
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: typeof events }[] = [];
    const map = new Map<string, typeof events>();
    events.forEach((ev) => {
      const key = `${ev.year}-${ev.month}`;
      if (!map.has(key)) {
        const list: typeof events = [];
        map.set(key, list);
        groups.push({
          key,
          label: `${monthNamesFull[ev.month]} ${ev.year}`,
          items: list,
        });
      }
      map.get(key)!.push(ev);
    });
    return groups;
  }, [events, monthNamesFull]);

  const minProjected = events.length
    ? Math.min(...events.map((e) => e.projectedBalanceAfter))
    : 0;
  const maxProjected = events.length
    ? Math.max(...events.map((e) => e.projectedBalanceAfter))
    : 0;

  return (
    <div className="space-y-6">
      {/* Timeline Configuration Controls */}
      <div className="p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
            {(
              [
                { id: 'month', label: t.timeline.winMonth },
                { id: 'quarter', label: t.timeline.winQuarter },
                { id: 'semester', label: t.timeline.winSemester },
                { id: 'year', label: t.timeline.winYear },
                { id: 'projection12', label: t.timeline.winProj12 },
              ] as const
            ).map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setFilter((p) => ({ ...p, window: w.id }))}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  filter.window === w.id
                    ? 'bg-white dark:bg-[#1A2234] text-slate-900 dark:text-[#E5C88F] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onUpdateSettings && (
              <div className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
                <button
                  type="button"
                  aria-label="Ano anterior na linha do tempo"
                  onClick={() => onUpdateSettings({ activeYear: Math.max(1900, activeYear - 1) })}
                  className="px-2 py-1.5 text-xs font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/5"
                  title="Ano anterior"
                >
                  −
                </button>
                <span className="px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                  {activeYear}
                </span>
                <button
                  type="button"
                  aria-label="Próximo ano na linha do tempo"
                  onClick={() => onUpdateSettings({ activeYear: activeYear + 1 })}
                  className="px-2 py-1.5 text-xs font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/5"
                  title="Próximo ano (2027, 2028+)"
                >
                  +
                </button>
              </div>
            )}

            {(filter.window === 'month' ||
              filter.window === 'quarter' ||
              filter.window === 'semester') && (
              <select
                value={filter.referenceMonth}
                onChange={(e) =>
                  setFilter((p) => ({ ...p, referenceMonth: Number(e.target.value) }))
                }
                className="px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-slate-100"
              >
                {monthNamesFull.map((m, idx) => (
                  <option key={m} value={idx}>
                    {t.timeline.refPrefix} {m}
                  </option>
                ))}
              </select>
            )}

            <select
              value={filter.accountId}
              onChange={(e) => setFilter((p) => ({ ...p, accountId: e.target.value }))}
              className="px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-slate-100"
            >
              <option value="all">{t.timeline.allAccounts}</option>
              <option value="manual">{t.timeline.manualEntries}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {t.timeline.accountPrefix} {a.slot}: {a.institution}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filter.search}
                onChange={(e) => setFilter((p) => ({ ...p, search: e.target.value }))}
                placeholder={t.timeline.searchPlaceholder}
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Event Type Toggles */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
          <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">{t.timeline.showLabel}</span>
          {(
            [
              { key: 'income', label: t.timeline.typeIncome },
              { key: 'fixed', label: t.timeline.typeFixed },
              { key: 'variable', label: t.timeline.typeVariable },
              { key: 'cards', label: t.timeline.typeCards },
              { key: 'savings', label: t.timeline.typeSavings },
              { key: 'alerts', label: t.timeline.typeAlerts },
            ] as const
          ).map((item) => {
            const active = filter.types[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleType(item.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-slate-900 dark:bg-[#1A2234] text-white dark:text-[#E5C88F] border-slate-900 dark:border-[#C9A86A]/40'
                    : 'bg-transparent border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Saldo Projetado Chart */}
      <div className="p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.timeline.chartTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.timeline.chartSub}
            </p>
          </div>
          <div className="flex items-center gap-5 text-xs font-mono tabular-nums">
            <div>
              <span className="text-slate-500 dark:text-slate-400 mr-1.5">{t.timeline.minValley}</span>
              <span className={minProjected < 0 ? 'text-red-500 font-semibold' : 'text-slate-700 dark:text-slate-200'}>
                {formatBRL(minProjected, privacyMode)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 mr-1.5">{t.timeline.maxPeak}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {formatBRL(maxProjected, privacyMode)}
              </span>
            </div>
          </div>
        </div>

        {chartData ? (
          <div className="relative">
            <svg
              viewBox={`0 0 ${chartData.width} ${chartData.height}`}
              className="w-full h-56 overflow-visible"
            >
              <defs>
                <linearGradient id="timelineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C9A86A" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#C9A86A" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              <line
                x1={20}
                y1={chartData.zeroY}
                x2={chartData.width - 20}
                y2={chartData.zeroY}
                stroke="currentColor"
                strokeDasharray="4 4"
                className="text-slate-300 dark:text-white/15"
              />

              <path d={chartData.areaPath} fill="url(#timelineGrad)" />
              <path
                d={chartData.linePath}
                fill="none"
                stroke="#C9A86A"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {chartData.coords.map((pt, idx) => {
                const isLow = pt.ev.projectedBalanceAfter < 0;
                const isHovered = hoveredIdx === idx;
                return (
                  <g key={pt.ev.id}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 6 : pt.ev.isAlert || isLow ? 4 : 2.5}
                      fill={isLow ? '#EF4444' : pt.ev.isAlert ? '#F59E0B' : '#C9A86A'}
                      className="cursor-pointer transition-all"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  </g>
                );
              })}
            </svg>

            {hoveredIdx !== null && chartData.coords[hoveredIdx] && (
              <div className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {String(chartData.coords[hoveredIdx].ev.day).padStart(2, '0')}/
                  {monthNamesShort[chartData.coords[hoveredIdx].ev.month]} ·{' '}
                  {chartData.coords[hoveredIdx].ev.title}
                </div>
                <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {t.timeline.accumBalance}{' '}
                  <span className="font-semibold text-[#A68342] dark:text-[#E5C88F]">
                    {formatBRL(chartData.coords[hoveredIdx].ev.projectedBalanceAfter, privacyMode)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            {t.timeline.noEventsFilter}
          </div>
        )}
      </div>

      {/* Chronological Timeline List */}
      <div className="space-y-4">
        {grouped.length === 0 ? (
          <div className="p-10 text-center rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] text-sm text-slate-500 dark:text-slate-400">
            {t.timeline.noEventsWindow}
          </div>
        ) : (
          grouped.map((group) => (
            <div
              key={group.key}
              className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden"
            >
              <div className="px-5 py-3 bg-slate-50 dark:bg-[#0D1320] border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Calendar className="h-3.5 w-3.5 text-[#C9A86A]" />
                  <span>{group.label}</span>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {group.items.length} {t.timeline.movementsCount}
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                {group.items.map((ev) => {
                  const isInflow = ev.block === 'income';
                  return (
                    <div
                      key={ev.id}
                      className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-[#1A2234]/40 transition-colors"
                    >
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        <div className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1A2234] font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                          D/{String(ev.day).padStart(2, '0')}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {ev.categoryName}
                            </span>
                            {ev.installmentLabel && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#C9A86A]/15 text-[#8C6A2E] dark:text-[#E5C88F]">
                                {t.timeline.installmentWord} {ev.installmentLabel}
                                {ev.installmentRemainingAmount !== undefined && ev.installmentRemainingAmount > 0
                                  ? ` · ${t.matrix.remShort} ${formatBRL(ev.installmentRemainingAmount, privacyMode)}`
                                  : ''}
                              </span>
                            )}
                            {ev.isDeduplicated && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                {ev.entryNature === 'invoice_payment'
                                  ? t.timeline.invoiceDedupTag
                                  : t.timeline.internalDedupTag}
                              </span>
                            )}
                            {ev.isAlert && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" />
                                {t.timeline.alertTag}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="truncate">{ev.title}</span>
                            <span aria-hidden="true">·</span>
                            <span>{ev.accountLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span>{translateEntryStatus(ev.status, language)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0">
                        <div className="text-right">
                          <div
                            className={`inline-flex items-center gap-1 text-sm font-semibold font-mono tabular-nums ${
                              ev.isDeduplicated
                                ? 'text-slate-400 dark:text-slate-500 line-through'
                                : isInflow
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : ev.block === 'savings'
                                ? 'text-[#A68342] dark:text-[#E5C88F]'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {isInflow ? (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5 text-slate-400" />
                            )}
                            {formatBRL(ev.isDeduplicated ? ev.amount : ev.signedAmount, privacyMode, isInflow && !ev.isDeduplicated)}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {t.timeline.projBalanceShort} {formatBRL(ev.projectedBalanceAfter, privacyMode)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
