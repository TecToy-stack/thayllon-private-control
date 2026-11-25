import React, { useMemo, useState } from 'react';
import { CreditCardComputedSummary } from '../utils/creditCardsEngine';
import { formatBRL } from '../utils/financeEngine';

interface CreditCardPieChartProps {
  summaries: CreditCardComputedSummary[];
  totalLimit: number;
  totalCommitted: number;
  totalAvailable: number;
  privacyMode: boolean;
}

interface SliceItem {
  id: string;
  label: string;
  sublabel?: string;
  value: number;
  color: string;
}

type ChartMode = 'by_card' | 'limit_split';

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function buildDonutArcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const clampedEnd = Math.min(startAngle + 359.95, endAngle);
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, clampedEnd);
  const innerEnd = polarToCartesian(cx, cy, innerR, clampedEnd);
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export const CreditCardPieChart: React.FC<CreditCardPieChartProps> = ({
  summaries,
  totalLimit,
  totalCommitted,
  totalAvailable,
  privacyMode,
}) => {
  const [mode, setMode] = useState<ChartMode>('by_card');
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);

  const slices: SliceItem[] = useMemo(() => {
    if (mode === 'limit_split') {
      const items: SliceItem[] = [];
      if (totalCommitted > 0) {
        items.push({
          id: 'committed',
          label: 'Limite Comprometido',
          sublabel: 'Parcelas e faturas em aberto',
          value: totalCommitted,
          color: '#2563EB',
        });
      }
      if (totalAvailable > 0) {
        items.push({
          id: 'available',
          label: 'Limite Livre',
          sublabel: 'Disponível para uso',
          value: totalAvailable,
          color: '#10B981',
        });
      }
      return items;
    }

    // Por cartão / banco: prioriza fatura/comprometido; se tudo zerado, distribui por limite total
    const hasCommitted = summaries.some((s) => s.committedLimit > 0);
    return summaries
      .map((s) => ({
        id: s.card.id,
        label: s.card.nickname ? `${s.card.bankName} · ${s.card.nickname}` : s.card.bankName,
        sublabel: hasCommitted
          ? `Fatura mês: ${formatBRL(s.monthInvoiceAmount, privacyMode)}`
          : `Limite: ${formatBRL(s.card.totalLimit, privacyMode)}`,
        value: hasCommitted ? s.committedLimit : s.card.totalLimit,
        color: s.card.bankColor || '#2563EB',
      }))
      .filter((item) => item.value > 0);
  }, [mode, summaries, totalCommitted, totalAvailable, privacyMode]);

  const totalValue = useMemo(
    () => slices.reduce((sum, item) => sum + item.value, 0),
    [slices]
  );

  const computedArcs = useMemo(() => {
    if (totalValue <= 0) return [];
    let currentAngle = 0;
    return slices.map((slice) => {
      const pct = (slice.value / totalValue) * 100;
      const sweep = (slice.value / totalValue) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      currentAngle = endAngle;
      return {
        ...slice,
        pct,
        path: buildDonutArcPath(110, 110, 96, 58, startAngle, endAngle),
      };
    });
  }, [slices, totalValue]);

  const activeSlice =
    computedArcs.find((a) => a.id === selectedSliceId) ?? computedArcs[0] ?? null;

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Distribuição dos Cartões & Limites
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Toque em uma fatia para inspecionar valores e percentual
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1320] border border-slate-200/80 dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              setMode('by_card');
              setSelectedSliceId(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mode === 'by_card'
                ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Por Cartão / Banco
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('limit_split');
              setSelectedSliceId(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mode === 'limit_split'
                ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Livre vs. Comprometido
          </button>
        </div>
      </div>

      {computedArcs.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
          {summaries.length === 0
            ? 'Cadastre um cartão de crédito para visualizar o gráfico de distribuição.'
            : 'Nenhum limite ou compra registrada neste momento.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          {/* Interactive Donut SVG */}
          <div className="md:col-span-5 flex flex-col items-center justify-center">
            <div className="relative w-[220px] h-[220px]">
              <svg viewBox="0 0 220 220" className="w-full h-full">
                {computedArcs.map((arc) => {
                  const isActive = activeSlice?.id === arc.id;
                  return (
                    <path
                      key={arc.id}
                      d={arc.path}
                      fill={arc.color}
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      opacity={activeSlice && !isActive ? 0.65 : 1}
                      className="cursor-pointer transition-opacity"
                      onMouseEnter={() => setSelectedSliceId(arc.id)}
                      onClick={() => setSelectedSliceId(arc.id)}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-full">
                  {activeSlice ? activeSlice.label : 'Total'}
                </span>
                <span className="mt-0.5 text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                  {formatBRL(activeSlice ? activeSlice.value : totalLimit, privacyMode)}
                </span>
                {activeSlice && (
                  <span className="text-[11px] font-mono tabular-nums text-blue-600 dark:text-blue-400 font-semibold">
                    {activeSlice.pct.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Legend List */}
          <div className="md:col-span-7 space-y-2">
            {computedArcs.map((arc) => {
              const isActive = activeSlice?.id === arc.id;
              return (
                <button
                  key={arc.id}
                  type="button"
                  onClick={() => setSelectedSliceId(arc.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                    isActive
                      ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-300 dark:border-blue-500/40'
                      : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200/80 dark:border-white/[0.06] hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: arc.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {arc.label}
                      </div>
                      {arc.sublabel && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {arc.sublabel}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono tabular-nums">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {formatBRL(arc.value, privacyMode)}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {arc.pct.toFixed(1)}%
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
