import * as XLSX from 'xlsx';
import {
  AppLanguage,
  AppState,
  BlockType,
  CategoryRow,
  EntryStatus,
  MatrixTotals,
  PaymentMethod,
  RecurringBill,
  TransactionEntry,
} from '../types/finance';
import { computeAllCreditCardsOverview } from './creditCardsEngine';
import { getMonthNamesShort } from './i18n';

export type ReportScope =
  | 'all_entries'
  | 'income'
  | 'expenses'
  | 'recurrences'
  | 'monthly_summary';

export type ReportFormat = 'xlsx' | 'csv';
export type ReportPeriod = 'month' | 'year';
export type ReportStatusFilter = 'all' | 'paid' | 'pending' | 'projected';

export interface ExportReportOptions {
  state: AppState;
  totals: MatrixTotals;
  scope: ReportScope;
  format: ReportFormat;
  period: ReportPeriod;
  focusMonth: number;
  categoryRowId?: string;
  statusFilter?: ReportStatusFilter;
  language?: AppLanguage;
}

export interface ExportReportResult {
  filename: string;
  rowCount: number;
  format: ReportFormat;
  scope: ReportScope;
}

export interface ValidatedImportRow {
  lineNumber: number;
  dateFormatted: string;
  year: number;
  month: number; // 0..11
  day: number; // 1..31
  block: BlockType;
  typeLabel: string;
  categoryName: string;
  matchedRowId: string | null;
  newCategoryBlock: BlockType | null;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  accountId: string;
  accountLabel: string;
  matchedCardId?: string;
  installments?: string;
  installmentCurrent?: number;
  installmentTotal?: number;
  isRecurring: boolean;
  status: EntryStatus;
  note?: string;
}

export interface ImportRowError {
  lineNumber: number;
  field: string;
  message: string;
  rawPreview: string;
}

export interface SpreadsheetImportPreview {
  fileName: string;
  totalRowsRead: number;
  validRows: ValidatedImportRow[];
  errorRows: ImportRowError[];
  structuralError?: string;
  summary: {
    validCount: number;
    errorCount: number;
    incomeTotal: number;
    expenseTotal: number;
    savingsTotal: number;
    recurringCount: number;
    installmentCount: number;
    newCategories: Array<{ name: string; block: BlockType }>;
  };
}

// ==================== HELPERS ====================

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeCsvCell(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '0';
    return value.toFixed(2).replace('.', ',');
  }
  const str = String(value ?? '');
  const escaped = str.replace(/"/g, '""');
  if (/[;"\r\n,]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function buildCsvContent(headers: string[], rows: Array<Array<string | number>>): string {
  const lines: string[] = [headers.map((h) => escapeCsvCell(h)).join(';')];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(';'));
  }
  // UTF-8 BOM ensures Excel opens Portuguese accents cleanly
  return '\uFEFF' + lines.join('\r\n');
}

function triggerBlobDownload(blob: Blob, filename: string): { inIframe: boolean } {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('Não foi possível gerar o arquivo: conteúdo vazio.');
  }
  const inIframe = typeof window !== 'undefined' && window.self !== window.top;
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { inIframe };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Falha ao iniciar o download do arquivo no navegador.');
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}

function applyWorksheetFormatting(
  ws: XLSX.WorkSheet,
  headers: string[],
  rows: Array<Array<string | number>>,
  currencyColIndices: number[] = []
): void {
  const colWidths = headers.map((header, colIdx) => {
    let maxLen = header.length;
    for (const r of rows) {
      const cellVal = r[colIdx];
      const str =
        typeof cellVal === 'number'
          ? cellVal.toFixed(2)
          : String(cellVal ?? '');
      if (str.length > maxLen) {
        maxLen = str.length;
      }
    }
    return { wch: Math.min(44, Math.max(11, maxLen + 4)) };
  });
  ws['!cols'] = colWidths;

  if (currencyColIndices.length > 0 && ws['!ref']) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = 1; r <= range.e.r; r++) {
      for (const c of currencyColIndices) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && cell.t === 'n') {
          cell.z = '#,##0.00';
        }
      }
    }
  }
}

function formatDateBR(year: number, month: number, day: number): string {
  const d = String(Math.min(31, Math.max(1, Math.trunc(day)))).padStart(2, '0');
  const m = String(Math.min(12, Math.max(1, Math.trunc(month) + 1))).padStart(2, '0');
  return `${d}/${m}/${year}`;
}

function blockToLabelPt(block: BlockType): string {
  switch (block) {
    case 'income':
      return 'Receita';
    case 'fixed':
      return 'Despesa Fixa';
    case 'variable':
      return 'Despesa Variável';
    case 'savings':
      return 'Reserva';
  }
}

function paymentMethodToLabelPt(method?: PaymentMethod): string {
  switch (method) {
    case 'credit':
      return 'Crédito';
    case 'debit':
      return 'Débito';
    case 'pix':
      return 'Pix';
    case 'transfer':
      return 'Transferência';
    case 'cash':
      return 'Dinheiro';
    default:
      return 'Débito';
  }
}

function statusToLabelPt(status: EntryStatus): string {
  switch (status) {
    case 'paid':
      return 'Pago';
    case 'pending':
      return 'Pendente';
    case 'projected':
      return 'Projetado';
  }
}

