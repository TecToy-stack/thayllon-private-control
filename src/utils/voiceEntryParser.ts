import { CategoryRow, EntryStatus, PaymentMethod } from '../types/finance';

export interface ParsedVoiceEntry {
  rawTranscript: string;
  amount: number | null;
  flowType: 'income' | 'expense' | 'savings';
  paymentMethod: PaymentMethod;
  day: number;
  month: number;
  status: EntryStatus;
  matchedRowId: string | null;
  matchedRowName: string | null;
  merchant: string;
  description: string;
  installmentCurrent?: number;
  installmentTotal?: number;
  confidenceHints: string[];
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const SPOKEN_NUMBER_MAP: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  mil: 1000,
};

function parseAmountFromVoice(raw: string): number | null {
  const norm = normalizeText(raw);

  // Remove explicit date/installment tokens so "dia 14" or "3x" doesn't get mistaken for currency
  const cleanedForAmount = norm
    .replace(/\bdia\s+\d{1,2}\b/gi, ' ')
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\b/gi, ' ')
    .replace(/\b\d{1,2}\s*(?:x|vezes|parcelas?)\b/gi, ' ');

  // 1. Explicit currency marker: "R$ 1.250,90" / "706,00" / "50 reais" / "de 706,00"
  const priorityPatterns: RegExp[] = [
    /(?:r\$\s*|de\s+|com\s+|por\s+|valor\s+)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
    /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:reais|real|conto|contos|brl)\b/i,
    /(\d+,\d{1,2})/,
    /(\d+(?:\.\d{1,2})?)/,
  ];

  for (const pattern of priorityPatterns) {
    const match = cleanedForAmount.match(pattern);
    if (match && match[1]) {
      const token = match[1].trim();
      let numericStr = token;
      if (token.includes(',')) {
        numericStr = token.replace(/\./g, '').replace(',', '.');
      } else if (/^\d{1,3}(\.\d{3})+$/.test(token)) {
        numericStr = token.replace(/\./g, '');
      }
      const val = parseFloat(numericStr);
      if (Number.isFinite(val) && val > 0) {
        return Number(val.toFixed(2));
      }
    }
  }

  // 2. Spoken word fallback ("cinquenta reais")
  const spokenMatch = cleanedForAmount.match(
    /\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|duzentos|trezentos|quatrocentos|quinhentos|mil)\s*(?:reais|real)\b/
  );
  if (spokenMatch && SPOKEN_NUMBER_MAP[spokenMatch[1]]) {
    return SPOKEN_NUMBER_MAP[spokenMatch[1]];
  }

  return null;
}

