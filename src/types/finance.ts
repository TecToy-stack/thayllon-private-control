export type BlockType = 'income' | 'fixed' | 'variable' | 'savings';

export type NavTab =
  | 'matrix'
  | 'timeline'
  | 'cards'
  | 'accounts'
  | 'investments'
  | 'assistant'
  | 'downloads'
  | 'settings';

export type EntrySource = 'manual' | 'auto' | 'simulated';
export type EntryStatus = 'paid' | 'pending' | 'projected';
export type PaymentMethod = 'credit' | 'debit' | 'pix' | 'transfer' | 'cash';
export type EntryNature = 'standard' | 'internal_transfer' | 'invoice_payment';

export type KycStatus = 'pending' | 'under_review' | 'verified';
export type KycDocumentType = 'CNH' | 'RG' | 'CIN';

export interface UserProfile {
  cpfId: string;
  maskedCpf: string;
  fullName: string;
  birthDate: string;
  email?: string;
  phone?: string;
  username?: string;
  hasPasswordLogin?: boolean;
  kycStatus: KycStatus;
  kycDocumentType?: KycDocumentType;
  kycDocumentLast4?: string;
  kycSelfieVerifiedAt?: string;
  kycAuditId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BiometricConfig {
  enabled: boolean;
  credentialId?: string;
  deviceLabel?: string;
  mode?: 'capacitor_native' | 'webauthn' | 'device_key';
  registeredAt?: string;
}

export interface CategoryRow {
  id: string;
  block: BlockType;
  name: string;
  color?: string;
  icon?: string;
  refDay?: number;
  order: number;
  hidden?: boolean;
  alertLimit?: number;
  alertPctThreshold?: number;
  isRecurring?: boolean;
}

export interface TransactionEntry {
  id: string;
  rowId: string;
  year: number;
  month: number; // 0..11
  day: number; // 1..31
  amount: number;
  description: string;
  merchant?: string;
  paymentMethod?: PaymentMethod;
  entryNature?: EntryNature;
  installments?: string;
  installmentCurrent?: number;
  installmentTotal?: number;
  accountId: string; // 'manual' or bank account id
  source: EntrySource;
  status: EntryStatus;
  note?: string;
  createdAt: string;
}

export type AccountType = 'Corrente' | 'Digital' | 'Cartão de Crédito';
export type AccountStatus = 'active' | 'paused';
export type InvoiceState = 'open' | 'closed' | 'paid';

export interface BankAccount {
  id: string;
  slot: number; // 1..5
  institution: string;
  institutionCode: string;
  type: AccountType;
  nickname: string;
  balance: number;
  color: string;
  status: AccountStatus;
  statusMessage?: string;
  lastSync: string;
  maskedAccount: string;
  defaultRowId?: string;
  creditLimit?: number;
  availableLimit?: number;
  invoiceClosingDay?: number;
  invoiceDueDay?: number;
  currentInvoiceStatus?: InvoiceState;
}

export interface CreditCardAccount {
  id: string;
  bankId: string;
  bankName: string;
  bankColor: string;
  bankCategory?: string;
  nickname?: string;
  last4?: string;
  totalLimit: number;
  closingDay: number; // 1..31
  dueDay: number; // 1..31
  createdAt: string;
}

export interface CreditCardPurchase {
  id: string;
  cardId: string;
  description: string;
  totalAmount: number;
  installments: number; // 1..24
  purchaseDate: string; // YYYY-MM-DD
  category: string;
  createdAt: string;
}

export interface AutoRule {
  id: string;
  keyword: string;
  targetRowId: string;
  accountId?: string;
  enabled: boolean;
}

export type AuditEventType = 'auth' | 'sync' | 'renew' | 'revoke' | 'transaction' | 'status';
export type AuditEventStatus = 'success' | 'warning' | 'revoked' | 'blocked';

export interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  detail: string;
  securityProtocol: string;
  institution?: string;
  scope?: string;
  status?: AuditEventStatus;
  eventType?: AuditEventType;
}

export interface SavingsGoal {
  id: string;
  title: string;
  targetAmount: number;
  deadlineMonth: number; // 0..11
  deadlineYear: number;
  trackingMode: 'savings' | 'result' | 'combined';
  createdAt: string;
}

export type AppLanguage = 'pt' | 'en' | 'es';

export interface AppSettings {
  language: AppLanguage;
  theme: 'dark' | 'light';
  privacyMode: boolean;
  privacyDefaultOnBoot: boolean;
  autoLockMinutes: number;
  activeYear: number;
  focusMonth: number; // 0..11
  closingDay: number;
  showZeroMonths: boolean;
  variationDisplay: 'both' | 'currency' | 'percent';
  syncFrequencyMinutes: number;
  anomalyThresholdPct: number;
  notificationsEnabled: boolean;
  alertLeadDays?: number;
  lockOnBackground?: boolean;
}

export type RecurringBillStatus = 'paid' | 'pending' | 'overdue';
export type RecurringItemType = 'debit' | 'income';

export interface RecurringBill {
  id: string;
  title: string;
  type?: RecurringItemType;
  amount: number;
  dueDay: number; // 1..31
  categoryRowId?: string;
  active?: boolean;
  statusByMonth: Record<string, RecurringBillStatus>; // key: "YYYY-MM", e.g. "2026-10"
  notes?: string;
  createdAt: string;
}

export interface AlertItem {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  type: 'ceiling' | 'anomaly' | 'subscription' | 'cashflow' | 'extraordinary';
  title: string;
  description: string;
  rowId?: string;
  month?: number;
  amount?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  persona?: 'integrated' | 'friend' | 'banker';
  timestamp: string;
  model?: string;
}

export interface AppState {
  rows: CategoryRow[];
  entries: TransactionEntry[];
  accounts: BankAccount[];
  creditCards?: CreditCardAccount[];
  cardPurchases?: CreditCardPurchase[];
  paidCardInvoices?: Record<string, boolean>;
  rules: AutoRule[];
  goals: SavingsGoal[];
  recurringBills?: RecurringBill[];
  auditLog: AuditEvent[];
  settings: AppSettings;
  chatHistory: ChatMessage[];
}

export interface MatrixTotals {
  rowMonthly: Record<string, number[]>;
  rowAnnual: Record<string, number>;
  rowAverage: Record<string, number>;
  incomeMonthly: number[];
  incomeAnnual: number;
  fixedMonthly: number[];
  fixedAnnual: number;
  variableMonthly: number[];
  variableAnnual: number;
  totalExpenseMonthly: number[];
  totalExpenseAnnual: number;
  resultMonthly: number[];
  resultAnnual: number;
  savingsMonthly: number[];
  savingsAnnual: number;
}

export interface TimelineEvent {
  id: string;
  dateISO: string;
  year: number;
  month: number;
  day: number;
  title: string;
  categoryName: string;
  rowId: string;
  block: BlockType;
  amount: number;
  signedAmount: number;
  accountId: string;
  accountLabel: string;
  paymentMethod?: PaymentMethod;
  entryNature?: EntryNature;
  isDeduplicated?: boolean;
  installmentLabel?: string;
  installmentRemainingAmount?: number;
  merchant?: string;
  source: EntrySource;
  status: EntryStatus;
  projectedBalanceAfter: number;
  isAlert?: boolean;
  alertNote?: string;
}
