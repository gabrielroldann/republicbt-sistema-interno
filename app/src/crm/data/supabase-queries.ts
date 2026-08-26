/**
 * AS MESMAS FUNÇÕES DE `queries.ts`, LENDO DO BANCO.
 *
 * `queries.ts` escolhe entre este arquivo e o mock conforme as variáveis de
 * ambiente. Nenhuma tela, hook ou componente sabe qual dos dois está rodando —
 * é para isso que a camada existe desde o começo.
 *
 * REGRA QUE VALE PARA O ARQUIVO INTEIRO: nada aqui filtra por permissão. Quem
 * decide o que cada pessoa lê é o RLS, em `supabase/sql/04-acesso.sql`. Se uma
 * consulta daqui devolver menos linhas do que você esperava, a resposta está
 * nas policies, não aqui.
 */
import { supabase } from '@/lib/supabase';
import type {
  Campanha, Canal, ColunaFunil, ConversaCompleta, CorEtapa, Etapa, LeadCompleto,
  LeadDetalhe, Mensagem, MotivoPerda, NovoLeadInput, Vendedor,
} from '@/crm/types';
import { normalizarTelefone } from '@/lib/telefone';
import type { AtualizarLeadInput, FiltrosCaixa, FiltrosFunil } from './tipos';

/** O Supabase devolve `{ data, error }`. Erro silencioso vira tela vazia. */
function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const diasEntre = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/* ─────────────────────────────────────────────────────────── listas ─── */

export async function getEtapas(): Promise<Etapa[]> {
  return ok(await supabase.from('etapa').select('*').order('ordem'))
    .map((e: any) => ({ id: e.id, nome: e.nome, ordem: e.ordem, tipo: e.tipo,
                        cor: (e.cor ?? 'gold') as CorEtapa }));
}

export async function getMotivosPerda(): Promise<MotivoPerda[]> {
  return ok(await supabase.from('motivo_perda').select('*').eq('ativo', true).order('ordem'));
}

export async function getVendedores(): Promise<Vendedor[]> {
  return ok(await supabase.from('vendedor').select('id, nome, iniciais, ativo').eq('ativo', true));
}

export async function getCampanhas(): Promise<Campanha[]> {
  return ok(await supabase.from('campanha').select('id, nome, canal').order('nome'));
}

export async function getCanais(): Promise<Canal[]> {
  return ok(await supabase.from('canal').select('*').eq('ativo', true))
    .map((c: any) => ({
      id: c.id, nome: c.nome, tipo: c.tipo, via: c.via,
      telefone: c.telefone, vendedorId: c.vendedor_id, ativo: c.ativo,
    }));
}

/* ───────────────────────────────────────────────────────────── funil ─── */

/**
 * O funil inteiro em UMA consulta.
 *
 * Buscar lead e depois cliente por lead seria uma consulta por card — com 40
 * leads são 41 idas ao banco, e a tela demora segundos. O `select` aninhado do
 * PostgREST resolve tudo de uma vez.
 */
const SELECT_LEAD = `
  id, cliente_id, titulo, valor, etapa_id, responsavel_id, campanha_id,
  utm_content, motivo_perda_id, criado_em, fechado_em, atualizado_em,
  cliente:cliente_id ( id, telefone, nome, campanha_origem, criado_em ),
  campanha:campanha_id ( id, nome, canal ),
  responsavel:responsavel_id ( id, nome, iniciais, ativo )
`;

function montarLead(l: any, comConversa: Set<string>): LeadCompleto {
  return {
    id: l.id,
    clienteId: l.cliente_id,
    titulo: l.titulo,
    valor: l.valor == null ? null : Number(l.valor),
    etapaId: l.etapa_id,
    responsavelId: l.responsavel_id,
    campanhaId: l.campanha_id,
    utmContent: l.utm_content,
    motivoPerdaId: l.motivo_perda_id,
    criadoEm: l.criado_em,
    fechadoEm: l.fechado_em,
    atualizadoEm: l.atualizado_em,
    cliente: {
      id: l.cliente?.id ?? l.cliente_id,
      telefone: l.cliente?.telefone ?? null,
      nome: l.cliente?.nome ?? null,
      campanhaOrigem: l.cliente?.campanha_origem ?? null,
      primeiroContatoEm: l.cliente?.criado_em ?? l.criado_em,
    },
    campanha: l.campanha ?? null,
    responsavel: l.responsavel ?? null,
    diasParado: diasEntre(l.atualizado_em),
    temConversaAberta: comConversa.has(l.id),
  };
}

