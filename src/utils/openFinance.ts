import {
  AccountStatus,
  BankAccount,
  EntryNature,
  TransactionEntry,
} from '../types/finance';

export interface InstallmentBreakdown {
  isInstallment: boolean;
  current: number;
  total: number;
  remainingCount: number;
  installmentAmount: number;
  remainingTotalAmount: number;
  shortLabel: string;
}

export interface AccountHealthEvaluation {
  effectiveStatus: AccountStatus;
  isHealthy: boolean;
  needsAction: boolean;
  expiringSoon: boolean;
  daysUntilExpiry: number | null;
  badgeLabel: string;
  userMessage: string;
  actionLabel?: string;
}

export function isDeduplicatedEntry(entry: Pick<TransactionEntry, 'entryNature'>): boolean {
  return entry.entryNature === 'internal_transfer' || entry.entryNature === 'invoice_payment';
}

export function formatEntryNatureLabel(nature?: EntryNature): string {
  switch (nature) {
    case 'internal_transfer':
      return 'Transferência Interna (Não duplica gasto)';
    case 'invoice_payment':
      return 'Pagamento de Fatura (Não duplica compra)';
    default:
      return 'Lançamento Real';
  }
}

export function parseInstallmentInfo(
  entry: Pick<TransactionEntry, 'amount' | 'installments' | 'installmentCurrent' | 'installmentTotal'>
): InstallmentBreakdown {
  const safeAmount = Number.isFinite(entry.amount) && entry.amount > 0 ? entry.amount : 0;

  let current = Number.isFinite(entry.installmentCurrent)
    ? Math.trunc(entry.installmentCurrent as number)
    : 0;
  let total = Number.isFinite(entry.installmentTotal)
    ? Math.trunc(entry.installmentTotal as number)
    : 0;

  if ((current <= 0 || total <= 1) && typeof entry.installments === 'string') {
    const match = entry.installments.trim().match(/^(\d{1,2})\s*[/xX]\s*(\d{1,2})$/);
    if (match) {
      current = parseInt(match[1], 10);
      total = parseInt(match[2], 10);
    }
  }

  if (total > 1 && current >= 1 && current <= total) {
    const remainingCount = Math.max(0, total - current);
    const remainingTotalAmount = Number((safeAmount * remainingCount).toFixed(2));
    return {
      isInstallment: true,
      current,
      total,
      remainingCount,
      installmentAmount: safeAmount,
      remainingTotalAmount,
      shortLabel: `${current}/${total}`,
    };
  }

  return {
    isInstallment: false,
    current: 1,
    total: 1,
    remainingCount: 0,
    installmentAmount: safeAmount,
    remainingTotalAmount: 0,
    shortLabel: 'À vista',
  };
}

