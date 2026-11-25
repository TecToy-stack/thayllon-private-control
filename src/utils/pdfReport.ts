import { jsPDF } from 'jspdf';
import { AppLanguage, AppState, MatrixTotals } from '../types/finance';
import { MONTH_NAMES_FULL, MONTH_NAMES_SHORT } from '../data/initialData';
import {
  computeGoalProgress,
  computeMonthlyBudgetForecast,
  computeMonthSpotlight,
  formatBRL,
  formatCompactDay,
  formatPaymentMethodLabel,
  getEffectiveRecurringStatus,
  isDeduplicatedEntry,
  parseInstallmentInfo,
} from './financeEngine';
import { getMonthNamesFull } from './i18n';

export function generatePrivateBankingAnnualPDF(state: AppState, totals: MatrixTotals): void {
  const year = state.settings.activeYear;
  const focusMonth = Math.min(
    11,
    Math.max(0, Number.isFinite(state.settings.focusMonth) ? Math.trunc(state.settings.focusMonth) : 10)
  );
  const spotlight = computeMonthSpotlight(
    state.rows,
    state.entries,
    state.accounts,
    totals,
    year,
    focusMonth
  );

  // Landscape A4 gives ample breathing room for the 12-month Private Banking matrix
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 297mm
  const pageH = doc.internal.pageSize.getHeight(); // 210mm

  const C_OBSIDIAN: [number, number, number] = [9, 13, 22];
  const C_CARD: [number, number, number] = [17, 24, 39];
  const C_GOLD: [number, number, number] = [201, 168, 106];
  const C_GOLD_DARK: [number, number, number] = [140, 106, 46];
  const C_EMERALD: [number, number, number] = [16, 185, 129];
  const C_SLATE_DARK: [number, number, number] = [15, 23, 42];
  const C_SLATE_MUTED: [number, number, number] = [100, 116, 139];
  const C_BORDER: [number, number, number] = [226, 232, 240];
  const C_BG_SOFT: [number, number, number] = [248, 250, 252];

  const drawHeaderBand = (subtitle: string, pageNum: number) => {
    doc.setFillColor(...C_OBSIDIAN);
    doc.rect(0, 0, pageW, 26, 'F');
    doc.setFillColor(...C_GOLD);
    doc.rect(0, 26, pageW, 0.8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('ORBE FINANÇAS', 14, 12);

    doc.setTextColor(...C_GOLD);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${year}  ·  ${subtitle}`, 14, 18.5);

    doc.setTextColor(180, 190, 205);
    doc.setFontSize(8);
    const generatedAt = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.text(`Emitido em ${generatedAt}  ·  Página ${pageNum}`, pageW - 14, 15, { align: 'right' });
  };

  // ==================== PAGE 1: EXECUTIVE SUMMARY & CHARTS ====================
  drawHeaderBand(`Relatório Financeiro Anual Consolidado (${year})`, 1);

  // 4 Executive KPI Cards
  const kpiY = 33;
  const kpiW = (pageW - 28 - 12) / 4;
  const kpis = [
    {
      label: `GANHO TOTAL ANUAL (${year})`,
      value: formatBRL(totals.incomeAnnual, false),
      sub: 'Receitas operacionais e caixa',
      accent: C_EMERALD,
    },
    {
      label: `GASTO TOTAL ANUAL (${year})`,
      value: formatBRL(totals.totalExpenseAnnual, false),
      sub: `Fixas ${formatBRL(totals.fixedAnnual)} · Var ${formatBRL(totals.variableAnnual)}`,
      accent: C_SLATE_DARK,
    },
    {
      label: 'RESULTADO LÍQUIDO ANUAL',
      value: formatBRL(totals.resultAnnual, false, true),
      sub:
        totals.incomeAnnual > 0
          ? `Margem líquida de ${((totals.resultAnnual / totals.incomeAnnual) * 100).toFixed(1)}%`
          : 'Fluxo líquido',
      accent: totals.resultAnnual >= 0 ? C_EMERALD : [220, 38, 38] as [number, number, number],
    },
    {
      label: 'VALOR TOTAL GUARDADO',
      value: formatBRL(totals.savingsAnnual, false),
      sub: 'Reserva patrimonial acumulada',
      accent: C_GOLD_DARK,
    },
  ];

  kpis.forEach((k, idx) => {
    const x = 14 + idx * (kpiW + 4);
    doc.setFillColor(...C_BG_SOFT);
    doc.setDrawColor(...C_BORDER);
    doc.roundedRect(x, kpiY, kpiW, 24, 2, 2, 'FD');

    doc.setTextColor(...C_SLATE_MUTED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(k.label, x + 4, kpiY + 6.5);

    doc.setTextColor(...k.accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(k.value, x + 4, kpiY + 14.5);

    doc.setTextColor(...C_SLATE_MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(k.sub, x + 4, kpiY + 20.5);
  });

  // Chart 1 (Left): Monthly Income vs Expense Grouped Bar Chart
  const chartY = 64;
  const leftW = 166;
  const chartH = 74;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...C_BORDER);
  doc.roundedRect(14, chartY, leftW, chartH, 2, 2, 'FD');

  doc.setTextColor(...C_SLATE_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Fluxo Mensal Comparativo · Receitas vs. Gastos', 19, chartY + 7);

  // Legend
  doc.setFillColor(...C_EMERALD);
  doc.rect(leftW - 44, chartY + 4.5, 3, 3, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_SLATE_MUTED);
  doc.text('Receitas', leftW - 39.5, chartY + 7);

  doc.setFillColor(...C_CARD);
  doc.rect(leftW - 21, chartY + 4.5, 3, 3, 'F');
  doc.text('Gastos', leftW - 16.5, chartY + 7);

  const plotX = 22;
  const plotY = chartY + 14;
  const plotW = leftW - 16;
  const plotH = chartH - 25;
  const maxMonthVal = Math.max(
    1000,
    ...totals.incomeMonthly,
    ...totals.totalExpenseMonthly
  );

  // Baseline
  doc.setDrawColor(...C_BORDER);
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);

  const groupW = plotW / 12;
  for (let m = 0; m < 12; m++) {
    const inc = totals.incomeMonthly[m] ?? 0;
    const exp = totals.totalExpenseMonthly[m] ?? 0;
    const gx = plotX + m * groupW + 2;
    const barW = Math.max(2.5, (groupW - 6) / 2);

    const incH = (inc / maxMonthVal) * plotH;
    const expH = (exp / maxMonthVal) * plotH;

    if (incH > 0) {
      doc.setFillColor(...C_EMERALD);
      doc.rect(gx, plotY + plotH - incH, barW, incH, 'F');
    }
    if (expH > 0) {
      doc.setFillColor(...C_CARD);
      doc.rect(gx + barW + 0.8, plotY + plotH - expH, barW, expH, 'F');
    }

    doc.setFontSize(6.5);
    doc.setTextColor(...C_SLATE_MUTED);
    doc.text(MONTH_NAMES_SHORT[m], gx + barW, plotY + plotH + 4.5, { align: 'center' });
  }

  // Chart 2 (Right): Top 7 Expense Categories Horizontal Bars
  const rightX = 14 + leftW + 6;
  const rightW = pageW - rightX - 14;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...C_BORDER);
  doc.roundedRect(rightX, chartY, rightW, chartH, 2, 2, 'FD');

  doc.setTextColor(...C_SLATE_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Principais Categorias de Gasto (Anual)', rightX + 5, chartY + 7);

  const topCategories = state.rows
    .filter((r) => (r.block === 'fixed' || r.block === 'variable') && !r.hidden)
    .map((r) => ({ name: r.name, val: totals.rowAnnual[r.id] ?? 0 }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 7);

  const maxCatVal = Math.max(100, topCategories[0]?.val ?? 100);
  topCategories.forEach((cat, i) => {
    const cy = chartY + 15 + i * 8.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...C_SLATE_DARK);
    doc.text(cat.name.slice(0, 18), rightX + 5, cy);

    doc.setFont('helvetica', 'bold');
    doc.text(formatBRL(cat.val, false), rightX + rightW - 5, cy, { align: 'right' });

    const barMaxW = rightW - 10;
    const fillW = (cat.val / maxCatVal) * barMaxW;
    doc.setFillColor(241, 245, 249);
    doc.rect(rightX + 5, cy + 1.5, barMaxW, 2.2, 'F');
    doc.setFillColor(...C_GOLD);
    doc.rect(rightX + 5, cy + 1.5, fillW, 2.2, 'F');
  });

  // Bottom Row Page 1: Mês em Questão + Modalidades & Cartões (Left) & Metas de Economia (Right)
  const botY = chartY + chartH + 6;
  const botH = 54;

  // Left: Active Month + Payment Modes & Cards
  doc.setFillColor(...C_BG_SOFT);
  doc.setDrawColor(...C_BORDER);
  doc.roundedRect(14, botY, leftW, botH, 2, 2, 'FD');

  doc.setTextColor(...C_SLATE_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `Mês em Foco (${MONTH_NAMES_FULL[focusMonth]} ${year}) · Cartões & Modalidades`,
    19,
    botY + 7.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_SLATE_MUTED);
  doc.text(
    `Receitas: ${formatBRL(spotlight.income)}   |   Gastos: ${formatBRL(spotlight.totalExpense)}   |   Resultado: ${formatBRL(spotlight.result, false, true)}`,
    19,
    botY + 14.5
  );

  doc.text(
    `Modalidades: Crédito ${formatBRL(spotlight.creditSpent)}  ·  Débito ${formatBRL(spotlight.debitSpent)}  ·  Pix ${formatBRL(spotlight.pixSpent)}`,
    19,
    botY + 20.5
  );

  doc.text(
    `À Vista: ${formatBRL(spotlight.spotSpent)}  ·  Parcelado: ${formatBRL(spotlight.installmentSpent)} (Restante: ${formatBRL(spotlight.installmentRemainingTotal)})`,
    19,
    botY + 26
  );

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C_SLATE_DARK);
  doc.text('Faturas de Cartão, Limites & Contas Registradas:', 19, botY + 32.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  spotlight.cardInvoices.slice(0, 2).forEach((inv, idx) => {
    const limitInfo =
      inv.availableLimit !== undefined ? ` · Lim. disp. ${formatBRL(inv.availableLimit)}` : '';
    const dateInfo = inv.closingDay
      ? `Fech. ${formatCompactDay(inv.closingDay)} / Venc. ${formatCompactDay(inv.dueDay)}`
      : `Venc. ${formatCompactDay(inv.dueDay)}`;
    doc.text(
      `• ${inv.name} (${dateInfo}): ${formatBRL(inv.amount)} [${inv.status}]${limitInfo}`,
      19,
      botY + 37.8 + idx * 4.8
    );
  });
  doc.text(
    `Contas: ${state.accounts.length} / 5 · Cartões cadastrados: ${(state.creditCards ?? []).length}`,
    19,
    botY + 48.5
  );

  // Right: Metas de Economia
  doc.setFillColor(...C_BG_SOFT);
  doc.setDrawColor(...C_BORDER);
  doc.roundedRect(rightX, botY, rightW, botH, 2, 2, 'FD');

  doc.setTextColor(...C_SLATE_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Monitoramento de Metas de Economia', rightX + 5, botY + 7.5);

  const activeGoals = (state.goals ?? []).slice(0, 3);
  if (activeGoals.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C_SLATE_MUTED);
    doc.text('Nenhuma meta cadastrada na Central de Configurações.', rightX + 5, botY + 16);
  } else {
    activeGoals.forEach((g, idx) => {
      const prog = computeGoalProgress(g, totals, year);
      const gy = botY + 15 + idx * 12.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C_SLATE_DARK);
      doc.text(g.title.slice(0, 42), rightX + 5, gy);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C_SLATE_MUTED);
      doc.text(
        `${formatBRL(prog.currentAmount)} de ${formatBRL(g.targetAmount)} (${prog.pct}%) · ${prog.statusLabel}`,
        rightX + 5,
        gy + 4
      );

      const barW = rightW - 10;
      doc.setFillColor(226, 232, 240);
      doc.rect(rightX + 5, gy + 5.5, barW, 2.2, 'F');
      doc.setFillColor(...(prog.status === 'achieved' ? C_EMERALD : C_GOLD));
      doc.rect(rightX + 5, gy + 5.5, (barW * prog.pct) / 100, 2.2, 'F');
    });
  }

  // ==================== PAGE 2: CONSOLIDATED MATRIX TABLE ====================
  doc.addPage('a4', 'landscape');
  drawHeaderBand(`Grade Matricial Consolidada (${year})`, 2);

  const tableX = 12;
  let tableY = 32;
  const catColW = 46;
  const totColW = 24;
  const monthColW = (pageW - 24 - catColW - totColW) / 12;

  // Table Header
  doc.setFillColor(...C_OBSIDIAN);
  doc.rect(tableX, tableY, pageW - 24, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('CATEGORIA / DIA', tableX + 2, tableY + 4.7);
  MONTH_NAMES_SHORT.forEach((mName, mIdx) => {
    doc.text(mName, tableX + catColW + mIdx * monthColW + monthColW - 1.5, tableY + 4.7, {
      align: 'right',
    });
  });
  doc.setTextColor(...C_GOLD);
  doc.text('ANUAL', tableX + catColW + 12 * monthColW + totColW - 2, tableY + 4.7, {
    align: 'right',
  });
  tableY += 7;

  const drawMatrixRow = (
    label: string,
    monthly: number[],
    annual: number,
    style: 'normal' | 'section' | 'subtotal' | 'highlight'
  ) => {
    if (tableY > pageH - 14) {
      doc.addPage('a4', 'landscape');
      drawHeaderBand(`Grade Matricial Consolidada (${year}) — Cont.`, 3);
      tableY = 32;
    }

    const rowH = style === 'section' ? 5.2 : 5.4;

    if (style === 'section') {
      doc.setFillColor(241, 245, 249);
      doc.rect(tableX, tableY, pageW - 24, rowH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(...C_SLATE_DARK);
      doc.text(label, tableX + 2, tableY + 3.7);
      tableY += rowH;
      return;
    }

    if (style === 'subtotal') {
      doc.setFillColor(236, 253, 245);
      doc.rect(tableX, tableY, pageW - 24, rowH, 'F');
    } else if (style === 'highlight') {
      doc.setFillColor(15, 23, 42);
      doc.rect(tableX, tableY, pageW - 24, rowH, 'F');
    }

    doc.setDrawColor(235, 240, 245);
    doc.line(tableX, tableY + rowH, tableX + pageW - 24, tableY + rowH);

    const isDarkRow = style === 'highlight';
    doc.setFont('helvetica', style === 'normal' ? 'normal' : 'bold');
    doc.setFontSize(6.3);
    const rowTextColor: [number, number, number] = isDarkRow ? [255, 255, 255] : C_SLATE_DARK;
    doc.setTextColor(...rowTextColor);
    doc.text(label.slice(0, 24), tableX + 2, tableY + 3.8);

    for (let m = 0; m < 12; m++) {
      const rawVal = monthly[m] ?? 0;
      const val = Number.isFinite(rawVal) ? rawVal : 0;
      const cellText = val === 0 ? '—' : val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      doc.text(cellText, tableX + catColW + m * monthColW + monthColW - 1.5, tableY + 3.8, {
        align: 'right',
      });
    }

    doc.setFont('helvetica', 'bold');
    if (isDarkRow) doc.setTextColor(...C_GOLD);
    const safeAnnual = Number.isFinite(annual) ? annual : 0;
    const annText = safeAnnual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.text(annText, tableX + catColW + 12 * monthColW + totColW - 2, tableY + 3.8, {
      align: 'right',
    });

    tableY += rowH;
  };

  // Block 1: Receitas
  drawMatrixRow('BLOCO 1 · RECEITAS', [], 0, 'section');
  state.rows
    .filter((r) => r.block === 'income' && !r.hidden)
    .sort((a, b) => a.order - b.order)
    .forEach((r) => {
      const label = r.refDay ? `${r.name} (${formatCompactDay(r.refDay)})` : r.name;
      drawMatrixRow(label, totals.rowMonthly[r.id] ?? [], totals.rowAnnual[r.id] ?? 0, 'normal');
    });
  drawMatrixRow('TOTAL RECEITAS', totals.incomeMonthly, totals.incomeAnnual, 'subtotal');

  // Block 2: Fixas
  drawMatrixRow('BLOCO 2 · DESPESAS FIXAS', [], 0, 'section');
  state.rows
    .filter((r) => r.block === 'fixed' && !r.hidden)
    .sort((a, b) => a.order - b.order)
    .forEach((r) => {
      const label = r.refDay ? `${r.name} (${formatCompactDay(r.refDay)})` : r.name;
      drawMatrixRow(label, totals.rowMonthly[r.id] ?? [], totals.rowAnnual[r.id] ?? 0, 'normal');
    });
  drawMatrixRow('TOTAL FIXAS', totals.fixedMonthly, totals.fixedAnnual, 'subtotal');

  // Block 3: Variáveis
  drawMatrixRow('BLOCO 3 · DESPESAS VARIÁVEIS', [], 0, 'section');
  state.rows
    .filter((r) => r.block === 'variable' && !r.hidden)
    .sort((a, b) => a.order - b.order)
    .forEach((r) => {
      const label = r.refDay ? `${r.name} (${formatCompactDay(r.refDay)})` : r.name;
      drawMatrixRow(label, totals.rowMonthly[r.id] ?? [], totals.rowAnnual[r.id] ?? 0, 'normal');
    });
  drawMatrixRow('TOTAL VARIÁVEL', totals.variableMonthly, totals.variableAnnual, 'subtotal');

  // Consolidation
  drawMatrixRow('TOTAL DE GASTO', totals.totalExpenseMonthly, totals.totalExpenseAnnual, 'highlight');
  drawMatrixRow('RESULTADO MENSAL', totals.resultMonthly, totals.resultAnnual, 'subtotal');
  drawMatrixRow('GUARDADO (RESERVA)', totals.savingsMonthly, totals.savingsAnnual, 'highlight');

  doc.save(`ORBE_Financas_Relatorio_${year}.pdf`);
}

export type PdfReportScope =
  | 'consolidated'
  | 'summary'
  | 'income'
  | 'expenses'
  | 'recurrences'
  | 'entries';

export type PdfReportPeriod = 'month' | 'year';

export type PdfReportStatusFilter = 'all' | 'paid' | 'pending';

export interface PdfReportOptions {
  state: AppState;
  totals: MatrixTotals;
  scope: PdfReportScope;
  period: PdfReportPeriod;
  focusMonth: number;
  statusFilter?: PdfReportStatusFilter;
  language?: AppLanguage;
}

export interface PdfReportPreviewStats {
  entryCount: number;
  recurringCount: number;
  incomeTotal: number;
  expenseTotal: number;
  resultTotal: number;
  savingsTotal: number;
  projectedBalance: number;
}

function filterEntriesForPdf(options: PdfReportOptions) {
  const { state, period, focusMonth, scope, statusFilter = 'all' } = options;
  const year = state.settings.activeYear;
  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));
  const rowMap = new Map(state.rows.map((r) => [r.id, r]));

  return state.entries
    .filter((entry) => {
      if (entry.year !== year) return false;
      if (period === 'month' && entry.month !== safeMonth) return false;
      if (isDeduplicatedEntry(entry)) return false;
      const row = rowMap.get(entry.rowId);
      if (!row || row.hidden) return false;

      if (scope === 'income' && row.block !== 'income') return false;
      if (scope === 'expenses' && row.block !== 'fixed' && row.block !== 'variable') return false;

      if (statusFilter === 'paid' && entry.status !== 'paid') return false;
      if (statusFilter === 'pending' && entry.status === 'paid') return false;
      return true;
    })
    .sort((a, b) => a.month - b.month || a.day - b.day);
}

export function computePdfReportPreviewStats(options: PdfReportOptions): PdfReportPreviewStats {
  const { state, totals, period, focusMonth } = options;
  const year = state.settings.activeYear;
  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));

  const filteredEntries = filterEntriesForPdf(options);
  const activeRecurrences = (state.recurringBills ?? []).filter((b) => b.active !== false);

  const forecast = computeMonthlyBudgetForecast({
    rows: state.rows,
    entries: state.entries,
    accounts: state.accounts,
    recurringBills: state.recurringBills ?? [],
    creditCards: state.creditCards ?? [],
    cardPurchases: state.cardPurchases ?? [],
    paidCardInvoices: state.paidCardInvoices ?? {},
    totals,
    year,
    focusMonth: safeMonth,
  });

  const incomeTotal =
    period === 'month' ? totals.incomeMonthly[safeMonth] ?? 0 : totals.incomeAnnual;
  const expenseTotal =
    period === 'month' ? totals.totalExpenseMonthly[safeMonth] ?? 0 : totals.totalExpenseAnnual;
  const resultTotal =
    period === 'month' ? totals.resultMonthly[safeMonth] ?? 0 : totals.resultAnnual;
  const savingsTotal =
    period === 'month' ? totals.savingsMonthly[safeMonth] ?? 0 : totals.savingsAnnual;

  return {
    entryCount: filteredEntries.length,
    recurringCount: activeRecurrences.length,
    incomeTotal,
    expenseTotal,
    resultTotal,
    savingsTotal,
    projectedBalance: forecast.projectedMonthClose,
  };
}

export function exportCustomPDFReport(options: PdfReportOptions): { filename: string } {
  const {
    state,
    totals,
    scope,
    period,
    focusMonth,
    statusFilter = 'all',
    language = state.settings.language,
  } = options;

  const year = state.settings.activeYear;
  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));
  const monthNames = getMonthNamesFull(language);
  const periodLabel = period === 'month' ? `${monthNames[safeMonth]} ${year}` : `${year}`;

  // If user requested complete consolidated annual report with no status filter, reuse the executive landscape PDF
  if (scope === 'consolidated' && period === 'year' && statusFilter === 'all') {
    generatePrivateBankingAnnualPDF(state, totals);
    return { filename: `ORBE_Financas_Relatorio_${year}.pdf` };
  }

  const isEn = language === 'en';
  const isEs = language === 'es';

  const scopeLabels: Record<PdfReportScope, string> = isEn
    ? {
        consolidated: 'Consolidated Financial Report',
        summary: 'Financial Summary',
        income: 'Income Report',
        expenses: 'Expenses & Cards Report',
        recurrences: 'Recurrences & Cashflow Forecast',
        entries: 'Detailed Entries Ledger',
      }
    : isEs
    ? {
        consolidated: 'Informe Financiero Consolidado',
        summary: 'Resumen Financiero',
        income: 'Informe de Ingresos',
        expenses: 'Informe de Gastos y Tarjetas',
        recurrences: 'Recurrencias y Previsión',
        entries: 'Detalle de Movimientos',
      }
    : {
        consolidated: 'Relatório Financeiro Consolidado',
        summary: 'Resumo Financeiro',
        income: 'Relatório de Receitas',
        expenses: 'Relatório de Despesas e Cartões',
        recurrences: 'Recorrências e Previsões',
        entries: 'Lançamentos Detalhados',
      };

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 210mm
  const pageH = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentW = pageW - margin * 2;

  const C_OBSIDIAN: [number, number, number] = [9, 13, 22];
  const C_GOLD: [number, number, number] = [201, 168, 106];
  const C_GOLD_DARK: [number, number, number] = [140, 106, 46];
  const C_EMERALD: [number, number, number] = [16, 185, 129];
  const C_ROSE: [number, number, number] = [220, 38, 38];
  const C_SLATE_DARK: [number, number, number] = [15, 23, 42];
  const C_SLATE_MUTED: [number, number, number] = [100, 116, 139];
  const C_BORDER: [number, number, number] = [226, 232, 240];
  const C_BG_SOFT: [number, number, number] = [248, 250, 252];

  let pageNumber = 1;
  let curY = 34;

  const drawHeader = () => {
    doc.setFillColor(...C_OBSIDIAN);
    doc.rect(0, 0, pageW, 25, 'F');
    doc.setFillColor(...C_GOLD);
    doc.rect(0, 25, pageW, 0.8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.text('ORBE FINANÇAS', margin, 11.5);

    doc.setTextColor(...C_GOLD);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${scopeLabels[scope]}  ·  ${periodLabel}`, margin, 18.2);

    doc.setTextColor(180, 190, 205);
    doc.setFontSize(7.5);
    const issued = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.text(`${issued}  ·  Pág. ${pageNumber}`, pageW - margin, 14.5, { align: 'right' });
  };

  const ensureSpace = (neededMm: number) => {
    if (curY + neededMm > pageH - 16) {
      doc.addPage('a4', 'portrait');
      pageNumber += 1;
      drawHeader();
      curY = 33;
    }
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C_SLATE_DARK);
    doc.text(title, margin, curY);
    doc.setDrawColor(...C_GOLD);
    doc.setLineWidth(0.4);
    doc.line(margin, curY + 2, margin + 28, curY + 2);
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin + 28, curY + 2, pageW - margin, curY + 2);
    curY += 7;
  };

  drawHeader();

  const rowMap = new Map(state.rows.map((r) => [r.id, r]));
  const stats = computePdfReportPreviewStats(options);
  const spotlight = computeMonthSpotlight(
    state.rows,
    state.entries,
    state.accounts,
    totals,
    year,
    safeMonth
  );
  const forecast = computeMonthlyBudgetForecast({
    rows: state.rows,
    entries: state.entries,
    accounts: state.accounts,
    recurringBills: state.recurringBills ?? [],
    creditCards: state.creditCards ?? [],
    cardPurchases: state.cardPurchases ?? [],
    paidCardInvoices: state.paidCardInvoices ?? {},
    totals,
    year,
    focusMonth: safeMonth,
  });

  // Top KPI Summary Strip (4 cards)
  const kpiGap = 3.5;
  const kpiW = (contentW - kpiGap * 3) / 4;
  const kpiCards: Array<{
    label: string;
    value: string;
    sub: string;
    color: [number, number, number];
  }> = [
    {
      label: isEn ? 'INCOME' : isEs ? 'INGRESOS' : 'RECEITAS',
      value: formatBRL(stats.incomeTotal, false),
      sub: periodLabel,
      color: C_EMERALD,
    },
    {
      label: isEn ? 'EXPENSES' : isEs ? 'GASTOS' : 'DESPESAS',
      value: formatBRL(stats.expenseTotal, false),
      sub:
        period === 'month'
          ? `Fixas ${formatBRL(totals.fixedMonthly[safeMonth] ?? 0)} · Var ${formatBRL(
              totals.variableMonthly[safeMonth] ?? 0
            )}`
          : `Fixas ${formatBRL(totals.fixedAnnual)} · Var ${formatBRL(totals.variableAnnual)}`,
      color: C_SLATE_DARK,
    },
    {
      label: isEn ? 'NET RESULT' : isEs ? 'RESULTADO' : 'RESULTADO LÍQUIDO',
      value: formatBRL(stats.resultTotal, false, true),
      sub:
        stats.incomeTotal > 0
          ? `Margem ${((stats.resultTotal / stats.incomeTotal) * 100).toFixed(1)}%`
          : 'Fluxo do período',
      color: stats.resultTotal >= 0 ? C_EMERALD : C_ROSE,
    },
    {
      label: isEn ? 'PROJECTED / SAVED' : isEs ? 'PROYECCIÓN / RESERVA' : 'PREVISÃO / RESERVA',
      value:
        scope === 'recurrences' || period === 'month'
          ? formatBRL(forecast.projectedMonthClose, false, true)
          : formatBRL(stats.savingsTotal, false),
      sub:
        scope === 'recurrences' || period === 'month'
          ? `Reserva: ${formatBRL(stats.savingsTotal)}`
          : 'Acumulado em reserva',
      color: C_GOLD_DARK,
    },
  ];

  kpiCards.forEach((k, idx) => {
    const x = margin + idx * (kpiW + kpiGap);
    doc.setFillColor(...C_BG_SOFT);
    doc.setDrawColor(...C_BORDER);
    doc.roundedRect(x, curY, kpiW, 21, 1.8, 1.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C_SLATE_MUTED);
    doc.text(k.label, x + 3, curY + 5.5);

    doc.setFontSize(10.5);
    doc.setTextColor(...k.color);
    doc.text(k.value, x + 3, curY + 12.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(...C_SLATE_MUTED);
    doc.text(k.sub.slice(0, 30), x + 3, curY + 17.8);
  });
  curY += 28;

  // Section 1: Summary / Category Breakdown
  if (scope === 'consolidated' || scope === 'summary' || scope === 'income' || scope === 'expenses') {
    const blocksIncluded =
      scope === 'income'
        ? (['income'] as const)
        : scope === 'expenses'
        ? (['fixed', 'variable'] as const)
        : (['income', 'fixed', 'variable', 'savings'] as const);

    const blockNames: Record<string, string> = {
      income: isEn ? 'Income' : isEs ? 'Ingresos' : 'Receitas',
      fixed: isEn ? 'Fixed Expenses' : isEs ? 'Gastos Fijos' : 'Despesas Fixas',
      variable: isEn ? 'Variable Expenses' : isEs ? 'Gastos Variables' : 'Despesas Variáveis',
      savings: isEn ? 'Reserves & Savings' : isEs ? 'Reservas' : 'Reservas / Guardado',
    };

    const catRows = state.rows
      .filter((r) => !r.hidden && (blocksIncluded as readonly string[]).includes(r.block))
      .map((r) => ({
        row: r,
        val:
          period === 'month'
            ? totals.rowMonthly[r.id]?.[safeMonth] ?? 0
            : totals.rowAnnual[r.id] ?? 0,
        annual: totals.rowAnnual[r.id] ?? 0,
      }))
      .filter((item) => item.val > 0 || item.annual > 0 || scope === 'summary' || scope === 'consolidated');

    drawSectionTitle(
      isEn
        ? `Category Breakdown (${periodLabel})`
        : isEs
        ? `Resumen por Categoría (${periodLabel})`
        : `Resumo por Categoria (${periodLabel})`
    );

    const drawCatTableHeader = () => {
      doc.setFillColor(...C_OBSIDIAN);
      doc.rect(margin, curY, contentW, 6.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('CATEGORIA', margin + 2.5, curY + 4.4);
      doc.text('BLOCO', margin + 84, curY + 4.4);
      doc.text('DIA REF.', margin + 122, curY + 4.4);
      doc.text(period === 'month' ? 'VALOR NO MÊS' : 'VALOR ANUAL', pageW - margin - 2.5, curY + 4.4, {
        align: 'right',
      });
      curY += 6.5;
    };

    drawCatTableHeader();

    if (catRows.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C_SLATE_MUTED);
      doc.text('Nenhuma categoria com movimentação neste filtro.', margin + 2.5, curY + 5);
      curY += 10;
    } else {
      catRows.forEach((item, idx) => {
        if (curY + 6 > pageH - 16) {
          ensureSpace(14);
          drawCatTableHeader();
        }
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, curY, contentW, 5.6, 'F');
        }
        doc.setDrawColor(...C_BORDER);
        doc.line(margin, curY + 5.6, pageW - margin, curY + 5.6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(...C_SLATE_DARK);
        doc.text(item.row.name.slice(0, 38), margin + 2.5, curY + 3.9);
        doc.setTextColor(...C_SLATE_MUTED);
        doc.text(blockNames[item.row.block] ?? item.row.block, margin + 84, curY + 3.9);
        doc.text(item.row.refDay ? formatCompactDay(item.row.refDay) : '—', margin + 122, curY + 3.9);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(item.row.block === 'income' ? C_EMERALD : C_SLATE_DARK));
        doc.text(formatBRL(item.val, false), pageW - margin - 2.5, curY + 3.9, { align: 'right' });
        curY += 5.6;
      });
      curY += 6;
    }
  }

  // Section 2: Credit Cards & Limits (on consolidated, summary, or expenses)
  if ((scope === 'consolidated' || scope === 'summary' || scope === 'expenses') && (state.creditCards ?? []).length > 0) {
    drawSectionTitle(
      isEn
        ? `Credit Cards & Invoices (${monthNames[safeMonth]} ${year})`
        : isEs
        ? `Tarjetas de Crédito y Facturas (${monthNames[safeMonth]} ${year})`
        : `Cartões de Crédito & Limites (${monthNames[safeMonth]} ${year})`
    );

    const cardsHeader = () => {
      doc.setFillColor(...C_OBSIDIAN);
      doc.rect(margin, curY, contentW, 6.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('CARTÃO / BANCO', margin + 2.5, curY + 4.4);
      doc.text('FECH. / VENC.', margin + 74, curY + 4.4);
      doc.text('FATURA MÊS', margin + 124, curY + 4.4, { align: 'right' });
      doc.text('LIMITE LIVRE', pageW - margin - 2.5, curY + 4.4, { align: 'right' });
      curY += 6.5;
    };

    cardsHeader();
    spotlight.cardInvoices.forEach((inv, idx) => {
      if (curY + 6 > pageH - 16) {
        ensureSpace(14);
        cardsHeader();
      }
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, curY, contentW, 5.8, 'F');
      }
      doc.setDrawColor(...C_BORDER);
      doc.line(margin, curY + 5.8, pageW - margin, curY + 5.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...C_SLATE_DARK);
      doc.text(`${inv.name} (${inv.status})`.slice(0, 34), margin + 2.5, curY + 4);
      doc.setTextColor(...C_SLATE_MUTED);
      const datesText = inv.closingDay
        ? `Fech. ${formatCompactDay(inv.closingDay)} / Venc. ${formatCompactDay(inv.dueDay)}`
        : `Venc. ${formatCompactDay(inv.dueDay)}`;
      doc.text(datesText, margin + 74, curY + 4);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C_SLATE_DARK);
      doc.text(formatBRL(inv.amount, false), margin + 124, curY + 4, { align: 'right' });
      doc.setTextColor(...C_EMERALD);
      doc.text(
        inv.availableLimit !== undefined ? formatBRL(inv.availableLimit, false) : '—',
        pageW - margin - 2.5,
        curY + 4,
        { align: 'right' }
      );
      curY += 5.8;
    });
    curY += 6;
  }

  // Section 3: Recurrences & Cashflow Forecast (on consolidated, recurrences, or summary)
  if (scope === 'consolidated' || scope === 'recurrences' || scope === 'summary') {
    drawSectionTitle(
      isEn
        ? `Recurrences & Forecast (${monthNames[safeMonth]} ${year})`
        : isEs
        ? `Recurrencias y Previsión (${monthNames[safeMonth]} ${year})`
        : `Recorrências & Previsões de Caixa (${monthNames[safeMonth]} ${year})`
    );

    // Forecast summary bar
    ensureSpace(16);
    doc.setFillColor(...C_BG_SOFT);
    doc.setDrawColor(...C_BORDER);
    doc.roundedRect(margin, curY, contentW, 12, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...C_SLATE_DARK);
    doc.text(
      `Receita Prevista: ${formatBRL(forecast.totalForecastIncome)}  ·  Gasto Previsto: ${formatBRL(
        forecast.totalForecastExpense
      )}  ·  Pendências do Mês: ${formatBRL(
        forecast.totalPendingCommitments
      )}  ·  Saldo Projetado: ${formatBRL(forecast.projectedMonthClose, false, true)}`,
      margin + 3.5,
      curY + 7.2
    );
    curY += 15;

    const bills = [...(state.recurringBills ?? [])].sort((a, b) => a.dueDay - b.dueDay);
    if (bills.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C_SLATE_MUTED);
      doc.text('Nenhuma conta fixa ou recebimento recorrente cadastrado.', margin + 2, curY + 4);
      curY += 9;
    } else {
      const recHeader = () => {
        doc.setFillColor(...C_OBSIDIAN);
        doc.rect(margin, curY, contentW, 6.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text('ITEM RECORRENTE', margin + 2.5, curY + 4.4);
        doc.text('TIPO', margin + 74, curY + 4.4);
        doc.text('DIA', margin + 104, curY + 4.4);
        doc.text('STATUS', margin + 124, curY + 4.4);
        doc.text('VALOR', pageW - margin - 2.5, curY + 4.4, { align: 'right' });
        curY += 6.5;
      };

      recHeader();
      bills.forEach((bill, idx) => {
        if (curY + 6 > pageH - 16) {
          ensureSpace(14);
          recHeader();
        }
        const effective = getEffectiveRecurringStatus(
          bill,
          year,
          safeMonth,
          new Date(),
          state.settings.alertLeadDays ?? 3
        );
        const statusText =
          bill.active === false
            ? 'Pausado'
            : effective.status === 'paid'
            ? bill.type === 'income'
              ? 'Recebido'
              : 'Pago'
            : effective.status === 'overdue'
            ? 'Atrasado'
            : 'Pendente';

        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, curY, contentW, 5.6, 'F');
        }
        doc.setDrawColor(...C_BORDER);
        doc.line(margin, curY + 5.6, pageW - margin, curY + 5.6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(...C_SLATE_DARK);
        doc.text(bill.title.slice(0, 34), margin + 2.5, curY + 3.9);
        doc.setTextColor(...(bill.type === 'income' ? C_EMERALD : C_SLATE_MUTED));
        doc.text(bill.type === 'income' ? 'Recebimento' : 'Débito Fixo', margin + 74, curY + 3.9);
        doc.setTextColor(...C_SLATE_MUTED);
        doc.text(formatCompactDay(bill.dueDay), margin + 104, curY + 3.9);
        doc.text(statusText, margin + 124, curY + 3.9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(bill.type === 'income' ? C_EMERALD : C_SLATE_DARK));
        doc.text(formatBRL(bill.amount, false), pageW - margin - 2.5, curY + 3.9, {
          align: 'right',
        });
        curY += 5.6;
      });
      curY += 6;
    }
  }

  // Section 4: Detailed Transactions Ledger
  if (
    scope === 'consolidated' ||
    scope === 'entries' ||
    scope === 'income' ||
    scope === 'expenses'
  ) {
    const entries = filterEntriesForPdf(options);
    drawSectionTitle(
      isEn
        ? `Transactions Ledger (${entries.length} records)`
        : isEs
        ? `Movimientos Detallados (${entries.length} registros)`
        : `Lançamentos Detalhados (${entries.length} registros)`
    );

    const entryHeader = () => {
      doc.setFillColor(...C_OBSIDIAN);
      doc.rect(margin, curY, contentW, 6.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.text('DATA', margin + 2, curY + 4.4);
      doc.text('DESCRIÇÃO', margin + 23, curY + 4.4);
      doc.text('CATEGORIA', margin + 84, curY + 4.4);
      doc.text('MOD. / PARC.', margin + 122, curY + 4.4);
      doc.text('STATUS', margin + 150, curY + 4.4);
      doc.text('VALOR', pageW - margin - 2, curY + 4.4, { align: 'right' });
      curY += 6.5;
    };

    entryHeader();
    if (entries.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C_SLATE_MUTED);
      doc.text('Nenhum lançamento encontrado para os filtros selecionados.', margin + 2, curY + 5);
      curY += 10;
    } else {
      entries.forEach((entry, idx) => {
        if (curY + 6 > pageH - 16) {
          ensureSpace(14);
          entryHeader();
        }
        const row = rowMap.get(entry.rowId);
        const inst = parseInstallmentInfo(entry);
        const dateStr = `${String(entry.day).padStart(2, '0')}/${String(entry.month + 1).padStart(
          2,
          '0'
        )}/${entry.year}`;
        const desc = (entry.merchant || entry.description || row?.name || 'Lançamento').slice(0, 29);
        const cat = (row?.name ?? 'OUTROS').slice(0, 18);
        const mod = `${formatPaymentMethodLabel(entry.paymentMethod)}${
          inst.total > 1 ? ` ${inst.current}/${inst.total}` : ''
        }`.slice(0, 15);
        const st = entry.status === 'paid' ? 'Pago' : entry.status === 'projected' ? 'Projetado' : 'Pendente';

        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, curY, contentW, 5.5, 'F');
        }
        doc.setDrawColor(...C_BORDER);
        doc.line(margin, curY + 5.5, pageW - margin, curY + 5.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(...C_SLATE_MUTED);
        doc.text(dateStr, margin + 2, curY + 3.8);

        doc.setTextColor(...C_SLATE_DARK);
        doc.text(desc, margin + 23, curY + 3.8);
        doc.setTextColor(...C_SLATE_MUTED);
        doc.text(cat, margin + 84, curY + 3.8);
        doc.text(mod, margin + 122, curY + 3.8);
        doc.text(st, margin + 150, curY + 3.8);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(row?.block === 'income' ? C_EMERALD : C_SLATE_DARK));
        doc.text(formatBRL(entry.amount, false), pageW - margin - 2, curY + 3.8, {
          align: 'right',
        });
        curY += 5.5;
      });
    }
  }

  const periodSlug =
    period === 'month' ? `${year}-${String(safeMonth + 1).padStart(2, '0')}` : `${year}`;
  const filename = `ORBE_Financas_PDF_${scope}_${periodSlug}.pdf`;
  doc.save(filename);
  return { filename };
}

