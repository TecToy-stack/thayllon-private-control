import {
  AppSettings,
  AppState,
  AuditEvent,
  AutoRule,
  BankAccount,
  CategoryRow,
  PaymentMethod,
  SavingsGoal,
  TransactionEntry,
} from '../types/finance';
import { loadStoredLanguage } from '../utils/i18n';

export const MAX_BANK_ACCOUNTS = 5;

export const MONTH_NAMES_FULL = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
] as const;

export const MONTH_NAMES_SHORT = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
] as const;

export const INITIAL_ROWS: CategoryRow[] = [
  // BLOCO 1 — RECEITAS
  { id: 'inc-pizzaria', block: 'income', name: 'PIZZARIA', refDay: 8, order: 1, isRecurring: true },
  { id: 'inc-2pb-15', block: 'income', name: '2PB', refDay: 15, order: 2, isRecurring: true },
  { id: 'inc-vale', block: 'income', name: 'VALE', refDay: 20, order: 3, isRecurring: true },
  { id: 'inc-2pb-30', block: 'income', name: '2PB', refDay: 30, order: 4, isRecurring: true },
  { id: 'inc-leticia', block: 'income', name: 'LETICIA', refDay: 10, order: 5 },
  { id: 'inc-outros', block: 'income', name: 'OUTROS', order: 6 },
  { id: 'inc-extras', block: 'income', name: 'EXTRAS', order: 7 },
  { id: 'inc-caixa', block: 'income', name: 'VALOR EM CAIXA', order: 8 },

  // BLOCO 2 — DESPESAS F (FIXAS)
  { id: 'fix-aluguel', block: 'fixed', name: 'ALUGUEL', refDay: 15, order: 1, alertLimit: 950, isRecurring: true },
  { id: 'fix-moto', block: 'fixed', name: 'MOTO', refDay: 10, order: 2, alertLimit: 650, isRecurring: true },
  { id: 'fix-internet', block: 'fixed', name: 'INTERNET', refDay: 15, order: 3, alertLimit: 100, isRecurring: true },
  { id: 'fix-dentista', block: 'fixed', name: 'DENTISTA', refDay: 10, order: 4, alertLimit: 180, isRecurring: true },
  { id: 'fix-agua', block: 'fixed', name: 'AGUA', order: 5, alertLimit: 40, isRecurring: true },
  { id: 'fix-spotify', block: 'fixed', name: 'SPOTIFY', order: 6, alertLimit: 55, isRecurring: true },
  { id: 'fix-racao', block: 'fixed', name: 'RAÇÃO DOG', order: 7, alertLimit: 110, isRecurring: true },

  // BLOCO 3 — DESPESAS V (VARIÁVEIS)
  { id: 'var-energia', block: 'variable', name: 'ENERGIA', refDay: 15, order: 1, alertLimit: 260 },
  { id: 'var-gas', block: 'variable', name: 'GÁS', refDay: 15, order: 2, alertLimit: 120 },
  { id: 'var-cartao-sa', block: 'variable', name: 'CARTÃO SA', refDay: 10, order: 3, alertLimit: 600, alertPctThreshold: 25 },
  { id: 'var-cartao-mp', block: 'variable', name: 'CARTÃO MP', refDay: 17, order: 4, alertLimit: 500, alertPctThreshold: 30 },
  { id: 'var-ipva', block: 'variable', name: 'IPVA/CRLV-E', refDay: 3, order: 5, alertLimit: 400 },
  { id: 'var-iptu', block: 'variable', name: 'IPTU', order: 6, alertLimit: 150 },
  { id: 'var-mercado', block: 'variable', name: 'MERCADO', order: 7, alertLimit: 650, alertPctThreshold: 30 },
  { id: 'var-combustivel', block: 'variable', name: 'COMBUSTIVEL/MOTO', order: 8, alertLimit: 130 },
  { id: 'var-lazer', block: 'variable', name: 'LAZER', order: 9, alertLimit: 250, alertPctThreshold: 40 },
  { id: 'var-outros', block: 'variable', name: 'OUTROS', order: 10, alertLimit: 400, alertPctThreshold: 40 },

  // BLOCO 4 — PATRIMÔNIO / GUARDADO
  { id: 'sav-guardado', block: 'savings', name: 'GUARDADO', refDay: 25, order: 1 },
];

