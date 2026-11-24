import { jsPDF } from 'jspdf';
import { AppState, MatrixTotals } from '../types/finance';
import { MONTH_NAMES_FULL, MONTH_NAMES_SHORT } from '../data/initialData';
import {
  computeGoalProgress,
  computeMonthSpotlight,
  formatBRL,
  formatCompactDay,
} from './financeEngine';

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
    doc.text('THAYLLON PRIVATE CONTROL', 14, 12);

    doc.setTextColor(...C_GOLD);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`CF ${year}+  ·  ${subtitle}`, 14, 18.5);

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

  // Bottom Row Page 1: Mês em Questão + Open Finance Modalidades (Left) & Metas de Economia (Right)
  const botY = chartY + chartH + 6;
  const botH = 54;

  // Left: Active Month + Open Finance Payment Modes
  doc.setFillColor(...C_BG_SOFT);
  doc.setDrawColor(...C_BORDER);
  doc.roundedRect(14, botY, leftW, botH, 2, 2, 'FD');

  doc.setTextColor(...C_SLATE_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `Mês em Foco (${MONTH_NAMES_FULL[focusMonth]} ${year}) · Open Finance & Cartões`,
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
  doc.text('Faturas de Cartão, Limites & Contas Conectadas:', 19, botY + 32.5);

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
    `Contas Open Finance ativas: ${state.accounts.length} / 5 (${
      state.accounts.length > 0
        ? state.accounts.map((a) => a.institution).join(', ')
        : 'Nenhuma conectada'
    })`,
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

  doc.save(`Thayllon_Private_Control_Relatorio_${year}.pdf`);
}