function resolveAccountLabel(
  accountId: string,
  accounts: AppState['accounts'],
  creditCards: AppState['creditCards'] = []
): string {
  if (!accountId || accountId === 'manual') return 'Manual / Caixa';
  const acc = accounts.find((a) => a.id === accountId);
  if (acc) return `${acc.institution}${acc.nickname ? ` (${acc.nickname})` : ''}`;
  const card = creditCards.find((c) => c.id === accountId);
  if (card) return `Cartão ${card.bankName}${card.nickname ? ` (${card.nickname})` : ''}`;
  return accountId;
}

function filterEntriesForExport(options: ExportReportOptions): TransactionEntry[] {
  const { state, scope, period, focusMonth, categoryRowId, statusFilter = 'all' } = options;
  const rowMap = new Map(state.rows.map((r) => [r.id, r]));
  const activeYear = state.settings.activeYear;

  return state.entries
    .filter((entry) => {
      if (entry.year !== activeYear) return false;
      if (period === 'month' && entry.month !== focusMonth) return false;
      if (categoryRowId && categoryRowId !== 'all' && entry.rowId !== categoryRowId) return false;
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;

      const row = rowMap.get(entry.rowId);
      const block = row?.block ?? 'variable';
      if (scope === 'income') return block === 'income';
      if (scope === 'expenses') return block === 'fixed' || block === 'variable';
      return true;
    })
    .sort((a, b) => a.month - b.month || a.day - b.day);
}

export function countExportRecords(options: ExportReportOptions): number {
  const { state, scope, period, focusMonth } = options;
  if (scope === 'recurrences') {
    return (state.recurringBills ?? []).length;
  }
  if (scope === 'monthly_summary') {
    const visibleCount = state.rows.filter((r) => !r.hidden).length;
    return visibleCount + 5; // Categories + summary rows
  }
  const entryCount = filterEntriesForExport(options).length;
  if (scope === 'expenses' || scope === 'all_entries') {
    const cards = state.creditCards ?? [];
    const purchases = state.cardPurchases ?? [];
    if (cards.length > 0 && purchases.length > 0) {
      const overview = computeAllCreditCardsOverview(
        cards,
        purchases,
        state.paidCardInvoices ?? {},
        state.settings.activeYear,
        focusMonth
      );
      if (period === 'month') {
        const cardSlices = overview.summaries.reduce((s, item) => s + item.monthSlices.length, 0);
        return entryCount + cardSlices;
      }
    }
  }
  return entryCount;
}

// ==================== EXPORT ENGINE ====================