const SEED_GRID_2026: Record<string, number[]> = {
  // RECEITAS (Jan..Dez)
  'inc-pizzaria': [0, 0, 2169.33, 1298.28, 1431.92, 1346.17, 1378.25, 1470.00, 1274.28, 1396.51, 1412.11, 0],
  'inc-2pb-15':   [0, 0, 696.00, 696.00, 706.00, 706.00, 706.00, 706.00, 706.00, 706.00, 0, 0],
  'inc-vale':     [0, 0, 0, 301.46, 300.00, 300.00, 300.00, 300.00, 300.00, 300.00, 300.00, 0],
  'inc-2pb-30':   [0, 0, 0, 706.18, 706.00, 706.00, 706.00, 706.00, 706.00, 706.00, 706.00, 0],
  'inc-leticia':  [0, 0, 112.00, 110.84, 29.55, 119.58, 17294.00, 528.96, 119.00, 219.00, 119.05, 0],
  'inc-outros':   [0, 0, 292.90, 526.90, 647.31, 839.71, 174.81, 171.97, 171.81, 13.70, 2738.98, 0],
  'inc-extras':   [0, 0, 0, 409.50, 200.00, 2591.42, 0, 120.00, 200.00, 541.95, 313.70, 0],
  'inc-caixa':    [0, 0, 0, 0, 476.07, 751.55, 2798.23, 3223.98, 1814.84, 1478.36, 778.51, 2574.45],

  // DESPESAS FIXAS (Jan..Dez)
  'fix-aluguel':  [0, 0, 800.00, 800.00, 800.00, 800.00, 800.00, 800.00, 885.00, 885.00, 885.00, 0],
  'fix-moto':     [0, 0, 600.00, 600.00, 600.00, 600.00, 600.00, 600.00, 600.00, 600.00, 600.00, 0],
  'fix-internet': [0, 0, 85.29, 87.02, 85.29, 85.29, 85.29, 85.29, 85.29, 85.20, 85.29, 0],
  'fix-dentista': [0, 0, 149.90, 149.90, 149.89, 149.90, 149.90, 149.90, 149.90, 149.90, 149.90, 0],
  'fix-agua':     [0, 0, 15.99, 11.00, 11.00, 26.00, 11.00, 11.00, 22.00, 11.00, 11.00, 0],
  'fix-spotify':  [0, 0, 49.00, 40.90, 49.90, 40.90, 40.90, 41.00, 40.90, 40.90, 40.90, 0],
  'fix-racao':    [0, 0, 75.00, 75.00, 75.00, 75.00, 80.00, 80.00, 80.00, 0, 0, 0],

  // DESPESAS VARIÁVEIS (Jan..Dez)
  'var-energia':     [0, 0, 220.33, 232.65, 245.02, 246.69, 228.14, 212.06, 191.35, 216.28, 184.07, 0],
  'var-gas':         [0, 0, 51.66, 49.67, 85.95, 78.89, 80.48, 88.15, 88.36, 107.90, 126.63, 0],
  'var-cartao-sa':   [0, 0, 568.60, 557.07, 223.97, 455.67, 629.40, 629.33, 629.33, 502.10, 442.35, 0],
  'var-cartao-mp':   [0, 0, 50.82, 50.76, 558.89, 558.88, 171.72, 410.00, 207.32, 280.27, 240.03, 0],
  'var-ipva':        [0, 0, 69.38, 68.94, 0, 0, 293.71, 69.35, 0, 687.00, 0, 0],
  'var-iptu':        [0, 0, 93.83, 93.83, 93.83, 93.83, 93.83, 0, 65.66, 123.56, 0, 0],
  'var-mercado':     [0, 0, 259.01, 634.91, 479.10, 750.64, 387.85, 750.42, 405.22, 484.13, 695.96, 0],
  'var-combustivel': [0, 0, 80.00, 80.00, 145.00, 100.97, 50.00, 61.23, 50.00, 50.38, 10.00, 0],
  'var-lazer':       [0, 0, 31.00, 65.94, 113.97, 348.49, 198.38, 127.65, 25.00, 69.42, 0, 0],
  'var-outros':      [0, 0, 43.50, 50.50, 28.49, 151.05, 237.71, 1231.03, 353.90, 209.97, 363.67, 0],

  // GUARDADO (Jan..Dez)
  'sav-guardado': [0, 0, 0, 0, 0, 0, 16000.00, 0, 0, 0, 0, 0],
};

