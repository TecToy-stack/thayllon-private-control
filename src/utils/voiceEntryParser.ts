import { CategoryRow, EntryStatus, PaymentMethod } from '../types/finance';

export interface ParsedVoiceEntry {
  rawTranscript: string;
  amount: number | null;
  flowType: 'income' | 'expense' | 'savings';
  paymentMethod: PaymentMethod;
  hasExplicitPaymentMethod: boolean;
  isBoleto?: boolean;
  day: number;
  month: number;
  year: number;
  foundExplicitDay: boolean;
  foundExplicitMonth: boolean;
  foundExplicitYear: boolean;
  status: EntryStatus;
  hasExplicitStatusHint: boolean;
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

const MONTH_NAME_MAP: Record<string, number> = {
  janeiro: 0,
  jan: 0,
  fevereiro: 1,
  fev: 1,
  marco: 2,
  mar: 2,
  abril: 3,
  abr: 3,
  maio: 4,
  mai: 4,
  junho: 5,
  jun: 5,
  julho: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  setembro: 8,
  set: 8,
  outubro: 9,
  out: 9,
  novembro: 10,
  nov: 10,
  dezembro: 11,
  dez: 11,
};

const SPOKEN_UNITS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  meia: 6,
  sete: 7,
  oito: 8,
  nove: 9,
};

const SPOKEN_TEENS: Record<string, number> = {
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
};

const SPOKEN_TENS: Record<string, number> = {
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
};

const SPOKEN_HUNDREDS: Record<string, number> = {
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
};

const ALL_SPOKEN_NUM_WORDS = new Set([
  ...Object.keys(SPOKEN_UNITS),
  ...Object.keys(SPOKEN_TEENS),
  ...Object.keys(SPOKEN_TENS),
  ...Object.keys(SPOKEN_HUNDREDS),
  'mil',
]);

function parsePortugueseNumberWords(phrase: string): number | null {
  const tokens = normalizeText(phrase)
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;

  let total = 0;
  let current = 0;
  let matchedAny = false;

  for (const tk of tokens) {
    if (tk === 'e') continue;
    if (tk === 'mil') {
      matchedAny = true;
      total += (current > 0 ? current : 1) * 1000;
      current = 0;
      continue;
    }
    if (tk in SPOKEN_HUNDREDS) {
      matchedAny = true;
      current += SPOKEN_HUNDREDS[tk];
      continue;
    }
    if (tk in SPOKEN_TENS) {
      matchedAny = true;
      current += SPOKEN_TENS[tk];
      continue;
    }
    if (tk in SPOKEN_TEENS) {
      matchedAny = true;
      current += SPOKEN_TEENS[tk];
      continue;
    }
    if (tk in SPOKEN_UNITS) {
      matchedAny = true;
      current += SPOKEN_UNITS[tk];
      continue;
    }
    // Non-number token breaks accumulation
    if (matchedAny) break;
  }

  if (!matchedAny) return null;
  const result = total + current;
  return result > 0 ? result : null;
}

function parseBrazilianNumericToken(token: string): number | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  let numericStr = trimmed;
  if (trimmed.includes(',')) {
    numericStr = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    numericStr = trimmed.replace(/\./g, '');
  }
  const val = parseFloat(numericStr);
  if (Number.isFinite(val) && val > 0) {
    return Number(val.toFixed(2));
  }
  return null;
}

function parseCentsPart(normText: string): number {
  const numericCents = normText.match(/\b(\d{1,2})\s*centavos?\b/);
  if (numericCents) {
    const c = parseInt(numericCents[1], 10);
    if (c > 0 && c < 100) return c / 100;
  }
  const spokenCentsMatch = normText.match(
    /\b([a-z]+(?:\s+e\s+[a-z]+)?)\s+centavos?\b/
  );
  if (spokenCentsMatch) {
    const parsed = parsePortugueseNumberWords(spokenCentsMatch[1]);
    if (parsed !== null && parsed > 0 && parsed < 100) {
      return parsed / 100;
    }
  }
  return 0;
}

