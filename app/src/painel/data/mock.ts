/**
 * Base de dados mockada — uma só, consistente entre todos os módulos.
 *
 * Regra importante: NENHUMA tela gera número próprio. Todo gráfico, tabela e KPI
 * deriva destes mesmos pedidos. Se o faturamento da Visão Geral e o da tela de
 * Vendas divergirem, é bug — não arredondamento.
 *
 * O gerador é determinístico (PRNG com semente fixa): recarregar a página não
 * muda nenhum número. Num painel financeiro, número que dança destrói confiança.
 */

import { FORMAS_PAGAMENTO } from '@/painel/types';
import type {
  Campanha, CanalVenda, Conta, CustoFixo, CustoMidia, Despesa, FormaPagamento,
  MetaLoja, MovimentoEstoque, Pagamento, Produto, Venda, Vendedor, Categoria,
} from '@/painel/types';
import { isoDia, somarDias } from '@/lib/utils';

/* ---------- PRNG determinístico (mulberry32) ---------- */

function rng(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r = rng(20260811);
const entre = (min: number, max: number) => min + r() * (max - min);
const inteiro = (min: number, max: number) => Math.floor(entre(min, max + 1));
const escolher = <T,>(itens: T[]) => itens[Math.floor(r() * itens.length)];

function porPeso<T extends { peso: number }>(itens: T[]): T {
  const total = itens.reduce((s, i) => s + i.peso, 0);
  let x = r() * total;
  for (const i of itens) {
    x -= i.peso;
    if (x <= 0) return i;
  }
  return itens[itens.length - 1];
}

/* ---------- vendedores ---------- */
// Spread proposital: um destaque claro, um abaixo da média. É o que um painel
// precisa conseguir distinguir visualmente.

export const vendedores: Vendedor[] = [
  { id: 'v1', nome: 'Gabriel Roldan', iniciais: 'GR', metaMensal: 22000, comissaoPct: 3, ativo: true },
  { id: 'v2', nome: 'Pedro Luca', iniciais: 'PL', metaMensal: 18000, comissaoPct: 3, ativo: true },
  { id: 'v3', nome: 'Marina Costa', iniciais: 'MC', metaMensal: 18000, comissaoPct: 3.5, ativo: true },
  { id: 'v4', nome: 'Rafael Menezes', iniciais: 'RM', metaMensal: 15000, comissaoPct: 3, ativo: true },
];

const pesoVendedor: Record<string, number> = { v1: 34, v2: 27, v3: 26, v4: 13 };

/* ---------- catálogo ---------- */
// Margem por categoria segue o real: raquete é o produto de maior ticket e
// MENOR margem percentual. Roupa e acessório sustentam o resultado.

interface Semente {
  sku: string; nome: string; marca: string; categoria: Categoria;
  preco: number; margemPct: number; estoque: number; estoqueMin: number; peso: number;
}

const sementes: Semente[] = [
  // raquetes — ticket alto, margem baixa
  { sku: 'RAQ-DS-CQ12', nome: 'Drop Shot Conqueror 12', marca: 'Drop Shot', categoria: 'raquetes', preco: 1890, margemPct: 30, estoque: 6, estoqueMin: 3, peso: 9 },
  { sku: 'RAQ-DS-EXP', nome: 'Drop Shot Explorer Pro', marca: 'Drop Shot', categoria: 'raquetes', preco: 1290, margemPct: 32, estoque: 9, estoqueMin: 4, peso: 12 },
  { sku: 'RAQ-AD-MTC', nome: 'Adidas Metalbone Carbon', marca: 'Adidas', categoria: 'raquetes', preco: 2490, margemPct: 28, estoque: 3, estoqueMin: 2, peso: 6 },
  { sku: 'RAQ-AD-ADP', nome: 'Adidas Adipower BT', marca: 'Adidas', categoria: 'raquetes', preco: 1690, margemPct: 31, estoque: 5, estoqueMin: 3, peso: 8 },
  { sku: 'RAQ-VL-ELT', nome: 'Vollo Elite Carbon 3K', marca: 'Vollo', categoria: 'raquetes', preco: 890, margemPct: 36, estoque: 14, estoqueMin: 5, peso: 15 },
  { sku: 'RAQ-VL-STR', nome: 'Vollo Starter Fibra', marca: 'Vollo', categoria: 'raquetes', preco: 540, margemPct: 42, estoque: 18, estoqueMin: 6, peso: 13 },
  { sku: 'RAQ-SH-PRO', nome: 'Shark Pro Series 18K', marca: 'Shark', categoria: 'raquetes', preco: 3200, margemPct: 26, estoque: 2, estoqueMin: 2, peso: 0.6 },
  { sku: 'RAQ-HD-FLW', nome: 'Head Flow Beach', marca: 'Head', categoria: 'raquetes', preco: 1150, margemPct: 33, estoque: 1, estoqueMin: 3, peso: 7 },
  { sku: 'RAQ-SB-VNM', nome: 'Sexy Brand Venom', marca: 'Sexy Brand', categoria: 'raquetes', preco: 2150, margemPct: 29, estoque: 4, estoqueMin: 2, peso: 5 },

  // roupas — margem alta
  { sku: 'ROU-CAM-DRY', nome: 'Camiseta Dry Fit Republic', marca: 'Republic BT', categoria: 'roupas', preco: 149, margemPct: 62, estoque: 42, estoqueMin: 12, peso: 22 },
  { sku: 'ROU-SHT-MSC', nome: 'Shorts Masculino Beach', marca: 'Republic BT', categoria: 'roupas', preco: 189, margemPct: 58, estoque: 28, estoqueMin: 10, peso: 16 },
  { sku: 'ROU-SAI-FEM', nome: 'Saia-Shorts Feminina', marca: 'Republic BT', categoria: 'roupas', preco: 219, margemPct: 57, estoque: 24, estoqueMin: 10, peso: 15 },
  { sku: 'ROU-TOP-FEM', nome: 'Top Feminino Performance', marca: 'Adidas', categoria: 'roupas', preco: 259, margemPct: 48, estoque: 19, estoqueMin: 8, peso: 12 },
  { sku: 'ROU-VIS-UNI', nome: 'Viseira Unissex', marca: 'Drop Shot', categoria: 'roupas', preco: 129, margemPct: 55, estoque: 31, estoqueMin: 10, peso: 14 },
  { sku: 'ROU-BON-LOG', nome: 'Boné Logo Republic', marca: 'Republic BT', categoria: 'roupas', preco: 139, margemPct: 60, estoque: 8, estoqueMin: 10, peso: 11 },

  // raqueteiras
  { sku: 'RQT-DS-PRO', nome: 'Raqueteira Drop Shot Pro', marca: 'Drop Shot', categoria: 'raqueteiras', preco: 549, margemPct: 45, estoque: 11, estoqueMin: 4, peso: 8 },
  { sku: 'RQT-AD-TOU', nome: 'Raqueteira Adidas Tour', marca: 'Adidas', categoria: 'raqueteiras', preco: 689, margemPct: 42, estoque: 6, estoqueMin: 3, peso: 6 },
  { sku: 'RQT-VL-CMP', nome: 'Raqueteira Vollo Compact', marca: 'Vollo', categoria: 'raqueteiras', preco: 289, margemPct: 52, estoque: 17, estoqueMin: 6, peso: 10 },
  { sku: 'RQT-SB-TRM', nome: 'Raqueteira Sexy Brand Térmica', marca: 'Sexy Brand', categoria: 'raqueteiras', preco: 799, margemPct: 40, estoque: 5, estoqueMin: 3, peso: 0.4 },

  // acessórios — giro alto, margem alta, ticket baixo
  { sku: 'ACE-BOL-TB3', nome: 'Bolinha Beach Tennis (tubo 3un)', marca: 'Vollo', categoria: 'acessorios', preco: 89, margemPct: 58, estoque: 96, estoqueMin: 24, peso: 30 },
  { sku: 'ACE-OVG-PCK', nome: 'Overgrip Pack 3un', marca: 'Drop Shot', categoria: 'acessorios', preco: 69, margemPct: 65, estoque: 74, estoqueMin: 20, peso: 26 },
  { sku: 'ACE-PRT-BOR', nome: 'Protetor de Borda', marca: 'Head', categoria: 'acessorios', preco: 79, margemPct: 60, estoque: 38, estoqueMin: 12, peso: 17 },
  { sku: 'ACE-ANT-VIB', nome: 'Antivibrador (par)', marca: 'Adidas', categoria: 'acessorios', preco: 49, margemPct: 68, estoque: 52, estoqueMin: 15, peso: 14 },
  { sku: 'ACE-MUN-SUO', nome: 'Munhequeira Suor (par)', marca: 'Republic BT', categoria: 'acessorios', preco: 59, margemPct: 63, estoque: 41, estoqueMin: 12, peso: 13 },
  { sku: 'ACE-GAR-TRM', nome: 'Garrafa Térmica 750ml', marca: 'Republic BT', categoria: 'acessorios', preco: 159, margemPct: 55, estoque: 0, estoqueMin: 8, peso: 9 },
  { sku: 'ACE-FIT-KNS', nome: 'Kit Fita Kinesio', marca: 'Vollo', categoria: 'acessorios', preco: 99, margemPct: 57, estoque: 23, estoqueMin: 8, peso: 0.5 },
];

export const produtos: Produto[] = sementes.map((s, i) => ({
  id: `p${i + 1}`,
  sku: s.sku,
  nome: s.nome,
  categoria: s.categoria,
  marca: s.marca,
  preco: s.preco,
  custo: Math.round(s.preco * (1 - s.margemPct / 100)),
  estoqueMin: s.estoqueMin,
  ativo: true,
}));

/**
 * MOVIMENTOS DE ESTOQUE — a fonte do saldo.
 *
 * `produto` deixou de ter campo `estoque`. O saldo é a soma daqui, como na view
 * `saldo_estoque` do banco. Antes o mock guardava o saldo como campo e o schema
 * dizia o contrário — na troca para o Supabase a coluna não existiria e todas
 * as telas de estoque quebrariam de uma vez.
 *
 * As entradas são geradas depois das vendas (mais abaixo), porque a entrada
 * inicial precisa ser grande o bastante para cobrir tudo que foi vendido no ano
 * e ainda sobrar o saldo pretendido.
 */
export const movimentos: MovimentoEstoque[] = [];

const pesoProduto = new Map(produtos.map((p, i) => [p.id, sementes[i].peso]));

/* ---------- vendas: 365 dias ---------- */

const pesoPagamento: { id: FormaPagamento; peso: number }[] = [
  { id: 'pix', peso: 38 },
  { id: 'credito_parcelado', peso: 27 },
  { id: 'credito', peso: 20 },
  { id: 'debito', peso: 11 },
  { id: 'dinheiro', peso: 4 },
];

const pesoCanal: { id: CanalVenda; peso: number }[] = [
  { id: 'trafego_pago', peso: 34 },
  { id: 'instagram', peso: 22 },
  { id: 'indicacao', peso: 17 },
  { id: 'whatsapp', peso: 12 },
  { id: 'presencial', peso: 9 },
  { id: 'recompra', peso: 6 },
];

const NOMES = [
  'Juliana', 'Marcos', 'Renata', 'Diego', 'Camila', 'Rafael', 'Beatriz', 'Thiago',
  'Larissa', 'Bruno', 'Fernanda', 'Lucas', 'Patrícia', 'André', 'Mariana', 'Felipe',
  'Carolina', 'Rodrigo', 'Amanda', 'Vinícius',
];
const SOBRENOMES = [
  'Freitas', 'Tavares', 'Alves', 'Nogueira', 'Souza', 'Lima', 'Cavalcante', 'Barros',
  'Moreira', 'Pontes', 'Rocha', 'Vieira', 'Sampaio', 'Bezerra', 'Correia',
];
const CIDADES = [
  'Fortaleza', 'Fortaleza', 'Fortaleza', 'Caucaia', 'Eusébio', 'Maracanaú',
  'Aquiraz', 'Sobral', 'Juazeiro do Norte',
];

export const HOJE = new Date();
HOJE.setHours(12, 0, 0, 0);

const DIAS = 365;

/** Verão brasileiro move beach tennis. Dez–mar acima, jun–ago abaixo. */
function fatorSazonal(d: Date) {
  const m = d.getMonth();
  const tabela = [1.28, 1.22, 1.12, 0.98, 0.9, 0.78, 0.76, 0.82, 0.95, 1.05, 1.12, 1.3];
  return tabela[m];
}

/** Fim de semana é quando se joga — e quando se compra. */
function fatorDiaSemana(d: Date) {
  const dia = d.getDay();
  return [0.78, 0.85, 0.92, 0.98, 1.06, 1.32, 1.28][dia];
}

function gerarVendas(): Venda[] {
  const out: Venda[] = [];
  const listaProdutos = produtos.map((p) => ({ ...p, peso: pesoProduto.get(p.id) ?? 1 }));
  const listaVendedores = vendedores.map((v) => ({ ...v, peso: pesoVendedor[v.id] ?? 1 }));

  for (let i = DIAS - 1; i >= 0; i--) {
    const dia = somarDias(HOJE, -i);
    const base = 3.1 * fatorSazonal(dia) * fatorDiaSemana(dia);
    // ruído diário: dias fracos e dias fortes existem
    const qtdPedidos = Math.max(0, Math.round(base * entre(0.55, 1.5)));

    for (let k = 0; k < qtdPedidos; k++) {
      const produto = porPeso(listaProdutos);
      const vendedor = porPeso(listaVendedores);
      const pgto = porPeso(pesoPagamento);

      // acessório sai em mais de uma unidade com frequência; raquete quase nunca
      const quantidade =
        produto.categoria === 'acessorios' ? inteiro(1, 3)
        : produto.categoria === 'raquetes' ? 1
        : inteiro(1, 2);

      // desconto pontual, mais comum em raquete (item de negociação)
      const descontoPct = produto.categoria === 'raquetes'
        ? (r() < 0.35 ? entre(3, 12) : 0)
        : (r() < 0.15 ? entre(3, 8) : 0);

      const precoUnit = Math.round(produto.preco * (1 - descontoPct / 100));

      // Trade-in só acontece em raquete, e não é raro: parte do público troca a
      // antiga ao subir de nível. O crédito fica entre 25% e 45% do preço novo.
      const temTradeIn = produto.categoria === 'raquetes' && r() < 0.18;
      const tradeIn = temTradeIn
        ? {
            modelo: escolher([
              'Drop Shot Conqueror 10', 'Adidas Adipower 3.1', 'Vollo Elite 2K',
              'Head Flow 24', 'Sexy Brand Vortex', 'Shark Legend 22',
            ]),
            valorCredito: Math.round((precoUnit * entre(0.25, 0.45)) / 10) * 10,
            recebida: r() < 0.82,
          }
        : undefined;

      out.push({
        id: `s${out.length + 1}`,
        data: isoDia(dia),
        produtoId: produto.id,
        vendedorId: vendedor.id,
        quantidade,
        precoUnit,
        custoUnit: produto.custo,
        formaPagamento: pgto.id,
        parcelas: pgto.id === 'credito_parcelado' ? escolher([2, 3, 4, 6, 10, 12]) : 1,
        comissaoPct: vendedor.comissaoPct,
        // Congelada na venda, como no banco. Consultar a tabela de formas de
        // pagamento a cada leitura fazia a margem histórica mudar sozinha
        // quando a maquininha reajustava.
        taxaPct: FORMAS_PAGAMENTO.find((f) => f.id === pgto.id)?.taxa ?? 0,
        // venda antiga já entregou; recente ainda pode estar em trânsito
        entrega: i > 9 ? 'entregue' : r() < 0.55 ? 'entregue' : 'pendente',
        clienteNome: `${escolher(NOMES)} ${escolher(SOBRENOMES)}`,
        clienteFone: `5585${Math.floor(entre(900000000, 999999999))}`,
        cidade: escolher(CIDADES),
        canal: porPeso(pesoCanal).id,
        tradeIn,
      });
    }
  }
  return out;
}

export const vendas: Venda[] = gerarVendas();

/* ---------- campanhas, gasto de mídia e leads ---------- */

/**
 * As campanhas usam o mesmo formato de id do CRM: `meta:ad:<id do anúncio>`.
 *
 * O webhook do WhatsApp entrega o id do ANÚNCIO, não o da campanha — subir a
 * hierarquia exige a API de Marketing, que é outra credencial. Então o anúncio
 * é a unidade, e isso é mais útil do que parece: é nele que se decide qual
 * criativo cortar.
 */
export const campanhas: Campanha[] = [
  { id: 'meta:ad:120219876543210', nome: 'Verão 2026 — Raquetes', canal: 'meta', ativa: true, metaAdId: '120219876543210', codigo: null },
  { id: 'meta:ad:120219876543211', nome: 'Institucional — Loja Aldeota', canal: 'meta', ativa: true, metaAdId: '120219876543211', codigo: null },
  { id: 'meta:ad:120219876543212', nome: 'Retargeting — visitou e não comprou', canal: 'meta', ativa: true, metaAdId: '120219876543212', codigo: null },
  { id: 'meta:ad:120219876543213', nome: 'Kit iniciante — vídeo', canal: 'meta', ativa: false, metaAdId: '120219876543213', codigo: null },
  { id: 'organico', nome: 'Orgânico', canal: 'organico', ativa: true, metaAdId: null, codigo: null },
  { id: 'indicacao', nome: 'Indicação', canal: 'indicacao', ativa: true, metaAdId: null, codigo: null },
  { id: 'nao_rastreado', nome: 'Não rastreado', canal: 'outro', ativa: true, metaAdId: null, codigo: null },
];

/** Só as pagas consomem verba — orgânico e indicação não têm gasto. */
const PAGAS = campanhas.filter((c) => c.canal === 'meta');

export const custosMidia: CustoMidia[] = [];
for (let i = 11; i >= 0; i--) {
  const d = new Date(HOJE.getFullYear(), HOJE.getMonth() - i, 1);
  if (d > HOJE) continue;
  const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const orcamento = 2000 * fatorSazonal(d);
  // Reparte o mês entre os anúncios ativos, com pesos diferentes: campanha
  // dividida em partes iguais não existe na vida real e não exercita a tela.
  const pesos = [0.45, 0.2, 0.25, 0.1];
  PAGAS.forEach((c, k) => {
    if (!c.ativa && k === 3) return;
    custosMidia.push({
      campanhaId: c.id, mes,
      gasto: Math.round(orcamento * pesos[k] * entre(0.85, 1.15)),
    });
  });
}

/**
 * Leads por campanha.
 *
 * No banco isso é a tabela `lead`, que vive no CRM. Aqui é só o suficiente
 * para a conta de custo por lead e conversão ter denominador — sem lead, "o
 * anúncio se paga?" não tem como ser respondida.
 */
export interface LeadMock { id: string; campanhaId: string; data: string; vendaId: string | null }
export const leadsMock: LeadMock[] = [];

(function gerarLeads() {
  // Toda venda de tráfego pago nasceu de um lead — é o lead que converteu.
  const doTrafego = vendas.filter((v) => v.canal === 'trafego_pago');
  doTrafego.forEach((v, i) => {
    const c = PAGAS[i % PAGAS.length];
    v.campanhaId = c.id;
    leadsMock.push({ id: `lm-v-${v.id}`, campanhaId: c.id, data: v.data, vendaId: v.id });
  });

  // E a maioria dos leads NÃO converte. É essa proporção que define o custo
  // por venda — sem os que não fecharam, a campanha pareceria perfeita.
  for (const v of vendas) {
    if (v.canal !== 'trafego_pago') continue;
    const perdidos = inteiro(2, 5);
    for (let k = 0; k < perdidos; k++) {
      leadsMock.push({
        id: `lm-p-${v.id}-${k}`,
        campanhaId: v.campanhaId!,
        data: v.data,
        vendaId: null,
      });
    }
  }

  // Vendas que não vieram de anúncio ainda têm origem — só não é paga.
  for (const v of vendas) {
    if (v.campanhaId) continue;
    v.campanhaId = v.canal === 'indicacao' ? 'indicacao'
      : v.canal === 'recompra' || v.canal === 'presencial' ? 'nao_rastreado'
      : 'organico';
  }
})();

/**
 * Agora que as vendas existem, os movimentos podem ser montados de trás para
 * frente: entrada inicial = o que foi vendido no ano + o saldo que se quer ver
 * hoje. Assim o saldo derivado bate exatamente com o número que a demonstração
 * pretendia mostrar, sem campo de saldo em lugar nenhum.
 */
(function gerarMovimentos() {
  const vendidoPorProduto = new Map<string, number>();
  for (const v of vendas) {
    vendidoPorProduto.set(v.produtoId, (vendidoPorProduto.get(v.produtoId) ?? 0) + v.quantidade);
  }

  const inicio = isoDia(somarDias(HOJE, -400));

  produtos.forEach((p, i) => {
    const saldoDesejado = sementes[i].estoque;
    const vendido = vendidoPorProduto.get(p.id) ?? 0;

    movimentos.push({
      id: `mv-ini-${p.id}`,
      produtoId: p.id,
      quantidade: vendido + saldoDesejado,
      tipo: 'entrada',
      custoUnit: p.custo,
      freteRateado: 0,
      vendaId: null,
      observacao: 'Estoque inicial',
      data: inicio,
    });
  });

  // Cada venda tira do estoque. É a linha que faltava: sem ela o saldo seria a
  // entrada inteira, e o painel diria que a loja tem mercadoria que já vendeu.
  for (const v of vendas) {
    movimentos.push({
      id: `mv-v-${v.id}`,
      produtoId: v.produtoId,
      quantidade: -v.quantidade,
      tipo: 'venda',
      custoUnit: v.custoUnit,
      freteRateado: 0,
      vendaId: v.id,
      observacao: null,
      data: v.data,
    });
  }

  movimentos.sort((a, b) => a.data.localeCompare(b.data));
})();

/* ---------- pagamentos ---------- */
// Contratado ≠ recebido. Parcelado entra em parcelas ao longo dos meses, e é
// exatamente essa diferença que define quanto de comissão já se deve pagar.

function gerarPagamentos(): Pagamento[] {
  const out: Pagamento[] = [];

  for (const v of vendas) {
    const total = v.precoUnit * v.quantidade - (v.tradeIn?.valorCredito ?? 0);
    if (total <= 0) continue;

    if (v.parcelas <= 1) {
      // à vista: entra no ato, salvo uma pequena fatia que fica pendente
      if (r() < 0.96) {
        out.push({
          id: `pg${out.length + 1}`,
          vendaId: v.id,
          data: v.data,
          valor: total,
          forma: v.formaPagamento,
          parcelas: v.parcelas,
          taxaPct: v.taxaPct,
        });
      }
      continue;
    }

    // parcelado: uma parcela por mês, só as já vencidas foram recebidas
    const valorParcela = Math.round((total / v.parcelas) * 100) / 100;
    const inicio = new Date(v.data);
    for (let n = 0; n < v.parcelas; n++) {
      const venc = new Date(inicio.getFullYear(), inicio.getMonth() + n, inicio.getDate(), 12);
      if (venc > HOJE) break;
      out.push({
        id: `pg${out.length + 1}`,
        vendaId: v.id,
        data: isoDia(venc),
        valor: n === v.parcelas - 1 ? total - valorParcela * (v.parcelas - 1) : valorParcela,
        forma: v.formaPagamento,
        parcelas: v.parcelas,
        taxaPct: v.taxaPct,
      });
    }
  }

  return out;
}

export const pagamentos: Pagamento[] = gerarPagamentos();

/* ---------- despesas ---------- */

/**
 * CUSTOS FIXOS — o modelo mensal que o dono edita na tela.
 *
 * Isto não é a despesa: é o molde dela. "Aluguel é R$3.400 por mês" é o modelo;
 * "em agosto pagamos R$3.400" é o lançamento, que vive em `despesas`.
 *
 * A separação existe para não criar um SEGUNDO lugar onde se digita aluguel. Se
 * o cálculo do lucro lesse daqui e o fluxo de caixa lesse de `despesas`, os dois
 * divergiriam no primeiro reajuste e ninguém saberia qual está certo. Aqui o
 * modelo GERA a despesa, e todo o resto do sistema continua lendo `despesas`.
 *
 * Marketing NÃO entra: é linha própria no lucro por unidade, porque é a única
 * que se controla no mês seguinte.
 */
export const custosFixos: CustoFixo[] = [
  { id: 'cf1', nome: 'Aluguel da loja',         categoria: 'aluguel',     valorMensal: 3400, ativo: true },
  { id: 'cf2', nome: 'Folha de pagamento',      categoria: 'folha',       valorMensal: 6200, ativo: true },
  { id: 'cf3', nome: 'Energia elétrica',        categoria: 'operacional', valorMensal:  620, ativo: true },
  { id: 'cf4', nome: 'Água',                    categoria: 'operacional', valorMensal:  110, ativo: true },
  { id: 'cf5', nome: 'Internet',                categoria: 'operacional', valorMensal:  160, ativo: true },
  { id: 'cf6', nome: 'Contador',                categoria: 'operacional', valorMensal:  650, ativo: true },
  { id: 'cf7', nome: 'CRM e sistemas',          categoria: 'operacional', valorMensal:  240, ativo: true },
];

const fixasMensais: {
  descricao: string; categoria: Despesa['categoria']; valor: number; custoFixoId?: string;
}[] = [
  ...custosFixos.map((c) => ({
    descricao: c.nome, categoria: c.categoria as Despesa['categoria'],
    valor: c.valorMensal, custoFixoId: c.id,
  })),
  // Mídia não é custo fixo: é linha própria no lucro por unidade, e a loja
  // decide de novo todo mês. Por isso entra sem vínculo — e é editável.
  { descricao: 'Tráfego pago — Meta Ads', categoria: 'marketing', valor: 2000 },
];

function gerarDespesas(): Despesa[] {
  const out: Despesa[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(HOJE.getFullYear(), HOJE.getMonth() - i, 5, 12);
    if (d > HOJE) continue;
    for (const f of fixasMensais) {
      out.push({
        id: `d${out.length + 1}`,
        data: isoDia(d),
        descricao: f.descricao,
        categoria: f.categoria,
        valor: Math.round(f.valor * entre(0.96, 1.06)),
        recorrente: true,
        custoFixoId: f.custoFixoId ?? null,
      });
    }
    // reposição de estoque: o maior desembolso, e o mais irregular
    const compra = new Date(HOJE.getFullYear(), HOJE.getMonth() - i, inteiro(8, 20), 12);
    if (compra <= HOJE) {
      out.push({
        id: `d${out.length + 1}`,
        data: isoDia(compra),
        descricao: `Reposição de estoque — ${escolher(['Drop Shot', 'Adidas', 'Vollo', 'Head'])}`,
        categoria: 'fornecedores',
        valor: Math.round(entre(14000, 26000)),
        recorrente: false,
      });
    }
  }

  const avulsas = [
    { descricao: 'Manutenção do ar-condicionado', categoria: 'operacional' as const, valor: 780 },
    { descricao: 'Material de embalagem', categoria: 'operacional' as const, valor: 1150 },
    { descricao: 'Patrocínio de torneio local', categoria: 'marketing' as const, valor: 3500 },
    { descricao: 'Reforma da vitrine', categoria: 'operacional' as const, valor: 4900 },
  ];
  for (const a of avulsas) {
    out.push({
      id: `d${out.length + 1}`,
      data: isoDia(somarDias(HOJE, -inteiro(10, 200))),
      descricao: a.descricao,
      categoria: a.categoria,
      valor: a.valor,
      recorrente: false,
    });
  }

  return out.sort((a, b) => a.data.localeCompare(b.data));
}

export const despesas: Despesa[] = gerarDespesas();

/**
 * Materializa o modelo de custos fixos como despesas da competência.
 *
 * Idempotente: roda quantas vezes quiser e o mês continua com uma linha por
 * custo. Sem isso, cada edição na tela empilharia mais um aluguel no mês e o
 * lucro afundaria a cada salvamento — um bug que parece problema de negócio.
 *
 * Só mexe na competência pedida. Reajustar o aluguel hoje não reescreve o que
 * se pagou em março: mês fechado é fato, não previsão.
 */
export function aplicarCustosFixos(mes: string) {
  const dia = `${mes}-05`;

  // Fora as linhas geradas por modelo neste mês; as avulsas e a mídia ficam.
  for (let i = despesas.length - 1; i >= 0; i--) {
    const d = despesas[i];
    if (d.data.slice(0, 7) === mes && d.custoFixoId) despesas.splice(i, 1);
  }

  for (const c of custosFixos) {
    if (!c.ativo) continue;
    despesas.push({
      id: `cf-${c.id}-${mes}`,
      data: dia,
      descricao: c.nome,
      categoria: c.categoria,
      valor: c.valorMensal,
      recorrente: true,
      // O vínculo é por id, não por texto: renomear "Energia" para "Energia
      // elétrica" não pode duplicar a linha do mês.
      custoFixoId: c.id,
    });
  }
  despesas.sort((a, b) => a.data.localeCompare(b.data));
}

/* ---------- contas a pagar e receber ---------- */
// Espalhadas em passado (algumas vencidas), presente e futuro — é onde o
// dono da loja precisa bater o olho e ver problema em dois segundos.

function gerarContas(): Conta[] {
  const out: Conta[] = [];
  const add = (c: Omit<Conta, 'id'>) => out.push({ ...c, id: `c${out.length + 1}` });

  const pagar = [
    { descricao: 'Nota fiscal 4821 — lote de raquetes', contraparte: 'Drop Shot Brasil', valor: 18400, dias: -6 },
    { descricao: 'Nota fiscal 1190 — camisetas dry fit', contraparte: 'Malharia Nordeste', valor: 4260, dias: -2 },
    { descricao: 'Aluguel da loja', contraparte: 'Imobiliária Aldeota', valor: 3400, dias: 3 },
    { descricao: 'Folha de pagamento', contraparte: 'Equipe', valor: 6200, dias: 4 },
    { descricao: 'Nota fiscal 7734 — raqueteiras', contraparte: 'Adidas Padel BR', valor: 9750, dias: 11 },
    { descricao: 'Tráfego pago — Meta Ads', contraparte: 'Meta Platforms', valor: 2000, dias: 14 },
    { descricao: 'Contador', contraparte: 'Contabilidade Vieira', valor: 650, dias: 18 },
    { descricao: 'Nota fiscal 2201 — bolinhas', contraparte: 'Vollo Sports', valor: 3180, dias: 26 },
    { descricao: 'Energia elétrica', contraparte: 'Enel', valor: 640, dias: -14 },
  ];
  for (const p of pagar) {
    const venc = somarDias(HOJE, p.dias);
    add({
      tipo: 'pagar',
      descricao: p.descricao,
      contraparte: p.contraparte,
      valor: p.valor,
      vencimento: isoDia(venc),
      // Só `pagoEm` é gravado. O status sai daqui + do vencimento, na leitura.
      pagoEm: p.dias < -10 ? isoDia(somarDias(venc, 1)) : null,
      status: 'pendente',
    });
  }

  const receber = [
    { descricao: 'Parcelamento 3x — Adidas Metalbone', contraparte: 'Juliana Freitas', valor: 830, dias: -4 },
    { descricao: 'Parcelamento 6x — Shark Pro 18K', contraparte: 'Marcos Tavares', valor: 533, dias: 2 },
    { descricao: 'Venda faturada — Arena Beach Fortaleza', contraparte: 'Arena Beach Fortaleza', valor: 6420, dias: 7 },
    { descricao: 'Parcelamento 4x — Conqueror 12', contraparte: 'Renata Alves', valor: 472, dias: 9 },
    { descricao: 'Venda faturada — Escolinha BT Meireles', contraparte: 'Escolinha BT Meireles', valor: 2890, dias: 15 },
    { descricao: 'Parcelamento 10x — kit completo', contraparte: 'Diego Nogueira', valor: 389, dias: 21 },
    { descricao: 'Parcelamento 3x — Adipower BT', contraparte: 'Camila Souza', valor: 563, dias: -22 },
  ];
  for (const p of receber) {
    const venc = somarDias(HOJE, p.dias);
    add({
      tipo: 'receber',
      descricao: p.descricao,
      contraparte: p.contraparte,
      valor: p.valor,
      vencimento: isoDia(venc),
      pagoEm: p.dias < -10 ? isoDia(somarDias(venc, 1)) : null,
      status: 'pendente',
    });
  }

  return out.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export const contas: Conta[] = gerarContas();

/** Saldo inicial de caixa no começo da janela histórica. */
export const SALDO_INICIAL = 38000;

/* ---------- metas de receita da loja, por competência ---------- */
// Deliberadamente ambiciosa: uma meta que já está batida não exercita o
// acompanhamento de ritmo, que é justamente o que precisa ser visto.

export const metasLoja: MetaLoja[] = (() => {
  const out: MetaLoja[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(HOJE.getFullYear(), HOJE.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // meta acompanha a sazonalidade — não faz sentido cobrar julho como dezembro
    out.push({ mes, receita: Math.round((58000 * fatorSazonal(d)) / 500) * 500 });
  }
  return out;
})();