export function exportFinancialReport(options: ExportReportOptions): ExportReportResult {
  const {
    state,
    totals,
    scope,
    format,
    period,
    focusMonth,
    language = state.settings.language,
  } = options;
  const activeYear = state.settings.activeYear;
  const monthShorts = getMonthNamesShort(language);
  const monthTag = period === 'month' ? `${monthShorts[focusMonth]}-${activeYear}` : `${activeYear}`;
  const rowMap = new Map(state.rows.map((r) => [r.id, r]));

  let sheetName = 'Relatório';
  let headers: string[] = [];
  let dataRows: Array<Array<string | number>> = [];
  let currencyCols: number[] = [];

  if (scope === 'recurrences') {
    sheetName = 'Recorrências';
    headers = [
      'Nome',
      'Tipo',
      'Dia Venc./Entrada',
      'Valor (R$)',
      'Categoria',
      'Ativo',
      `Status (${monthShorts[focusMonth]}/${activeYear})`,
      'Observações',
    ];
    const monthKey = `${activeYear}-${String(focusMonth).padStart(2, '0')}`;
    const bills: RecurringBill[] = [...(state.recurringBills ?? [])].sort(
      (a, b) => a.dueDay - b.dueDay
    );
    dataRows = bills.map((b) => {
      const cat = b.categoryRowId ? rowMap.get(b.categoryRowId)?.name ?? '' : '';
      const st = b.statusByMonth?.[monthKey] ?? 'pending';
      const stLabel = st === 'paid' ? 'Pago/Recebido' : st === 'overdue' ? 'Atrasado' : 'Pendente';
      return [
        b.title,
        b.type === 'income' ? 'Recebimento' : 'Débito / Conta Fixa',
        b.dueDay,
        Number(b.amount.toFixed(2)),
        cat || 'Geral',
        b.active !== false ? 'Ativo' : 'Pausado',
        stLabel,
        b.notes ?? '',
      ];
    });
    currencyCols = [3];
  } else if (scope === 'monthly_summary') {
    sheetName = 'Resumo Mensal';
    if (period === 'month') {
      headers = ['Bloco', 'Categoria', `Realizado (${monthShorts[focusMonth]})`, 'Média Mensal (R$)', 'Limite/Teto (R$)', 'Total Anual (R$)'];
      const visibleRows = state.rows
        .filter((r) => !r.hidden)
        .sort((a, b) => a.block.localeCompare(b.block) || a.order - b.order);

      dataRows = visibleRows.map((r) => [
        blockToLabelPt(r.block),
        r.name,
        Number((totals.rowMonthly[r.id]?.[focusMonth] ?? 0).toFixed(2)),
        Number((totals.rowAverage[r.id] ?? 0).toFixed(2)),
        r.alertLimit ? Number(r.alertLimit.toFixed(2)) : '',
        Number((totals.rowAnnual[r.id] ?? 0).toFixed(2)),
      ]);
      dataRows.push(
        ['CONSOLIDADO', 'TOTAL RECEITAS', Number((totals.incomeMonthly[focusMonth] ?? 0).toFixed(2)), '', '', Number(totals.incomeAnnual.toFixed(2))],
        ['CONSOLIDADO', 'TOTAL DESPESAS FIXAS', Number((totals.fixedMonthly[focusMonth] ?? 0).toFixed(2)), '', '', Number(totals.fixedAnnual.toFixed(2))],
        ['CONSOLIDADO', 'TOTAL DESPESAS VARIÁVEIS', Number((totals.variableMonthly[focusMonth] ?? 0).toFixed(2)), '', '', Number(totals.variableAnnual.toFixed(2))],
        ['CONSOLIDADO', 'TOTAL DE GASTOS', Number((totals.totalExpenseMonthly[focusMonth] ?? 0).toFixed(2)), '', '', Number(totals.totalExpenseAnnual.toFixed(2))],
        ['CONSOLIDADO', 'RESULTADO LÍQUIDO', Number((totals.resultMonthly[focusMonth] ?? 0).toFixed(2)), '', '', Number(totals.resultAnnual.toFixed(2))],
        ['CONSOLIDADO', 'RESERVA / GUARDADO', Number((totals.savingsMonthly[focusMonth] ?? 0).toFixed(2)), '', '', Number(totals.savingsAnnual.toFixed(2))]
      );
      currencyCols = [2, 3, 4, 5];
    } else {
      headers = ['Bloco', 'Categoria', ...monthShorts, 'Total Anual (R$)', 'Média Mensal (R$)'];
      const visibleRows = state.rows
        .filter((r) => !r.hidden)
        .sort((a, b) => a.block.localeCompare(b.block) || a.order - b.order);

      dataRows = visibleRows.map((r) => {
        const monthly = totals.rowMonthly[r.id] ?? Array(12).fill(0);
        return [
          blockToLabelPt(r.block),
          r.name,
          ...monthly.map((v) => Number(v.toFixed(2))),
          Number((totals.rowAnnual[r.id] ?? 0).toFixed(2)),
          Number((totals.rowAverage[r.id] ?? 0).toFixed(2)),
        ];
      });
      dataRows.push(
        ['CONSOLIDADO', 'TOTAL RECEITAS', ...totals.incomeMonthly.map((v) => Number(v.toFixed(2))), Number(totals.incomeAnnual.toFixed(2)), ''],
        ['CONSOLIDADO', 'TOTAL FIXAS', ...totals.fixedMonthly.map((v) => Number(v.toFixed(2))), Number(totals.fixedAnnual.toFixed(2)), ''],
        ['CONSOLIDADO', 'TOTAL VARIÁVEIS', ...totals.variableMonthly.map((v) => Number(v.toFixed(2))), Number(totals.variableAnnual.toFixed(2)), ''],
        ['CONSOLIDADO', 'TOTAL GASTOS', ...totals.totalExpenseMonthly.map((v) => Number(v.toFixed(2))), Number(totals.totalExpenseAnnual.toFixed(2)), ''],
        ['CONSOLIDADO', 'RESULTADO LÍQUIDO', ...totals.resultMonthly.map((v) => Number(v.toFixed(2))), Number(totals.resultAnnual.toFixed(2)), ''],
        ['CONSOLIDADO', 'RESERVA / GUARDADO', ...totals.savingsMonthly.map((v) => Number(v.toFixed(2))), Number(totals.savingsAnnual.toFixed(2)), '']
      );
      currencyCols = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    }
  } else {
    sheetName =
      scope === 'income' ? 'Receitas' : scope === 'expenses' ? 'Despesas' : 'Lançamentos';
    headers = [
      'Data',
      'Tipo',
      'Categoria',
      'Descrição',
      'Valor',
      'Modalidade',
      'Cartão ou Conta',
      'Parcela',
      'Recorrente',
      'Status',
      'Observações',
    ];

    const filtered = filterEntriesForExport(options);
    dataRows = filtered.map((e) => {
      const row = rowMap.get(e.rowId);
      const block = row?.block ?? 'variable';
      const parcela =
        e.installments ||
        (e.installmentCurrent && e.installmentTotal
          ? `${e.installmentCurrent}/${e.installmentTotal}`
          : '');
      return [
        formatDateBR(e.year, e.month, e.day),
        blockToLabelPt(block),
        row?.name ?? 'OUTROS',
        e.merchant || e.description || row?.name || 'Lançamento',
        Number(e.amount.toFixed(2)),
        paymentMethodToLabelPt(e.paymentMethod),
        resolveAccountLabel(e.accountId, state.accounts, state.creditCards),
        parcela,
        row?.isRecurring ? 'Sim' : 'Não',
        statusToLabelPt(e.status),
        e.note ?? '',
      ];
    });

    // Also include credit card purchase slices for the month when exporting expenses or all_entries
    if ((scope === 'expenses' || scope === 'all_entries') && period === 'month') {
      const cards = state.creditCards ?? [];
      const purchases = state.cardPurchases ?? [];
      if (cards.length > 0 && purchases.length > 0) {
        const overview = computeAllCreditCardsOverview(
          cards,
          purchases,
          state.paidCardInvoices ?? {},
          activeYear,
          focusMonth
        );
        for (const summary of overview.summaries) {
          for (const slice of summary.monthSlices) {
            dataRows.push([
              formatDateBR(slice.billYear, slice.billMonth, summary.card.dueDay),
              'Despesa Variável',
              slice.category || 'Cartão de Crédito',
              slice.description,
              Number(slice.amount.toFixed(2)),
              'Crédito',
              `Cartão ${summary.card.bankName}${summary.card.nickname ? ` (${summary.card.nickname})` : ''}`,
              `${slice.installmentNumber}/${slice.totalInstallments}`,
              'Não',
              slice.isPaid ? 'Pago' : 'Pendente',
              `Compra em ${slice.purchaseDate}`,
            ]);
          }
        }
      }
    }

    currencyCols = [4];
  }

  const scopeSlug =
    scope === 'all_entries'
      ? 'lancamentos'
      : scope === 'income'
      ? 'receitas'
      : scope === 'expenses'
      ? 'despesas'
      : scope === 'recurrences'
      ? 'recorrencias'
      : 'resumo-mensal';
  const ext = format === 'xlsx' ? 'xlsx' : 'csv';
  const filename = `orbe-financas-relatorio-${scopeSlug}-${monthTag.toLowerCase()}.${ext}`;

  if (format === 'csv') {
    const csv = buildCsvContent(headers, dataRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    triggerBlobDownload(blob, filename);
    return { filename, rowCount: dataRows.length, format, scope };
  }

  const wb = XLSX.utils.book_new();
  const aoa = [headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  applyWorksheetFormatting(ws, headers, dataRows, currencyCols);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));

  // Add secondary consolidated totals sheet on entries/summary workbooks
  if (scope !== 'monthly_summary') {
    const summaryHeaders = ['Indicador', `Mês (${monthShorts[focusMonth]}/${activeYear})`, `Consolidado (${activeYear})`];
    const summaryRows: Array<Array<string | number>> = [
      ['Total Receitas (R$)', Number((totals.incomeMonthly[focusMonth] ?? 0).toFixed(2)), Number(totals.incomeAnnual.toFixed(2))],
      ['Despesas Fixas (R$)', Number((totals.fixedMonthly[focusMonth] ?? 0).toFixed(2)), Number(totals.fixedAnnual.toFixed(2))],
      ['Despesas Variáveis (R$)', Number((totals.variableMonthly[focusMonth] ?? 0).toFixed(2)), Number(totals.variableAnnual.toFixed(2))],
      ['Total de Gastos (R$)', Number((totals.totalExpenseMonthly[focusMonth] ?? 0).toFixed(2)), Number(totals.totalExpenseAnnual.toFixed(2))],
      ['Resultado Líquido (R$)', Number((totals.resultMonthly[focusMonth] ?? 0).toFixed(2)), Number(totals.resultAnnual.toFixed(2))],
      ['Reserva / Guardado (R$)', Number((totals.savingsMonthly[focusMonth] ?? 0).toFixed(2)), Number(totals.savingsAnnual.toFixed(2))],
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    applyWorksheetFormatting(summaryWs, summaryHeaders, summaryRows, [1, 2]);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumo');
  }

  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, filename);

  return { filename, rowCount: dataRows.length, format, scope };
}