const SPOKEN_DAY_REGEX_PART =
  '(?:primeiro|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte(?:\\s+e\\s+(?:um|dois|tres|quatro|cinco|seis|sete|oito|nove))?|trinta(?:\\s+e\\s+um)?)';

const MONTH_WORDS_REGEX_PART =
  '(?:janeiro|jan|fevereiro|fev|marco|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez)';

function parseSpokenDayNumber(phrase: string): number | null {
  const norm = normalizeText(phrase);
  if (norm === 'primeiro') return 1;
  const num = parsePortugueseNumberWords(norm);
  if (num !== null && num >= 1 && num <= 31) return Math.trunc(num);
  return null;
}

function stripNonCurrencyTokensForAmount(norm: string): string {
  return norm
    .replace(
      new RegExp(
        `\\bdia\\s+(?:\\d{1,2}|${SPOKEN_DAY_REGEX_PART})(?:\\s+de\\s+${MONTH_WORDS_REGEX_PART}(?:\\s+de\\s+\\d{4})?)?\\b`,
        'gi'
      ),
      ' '
    )
    .replace(
      new RegExp(
        `\\b(?:\\d{1,2}|${SPOKEN_DAY_REGEX_PART})\\s+de\\s+${MONTH_WORDS_REGEX_PART}(?:\\s+de\\s+\\d{4})?\\b`,
        'gi'
      ),
      ' '
    )
    .replace(/\bde\s+(?:19|20|21)\d{2}\b/gi, ' ')
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\b/gi, ' ')
    .replace(/\bparcela\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b/gi, ' ')
    .replace(/\b(?:em\s+)?(?:\d{1,2}|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s*(?:x|vezes|parcelas?)\b/gi, ' ')
    // Prevent alphanumeric codes like "2PB", "4G", "3D" from looking like currency values
    .replace(/\b\d+[a-z]+\b/gi, ' ')
    .replace(/\b[a-z]+\d+\b/gi, ' ');
}

