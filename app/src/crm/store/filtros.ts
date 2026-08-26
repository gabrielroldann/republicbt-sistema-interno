import { create } from 'zustand';

/**
 * Estado de TELA do CRM — não de sessão.
 *
 * `soMeus` é um filtro do funil e `vendedorId` só existe em modo demonstração,
 * para conferir a visão de cada vendedor sem login. Quando os dois apps eram
 * separados, isso morava junto com a sessão; num sistema só, misturar
 * preferência de tela com identidade seria convidar confusão — a sessão diz
 * QUEM é a pessoa, e isso o RLS usa; isto aqui é só o que a tela está filtrando
 * no momento.
 */
interface FiltrosCrm {
  /** filtro "só os meus" do funil */
  soMeus: boolean;
  setSoMeus: (v: boolean) => void;

  /**
   * Vendedor escolhido à mão, só em modo demonstração.
   *
   * Vazio quando há login de verdade: aí quem manda é a sessão, e trocar de
   * vendedor por um seletor seria mentira — o RLS decide pelo usuário
   * autenticado e os dados continuariam sendo os mesmos.
   */
  vendedorDemo: string;
  setVendedorDemo: (id: string) => void;
}

export const useFiltrosCrm = create<FiltrosCrm>((set) => ({
  soMeus: false,
  setSoMeus: (soMeus) => set({ soMeus }),
  vendedorDemo: 'v1',
  setVendedorDemo: (vendedorDemo) => set({ vendedorDemo }),
}));