function defaultMetaForRow(rowId: string): {
  accountId: string;
  source: 'auto' | 'manual';
  paymentMethod: PaymentMethod;
  merchant: string;
} {
  switch (rowId) {
    case 'var-cartao-mp':
      return {
        accountId: 'acc-mp',
        source: 'auto',
        paymentMethod: 'credit',
        merchant: 'Fatura Cartão Mercado Pago',
      };
    case 'var-cartao-sa':
      return {
        accountId: 'acc-santander',
        source: 'auto',
        paymentMethod: 'credit',
        merchant: 'Fatura Cartão Santander SA',
      };
    case 'fix-spotify':
      return {
        accountId: 'acc-mp',
        source: 'auto',
        paymentMethod: 'credit',
        merchant: 'Spotify Brasil (Assinatura)',
      };
    case 'fix-dentista':
      return {
        accountId: 'acc-santander',
        source: 'auto',
        paymentMethod: 'credit',
        merchant: 'Clínica Odontológica',
      };
    case 'fix-aluguel':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'pix',
        merchant: 'Transferência Pix Aluguel',
      };
    case 'fix-moto':
      return {
        accountId: 'acc-santander',
        source: 'auto',
        paymentMethod: 'debit',
        merchant: 'Débito Parcela Moto',
      };
    case 'fix-internet':
      return {
        accountId: 'acc-santander',
        source: 'auto',
        paymentMethod: 'debit',
        merchant: 'Operadora Internet Fibra',
      };
    case 'fix-agua':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'pix',
        merchant: 'Concessionária Água',
      };
    case 'fix-racao':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'debit',
        merchant: 'Pet Shop / Agropecuária',
      };
    case 'var-energia':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'pix',
        merchant: 'Distribuidora Energia Elétrica',
      };
    case 'var-gas':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'pix',
        merchant: 'Distribuidora Gás',
      };
    case 'var-mercado':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'debit',
        merchant: 'Supermercado & Hortifrúti',
      };
    case 'var-combustivel':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'debit',
        merchant: 'Posto de Combustível',
      };
    case 'var-lazer':
      return {
        accountId: 'acc-mp',
        source: 'auto',
        paymentMethod: 'credit',
        merchant: 'Restaurantes & Lazer',
      };
    case 'var-ipva':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'pix',
        merchant: 'Detran / Sefaz IPVA',
      };
    case 'var-iptu':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'pix',
        merchant: 'Prefeitura IPTU',
      };
    case 'var-outros':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'debit',
        merchant: 'Compras & Serviços Diversos',
      };
    case 'sav-guardado':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'transfer',
        merchant: 'Reserva Patrimonial Nubank',
      };
    case 'inc-pizzaria':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'pix',
        merchant: 'Repasse Pizzaria',
      };
    case 'inc-2pb-15':
    case 'inc-2pb-30':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'transfer',
        merchant: 'Crédito Salário / 2PB',
      };
    case 'inc-vale':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'transfer',
        merchant: 'Benefício Vale',
      };
    case 'inc-leticia':
      return {
        accountId: 'acc-nubank',
        source: 'auto',
        paymentMethod: 'pix',
        merchant: 'Pix Recebido · Leticia',
      };
    default:
      return {
        accountId: 'manual',
        source: 'manual',
        paymentMethod: 'pix',
        merchant: 'Registro Direto',
      };
  }
}

