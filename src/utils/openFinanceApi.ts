import { AccountType, AuditEvent, BankAccount } from '../types/finance';
import { getApiEndpoint } from './vaultApi';

export interface OpenFinanceBackendStatus {
  configured: boolean;
  provider: 'pluggy' | 'belvo' | 'fapi' | null;
  providerLabel: string;
  missingEnvVars: string[];
  callbackUrl: string;
  message: string;
}

export interface CreateConsentResponse {
  configured: boolean;
  provider?: string;
  consentId?: string;
  authorizationUrl?: string;
  state?: string;
  account?: BankAccount;
  message?: string;
  error?: string;
  missingEnvVars?: string[];
  callbackUrl?: string;
}

export async function fetchOpenFinanceStatus(): Promise<OpenFinanceBackendStatus> {
  try {
    const resp = await fetch(getApiEndpoint('/api/open-finance/status'), {
      method: 'GET',
    });
    const data = (await resp.json()) as OpenFinanceBackendStatus;
    return data;
  } catch {
    return {
      configured: false,
      provider: null,
      providerLabel: 'Indisponível',
      missingEnvVars: ['OPEN_FINANCE_PROVIDER'],
      callbackUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/open-finance/callback`,
      message: 'Aguardando configuração do provedor/credenciais Open Finance no backend.',
    };
  }
}

export async function initiateOpenFinanceConsent(
  authToken: string,
  payload: {
    institutionId: string;
    institutionName: string;
    accountType: AccountType;
    termMonths: number;
    scope: string[];
  }
): Promise<CreateConsentResponse> {
  const resp = await fetch(getApiEndpoint('/api/open-finance/consents'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });
  const data = (await resp.json()) as CreateConsentResponse;
  if (!resp.ok && !data.error && data.message) {
    data.error = data.message;
  }
  return data;
}

export async function syncOpenFinanceConsent(
  authToken: string,
  consentId: string
): Promise<{
  ok: boolean;
  accounts?: BankAccount[];
  auditLog?: AuditEvent[];
  error?: string;
}> {
  const resp = await fetch(
    getApiEndpoint(`/api/open-finance/consents/${encodeURIComponent(consentId)}/sync`),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );
  const data = (await resp.json()) as {
    accounts?: BankAccount[];
    auditLog?: AuditEvent[];
    error?: string;
    message?: string;
  };
  if (!resp.ok) {
    return {
      ok: false,
      error: data.error || data.message || 'Falha ao sincronizar consentimento.',
    };
  }
  return {
    ok: true,
    accounts: data.accounts,
    auditLog: data.auditLog,
  };
}

export async function revokeOpenFinanceConsent(
  authToken: string,
  consentId: string
): Promise<{
  ok: boolean;
  accounts?: BankAccount[];
  revokedConsents?: BankAccount[];
  auditLog?: AuditEvent[];
  error?: string;
}> {
  const resp = await fetch(
    getApiEndpoint(`/api/open-finance/consents/${encodeURIComponent(consentId)}/revoke`),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );
  const data = (await resp.json()) as {
    accounts?: BankAccount[];
    revokedConsents?: BankAccount[];
    auditLog?: AuditEvent[];
    error?: string;
  };
  if (!resp.ok) {
    return { ok: false, error: data.error || 'Falha ao revogar consentimento.' };
  }
  return {
    ok: true,
    accounts: data.accounts,
    revokedConsents: data.revokedConsents,
    auditLog: data.auditLog,
  };
}
