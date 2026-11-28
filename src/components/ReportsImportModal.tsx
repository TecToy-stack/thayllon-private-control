import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { AppState, MatrixTotals } from '../types/finance';
import { formatBRL } from '../utils/financeEngine';
import { getMonthNamesFull } from '../utils/i18n';
import {
  countExportRecords,
  downloadImportTemplate,
  exportFinancialReport,
  parseAndValidateSpreadsheet,
  ReportFormat,
  ReportPeriod,
  ReportScope,
  ReportStatusFilter,
  SpreadsheetImportPreview,
  ValidatedImportRow,
} from '../utils/spreadsheetReports';

interface ReportsImportModalProps {
  isOpen: boolean;
  initialMode?: 'export' | 'import';
  state: AppState;
  totals: MatrixTotals;
  onClose: () => void;
  onConfirmImport: (
    validRows: ValidatedImportRow[],
    options: { syncRecurrences: boolean }
  ) => void;
}

export const ReportsImportModal: React.FC<ReportsImportModalProps> = ({
  isOpen,
  initialMode = 'export',
  state,
  totals,
  onClose,
  onConfirmImport,
}) => {
  const [activeMode, setActiveMode] = useState<'export' | 'import'>(initialMode);

  // Sync tab when opened with specific mode
  React.useEffect(() => {
    if (isOpen) {
      setActiveMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Export state
  const [scope, setScope] = useState<ReportScope>('all_entries');
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [categoryRowId, setCategoryRowId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>('all');
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // Import state
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<SpreadsheetImportPreview | null>(null);
  const [syncRecurrences, setSyncRecurrences] = useState(true);
  const [importDoneNotice, setImportDoneNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { settings, rows } = state;
  const focusMonth = Math.min(11, Math.max(0, Math.trunc(settings.focusMonth ?? 10)));
  const monthNamesFull = getMonthNamesFull(settings.language);
  const isEntryScope = scope === 'all_entries' || scope === 'income' || scope === 'expenses';

  const matchingExportCount = useMemo(
    () =>
      countExportRecords({
        state,
        totals,
        scope,
        format,
        period,
        focusMonth,
        categoryRowId,
        statusFilter,
      }),
    [state, totals, scope, format, period, focusMonth, categoryRowId, statusFilter]
  );

  if (!isOpen) return null;

  const isEn = settings.language === 'en';
  const isEs = settings.language === 'es';

  const handleRunExport = () => {
    setExportFeedback(null);
    const result = exportFinancialReport({
      state,
      totals,
      scope,
      format,
      period,
      focusMonth,
      categoryRowId,
      statusFilter,
      language: settings.language,
    });
    setExportFeedback(
      isEn
        ? `Exported ${result.rowCount} record(s) to ${result.filename}.`
        : isEs
        ? `Exportados ${result.rowCount} registro(s) a ${result.filename}.`
        : `Relatório gerado com ${result.rowCount} registro(s): ${result.filename}`
    );
  };

  const handleDownloadTemplate = (tplFormat: ReportFormat) => {
    const filename = downloadImportTemplate(tplFormat, rows, settings.activeYear);
    setImportDoneNotice(
      isEn
        ? `Template downloaded: ${filename}`
        : isEs
        ? `Plantilla descargada: ${filename}`
        : `Planilha modelo baixada: ${filename}`
    );
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setImportDoneNotice(null);
    setParsing(true);
    try {
      const parsed = await parseAndValidateSpreadsheet(file, state);
      setPreview(parsed);
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirm = () => {
    if (!preview || preview.validRows.length === 0) return;
    onConfirmImport(preview.validRows, { syncRecurrences });
    setImportDoneNotice(
      isEn
        ? `Successfully imported ${preview.validRows.length} entries.`
        : isEs
        ? `Se importaron ${preview.validRows.length} registros correctamente.`
        : `${preview.validRows.length} lançamento(s) importado(s) e sincronizado(s) com sucesso.`
    );
    setPreview(null);
  };

  const scopeOptions: Array<{ id: ReportScope; label: string; desc: string }> = [
    {
      id: 'all_entries',
      label: isEn ? 'All Entries' : isEs ? 'Todos los Movimientos' : 'Todos os Lançamentos',
      desc: isEn
        ? 'Income, fixed/variable expenses, cards and savings'
        : isEs
        ? 'Ingresos, gastos fijos/variables, tarjetas y reserva'
        : 'Entradas, despesas fixas/variáveis, compras no cartão e reserva',
    },
    {
      id: 'income',
      label: isEn ? 'Income' : isEs ? 'Ingresos' : 'Receitas',
      desc: isEn ? 'Salary, extras and cash inflows' : isEs ? 'Salarios, extras y entradas' : 'Salários, extras e demais entradas',
    },
    {
      id: 'expenses',
      label: isEn ? 'Expenses' : isEs ? 'Gastos' : 'Despesas',
      desc: isEn
        ? 'Fixed bills, variable spending and card installments'
        : isEs
        ? 'Cuentas fijas, variables y cuotas de tarjeta'
        : 'Contas fixas, gastos variáveis e parcelas de cartão',
    },
    {
      id: 'recurrences',
      label: isEn ? 'Recurring Items' : isEs ? 'Recurrentes' : 'Recorrências',
      desc: isEn
        ? 'Configured recurring bills and receipts with due days'
        : isEs
        ? 'Cuentas fijas y cobros recurrentes configurados'
        : 'Contas fixas e recebimentos recorrentes configurados',
    },
    {
      id: 'monthly_summary',
      label: isEn ? 'Monthly Summary' : isEs ? 'Resumen Mensual' : 'Resumo Mensal',
      desc: isEn
        ? 'Category matrix totals, averages and limits'
        : isEs
        ? 'Totales por categoría, promedios y límites'
        : 'Consolidado por categoria, médias, limites e saldo líquido',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4 pt-safe-screen">
      <div className="w-full max-w-4xl max-h-[calc(100dvh-env(safe-area-inset-top,0px)-0.5rem)] sm:max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden pb-safe-nav sm:pb-0">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
                {isEn
                  ? 'Reports & Spreadsheet Import'
                  : isEs
                  ? 'Reportes e Importación de Hojas'
                  : 'Relatórios (CSV/Excel) & Importação de Planilhas'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {isEn
                  ? 'Export clean UTF-8 spreadsheets or import validated .csv / .xlsx / .xls files'
                  : isEs
                  ? 'Exporta hojas limpias o importa archivos .csv / .xlsx / .xls validados'
                  : 'Exporte relatórios sem quebra de acentos ou importe planilhas validadas'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/70 dark:bg-[#0D1320]/70 shrink-0">
          <div className="grid grid-cols-2 w-full sm:w-auto sm:inline-flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => setActiveMode('export')}
              className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[40px] px-2.5 sm:px-4 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors min-w-0 ${
                activeMode === 'export'
                  ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {isEn ? 'Export Reports' : isEs ? 'Exportar Reportes' : 'Exportar Relatórios'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('import')}
              className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[40px] px-2.5 sm:px-4 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors min-w-0 ${
                activeMode === 'import'
                  ? 'bg-white dark:bg-[#1A2234] text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {isEn
                  ? 'Import Spreadsheet + Template'
                  : isEs
                  ? 'Importar Planilla + Modelo'
                  : 'Importar Planilha + Modelo'}
              </span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 pb-safe-nav space-y-5">
          {activeMode === 'export' && (
            <div className="space-y-5">
              {exportFeedback && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{exportFeedback}</span>
                </div>
              )}

              {/* Scope Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {isEn
                    ? '1. Select report content'
                    : isEs
                    ? '1. Selecciona qué exportar'
                    : '1. Escolha o conteúdo do relatório'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {scopeOptions.map((opt) => {
                    const active = scope === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setScope(opt.id);
                          setExportFeedback(null);
                        }}
                        className={`p-3 rounded-xl border text-left transition-colors ${
                          active
                            ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-400 dark:border-blue-500/50 text-blue-900 dark:text-blue-200'
                            : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                          {opt.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Format & Period */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {isEn ? '2. File format' : isEs ? '2. Formato de archivo' : '2. Formato do arquivo'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormat('xlsx')}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        format === 'xlsx'
                          ? 'bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] border-slate-900 dark:border-[#C9A86A]'
                          : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">Excel (.xlsx)</div>
                      <div className="text-[10px] opacity-80">Colunas ajustadas + Resumo</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormat('csv')}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        format === 'csv'
                          ? 'bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] border-slate-900 dark:border-[#C9A86A]'
                          : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">CSV (.csv)</div>
                      <div className="text-[10px] opacity-80">UTF-8 BOM · Separador ;</div>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {isEn ? '3. Period' : isEs ? '3. Período' : '3. Período do relatório'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={scope === 'recurrences'}
                      onClick={() => setPeriod('month')}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                        period === 'month'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">
                        {monthNamesFull[focusMonth]}/{settings.activeYear}
                      </div>
                      <div className="text-[10px] opacity-80">Mês em foco</div>
                    </button>

                    <button
                      type="button"
                      disabled={scope === 'recurrences'}
                      onClick={() => setPeriod('year')}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                        period === 'year'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">Ano {settings.activeYear}</div>
                      <div className="text-[10px] opacity-80">Consolidado anual</div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Optional fine-grain filters */}
              {isEntryScope && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08]">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Filtrar por Categoria
                    </label>
                    <select
                      value={categoryRowId}
                      onChange={(e) => setCategoryRowId(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    >
                      <option value="all">Todas as categorias</option>
                      {rows
                        .filter((r) => !r.hidden)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Filtrar por Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as ReportStatusFilter)}
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white"
                    >
                      <option value="all">Todos os status</option>
                      <option value="paid">Pago / Recebido</option>
                      <option value="pending">Pendente</option>
                      <option value="projected">Projetado</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Footer Export Action */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  Registros encontrados para este filtro:{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {matchingExportCount}
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={handleRunExport}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  <Download className="h-4 w-4" />
                  <span>
                    Exportar {format.toUpperCase()} ({matchingExportCount})
                  </span>
                </button>
              </div>
            </div>
          )}

          {activeMode === 'import' && (
            <div className="space-y-5">
              {importDoneNotice && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{importDoneNotice}</span>
                </div>
              )}

              {/* Step 1: Download Template */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08] space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span>1. Baixar Planilha Modelo (Opcional, recomendado)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Colunas exatas esperadas: Data · Tipo · Categoria · Descrição · Valor · Modalidade · Cartão ou Conta · Parcela · Recorrente · Status · Observações
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('xlsx')}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-[#C9A86A] text-white dark:text-[#090D16] hover:opacity-90"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Modelo Excel (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('csv')}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium bg-white dark:bg-[#1A2234] border border-slate-200 dark:border-white/[0.1] text-slate-800 dark:text-slate-200"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Modelo CSV (.csv)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2: File Picker */}
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => void handleFileSelected(e.target.files?.[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={parsing}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/[0.15] hover:border-blue-500 dark:hover:border-blue-400 bg-slate-50/70 dark:bg-[#0D1320]/60 text-center transition-colors flex flex-col items-center justify-center gap-2"
                >
                  {parsing ? (
                    <RefreshCw className="h-6 w-6 text-blue-600 animate-spin" />
                  ) : (
                    <Upload className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  )}
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                    {parsing
                      ? 'Lendo e validando linhas da planilha...'
                      : '2. Selecionar arquivo CSV ou Excel (.csv, .xlsx, .xls)'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Os dados são validados linha por linha com prévia completa antes de entrar no sistema.
                  </div>
                </button>
              </div>

              {/* Step 3: Validation Results & Preview */}
              {preview && (
                <div className="space-y-4">
                  {preview.structuralError ? (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Erro na estrutura do arquivo ({preview.fileName})</div>
                        <p className="mt-1">{preview.structuralError}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Summary Strip */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30">
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-300">Linhas válidas</div>
                          <div className="text-base font-semibold font-mono tabular-nums text-emerald-800 dark:text-emerald-200">
                            {preview.summary.validCount} de {preview.totalRowsRead}
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08]">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Receitas previstas</div>
                          <div className="text-base font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatBRL(preview.summary.incomeTotal, false)}
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.08]">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Despesas previstas</div>
                          <div className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                            {formatBRL(preview.summary.expenseTotal, false)}
                          </div>
                        </div>

                        <div
                          className={`p-3 rounded-xl border ${
                            preview.summary.errorCount > 0
                              ? 'bg-red-50/70 dark:bg-red-950/20 border-red-200 dark:border-red-500/30'
                              : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-white/[0.08]'
                          }`}
                        >
                          <div
                            className={`text-[11px] ${
                              preview.summary.errorCount > 0
                                ? 'text-red-700 dark:text-red-300'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            Erros encontrados
                          </div>
                          <div
                            className={`text-base font-semibold font-mono tabular-nums ${
                              preview.summary.errorCount > 0
                                ? 'text-red-700 dark:text-red-300'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {preview.summary.errorCount} linha(s)
                          </div>
                        </div>
                      </div>

                      {/* Metadata notes: new categories & recurrences */}
                      {(preview.summary.newCategories.length > 0 || preview.summary.recurringCount > 0) && (
                        <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-500/30 space-y-2 text-xs">
                          {preview.summary.newCategories.length > 0 && (
                            <div className="text-blue-900 dark:text-blue-200">
                              Novas categorias a criar automaticamente:{' '}
                              <span className="font-semibold">
                                {preview.summary.newCategories.map((c) => c.name).join(', ')}
                              </span>
                            </div>
                          )}
                          {preview.summary.recurringCount > 0 && (
                            <label className="flex items-center gap-2 cursor-pointer text-blue-900 dark:text-blue-200">
                              <input
                                type="checkbox"
                                checked={syncRecurrences}
                                onChange={(e) => setSyncRecurrences(e.target.checked)}
                                className="accent-blue-600"
                              />
                              <span>
                                Também cadastrar os {preview.summary.recurringCount} item(ns) marcados como Recorrente em Contas Fixas e Recebimentos
                              </span>
                            </label>
                          )}
                        </div>
                      )}

                      {/* Line Errors List */}
                      {preview.errorRows.length > 0 && (
                        <div className="p-4 rounded-xl bg-red-50/70 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30 space-y-2">
                          <div className="text-xs font-semibold text-red-800 dark:text-red-300 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>Erros detectados por linha (linhas com erro não serão importadas)</span>
                          </div>
                          <div className="max-h-40 overflow-y-auto space-y-1.5 text-[11px]">
                            {preview.errorRows.map((err, idx) => (
                              <div
                                key={`${err.lineNumber}-${idx}`}
                                className="px-3 py-2 rounded-lg bg-white/80 dark:bg-[#111827] border border-red-200/80 dark:border-red-500/20 flex flex-wrap items-center justify-between gap-2"
                              >
                                <div className="text-red-700 dark:text-red-300">
                                  <strong className="font-mono">Linha {err.lineNumber}</strong> ·{' '}
                                  <span className="font-semibold">{err.field}:</span> {err.message}
                                </div>
                                <span className="font-mono text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                                  {err.rawPreview}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Valid Rows Preview Table */}
                      {preview.validRows.length > 0 && (
                        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
                          <div className="px-4 py-2.5 bg-slate-50 dark:bg-[#0D1320] border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <span>Prévia dos lançamentos válidos ({preview.validRows.length})</span>
                            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                              Arquivo: {preview.fileName}
                            </span>
                          </div>
                          <div className="overflow-x-auto max-h-60">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50/80 dark:bg-[#0D1320] text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.08]">
                                <tr>
                                  <th className="px-3 py-2">Linha</th>
                                  <th className="px-3 py-2">Data</th>
                                  <th className="px-3 py-2">Tipo</th>
                                  <th className="px-3 py-2">Categoria</th>
                                  <th className="px-3 py-2">Descrição</th>
                                  <th className="px-3 py-2 text-right">Valor</th>
                                  <th className="px-3 py-2">Detalhes</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                                {preview.validRows.slice(0, 100).map((r) => (
                                  <tr key={r.lineNumber} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                                    <td className="px-3 py-2 font-mono text-[11px] text-slate-400 tabular-nums">
                                      #{r.lineNumber}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums whitespace-nowrap">
                                      {r.dateFormatted}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      <span
                                        className={`text-[11px] font-medium ${
                                          r.block === 'income'
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : r.block === 'savings'
                                            ? 'text-blue-600 dark:text-blue-400'
                                            : 'text-slate-700 dark:text-slate-300'
                                        }`}
                                      >
                                        {r.typeLabel}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-[11px]">
                                      <span className="font-medium text-slate-800 dark:text-slate-200">
                                        {r.categoryName}
                                      </span>
                                      {r.newCategoryBlock && (
                                        <span className="ml-1 text-[10px] text-blue-600 dark:text-blue-400">
                                          (nova)
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 max-w-[200px] truncate text-slate-900 dark:text-slate-100">
                                      {r.description}
                                    </td>
                                    <td
                                      className={`px-3 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                                        r.block === 'income'
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : 'text-slate-900 dark:text-white'
                                      }`}
                                    >
                                      {formatBRL(r.amount, false)}
                                    </td>
                                    <td className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                      {[
                                        r.installments ? `Parcela ${r.installments}` : null,
                                        r.isRecurring ? 'Recorrente' : null,
                                        r.accountLabel !== 'Manual / Importado' ? r.accountLabel : null,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ') || 'Padrão'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Confirm / Cancel Actions */}
                      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                        <button
                          type="button"
                          onClick={() => setPreview(null)}
                          className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#1A2234]"
                        >
                          Limpar prévia
                        </button>
                        <button
                          type="button"
                          disabled={preview.validRows.length === 0}
                          onClick={handleConfirm}
                          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>
                            Confirmar Importação ({preview.validRows.length} válido
                            {preview.validRows.length === 1 ? '' : 's'})
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