export function buildInitialEntries2026(rows: CategoryRow[]): TransactionEntry[] {
  const entries: TransactionEntry[] = [];
  const rowMap = new Map(rows.map((r) => [r.id, r]));

  Object.entries(SEED_GRID_2026).forEach(([rowId, monthlyValues]) => {
    const row = rowMap.get(rowId);
    if (!row) return;

    monthlyValues.forEach((amount, month) => {
      if (!amount || amount === 0) return;
      const meta = defaultMetaForRow(rowId);
      const day = row.refDay ?? (month === 11 ? 15 : 18);
      const isFuture = month === 11;

      let note: string | undefined;
      if (rowId === 'inc-leticia' && month === 6) {
        note = 'Entrada extraordinária consolidada em Julho';
      } else if (rowId === 'sav-guardado' && month === 6) {
        note = 'Aporte estratégico na reserva patrimonial';
      } else if (rowId === 'var-outros' && month === 7) {
        note = 'Pico atípico de despesas diversas em Agosto';
      }

      entries.push({
        id: `seed-${rowId}-2026-${month}`,
        rowId,
        year: 2026,
        month,
        day,
        amount,
        description: `${row.name} · ${MONTH_NAMES_SHORT[month]}/2026`,
        merchant: meta.merchant,
        paymentMethod: meta.paymentMethod,
        accountId: meta.accountId,
        source: meta.source,
        status: isFuture ? 'projected' : 'paid',
        note,
        createdAt: `2026-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00Z`,
      });
    });
  });

  return entries;
}

export const INITIAL_ACCOUNTS: BankAccount[] = [
  {
    id: 'acc-nubank',
    slot: 1,
    institution: 'Nubank Ultravioleta',
    institutionCode: '260',
    type: 'Digital',
    nickname: 'Conta Principal & Débito/Pix',
    balance: 18574.45,
    color: '#8B5CF6',
    status: 'active',
    connectorProvider: 'Open Finance Brasil (FAPI)',
    lastSync: '2026-11-23T10:15:00-03:00',
    consentGrantedAt: '2026-05-23',
    consentExpiresAt: '2027-05-23',
    consentScope: ['ACCOUNTS_READ', 'TRANSACTIONS_READ', 'BALANCES_READ'],
    pkceChallengeId: 'pkce_uv_9481a7c2',
    maskedAccount: 'Ag 0001 · CC •••• 4829-1',
    defaultRowId: 'inc-caixa',
  },
  {
    id: 'acc-santander',
    slot: 2,
    institution: 'Santander Select',
    institutionCode: '033',
    type: 'Cartão de Crédito',
    nickname: 'Cartão SA & Débitos Fixos',
    balance: -442.35,
    color: '#EF4444',
    status: 'active',
    connectorProvider: 'Open Finance Brasil (FAPI)',
    lastSync: '2026-11-23T09:50:00-03:00',
    consentGrantedAt: '2026-04-18',
    consentExpiresAt: '2027-04-18',
    consentScope: ['CREDIT_CARD_READ', 'TRANSACTIONS_READ'],
    pkceChallengeId: 'pkce_sa_3107f8e4',
    maskedAccount: 'Final •••• 7714',
    defaultRowId: 'var-cartao-sa',
    creditLimit: 8500,
    availableLimit: 8057.65,
    invoiceClosingDay: 3,
    invoiceDueDay: 10,
    currentInvoiceStatus: 'closed',
  },
  {
    id: 'acc-mp',
    slot: 3,
    institution: 'Mercado Pago',
    institutionCode: '323',
    type: 'Cartão de Crédito',
    nickname: 'Cartão MP & Assinaturas',
    balance: -240.03,
    color: '#0EA5E9',
    status: 'active',
    connectorProvider: 'Pluggy',
    lastSync: '2026-11-23T09:42:00-03:00',
    consentGrantedAt: '2026-06-01',
    consentExpiresAt: '2027-06-01',
    consentScope: ['ACCOUNTS_READ', 'CREDIT_CARD_READ', 'TRANSACTIONS_READ'],
    pkceChallengeId: 'pkce_mp_6620b1d9',
    maskedAccount: 'Wallet •••• 9031',
    defaultRowId: 'var-cartao-mp',
    creditLimit: 4200,
    availableLimit: 3959.97,
    invoiceClosingDay: 10,
    invoiceDueDay: 17,
    currentInvoiceStatus: 'open',
  },
];