function parseAmountFromVoice(raw: string): number | null {
  const norm = normalizeText(raw);
  const cleaned = stripNonCurrencyTokensForAmount(norm);

  // 1. Numeric reais + optional spoken/numeric centavos (e.g., "150 reais e 50 centavos" or "89 reais e 90")
  const reaisPlusCents = cleaned.match(
    /(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:reais|real|conto|contos)\s+e\s+(\d{1,2}|[a-z]+(?:\s+e\s+[a-z]+)?)(?:\s*centavos?)?(?!\s*(?:de|x|vezes|parcelas?))\b/i
  );
  if (reaisPlusCents) {
    const base = parseBrazilianNumericToken(reaisPlusCents[1]);
    if (base !== null) {
      const centsRaw = reaisPlusCents[2];
      const centsNum = /^\d+$/.test(centsRaw)
        ? parseInt(centsRaw, 10)
        : parsePortugueseNumberWords(centsRaw);
      if (centsNum !== null && centsNum >= 0 && centsNum < 100) {
        return Number((base + centsNum / 100).toFixed(2));
      }
    }
  }

  // 1b. "49 e 90" or "120 e 50" (implicit reais + 2-digit centavos)
  const implicitCents = cleaned.match(
    /\b(\d{1,5})\s+e\s+(\d{2})(?:\s*(?:reais|real|centavos?))?(?!\s*(?:de\s+[a-z]+|x|vezes|parcelas?))\b/i
  );
  if (implicitCents) {
    const base = parseBrazilianNumericToken(implicitCents[1]);
    const centsNum = parseInt(implicitCents[2], 10);
    if (base !== null && centsNum >= 0 && centsNum < 100) {
      return Number((base + centsNum / 100).toFixed(2));
    }
  }

  // 2. Priority explicit numeric currency patterns (decimal or currency-labeled)
  const priorityPatterns: RegExp[] = [
    /r\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
    /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:reais|real|conto|contos|brl)\b/i,
    /(?:de|com|por|valor)\s+(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\s*centavos?)\b/i,
    /\b(\d{1,3}(?:\.\d{3})*,\d{1,2})\b/,
  ];

  for (const pattern of priorityPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const val = parseBrazilianNumericToken(match[1]);
      if (val !== null) {
        return val;
      }
    }
  }

  // 3. Spoken compound Portuguese numbers before "reais" / "real" (+ optional "e XX [centavos]")
  const spokenPhraseMatch = cleaned.match(
    /\b([a-z\s]+?)\s*(?:reais|real|conto|contos)\b(?:\s+e\s+(\d{1,2}|[a-z]+(?:\s+e\s+[a-z]+)?)(?:\s*centavos?)?)?/
  );
  if (spokenPhraseMatch) {
    const words = spokenPhraseMatch[1].trim().split(/\s+/);
    const collected: string[] = [];
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i];
      if (ALL_SPOKEN_NUM_WORDS.has(w) || (w === 'e' && collected.length > 0)) {
        collected.unshift(w);
      } else {
        break;
      }
    }
    const base = parsePortugueseNumberWords(collected.join(' '));
    if (base !== null) {
      let extraCents = 0;
      if (spokenPhraseMatch[2]) {
        const rawC = spokenPhraseMatch[2].trim();
        if (/^\d{1,2}$/.test(rawC)) {
          extraCents = parseInt(rawC, 10) / 100;
        } else {
          const parsedC = parsePortugueseNumberWords(rawC);
          if (parsedC !== null && parsedC > 0 && parsedC < 100) {
            extraCents = parsedC / 100;
          }
        }
      }
      return Number((base + extraCents).toFixed(2));
    }
  }

  // 4. Bare standalone numeric fallback (ignoring "<n> centavos")
  const withoutBareCents = cleaned.replace(/\b\d{1,2}\s*centavos?\b/gi, ' ');
  const bareNumberMatch = withoutBareCents.match(/\b(\d+(?:[.,]\d{1,2})?)\b/);
  if (bareNumberMatch && bareNumberMatch[1]) {
    const val = parseBrazilianNumericToken(bareNumberMatch[1]);
    if (val !== null) {
      return val;
    }
  }

  // 5. Only centavos spoken ("cinquenta centavos", "75 centavos")
  const onlyCents = parseCentsPart(cleaned);
  if (onlyCents > 0) {
    return Number(onlyCents.toFixed(2));
  }

  return null;
}

