/**
 * O ROTEADOR DA CAMADA DE DADOS.
 *
 * Escolhe entre o banco e os dados de demonstração conforme as variáveis de
 * ambiente estejam definidas. Nenhuma tela, hook ou componente sabe qual dos
 * dois está rodando — foi para isso que a camada existiu desde o começo, e é
 * o que permitiu construir o funil, a caixa de entrada e o custo por raquete
 * meses antes de existir servidor.
 *
 *   sem VITE_SUPABASE_*  →  mock.ts, determinístico, roda offline
 *   com VITE_SUPABASE_*  →  Supabase, com RLS valendo
 *
 * O modo é decidido UMA vez, na carga do módulo. Não existe meio-termo: não dá
 * para uma tela ler do banco e outra do mock, que seria a pior confusão
 * possível de depurar.
 */
import { MOCK } from '@/lib/supabase';
import * as mock from './mock-queries';
import * as banco from './supabase-queries';
import type { FiltrosCaixa } from './tipos';

export { normalizarTelefone, formatarTelefone, linkWhatsApp } from '@/lib/telefone';
export { preencherMarcadores, MARCADORES } from './mock-queries';
export type { AtualizarLeadInput, FiltrosCaixa, FiltrosFunil } from './tipos';
export type { AtualizarClienteInput, HistoricoCliente } from './mock-queries';

/** A fonte escolhida. Trocar isto é trocar o sistema inteiro de origem. */
const fonte = MOCK ? mock : (banco as unknown as typeof mock);

/* listas */
export const getEtapas = fonte.getEtapas;
export const getMotivosPerda = fonte.getMotivosPerda;
export const getVendedores = fonte.getVendedores;
export const getCampanhas = fonte.getCampanhas;
export const getClientes = fonte.getClientes;
export const atualizarCliente = fonte.atualizarCliente;
export const excluirCliente = fonte.excluirCliente;
export const getHistoricoCliente = fonte.getHistoricoCliente;
export const excluirClienteComHistorico = fonte.excluirClienteComHistorico;
export const getCanais = fonte.getCanais;

/* funil */
export const getFunil = fonte.getFunil;
export const getLead = fonte.getLead;
export const getLeadDetalhe = fonte.getLeadDetalhe;
export const getContagemPorEtapa = fonte.getContagemPorEtapa;

/* escrita do lead */
export const moverLead = fonte.moverLead;
export const criarLead = fonte.criarLead;
export const atribuirLead = fonte.atribuirLead;
export const atualizarLead = fonte.atualizarLead;

/* configuração do funil */
export const criarEtapa = fonte.criarEtapa;
export const renomearEtapa = fonte.renomearEtapa;
export const reordenarEtapas = fonte.reordenarEtapas;
export const excluirEtapa = fonte.excluirEtapa;

/* caixa de entrada */
export const getConversas = fonte.getConversas;
export const getConversa = fonte.getConversa;
export const getConversasDoCliente = fonte.getConversasDoCliente;
export const getMensagens = fonte.getMensagens;
export const assumirConversa = fonte.assumirConversa;
export const liberarConversa = fonte.liberarConversa;
export const excluirConversa = fonte.excluirConversa;
export const marcarLida = fonte.marcarLida;
export const enviarMensagem = fonte.enviarMensagem;
export const abrirNoMeuNumero = fonte.abrirNoMeuNumero;

/* mensagem padrão do vendedor */
export const getMensagemPadrao = fonte.getMensagemPadrao;
export const setMensagemPadrao = fonte.setMensagemPadrao;

/**
 * Total de mensagens não lidas — para o sininho da barra lateral.
 *
 * Não é uma consulta própria: reaproveita `getConversas`, que já é a fonte
 * única de "o que este usuário enxerga" (mock espelha o RLS; no banco é o
 * RLS de verdade). Duplicar o filtro de visibilidade aqui seria a mesma
 * regra escrita duas vezes, e ela já divergiu uma vez entre tela e banco no
 * passado.
 */
export async function contarNaoLidas(f: FiltrosCaixa): Promise<number> {
  const conversas = await fonte.getConversas(f);
  return conversas.reduce((soma, c) => soma + c.naoLidas, 0);
}
