/**
 * EMISSÃO DE NFC-e (Focus NFe) A PARTIR DE UMA VENDA JÁ GRAVADA.
 *
 * Fica separado de `escritas.ts` de propósito: gravar a venda e emitir a nota
 * são duas coisas que podem falhar independentemente (o estoque já baixou, o
 * dinheiro já foi combinado — a nota pode falhar e ser reemitida depois sem
 * desfazer a venda). Misturar os dois faria um erro de nota parecer um erro
 * de venda.
 */
import { supabase } from '@/lib/supabase';

export interface RespostaFocusNFe {
  status?: 'autorizado' | 'erro_autorizacao';
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  url_danfe?: string;
}

export interface ResultadoEmissaoNFe {
  status_http: number;
  resposta?: RespostaFocusNFe;
  erro?: string;
}

/**
 * `ambiente` é 'homologacao' por padrão de propósito: ainda não existe o
 * token de Produção configurado. Trocar pra 'producao' fica explícito no dia
 * em que a loja for vender de verdade — nunca implícito.
 */
export async function emitirNotaFiscal(
  vendaId: string, ambiente: 'homologacao' | 'producao' = 'homologacao',
): Promise<ResultadoEmissaoNFe> {
  const { data, error } = await supabase.functions.invoke('focus-nfe-emitir', {
    body: { vendaId, ambiente },
  });
  if (error) throw new Error(error.message);
  return data as ResultadoEmissaoNFe;
}