// ==================== IMPORT TEMPLATE GENERATOR ====================

export const TEMPLATE_HEADERS = [
  'Data',
  'Tipo',
  'Categoria',
  'Descrição',
  'Valor',
  'Modalidade',
  'Cartão ou Conta',
  'Parcela',
  'Recorrente',
  'Status',
  'Observações',
];

export function downloadImportTemplate(
  format: ReportFormat,
  rows: CategoryRow[],
  activeYear: number
): { filename: string; inIframe: boolean } {
  const sampleRows: Array<Array<string | number>> = [
    [
      `08/11/${activeYear}`,
      'Receita',
      'PIZZARIA',
      'Salário / Recebimento Principal',
      2500.0,
      'Pix',
      'Conta Principal',
      '',
      'Sim',
      'Pago',
      'Recebimento mensal recorrente',
    ],
    [
      `15/11/${activeYear}`,
      'Despesa Fixa',
      'ALUGUEL',
      'Aluguel Residencial',
      885.0,
      'Pix',
      'Conta Principal',
      '',
      'Sim',
      'Pendente',
      'Vencimento todo dia 15',
    ],
    [
      `10/11/${activeYear}`,
      'Despesa Variável',
      'MERCADO',
      'Supermercado Compra do Mês',
      450.75,
      'Crédito',
      'Cartão SA',
      '1/3',
      'Não',
      'Pago',
      'Parcelado em 3x sem juros',
    ],
  ];

  const filename = `orbe-financas-planilha-modelo-importacao.${format}`;

  if (format === 'csv') {
    const csv = buildCsvContent(TEMPLATE_HEADERS, sampleRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const { inIframe } = triggerBlobDownload(blob, filename);
    return { filename, inIframe };
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...sampleRows]);
  applyWorksheetFormatting(ws, TEMPLATE_HEADERS, sampleRows, [4]);
  XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');

  const guideHeaders = ['Coluna', 'Obrigatória', 'Valores Aceitos / Formato', 'Exemplo'];
  const guideRows: Array<Array<string>> = [
    ['Data', 'Sim', 'DD/MM/AAAA ou AAAA-MM-DD', `15/11/${activeYear}`],
    ['Tipo', 'Sim', 'Receita | Despesa Fixa | Despesa Variável | Despesa | Reserva', 'Despesa Fixa'],
    ['Categoria', 'Opcional (padrão OUTROS)', 'Nome da categoria do app (novas categorias são criadas automaticamente)', 'ALUGUEL'],
    ['Descrição', 'Sim', 'Nome do estabelecimento ou descrição do lançamento', 'Supermercado Assaí'],
    ['Valor', 'Sim', 'Número maior que zero (ex.: 450,75 ou 450.75)', '450,75'],
    ['Modalidade', 'Opcional (padrão Débito)', 'Pix | Débito | Crédito | Transferência | Dinheiro', 'Crédito'],
    ['Cartão ou Conta', 'Opcional', 'Nome da conta ou cartão cadastrado', 'Cartão SA'],
    ['Parcela', 'Opcional', 'Formato atual/total (ex.: 1/3) ou total (3x)', '1/3'],
    ['Recorrente', 'Opcional', 'Sim ou Não', 'Sim'],
    ['Status', 'Opcional (padrão Pago)', 'Pago | Pendente | Projetado', 'Pendente'],
    ['Observações', 'Opcional', 'Anotações livres', 'Vencimento dia 15'],
    ['', '', '', ''],
    ['CATEGORIAS ATIVAS NO APP', 'BLOCO', 'LIMITE (R$)', ''],
    ...rows
      .filter((r) => !r.hidden)
      .map((r) => [r.name, blockToLabelPt(r.block), r.alertLimit ? String(r.alertLimit) : '', '']),
  ];
  const guideWs = XLSX.utils.aoa_to_sheet([guideHeaders, ...guideRows]);
  applyWorksheetFormatting(guideWs, guideHeaders, guideRows);
  XLSX.utils.book_append_sheet(wb, guideWs, 'Instruções');

  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const { inIframe } = triggerBlobDownload(blob, filename);
  return { filename, inIframe };
}

