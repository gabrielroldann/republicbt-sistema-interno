/**
 * A CAMADA DE DADOS — e o ponto de troca para o Supabase.
 *
 * Hoje lê de `mock.ts`. Quando o banco entrar, só este arquivo muda: as telas
 * consomem as funções daqui e não sabem de onde vem o dado.
 *
 * As regras de negócio que existem aqui são as mesmas que estão em
 * `supabase/sql/02-crm.sql`. Quando a troca acontecer, elas passam a vir do
 * banco e daqui somem — não podem viver nos dois lugares, senão divergem.
 */
import {
  campanhas, canais, clienteDaCompra, clientes, compras, conversas,
  conversasAbertas, etapas, leads, mensagens, motivosPerda, vendedores,
} from './mock';
import type {
  Campanha, Canal, Cliente, ColunaFunil, ConversaCompleta, CorEtapa, Etapa, Lead,
  LeadCompleto, LeadDetalhe, Mensagem, MotivoPerda, NovoLeadInput, Vendedor,
} from '@/crm/types';
import { normalizarTelefone } from '@/lib/telefone';
import type { AtualizarLeadInput, FiltrosCaixa, FiltrosFunil } from './tipos';
export { normalizarTelefone, formatarTelefone, linkWhatsApp } from '@/lib/telefone';

/** Latência de mentirinha, para os estados de carregando aparecerem no dev. */
const atraso = () => new Promise((r) => setTimeout(r, 120));

const diasEntre = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);


/* ---------------------------------------------------------- enriquecer -- */

function completar(l: Lead): LeadCompleto {
  const cliente = clientes.find((c) => c.id === l.clienteId)!;
  return {
    ...l,
    cliente,
    campanha: campanhas.find((c) => c.id === l.campanhaId) ?? null,
    responsavel: vendedores.find((v) => v.id === l.responsavelId) ?? null,
    diasParado: diasEntre(l.atualizadoEm),
    temConversaAberta: conversasAbertas.has(l.id),
  };
}

/* ------------------------------------------------------------ leitura -- */

export async function getEtapas(): Promise<Etapa[]> {
  await atraso();
  return [...etapas].sort((a, b) => a.ordem - b.ordem);
}

export async function getMotivosPerda(): Promise<MotivoPerda[]> {
  await atraso();
  return [...motivosPerda].sort((a, b) => a.ordem - b.ordem);
}

export async function getVendedores(): Promise<Vendedor[]> {
  await atraso();
  return vendedores.filter((v) => v.ativo);
}

export async function getCampanhas(): Promise<Campanha[]> {
  await atraso();
  return campanhas;
}

export interface AtualizarClienteInput {
  nome?: string | null;
  email?: string | null;
  cidade?: string | null;
}

export async function atualizarCliente(id: string, input: AtualizarClienteInput) {
  await atraso();
  const alvo = clientes.find((c) => c.id === id);
  if (!alvo) return;
  if (input.nome !== undefined) alvo.nome = input.nome;
  if (input.email !== undefined) alvo.email = input.email;
  if (input.cidade !== undefined) alvo.cidade = input.cidade;
}

export async function excluirCliente(id: string) {
  await atraso();
  const temHistorico = leads.some((l) => l.clienteId === id)
    || conversas.some((c) => c.clienteId === id)
    || compras.some((c) => clienteDaCompra.get(c.id) === id);
  if (temHistorico) {
    throw new Error('Este cliente já tem lead, conversa ou venda vinculada — não pode ser excluído sem apagar isso antes.');
  }
  const i = clientes.findIndex((c) => c.id === id);
  if (i >= 0) clientes.splice(i, 1);
}

export interface HistoricoCliente { leads: number; conversas: number; vendas: number }

export async function getHistoricoCliente(id: string): Promise<HistoricoCliente> {
  await atraso();
  return {
    leads: leads.filter((l) => l.clienteId === id).length,
    conversas: conversas.filter((c) => c.clienteId === id).length,
    vendas: compras.filter((c) => clienteDaCompra.get(c.id) === id).length,
  };
}

export async function excluirClienteComHistorico(id: string) {
  await atraso();
  for (let j = mensagens.length - 1; j >= 0; j--) {
    const conv = conversas.find((c) => c.id === mensagens[j].conversaId);
    if (conv?.clienteId === id) mensagens.splice(j, 1);
  }
  for (let j = conversas.length - 1; j >= 0; j--) {
    if (conversas[j].clienteId === id) conversas.splice(j, 1);
  }
  for (let j = leads.length - 1; j >= 0; j--) {
    if (leads[j].clienteId === id) leads.splice(j, 1);
  }
  const i = clientes.findIndex((c) => c.id === id);
  if (i >= 0) clientes.splice(i, 1);
}

