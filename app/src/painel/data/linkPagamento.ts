/**
 * CRIAÇÃO DE LINK DE PAGAMENTO (CIELO) A PARTIR DO PAINEL.
 *
 * Separado de `notaFiscal.ts` e `escritas.ts` pelo mesmo motivo: criar o link
 * é uma chamada de rede pra fora que pode falhar sozinha, sem relação com o
 * resto do sistema até o pagamento realmente acontecer (aí sim vira venda,
 * do outro lado do webhook — ver Edge Function `cielo-link-notificacao`).
 */
import { supabase } from '@/lib/supabase';

export interface ItemLinkPagamento {
  produtoId: string;
  quantidade: number;
}

export interface ResultadoCriarLink {
  ok: boolean;
  pedidoLinkId?: string;
  linkUrl?: string | null;
  orderNumber?: string;
  aviso?: string;
  error?: string;
}

export async function criarLinkPagamento(
  itens: ItemLinkPagamento[], clienteId?: string | null,
): Promise<ResultadoCriarLink> {
  const { data, error } = await supabase.functions.invoke('cielo-link-criar', {
    body: { itens, clienteId: clienteId ?? null },
  });
  if (error) throw new Error(error.message);
  return data as ResultadoCriarLink;
}