// ==================== IMPORT PARSER & VALIDATOR ====================

type CanonicalColumn =
  | 'date'
  | 'type'
  | 'category'
  | 'description'
  | 'amount'
  | 'method'
  | 'account'
  | 'installment'
  | 'recurring'
  | 'status'
  | 'note';

function mapHeaderToCanonical(rawHeader: string): CanonicalColumn | null {
  const h = normalizeText(rawHeader).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!h) return null;

  if (h === 'data' || h === 'date' || h === 'vencimento' || h === 'data lancamento') return 'date';
  if (h === 'tipo' || h === 'type' || h === 'entrada saida' || h === 'natureza' || h === 'movimento') return 'type';
  if (h === 'categoria' || h === 'category' || h === 'linha') return 'category';
  if (
    h === 'descricao' ||
    h === 'description' ||
    h === 'historico' ||
    h === 'estabelecimento' ||
    h === 'titulo' ||
    h === 'nome'
  ) {
    return 'description';
  }
  if (h === 'valor' || h === 'valor r' || h === 'amount' || h === 'quantia' || h === 'total') return 'amount';
  if (h === 'modalidade' || h === 'forma de pagamento' || h === 'pagamento' || h === 'meio') return 'method';
  if (h === 'cartao ou conta' || h === 'cartao' || h === 'conta' || h === 'banco' || h === 'account') return 'account';
  if (h === 'parcela' || h === 'parcelas' || h === 'installment' || h === 'parcelamento') return 'installment';
  if (h === 'recorrente' || h === 'recorrencia' || h === 'fixo' || h === 'recurring') return 'recurring';
  if (h === 'status' || h === 'situacao') return 'status';
  if (h === 'observacoes' || h === 'observacao' || h === 'obs' || h === 'nota' || h === 'note') return 'note';
  return null;
}

function parseCsvMatrix(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const firstLine = cleaned.split(/\r?\n/)[0] ?? '';
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const delimiter =
    tabCount > semicolonCount && tabCount > commaCount
      ? '\t'
      : semicolonCount >= commaCount
      ? ';'
      : ',';

  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      matrix.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      matrix.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    matrix.push(row);
  }

  return matrix;
}

function parseFlexibleDate(
  raw: unknown
): { year: number; month: number; day: number; formatted: string } | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const year = raw.getFullYear();
    const month = raw.getMonth();
    const day = raw.getDate();
    if (year < 1900 || year > 9999) return null;
    return { year, month, day, formatted: formatDateBR(year, month, day) };
  }

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 1 && raw < 300000) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed && parsed.y >= 1900 && parsed.y <= 9999) {
      const month = parsed.m - 1;
      return {
        year: parsed.y,
        month,
        day: parsed.d,
        formatted: formatDateBR(parsed.y, month, parsed.d),
      };
    }
  }

  const str = String(raw ?? '').trim();
  if (!str) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(str);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    if (year >= 1900 && year <= 9999 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return { year, month, day, formatted: formatDateBR(year, month, day) };
    }
    return null;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
  const brMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(str);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    let year = parseInt(brMatch[3], 10);
    if (year < 100) year += 2000;
    if (year >= 1900 && year <= 9999 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const check = new Date(year, month, day);
      if (check.getFullYear() === year && check.getMonth() === month && check.getDate() === day) {
        return { year, month, day, formatted: formatDateBR(year, month, day) };
      }
    }
    return null;
  }

  return null;
}