function parseDayAndMonth(
  raw: string,
  defaultMonth: number,
  defaultYear: number,
  referenceDate: Date
): {
  day: number;
  month: number;
  year: number;
  foundExplicitDay: boolean;
  foundExplicitMonth: boolean;
  foundExplicitYear: boolean;
} {
  const norm = normalizeText(raw);
  const currentDay = referenceDate.getDate();

  // "14/05", "01/01/2027", "01/01/28"
  const slashDate = norm.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/);
  if (slashDate) {
    const d = parseInt(slashDate[1], 10);
    const m = parseInt(slashDate[2], 10) - 1;
    let y = defaultYear;
    let foundExplicitYear = false;
    if (slashDate[3]) {
      let parsedY = parseInt(slashDate[3], 10);
      if (parsedY < 100) parsedY += 2000;
      if (parsedY >= 1900 && parsedY <= 9999) {
        y = parsedY;
        foundExplicitYear = true;
      }
    }
    if (d >= 1 && d <= 31 && m >= 0 && m <= 11) {
      return {
        day: d,
        month: m,
        year: y,
        foundExplicitDay: true,
        foundExplicitMonth: true,
        foundExplicitYear,
      };
    }
  }

  // "dia 14 de maio de 2027", "dia primeiro de janeiro de 2028", "quinze de novembro"
  const dayMonthName = norm.match(
    new RegExp(
      `\\b(?:dia\\s+)?(\\d{1,2}|${SPOKEN_DAY_REGEX_PART})\\s+de\\s+(${MONTH_WORDS_REGEX_PART})(?:\\s+de\\s+(\\d{4}))?\\b`
    )
  );
  if (dayMonthName) {
    const d = /^\d+$/.test(dayMonthName[1])
      ? parseInt(dayMonthName[1], 10)
      : parseSpokenDayNumber(dayMonthName[1]);
    const m = MONTH_NAME_MAP[dayMonthName[2]];
    let y = defaultYear;
    let foundExplicitYear = false;
    if (dayMonthName[3]) {
      const parsedY = parseInt(dayMonthName[3], 10);
      if (parsedY >= 1900 && parsedY <= 9999) {
        y = parsedY;
        foundExplicitYear = true;
      }
    }
    if (d !== null && d >= 1 && d <= 31 && m !== undefined) {
      return {
        day: d,
        month: m,
        year: y,
        foundExplicitDay: true,
        foundExplicitMonth: true,
        foundExplicitYear,
      };
    }
  }

  // "dia 14" or spoken "dia quinze" / "dia primeiro"
  const dayMatch = norm.match(new RegExp(`\\bdia\\s+(\\d{1,2}|${SPOKEN_DAY_REGEX_PART})\\b`));
  if (dayMatch) {
    const d = /^\d+$/.test(dayMatch[1])
      ? parseInt(dayMatch[1], 10)
      : parseSpokenDayNumber(dayMatch[1]);
    if (d !== null && d >= 1 && d <= 31) {
      return {
        day: d,
        month: defaultMonth,
        year: defaultYear,
        foundExplicitDay: true,
        foundExplicitMonth: false,
        foundExplicitYear: false,
      };
    }
  }

  // Explicit month + year without day (e.g. "em janeiro de 2027")
  const monthYearOnly = norm.match(
    new RegExp(`\\b(${MONTH_WORDS_REGEX_PART})(?:\\s+de\\s+(\\d{4}))?\\b`)
  );
  if (monthYearOnly && monthYearOnly[2]) {
    const m = MONTH_NAME_MAP[monthYearOnly[1]];
    const y = parseInt(monthYearOnly[2], 10);
    if (m !== undefined && y >= 1900 && y <= 9999) {
      return {
        day: currentDay,
        month: m,
        year: y,
        foundExplicitDay: false,
        foundExplicitMonth: true,
        foundExplicitYear: true,
      };
    }
  }

  if (/\bhoje\b/.test(norm)) {
    return {
      day: referenceDate.getDate(),
      month: referenceDate.getMonth(),
      year: referenceDate.getFullYear(),
      foundExplicitDay: true,
      foundExplicitMonth: true,
      foundExplicitYear: true,
    };
  }

  if (/\banteontem\b/.test(norm)) {
    const dayBefore = new Date(referenceDate);
    dayBefore.setDate(dayBefore.getDate() - 2);
    return {
      day: dayBefore.getDate(),
      month: dayBefore.getMonth(),
      year: dayBefore.getFullYear(),
      foundExplicitDay: true,
      foundExplicitMonth: true,
      foundExplicitYear: true,
    };
  }

  if (/\bontem\b/.test(norm)) {
    const yesterday = new Date(referenceDate);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      day: yesterday.getDate(),
      month: yesterday.getMonth(),
      year: yesterday.getFullYear(),
      foundExplicitDay: true,
      foundExplicitMonth: true,
      foundExplicitYear: true,
    };
  }

  if (/\bamanha\b/.test(norm)) {
    const tomorrow = new Date(referenceDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      day: tomorrow.getDate(),
      month: tomorrow.getMonth(),
      year: tomorrow.getFullYear(),
      foundExplicitDay: true,
      foundExplicitMonth: true,
      foundExplicitYear: true,
    };
  }

  return {
    day: currentDay,
    month: defaultMonth,
    year: defaultYear,
    foundExplicitDay: false,
    foundExplicitMonth: false,
    foundExplicitYear: false,
  };
}

