/**
 * A FONTE DOS DADOS DO PAINEL.
 *
 * As 48 funções de `queries.ts` fazem AGREGAÇÃO: margem, comissão sobre o
 * recebido, custo médio ponderado, rateio de estrutura, ponto de equilíbrio.
 * Essa é a parte testada do sistema — é onde os bugs de dinheiro moram, e onde
 * eu já cacei vários.
 *
 * Por isso a troca para o Supabase mexe na FONTE, não nas contas: este módulo
 * enche os mesmos arrays que o gerador de demonstração enchia, e todo o resto
 * continua rodando por cima, sem uma linha alterada. Reescrever as agregações
 * em SQL teria refeito justamente as contas que já estão certas.
 *
 * O CUSTO DESSA ESCOLHA, dito na cara: carrega tudo em memória. Funciona bem
 * até uns 10 mil registros — dois anos de loja, mais ou menos. Passando disso,
 * as agregações viram views no banco e este arquivo some. Não é a arquitetura
 * final; é a certa para o tamanho de agora.
 *
 * Os arrays são MUTADOS no lugar (`splice`/`push`), nunca reatribuídos: quem já
 * importou a referência continua enxergando o conteúdo novo. Trocar por um
 * array novo deixaria metade do app olhando para o antigo.
 */
import { MOCK, supabase } from '@/lib/supabase';
import {
  campanhas, contas, custosFixos, custosMidia, despesas, leadsMock, metasLoja,
  movimentos, pagamentos, produtos, vendas, vendedores,
} from './mock';
import type { Categoria, FormaPagamento } from '@/painel/types';

/* Substitui o conteúdo sem trocar a referência do array. */
function repor<T>(alvo: T[], novos: T[]) {
  alvo.splice(0, alvo.length, ...novos);
}

const n = (v: unknown) => Number(v ?? 0);

/** Erro do Supabase vira exceção: silêncio aqui vira tela vazia lá. */
function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

let carregado = false;

/**
 * Carrega o banco para a memória.
 *
 * Idempotente por padrão: as telas chamam sem se coordenar, e recarregar a
 * cada uma multiplicaria o tráfego por dez sem mudar nada na tela.
 */
