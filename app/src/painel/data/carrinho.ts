/**
 * O CARRINHO DO VENDEDOR.
 *
 * Diferente do resto do painel (`fonte.ts`), que carrega tudo em memória e
 * recarrega inteiro a cada escrita: o carrinho é do momento, de um vendedor só,
 * e muda a cada toque. Carregar o painel inteiro de novo a cada item adicionado
 * seria lento e traria dado de gente nenhuma tem nada a ver (vendas de outro
 * vendedor, despesas, etc). Aqui é leitura e escrita direto no Supabase, do
 * jeito que o CRM já faz em `crm/data/supabase-queries.ts`.
 */
import { supabase } from '@/lib/supabase';

export type StatusCarrinho =
  | 'aberto' | 'enviado_para_maquininha' | 'pago' | 'expirado' | 'cancelado';

export interface ItemCarrinho {
  id: string;
  produtoId: string;
  sku: string;
  nome: string;
  quantidade: number;
  precoUnit: number;
}

export interface Carrinho {
  id: string;
  vendedorId: string;
  status: StatusCarrinho;
  cieloOrderId: string | null;
  clienteId: string | null;
  itens: ItemCarrinho[];
}

/**
 * O carrinho ABERTO do vendedor — cria um se não existir nenhum.
 *
 * Um vendedor pode ter só um carrinho aberto por vez: abrir um segundo antes de
 * fechar o primeiro faria os itens se misturarem entre dois atendimentos.
 */
export async function getOuCriarCarrinhoAberto(vendedorId: string): Promise<Carrinho> {
  const existente = await buscarCarrinhoAberto(vendedorId);
  if (existente) return existente;

  const { data, error } = await supabase.from('carrinho')
    .insert({ vendedor_id: vendedorId, status: 'aberto' })
    .select('id, vendedor_id, status, cielo_order_id, cliente_id').single();
  if (error) throw new Error(error.message);

  return {
    id: data.id, vendedorId: data.vendedor_id, status: data.status,
    cieloOrderId: null, clienteId: data.cliente_id, itens: [],
  };
}

async function buscarCarrinhoAberto(vendedorId: string): Promise<Carrinho | null> {
  const { data: carrinho, error } = await supabase.from('carrinho')
    .select('id, vendedor_id, status, cielo_order_id, cliente_id')
    .eq('vendedor_id', vendedorId)
    .in('status', ['aberto', 'enviado_para_maquininha'])
    .order('criado_em', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!carrinho) return null;

  return { ...(await carregarItens(carrinho.id)), id: carrinho.id, vendedorId: carrinho.vendedor_id,
    status: carrinho.status, cieloOrderId: carrinho.cielo_order_id, clienteId: carrinho.cliente_id };
}

/** Recarrega um carrinho específico pelo id — usado ao "verificar pagamento". */
export async function buscarCarrinho(carrinhoId: string): Promise<Carrinho> {
  const { data: c, error } = await supabase.from('carrinho')
    .select('id, vendedor_id, status, cielo_order_id, cliente_id').eq('id', carrinhoId).single();
  if (error) throw new Error(error.message);
  return { ...(await carregarItens(c.id)), id: c.id, vendedorId: c.vendedor_id,
    status: c.status, cieloOrderId: c.cielo_order_id, clienteId: c.cliente_id };
}

async function carregarItens(carrinhoId: string): Promise<{ itens: ItemCarrinho[] }> {
  const { data, error } = await supabase.from('carrinho_item')
    .select('id, produto_id, quantidade, preco_unit, produto:produto_id ( sku, nome )')
    .eq('carrinho_id', carrinhoId).order('criado_em', { ascending: true });
  if (error) throw new Error(error.message);
  return {
    itens: (data ?? []).map((i: any) => ({
      id: i.id, produtoId: i.produto_id, quantidade: i.quantidade, precoUnit: Number(i.preco_unit),
      sku: i.produto?.sku ?? '', nome: i.produto?.nome ?? '(produto removido)',
    })),
  };
}

/**
 * Adiciona um item — ou soma na quantidade, se o produto já está no carrinho.
 * Duas linhas para a mesma raquete no mesmo carrinho não ajudam ninguém a ler.
 */