function parsePaymentMethod(
  raw: string,
  defaultFlow: 'income' | 'expense' | 'savings'
): { paymentMethod: PaymentMethod; hasExplicitPaymentMethod: boolean; isBoleto: boolean } {
  const norm = normalizeText(raw);
  if (/\b(?:pix|via pix|no pix|chave pix)\b/.test(norm)) {
    return { paymentMethod: 'pix', hasExplicitPaymentMethod: true, isBoleto: false };
  }
  if (/\b(?:debito|no debito|cartao de debito|passado no debito)\b/.test(norm)) {
    return { paymentMethod: 'debit', hasExplicitPaymentMethod: true, isBoleto: false };
  }
  if (
    /\b(?:credito|no credito|cartao de credito|fatura|parcelado|parcelada|\d+\s*x|\d+\s*vezes|(?:duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s*(?:vezes|parcelas?))\b/.test(
      norm
    )
  ) {
    return { paymentMethod: 'credit', hasExplicitPaymentMethod: true, isBoleto: false };
  }
  if (/\b(?:dinheiro|em dinheiro|especie|em especie|em maos)\b/.test(norm)) {
    return { paymentMethod: 'cash', hasExplicitPaymentMethod: true, isBoleto: false };
  }
  if (/\b(?:boleto|codigo de barras)\b/.test(norm)) {
    return { paymentMethod: 'transfer', hasExplicitPaymentMethod: true, isBoleto: true };
  }
  if (/\b(?:transferencia|ted|doc|deposito|debito automatico)\b/.test(norm)) {
    return { paymentMethod: 'transfer', hasExplicitPaymentMethod: true, isBoleto: false };
  }
  if (/\bcartao\b/.test(norm)) {
    return { paymentMethod: 'credit', hasExplicitPaymentMethod: true, isBoleto: false };
  }
  return {
    paymentMethod: defaultFlow === 'income' ? 'pix' : 'debit',
    hasExplicitPaymentMethod: false,
    isBoleto: false,
  };
}

function parseInstallments(raw: string): { current?: number; total?: number } {
  const norm = normalizeText(raw);
  const ratioMatch = norm.match(/\bparcela\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/);
  if (ratioMatch) {
    const cur = Math.max(1, parseInt(ratioMatch[1], 10));
    const tot = Math.min(48, Math.max(cur, parseInt(ratioMatch[2], 10)));
    return { current: cur, total: tot };
  }
  const timesMatch = norm.match(
    /\b(?:em\s+)?(\d{1,2}|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s*(?:x|vezes|parcelas?)\b/
  );
  if (timesMatch) {
    const parsedNum = /^\d+$/.test(timesMatch[1])
      ? parseInt(timesMatch[1], 10)
      : parsePortugueseNumberWords(timesMatch[1]);
    if (parsedNum && parsedNum >= 2) {
      const tot = Math.min(48, Math.trunc(parsedNum));
      return { current: 1, total: tot };
    }
  }
  return {};
}

function parseFlowAndStatus(raw: string): {
  flowType: 'income' | 'expense' | 'savings';
  status: EntryStatus;
  hasExplicitStatusHint: boolean;
} {
  const norm = normalizeText(raw);

  let flowType: 'income' | 'expense' | 'savings' = 'expense';
  const explicitExpenseCue = /\b(?:paguei|gastei|comprei|abasteci|boleto|fatura|despesa|conta de)\b/.test(norm);

  if (/\b(?:guardei|guardar|caixinha|poupanca|reserva|investi|investir|apliquei|aplicar)\b/.test(norm)) {
    flowType = 'savings';
  } else if (
    !explicitExpenseCue &&
    (/\b(?:recebi|recebido|recebida|a receber|vou receber|ganhei|entrou|caiu na conta|salario|me pagou|me pagaram|faturei|rendimento|reembolso|repasse|freela|diaria|comissao)\b/.test(
      norm
    ) ||
      /\bpagamento\s+(?:da|do|de|2pb)\b/.test(norm))
  ) {
    flowType = 'income';
  }

  let status: EntryStatus = 'paid';
  let hasExplicitStatusHint = false;

  if (/\b(?:projetado|projetada|previsao|estimado|estimada)\b/.test(norm)) {
    status = 'projected';
    hasExplicitStatusHint = true;
  } else if (
    /\b(?:vou pagar|a pagar|agendei|agendado|agendada|pendente|vai vencer|a receber|vou receber|previsto|prevista|em aberto)\b/.test(
      norm
    )
  ) {
    status = 'pending';
    hasExplicitStatusHint = true;
  } else if (
    /\b(?:ja recebi|recebi|recebido|recebida|caiu na conta|entrou|ja paguei|paguei|pago|paga|quitado|quitada|foi pago)\b/.test(
      norm
    )
  ) {
    status = 'paid';
    hasExplicitStatusHint = true;
  }

  return { flowType, status, hasExplicitStatusHint };
}

const KEYWORD_CATEGORY_SYNONYMS: {
  keywords: string[];
  rowHints: string[];
  block: 'income' | 'fixed' | 'variable' | 'savings';
}[] = [
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
    rowHints: ['lazer', 'alimentacao', 'restaurante', 'mercado'],
    block: 'variable',
  },
  {
    keywords: ['farmacia', 'remedio', 'consulta', 'exame', 'medico', 'dentista', 'saude'],
    rowHints: ['dentista', 'saude', 'farmacia'],
    block: 'variable',
  },
  {
    keywords: ['aluguel', 'condominio', 'iptu', 'moradia'],
    rowHints: ['aluguel', 'iptu', 'casa', 'moradia'],
    block: 'fixed',
  },
  {
    keywords: ['energia', 'luz', 'agua', 'internet', 'wifi', 'telefone', 'celular', 'plano', 'gas'],
    rowHints: ['internet', 'energia', 'agua', 'gas', 'celular', 'fixa'],
    block: 'fixed',
  },
  {
    keywords: ['spotify', 'netflix', 'assinatura', 'streaming'],
    rowHints: ['spotify', 'assinatura', 'streaming'],
    block: 'fixed',
  },
  {
    keywords: ['racao', 'pet', 'cachorro', 'dog'],
    rowHints: ['racao', 'pet'],
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
    rowHints: ['salario', '2pb', 'pizzaria', 'receita', 'entrada', 'extras'],
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

    const escaped = rNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(norm) || (rNorm.length >= 3 && norm.includes(rNorm))) {
      score += 12;
    } else {
      const tokens = rNorm.split(/[\s/+-]+/).filter((tk) => tk.length >= 2);
      tokens.forEach((tk) => {
        if (new RegExp(`\\b${tk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm)) {
          score += 5;
        }
      });
    }

    for (const group of KEYWORD_CATEGORY_SYNONYMS) {
      const matchedKeywords = group.keywords.filter((kw) => {
        const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escapedKw}\\b`).test(norm);
      }).length;
      if (matchedKeywords > 0 && group.rowHints.some((hint) => rNorm.includes(hint))) {
        score += 8 + matchedKeywords;
      }
    }

    // Reference day proximity tiebreaker (e.g. 2PB dia 15 vs 2PB dia 30)
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

function stripNoiseForDescription(text: string): string {
  return text
    .replace(/\b(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?(?:\s+e\s+\d{1,2})?\s*(?:reais|real|conto|contos|brl|centavos?)?\b/gi, ' ')
    .replace(/\b(?:e\s+)?\d{1,2}\s*centavos?\b/gi, ' ')
    .replace(/\b(?:no|na|via|em|com)\s+(?:pix|d[eé]bito|cr[eé]dito|dinheiro|esp[eé]cie|transfer[êe]ncia)\b/gi, ' ')
    .replace(/\b(?:cart[aã]o\s+de\s+(?:d[eé]bito|cr[eé]dito))\b/gi, ' ')
    .replace(
      /\b(?:em\s+)?(?:\d{1,2}|duas|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s*(?:x|vezes|parcelas?)\b/gi,
      ' '
    )
    .replace(
      /\bdia\s+(?:\d{1,2}|primeiro|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte(?:\s+e\s+\w+)?|trinta(?:\s+e\s+um)?)(?:\s+de\s+(?:janeiro|jan|fevereiro|fev|mar[çc]o|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez)(?:\s+de\s+\d{4})?)?\b/gi,
      ' '
    )
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, ' ')
    .replace(/\b(?:hoje|ontem|anteontem|amanh[ãa])\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMerchantAndDescription(
  raw: string,
  matchedRow: CategoryRow | null,
  flowType: 'income' | 'expense' | 'savings'
): { merchant: string; description: string } {
  const cleanRaw = raw.trim().replace(/\s+/g, ' ');
  if (!cleanRaw) {
    return {
      merchant: matchedRow?.name || 'Lançamento',
      description: matchedRow?.name || 'Lançamento',
    };
  }

  // Extract proximity / reference suffix (e.g. "próximo ao Campo Goytacazes")
  const proximityRegex =
    /\b((?:pr[oó]xim[oa]\s+(?:ao|a|[àa]|de|do|da)|perto\s+(?:do|da|de)|em\s+frente\s+(?:ao|a|[àa])|ao\s+lado\s+(?:do|da|de))[^,.]*)/i;
  const proximityMatch = cleanRaw.match(proximityRegex);
  const proximityNote = proximityMatch?.[1]
    ? stripNoiseForDescription(proximityMatch[1]).replace(/\s+/g, ' ').trim()
    : '';

  const rawWithoutProximity = proximityMatch
    ? cleanRaw.replace(proximityMatch[0], ' ').replace(/\s+/g, ' ').trim()
    : cleanRaw;

  // Extract explicit location / establishment clause ("no posto da GMC", "no mercado Assaí")
  const locationMatch = rawWithoutProximity.match(
    /\b(?:no|na|nos|nas|em)\s+((?:posto|mercado|supermercado|loja|restaurante|farm[áa]cia|padaria|academia|hospital|cl[íi]nica|oficina|shopping|bar|ponto|drogaria|hortifruti|a[çc]ougue)\b[^,.]*)/i
  );

  // Extract income payer ("pagamento 2PB", "pagamento da 2PB", "recebi da/do Leticia")
  const payerMatch = rawWithoutProximity.match(
    /\b(?:pagamento\s+(?:da|do|de)?\s*|recebi\s+(?:da|do|de)\s+)([A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ\s.-]{1,35}?)(?=\s+(?:de|no|na|dia|em|via|por|com|r\$|\d+[.,]?\d*)\b|$)/i
  );

  if (flowType === 'income' && payerMatch?.[1]) {
    const rawPayer = stripNoiseForDescription(payerMatch[1])
      .replace(/^(?:da|do|de)\s+/i, '')
      .trim();
    const merchant =
      matchedRow?.name && normalizeText(rawPayer).includes(normalizeText(matchedRow.name))
        ? matchedRow.name
        : capitalizeSentenceFragment(rawPayer) || matchedRow?.name || 'Recebimento';
    const hasPagamento = /\bpagamento\b/i.test(cleanRaw);
    const description = hasPagamento
      ? `Pagamento ${merchant}${proximityNote ? ` (${proximityNote})` : ''}`
      : `${merchant}${proximityNote ? ` (${proximityNote})` : ''}`;
    return {
      merchant,
      description,
    };
  }

  let merchant = '';
  if (locationMatch?.[1]) {
    merchant = stripNoiseForDescription(locationMatch[1])
      .replace(/\b(?:da|do|de)\s+(?=[A-Z0-9])/g, (m) => m) // keep natural "Posto da GMC" unless trivial
      .replace(/^(?:posto)\s+da\s+/i, 'Posto ')
      .trim();
    merchant = capitalizeSentenceFragment(merchant);
  }

  // Extract crisp action / subject before the location or value
  let actionSubject = '';
  const fuelSubject = rawWithoutProximity.match(
    /\b(?:abasteci|abastecimento)\s+(?:a|o|na|no|de)?\s*(moto|carro|ve[íi]culo|caminh[ãa]o)?/i
  );
  if (fuelSubject) {
    const vehicle = fuelSubject[1]?.toLowerCase();
    actionSubject = vehicle
      ? `Abastecimento ${vehicle === 'moto' ? 'da moto' : `do ${vehicle}`}`
      : 'Abastecimento';
  } else {
    const withoutPlace = locationMatch
      ? rawWithoutProximity.replace(locationMatch[0], ' ')
      : rawWithoutProximity;
    const strippedAction = stripNoiseForDescription(withoutPlace)
      .replace(/^(?:paguei|gastei|comprei|recebi|guardei|fiz)\s+(?:o|a|os|as|um|uma)?\s*/i, '')
      .replace(/\b(?:com|de|para|por)\s*$/i, '')
      .trim();
    if (strippedAction.length >= 3) {
      actionSubject = capitalizeSentenceFragment(strippedAction);
    }
  }

  if (merchant && actionSubject) {
    const sameEntity =
      normalizeText(actionSubject).includes(normalizeText(merchant)) ||
      normalizeText(merchant).includes(normalizeText(actionSubject));
    const core = sameEntity ? merchant : `${actionSubject} - ${merchant}`;
    return {
      merchant,
      description: proximityNote ? `${core} (${proximityNote})` : core,
    };
  }

  if (merchant) {
    return {
      merchant,
      description: proximityNote ? `${merchant} (${proximityNote})` : merchant,
    };
  }

  const fallbackMerchant =
    actionSubject.slice(0, 64) ||
    matchedRow?.name ||
    (flowType === 'income' ? 'Recebimento' : 'Lançamento');

  const fallbackDescription = actionSubject
    ? proximityNote
      ? `${actionSubject} (${proximityNote})`
      : actionSubject
    : capitalizeSentenceFragment(cleanRaw);

  return {
    merchant: fallbackMerchant,
    description: fallbackDescription || fallbackMerchant,
  };
}

export function parseVoiceTransaction(
  transcript: string,
  rows: CategoryRow[],
  focusMonth: number,
  referenceDate: Date = new Date(),
  defaultYear: number = referenceDate.getFullYear()
): ParsedVoiceEntry {
  const safeMonth = Math.min(11, Math.max(0, Math.trunc(focusMonth)));
  const safeYear = Number.isFinite(defaultYear) ? Math.trunc(defaultYear) : referenceDate.getFullYear();
  const raw = transcript.trim();
  const amount = parseAmountFromVoice(raw);
  const { flowType, status, hasExplicitStatusHint } = parseFlowAndStatus(raw);
  const { paymentMethod, hasExplicitPaymentMethod, isBoleto } = parsePaymentMethod(raw, flowType);
  const { day, month, year, foundExplicitDay, foundExplicitMonth, foundExplicitYear } =
    parseDayAndMonth(raw, safeMonth, safeYear, referenceDate);
  const inst = parseInstallments(raw);
  const matchedRow = matchCategoryRow(raw, rows, flowType, day);
  const { merchant, description } = extractMerchantAndDescription(raw, matchedRow, flowType);

  const hints: string[] = [];
  if (amount !== null) hints.push(`Valor R$ ${amount.toFixed(2).replace('.', ',')}`);
  if (matchedRow) hints.push(`Categoria: ${matchedRow.name}`);
  hints.push(
    isBoleto
      ? 'Boleto'
      : paymentMethod === 'pix'
      ? 'Via Pix'
      : paymentMethod === 'debit'
      ? 'Débito'
      : paymentMethod === 'credit'
      ? 'Crédito'
      : paymentMethod === 'cash'
      ? 'Dinheiro'
      : 'Transferência'
  );
  if (foundExplicitDay || foundExplicitYear) {
    hints.push(
      foundExplicitYear
        ? `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`
        : `Dia ${String(day).padStart(2, '0')}`
    );
  }
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
    hasExplicitPaymentMethod,
    isBoleto,
    day,
    month,
    year,
    foundExplicitDay,
    foundExplicitMonth,
    foundExplicitYear,
    status,
    hasExplicitStatusHint,
    matchedRowId: matchedRow?.id ?? null,
    matchedRowName: matchedRow?.name ?? null,
    merchant,
    description,
    installmentCurrent: inst.current,
    installmentTotal: inst.total,
    confidenceHints: hints,
  };
}
