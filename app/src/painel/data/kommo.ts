/**
 * CAMADA DO CRM (Kommo) — modelada agora, alimentada por mock.
 *
 * Nada disso tem tela ainda. O objetivo é que, quando o Kommo for contratado,
 * a troca seja só o corpo destas funções — o formato de saída já está definido
 * e testado contra dados plausíveis.
 *
 * Mapeamento esperado quando for real:
 *   getPipelines        -> GET /api/v4/leads/pipelines + agregação de /leads
 *   getGanhosPerdas     -> GET /api/v4/leads?filter[statuses]  (142 = ganho, 143 = perdido)
 *   getMotivosPerda     -> loss_reason_id dos leads perdidos
 *   getOrigemLeads      -> campo de origem / _embedded.tags
 *   getCicloMedio       -> closed_at − created_at dos ganhos
 *
 * CUIDADOS que os erros do painel concorrente deixaram evidentes:
 *
 *  1. PAGINAÇÃO. A API devolve 250 por página. Se não paginar, toda etapa
 *     "grande" congela em exatamente 250 e o funil vira ficção.
 *  2. GANHOS ≠ PERDIDOS. Win rate cravado em 50% todo mês é sintoma de contar
 *     o mesmo conjunto duas vezes, não de coincidência.
 *  3. CONVERSÃO DE ETAPA acima de 100% significa que a etapa anterior está
 *     subcontada — provavelmente pelo item 1.
 *  4. RATE LIMIT. O Kommo tolera ~7 req/s; trabalhe abaixo disso, com backoff
 *     em 429 e quarentena após 403.
 */

import type {
  GanhosPerdas, Lead, MotivoPerda, OrigemLead, Periodo, Pipeline, StatusLead,
} from '@/painel/types';
import { HOJE, vendedores } from './mock';
import { isoDia, somarDias } from '@/lib/utils';

const atraso = (ms = 200) => new Promise((res) => setTimeout(res, ms));

/* ---------- gerador determinístico, mesma semente da base principal ---------- */

