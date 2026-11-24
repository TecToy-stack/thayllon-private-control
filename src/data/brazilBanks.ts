export type BankCategory = 'Tradicional' | 'Digital' | 'Cooperativa' | 'Corretora / Pagamentos';

export interface BrazilianBankEntry {
  id: string;
  name: string;
  shortName: string;
  code: string; // COMPE 3-digit code
  ispb: string;
  category: BankCategory;
  color: string;
  pluggyConnectorName?: string;
  belvoInstitutionCode?: string;
}

export const BRAZILIAN_BANKS: BrazilianBankEntry[] = [
  { id: 'bb', name: 'Banco do Brasil', shortName: 'BB', code: '001', ispb: '00000000', category: 'Tradicional', color: '#FACC15', belvoInstitutionCode: 'bancodobrasil_br_retail' },
  { id: 'santander', name: 'Banco Santander (Brasil)', shortName: 'Santander', code: '033', ispb: '90400888', category: 'Tradicional', color: '#DC2626', belvoInstitutionCode: 'santander_br_retail' },
  { id: 'caixa', name: 'Caixa Econômica Federal', shortName: 'Caixa', code: '104', ispb: '00360305', category: 'Tradicional', color: '#1D4ED8', belvoInstitutionCode: 'caixa_br_retail' },
  { id: 'bradesco', name: 'Banco Bradesco', shortName: 'Bradesco', code: '237', ispb: '60746948', category: 'Tradicional', color: '#E11D48', belvoInstitutionCode: 'bradesco_br_retail' },
  { id: 'itau', name: 'Itaú Unibanco', shortName: 'Itaú', code: '341', ispb: '60701190', category: 'Tradicional', color: '#EA580C', belvoInstitutionCode: 'itau_br_retail' },
  { id: 'nubank', name: 'Nu Pagamentos (Nubank)', shortName: 'Nubank', code: '260', ispb: '18236120', category: 'Digital', color: '#820AD1', belvoInstitutionCode: 'nubank_br_retail' },
  { id: 'inter', name: 'Banco Inter', shortName: 'Inter', code: '077', ispb: '00416968', category: 'Digital', color: '#FF7A00', belvoInstitutionCode: 'inter_br_retail' },
  { id: 'btg', name: 'BTG Pactual', shortName: 'BTG Pactual', code: '208', ispb: '30306294', category: 'Corretora / Pagamentos', color: '#0F172A', belvoInstitutionCode: 'btg_br_retail' },
  { id: 'c6', name: 'Banco C6', shortName: 'C6 Bank', code: '336', ispb: '31872495', category: 'Digital', color: '#1E293B', belvoInstitutionCode: 'c6_br_retail' },
  { id: 'mercadopago', name: 'Mercado Pago', shortName: 'Mercado Pago', code: '323', ispb: '10573521', category: 'Corretora / Pagamentos', color: '#009EE3', belvoInstitutionCode: 'mercadopago_br_retail' },
  { id: 'pagbank', name: 'PagBank (PagSeguro)', shortName: 'PagBank', code: '290', ispb: '08561701', category: 'Corretora / Pagamentos', color: '#16A34A' },
  { id: 'picpay', name: 'PicPay Bank', shortName: 'PicPay', code: '380', ispb: '22896431', category: 'Corretora / Pagamentos', color: '#10B981' },
  { id: 'neon', name: 'Banco Neon', shortName: 'Neon', code: '735', ispb: '20855875', category: 'Digital', color: '#06B6D4' },
  { id: 'next', name: 'Next (Bradesco Digital)', shortName: 'Next', code: '237', ispb: '60746948', category: 'Digital', color: '#00FF5F' },
  { id: 'sicredi', name: 'Sicredi (Cooperativa)', shortName: 'Sicredi', code: '748', ispb: '01181521', category: 'Cooperativa', color: '#15803D' },
  { id: 'sicoob', name: 'Sicoob (Bancoob)', shortName: 'Sicoob', code: '756', ispb: '02038232', category: 'Cooperativa', color: '#065F46' },
  { id: 'unicred', name: 'Unicred', shortName: 'Unicred', code: '136', ispb: '00315557', category: 'Cooperativa', color: '#047857' },
  { id: 'ailos', name: 'Ailos (Viacredi)', shortName: 'Ailos', code: '085', ispb: '05463212', category: 'Cooperativa', color: '#0284C7' },
  { id: 'banrisul', name: 'Banrisul', shortName: 'Banrisul', code: '041', ispb: '92702067', category: 'Tradicional', color: '#2563EB' },
  { id: 'safra', name: 'Banco Safra', shortName: 'Safra', code: '422', ispb: '58160789', category: 'Tradicional', color: '#B45309' },
  { id: 'original', name: 'Banco Original', shortName: 'Original', code: '212', ispb: '92894922', category: 'Digital', color: '#16A34A' },
  { id: 'pan', name: 'Banco PAN', shortName: 'Banco PAN', code: '623', ispb: '59285411', category: 'Digital', color: '#0EA5E9' },
  { id: 'bmg', name: 'Banco BMG', shortName: 'BMG', code: '318', ispb: '61186680', category: 'Tradicional', color: '#F97316' },
  { id: 'xp', name: 'Banco XP / XP Investimentos', shortName: 'XP', code: '348', ispb: '33264668', category: 'Corretora / Pagamentos', color: '#18181B' },
  { id: 'stone', name: 'Stone Pagamentos', shortName: 'Stone', code: '197', ispb: '16501555', category: 'Corretora / Pagamentos', color: '#00A868' },
  { id: 'cora', name: 'Banco Cora', shortName: 'Cora', code: '403', ispb: '37880206', category: 'Digital', color: '#FB7185' },
  { id: 'brb', name: 'BRB - Banco de Brasília', shortName: 'BRB', code: '070', ispb: '00000208', category: 'Tradicional', color: '#1E40AF' },
  { id: 'banestes', name: 'Banestes', shortName: 'Banestes', code: '021', ispb: '28127603', category: 'Tradicional', color: '#0369A1' },
  { id: 'bnb', name: 'Banco do Nordeste (BNB)', shortName: 'BNB', code: '004', ispb: '07237373', category: 'Tradicional', color: '#991B1B' },
  { id: 'banpara', name: 'Banpará', shortName: 'Banpará', code: '037', ispb: '04913711', category: 'Tradicional', color: '#1D4ED8' },
  { id: 'agibank', name: 'Banco Agibank', shortName: 'Agibank', code: '121', ispb: '10664513', category: 'Digital', color: '#2563EB' },
  { id: 'bv', name: 'Banco BV (Votorantim)', shortName: 'BV', code: '655', ispb: '59588111', category: 'Tradicional', color: '#1E3A8A' },
  { id: 'daycoval', name: 'Banco Daycoval', shortName: 'Daycoval', code: '707', ispb: '62232889', category: 'Tradicional', color: '#0F766E' },
  { id: 'willbank', name: 'Will Bank', shortName: 'Will Bank', code: '280', ispb: '36272465', category: 'Digital', color: '#EAB308' },
  { id: 'sofisa', name: 'Banco Sofisa Direto', shortName: 'Sofisa Direto', code: '637', ispb: '60889128', category: 'Digital', color: '#BE123C' },
  { id: 'bs2', name: 'Banco BS2', shortName: 'BS2', code: '218', ispb: '71027866', category: 'Digital', color: '#0F172A' },
  { id: 'rico', name: 'Rico Investimentos', shortName: 'Rico', code: '102', ispb: '02332886', category: 'Corretora / Pagamentos', color: '#F97316' },
  { id: 'genial', name: 'Banco Genial', shortName: 'Genial', code: '125', ispb: '45246410', category: 'Corretora / Pagamentos', color: '#1E293B' },
  { id: 'nubank-pj', name: 'Nu Conta PJ', shortName: 'Nubank PJ', code: '260', ispb: '18236120', category: 'Digital', color: '#9333EA' },
  { id: 'asaas', name: 'Asaas IP', shortName: 'Asaas', code: '461', ispb: '19540550', category: 'Corretora / Pagamentos', color: '#2563EB' },
  { id: 'efi', name: 'Efí Bank (Gerencianet)', shortName: 'Efí Bank', code: '364', ispb: '09089356', category: 'Corretora / Pagamentos', color: '#F59E0B' },
];
