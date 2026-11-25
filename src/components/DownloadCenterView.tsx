import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { AppLanguage, AppState, MatrixTotals } from '../types/finance';
import { formatBRL } from '../utils/financeEngine';
import { getMonthNamesFull } from '../utils/i18n';
import {
  computePdfReportPreviewStats,
  exportCustomPDFReport,
  PdfReportPeriod,
  PdfReportScope,
  PdfReportStatusFilter,
} from '../utils/pdfReport';
import {
  downloadImportTemplate,
  parseAndValidateSpreadsheet,
  SpreadsheetImportPreview,
  ValidatedImportRow,
} from '../utils/spreadsheetReports';

interface DownloadCenterViewProps {
  state: AppState;
  totals: MatrixTotals;
  language: AppLanguage;
  onConfirmImport: (
    validRows: ValidatedImportRow[],
    options: { syncRecurrences: boolean }
  ) => void;
}

export const DownloadCenterView: React.FC<DownloadCenterViewProps> = ({
  state,
  totals,
  language,
  onConfirmImport,
}) => {
  const isEn = language === 'en';
  const isEs = language === 'es';

  const { settings, rows } = state;
  const activeYear = settings.activeYear;
  const defaultFocusMonth = Math.min(11, Math.max(0, Math.trunc(settings.focusMonth ?? 10)));
  const monthNamesFull = getMonthNamesFull(language);

  // ==================== CSV IMPORT STATE ====================
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsingCsv, setParsingCsv] = useState(false);
  const [csvPreview, setCsvPreview] = useState<SpreadsheetImportPreview | null>(null);
  const [csvFormatError, setCsvFormatError] = useState<string | null>(null);
  const [syncRecurrences, setSyncRecurrences] = useState(true);
  const [csvFeedback, setCsvFeedback] = useState<string | null>(null);

  // ==================== PDF EXPORT STATE ====================
  const [pdfScope, setPdfScope] = useState<PdfReportScope>('consolidated');
  const [pdfPeriod, setPdfPeriod] = useState<PdfReportPeriod>('month');
  const [pdfMonth, setPdfMonth] = useState<number>(defaultFocusMonth);
  const [pdfStatus, setPdfStatus] = useState<PdfReportStatusFilter>('all');
  const [pdfFeedback, setPdfFeedback] = useState<string | null>(null);

  const showStatusFilter =
    pdfScope === 'consolidated' ||
    pdfScope === 'entries' ||
    pdfScope === 'income' ||
    pdfScope === 'expenses';

  const pdfPreviewStats = useMemo(
    () =>
      computePdfReportPreviewStats({
        state,
        totals,
        scope: pdfScope,
        period: pdfPeriod,
        focusMonth: pdfMonth,
        statusFilter: showStatusFilter ? pdfStatus : 'all',
        language,
      }),
    [state, totals, pdfScope, pdfPeriod, pdfMonth, pdfStatus, showStatusFilter, language]
  );

  // ==================== HANDLERS ====================
  const handleDownloadCsvTemplate = () => {
    setCsvFormatError(null);
    const filename = downloadImportTemplate('csv', rows, activeYear);
    setCsvFeedback(
      isEn
        ? `Standard CSV template downloaded: ${filename}`
        : isEs
        ? `Plantilla CSV estándar descargada: ${filename}`
        : `Modelo CSV padrão baixado: ${filename}`
    );
  };

  const handleSelectCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setCsvFeedback(null);
    setCsvFormatError(null);

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvPreview(null);
      setCsvFormatError(
        isEn
          ? 'Please select a valid .csv file. Download the standard CSV template above if needed.'
          : isEs
          ? 'Selecciona un archivo .csv válido. Descarga la plantilla CSV estándar arriba si la necesitas.'
          : 'Selecione apenas um arquivo no formato .csv. Caso precise, baixe o modelo CSV padrão acima.'
      );
      return;
    }

    setParsingCsv(true);
    try {
      const parsed = await parseAndValidateSpreadsheet(file, state);
      setCsvPreview(parsed);
    } catch (err) {
      setCsvPreview(null);
      setCsvFormatError(
        err instanceof Error
          ? err.message
          : 'Não foi possível ler o arquivo CSV selecionado.'
      );
    } finally {
      setParsingCsv(false);
    }
  };

  const handleConfirmCsvImport = () => {
    if (!csvPreview || csvPreview.validRows.length === 0) return;
    const count = csvPreview.validRows.length;
    onConfirmImport(csvPreview.validRows, { syncRecurrences });
    setCsvPreview(null);
    setCsvFormatError(null);
    setCsvFeedback(
      isEn
        ? `${count} record(s) from the CSV file were imported cleanly.`
        : isEs
        ? `Se importaron ${count} registro(s) desde la planilla CSV.`
        : `${count} lançamento(s) da planilha CSV importados e consolidados no aplicativo.`
    );
  };

  const handleExportPdf = () => {
    setPdfFeedback(null);
    const { filename } = exportCustomPDFReport({
      state,
      totals,
      scope: pdfScope,
      period: pdfPeriod,
      focusMonth: pdfMonth,
      statusFilter: showStatusFilter ? pdfStatus : 'all',
      language,
    });
    setPdfFeedback(
      isEn
        ? `PDF report exported: ${filename}`
        : isEs
        ? `Informe PDF exportado: ${filename}`
        : `Relatório PDF gerado e baixado: ${filename}`
    );
  };

  const labels = useMemo(
    () =>
      isEn
        ? {
            csvKicker: 'CSV Spreadsheet Import',
            csvTitle: 'Import CSV Entries',
            csvDesc:
              'Download the standard CSV template, fill in your dates, categories and amounts, then upload to validate and preview every row before saving.',
            downloadTemplateBtn: 'Download CSV Template',
            selectCsvBtn: 'Select CSV File',
            parsingText: 'Validating CSV rows...',
            clearPreview: 'Clear preview',
            syncRecLabel: 'Also register items marked as recurring in Fixed Bills & Incomes',
            confirmCsvBtn: 'Confirm CSV Import',
            pdfKicker: 'PDF Report Export',
            pdfTitle: 'Export PDF Report',
            pdfDesc:
              'Generate an organized, readable PDF report with financial summary, income, expenses, recurrences, cashflow forecasts or detailed entries.',
            scopeLabel: 'Report content',
            periodLabel: 'Period',
            monthOption: 'Specific month',
            yearOption: 'Full year',
            selectMonthLabel: 'Reference month',
            statusLabel: 'Entry status',
            exportPdfBtn: 'Generate & Download PDF',
          }
        : isEs
        ? {
            csvKicker: 'Importación de Planilla CSV',
            csvTitle: 'Importar Planilla CSV',
            csvDesc:
              'Descarga la plantilla CSV estándar, completa fechas, categorías y montos, y sube el archivo para validar y previsualizar antes de guardar.',
            downloadTemplateBtn: 'Descargar Modelo CSV',
            selectCsvBtn: 'Seleccionar Archivo CSV',
            parsingText: 'Validando filas del CSV...',
            clearPreview: 'Limpiar vista previa',
            syncRecLabel: 'Registrar también ítems marcados como recurrentes en Cuentas Fijas',
            confirmCsvBtn: 'Confirmar Importación CSV',
            pdfKicker: 'Exportación de Informe en PDF',
            pdfTitle: 'Exportar Informe en PDF',
            pdfDesc:
              'Genera un informe PDF organizado y legible con resumen financiero, ingresos, gastos, recurrencias, previsiones o movimientos según los filtros.',
            scopeLabel: 'Contenido del informe',
            periodLabel: 'Período',
            monthOption: 'Mes específico',
            yearOption: 'Año completo',
            selectMonthLabel: 'Mes de referencia',
            statusLabel: 'Estado',
            exportPdfBtn: 'Generar y Descargar PDF',
          }
        : {
            csvKicker: 'Importação de Planilha CSV',
            csvTitle: 'Importar Planilha CSV',
            csvDesc:
              'Baixe o modelo CSV padrão para preenchimento correto e envie seu arquivo para validar datas, valores e categorias com pré-visualização antes de gravar.',
            downloadTemplateBtn: 'Baixar Modelo CSV Padrão',
            selectCsvBtn: 'Selecionar Arquivo CSV',
            parsingText: 'Validando linhas da planilha CSV...',
            clearPreview: 'Limpar prévia',
            syncRecLabel:
              'Cadastrar também itens marcados como recorrentes em Contas Fixas e Recebimentos',
            confirmCsvBtn: 'Confirmar Importação CSV',
            pdfKicker: 'Exportação de Relatório em PDF',
            pdfTitle: 'Exportar Relatório em PDF',
            pdfDesc:
              'Gere um relatório PDF organizado e legível com resumo financeiro, receitas, despesas, recorrências, previsões ou lançamentos conforme os filtros.',
            scopeLabel: 'Conteúdo do relatório',
            periodLabel: 'Período',
            monthOption: 'Mês específico',
            yearOption: 'Ano completo',
            selectMonthLabel: 'Mês de referência',
            statusLabel: 'Status dos lançamentos',
            exportPdfBtn: 'Gerar e Baixar Relatório PDF',
          },
    [isEn, isEs]
  );

  const scopeOptions: Array<{ id: PdfReportScope; label: string }> = isEn
    ? [
        { id: 'consolidated', label: 'Complete Consolidated' },
        { id: 'summary', label: 'Financial Summary' },
        { id: 'income', label: 'Income Only' },
        { id: 'expenses', label: 'Expenses & Cards' },
        { id: 'recurrences', label: 'Recurrences & Forecasts' },
        { id: 'entries', label: 'Detailed Entries' },
      ]
    : isEs
    ? [
        { id: 'consolidated', label: 'Consolidado Completo' },
        { id: 'summary', label: 'Resumen Financiero' },
        { id: 'income', label: 'Solo Ingresos' },
        { id: 'expenses', label: 'Gastos y Tarjetas' },
        { id: 'recurrences', label: 'Recurrencias y Previsión' },
        { id: 'entries', label: 'Movimientos Detallados' },
      ]
    : [
        { id: 'consolidated', label: 'Consolidado Completo' },
        { id: 'summary', label: 'Resumo Financeiro' },
        { id: 'income', label: 'Receitas' },
        { id: 'expenses', label: 'Despesas & Cartões' },
        { id: 'recurrences', label: 'Recorrências & Previsões' },
        { id: 'entries', label: 'Lançamentos Detalhados' },
      ];

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* SECTION 1: CSV IMPORT */}
        <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-5 sm:p-6 space-y-5">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {labels.csvKicker}
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <FileSpreadsheet className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{labels.csvTitle}</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {labels.csvDesc}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadCsvTemplate}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#1A2234] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-200/70 dark:hover:bg-[#232D42] transition-colors whitespace-nowrap"
            >
              <Download className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{labels.downloadTemplateBtn}</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleSelectCsvFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsingCsv}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {parsingCsv ? (
                <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Upload className="h-4 w-4 shrink-0" />
              )}
              <span>{parsingCsv ? labels.parsingText : labels.selectCsvBtn}</span>
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p className="font-medium text-slate-700 dark:text-slate-300">
              {isEn
                ? 'Expected CSV columns:'
                : isEs
                ? 'Columnas esperadas en el CSV:'
                : 'Colunas aceitas na planilha CSV:'}
            </p>
            <p className="leading-relaxed">
              Data · Tipo · Categoria · Descrição · Valor · Modalidade · Cartão ou Conta · Parcela · Recorrente · Status · Observações
            </p>
          </div>

          {csvFeedback && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <span>{csvFeedback}</span>
            </div>
          )}

          {(csvFormatError || csvPreview?.structuralError) && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-800 dark:text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{csvFormatError || csvPreview?.structuralError}</span>
            </div>
          )}

          {csvPreview && !csvPreview.structuralError && (
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {csvPreview.fileName}
                  </span>{' '}
                  · {csvPreview.totalRowsRead} linha(s) lida(s)
                </div>
                <button
                  type="button"
                  onClick={() => setCsvPreview(null)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>{labels.clearPreview}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06]">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Válidos</div>
                  <div className="text-base font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {csvPreview.summary.validCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06]">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Com erro</div>
                  <div
                    className={`text-base font-semibold font-mono tabular-nums ${
                      csvPreview.summary.errorCount > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {csvPreview.summary.errorCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06]">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Receitas</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatBRL(csvPreview.summary.incomeTotal)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06]">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Despesas</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatBRL(csvPreview.summary.expenseTotal)}
                  </div>
                </div>
              </div>

              {csvPreview.summary.newCategories.length > 0 && (
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Novas categorias detectadas para criação automática:{' '}
                  <span className="font-semibold">
                    {csvPreview.summary.newCategories.map((c) => c.name).join(', ')}
                  </span>
                </p>
              )}

              {csvPreview.errorRows.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-3 space-y-1.5 max-h-36 overflow-y-auto">
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    Linhas ignoradas na validação ({csvPreview.errorRows.length})
                  </div>
                  {csvPreview.errorRows.map((err, i) => (
                    <div
                      key={`${err.lineNumber}-${i}`}
                      className="text-[11px] text-amber-900 dark:text-amber-200"
                    >
                      Linha {err.lineNumber} · {err.field}: {err.message}
                    </div>
                  ))}
                </div>
              )}

              {csvPreview.validRows.length > 0 && (
                <>
                  <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-x-auto max-h-60 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-[#0D1320] sticky top-0 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.08]">
                        <tr>
                          <th className="py-2 px-3 font-medium">Data</th>
                          <th className="py-2 px-3 font-medium">Descrição</th>
                          <th className="py-2 px-3 font-medium">Categoria</th>
                          <th className="py-2 px-3 font-medium text-right">Valor</th>
                          <th className="py-2 px-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                        {csvPreview.validRows.slice(0, 60).map((row) => (
                          <tr key={row.lineNumber} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {row.dateFormatted}
                            </td>
                            <td className="py-2 px-3 text-slate-900 dark:text-slate-100 max-w-[180px] truncate">
                              {row.description}
                            </td>
                            <td className="py-2 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {row.categoryName}
                            </td>
                            <td
                              className={`py-2 px-3 font-mono tabular-nums text-right whitespace-nowrap font-semibold ${
                                row.block === 'income'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {formatBRL(row.amount)}
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {row.status === 'paid'
                                ? 'Pago'
                                : row.status === 'projected'
                                ? 'Projetado'
                                : 'Pendente'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {csvPreview.summary.recurringCount > 0 && (
                    <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={syncRecurrences}
                        onChange={(e) => setSyncRecurrences(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{labels.syncRecLabel}</span>
                    </label>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setCsvPreview(null)}
                      className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmCsvImport}
                      className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>
                        {labels.confirmCsvBtn} ({csvPreview.validRows.length})
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* SECTION 2: PDF REPORT EXPORT */}
        <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-5 sm:p-6 space-y-5">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {labels.pdfKicker}
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{labels.pdfTitle}</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {labels.pdfDesc}
            </p>
          </div>

          {/* Scope selector */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {labels.scopeLabel}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {scopeOptions.map((opt) => {
                const active = pdfScope === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPdfScope(opt.id)}
                    className={`min-h-[42px] px-3.5 py-2 rounded-xl text-left text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-blue-50 dark:bg-blue-950/35 border-blue-500 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1A2234]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Period & Month / Status filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {labels.periodLabel}
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setPdfPeriod('month')}
                  className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors ${
                    pdfPeriod === 'month'
                      ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {labels.monthOption}
                </button>
                <button
                  type="button"
                  onClick={() => setPdfPeriod('year')}
                  className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors ${
                    pdfPeriod === 'year'
                      ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {labels.yearOption} ({activeYear})
                </button>
              </div>
            </div>

            {pdfPeriod === 'month' && (
              <div className="space-y-2">
                <label
                  htmlFor="pdf-month-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {labels.selectMonthLabel}
                </label>
                <select
                  id="pdf-month-select"
                  value={pdfMonth}
                  onChange={(e) => setPdfMonth(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {monthNamesFull.map((mName, idx) => (
                    <option key={mName} value={idx}>
                      {mName} {activeYear}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {showStatusFilter && (
              <div className={`space-y-2 ${pdfPeriod === 'year' ? '' : 'sm:col-span-2'}`}>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {labels.statusLabel}
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08]">
                  {(
                    [
                      { id: 'all', label: isEn ? 'All' : isEs ? 'Todos' : 'Todos' },
                      { id: 'paid', label: isEn ? 'Paid' : isEs ? 'Pagados' : 'Pagos' },
                      { id: 'pending', label: isEn ? 'Pending' : isEs ? 'Pendientes' : 'Pendentes' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setPdfStatus(st.id)}
                      className={`min-h-[36px] rounded-lg text-xs font-medium transition-colors ${
                        pdfStatus === st.id
                          ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Live summary preview of selected PDF */}
          <div className="pt-4 border-t border-slate-100 dark:border-white/[0.06] space-y-3">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {isEn
                ? 'Summary included in PDF'
                : isEs
                ? 'Resumen incluido en el PDF'
                : 'Prévia dos totais no relatório'}
              {' · '}
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {pdfPreviewStats.entryCount} lançamento(s) · {pdfPreviewStats.recurringCount} recorrência(s)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Receitas</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatBRL(pdfPreviewStats.incomeTotal)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Despesas</div>
                <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatBRL(pdfPreviewStats.expenseTotal)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.06] col-span-2 sm:col-span-1">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pdfScope === 'recurrences' ? 'Saldo Projetado' : 'Resultado'}
                </div>
                <div
                  className={`text-sm font-semibold font-mono tabular-nums ${
                    (pdfScope === 'recurrences'
                      ? pdfPreviewStats.projectedBalance
                      : pdfPreviewStats.resultTotal) >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {formatBRL(
                    pdfScope === 'recurrences'
                      ? pdfPreviewStats.projectedBalance
                      : pdfPreviewStats.resultTotal,
                    false,
                    true
                  )}
                </div>
              </div>
            </div>
          </div>

          {pdfFeedback && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <span>{pdfFeedback}</span>
            </div>
          )}

          <div className="pt-1">
            <button
              type="button"
              onClick={handleExportPdf}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap"
            >
              <FileDown className="h-4 w-4 shrink-0" />
              <span>{labels.exportPdfBtn}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
