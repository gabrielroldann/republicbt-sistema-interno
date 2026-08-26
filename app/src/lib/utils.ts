import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * O `tailwind-merge` PRECISA conhecer os nossos tamanhos de fonte.
 *
 * Sem esta lista ele não sabe que `text-body` é um TAMANHO e assume que é uma
 * COR — aí, ao juntar as classes do botão, decide que `text-ongold` e
 * `text-body` competem pela mesma propriedade e descarta a primeira.
 *
 * O efeito foi grave e silencioso: o botão de ação primária perdia a cor do
 * texto nos TRÊS temas e ficava com o cinza-claro herdado do corpo, dando
 * 1,5:1 de contraste sobre o ouro — muito abaixo dos 4,5:1 que texto exige. Só
 * ficou visível no tema claro, onde o ouro escurece e o contraste some de vez.
 *
 * Qualquer `fontSize` novo em `tailwind.config.ts` precisa entrar aqui junto.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{
        text: ['kpi', 'kpi-sm', 'num', 'title', 'section', 'body', 'cell',
               'caption', 'label', '2xs'],
      }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------- formatação brasileira, usada em toda parte ---------- */

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

const brlCompacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const fmtBRL = (n: number) => brl.format(n ?? 0);
export const fmtBRLCompacto = (n: number) => brlCompacto.format(n ?? 0);

export const fmtNum = (n: number, casas = 0) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(n ?? 0);

export const fmtPct = (n: number, casas = 1) => `${fmtNum(n ?? 0, casas)}%`;

/** dd/mm/aaaa em todo lugar, sem exceção. */
export const fmtData = (d: Date | string) => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fmtDataCurta = (d: Date | string) => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

export const fmtMesAno = (ym: string) => {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    .replace('.', '');
};

/*
 * Vieram do CRM na fusão: a caixa de entrada precisa de hora e de tempo
 * relativo, o painel não precisava. Estavam só num dos dois `utils.ts` — e
 * essa divergência é exatamente o custo de manter duas cópias.
 */
export const fmtHora = (d: Date | string) => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

/**
 * O relógio da caixa de entrada.
 *
 * Hora para hoje, "ontem", dia da semana até uma semana, data depois. É como
 * qualquer aplicativo de mensagem faz, e a razão é prática: numa fila de
 * trabalho o que importa é "isso é de agora?", não a data exata.
 */
export const fmtQuando = (d: Date | string | null) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const hoje = new Date();
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dias = Math.round((+dia(hoje) - +dia(dt)) / 86400000);

  if (dias === 0) return fmtHora(dt);
  if (dias === 1) return 'ontem';
  if (dias < 7) return dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return fmtDataCurta(dt);
};

/* ---------- datas ---------- */

export const isoDia = (d: Date) => {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x.toISOString().slice(0, 10);
};

export const ymDe = (d: Date | string) => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

/** Competência atual no formato "2026-08". */
export const mesRef = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const inicioDoMes = (ym: string) => {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m - 1, 1, 12);
};

/** Primeiro instante do mês seguinte — use sempre com `<`, nunca com `<=`. */
export const fimDoMes = (ym: string) => {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m, 1, 12);
};

export const somarDias = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const diffDias = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / 86400000);

/** Variação percentual entre dois períodos. Evita divisão por zero. */
export const variacao = (atual: number, anterior: number) =>
  anterior === 0 ? (atual === 0 ? 0 : 100) : ((atual - anterior) / Math.abs(anterior)) * 100;