export async function getClientes(busca?: string): Promise<Cliente[]> {
  await atraso();
  let lista = [...clientes].sort((a, b) =>
    new Date(b.primeiroContatoEm).getTime() - new Date(a.primeiroContatoEm).getTime());

  if (busca?.trim()) {
    const termo = busca.trim().toLowerCase();
    const tel = normalizarTelefone(busca);
    lista = lista.filter((c) =>
      (c.nome ?? '').toLowerCase().includes(termo) ||
      (c.email ?? '').toLowerCase().includes(termo) ||
      (tel != null && c.telefone === tel));
  }

  return lista;
}


export async function getFunil(f: FiltrosFunil = {}): Promise<ColunaFunil[]> {
  await atraso();

  let visiveis = leads.map(completar);

  if (f.responsavelId) visiveis = visiveis.filter((l) => l.responsavelId === f.responsavelId);
  if (f.campanhaId) visiveis = visiveis.filter((l) => l.campanhaId === f.campanhaId);

  if (f.busca?.trim()) {
    const q = f.busca.trim().toLowerCase();
    // Busca por nome, título — e por telefone, aceitando o que a pessoa digitar.
    const tel = normalizarTelefone(f.busca);
    visiveis = visiveis.filter((l) =>
      (l.cliente.nome ?? '').toLowerCase().includes(q) ||
      (l.titulo ?? '').toLowerCase().includes(q) ||
      (tel != null && l.cliente.telefone === tel));
  }

  return [...etapas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((etapa) => {
      const daEtapa = visiveis
        .filter((l) => l.etapaId === etapa.id)
        // Fechados: os mais recentes primeiro. Abertos: o mais parado no topo,
        // porque é ele que precisa de ação.
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
  await atraso();
  const l = leads.find((x) => x.id === id);
  return l ? completar(l) : null;
}

/* ------------------------------------------------------------ escrita -- */

/**
 * Mover no funil.
 *
 * Perder EXIGE motivo, e o motivo vem da lista. É a mesma regra que o banco
 * impõe em `mover_lead` — aqui é só o espelho, para a tela avisar antes de
 * tentar.
 */
export async function moverLead(
  leadId: string, etapaId: string, motivoPerdaId?: string,
): Promise<void> {
  await atraso();
  const l = leads.find((x) => x.id === leadId);
  if (!l) throw new Error('lead não encontrado');

  const etapa = etapas.find((e) => e.id === etapaId);
  if (!etapa) throw new Error('etapa não existe');

  if (etapa.tipo === 'perdido' && !motivoPerdaId) {
    throw new Error('perder um lead exige motivo');
  }

  l.etapaId = etapaId;
  l.motivoPerdaId = etapa.tipo === 'perdido' ? motivoPerdaId! : null;
  l.fechadoEm = etapa.tipo === 'aberta' ? null : new Date().toISOString();
  l.atualizadoEm = new Date().toISOString();
}

export async function criarLead(input: NovoLeadInput): Promise<string> {
  await atraso();

  const tel = normalizarTelefone(input.telefone);
  if (!tel) throw new Error('telefone inválido');

  // Identifica o cliente pelo telefone. Na dúvida, cria separado: juntar dois
  // cadastros depois dá trabalho mas é possível; separar duas pessoas fundidas
  // por engano é quase impossível, porque as compras já se misturaram.
  let cliente = clientes.find((c) => c.telefone === tel);
  if (!cliente) {
    cliente = {
      id: `c${clientes.length}-${Date.now()}`,
      telefone: tel,
      nome: input.nome ?? null,
      campanhaOrigem: input.campanhaId ?? null,
      primeiroContatoEm: new Date().toISOString(),
    };
    clientes.push(cliente);
  } else {
    // completa o que faltava, sem sobrescrever — e a origem é congelada
    cliente.nome ??= input.nome ?? null;
    cliente.campanhaOrigem ??= input.campanhaId ?? null;
  }

  const id = `l${leads.length}-${Date.now()}`;
  const agora = new Date().toISOString();
  leads.push({
    id,
    clienteId: cliente.id,
    titulo: input.titulo ?? null,
    valor: input.valor ?? null,
    etapaId: 'novo',
    responsavelId: input.responsavelId ?? null,
    campanhaId: input.campanhaId ?? 'nao_rastreado',
    utmContent: null,
    motivoPerdaId: null,
    criadoEm: agora,
    fechadoEm: null,
    atualizadoEm: agora,
  });
  return id;
}

export async function atribuirLead(leadId: string, vendedorId: string | null): Promise<void> {
  await atraso();
  const l = leads.find((x) => x.id === leadId);
  if (l) {
    l.responsavelId = vendedorId;
    l.atualizadoEm = new Date().toISOString();
  }
}

/* ---------------------------------------------- personalização do funil -- */

/**
 * Espelha `gerar_id_etapa` do banco: id legível, gerado do nome UMA vez.
 *
 * O id nunca muda depois — os leads apontam para ele. Renomear a etapa mexe
 * só no rótulo.
 */
function gerarIdEtapa(nome: string): string {
  const base = nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'etapa';

  let id = base;
  let n = 1;
  while (etapas.some((e) => e.id === id)) { n += 1; id = `${base}_${n}`; }
  return id;
}

export async function criarEtapa(
  nome: string, cor: CorEtapa = 'gold', depoisDe?: string,
): Promise<string> {
  await atraso();
  if (!nome.trim()) throw new Error('a etapa precisa de nome');

  const abertas = etapas.filter((e) => e.tipo === 'aberta');
  const ordem = depoisDe
    ? (abertas.find((e) => e.id === depoisDe)?.ordem ?? abertas.length) + 1
    : abertas.length + 1;

  // Entra sempre ANTES de ganho e perdido: o kanban se lê da esquerda para a
  // direita, e etapa de trabalho depois de "Venda ganha" não faz sentido.
  for (const e of etapas) if (e.ordem >= ordem) e.ordem += 1;

  const id = gerarIdEtapa(nome);
  etapas.push({ id, nome: nome.trim(), ordem, tipo: 'aberta', cor });
  return id;
}

export async function renomearEtapa(id: string, nome: string, cor?: CorEtapa) {
  await atraso();
  if (!nome.trim()) throw new Error('a etapa precisa de nome');
  const e = etapas.find((x) => x.id === id);
  if (!e) throw new Error('etapa não existe');
  e.nome = nome.trim();
  if (cor) e.cor = cor;
}

/**
 * Recebe a ordem COMPLETA das etapas abertas e reescreve tudo.
 *
 * Mandar a lista inteira, em vez de "mova X para a posição N", elimina uma
 * classe de bug: não existe estado intermediário inconsistente, e duas pessoas
 * arrastando ao mesmo tempo terminam numa das duas ordens, nunca numa mistura.
 */
export async function reordenarEtapas(ids: string[]) {
  await atraso();
  const abertas = etapas.filter((e) => e.tipo === 'aberta');
  if (ids.length !== abertas.length) {
    throw new Error('a lista precisa conter todas as etapas abertas');
  }
  if (ids.some((id) => !abertas.some((e) => e.id === id))) {
    throw new Error('a lista tem etapa que não existe ou não é aberta');
  }
  ids.forEach((id, i) => { etapas.find((e) => e.id === id)!.ordem = i + 1; });
  etapas.find((e) => e.tipo === 'ganho')!.ordem = ids.length + 1;
  etapas.find((e) => e.tipo === 'perdido')!.ordem = ids.length + 2;
}

/**
 * Exclui a etapa MOVENDO os leads dela para outra.
 *
 * Lead não é apagado: é histórico de relacionamento e, se virou venda, é
 * histórico financeiro. Destruir isso por uma mudança cosmética de funil seria
 * perder dado por motivo nenhum.
 */
export async function excluirEtapa(id: string, moverPara: string): Promise<number> {
  await atraso();
  const e = etapas.find((x) => x.id === id);
  if (!e) throw new Error('etapa não existe');
  if (e.tipo !== 'aberta') throw new Error('ganho e perdido não podem ser excluídos');
  if (id === moverPara) throw new Error('escolha outra etapa para receber os leads');

  const destino = etapas.find((x) => x.id === moverPara && x.tipo === 'aberta');
  if (!destino) throw new Error('a etapa de destino precisa existir e ser aberta');

  let movidos = 0;
  for (const l of leads) if (l.etapaId === id) { l.etapaId = moverPara; movidos++; }

  etapas.splice(etapas.indexOf(e), 1);
  await reordenarEtapas(etapas.filter((x) => x.tipo === 'aberta')
    .sort((a, b) => a.ordem - b.ordem).map((x) => x.id));

  return movidos;
}

/** Quantos leads existem em cada etapa — o aviso antes de excluir. */
export async function getContagemPorEtapa(): Promise<Record<string, number>> {
  await atraso();
  const c: Record<string, number> = {};
  for (const l of leads) c[l.etapaId] = (c[l.etapaId] ?? 0) + 1;
  return c;
}

/* -------------------------------------------------- o card do lead ------- */

/**
 * O lead com o histórico da PESSOA.
 *
 * O vendedor precisa saber, antes de responder, se está falando com alguém que
 * já comprou. Cliente que voltou merece um tratamento diferente de quem chegou
 * agora — e essa informação não pode exigir três cliques.
 */
export async function getLeadDetalhe(id: string): Promise<LeadDetalhe | null> {
  await atraso();
  const l = leads.find((x) => x.id === id);
  if (!l) return null;

  const doCliente = leads
    .filter((x) => x.clienteId === l.clienteId && x.id !== l.id)
    .map(completar)
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());

  const minhasCompras = compras
    .filter((c) => clienteDaCompra.get(c.id) === l.clienteId)
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return {
    ...completar(l),
    outrosLeads: doCliente,
    compras: minhasCompras,
    totalComprado: minhasCompras.reduce((s, c) => s + c.valor, 0),
  };
}


export async function atualizarLead(id: string, input: AtualizarLeadInput) {
  await atraso();
  const l = leads.find((x) => x.id === id);
  if (!l) throw new Error('lead não encontrado');

  if (input.titulo !== undefined) l.titulo = input.titulo;
  if (input.valor !== undefined) l.valor = input.valor;
  if (input.responsavelId !== undefined) l.responsavelId = input.responsavelId;

  if (input.clienteNome !== undefined) {
    const c = clientes.find((x) => x.id === l.clienteId);
    if (c) c.nome = input.clienteNome;
  }

  l.atualizadoEm = new Date().toISOString();
}


/* ═════════════════════════════════════════════════ caixa de entrada ════ */

export async function getCanais(): Promise<Canal[]> {
  await atraso();
  return canais.filter((c) => c.ativo);
}

/**
 * A MENSAGEM PADRÃO — o texto que o vendedor manda ao assumir.
 *
 * Editável porque cada vendedor se apresenta do jeito dele, e um texto imposto
 * some: ou o vendedor apaga e digita o dele, ou manda no automático e soa
 * robótico. Os marcadores são substituídos na hora do envio.
 */
export const MARCADORES = ['{cliente}', '{vendedor}', '{loja}'] as const;

let mensagemPadrao =
  'Oi {cliente}, aqui é o {vendedor}, especialista em raquetes da {loja}. ' +
  'Vi que você chamou a gente no WhatsApp da loja e vou te atender por aqui.';

export async function getMensagemPadrao(): Promise<string> {
  await atraso();
  return mensagemPadrao;
}

export async function setMensagemPadrao(texto: string): Promise<void> {
  await atraso();
  if (!texto.trim()) throw new Error('a mensagem padrão não pode ficar vazia');
  mensagemPadrao = texto.trim();
}

export function preencherMarcadores(
  modelo: string,
  dados: { cliente?: string | null; vendedor?: string | null },
): string {
  return modelo
    // Só o primeiro nome: "Oi Ana Ribeiro Sousa" não é como ninguém escreve.
    .replaceAll('{cliente}', (dados.cliente ?? '').split(' ')[0] || 'tudo bem')
    .replaceAll('{vendedor}', (dados.vendedor ?? '').split(' ')[0] || '')
    .replaceAll('{loja}', 'Republic BT');
}

/* ------------------------------------------------------------- leitura -- */


const JANELA_MS = 24 * 3_600_000;

function completarConversa(c: (typeof conversas)[number]): ConversaCompleta {
  const canal = canais.find((x) => x.id === c.canalId)!;
  const cliente = clientes.find((x) => x.id === c.clienteId)!;
  const lead = leads.find((x) => x.id === c.leadId);
  const doThread = mensagens
    .filter((m) => m.conversaId === c.id)
    .sort((a, b) => +new Date(b.enviadaEm) - +new Date(a.enviadaEm));

  // A janela só existe na API oficial. No canal por QR não há janela — e
  // mostrar um aviso que não se aplica ensina o vendedor a ignorar avisos.
  const janelaAberta = canal.via !== 'cloud_api'
    || (c.ultimaMensagemClienteEm != null
        && Date.now() - +new Date(c.ultimaMensagemClienteEm) < JANELA_MS);

  return {
    ...c,
    canal,
    cliente,
    atendente: vendedores.find((v) => v.id === c.atendenteId) ?? null,
    campanha: campanhas.find((x) => x.id === lead?.campanhaId) ?? null,
    ultimaMensagem: doThread[0]?.conteudo ?? null,
    ultimaDirecao: doThread[0]?.direcao ?? null,
    janelaAberta,
    janelaExpiraEm: canal.via === 'cloud_api' && c.ultimaMensagemClienteEm
      ? new Date(+new Date(c.ultimaMensagemClienteEm) + JANELA_MS).toISOString()
      : null,
  };
}

/**
 * A caixa de entrada.
 *
 * O filtro por papel aqui é ESPELHO do RLS, não o controle. O controle mora no
 * banco (`04-acesso.sql`) porque o Supabase expõe REST sobre as tabelas e a
 * chave anônima está no JavaScript. Isto existe só para a tela não oferecer o
 * que o banco vai negar.
 */
export async function getConversas(f: FiltrosCaixa): Promise<ConversaCompleta[]> {
  await atraso();

  let visiveis = conversas.map(completarConversa);

  if (f.papel === 'vendedor') {
    // Conversa SEM dono não é de todos: é a fila da loja esperando
    // distribuição. Se o vendedor a enxergasse, escolheria o cliente que
    // parece mais fácil e o rodízio viraria enfeite.
    visiveis = visiveis.filter((c) =>
      c.atendenteId === f.vendedorId || c.canal.vendedorId === f.vendedorId);
  }

  if (f.canalTipo) visiveis = visiveis.filter((c) => c.canal.tipo === f.canalTipo);
  if (f.semDono) visiveis = visiveis.filter((c) => c.atendenteId == null);

  if (f.busca?.trim()) {
    const q = f.busca.trim().toLowerCase();
    const tel = normalizarTelefone(f.busca);
    visiveis = visiveis.filter((c) =>
      (c.cliente.nome ?? '').toLowerCase().includes(q) ||
      (c.ultimaMensagem ?? '').toLowerCase().includes(q) ||
      (tel != null && c.telefone === tel));
  }

  // Quem falou por último primeiro: caixa de entrada é fila de trabalho, e o
  // que chegou agora é o que ainda dá para salvar.
  return visiveis.sort((a, b) =>
    +new Date(b.ultimaMensagemEm ?? 0) - +new Date(a.ultimaMensagemEm ?? 0));
}

export async function getConversa(id: string): Promise<ConversaCompleta | null> {
  await atraso();
  const c = conversas.find((x) => x.id === id);
  return c ? completarConversa(c) : null;
}

/** As outras conversas da MESMA pessoa — o vendedor precisa ver as duas. */
export async function getConversasDoCliente(
  clienteId: string, exceto?: string,
): Promise<ConversaCompleta[]> {
  await atraso();
  return conversas
    .filter((c) => c.clienteId === clienteId && c.id !== exceto)
    .map(completarConversa);
}

export async function getMensagens(conversaId: string): Promise<Mensagem[]> {
  await atraso();
  // Pelo relógio do WhatsApp, nunca por ordem de chegada: a Meta entrega fora
  // de ordem e o chat sairia com a resposta antes da pergunta.
  return mensagens
    .filter((m) => m.conversaId === conversaId)
    .sort((a, b) => +new Date(a.enviadaEm) - +new Date(b.enviadaEm));
}

/* ------------------------------------------------------------- escrita -- */

/**
 * Assumir a conversa — a trava que impede resposta dupla.
 *
 * No banco é um UPDATE CONDICIONAL, não "leia e depois escreva": se fosse em
 * dois passos, dois vendedores leriam "está livre" antes de qualquer um
 * escrever e os dois entrariam. Aqui devolve `false` para o segundo, que é a
 * resposta certa — não um erro.
 */
export async function assumirConversa(
  conversaId: string, vendedorId: string,
): Promise<boolean> {
  await atraso();
  const c = conversas.find((x) => x.id === conversaId);
  if (!c) throw new Error('conversa não encontrada');
  if (c.atendenteId != null && c.atendenteId !== vendedorId) return false;

  c.atendenteId = vendedorId;
  c.status = 'em_atendimento';

  // O lead segue a conversa: sem isso o funil mostraria dono diferente da
  // caixa de entrada, e ninguém saberia qual dos dois está certo.
  const lead = leads.find((l) => l.id === c.leadId);
  if (lead && !lead.responsavelId) lead.responsavelId = vendedorId;

  return true;
}

export async function liberarConversa(conversaId: string): Promise<void> {
  await atraso();
  const c = conversas.find((x) => x.id === conversaId);
  if (c) { c.atendenteId = null; c.status = 'nova'; }
}

export async function marcarLida(conversaId: string): Promise<void> {
  const c = conversas.find((x) => x.id === conversaId);
  if (c) c.naoLidas = 0;
}

export async function excluirConversa(conversaId: string): Promise<void> {
  await atraso();
  const i = conversas.findIndex((x) => x.id === conversaId);
  if (i >= 0) conversas.splice(i, 1);
  for (let j = mensagens.length - 1; j >= 0; j--) {
    if (mensagens[j].conversaId === conversaId) mensagens.splice(j, 1);
  }
}

/**
 * Atender pelo número do vendedor — o movimento central do fluxo.
 *
 * O cliente chegou pelo número da loja. Quando o vendedor assume, ele começa
 * uma conversa NOVA, do número dele, e é ali que o atendimento acontece. Não é
 * transferência: as duas threads continuam existindo, no mesmo lead.
 *
 * Só existe conversa no canal do vendedor porque o número dele é pareado por
 * QR — a API oficial não permitiria abrir contato sem template aprovado e pago.
 */
export async function abrirNoMeuNumero(
  conversaOrigemId: string, vendedorId: string, texto: string,
): Promise<string> {
  await atraso();

  const origem = conversas.find((x) => x.id === conversaOrigemId);
  if (!origem) throw new Error('conversa não encontrada');

  const canal = canais.find((c) => c.vendedorId === vendedorId && c.ativo);
  if (!canal) throw new Error('você ainda não tem um número conectado ao CRM');
  if (!texto.trim()) throw new Error('escreva a mensagem antes de enviar');

  // Uma thread por par (nosso número, número do cliente). Se já existe, a
  // mensagem entra nela — o WhatsApp tem uma conversa por contato, e abrir uma
  // segunda aqui criaria um histórico partido que não existe no celular dele.
  let destino = conversas.find(
    (c) => c.canalId === canal.id && c.telefone === origem.telefone);

  if (!destino) {
    destino = {
      id: `cv-${canal.id}-${Date.now()}`,
      canalId: canal.id,
      clienteId: origem.clienteId,
      leadId: origem.leadId,
      telefone: origem.telefone,
      status: 'em_atendimento',
      atendenteId: vendedorId,
      naoLidas: 0,
      ultimaMensagemEm: null,
      ultimaMensagemClienteEm: null,
      criadaEm: new Date().toISOString(),
    };
    conversas.push(destino);
  }

  await enviarMensagem(destino.id, texto, vendedorId);
  await assumirConversa(conversaOrigemId, vendedorId);
  return destino.id;
}

export async function enviarMensagem(
  conversaId: string, texto: string, autorId: string,
): Promise<Mensagem> {
  await atraso();

  const c = conversas.find((x) => x.id === conversaId);
  if (!c) throw new Error('conversa não encontrada');
  if (!texto.trim()) throw new Error('mensagem vazia');

  const completa = completarConversa(c);
  if (!completa.janelaAberta) {
    // O banco não barra isso — quem barra é a Meta, e sem aviso a mensagem
    // simplesmente não sai. Melhor recusar aqui, com o motivo escrito.
    throw new Error(
      'a janela de 24h fechou neste número: só sai template aprovado. ' +
      'Atenda pelo seu número.',
    );
  }

  const m: Mensagem = {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    conversaId,
    direcao: 'saida',
    tipo: 'texto',
    conteudo: texto.trim(),
    midiaUrl: null,
    status: 'enviada',
    erro: null,
    autorId,
    enviadaEm: new Date().toISOString(),
  };
  mensagens.push(m);

  c.ultimaMensagemEm = m.enviadaEm;
  if (c.status === 'nova') c.status = 'em_atendimento';
  c.atendenteId ??= autorId;

  return m;
}
