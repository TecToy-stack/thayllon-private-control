export type BankCategory =
  | 'Bancos Tradicionais'
  | 'Digitais & Fintechs'
  | 'Cooperativas'
  | 'Cartões / Contas Internacionais';

export const BANK_CATEGORIES: BankCategory[] = [
  'Bancos Tradicionais',
  'Digitais & Fintechs',
  'Cooperativas',
  'Cartões / Contas Internacionais',
];

export interface BrazilianBankEntry {
  id: string;
  name: string;
  shortName: string;
  code: string;
  ispb: string;
  category: BankCategory;
  color: string;
}

export const BRAZILIAN_BANKS: BrazilianBankEntry[] = [
  // Bancos Tradicionais
  { id: 'bb', name: 'Banco do Brasil', shortName: 'Banco do Brasil', code: '001', ispb: '00000000', category: 'Bancos Tradicionais', color: '#EAB308' },
  { id: 'santander', name: 'Santander', shortName: 'Santander', code: '033', ispb: '90400888', category: 'Bancos Tradicionais', color: '#DC2626' },
  { id: 'caixa', name: 'Caixa Econômica Federal', shortName: 'Caixa', code: '104', ispb: '00360305', category: 'Bancos Tradicionais', color: '#1D4ED8' },
  { id: 'bradesco', name: 'Bradesco', shortName: 'Bradesco', code: '237', ispb: '60746948', category: 'Bancos Tradicionais', color: '#E11D48' },
  { id: 'itau', name: 'Itaú', shortName: 'Itaú', code: '341', ispb: '60701190', category: 'Bancos Tradicionais', color: '#EA580C' },
  { id: 'banrisul', name: 'Banrisul', shortName: 'Banrisul', code: '041', ispb: '92702067', category: 'Bancos Tradicionais', color: '#2563EB' },
  { id: 'safra', name: 'Safra', shortName: 'Safra', code: '422', ispb: '58160789', category: 'Bancos Tradicionais', color: '#B45309' },
  { id: 'bmg', name: 'BMG', shortName: 'BMG', code: '318', ispb: '61186680', category: 'Bancos Tradicionais', color: '#F97316' },
  { id: 'brb', name: 'BRB (Banco de Brasília)', shortName: 'BRB', code: '070', ispb: '00000208', category: 'Bancos Tradicionais', color: '#1E40AF' },
  { id: 'mercantil', name: 'Mercantil do Brasil', shortName: 'Mercantil', code: '389', ispb: '17184037', category: 'Bancos Tradicionais', color: '#0369A1' },
  { id: 'daycoval', name: 'Daycoval', shortName: 'Daycoval', code: '707', ispb: '62232889', category: 'Bancos Tradicionais', color: '#0F766E' },
  { id: 'alfa', name: 'Banco Alfa', shortName: 'Alfa', code: '025', ispb: '60770336', category: 'Bancos Tradicionais', color: '#4338CA' },
  { id: 'pine', name: 'Banco Pine', shortName: 'Pine', code: '643', ispb: '62144175', category: 'Bancos Tradicionais', color: '#15803D' },
  { id: 'rendimento', name: 'Banco Rendimento', shortName: 'Rendimento', code: '633', ispb: '68900810', category: 'Bancos Tradicionais', color: '#475569' },
  { id: 'abc', name: 'Banco ABC Brasil', shortName: 'ABC Brasil', code: '246', ispb: '28195667', category: 'Bancos Tradicionais', color: '#0F172A' },
  { id: 'bv', name: 'Votorantim (BV)', shortName: 'Banco BV', code: '655', ispb: '59588111', category: 'Bancos Tradicionais', color: '#1D4ED8' },
  { id: 'banestes', name: 'Banestes', shortName: 'Banestes', code: '021', ispb: '28127603', category: 'Bancos Tradicionais', color: '#0284C7' },
  { id: 'bnb', name: 'Banco do Nordeste (BNB)', shortName: 'BNB', code: '004', ispb: '07237373', category: 'Bancos Tradicionais', color: '#991B1B' },
  { id: 'banpara', name: 'Banpará', shortName: 'Banpará', code: '037', ispb: '04913711', category: 'Bancos Tradicionais', color: '#2563EB' },

  // Digitais & Fintechs
  { id: 'nubank', name: 'Nubank', shortName: 'Nubank', code: '260', ispb: '18236120', category: 'Digitais & Fintechs', color: '#820AD1' },
  { id: 'mercadopago', name: 'Mercado Pago', shortName: 'Mercado Pago', code: '323', ispb: '10573521', category: 'Digitais & Fintechs', color: '#009EE3' },
  { id: 'inter', name: 'Banco Inter', shortName: 'Inter', code: '077', ispb: '00416968', category: 'Digitais & Fintechs', color: '#FF7A00' },
  { id: 'c6', name: 'C6 Bank', shortName: 'C6 Bank', code: '336', ispb: '31872495', category: 'Digitais & Fintechs', color: '#334155' },
  { id: 'btg', name: 'BTG Pactual', shortName: 'BTG Pactual', code: '208', ispb: '30306294', category: 'Digitais & Fintechs', color: '#1E3A8A' },
  { id: 'xp', name: 'XP Investimentos', shortName: 'XP', code: '348', ispb: '33264668', category: 'Digitais & Fintechs', color: '#18181B' },
  { id: 'original', name: 'Banco Original', shortName: 'Original', code: '212', ispb: '92894922', category: 'Digitais & Fintechs', color: '#16A34A' },
  { id: 'pan', name: 'Banco PAN', shortName: 'Pan', code: '623', ispb: '59285411', category: 'Digitais & Fintechs', color: '#0EA5E9' },
  { id: 'digio', name: 'Digio', shortName: 'Digio', code: '335', ispb: '27098060', category: 'Digitais & Fintechs', color: '#2563EB' },
  { id: 'neon', name: 'Neon', shortName: 'Neon', code: '735', ispb: '20855875', category: 'Digitais & Fintechs', color: '#06B6D4' },
  { id: 'picpay', name: 'PicPay', shortName: 'PicPay', code: '380', ispb: '22896431', category: 'Digitais & Fintechs', color: '#10B981' },
  { id: 'willbank', name: 'Will Bank', shortName: 'Will Bank', code: '280', ispb: '36272465', category: 'Digitais & Fintechs', color: '#CA8A04' },
  { id: 'sofisa', name: 'Sofisa Direto', shortName: 'Sofisa Direto', code: '637', ispb: '60889128', category: 'Digitais & Fintechs', color: '#BE123C' },
  { id: 'pagbank', name: 'PagBank (PagSeguro)', shortName: 'PagBank', code: '290', ispb: '08561701', category: 'Digitais & Fintechs', color: '#16A34A' },
  { id: 'stone', name: 'Stone / Ton', shortName: 'Stone / Ton', code: '197', ispb: '16501555', category: 'Digitais & Fintechs', color: '#059669' },
  { id: 'infinitepay', name: 'InfinitePay', shortName: 'InfinitePay', code: '461', ispb: '19540550', category: 'Digitais & Fintechs', color: '#0284C7' },
  { id: 'cora', name: 'Cora', shortName: 'Cora', code: '403', ispb: '37880206', category: 'Digitais & Fintechs', color: '#FB7185' },
  { id: 'next', name: 'Next', shortName: 'Next', code: '237', ispb: '60746948', category: 'Digitais & Fintechs', color: '#10B981' },
  { id: 'agibank', name: 'Agibank', shortName: 'Agibank', code: '121', ispb: '10664513', category: 'Digitais & Fintechs', color: '#3B82F6' },
  { id: 'bs2', name: 'Banco BS2', shortName: 'BS2', code: '218', ispb: '71027866', category: 'Digitais & Fintechs', color: '#0F172A' },
  { id: 'rico', name: 'Rico Investimentos', shortName: 'Rico', code: '102', ispb: '02332886', category: 'Digitais & Fintechs', color: '#EA580C' },
  { id: 'genial', name: 'Banco Genial', shortName: 'Genial', code: '125', ispb: '45246410', category: 'Digitais & Fintechs', color: '#1E293B' },
  { id: 'efi', name: 'Efí Bank', shortName: 'Efí Bank', code: '364', ispb: '09089356', category: 'Digitais & Fintechs', color: '#D97706' },

  // Cooperativas
  { id: 'sicredi', name: 'Sicredi', shortName: 'Sicredi', code: '748', ispb: '01181521', category: 'Cooperativas', color: '#15803D' },
  { id: 'sicoob', name: 'Sicoob', shortName: 'Sicoob', code: '756', ispb: '02038232', category: 'Cooperativas', color: '#047857' },
  { id: 'unicred', name: 'Unicred', shortName: 'Unicred', code: '136', ispb: '00315557', category: 'Cooperativas', color: '#065F46' },
  { id: 'ailos', name: 'Ailos (Viacredi)', shortName: 'Ailos', code: '085', ispb: '05463212', category: 'Cooperativas', color: '#0284C7' },

  // Cartões / Contas Internacionais
  { id: 'wise', name: 'Wise', shortName: 'Wise', code: 'INT', ispb: '00000001', category: 'Cartões / Contas Internacionais', color: '#059669' },
  { id: 'nomad', name: 'Nomad', shortName: 'Nomad', code: 'INT', ispb: '00000002', category: 'Cartões / Contas Internacionais', color: '#D97706' },
  { id: 'revolut', name: 'Revolut', shortName: 'Revolut', code: 'INT', ispb: '00000003', category: 'Cartões / Contas Internacionais', color: '#2563EB' },
  { id: 'avenue', name: 'Avenue Banking', shortName: 'Avenue', code: 'INT', ispb: '00000004', category: 'Cartões / Contas Internacionais', color: '#4F46E5' },
  { id: 'inter-global', name: 'Inter Global Account', shortName: 'Inter Global', code: '077', ispb: '00416968', category: 'Cartões / Contas Internacionais', color: '#EA580C' },
];

const FALLBACK_BANK_COLORS = [
  '#2563EB',
  '#4F46E5',
  '#059669',
  '#0EA5E9',
  '#7C3AED',
  '#D97706',
  '#DC2626',
  '#0F766E',
];

export function resolveBankVisual(name: string): { color: string; shortName: string } {
  const trimmed = name.trim();
  const normalized = trimmed.toLowerCase();
  const match = BRAZILIAN_BANKS.find(
    (b) =>
      b.name.toLowerCase() === normalized ||
      b.shortName.toLowerCase() === normalized ||
      b.id === normalized
  );
  if (match) {
    return { color: match.color, shortName: match.shortName };
  }
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return {
    color: FALLBACK_BANK_COLORS[hash % FALLBACK_BANK_COLORS.length],
    shortName: trimmed || 'Banco',
  };
}