export const INITIAL_RULES: AutoRule[] = [
  { id: 'rule-1', keyword: 'pizzaria', targetRowId: 'inc-pizzaria', enabled: true },
  { id: 'rule-2', keyword: '2pb', targetRowId: 'inc-2pb-15', enabled: true },
  { id: 'rule-3', keyword: 'vale', targetRowId: 'inc-vale', enabled: true },
  { id: 'rule-4', keyword: 'mercado', targetRowId: 'var-mercado', enabled: true },
  { id: 'rule-5', keyword: 'supermercado', targetRowId: 'var-mercado', enabled: true },
  { id: 'rule-6', keyword: 'combustivel', targetRowId: 'var-combustivel', enabled: true },
  { id: 'rule-7', keyword: 'gasolina', targetRowId: 'var-combustivel', enabled: true },
  { id: 'rule-8', keyword: 'posto', targetRowId: 'var-combustivel', enabled: true },
  { id: 'rule-9', keyword: 'energia', targetRowId: 'var-energia', enabled: true },
  { id: 'rule-10', keyword: 'enel', targetRowId: 'var-energia', enabled: true },
  { id: 'rule-11', keyword: 'gas', targetRowId: 'var-gas', enabled: true },
  { id: 'rule-12', keyword: 'cartao sa', targetRowId: 'var-cartao-sa', enabled: true },
  { id: 'rule-13', keyword: 'cartao mp', targetRowId: 'var-cartao-mp', enabled: true },
  { id: 'rule-14', keyword: 'spotify', targetRowId: 'fix-spotify', enabled: true },
  { id: 'rule-15', keyword: 'aluguel', targetRowId: 'fix-aluguel', enabled: true },
  { id: 'rule-16', keyword: 'lazer', targetRowId: 'var-lazer', enabled: true },
];

export const INITIAL_GOALS: SavingsGoal[] = [
  {
    id: 'goal-1',
    title: 'Economizar R$ 10.000,00 em Resultado Líquido até Dezembro',
    targetAmount: 10000,
    deadlineMonth: 11,
    deadlineYear: 2026,
    trackingMode: 'result',
    createdAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'goal-2',
    title: 'Acumular R$ 20.000,00 na Reserva Patrimonial (Guardado)',
    targetAmount: 20000,
    deadlineMonth: 11,
    deadlineYear: 2026,
    trackingMode: 'savings',
    createdAt: '2026-03-01T10:00:00Z',
  },
];

export const INITIAL_AUDIT_LOG: AuditEvent[] = [
  {
    id: 'aud-1',
    timestamp: '2026-11-23T10:15:00-03:00',
    action: 'Sincronização Open Finance',
    actor: 'Agente Seguro (Slot 1)',
    detail: 'Nubank Ultravioleta sincronizada · Débitos e Pix de Novembro conciliados.',
    securityProtocol: 'OAuth 2.0 + PKCE · TLS 1.3',
    institution: 'Nubank Ultravioleta',
    scope: 'ACCOUNTS_READ, TRANSACTIONS_READ, BALANCES_READ',
    status: 'success',
    eventType: 'sync',
  },
  {
    id: 'aud-2',
    timestamp: '2026-11-23T09:50:00-03:00',
    action: 'Leitura de Fatura & Débitos',
    actor: 'Agente Seguro (Slot 2)',
    detail: 'Santander Select atualizado · Fatura Nov R$ 442,35 conciliada.',
    securityProtocol: 'AES-256 Tokenizado · Escopo Read-Only',
    institution: 'Santander Select',
    scope: 'CREDIT_CARD_READ, TRANSACTIONS_READ',
    status: 'success',
    eventType: 'sync',
  },
  {
    id: 'aud-3',
    timestamp: '2026-11-23T09:42:00-03:00',
    action: 'Conciliação Cartão MP',
    actor: 'Agente Seguro (Slot 3)',
    detail: 'Mercado Pago atualizado · Fatura Nov R$ 240,03 conciliada.',
    securityProtocol: 'OAuth 2.0 + PKCE · TLS 1.3',
    institution: 'Mercado Pago',
    scope: 'ACCOUNTS_READ, CREDIT_CARD_READ, TRANSACTIONS_READ',
    status: 'success',
    eventType: 'sync',
  },
];