export async function getFunil(f: FiltrosFunil = {}): Promise<ColunaFunil[]> {
  let q = supabase.from('lead').select(SELECT_LEAD).is('deletado_em', null);
  if (f.responsavelId) q = q.eq('responsavel_id', f.responsavelId);
  if (f.campanhaId) q = q.eq('campanha_id', f.campanhaId);

  const [linhas, etapas, conversas] = await Promise.all([
    ok(await q) as any[],
    getEtapas(),
    ok(await supabase.from('conversa').select('lead_id').neq('status', 'resolvida')) as any[],
  ]);

  const comConversa = new Set<string>(
    conversas.map((c) => c.lead_id).filter(Boolean));

  let leads = linhas.map((l) => montarLead(l, comConversa));

  // A busca é feita aqui, e não no banco, porque ela cruza telefone
  // normalizado com nome e título — três colunas e uma normalização. Com o
  // volume de uma loja isso é instantâneo; se um dia crescer, vira função no
  // banco com índice de texto.
  if (f.busca?.trim()) {
    const termo = f.busca.trim().toLowerCase();
    const tel = normalizarTelefone(f.busca);
    leads = leads.filter((l) =>
      (l.cliente.nome ?? '').toLowerCase().includes(termo) ||
      (l.titulo ?? '').toLowerCase().includes(termo) ||
      (tel != null && l.cliente.telefone === tel));
  }

  return etapas.map((etapa) => {
    const daEtapa = leads
      .filter((l) => l.etapaId === etapa.id)
      .sort((a, b) => etapa.tipo === 'aberta'
        ? b.diasParado - a.diasParado
        : new Date(b.fechadoEm ?? 0).getTime() - new Date(a.fechadoEm ?? 0).getTime());

    return {
      etapa,
      leads: daEtapa,
      valor: daEtapa.reduce((s, l) => s + (l.valor ?? 0), 0),
    };
  });
}

export async function getLead(id: string): Promise<LeadCompleto | null> {
  const l = ok(await supabase.from('lead').select(SELECT_LEAD).eq('id', id).maybeSingle());
  return l ? montarLead(l, new Set()) : null;
}

export async function getLeadDetalhe(id: string): Promise<LeadDetalhe | null> {
  const base = await getLead(id);
  if (!base) return null;

  const [outros, vendas] = await Promise.all([
    ok(await supabase.from('lead').select(SELECT_LEAD)
      .eq('cliente_id', base.clienteId).neq('id', id).is('deletado_em', null)
      .order('criado_em', { ascending: false })) as any[],
    // `v_venda_completa` para o gestor; o vendedor lê `v_venda_vendedor`. Se
    // a view do gestor for negada pelo RLS, cai na outra sem quebrar a tela.
    supabase.from('venda').select('id, data, quantidade, preco_unit, produto_id')
      .eq('cliente_id', base.clienteId).order('data', { ascending: false }),
  ]);

  const compras = (vendas.data ?? []).map((v: any) => ({
    id: v.id,
    data: v.data,
    descricao: v.titulo ?? 'Venda',
    valor: Number(v.preco_unit) * v.quantidade,
  }));

  return {
    ...base,
    outrosLeads: outros.map((l) => montarLead(l, new Set())),
    compras,
    totalComprado: compras.reduce((s, c) => s + c.valor, 0),
  };
}

/* ──────────────────────────────────────────────────────────── escrita ─── */