function rng(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(778291);
const entre = (min: number, max: number) => min + r() * (max - min);

function porPeso<T extends { peso: number }>(itens: T[]): T {
  const total = itens.reduce((s, i) => s + i.peso, 0);
  let x = r() * total;
  for (const i of itens) {
    x -= i.peso;
    if (x <= 0) return i;
  }
  return itens[itens.length - 1];
}

/* ---------- estrutura do funil ---------- */

export const PIPELINE_PRINCIPAL = 'pl1';

const ESTAGIOS = [
  { id: 'e1', nome: 'Novo lead', ordem: 1 },
  { id: 'e2', nome: 'Em qualificação', ordem: 2 },
  { id: 'e3', nome: 'Conexão', ordem: 3 },
  { id: 'e4', nome: 'Orçamento enviado', ordem: 4 },
  { id: 'e5', nome: 'Follow-up', ordem: 5 },
  { id: 'e6', nome: 'Negociação', ordem: 6 },
  { id: 'e7', nome: 'Fechamento', ordem: 7 },
];

const CANAIS = [
  { nome: 'Tráfego pago', peso: 42 },
  { nome: 'Instagram orgânico', peso: 21 },
  { nome: 'Indicação', peso: 14 },
  { nome: 'WhatsApp direto', peso: 12 },
  { nome: 'Presencial', peso: 7 },
  { nome: 'Não rastreado', peso: 4 },
];

/**
 * Motivos de perda com peso E faixa de valor.
 * "Preço" e "Achou mais barato" incidem sobre negócios grandes — é por isso que
 * ranquear motivo por CONTAGEM engana: o que dói é o valor que evaporou.
 */
const MOTIVOS = [
  { nome: 'Desistiu da compra', peso: 24, min: 300, max: 1800 },
  { nome: 'Não respondeu', peso: 21, min: 200, max: 1200 },
  { nome: 'Preço acima do orçamento', peso: 16, min: 1200, max: 3400 },
  { nome: 'Achou mais barato em outro lugar', peso: 12, min: 1400, max: 3200 },
  { nome: 'Produto sem estoque', peso: 10, min: 800, max: 2600 },
  { nome: 'Comprou em outro lugar', peso: 8, min: 600, max: 2200 },
  { nome: 'Fora da região de entrega', peso: 5, min: 400, max: 1500 },
  { nome: 'Lead sem perfil', peso: 4, min: 100, max: 500 },
];

const TAGS = ['tráfego pago', 'instagram', 'orçamento', 'seminovas', 'recompra', 'atacado'];

function gerarLeads(): Lead[] {
  const out: Lead[] = [];
  const canais = CANAIS.map((c) => ({ ...c }));
  const motivos = MOTIVOS.map((m) => ({ ...m }));

  for (let i = 364; i >= 0; i--) {
    const dia = somarDias(HOJE, -i);
    const qtd = Math.round(entre(4, 13));

    for (let k = 0; k < qtd; k++) {
      const canal = porPeso(canais);
      const resp = vendedores[Math.floor(r() * vendedores.length)];
      const valor = Math.round(entre(180, 3200) / 10) * 10;

      // Leads antigos já se resolveram; recentes seguem em aberto.
      const maduro = i > 45;
      const sorte = r();
      const status: StatusLead = maduro
        ? (sorte < 0.19 ? 'ganho' : sorte < 0.78 ? 'perdido' : 'aberto')
        : (sorte < 0.06 ? 'ganho' : sorte < 0.22 ? 'perdido' : 'aberto');

      const estagio = status === 'ganho' ? ESTAGIOS[6]
        : status === 'perdido' ? ESTAGIOS[Math.floor(entre(1, 6))]
        : ESTAGIOS[Math.floor(entre(0, 6))];

      const diasAteFechar = Math.round(entre(1, 38));
      const fechado = status !== 'aberto' && i - diasAteFechar > 0;

      out.push({
        id: `l${out.length + 1}`,
        criadoEm: isoDia(dia),
        nome: `Lead ${out.length + 1}`,
        telefone: `5585${Math.floor(entre(900000000, 999999999))}`,
        valor,
        status,
        pipelineId: PIPELINE_PRINCIPAL,
        estagioId: estagio.id,
        responsavelId: resp.id,
        canal: canal.nome,
        tags: r() < 0.62 ? [TAGS[Math.floor(r() * TAGS.length)]] : [],
        motivoPerda: status === 'perdido' ? porPeso(motivos).nome : undefined,
        fechadoEm: fechado ? isoDia(somarDias(dia, diasAteFechar)) : undefined,
      });
    }
  }
  return out;
}

export const leads: Lead[] = gerarLeads();

const dentro = (iso: string, p: Periodo) => iso >= isoDia(p.de) && iso <= isoDia(p.ate);
const noPeriodo = (p: Periodo) => leads.filter((l) => dentro(l.criadoEm, p));

/* ---------- consultas ---------- */

export async function getPipelines(p: Periodo): Promise<Pipeline[]> {
  await atraso();
  const doPeriodo = noPeriodo(p);
  const total = doPeriodo.length;
  const valorTotal = doPeriodo.reduce((s, l) => s + l.valor, 0);

  const porEstagio = ESTAGIOS.map((e) => {
    const doEstagio = doPeriodo.filter((l) => l.estagioId === e.id);
    return {
      ...e,
      qtd: doEstagio.length,
      valor: doEstagio.reduce((s, l) => s + l.valor, 0),
    };
  });

  /**
   * Conversão de etapa num funil de SNAPSHOT.
   *
   * Comparar "leads na etapa 4" com "leads na etapa 3" é errado e gera aqueles
   * 2083% que aparecem em painel mal feito: o funil mostra onde cada lead ESTÁ
   * agora, não por onde passou. Um lead na etapa 6 já passou pela 3 — ele não
   * está mais lá, mas converteu.
   *
   * O certo é comparar acumulados: quantos chegaram até esta etapa OU adiante,
   * contra quantos chegaram até a anterior ou adiante. Assim a série é sempre
   * decrescente e a conversão nunca passa de 100%.
   */
  const restantes = porEstagio.map((_, i) =>
    porEstagio.slice(i).reduce((s, e) => s + e.qtd, 0),
  );

  const estagios = porEstagio.map((e, i) => ({
    id: e.id,
    pipelineId: PIPELINE_PRINCIPAL,
    nome: e.nome,
    ordem: e.ordem,
    leads: e.qtd,
    valor: e.valor,
    ticketMedio: e.qtd > 0 ? e.valor / e.qtd : 0,
    conversaoEtapa:
      i === 0 ? 100 : restantes[i - 1] > 0 ? (restantes[i] / restantes[i - 1]) * 100 : 0,
    percentualPipeline: total > 0 ? (restantes[i] / total) * 100 : 0,
  }));

  return [{
    id: PIPELINE_PRINCIPAL,
    nome: 'Vendas Republic BT',
    ativo: true,
    leads: total,
    valor: valorTotal,
    estagios,
  }];
}

export async function getGanhosPerdas(p: Periodo): Promise<GanhosPerdas> {
  await atraso();
  const doPeriodo = noPeriodo(p);
  const ganhos = doPeriodo.filter((l) => l.status === 'ganho');
  const perdidos = doPeriodo.filter((l) => l.status === 'perdido');
  const fechados = ganhos.length + perdidos.length;

  const comCiclo = ganhos.filter((l) => l.fechadoEm);
  const ciclo = comCiclo.length
    ? comCiclo.reduce(
        (s, l) =>
          s + (new Date(l.fechadoEm!).getTime() - new Date(l.criadoEm).getTime()) / 86400000,
        0,
      ) / comCiclo.length
    : 0;

  return {
    ganhos: ganhos.length,
    perdidos: perdidos.length,
    valorGanho: ganhos.reduce((s, l) => s + l.valor, 0),
    valorPerdido: perdidos.reduce((s, l) => s + l.valor, 0),
    // fechados no denominador, não o total de leads — lead em aberto ainda pode virar
    winRate: fechados > 0 ? (ganhos.length / fechados) * 100 : 0,
    cicloMedioDias: ciclo,
  };
}

/** Ordenado por VALOR perdido, não por contagem. */
export async function getMotivosPerda(p: Periodo): Promise<MotivoPerda[]> {
  await atraso();
  const perdidos = noPeriodo(p).filter((l) => l.status === 'perdido' && l.motivoPerda);
  const totalQtd = perdidos.length;
  const totalValor = perdidos.reduce((s, l) => s + l.valor, 0);

  const mapa = new Map<string, { quantidade: number; valorPerdido: number }>();
  for (const l of perdidos) {
    const cur = mapa.get(l.motivoPerda!) ?? { quantidade: 0, valorPerdido: 0 };
    cur.quantidade += 1;
    cur.valorPerdido += l.valor;
    mapa.set(l.motivoPerda!, cur);
  }

  return [...mapa.entries()]
    .map(([motivo, x]) => ({
      motivo,
      ...x,
      percentualQuantidade: totalQtd > 0 ? (x.quantidade / totalQtd) * 100 : 0,
      percentualValor: totalValor > 0 ? (x.valorPerdido / totalValor) * 100 : 0,
    }))
    .sort((a, b) => b.valorPerdido - a.valorPerdido);
}

export async function getOrigemLeads(p: Periodo): Promise<OrigemLead[]> {
  await atraso();
  const doPeriodo = noPeriodo(p);
  const mapa = new Map<string, OrigemLead>();

  for (const l of doPeriodo) {
    const cur = mapa.get(l.canal) ?? {
      canal: l.canal, leads: 0, valor: 0, ganhos: 0, perdidos: 0, winRate: 0,
    };
    cur.leads += 1;
    cur.valor += l.valor;
    if (l.status === 'ganho') cur.ganhos += 1;
    if (l.status === 'perdido') cur.perdidos += 1;
    mapa.set(l.canal, cur);
  }

  return [...mapa.values()]
    .map((c) => ({
      ...c,
      winRate: c.ganhos + c.perdidos > 0 ? (c.ganhos / (c.ganhos + c.perdidos)) * 100 : 0,
    }))
    .sort((a, b) => b.leads - a.leads);
}

export async function getTags(p: Periodo): Promise<{ tag: string; leads: number; valor: number }[]> {
  await atraso();
  const mapa = new Map<string, { leads: number; valor: number }>();
  for (const l of noPeriodo(p)) {
    const chave = l.tags[0] ?? 'sem tag';
    const cur = mapa.get(chave) ?? { leads: 0, valor: 0 };
    cur.leads += 1;
    cur.valor += l.valor;
    mapa.set(chave, cur);
  }
  return [...mapa.entries()]
    .map(([tag, x]) => ({ tag, ...x }))
    .sort((a, b) => b.leads - a.leads);
}
