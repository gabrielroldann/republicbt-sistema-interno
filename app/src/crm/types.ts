/** Modelo do CRM. Espelha as tabelas de `supabase/sql/02-crm.sql`. */

export type TipoEtapa = 'aberta' | 'ganho' | 'perdido';

export type CorEtapa =
  | 'navy' | 'gold' | 'positive' | 'negative' | 'attention' | 'info' | 'neutral';

export interface Etapa {
  id: string;
  nome: string;
  ordem: number;
  tipo: TipoEtapa;
  cor: CorEtapa;
}

export interface MotivoPerda {
  id: string;
  nome: string;
  ordem: number;
}

export interface Vendedor {
  id: string;
  nome: string;
  iniciais: string;
  ativo: boolean;
}

export interface Campanha {
  id: string;
  nome: string;
  canal: 'meta' | 'google' | 'organico' | 'indicacao' | 'loja' | 'site' | 'outro';
}

export interface Cliente {
  id: string;
  telefone: string | null;
  nome: string | null;
  /** campanha que trouxe a PESSOA, congelada no primeiro toque */
  campanhaOrigem: string | null;
  primeiroContatoEm: string;
}

export interface Lead {
  id: string;
  clienteId: string;
  titulo: string | null;
  valor: number | null;
  etapaId: string;
  responsavelId: string | null;
  /** campanha que gerou ESTE lead. Congelada na criação. */
  campanhaId: string | null;
  utmContent: string | null;
  motivoPerdaId: string | null;
  criadoEm: string;
  fechadoEm: string | null;
  atualizadoEm: string;
}

/** Lead já resolvido com cliente, campanha e vendedor — o que as telas usam. */
export interface LeadCompleto extends Lead {
  cliente: Cliente;
  campanha: Campanha | null;
  responsavel: Vendedor | null;
  /** dias desde a última mexida. É o sinal de lead esquecido. */
  diasParado: number;
  temConversaAberta: boolean;
}

export interface ColunaFunil {
  etapa: Etapa;
  leads: LeadCompleto[];
  valor: number;
}

/** O que a captura rápida precisa. Quanto menos campo, mais gente usa. */
export interface NovoLeadInput {
  telefone: string;
  nome?: string;
  titulo?: string;
  valor?: number;
  campanhaId?: string;
  responsavelId?: string;
}

/** Uma compra fechada — o que o histórico do cliente mostra. */
export interface Compra {
  id: string;
  data: string;
  descricao: string;
  valor: number;
}

/** O lead com o histórico da PESSOA por trás dele. */
export interface LeadDetalhe extends LeadCompleto {
  /** outros leads do mesmo cliente, do mais recente ao mais antigo */
  outrosLeads: LeadCompleto[];
  compras: Compra[];
  totalComprado: number;
}

/* ─────────────────────────────────────────────────── caixa de entrada ─── */

/**
 * Um número por onde a loja fala.
 *
 *   loja      o número do anúncio, na API oficial. Só RECEBE o primeiro
 *             contato — é o único lugar onde o ctwa_clid existe.
 *   vendedor  o chip que o vendedor leva no celular, pareado por QR. É a única
 *             via em que a conversa aparece ao mesmo tempo no CRM e no
 *             aplicativo dele.
 */
export interface Canal {
  id: string;
  nome: string;
  tipo: 'loja' | 'vendedor';
  via: 'cloud_api' | 'evolution';
  telefone: string;
  vendedorId: string | null;
  ativo: boolean;
}

export type StatusConversa = 'nova' | 'em_atendimento' | 'resolvida';

export interface Conversa {
  id: string;
  canalId: string;
  clienteId: string;
  leadId: string | null;
  telefone: string;
  status: StatusConversa;
  /** nulo = ninguém assumiu. É esta coluna que impede a resposta dupla. */
  atendenteId: string | null;
  naoLidas: number;
  ultimaMensagemEm: string | null;
  /** separado de propósito: a janela de 24h conta a partir do CLIENTE */
  ultimaMensagemClienteEm: string | null;
  criadaEm: string;
}

/** A conversa como a lista precisa: sem uma consulta por linha. */
export interface ConversaCompleta extends Conversa {
  canal: Canal;
  cliente: Cliente;
  atendente: Vendedor | null;
  campanha: Campanha | null;
  ultimaMensagem: string | null;
  ultimaDirecao: DirecaoMensagem | null;
  /**
   * Derivada, nunca guardada. Só existe no canal `cloud_api`: fora dela não
   * sai texto livre, só template aprovado — e o vendedor precisa saber disso
   * ANTES de digitar, não depois de a mensagem não sair.
   */
  janelaAberta: boolean;
  janelaExpiraEm: string | null;
}

export type DirecaoMensagem = 'entrada' | 'saida';

export type TipoMensagem =
  | 'texto' | 'imagem' | 'audio' | 'video' | 'documento'
  | 'localizacao' | 'contato' | 'sistema' | 'outro';

export interface Mensagem {
  id: string;
  conversaId: string;
  direcao: DirecaoMensagem;
  tipo: TipoMensagem;
  conteudo: string | null;
  midiaUrl: string | null;
  status: 'enviada' | 'entregue' | 'lida' | 'falhou';
  erro: string | null;
  autorId: string | null;
  /** o relógio do WhatsApp, não o nosso: é por ele que a thread ordena */
  enviadaEm: string;
}