export async function adicionarItem(
  carrinhoId: string, produtoId: string, precoUnit: number,
): Promise<void> {
  const { data: existente, error: eBusca } = await supabase.from('carrinho_item')
    .select('id, quantidade').eq('carrinho_id', carrinhoId).eq('produto_id', produtoId).maybeSingle();
  if (eBusca) throw new Error(eBusca.message);

  if (existente) {
    const { error } = await supabase.from('carrinho_item')
      .update({ quantidade: existente.quantidade + 1 }).eq('id', existente.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('carrinho_item')
    .insert({ carrinho_id: carrinhoId, produto_id: produtoId, quantidade: 1, preco_unit: precoUnit });
  if (error) throw new Error(error.message);
}

/** Quantidade zero remove a linha — não existe item com "0 unidades" no carrinho. */
export async function definirQuantidade(itemId: string, quantidade: number): Promise<void> {
  if (quantidade <= 0) {
    const { error } = await supabase.from('carrinho_item').delete().eq('id', itemId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from('carrinho_item').update({ quantidade }).eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function removerItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('carrinho_item').delete().eq('id', itemId);
  if (error) throw new Error(error.message);
}

/** Esvazia o carrinho sem fechar — "recomeçar" sem perder o registro do carrinho em si. */
export async function esvaziarCarrinho(carrinhoId: string): Promise<void> {
  const { error } = await supabase.from('carrinho_item').delete().eq('carrinho_id', carrinhoId);
  if (error) throw new Error(error.message);
}

export async function cancelarCarrinho(carrinhoId: string): Promise<void> {
  const { error } = await supabase.from('carrinho').update({ status: 'cancelado' }).eq('id', carrinhoId);
  if (error) throw new Error(error.message);
}

/**
 * Identifica o cliente pelo telefone — mesmo RPC que `gravarVenda` (Nova
 * Venda) e o webhook do WhatsApp usam. Um caminho só pra achar-ou-criar
 * cliente: assim a mesma pessoa nunca vira dois cadastros por ter comprado
 * por telas diferentes.
 */
export async function identificarClienteDoCarrinho(
  carrinhoId: string, telefone: string, nome: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('identificar_cliente', {
    p_telefone_bruto: telefone,
    p_nome: nome,
  });
  if (error) throw new Error(error.message);

  const clienteId = data as string;
  const { error: eUpdate } = await supabase.from('carrinho')
    .update({ cliente_id: clienteId }).eq('id', carrinhoId);
  if (eUpdate) throw new Error(eUpdate.message);

  return clienteId;
}

/**
 * Envia para a maquininha (Cielo Sandbox) via Edge Function.
 * A função do servidor confere dono do carrinho, monta o pedido e devolve o id
 * Cielo — aqui só repassa o resultado.
 */
export async function enviarParaMaquininha(carrinhoId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('cielo-criar-pedido', { body: { carrinhoId } });
  if (error) throw new Error(error.message);
}

export interface ResultadoConfirmacao {
  ok: boolean;
  status?: string;
  vendaIds?: string[];
}

/**
 * Pergunta à Cielo se o pedido já foi pago, e se sim grava a venda.
 *
 * Não há webhook registrado do lado da Cielo para o Sandbox (isso exige
 * contato manual com o suporte deles) — por isso é o vendedor que aperta
 * "verificar pagamento" depois de passar o cartão, em vez do sistema descobrir
 * sozinho.
 */
export async function verificarPagamento(carrinhoId: string): Promise<ResultadoConfirmacao> {
  const { data, error } = await supabase.functions.invoke('cielo-confirmar-venda', { body: { carrinhoId } });
  if (error) throw new Error(error.message);
  return data as ResultadoConfirmacao;
}

/**
 * SÓ EXISTE PARA TESTE NO SANDBOX.
 *
 * Sem maquininha física por perto, não existe quem "pague" o pedido — a
 * própria Cielo documenta um endpoint (`POST /orders/{id}/transactions`)
 * exclusivo do Sandbox pra simular isso manualmente. Esta função chama a
 * Edge Function que faz essa simulação e já marca o pedido como pago.
 *
 * Some sozinha quando a produção tiver o Merchant ID real: essa chamada
 * passa a ser recusada pela Cielo, porque o recurso só existe em Sandbox.
 */
export async function simularPagamento(carrinhoId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('cielo-simular-pagamento', { body: { carrinhoId } });
  if (error) throw new Error(error.message);
}
