import React from 'react';
import {
  Briefcase,
  Car,
  CreditCard,
  Fuel,
  Gamepad2,
  HeartPulse,
  Home,
  Landmark,
  PawPrint,
  PiggyBank,
  Receipt,
  ShoppingCart,
  Sparkles,
  Tag,
  Utensils,
  Wallet,
  Wifi,
  Zap,
  LucideIcon,
} from 'lucide-react';
import { BlockType, CategoryRow } from '../types/finance';

export const CATEGORY_COLOR_PALETTE: { value: string; label: string }[] = [
  { value: '#10B981', label: 'Esmeralda' },
  { value: '#2563EB', label: 'Azul' },
  { value: '#6366F1', label: 'Índigo' },
  { value: '#8B5CF6', label: 'Violeta' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#EF4444', label: 'Vermelho' },
  { value: '#F97316', label: 'Laranja' },
  { value: '#D97706', label: 'Âmbar' },
  { value: '#14B8A6', label: 'Turquesa' },
  { value: '#0EA5E9', label: 'Ciano' },
  { value: '#C9A86A', label: 'Ouro' },
  { value: '#64748B', label: 'Ardósia' },
];

export type CategoryIconKey =
  | 'wallet'
  | 'briefcase'
  | 'home'
  | 'car'
  | 'fuel'
  | 'shopping-cart'
  | 'utensils'
  | 'zap'
  | 'wifi'
  | 'heart-pulse'
  | 'credit-card'
  | 'piggy-bank'
  | 'gamepad'
  | 'paw'
  | 'receipt'
  | 'landmark'
  | 'sparkles'
  | 'tag';

export const CATEGORY_ICON_OPTIONS: {
  key: CategoryIconKey;
  label: string;
  Icon: LucideIcon;
}[] = [
  { key: 'tag', label: 'Etiqueta', Icon: Tag },
  { key: 'wallet', label: 'Carteira', Icon: Wallet },
  { key: 'briefcase', label: 'Trabalho', Icon: Briefcase },
  { key: 'shopping-cart', label: 'Mercado', Icon: ShoppingCart },
  { key: 'utensils', label: 'Alimentação', Icon: Utensils },
  { key: 'home', label: 'Casa', Icon: Home },
  { key: 'car', label: 'Transporte', Icon: Car },
  { key: 'fuel', label: 'Combustível', Icon: Fuel },
  { key: 'zap', label: 'Energia', Icon: Zap },
  { key: 'wifi', label: 'Internet', Icon: Wifi },
  { key: 'credit-card', label: 'Cartão', Icon: CreditCard },
  { key: 'piggy-bank', label: 'Caixinha', Icon: PiggyBank },
  { key: 'heart-pulse', label: 'Saúde', Icon: HeartPulse },
  { key: 'gamepad', label: 'Lazer', Icon: Gamepad2 },
  { key: 'paw', label: 'Pet', Icon: PawPrint },
  { key: 'receipt', label: 'Conta', Icon: Receipt },
  { key: 'landmark', label: 'Banco', Icon: Landmark },
  { key: 'sparkles', label: 'Extra', Icon: Sparkles },
];

const ICON_MAP = new Map<string, LucideIcon>(
  CATEGORY_ICON_OPTIONS.map((opt) => [opt.key, opt.Icon])
);

export function getDefaultCategoryColor(block: BlockType, idOrName = ''): string {
  const norm = idOrName.toLowerCase();
  if (block === 'income') return '#10B981';
  if (block === 'savings') return '#2563EB';
  if (norm.includes('cartao') || norm.includes('cartão')) return '#6366F1';
  if (norm.includes('mercado')) return '#D97706';
  if (norm.includes('combust') || norm.includes('moto')) return '#F97316';
  if (norm.includes('lazer')) return '#EC4899';
  if (norm.includes('energia') || norm.includes('gas') || norm.includes('gás')) return '#0EA5E9';
  if (norm.includes('aluguel') || norm.includes('iptu')) return '#64748B';
  return block === 'fixed' ? '#475569' : '#2563EB';
}

export function getDefaultCategoryIcon(block: BlockType, idOrName = ''): CategoryIconKey {
  const norm = idOrName.toLowerCase();
  if (block === 'savings' || norm.includes('guardad') || norm.includes('caixinha')) return 'piggy-bank';
  if (block === 'income') {
    if (norm.includes('caixa')) return 'landmark';
    if (norm.includes('extra')) return 'sparkles';
    return 'wallet';
  }
  if (norm.includes('aluguel') || norm.includes('iptu')) return 'home';
  if (norm.includes('combust') || norm.includes('ipva')) return 'fuel';
  if (norm.includes('moto') || norm.includes('carro')) return 'car';
  if (norm.includes('internet')) return 'wifi';
  if (norm.includes('energia') || norm.includes('agua') || norm.includes('água') || norm.includes('gas') || norm.includes('gás')) return 'zap';
  if (norm.includes('dentist') || norm.includes('saude') || norm.includes('farm')) return 'heart-pulse';
  if (norm.includes('racao') || norm.includes('ração') || norm.includes('pet')) return 'paw';
  if (norm.includes('cartao') || norm.includes('cartão')) return 'credit-card';
  if (norm.includes('mercado')) return 'shopping-cart';
  if (norm.includes('lazer') || norm.includes('spotify')) return 'gamepad';
  if (block === 'fixed') return 'receipt';
  return 'tag';
}

export function getCategoryVisual(row?: Pick<CategoryRow, 'id' | 'name' | 'block' | 'color' | 'icon'> | null): {
  color: string;
  iconKey: CategoryIconKey;
  Icon: LucideIcon;
} {
  if (!row) {
    return { color: '#64748B', iconKey: 'tag', Icon: Tag };
  }
  const color = row.color || getDefaultCategoryColor(row.block, `${row.id} ${row.name}`);
  const fallbackIcon = getDefaultCategoryIcon(row.block, `${row.id} ${row.name}`);
  const iconKey = (row.icon && ICON_MAP.has(row.icon) ? row.icon : fallbackIcon) as CategoryIconKey;
  const Icon = ICON_MAP.get(iconKey) ?? Tag;
  return { color, iconKey, Icon };
}

interface CategoryIconBadgeProps {
  row?: Pick<CategoryRow, 'id' | 'name' | 'block' | 'color' | 'icon'> | null;
  size?: 'xs' | 'sm' | 'md';
}

export const CategoryIconBadge: React.FC<CategoryIconBadgeProps> = ({ row, size = 'sm' }) => {
  const { color, Icon } = getCategoryVisual(row);
  const boxSize =
    size === 'xs'
      ? 'h-5 w-5 rounded-md'
      : size === 'md'
      ? 'h-8 w-8 rounded-xl'
      : 'h-6 w-6 rounded-lg';
  const iconSize = size === 'xs' ? 'h-3 w-3' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${boxSize}`}
      style={{
        backgroundColor: `${color}1F`,
        color,
      }}
      aria-hidden="true"
    >
      <Icon className={iconSize} />
    </span>
  );
};

interface CategoryVisualPickerProps {
  color: string;
  icon: string;
  onChangeColor: (nextColor: string) => void;
  onChangeIcon: (nextIcon: CategoryIconKey) => void;
  compact?: boolean;
}

export const CategoryVisualPicker: React.FC<CategoryVisualPickerProps> = ({
  color,
  icon,
  onChangeColor,
  onChangeIcon,
  compact = false,
}) => {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Cor da categoria
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORY_COLOR_PALETTE.map((c) => {
            const active = color.toLowerCase() === c.value.toLowerCase();
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => onChangeColor(c.value)}
                title={c.label}
                aria-label={`Cor ${c.label}`}
                className={`h-6 w-6 rounded-full transition-transform ${
                  active
                    ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-[#111827] scale-110'
                    : 'hover:scale-105 opacity-85 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.value }}
              />
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Ícone
        </div>
        <div className={`grid gap-1.5 ${compact ? 'grid-cols-6' : 'grid-cols-6 sm:grid-cols-9'}`}>
          {CATEGORY_ICON_OPTIONS.map((opt) => {
            const IconComp = opt.Icon;
            const active = icon === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onChangeIcon(opt.key)}
                title={opt.label}
                aria-label={`Ícone ${opt.label}`}
                className={`h-8 rounded-lg flex items-center justify-center border transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300'
                    : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0D1320] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                style={active ? { borderColor: color, color, backgroundColor: `${color}1A` } : undefined}
              >
                <IconComp className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