function parseFlexibleAmount(raw: unknown): { value: number; isNegative: boolean } | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw === 0) return null;
    return { value: Number(Math.abs(raw).toFixed(2)), isNegative: raw < 0 };
  }

  const str = String(raw ?? '').trim();
  if (!str) return null;

  const isNegative = str.startsWith('-') || str.includes('(-');
  let cleaned = str.replace(/[R$\s()+-]/g, '');
  if (!cleaned) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    // Whichever appears last is the decimal separator
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    cleaned = cleaned.replace(',', '.');
  } else if (hasDot) {
    // Handle thousand-grouped integers like "1.250" if exactly 3 digits after single dot? No, keep decimal dot unless multiple dots
    const dotCount = (cleaned.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      cleaned = cleaned.replace(/\./g, '');
    }
  }

  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) return null;
  return { value: Number(num.toFixed(2)), isNegative };
}

function parseBlockType(raw: unknown, wasNegative: boolean): BlockType | null {
  const n = normalizeText(raw);
  if (!n) {
    return wasNegative ? 'variable' : null;
  }
  if (
    n === 'receita' ||
    n === 'receitas' ||
    n === 'entrada' ||
    n === 'entradas' ||
    n === 'income' ||
    n === 'ganho' ||
    n === 'credito' ||
    n === 'recebimento'
  ) {
    return 'income';
  }
  if (
    n === 'despesa fixa' ||
    n === 'fixa' ||
    n === 'fixas' ||
    n === 'fixed' ||
    n === 'conta fixa'
  ) {
    return 'fixed';
  }
  if (
    n === 'despesa' ||
    n === 'despesas' ||
    n === 'despesa variavel' ||
    n === 'variavel' ||
    n === 'variaveis' ||
    n === 'variable' ||
    n === 'saida' ||
    n === 'saidas' ||
    n === 'gasto' ||
    n === 'debito' ||
    n === 'expense'
  ) {
    return 'variable';
  }
  if (
    n === 'reserva' ||
    n === 'guardado' ||
    n === 'investimento' ||
    n === 'investimentos' ||
    n === 'poupanca' ||
    n === 'savings'
  ) {
    return 'savings';
  }
  return null;
}

function parsePaymentMethod(raw: unknown): PaymentMethod | null {
  const n = normalizeText(raw);
  if (!n) return null;
  if (n.includes('cred') || n.includes('cartao')) return 'credit';
  if (n.includes('pix')) return 'pix';
  if (n.includes('deb')) return 'debit';
  if (n.includes('transf') || n.includes('ted') || n.includes('doc')) return 'transfer';
  if (n.includes('dinheiro') || n.includes('especie') || n.includes('cash')) return 'cash';
  return null;
}

function parseStatus(raw: unknown): EntryStatus | null {
  const n = normalizeText(raw);
  if (!n) return 'paid';
  if (n.includes('pag') || n.includes('receb') || n.includes('confirm') || n === 'ok' || n === 'paid') {
    return 'paid';
  }
  if (n.includes('pend') || n.includes('abert') || n.includes('atras')) {
    return 'pending';
  }
  if (n.includes('proj') || n.includes('prev')) {
    return 'projected';
  }
  return null;
}

function parseBooleanFlag(raw: unknown): boolean {
  const n = normalizeText(raw);
  return n === 'sim' || n === 's' || n === 'yes' || n === 'y' || n === 'true' || n === '1' || n === 'recorrente';
}

function parseInstallment(
  raw: unknown
): { label: string; current: number; total: number } | 'empty' | 'invalid' {
  const str = String(raw ?? '').trim();
  if (!str) return 'empty';
  const slashMatch = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(str);
  if (slashMatch) {
    const cur = parseInt(slashMatch[1], 10);
    const tot = parseInt(slashMatch[2], 10);
    if (cur >= 1 && tot >= cur && tot <= 48) {
      return { label: `${cur}/${tot}`, current: cur, total: tot };
    }
    return 'invalid';
  }
  const xMatch = /^(\d{1,2})\s*x$/i.exec(str);
  if (xMatch) {
    const tot = parseInt(xMatch[1], 10);
    if (tot >= 1 && tot <= 48) {
      return { label: `1/${tot}`, current: 1, total: tot };
    }
    return 'invalid';
  }
  return 'invalid';
}

