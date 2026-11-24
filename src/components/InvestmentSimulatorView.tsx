import React, { useMemo, useState } from 'react';
import { TrendingUp, Info } from 'lucide-react';
import { AppSettings, MatrixTotals } from '../types/finance';
import {
  buildInvestmentProjection,
  formatBRL,
  InvestmentSimParams,
} from '../utils/financeEngine';
import { getTranslations } from '../utils/i18n';

interface InvestmentSimulatorViewProps {
  totals: MatrixTotals;
  settings: AppSettings;
}

export const InvestmentSimulatorView: React.FC<InvestmentSimulatorViewProps> = ({
  totals,
  settings,
}) => {
  const { privacyMode, language } = settings;
  const t = getTranslations(language);

  const profileLabels: Record<InvestmentSimParams['profile'], string> = {
    conservador: t.investments.profileConservative,
    moderado: t.investments.profileModerate,
    arrojado: t.investments.profileAggressive,
  };

  // Sugere aporte mensal proporcional ao superávit real observado (0 quando grade zerada)
  const activeSurpluses = totals.resultMonthly.filter((v) => v > 0);
  const suggestedContribution = activeSurpluses.length
    ? Math.max(50, Math.round(activeSurpluses.reduce((a, b) => a + b, 0) / activeSurpluses.length / 2 / 50) * 50)
    : 0;

  const [params, setParams] = useState<InvestmentSimParams>({
    initialCapital: totals.savingsAnnual > 0 ? totals.savingsAnnual : 0,
    monthlyContribution: suggestedContribution,
    months: 24,
    cdiAnnualPct: 11.75,
    ipcaAnnualPct: 4.5,
    profile: 'moderado',
  });

  React.useEffect(() => {
    setParams((prev) => ({
      ...prev,
      initialCapital: totals.savingsAnnual > 0 ? totals.savingsAnnual : 0,
      monthlyContribution: suggestedContribution,
    }));
  }, [totals.savingsAnnual, suggestedContribution]);

  const sim = useMemo(() => buildInvestmentProjection(params), [params]);

  const chartGeometry = useMemo(() => {
    const pts = sim.points;
    const width = 880;
    const height = 240;
    const padX = 24;
    const padY = 20;
    const maxY = Math.max(...pts.map((p) => p.optimistic), 100);
    const minY = Math.min(params.initialCapital * 0.9, ...pts.map((p) => p.contributed));
    const range = maxY - minY || 1;

    const toXY = (val: number, idx: number) => {
      const x = padX + (idx / Math.max(1, pts.length - 1)) * (width - padX * 2);
      const y = height - padY - ((val - minY) / range) * (height - padY * 2);
      return `${x},${y}`;
    };

    return {
      width,
      height,
      contributedPath: pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toXY(p.contributed, i)}`).join(' '),
      consPath: pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toXY(p.conservative, i)}`).join(' '),
      basePath: pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toXY(p.base, i)}`).join(' '),
      optPath: pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toXY(p.optimistic, i)}`).join(' '),
    };
  }, [sim.points, params.initialCapital]);

  return (
    <div className="space-y-6">
      {/* Parameters Panel */}
      <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t.investments.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.investments.subtitlePrefix} ({formatBRL(totals.savingsAnnual, privacyMode)}) {t.investments.subtitleSuffix}
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200/70 dark:border-white/[0.06]">
            {(['conservador', 'moderado', 'arrojado'] as const).map((prof) => (
              <button
                key={prof}
                type="button"
                onClick={() => setParams((p) => ({ ...p, profile: prof }))}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  params.profile === prof
                    ? 'bg-white dark:bg-[#1A2234] text-slate-900 dark:text-[#E5C88F] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {profileLabels[prof]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t.investments.initialCapital}
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={params.initialCapital}
              onChange={(e) =>
                setParams((p) => ({ ...p, initialCapital: Math.max(0, Number(e.target.value) || 0) }))
              }
              className="w-full px-3 py-2 rounded-lg text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t.investments.monthlyContribution}
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={params.monthlyContribution}
              onChange={(e) =>
                setParams((p) => ({
                  ...p,
                  monthlyContribution: Math.max(0, Number(e.target.value) || 0),
                }))
              }
              className="w-full px-3 py-2 rounded-lg text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t.investments.termMonths}
            </label>
            <input
              type="number"
              min="3"
              max="240"
              value={params.months}
              onChange={(e) =>
                setParams((p) => ({
                  ...p,
                  months: Math.min(240, Math.max(3, Number(e.target.value) || 12)),
                }))
              }
              className="w-full px-3 py-2 rounded-lg text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t.investments.cdiRate}
            </label>
            <input
              type="number"
              step="0.25"
              min="1"
              max="30"
              value={params.cdiAnnualPct}
              onChange={(e) =>
                setParams((p) => ({ ...p, cdiAnnualPct: Math.max(1, Number(e.target.value) || 10) }))
              }
              className="w-full px-3 py-2 rounded-lg text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              {t.investments.ipcaRate}
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="20"
              value={params.ipcaAnnualPct}
              onChange={(e) =>
                setParams((p) => ({ ...p, ipcaAnnualPct: Math.max(0, Number(e.target.value) || 4) }))
              }
              className="w-full px-3 py-2 rounded-lg text-sm font-mono tabular-nums bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* 3 Scenario Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sim.scenarios.map((sc) => (
          <div
            key={sc.key}
            className={`p-5 rounded-xl border ${
              sc.key === 'base'
                ? 'bg-slate-900 text-white dark:bg-[#1A2234] border-[#C9A86A]/50'
                : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-white/[0.08]'
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span
                className={
                  sc.key === 'base' ? 'text-[#E5C88F] font-semibold' : 'text-slate-500 dark:text-slate-400'
                }
              >
                {t.investments.scenarioPrefix} {t.investments.scenarioLabels[sc.key]}
              </span>
              <span className="font-mono tabular-nums opacity-80">
                {sc.annualRatePct}% a.a.
              </span>
            </div>
            <div className="mt-2 text-2xl font-semibold font-mono tabular-nums">
              {formatBRL(sc.finalValue, privacyMode)}
            </div>
            <div
              className={`mt-3 pt-3 border-t text-xs space-y-1 font-mono tabular-nums ${
                sc.key === 'base'
                  ? 'border-white/10 text-slate-300'
                  : 'border-slate-100 dark:border-white/[0.06] text-slate-500 dark:text-slate-400'
              }`}
            >
              <div className="flex justify-between">
                <span>{t.investments.totalContributed}</span>
                <span>{formatBRL(sim.finalContributed, privacyMode)}</span>
              </div>
              <div className="flex justify-between text-emerald-500">
                <span>{t.investments.compoundInterest}</span>
                <span>+{formatBRL(sc.interestEarned, privacyMode)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t.investments.realReturn}</span>
                <span>+{sc.realReturnPct}% a.a.</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Compound Growth Curve */}
      <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#C9A86A]" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.investments.curveTitle} ({params.months} {t.investments.monthsWord})
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-3 h-0.5 bg-slate-400 inline-block" /> {t.investments.legendContributed}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
              <span className="w-3 h-0.5 bg-sky-500 inline-block" /> {t.investments.legendConservative}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#A68342] dark:text-[#E5C88F]">
              <span className="w-3 h-0.5 bg-[#C9A86A] inline-block" /> {t.investments.legendBase}
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-3 h-0.5 bg-emerald-500 inline-block" /> {t.investments.legendOptimistic}
            </span>
          </div>
        </div>

        <svg viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`} className="w-full h-60">
          <path d={chartGeometry.contributedPath} fill="none" stroke="#94A3B8" strokeWidth="2" strokeDasharray="5 4" />
          <path d={chartGeometry.consPath} fill="none" stroke="#0EA5E9" strokeWidth="2" />
          <path d={chartGeometry.basePath} fill="none" stroke="#C9A86A" strokeWidth="3" />
          <path d={chartGeometry.optPath} fill="none" stroke="#10B981" strokeWidth="2" />
        </svg>
      </div>

      {/* Allocation Table */}
      <div className="p-6 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t.investments.allocationTitle} {profileLabels[params.profile]}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/[0.08] text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4 font-medium">{t.investments.colAssetClass}</th>
                <th className="py-2.5 pr-4 font-medium">{t.investments.colVehicles}</th>
                <th className="py-2.5 pr-4 font-medium">{t.investments.colRole}</th>
                <th className="py-2.5 text-right font-medium">{t.investments.colAllocation}</th>
                <th className="py-2.5 pl-4 text-right font-medium">{t.investments.colInitialValue}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
              {sim.allocation.map((item) => (
                <tr key={item.name}>
                  <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">{item.name}</td>
                  <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{item.vehicle}</td>
                  <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">{item.role}</td>
                  <td className="py-3 text-right font-mono tabular-nums font-semibold text-[#A68342] dark:text-[#E5C88F]">
                    {item.pct}%
                  </td>
                  <td className="py-3 pl-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatBRL((params.initialCapital * item.pct) / 100, privacyMode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06] flex items-start gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#C9A86A]" />
          <span>{t.investments.educationalNote}</span>
        </div>
      </div>
    </div>
  );
};