export function evaluateAccountHealth(
  acc: BankAccount,
  referenceDate: Date = new Date()
): AccountHealthEvaluation {
  let daysUntilExpiry: number | null = null;
  if (acc.consentExpiresAt) {
    const expiryDate = new Date(`${acc.consentExpiresAt}T23:59:59`);
    if (!Number.isNaN(expiryDate.getTime())) {
      const diffMs = expiryDate.getTime() - referenceDate.getTime();
      daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  const isExpiredByDate = daysUntilExpiry !== null && daysUntilExpiry <= 0;
  const effectiveStatus: AccountStatus =
    acc.status === 'consent_expired' || isExpiredByDate
      ? 'consent_expired'
      : acc.status;

  if (effectiveStatus === 'consent_expired') {
    return {
      effectiveStatus,
      isHealthy: false,
      needsAction: true,
      expiringSoon: false,
      daysUntilExpiry,
      badgeLabel: 'Consentimento Expirado',
      userMessage:
        acc.statusMessage ||
        'O prazo do consentimento Open Finance expirou. Renove a autorização diretamente no ambiente oficial da instituição via OAuth 2.0 / FAPI.',
      actionLabel: 'Renovar Consentimento no Banco',
    };
  }

  if (effectiveStatus === 'sync_error') {
    return {
      effectiveStatus,
      isHealthy: false,
      needsAction: true,
      expiringSoon: false,
      daysUntilExpiry,
      badgeLabel: 'Erro de Conector',
      userMessage:
        acc.statusMessage ||
        'A instituição financeira não respondeu à última atualização do conector. Nenhuma credencial foi afetada; tente sincronizar ou reconectar via fluxo oficial.',
      actionLabel: 'Reconectar Conector',
    };
  }

  if (effectiveStatus === 'revoked') {
    return {
      effectiveStatus,
      isHealthy: false,
      needsAction: false,
      expiringSoon: false,
      daysUntilExpiry,
      badgeLabel: 'Revogada',
      userMessage:
        acc.statusMessage ||
        'Consentimento revogado pelo titular. A sincronização foi encerrada permanentemente.',
    };
  }

  if (effectiveStatus === 'pending_bank_confirmation') {
    return {
      effectiveStatus,
      isHealthy: false,
      needsAction: true,
      expiringSoon: false,
      daysUntilExpiry,
      badgeLabel: 'Aguardando Banco',
      userMessage:
        acc.statusMessage ||
        'Consentimento criado. Conclua a autorização no ambiente oficial da instituição financeira.',
      actionLabel: 'Abrir Banco Oficial',
    };
  }

  if (effectiveStatus === 'paused') {
    return {
      effectiveStatus,
      isHealthy: false,
      needsAction: false,
      expiringSoon: false,
      daysUntilExpiry,
      badgeLabel: 'Pausada',
      userMessage:
        'Sincronização suspensa pelo titular. O consentimento permanece registrado e pode ser retomado ou revogado a qualquer momento.',
      actionLabel: 'Retomar',
    };
  }

  const expiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 15;
  return {
    effectiveStatus: 'active',
    isHealthy: true,
    needsAction: expiringSoon,
    expiringSoon,
    daysUntilExpiry,
    badgeLabel: expiringSoon ? `Expira em ${daysUntilExpiry}d` : 'Ativa (FAPI)',
    userMessage: expiringSoon
      ? `Consentimento ativo, porém próximo do vencimento (${acc.consentExpiresAt}). Recomenda-se renovar antecipadamente.`
      : 'Conexão ativa em modo somente leitura via OAuth 2.0 + FAPI.',
    actionLabel: expiringSoon ? 'Renovar Consentimento' : undefined,
  };
}

export function buildConsentExpirationDate(termMonths: number, baseDate: Date = new Date()): string {
  const safeMonths = Math.min(12, Math.max(1, Math.trunc(termMonths)));
  const target = new Date(baseDate.getTime());
  target.setMonth(target.getMonth() + safeMonths);
  return target.toISOString().slice(0, 10);
}

export function detectOpenFinanceComplianceViolation(message: string): {
  blocked: boolean;
  refusalMessage?: string;
} {
  const normalized = (message || '').toLowerCase();
  const asksSensitiveCredential =
    /(digitar|informar|inserir|enviar|pedir|salvar|armazenar|simular|coletar|passar|qual)\s+.{0,30}(senha\s*(banc|do\s*banco|do\s*app|da\s*conta|do\s*cart[aã]o)|pin\s*banc|token\s*(banc|sms|seguran)|c[oó]digo\s*(sms|mfa|2fa|token)|cvv|c[oó]digo\s*de\s*seguran[cç]a|validade\s*do\s*cart[aã]o|n[uú]mero\s*completo\s*do\s*cart[aã]o)/i.test(
      normalized
    ) ||
    /(burlar|pular|contornar|ignorar)\s+.{0,30}(consentimento|oauth|fapi|open\s*finance|autentica[cç][aã]o)/i.test(
      normalized
    );

  if (!asksSensitiveCredential) {
    return { blocked: false };
  }

  return {
    blocked: true,
    refusalMessage:
      'Por conformidade obrigatória com a LGPD e as normas do Banco Central (Open Finance Brasil), não solicito, coleto, simulo nem armazeno senhas bancárias, PINs, tokens de segurança, códigos SMS/MFA, CVV, data de validade ou número completo de cartão.\n\n' +
      '**Caminho oficial seguro:** Toda vinculação ou renovação ocorre exclusivamente fora do aplicativo, no ambiente oficial da sua instituição financeira via **OAuth 2.0 / FAPI + PKCE**, com escopo somente leitura, prazo definido e revogação imediata em **Contas & Open Finance**.',
  };
}
