/**
 * TEMAS.
 *
 * As cores do app são variáveis CSS em canais RGB (`5 15 38`), não hex. Isso
 * permite dois ganhos ao mesmo tempo:
 *   1. trocar o tema em runtime, sem rebuild;
 *   2. continuar usando os modificadores de opacidade do Tailwind
 *      (`bg-elev/60`, `bg-gold-400/15`), que exigem canais separados.
 *
 * Cores de fundo suave e de borda semântica (`*-soft`, `*-line`) ficam como
 * rgba pronta — nunca recebem modificador de opacidade.
 *
 * O tema Navy também vive em `src/index.css` como `:root`, para o primeiro
 * quadro já pintar certo antes de o JavaScript rodar.
 */

export type IdTema = 'navy' | 'dark' | 'light';

export interface Tema {
  id: IdTema;
  nome: string;
  descricao: string;
  esquema: 'dark' | 'light';
  /** amostras exibidas no seletor */
  amostras: string[];
  tokens: Record<string, string>;
  /**
   * Paleta dos gráficos. Recharts grava a cor como atributo de apresentação do
   * SVG, onde `var()` não é confiável — por isso aqui a cor já vem em hex.
   */
  grafico: {
    /** série principal */
    serie: string;
    /** mesma série em tom claro: último mês, linha secundária */
    serieClara: string;
    /** chama atenção dentro do gráfico (mês acima do limite do Simples) */
    destaque: string;
    positivo: string;
    negativo: string;
    /** categoria sem cor própria */
    neutro: string;
    grade: string;
    eixo: string;
    /** faixa de hover atrás da barra */
    cursor: string;
  };
}

const semanticasEscuras = {
  '--c-positive': '52 211 153',
  '--c-negative': '251 113 133',
  '--c-attention': '251 146 60',
  '--c-info': '96 165 250',
  '--c-positive-soft': 'rgba(52,211,153,0.14)',
  '--c-positive-line': 'rgba(52,211,153,0.32)',
  '--c-negative-soft': 'rgba(251,113,133,0.14)',
  '--c-negative-line': 'rgba(251,113,133,0.32)',
  '--c-attention-soft': 'rgba(251,146,60,0.14)',
  '--c-attention-line': 'rgba(251,146,60,0.32)',
  '--c-info-soft': 'rgba(96,165,250,0.14)',
  '--c-info-line': 'rgba(96,165,250,0.32)',
};

const sombrasEscuras = {
  '--sombra-painel': '0 1px 0 0 rgba(255,255,255,0.03), 0 8px 24px -12px rgba(0,0,0,0.55)',
  '--sombra-flutuante': '0 16px 48px -16px rgba(0,0,0,0.7)',
};

/* ---------------------------------------------------------------- NAVY --- */

const navy: Tema = {
  id: 'navy',
  nome: 'Navy',
  descricao: 'O navy da logo como fundo. A marca presente na interface inteira.',
  esquema: 'dark',
  amostras: ['#050F26', '#0B2050', '#103065', '#D9A441'],
  tokens: {
    '--c-surface': '3 9 26',
    '--c-app': '5 15 38',
    '--c-card': '11 32 80',
    '--c-elev': '16 48 101',
    '--c-elev-2': '22 64 127',

    '--c-line': '27 55 104',
    '--c-line-soft': '18 43 84',
    '--c-line-strong': '38 80 143',

    '--c-ink': '255 255 255',
    '--c-ink-2': '200 214 238',
    '--c-muted': '140 163 203',
    '--c-faint': '97 124 172',

    '--c-gold-200': '242 216 148',
    '--c-gold-300': '233 200 122',
    '--c-gold-400': '217 164 65',
    '--c-gold-500': '188 138 44',
    '--c-gold-600': '149 104 31',
    '--c-ongold': '5 15 38',

    '--c-navy-100': '216 225 241',
    '--c-navy-200': '176 194 226',
    '--c-navy-300': '140 163 203',
    '--c-navy-500': '43 77 151',
    '--c-navy-600': '14 42 94',
    '--c-navy-700': '30 66 133',

    ...semanticasEscuras,
    ...sombrasEscuras,
  },
  grafico: {
    serie: '#5B8DEF',
    serieClara: '#8FB0F5',
    destaque: '#D9A441',
    positivo: '#3ECF8E',
    negativo: '#F4707A',
    neutro: '#64789F',
    grade: '#1C2C4F',
    eixo: '#5F7099',
    cursor: 'rgba(91,141,239,0.08)',
  },
};

/* ---------------------------------------------------------------- DARK --- */
// Cinza neutro, sem viés de matiz. O ouro continua como acento — é o fio da
// marca que atravessa os três temas.