export async function carregar(forcar = false): Promise<void> {
  if (MOCK) return;                 // o gerador já preencheu tudo na importação
  if (carregado && !forcar) return;

  // Em paralelo: são tabelas independentes e esperar uma de cada vez
  // multiplicaria a latência pelo número de consultas.
  const [
    rVendedores, rProdutos, rMovimentos, rVendas, rPagamentos,
    rDespesas, rContas, rMetas, rCampanhas, rCustoMidia, rCustosFixos, rLeads,
  ] = await Promise.all([
    supabase.from('vendedor').select('*'),
    supabase.from('produto').select('*'),
    supabase.from('movimento_estoque').select('*'),
    // `venda` não guarda nome nem cidade: guarda `cliente_id`. O nome vem do
    // join — duplicá-lo na venda faria o cadastro e o histórico divergirem
    // assim que alguém corrigisse a grafia de um nome.
    supabase.from('venda').select('*, cliente:cliente_id ( nome, cidade )'),
    supabase.from('pagamento').select('*'),
    supabase.from('despesa').select('*'),
    supabase.from('conta').select('*'),
    supabase.from('meta_loja').select('*'),
    supabase.from('campanha').select('*'),
    supabase.from('custo_midia').select('*'),
    supabase.from('custo_fixo').select('*'),
    supabase.from('lead').select('id, campanha_id, criado_em, cliente_id'),
  ]);

  repor(vendedores, ok<any[]>(rVendedores).map((v) => ({
    id: v.id, nome: v.nome, iniciais: v.iniciais,
    metaMensal: n(v.meta_mensal), comissaoPct: n(v.comissao_pct), ativo: v.ativo,
  })));

  repor(produtos, ok<any[]>(rProdutos).map((p) => ({
    id: p.id, sku: p.sku, nome: p.nome, categoria: p.categoria as Categoria,
    marca: p.marca, custo: n(p.custo), preco: n(p.preco),
    estoqueMin: p.estoque_min, ativo: p.ativo,
  })));

  repor(movimentos, ok<any[]>(rMovimentos).map((m) => ({
    id: m.id, produtoId: m.produto_id, quantidade: m.quantidade, tipo: m.tipo,
    custoUnit: m.custo_unit == null ? null : n(m.custo_unit),
    freteRateado: n(m.frete_rateado), vendaId: m.venda_id,
    observacao: m.observacao,
    // O painel filtra por dia; a hora não entra em nenhuma conta.
    data: String(m.criado_em).slice(0, 10),
  })));

  repor(vendas, ok<any[]>(rVendas).map((v) => ({
    id: v.id, data: v.data, produtoId: v.produto_id, vendedorId: v.vendedor_id,
    quantidade: v.quantidade, precoUnit: n(v.preco_unit), custoUnit: n(v.custo_unit),
    formaPagamento: v.forma_pagamento as FormaPagamento, parcelas: v.parcelas,
    comissaoPct: n(v.comissao_pct), taxaPct: n(v.taxa_pct), entrega: v.entrega,
    clienteNome: v.cliente?.nome ?? undefined, cidade: v.cliente?.cidade ?? undefined,
    canal: v.canal ?? undefined, campanhaId: v.campanha_id ?? null,
    observacoes: v.observacoes ?? undefined,
    tradeIn: n(v.trade_in_valor) > 0
      ? { modelo: v.trade_in_modelo ?? '', valorCredito: n(v.trade_in_valor),
          recebida: v.trade_in_recebida }
      : undefined,
  })));

  repor(pagamentos, ok<any[]>(rPagamentos).map((p) => ({
    id: p.id, vendaId: p.venda_id, data: p.data,
    valor: n(p.valor), forma: p.forma as FormaPagamento,
  })));

  repor(despesas, ok<any[]>(rDespesas).map((d) => ({
    id: d.id, data: d.data, descricao: d.descricao, categoria: d.categoria,
    valor: n(d.valor), recorrente: d.recorrente, custoFixoId: d.custo_fixo_id ?? null,
  })));

  repor(contas, ok<any[]>(rContas).map((c) => ({
    id: c.id, tipo: c.tipo, descricao: c.descricao, contraparte: c.contraparte,
    valor: n(c.valor), vencimento: c.vencimento, pagoEm: c.pago_em ?? null,
    // Derivado na leitura, como a view `v_conta`: status guardado envelhece.
    status: 'pendente' as const,
  })));

  repor(metasLoja, ok<any[]>(rMetas).map((m) => ({ mes: m.mes, receita: n(m.receita) })));

  repor(campanhas, ok<any[]>(rCampanhas).map((c) => ({
    id: c.id, nome: c.nome, canal: c.canal, ativa: c.ativa,
    metaAdId: c.meta_ad_id ?? null,
  })));

  // `custo_midia` é por DIA no banco e por MÊS no painel: a Meta cobra diário,
  // mas orçamento se decide por mês. A soma acontece aqui.
  const porMes = new Map<string, number>();
  for (const c of ok<any[]>(rCustoMidia)) {
    const chave = `${c.campanha_id}|${String(c.data).slice(0, 7)}`;
    porMes.set(chave, (porMes.get(chave) ?? 0) + n(c.gasto));
  }
  repor(custosMidia, [...porMes.entries()].map(([chave, gasto]) => {
    const corte = chave.lastIndexOf('|');
    return { campanhaId: chave.slice(0, corte), mes: chave.slice(corte + 1), gasto };
  }));

  repor(custosFixos, ok<any[]>(rCustosFixos).map((c) => ({
    id: c.id, nome: c.nome, categoria: c.categoria,
    valorMensal: n(c.valor_mensal), ativo: c.ativo,
  })));

  repor(leadsMock, ok<any[]>(rLeads).map((l) => ({
    id: l.id, campanhaId: l.campanha_id ?? 'nao_rastreado',
    data: String(l.criado_em).slice(0, 10),
    // A ligação lead → venda é feita pelo cliente, não por uma coluna: a venda
    // guarda `cliente_id` e o lead também. Aqui só o que a conta de conversão
    // precisa — quantos leads cada campanha trouxe.
    vendaId: null,
  })));

  // Os índices de `queries.ts` apontam para o conteúdo ANTIGO até aqui.
  //
  // Sem esta linha o painel mostra zero onde há dado: foi exatamente o que
  // aconteceu — 487 pagamentos no banco e "Recebido R$ 0,00" na tela, sem erro
  // nenhum. Import dinâmico para não criar ciclo entre fonte e queries.
  const { reindexar } = await import('./queries');
  reindexar();

  carregado = true;
}

/** Depois de escrever, a memória precisa alcançar o banco. */
export async function recarregar() {
  await carregar(true);
}
