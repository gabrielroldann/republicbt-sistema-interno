/**
 * AS ESCRITAS DO PAINEL.
 *
 * Cada função de `queries.ts` que muda alguma coisa passa por aqui antes de
 * mexer na memória. Em modo demonstração, isto não faz nada e o mock continua
 * sendo a verdade; com banco ligado, grava e recarrega.
 *
 * POR QUE GRAVAR PRIMEIRO E RECARREGAR DEPOIS, e não o contrário:
 *
 * Se a memória fosse atualizada antes, uma escrita recusada pelo RLS deixaria a
 * tela mostrando um dado que não existe no banco — e o vendedor iria embora
 * achando que registrou a venda. Gravar primeiro faz a recusa aparecer como
 * erro, na hora, que é a única forma honesta.
 *
 * O `recarregar()` puxa tudo de novo. É mais tráfego do que atualizar só a
 * linha que mudou, mas evita a classe inteira de bug em que a memória e o banco
 * divergem — e uma venda tem efeito em estoque, comissão, fluxo de caixa e
 * lucro por raquete ao mesmo tempo.
 */
import { MOCK, supabase } from '@/lib/supabase';
import { recarregar } from './fonte';

/** Erro do Supabase vira exceção com a mensagem original. */
function verificar(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const gravando = () => !MOCK;

/* ------------------------------------------------------------- venda ---- */

export interface VendaParaGravar {
  data: string;
  produtoId: string;
  vendedorId: string;
  clienteId?: string | null;
  quantidade: number;
  precoUnit: number;
  custoUnit: number;
  formaPagamento: string;
  parcelas: number;
  taxaPct: number;
  comissaoPct: number;
  entrega: string;
  canal?: string | null;
  campanhaId?: string | null;
  clienteNome?: string | null;
  clienteFone?: string | null;
  cidade?: string | null;
  tradeInModelo?: string | null;
  tradeInValor?: number;
  observacoes?: string | null;
}

/**
 * Grava a venda e dá baixa no estoque.
 *
 * O movimento de estoque entra junto, aqui, e não por gatilho no banco: assim
 * o mesmo caminho vale para venda pelo painel e venda pelo CRM, e não existe
 * um segundo lugar onde a baixa pode ser esquecida.
 */
export async function gravarVenda(v: VendaParaGravar): Promise<string> {
  if (MOCK) return '';

  // O cliente é identificado pelo telefone — a mesma função que o webhook do
  // WhatsApp usa. Um caminho só: se o painel criasse cliente de um jeito e o
  // webhook de outro, a mesma pessoa viraria dois cadastros.
  let clienteId = v.clienteId ?? null;
  if (!clienteId && v.clienteFone) {
    const { data, error } = await supabase.rpc('identificar_cliente', {
      p_telefone_bruto: v.clienteFone,
      p_nome: v.clienteNome ?? null,
    });
    verificar(error);
    clienteId = data as string;
  }

  const { data: venda, error } = await supabase.from('venda').insert({
    data: v.data,
    produto_id: v.produtoId,
    vendedor_id: v.vendedorId,
    cliente_id: clienteId,
    quantidade: v.quantidade,
    preco_unit: v.precoUnit,
    custo_unit: v.custoUnit,
    forma_pagamento: v.formaPagamento,
    parcelas: v.parcelas,
    taxa_pct: v.taxaPct,
    comissao_pct: v.comissaoPct,
    entrega: v.entrega,
    canal: v.canal ?? null,
    campanha_id: v.campanhaId ?? null,
    trade_in_modelo: v.tradeInModelo ?? null,
    trade_in_valor: v.tradeInValor ?? 0,
    observacoes: v.observacoes ?? null,
  }).select('id').single();
  verificar(error);
  if (!venda) throw new Error('a venda não foi gravada');

  const { error: mov } = await supabase.from('movimento_estoque').insert({
    produto_id: v.produtoId,
    quantidade: -v.quantidade,
    tipo: 'venda',
    custo_unit: v.custoUnit,
    venda_id: venda.id,
  });
  verificar(mov);

  await recarregar();
  return venda.id as string;
}

export async function gravarPagamento(
  vendaId: string, data: string, valor: number, forma: string,
) {
  if (MOCK) return;
  const { error } = await supabase.from('pagamento')
    .insert({ venda_id: vendaId, data, valor, forma });
  verificar(error);
  await recarregar();
}

export async function gravarEntrega(vendaId: string, entregue: boolean) {
  if (MOCK) return;
  const { error } = await supabase.from('venda')
    .update({ entrega: entregue ? 'entregue' : 'pendente' }).eq('id', vendaId);
  verificar(error);
  await recarregar();
}

/* ----------------------------------------------------------- produto ---- */

export async function gravarProduto(id: string | null, p: {
  sku: string; nome: string; marca: string; categoria: string;
  custo: number; preco: number; estoqueMin: number;
}): Promise<string> {
  if (MOCK) return id ?? '';
  const campos = {
    sku: p.sku, nome: p.nome, marca: p.marca, categoria: p.categoria,
    custo: p.custo, preco: p.preco, estoque_min: p.estoqueMin,
  };
  const r = id
    ? await supabase.from('produto').update(campos).eq('id', id).select('id').single()
    : await supabase.from('produto').insert({ ...campos, ativo: true }).select('id').single();
  verificar(r.error);
  if (!r.data) throw new Error('o produto não foi gravado');
  await recarregar();
  return r.data.id as string;
}

export async function gravarArquivarProduto(id: string) {
  if (MOCK) return;
  const { error } = await supabase.from('produto').update({ ativo: false }).eq('id', id);
  verificar(error);
  await recarregar();
}

export async function gravarMovimento(m: {
  produtoId: string; quantidade: number; tipo: string;
  custoUnit?: number | null; frete?: number; observacao?: string | null;
}) {
  if (MOCK) return;
  const { error } = await supabase.from('movimento_estoque').insert({
    produto_id: m.produtoId, quantidade: m.quantidade, tipo: m.tipo,
    custo_unit: m.custoUnit ?? null, frete_rateado: m.frete ?? 0,
    observacao: m.observacao ?? null,
  });
  verificar(error);
  await recarregar();
}

/** O custo médio ponderado é calculado na aplicação e gravado aqui. */
export async function gravarCustoProduto(produtoId: string, custo: number) {
  if (MOCK) return;
  const { error } = await supabase.from('produto').update({ custo }).eq('id', produtoId);
  verificar(error);
}

/* ----------------------------------------------------------- despesa ---- */

export async function gravarDespesa(id: string | null, d: {
  data: string; descricao: string; categoria: string; valor: number;
}) {
  if (MOCK) return;
  const r = id
    ? await supabase.from('despesa').update(d).eq('id', id)
    : await supabase.from('despesa').insert({ ...d, recorrente: false });
  verificar(r.error);
  await recarregar();
}

export async function gravarExcluirDespesa(id: string) {
  if (MOCK) return;
  const { error } = await supabase.from('despesa').delete().eq('id', id);
  verificar(error);
  await recarregar();
}

/* ------------------------------------------------------------- conta ---- */

export async function gravarConta(id: string | null, c: {
  tipo: string; descricao: string; contraparte: string;
  valor: number; vencimento: string;
}) {
  if (MOCK) return;
  const r = id
    ? await supabase.from('conta').update(c).eq('id', id)
    : await supabase.from('conta').insert(c);
  verificar(r.error);
  await recarregar();
}

export async function gravarExcluirConta(id: string) {
  if (MOCK) return;
  const { error } = await supabase.from('conta').delete().eq('id', id);
  verificar(error);
  await recarregar();
}

export async function gravarLiquidarConta(id: string, pagoEm: string | null) {
  if (MOCK) return;
  const { error } = await supabase.from('conta').update({ pago_em: pagoEm }).eq('id', id);
  verificar(error);
  await recarregar();
}

/* -------------------------------------------------------- custo fixo ---- */

export async function gravarCustoFixo(id: string | null, c: {
  nome: string; categoria: string; valorMensal: number; ativo: boolean;
}, mes: string) {
  if (MOCK) return;
  const campos = {
    nome: c.nome, categoria: c.categoria,
    valor_mensal: c.valorMensal, ativo: c.ativo,
  };
  const r = id
    ? await supabase.from('custo_fixo').update(campos).eq('id', id)
    : await supabase.from('custo_fixo').insert(campos);
  verificar(r.error);

  // O modelo mudou: a despesa do mês corrente acompanha. Meses fechados não —
  // reajustar o aluguel hoje não pode reescrever o que se pagou em março.
  const { error } = await supabase.rpc('aplicar_custos_fixos', { p_mes: mes });
  verificar(error);
  await recarregar();
}

/* -------------------------------------------------------- gasto mídia --- */

/**
 * O gasto é por DIA no banco e por MÊS na tela.
 *
 * Guardo no dia 1º da competência: a Meta cobra diariamente, mas orçamento se
 * decide por mês, e distribuir o total pelos 30 dias inventaria um detalhe que
 * ninguém tem.
 */
export async function gravarCustoMidia(campanhaId: string, mes: string, gasto: number) {
  if (MOCK) return;
  const { error } = await supabase.from('custo_midia').upsert({
    data: `${mes}-01`, campanha_id: campanhaId, gasto, origem: 'manual',
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'data,campanha_id' });
  verificar(error);
  await recarregar();
}

/* ---------------------------------------------------------- vendedor ---- */

export async function gravarVendedor(id: string | null, v: {
  nome: string; iniciais: string; metaMensal: number; comissaoPct: number;
}): Promise<string> {
  if (MOCK) return id ?? '';
  const campos = {
    nome: v.nome, iniciais: v.iniciais,
    meta_mensal: v.metaMensal, comissao_pct: v.comissaoPct,
  };
  const r = id
    ? await supabase.from('vendedor').update(campos).eq('id', id).select('id').single()
    : await supabase.from('vendedor').insert({ ...campos, ativo: true }).select('id').single();
  verificar(r.error);
  if (!r.data) throw new Error('o vendedor não foi gravado');
  await recarregar();
  return r.data.id as string;
}

export async function gravarVendedorAtivo(id: string, ativo: boolean) {
  if (MOCK) return;
  const { error } = await supabase.from('vendedor').update({ ativo }).eq('id', id);
  verificar(error);
  await recarregar();
}

/* ---------------------------------------------------------------- meta -- */

export async function gravarMeta(mes: string, receita: number) {
  if (MOCK) return;
  const { error } = await supabase.from('meta_loja')
    .upsert({ mes, receita }, { onConflict: 'mes' });
  verificar(error);
  await recarregar();
}