const dark: Tema = {
  id: 'dark',
  nome: 'Escuro',
  descricao: 'Cinza neutro, sem azul. O mais discreto dos três.',
  esquema: 'dark',
  amostras: ['#0F0F11', '#18181B', '#27272A', '#D9A441'],
  tokens: {
    '--c-surface': '10 10 11',
    '--c-app': '15 15 17',
    '--c-card': '24 24 27',
    '--c-elev': '32 32 36',
    '--c-elev-2': '44 44 49',

    '--c-line': '46 46 52',
    '--c-line-soft': '35 35 39',
    '--c-line-strong': '68 68 75',

    '--c-ink': '250 250 250',
    '--c-ink-2': '212 212 216',
    '--c-muted': '161 161 170',
    '--c-faint': '113 113 122',

    '--c-gold-200': '242 216 148',
    '--c-gold-300': '233 200 122',
    '--c-gold-400': '217 164 65',
    '--c-gold-500': '188 138 44',
    '--c-gold-600': '149 104 31',
    '--c-ongold': '15 15 17',

    // no tema neutro o "navy" vira cinza — senão volta o azul que se quis tirar
    '--c-navy-100': '228 228 231',
    '--c-navy-200': '212 212 216',
    '--c-navy-300': '161 161 170',
    '--c-navy-500': '82 82 91',
    '--c-navy-600': '63 63 70',
    '--c-navy-700': '82 82 91',

    ...semanticasEscuras,
    ...sombrasEscuras,
  },
  grafico: {
    serie: '#D9A441',
    serieClara: '#F2D894',
    destaque: '#FB923C',
    positivo: '#34D399',
    negativo: '#FB7185',
    neutro: '#71717A',
    grade: '#242428',
    eixo: '#71717A',
    cursor: 'rgba(217,164,65,0.08)',
  },
};

/* --------------------------------------------------------------- LIGHT --- */
// No claro tudo inverte: o ouro precisa escurecer para servir de fundo de botão
// e as semânticas precisam de versões mais escuras para ter contraste.

const light: Tema = {
  id: 'light',
  nome: 'Claro',
  descricao: 'Fundo claro, cartões brancos. Melhor sob luz forte.',
  esquema: 'light',
  amostras: ['#F6F7F9', '#FFFFFF', '#EEF0F4', '#926814'],
  tokens: {
    '--c-surface': '255 255 255',
    '--c-app': '246 247 249',
    '--c-card': '255 255 255',
    '--c-elev': '241 243 246',
    '--c-elev-2': '230 233 239',

    '--c-line': '223 227 233',
    '--c-line-soft': '235 238 242',
    '--c-line-strong': '196 202 212',

    '--c-ink': '15 23 42',
    '--c-ink-2': '51 65 85',
    '--c-muted': '100 116 139',
    '--c-faint': '124 137 157',

    // Escala invertida: no claro o ouro precisa escurecer para servir de fundo
    // de botão. 180 130 15 daria só 3,4:1 com texto branco — abaixo do mínimo
    // de 4,5:1. Daí 146 104 20, que fecha em 5:1. O hover escurece mais.
    '--c-gold-200': '100 71 10',
    '--c-gold-300': '120 86 12',
    '--c-gold-400': '146 104 20',
    '--c-gold-500': '120 86 12',
    '--c-gold-600': '100 71 10',
    '--c-ongold': '255 255 255',

    // navy-600 vira tinta clara de fundo; 100/200/300 viram texto escuro
    '--c-navy-100': '30 58 138',
    '--c-navy-200': '30 64 175',
    '--c-navy-300': '29 78 216',
    '--c-navy-500': '59 130 246',
    '--c-navy-600': '219 231 250',
    // fundo de item selecionado, com texto branco por cima
    '--c-navy-700': '30 58 138',

    '--c-positive': '21 128 61',
    '--c-negative': '190 18 60',
    '--c-attention': '180 83 9',
    '--c-info': '29 78 216',
    '--c-positive-soft': 'rgba(21,128,61,0.10)',
    '--c-positive-line': 'rgba(21,128,61,0.28)',
    '--c-negative-soft': 'rgba(190,18,60,0.10)',
    '--c-negative-line': 'rgba(190,18,60,0.28)',
    '--c-attention-soft': 'rgba(180,83,9,0.10)',
    '--c-attention-line': 'rgba(180,83,9,0.28)',
    '--c-info-soft': 'rgba(29,78,216,0.10)',
    '--c-info-line': 'rgba(29,78,216,0.28)',

    // no claro, a sombra pesada de tema escuro vira mancha suja em volta do cartão
    '--sombra-painel': '0 1px 2px 0 rgba(15,23,42,0.05), 0 1px 3px 0 rgba(15,23,42,0.06)',
    '--sombra-flutuante': '0 12px 32px -8px rgba(15,23,42,0.18)',
  },
  grafico: {
    serie: '#2563EB',
    serieClara: '#93B4FB',
    destaque: '#B4820F',
    positivo: '#15803D',
    negativo: '#BE123C',
    neutro: '#94A3B8',
    grade: '#E5E9EF',
    eixo: '#64748B',
    cursor: 'rgba(37,99,235,0.07)',
  },
};

export const TEMAS: Record<IdTema, Tema> = { navy, dark, light };
export const LISTA_TEMAS: Tema[] = [navy, dark, light];

/** Escreve as variáveis do tema no elemento raiz. */
export function aplicarTema(id: IdTema) {
  const tema = TEMAS[id] ?? TEMAS.navy;
  const raiz = document.documentElement;
  for (const [k, v] of Object.entries(tema.tokens)) raiz.style.setProperty(k, v);
  raiz.dataset.tema = tema.id;
  // faz o navegador pintar scrollbar e controles nativos no esquema certo
  raiz.style.colorScheme = tema.esquema;
}