export const INITIAL_SETTINGS: AppSettings = {
  language: 'pt',
  theme: 'dark',
  privacyMode: false,
  privacyDefaultOnBoot: false,
  autoLockMinutes: 15,
  activeYear: 2026,
  focusMonth: 10, // Novembro 2026
  closingDay: 30,
  showZeroMonths: true,
  variationDisplay: 'both',
  syncFrequencyMinutes: 30,
  anomalyThresholdPct: 45,
  notificationsEnabled: true,
  lockOnBackground: false,
};

export function createCleanAppState(): AppState {
  return {
    rows: INITIAL_ROWS.map((r) => ({ ...r })),
    entries: [],
    accounts: [],
    revokedConsents: [],
    rules: INITIAL_RULES.map((r) => ({ ...r })),
    goals: [],
    recurringBills: [],
    auditLog: [],
    settings: { ...INITIAL_SETTINGS, language: loadStoredLanguage() },
    chatHistory: [],
  };
}

export function createDemo2026AppState(): AppState {
  return {
    rows: INITIAL_ROWS.map((r) => ({ ...r })),
    entries: buildInitialEntries2026(INITIAL_ROWS),
    accounts: INITIAL_ACCOUNTS.map((a) => ({ ...a, consentScope: [...a.consentScope] })),
    revokedConsents: [],
    rules: INITIAL_RULES.map((r) => ({ ...r })),
    goals: INITIAL_GOALS.map((g) => ({ ...g })),
    recurringBills: [
      {
        id: 'rec-aluguel',
        title: 'Aluguel Residencial',
        amount: 885.0,
        dueDay: 15,
        categoryRowId: 'fix-aluguel',
        statusByMonth: { '2026-10': 'paid', '2026-11': 'pending' },
        createdAt: '2026-03-01T10:00:00Z',
      },
      {
        id: 'rec-energia',
        title: 'Energia Elétrica',
        amount: 184.07,
        dueDay: 15,
        categoryRowId: 'fix-energia',
        statusByMonth: { '2026-10': 'paid', '2026-11': 'pending' },
        createdAt: '2026-03-01T10:00:00Z',
      },
      {
        id: 'rec-internet',
        title: 'Internet Fibra',
        amount: 85.29,
        dueDay: 15,
        categoryRowId: 'fix-internet',
        statusByMonth: { '2026-10': 'pending', '2026-11': 'pending' },
        createdAt: '2026-03-01T10:00:00Z',
      },
      {
        id: 'rec-gas',
        title: 'Gás Encanado',
        amount: 65.0,
        dueDay: 10,
        categoryRowId: 'fix-gas',
        statusByMonth: { '2026-10': 'overdue', '2026-11': 'pending' },
        createdAt: '2026-03-01T10:00:00Z',
      },
      {
        id: 'rec-spotify',
        title: 'Spotify Duo',
        amount: 40.9,
        dueDay: 20,
        categoryRowId: 'fix-assinaturas',
        statusByMonth: { '2026-10': 'pending', '2026-11': 'pending' },
        createdAt: '2026-03-01T10:00:00Z',
      },
    ],
    auditLog: INITIAL_AUDIT_LOG.map((e) => ({ ...e })),
    settings: { ...INITIAL_SETTINGS, language: loadStoredLanguage() },
    chatHistory: [],
  };
}