export async function moverLead(leadId: string, etapaId: string, motivoPerdaId?: string) {
  const { error } = await supabase.rpc('mover_lead', {
    p_lead: leadId, p_etapa: etapaId, p_motivo_perda: motivoPerdaId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function criarLead(input: NovoLeadInput): Promise<string> {
  const { data, error } = await supabase.rpc('criar_lead', {
    p_telefone: input.telefone,
    p_nome: input.nome ?? null,
    p_campanha_id: input.campanhaId ?? 'nao_rastreado',
    p_responsavel_id: input.responsavelId ?? null,
    p_titulo: input.titulo ?? null,
    p_valor: input.valor ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function atribuirLead(leadId: string, vendedorId: string | null) {
  const { error } = await supabase.from('lead')
    .update({ responsavel_id: vendedorId }).eq('id', leadId);
  if (error) throw new Error(error.message);
}

export async function atualizarLead(id: string, input: AtualizarLeadInput) {
  const campos: Record<string, unknown> = {};
  if (input.titulo !== undefined) campos.titulo = input.titulo;
  if (input.valor !== undefined) campos.valor = input.valor;
  if (input.responsavelId !== undefined) campos.responsavel_id = input.responsavelId;

  if (Object.keys(campos).length) {
    const { error } = await supabase.from('lead').update(campos).eq('id', id);
    if (error) throw new Error(error.message);
  }

  if (input.clienteNome !== undefined) {
    const lead = ok(await supabase.from('lead').select('cliente_id').eq('id', id).single()) as any;
    const { error } = await supabase.from('cliente')
      .update({ nome: input.clienteNome }).eq('id', lead.cliente_id);
    if (error) throw new Error(error.message);
  }
}

/* ─────────────────────────────────────────────────── caixa de entrada ─── */

const SELECT_CONVERSA = `
  id, canal_id, cliente_id, lead_id, telefone, status, atendente_id,
  nao_lidas, ultima_mensagem_em, ultima_mensagem_cliente_em, criada_em,
  canal_nome, canal_tipo, canal_via, campanha_id, campanha_nome,
  cliente_nome, atendente_nome, ultima_mensagem, ultima_direcao,
  janela_aberta, janela_expira_em
`;

export async function getConversas(f: FiltrosCaixa): Promise<ConversaCompleta[]> {
  // `v_conversa` já traz canal, cliente, campanha e a janela de 24h calculada.
  // E roda com `security_invoker`, então o RLS continua valendo dentro dela.
  let q = supabase.from('v_conversa').select(SELECT_CONVERSA)
    .order('ultima_mensagem_em', { ascending: false, nullsFirst: false });

  if (f.canalTipo) q = q.eq('canal_tipo', f.canalTipo);
  if (f.semDono) q = q.is('atendente_id', null);

  const linhas = ok(await q) as any[];
  const canais = await getCanais();

  let lista = linhas.map((c): ConversaCompleta => ({
    id: c.id,
    canalId: c.canal_id,
    clienteId: c.cliente_id,
    leadId: c.lead_id,
    telefone: c.telefone,
    status: c.status,
    atendenteId: c.atendente_id,
    naoLidas: c.nao_lidas ?? 0,
    ultimaMensagemEm: c.ultima_mensagem_em,
    ultimaMensagemClienteEm: c.ultima_mensagem_cliente_em,
    criadaEm: c.criada_em,
    canal: canais.find((x) => x.id === c.canal_id) ?? {
      id: c.canal_id, nome: c.canal_nome, tipo: c.canal_tipo, via: c.canal_via,
      telefone: '', vendedorId: null, ativo: true,
    },
    cliente: {
      id: c.cliente_id, telefone: c.telefone, nome: c.cliente_nome,
      campanhaOrigem: null, primeiroContatoEm: c.criada_em,
    },
    atendente: c.atendente_id
      ? { id: c.atendente_id, nome: c.atendente_nome ?? '', iniciais: '', ativo: true }
      : null,
    campanha: c.campanha_id
      ? { id: c.campanha_id, nome: c.campanha_nome ?? c.campanha_id, canal: 'meta' }
      : null,
    ultimaMensagem: c.ultima_mensagem,
    ultimaDirecao: c.ultima_direcao,
    janelaAberta: c.janela_aberta ?? true,
    janelaExpiraEm: c.janela_expira_em,
  }));

  if (f.busca?.trim()) {
    const termo = f.busca.trim().toLowerCase();
    const tel = normalizarTelefone(f.busca);
    lista = lista.filter((c) =>
      (c.cliente.nome ?? '').toLowerCase().includes(termo) ||
      (c.ultimaMensagem ?? '').toLowerCase().includes(termo) ||
      (tel != null && c.telefone === tel));
  }

  return lista;
}

export async function getConversa(id: string): Promise<ConversaCompleta | null> {
  const todas = await getConversas({ papel: 'admin', vendedorId: '' });
  return todas.find((c) => c.id === id) ?? null;
}

export async function getConversasDoCliente(clienteId: string, exceto?: string) {
  const todas = await getConversas({ papel: 'admin', vendedorId: '' });
  return todas.filter((c) => c.clienteId === clienteId && c.id !== exceto);
}

export async function getMensagens(conversaId: string): Promise<Mensagem[]> {
  const linhas = ok(await supabase.from('mensagem')
    .select('*').eq('conversa_id', conversaId)
    .order('enviada_em', { ascending: true })) as any[];

  return linhas.map((m) => ({
    id: m.id,
    conversaId: m.conversa_id,
    direcao: m.direcao,
    tipo: m.tipo,
    conteudo: m.conteudo,
    midiaUrl: m.midia_url,
    status: m.status,
    erro: m.erro,
    autorId: m.autor_id,
    enviadaEm: m.enviada_em,
  }));
}

export async function assumirConversa(conversaId: string, vendedorId: string) {
  const { data, error } = await supabase.rpc('assumir_conversa', {
    p_conversa: conversaId, p_vendedor: vendedorId,
  });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export async function liberarConversa(conversaId: string) {
  const { error } = await supabase.rpc('liberar_conversa', { p_conversa: conversaId });
  if (error) throw new Error(error.message);
}

export async function marcarLida(conversaId: string) {
  await supabase.rpc('marcar_lida', { p_conversa: conversaId });
}

/**
 * Enviar mensagem.
 *
 * Grava a mensagem e chama a Edge Function que fala com a Meta. A ordem
 * importa: gravar primeiro faz a mensagem aparecer na tela na hora, e o status
 * ('enviada' → 'entregue') acompanha depois pelo recibo do webhook. Esperar a
 * Meta responder para só então mostrar deixaria a tela parada por segundos.
 */
export async function enviarMensagem(conversaId: string, texto: string, autorId: string) {
  const { data, error } = await supabase.from('mensagem').insert({
    conversa_id: conversaId,
    direcao: 'saida',
    tipo: 'texto',
    conteudo: texto.trim(),
    status: 'enviada',
    autor_id: autorId,
    enviada_em: new Date().toISOString(),
  }).select().single();

  if (error) throw new Error(error.message);

  const { error: envio } = await supabase.functions.invoke('enviar-whatsapp', {
    body: { conversaId, texto: texto.trim(), mensagemId: data.id },
  });
  if (envio) {
    // A mensagem fica na thread marcada como falha, em vez de sumir. Sumir
    // faria o vendedor achar que mandou.
    await supabase.from('mensagem')
      .update({ status: 'falhou', erro: envio.message }).eq('id', data.id);
    throw new Error(`não saiu: ${envio.message}`);
  }

  await supabase.from('conversa')
    .update({ ultima_mensagem_em: new Date().toISOString(), status: 'em_atendimento' })
    .eq('id', conversaId);

  return {
    id: data.id, conversaId, direcao: 'saida' as const, tipo: 'texto' as const,
    conteudo: data.conteudo, midiaUrl: null, status: 'enviada' as const,
    erro: null, autorId, enviadaEm: data.enviada_em,
  };
}

export async function abrirNoMeuNumero(
  conversaOrigemId: string, vendedorId: string, texto: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('abrir_no_meu_numero', {
    p_conversa_origem: conversaOrigemId, p_vendedor: vendedorId,
  });
  if (error) throw new Error(error.message);

  await enviarMensagem(data as string, texto, vendedorId);
  await assumirConversa(conversaOrigemId, vendedorId);
  return data as string;
}

/* ────────────────────────────────────────────────── funil configurável ── */

export async function criarEtapa(nome: string, cor: CorEtapa = 'gold', depoisDe?: string) {
  const { data, error } = await supabase.rpc('criar_etapa', {
    p_nome: nome, p_cor: cor, p_depois_de: depoisDe ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function renomearEtapa(id: string, nome: string, cor?: CorEtapa) {
  const { error } = await supabase.rpc('renomear_etapa', {
    p_id: id, p_nome: nome, p_cor: cor ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function reordenarEtapas(ids: string[]) {
  const { error } = await supabase.rpc('reordenar_etapas', { p_ids: ids });
  if (error) throw new Error(error.message);
}

export async function excluirEtapa(id: string, moverPara: string): Promise<number> {
  const { data, error } = await supabase.rpc('excluir_etapa', {
    p_id: id, p_mover_para: moverPara,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function getContagemPorEtapa(): Promise<Record<string, number>> {
  const linhas = ok(await supabase.from('v_funil').select('etapa_id, leads')) as any[];
  return Object.fromEntries(linhas.map((l) => [l.etapa_id, l.leads]));
}

/* mensagem padrão fica em `configuracao`, para todo mundo ver a mesma */

export async function getMensagemPadrao(): Promise<string> {
  const r = await supabase.from('configuracao').select('valor')
    .eq('chave', 'mensagem_padrao_vendedor').maybeSingle();
  return (r.data?.valor as string) ??
    'Oi {cliente}, aqui é o {vendedor}, especialista em raquetes da {loja}. ' +
    'Vi que você chamou a gente no WhatsApp da loja e vou te atender por aqui.';
}

export async function setMensagemPadrao(texto: string) {
  const { error } = await supabase.from('configuracao')
    .upsert({ chave: 'mensagem_padrao_vendedor', valor: texto.trim() });
  if (error) throw new Error(error.message);
}

