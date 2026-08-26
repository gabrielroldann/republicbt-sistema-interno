import { create } from 'zustand';
import { aplicarTema, TEMAS, type IdTema, type Tema } from './temas';

const CHAVE = 'republicbt:tema';

/* O acesso a localStorage é protegido: em janela anônima do Safari a simples
   leitura lança, e uma exceção aqui derrubaria o app inteiro no boot. */
function inicial(): IdTema {
  try {
    const salvo = localStorage.getItem(CHAVE) as IdTema | null;
    return salvo && salvo in TEMAS ? salvo : 'navy';
  } catch {
    return 'navy';
  }
}

function guardar(id: IdTema) {
  try {
    localStorage.setItem(CHAVE, id);
  } catch {
    /* sem persistência: o tema vale só para esta sessão */
  }
}

interface Estado {
  id: IdTema;
  tema: Tema;
  setTema: (id: IdTema) => void;
}

export const useTema = create<Estado>((set) => ({
  id: inicial(),
  tema: TEMAS[inicial()],
  setTema: (id) => {
    aplicarTema(id);
    guardar(id);
    set({ id, tema: TEMAS[id] });
  },
}));

/** Chamado uma vez no boot, antes do primeiro render pintar. */
export function iniciarTema() {
  aplicarTema(useTema.getState().id);
}

/** Paleta de gráfico do tema atual — Recharts precisa de cor resolvida. */
export const useCoresGrafico = () => useTema((s) => s.tema.grafico);

/**
 * Cor de um token do tema já resolvida em `rgb(...)`.
 * Serve para o punhado de lugares que precisam de cor em atributo de SVG, onde
 * `var()` não vale — em CSS normal, use a classe do Tailwind.
 */
export function useCorToken(nome: string): string {
  return useTema((s) => {
    const v = s.tema.tokens[nome];
    return v ? `rgb(${v})` : 'currentColor';
  });
}