export async function parseAndValidateSpreadsheet(
  file: File,
  state: AppState
): Promise<SpreadsheetImportPreview> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  let rawMatrix: unknown[][] = [];

  try {
    const buffer = await file.arrayBuffer();
    if (ext === 'csv' || ext === 'txt') {
      let decoded = new TextDecoder('utf-8').decode(buffer);
      if (decoded.includes('\uFFFD')) {
        decoded = new TextDecoder('windows-1252').decode(buffer);
      }
      rawMatrix = parseCsvMatrix(decoded);
    } else {
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) {
        return {
          fileName: file.name,
          totalRowsRead: 0,
          validRows: [],
          errorRows: [],
          structuralError: 'O arquivo não possui nenhuma aba ou tabela legível.',
          summary: {
            validCount: 0,
            errorCount: 0,
            incomeTotal: 0,
            expenseTotal: 0,
            savingsTotal: 0,
            recurringCount: 0,
            installmentCount: 0,
            newCategories: [],
          },
        };
      }
      const ws = wb.Sheets[firstSheetName];
      rawMatrix = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        raw: true,
      }) as unknown[][];
    }
  } catch {
    return {
      fileName: file.name,
      totalRowsRead: 0,
      validRows: [],
      errorRows: [],
      structuralError:
        'Não foi possível ler o arquivo selecionado. Verifique se está no formato .csv, .xlsx ou .xls válido.',
      summary: {
        validCount: 0,
        errorCount: 0,
        incomeTotal: 0,
        expenseTotal: 0,
        savingsTotal: 0,
        recurringCount: 0,
        installmentCount: 0,
        newCategories: [],
      },
    };
  }

  // Locate header row (first non-empty row)
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rawMatrix.length, 10); i++) {
    const row = rawMatrix[i];
    if (Array.isArray(row) && row.some((c) => String(c ?? '').trim() !== '')) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx < 0) {
    return {
      fileName: file.name,
      totalRowsRead: 0,
      validRows: [],
      errorRows: [],
      structuralError: 'A planilha está vazia. Baixe a planilha modelo e preencha os lançamentos.',
      summary: {
        validCount: 0,
        errorCount: 0,
        incomeTotal: 0,
        expenseTotal: 0,
        savingsTotal: 0,
        recurringCount: 0,
        installmentCount: 0,
        newCategories: [],
      },
    };
  }

  const headerCells = rawMatrix[headerRowIdx];
  const colIndex = new Map<CanonicalColumn, number>();
  headerCells.forEach((cell, idx) => {
    const canonical = mapHeaderToCanonical(String(cell ?? ''));
    if (canonical && !colIndex.has(canonical)) {
      colIndex.set(canonical, idx);
    }
  });

  const missingRequired: string[] = [];
  if (!colIndex.has('date')) missingRequired.push('Data');
  if (!colIndex.has('description')) missingRequired.push('Descrição');
  if (!colIndex.has('amount')) missingRequired.push('Valor');

  if (missingRequired.length > 0) {
    return {
      fileName: file.name,
      totalRowsRead: 0,
      validRows: [],
      errorRows: [],
      structuralError: `Colunas obrigatórias não encontradas: ${missingRequired.join(', ')}. Baixe a planilha modelo para garantir os nomes exatos das colunas.`,
      summary: {
        validCount: 0,
        errorCount: 0,
        incomeTotal: 0,
        expenseTotal: 0,
        savingsTotal: 0,
        recurringCount: 0,
        installmentCount: 0,
        newCategories: [],
      },
    };
  }

  const validRows: ValidatedImportRow[] = [];
  const errorRows: ImportRowError[] = [];
  const newCategoriesMap = new Map<string, { name: string; block: BlockType }>();
  let totalRowsRead = 0;

  const creditCards = state.creditCards ?? [];
  const accounts = state.accounts ?? [];

  for (let i = headerRowIdx + 1; i < rawMatrix.length; i++) {
    const row = rawMatrix[i];
    if (!Array.isArray(row) || row.every((c) => String(c ?? '').trim() === '')) {
      continue;
    }

    totalRowsRead++;
    const lineNumber = i + 1;
    const getCell = (col: CanonicalColumn): unknown => {
      const idx = colIndex.get(col);
      return idx !== undefined ? row[idx] : '';
    };

    const rawDate = getCell('date');
    const rawType = getCell('type');
    const rawCategory = getCell('category');
    const rawDesc = getCell('description');
    const rawAmount = getCell('amount');
    const rawMethod = getCell('method');
    const rawAccount = getCell('account');
    const rawInstallment = getCell('installment');
    const rawRecurring = getCell('recurring');
    const rawStatus = getCell('status');
    const rawNote = getCell('note');

    const rawPreview = [rawDate, rawDesc, rawAmount]
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .join(' · ');

    // 1. Validate Date
    const parsedDate = parseFlexibleDate(rawDate);
    if (!parsedDate) {
      errorRows.push({
        lineNumber,
        field: 'Data',
        message: 'Data ausente ou inválida (use DD/MM/AAAA).',
        rawPreview: rawPreview || `Linha ${lineNumber}`,
      });
      continue;
    }

    // 2. Validate Description
    const description = String(rawDesc ?? '').trim();
    if (!description) {
      errorRows.push({
        lineNumber,
        field: 'Descrição',
        message: 'Descrição obrigatória não informada.',
        rawPreview: rawPreview || parsedDate.formatted,
      });
      continue;
    }

    // 3. Validate Amount
    const parsedAmount = parseFlexibleAmount(rawAmount);
    if (!parsedAmount) {
      errorRows.push({
        lineNumber,
        field: 'Valor',
        message: 'Valor inválido ou menor/igual a zero.',
        rawPreview: `${parsedDate.formatted} · ${description}`,
      });
      continue;
    }

    // 4. Validate Type
    const parsedBlock = parseBlockType(rawType, parsedAmount.isNegative);
    if (!parsedBlock) {
      errorRows.push({
        lineNumber,
        field: 'Tipo',
        message: 'Tipo inválido. Use Receita, Despesa Fixa, Despesa Variável ou Reserva.',
        rawPreview: `${parsedDate.formatted} · ${description} · "${String(rawType ?? '')}"`,
      });
      continue;
    }

    // 5. Validate Installment
    const parsedInstallment = parseInstallment(rawInstallment);
    if (parsedInstallment === 'invalid') {
      errorRows.push({
        lineNumber,
        field: 'Parcela',
        message: 'Formato de parcela inválido (use ex.: 1/3 ou 3x, até 48 parcelas).',
        rawPreview: `${description} · "${String(rawInstallment ?? '')}"`,
      });
      continue;
    }

    // 6. Validate Status
    const parsedStatus = parseStatus(rawStatus);
    if (!parsedStatus) {
      errorRows.push({
        lineNumber,
        field: 'Status',
        message: 'Status inválido (use Pago, Pendente ou Projetado).',
        rawPreview: `${description} · "${String(rawStatus ?? '')}"`,
      });
      continue;
    }

    // 7. Match Category (or schedule auto-creation)
    const rawCatClean = String(rawCategory ?? '').trim();
    const normCat = normalizeText(rawCatClean);
    let matchedRow: CategoryRow | undefined;

    if (normCat) {
      matchedRow =
        state.rows.find((r) => !r.hidden && r.block === parsedBlock && normalizeText(r.name) === normCat) ??
        state.rows.find((r) => !r.hidden && normalizeText(r.name) === normCat);
    } else {
      // Fallback to block's OUTROS row if present
      matchedRow = state.rows.find(
        (r) => !r.hidden && r.block === parsedBlock && normalizeText(r.name) === 'outros'
      );
    }

    const effectiveCatName = rawCatClean ? rawCatClean.toUpperCase() : matchedRow?.name ?? 'OUTROS';
    let newCategoryBlock: BlockType | null = null;
    if (!matchedRow) {
      newCategoryBlock = parsedBlock;
      const catKey = `${parsedBlock}::${effectiveCatName}`;
      if (!newCategoriesMap.has(catKey)) {
        newCategoriesMap.set(catKey, { name: effectiveCatName, block: parsedBlock });
      }
    }

    // 8. Match Account / Card & Payment Method
    const rawAccClean = String(rawAccount ?? '').trim();
    const normAcc = normalizeText(rawAccClean);
    const matchedCard = normAcc
      ? creditCards.find(
          (c) =>
            normalizeText(c.bankName).includes(normAcc) ||
            normAcc.includes(normalizeText(c.bankName)) ||
            (c.nickname && normalizeText(c.nickname).includes(normAcc))
        )
      : undefined;
    const matchedBankAcc = normAcc
      ? accounts.find(
          (a) =>
            normalizeText(a.institution).includes(normAcc) ||
            normAcc.includes(normalizeText(a.institution)) ||
            normalizeText(a.nickname).includes(normAcc)
        )
      : undefined;

    const explicitMethod = parsePaymentMethod(rawMethod);
    const paymentMethod: PaymentMethod =
      explicitMethod ??
      (matchedCard || parsedInstallment !== 'empty' || normAcc.includes('cartao')
        ? 'credit'
        : parsedBlock === 'income'
        ? 'pix'
        : 'debit');

    const accountId = matchedBankAcc?.id ?? matchedCard?.id ?? 'manual';
    const accountLabel = matchedBankAcc
      ? matchedBankAcc.institution
      : matchedCard
      ? `Cartão ${matchedCard.bankName}`
      : rawAccClean || 'Manual / Importado';

    const isRecurring = parseBooleanFlag(rawRecurring) || Boolean(matchedRow?.isRecurring);
    const noteParts: string[] = [];
    if (rawNote && String(rawNote).trim()) noteParts.push(String(rawNote).trim());
    if (!matchedBankAcc && !matchedCard && rawAccClean) {
      noteParts.push(`Conta/Cartão: ${rawAccClean}`);
    }

    validRows.push({
      lineNumber,
      dateFormatted: parsedDate.formatted,
      year: parsedDate.year,
      month: parsedDate.month,
      day: parsedDate.day,
      block: matchedRow ? matchedRow.block : parsedBlock,
      typeLabel: blockToLabelPt(matchedRow ? matchedRow.block : parsedBlock),
      categoryName: matchedRow ? matchedRow.name : effectiveCatName,
      matchedRowId: matchedRow ? matchedRow.id : null,
      newCategoryBlock,
      description,
      amount: parsedAmount.value,
      paymentMethod,
      accountId,
      accountLabel,
      matchedCardId: matchedCard?.id,
      installments: parsedInstallment !== 'empty' ? parsedInstallment.label : undefined,
      installmentCurrent: parsedInstallment !== 'empty' ? parsedInstallment.current : undefined,
      installmentTotal: parsedInstallment !== 'empty' ? parsedInstallment.total : undefined,
      isRecurring,
      status: parsedStatus,
      note: noteParts.length > 0 ? noteParts.join(' · ') : undefined,
    });
  }

  const incomeTotal = validRows
    .filter((r) => r.block === 'income')
    .reduce((s, r) => s + r.amount, 0);
  const expenseTotal = validRows
    .filter((r) => r.block === 'fixed' || r.block === 'variable')
    .reduce((s, r) => s + r.amount, 0);
  const savingsTotal = validRows
    .filter((r) => r.block === 'savings')
    .reduce((s, r) => s + r.amount, 0);

  return {
    fileName: file.name,
    totalRowsRead,
    validRows,
    errorRows,
    summary: {
      validCount: validRows.length,
      errorCount: errorRows.length,
      incomeTotal: Number(incomeTotal.toFixed(2)),
      expenseTotal: Number(expenseTotal.toFixed(2)),
      savingsTotal: Number(savingsTotal.toFixed(2)),
      recurringCount: validRows.filter((r) => r.isRecurring).length,
      installmentCount: validRows.filter((r) => Boolean(r.installments)).length,
      newCategories: Array.from(newCategoriesMap.values()),
    },
  };
}