function parseDayAndMonth(
  raw: string,
  defaultMonth: number,
  referenceDate: Date
): { day: number; month: number; foundExplicitDay: boolean } {
  const norm = normalizeText(raw);
  const currentDay = referenceDate.getDate();

  const dayMatch = norm.match(/\bdia\s+(\d{1,2})\b/);
  if (dayMatch) {
    const d = parseInt(dayMatch[1], 10);
    if (d >= 1 && d <= 31) {
      return { day: d, month: defaultMonth, foundExplicitDay: true };
    }
  }

  const slashDate = norm.match(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/);
  if (slashDate) {
    const d = parseInt(slashDate[1], 10);
    const m = parseInt(slashDate[2], 10) - 1;
    if (d >= 1 && d <= 31 && m >= 0 && m <= 11) {
      return { day: d, month: m, foundExplicitDay: true };
    }
  }

  if (/\bontem\b/.test(norm)) {
    const yesterday = new Date(referenceDate);
    yesterday.setDate(yesterday.getDate() - 1);
    return { day: yesterday.getDate(), month: yesterday.getMonth(), foundExplicitDay: true };
  }

  if (/\bamanha\b/.test(norm)) {
    const tomorrow = new Date(referenceDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { day: tomorrow.getDate(), month: tomorrow.getMonth(), foundExplicitDay: true };
  }

  return { day: currentDay, month: defaultMonth, foundExplicitDay: false };
}

function parsePaymentMethod(raw: string, defaultFlow: 'income' | 'expense' | 'savings'): PaymentMethod {
  const norm = normalizeText(raw);
  if (/\bpix\b/.test(norm)) return 'pix';
  if (/\b(?:debito|no debito|cartao de debito)\b/.test(norm)) return 'debit';
  if (/\b(?:credito|no credito|cartao de credito|fatura)\b/.test(norm)) return 'credit';
  if (/\b(?:dinheiro|especie|em maos)\b/.test(norm)) return 'cash';
  if (/\b(?:transferencia|ted|doc|deposito)\b/.test(norm)) return 'transfer';
  if (/\bcartao\b/.test(norm)) return 'credit';
  return defaultFlow === 'income' ? 'pix' : 'debit';
}

function parseInstallments(raw: string): { current?: number; total?: number } {
  const norm = normalizeText(raw);
  const ratioMatch = norm.match(/\bparcela\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/);
  if (ratioMatch) {
    const cur = Math.max(1, parseInt(ratioMatch[1], 10));
    const tot = Math.min(48, Math.max(cur, parseInt(ratioMatch[2], 10)));
    return { current: cur, total: tot };
  }
  const timesMatch = norm.match(/\bem\s+(\d{1,2})\s*(?:x|vezes|parcelas?)\b/);
  if (timesMatch) {
    const tot = Math.min(48, Math.max(2, parseInt(timesMatch[1], 10)));
    return { current: 1, total: tot };
  }
  return {};
}

function parseFlowAndStatus(raw: string): {
  flowType: 'income' | 'expense' | 'savings';
  status: EntryStatus;
} {
  const norm = normalizeText(raw);

  let flowType: 'income' | 'expense' | 'savings' = 'expense';
  if (
    /\b(?:guardei|caixinha|poupanca|reserva|investi|apliquei)\b/.test(norm)
  ) {
    flowType = 'savings';
  } else if (
    /\b(?:recebi|ganhei|entrou|salario|me pagou|me pagaram|faturei|rendimento|reembolso)\b/.test(norm) ||
    /\bpagamento\s+(?:da|do|de)\b/.test(norm)
  ) {
    flowType = 'income';
  }

  let status: EntryStatus = 'paid';
  if (/\b(?:projetado|previsao|estimado)\b/.test(norm)) {
    status = 'projected';
  } else if (/\b(?:vou pagar|a pagar|agendei|pendente|vai vencer|a receber|previsto)\b/.test(norm)) {
    status = 'pending';
  }

  return { flowType, status };
}

const KEYWORD_CATEGORY_SYNONYMS: { keywords: string[]; rowHints: string[]; block: 'income' | 'fixed' | 'variable' | 'savings' }[] = [
  {
    keywords: ['abasteci', 'abastecimento', 'gasolina', 'etanol', 'alcool', 'diesel', 'posto', 'combustivel'],
    rowHints: ['combustivel'],
    block: 'variable',
  },
  {
    keywords: ['uber', '99', 'pedagio', 'estacionamento', 'transporte'],
    rowHints: ['combustivel', 'transporte', 'carro', 'veiculo'],
    block: 'variable',
  },
  {
    keywords: ['mercado', 'supermercado', 'feira', 'padaria', 'acougue', 'hortifruti', 'compras'],
    rowHints: ['mercado', 'supermercado', 'alimentacao'],
    block: 'variable',
  },
  {
    keywords: ['restaurante', 'lanche', 'ifood', 'hamburguer', 'pizza', 'almoco', 'jantar', 'cafe'],
    rowHints: ['alimentacao', 'restaurante', 'lazer', 'mercado'],
    block: 'variable',
  },
  {
    keywords: ['farmacia', 'remedio', 'consulta', 'exame', 'medico', 'dentista', 'saude'],
    rowHints: ['saude', 'farmacia'],
    block: 'variable',
  },
  {
    keywords: ['aluguel', 'condominio', 'iptu', 'moradia'],
    rowHints: ['aluguel', 'casa', 'moradia'],
    block: 'fixed',
  },
  {
    keywords: ['energia', 'luz', 'agua', 'internet', 'wifi', 'telefone', 'celular', 'plano'],
    rowHints: ['celular', 'internet', 'energia', 'agua', 'fixa'],
    block: 'fixed',
  },
  {
    keywords: ['academia', 'treino', 'musculacao'],
    rowHints: ['academia', 'saude'],
    block: 'fixed',
  },
  {
    keywords: ['cartao', 'fatura'],
    rowHints: ['cartao', 'fatura'],
    block: 'variable',
  },
  {
    keywords: ['guardei', 'caixinha', 'reserva', 'poupanca', 'investi'],
    rowHints: ['guardado', 'caixinha', 'reserva', 'investimento'],
    block: 'savings',
  },
  {
    keywords: ['salario', 'pagamento', 'freela', 'diaria', 'comissao', 'pix recebido', 'recebi'],
    rowHints: ['salario', '2pb', 'pizzaria', 'receita', 'entrada'],
    block: 'income',
  },
];

function matchCategoryRow(
  raw: string,
  rows: CategoryRow[],
  flowType: 'income' | 'expense' | 'savings',
  parsedDay: number
): CategoryRow | null {
  const norm = normalizeText(raw);
  const visibleRows = rows.filter((r) => !r.hidden);
  if (visibleRows.length === 0) return null;

  const compatibleRows = visibleRows.filter((r) => {
    if (flowType === 'income') return r.block === 'income';
    if (flowType === 'savings') return r.block === 'savings';
    return r.block === 'variable' || r.block === 'fixed';
  });
  const pool = compatibleRows.length > 0 ? compatibleRows : visibleRows;

  let bestRow: CategoryRow | null = null;
  let bestScore = -1;

  for (const row of pool) {
    const rNorm = normalizeText(row.name);
    if (!rNorm) continue;
    let score = 0;

    // 1. Direct name / token matches
    const escaped = rNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(norm) || (rNorm.length >= 3 && norm.includes(rNorm))) {
      score += 10;
    } else {
      const tokens = rNorm.split(/[\s/+-]+/).filter((tk) => tk.length >= 2);
      tokens.forEach((tk) => {
        if (new RegExp(`\\b${tk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm)) {
          score += 4;
        }
      });
    }

    // 2. Synonym dictionary boost
    for (const group of KEYWORD_CATEGORY_SYNONYMS) {
      const matchedKeywords = group.keywords.filter((kw) => norm.includes(kw)).length;
      if (matchedKeywords > 0 && group.rowHints.some((hint) => rNorm.includes(hint))) {
        score += 8 + matchedKeywords;
      }
    }

    // 3. Reference day proximity tiebreaker (e.g. 2PB dia 15 vs 2PB dia 30)
    if (score > 0 && row.refDay) {
      const dist = Math.abs(row.refDay - parsedDay);
      score += Math.max(0, 3 - dist * 0.2);
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }

  if (bestScore > 0 && bestRow) {
    return bestRow;
  }

  // Fallback first compatible row
  if (flowType === 'income') {
    return pool.find((r) => r.block === 'income') ?? pool[0];
  }
  if (flowType === 'savings') {
    return pool.find((r) => r.block === 'savings') ?? pool[0];
  }
  return pool.find((r) => r.block === 'variable') ?? pool.find((r) => r.block === 'fixed') ?? pool[0];
}

function capitalizeSentenceFragment(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function extractMerchantAndDescription(
  raw: string,
  matchedRow: CategoryRow | null,
  flowType: 'income' | 'expense' | 'savings'
): { merchant: string; description: string } {
  const cleanRaw = raw.trim().replace(/\s+/g, ' ');

  // Extract explicit location / establishment clause ("no posto da GMC próximo ao campo Goytacazes")
  const locationMatch = cleanRaw.match(
    /\b(?:no|na|nos|nas)\s+((?:posto|mercado|supermercado|loja|restaurante|farmacia|padaria|academia|hospital|clinica|oficina|shopping|bar|ponto)\b[^,.]*)/i
  );

  // Extract income payer ("pagamento da 2PB", "recebi da/do X")
  const payerMatch = cleanRaw.match(
    /\b(?:pagamento\s+(?:da|do|de)|recebi\s+(?:da|do|de))\s+([A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ\s.-]{1,35}?)(?=\s+(?:de|no|na|dia|em|via|por)\b|$)/i
  );

  if (flowType === 'income' && payerMatch?.[1]) {
    const payer = payerMatch[1].trim();
    return {
      merchant: matchedRow?.name && normalizeText(payer).includes(normalizeText(matchedRow.name))
        ? matchedRow.name
        : capitalizeSentenceFragment(payer),
      description: capitalizeSentenceFragment(cleanRaw),
    };
  }

  if (locationMatch?.[1]) {
    const place = locationMatch[1]
      .replace(/\b(?:paguei|pago|no\s+d[eé]bito|no\s+cr[eé]dito|via\s+pix|no\s+pix|em\s+dinheiro)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (place.length >= 3) {
      return {
        merchant: capitalizeSentenceFragment(place),
        description: capitalizeSentenceFragment(cleanRaw),
      };
    }
  }

  // Fallback: remove value/payment/day filler words to keep clean merchant label
  const stripped = cleanRaw
    .replace(/\b(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s*(?:reais|real)?\b/gi, '')
    .replace(/\b(?:paguei|recebi|gastei|comprei|via\s+pix|no\s+pix|no\s+d[eé]bito|no\s+cr[eé]dito|em\s+dinheiro|dia\s+\d{1,2})\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const merchant =
    stripped.length >= 3
      ? capitalizeSentenceFragment(stripped).slice(0, 64)
      : matchedRow?.name || (flowType === 'income' ? 'Recebimento' : 'Lançamento');

  return {
    merchant,
    description: capitalizeSentenceFragment(cleanRaw) || merchant,
  };
}

export function parseVoiceTransaction(
  transcript: string,
  rows: CategoryRow[],
  focusMonth: number,
  referenceDate: Date = new Date()
): ParsedVoiceEntry {
  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));
  const raw = transcript.trim();
  const amount = parseAmountFromVoice(raw);
  const { flowType, status } = parseFlowAndStatus(raw);
  const paymentMethod = parsePaymentMethod(raw, flowType);
  const { day, month, foundExplicitDay } = parseDayAndMonth(raw, safeMonth, referenceDate);
  const inst = parseInstallments(raw);
  const matchedRow = matchCategoryRow(raw, rows, flowType, day);
  const { merchant, description } = extractMerchantAndDescription(raw, matchedRow, flowType);

  const hints: string[] = [];
  if (amount !== null) hints.push(`Valor R$ ${amount.toFixed(2).replace('.', ',')}`);
  if (matchedRow) hints.push(`Categoria: ${matchedRow.name}`);
  hints.push(
    paymentMethod === 'pix'
      ? 'Via Pix'
      : paymentMethod === 'debit'
      ? 'Débito'
      : paymentMethod === 'credit'
      ? 'Crédito'
      : paymentMethod === 'cash'
      ? 'Dinheiro'
      : 'Transferência'
  );
  if (foundExplicitDay) hints.push(`Dia ${String(day).padStart(2, '0')}`);
  hints.push(
    status === 'paid'
      ? flowType === 'income'
        ? 'Recebido'
        : 'Pago'
      : status === 'pending'
      ? 'Pendente'
      : 'Projetado'
  );

  return {
    rawTranscript: raw,
    amount,
    flowType,
    paymentMethod,
    day,
    month,
    status,
    matchedRowId: matchedRow?.id ?? null,
    matchedRowName: matchedRow?.name ?? null,
    merchant,
    description,
    installmentCurrent: inst.current,
    installmentTotal: inst.total,
    confidenceHints: hints,
  };
}
