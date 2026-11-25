import React, { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import {
  BANK_CATEGORIES,
  BankCategory,
  BRAZILIAN_BANKS,
  BrazilianBankEntry,
  resolveBankVisual,
} from '../data/brazilBanks';

export interface BankSelectionValue {
  bankId: string;
  bankName: string;
  bankColor: string;
  bankCategory: string;
  bankCode: string;
}

interface BankSelectorFieldProps {
  value: BankSelectionValue;
  onChange: (next: BankSelectionValue) => void;
  label?: string;
}

export const BankSelectorField: React.FC<BankSelectorFieldProps> = ({
  value,
  onChange,
  label = 'Banco / Instituição Financeira',
}) => {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<BankCategory | 'Todas'>('Todas');

  const filteredBanks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BRAZILIAN_BANKS.filter((bank) => {
      if (categoryFilter !== 'Todas' && bank.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        bank.name.toLowerCase().includes(q) ||
        bank.shortName.toLowerCase().includes(q) ||
        bank.code.toLowerCase().includes(q) ||
        bank.category.toLowerCase().includes(q)
      );
    });
  }, [query, categoryFilter]);

  const trimmedQuery = query.trim();
  const hasExactCatalogMatch = useMemo(() => {
    if (!trimmedQuery) return true;
    const q = trimmedQuery.toLowerCase();
    return BRAZILIAN_BANKS.some(
      (b) => b.name.toLowerCase() === q || b.shortName.toLowerCase() === q
    );
  }, [trimmedQuery]);

  const handleSelectBank = (bank: BrazilianBankEntry) => {
    onChange({
      bankId: bank.id,
      bankName: bank.name,
      bankColor: bank.color,
      bankCategory: bank.category,
      bankCode: bank.code,
    });
  };

  const handleUseCustomName = () => {
    if (!trimmedQuery) return;
    const visual = resolveBankVisual(trimmedQuery);
    onChange({
      bankId: `custom-${trimmedQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      bankName: trimmedQuery,
      bankColor: visual.color,
      bankCategory: 'Instituição Informada',
      bankCode: '000',
    });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          {label}
        </label>
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: value.bankColor }}
          />
          <span className="truncate max-w-[180px]">{value.bankName}</span>
        </div>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar banco (Nubank, Itaú, Bradesco, Wise, Sicredi...) ou digitar nome"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {(['Todas', ...BANK_CATEGORIES] as const).map((cat) => {
          const active = categoryFilter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-50 dark:bg-[#0D1320] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.08] hover:border-blue-400'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Custom bank shortcut when typed bank is not an exact match */}
      {trimmedQuery.length >= 2 && !hasExactCatalogMatch && (
        <button
          type="button"
          onClick={handleUseCustomName}
          className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100/70 dark:hover:bg-blue-950/50 transition-colors"
        >
          Usar banco digitado: "{trimmedQuery}"
        </button>
      )}

      {/* Bank Grid */}
      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#0D1320] p-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {filteredBanks.length === 0 ? (
          <div className="col-span-full py-4 px-3 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhum banco no catálogo com "{query}". Clique no botão acima para cadastrar com o nome digitado.
          </div>
        ) : (
          filteredBanks.map((bank) => {
            const isSelected = value.bankId === bank.id || value.bankName === bank.name;
            return (
              <button
                key={bank.id}
                type="button"
                onClick={() => handleSelectBank(bank)}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors border ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-200 border-slate-200/80 dark:border-white/[0.06] hover:border-blue-400'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 border border-white/50"
                    style={{ backgroundColor: bank.color }}
                  />
                  <span className="font-medium truncate">{bank.name}</span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {bank.code !== 'INT' && (
                    <span
                      className={`text-[10px] font-mono tabular-nums ${
                        isSelected ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {bank.code}
                    </span>
                  )}
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
