/**
 * Estado compartilhado: período, papel e vendedor logado (mock).
 * O período aqui escopa TODOS os módulos — é o contrato do date-picker global.
 */

import { create } from 'zustand';
import type { Papel, Periodo, Vendedor } from '@/painel/types';
import { somarDias } from '@/lib/utils';
import { vendedores } from '@/painel/data/mock';

export type PresetPeriodo = 'hoje' | '7d' | '30d' | 'mes' | 'custom';

function calcular(preset: PresetPeriodo): Periodo {
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  switch (preset) {
    case 'hoje': return { de: hoje, ate: hoje };
    case '7d': return { de: somarDias(hoje, -6), ate: hoje };
    case 'mes': return { de: new Date(hoje.getFullYear(), hoje.getMonth(), 1, 12), ate: hoje };
    case '30d':
    default: return { de: somarDias(hoje, -29), ate: hoje };
  }
}

interface Estado {
  periodo: Periodo;
  preset: PresetPeriodo;
  papel: Papel;
  vendedorLogado: Vendedor;
  setPreset: (p: PresetPeriodo) => void;
  setPeriodoCustom: (de: Date, ate: Date) => void;
  setPapel: (p: Papel) => void;
  setVendedorLogado: (v: Vendedor) => void;
}

export const useFiltros = create<Estado>((set) => ({
  periodo: calcular('30d'),
  preset: '30d',
  papel: 'admin',
  vendedorLogado: vendedores[1], // Pedro Luca, para o modo vendedor não cair no top 1
  setPreset: (preset) => set({ preset, periodo: calcular(preset) }),
  setPeriodoCustom: (de, ate) => set({ preset: 'custom', periodo: { de, ate } }),
  setPapel: (papel) => set({ papel }),
  setVendedorLogado: (vendedorLogado) => set({ vendedorLogado }),
}));

/** Açúcar para as telas: `const admin = useEhAdmin()`. */
export const useEhAdmin = () => useFiltros((s) => s.papel === 'admin');
