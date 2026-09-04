/**
 * A FILA DE PENDÊNCIAS DO SÓCIO.
 *
 * Duas coisas que o sistema não resolve sozinho e por isso precisam de um
 * humano decidindo:
 *
 * 1. VENDAS SEM CLIENTE — hoje os três fluxos (Nova Venda, carrinho/maquininha,
 *    Link de Pagamento) já pedem telefone antes de gravar a venda, então isso
 *    devia ser raro: cliente que se recusa a informar, vendedor que pula o
 *    campo, ou venda antiga de antes dessas telas pedirem telefone.
 *
 * 2. LEAD AMBÍGUO — o trigger `venda_fecha_lead` (ver supabase/sql/13) fecha
 *    sozinho um lead aberto quando a venda liga um cliente que tem exatamente
 *    UM negócio em aberto. Quando tem mais de um, ele não escolhe — o cliente
 *    comprou, mas qual dos negócios abertos foi esse? Só quem conversou com o
 *    cliente sabe.
 *
 * Consultas diretas (não passa pela `fonte.ts`/memória): é tela de ação, não
 * de relatório, e o volume aqui é sempre pequeno — não vale a pena carregar
 * tudo em memória só para isto.
 */
import { supabase } from '@/lib/supabase';
import type { FormaPagamento } from '@/painel/types';

export interface VendaSemCliente {
  id: string;
  criadoEm: string;
  produtoNome: string;
  quantidade: number;
  valor: number;
  vendedorNome: string;
  formaPagamento: FormaPagamento;
  canal: string | null;
}

export async function listarVendasSemCliente(): Promise<VendaSemCliente[]> {
  const { data, error } = await supabase.from('venda')
    .select(`
      id, criado_em, quantidade, preco_unit, forma_pagamento, canal,
      produto:produto_id ( nome ), vendedor:vendedor_id ( nome )
    `)
    .is('cliente_id', null)
    .order('criado_em', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((v: any) => ({
    id: v.id,
    criadoEm: v.criado_em,
    produtoNome: v.produto?.nome ?? '(produto removido)',
    quantidade: v.quantidade,
    valor: Number(v.preco_unit) * v.quantidade,
    vendedorNome: v.vendedor?.nome ?? '—',
    formaPagamento: v.forma_pagamento,
    canal: v.canal,
  }));
}

export interface LeadAberto {
  id: string;
  titulo: string;
  etapaNome: string;
}

export interface ClienteLeadAmbiguo {
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string;
  leads: LeadAberto[];
}

/**
 * Clientes com 2+ leads abertos que JÁ compraram — a ambiguidade só vira
 * pendência de verdade depois que existe uma venda pedindo uma resposta.
 * Cliente com vários leads abertos que ainda não comprou nada não é
 * pendência, é só um funil normal em andamento.
 */
export async function listarClientesLeadAmbiguo(): Promise<ClienteLeadAmbiguo[]> {
  const [{ data: leads, error: eLeads }, { data: vendas, error: eVendas }] = await Promise.all([
    supabase.from('lead')
      .select('id, cliente_id, titulo, atualizado_em, etapa:etapa_id ( nome, tipo ), cliente:cliente_id ( nome, telefone )')
      .is('deletado_em', null),
    supabase.from('venda').select('cliente_id').not('cliente_id', 'is', null),
  ]);
  if (eLeads) throw new Error(eLeads.message);
  if (eVendas) throw new Error(eVendas.message);

  const clientesComVenda = new Set((vendas ?? []).map((v: any) => v.cliente_id as string));

  const porCliente = new Map<string, ClienteLeadAmbiguo>();
  for (const l of (leads ?? []) as any[]) {
    if (l.etapa?.tipo !== 'aberta' || !l.cliente_id) continue;

    const atual: ClienteLeadAmbiguo = porCliente.get(l.cliente_id) ?? {
      clienteId: l.cliente_id,
      clienteNome: l.cliente?.nome ?? '(sem nome)',
      clienteTelefone: l.cliente?.telefone ?? '',
      leads: [],
    };
    atual.leads.push({ id: l.id, titulo: l.titulo, etapaNome: l.etapa?.nome ?? l.etapa_id });
    porCliente.set(l.cliente_id, atual);
  }

  return [...porCliente.values()].filter(
    (c) => c.leads.length >= 2 && clientesComVenda.has(c.clienteId),
  );
}

/**
 * Linka o cliente numa venda pendente — mesmo RPC `identificar_cliente` de
 * sempre. Ao gravar `cliente_id` na venda, o trigger `venda_fecha_lead`
 * dispara sozinho: se esse cliente tiver exatamente um lead aberto, fecha
 * junto — não precisa de mais nenhum passo aqui.
 */
export async function linkarClienteNaVenda(
  vendaId: string, telefone: string, nome: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('identificar_cliente', {
    p_telefone_bruto: telefone,
    p_nome: nome,
  });
  if (error) throw new Error(error.message);

  const clienteId = data as string;
  const { error: eUpdate } = await supabase.from('venda')
    .update({ cliente_id: clienteId }).eq('id', vendaId);
  if (eUpdate) throw new Error(eUpdate.message);

  return clienteId;
}
