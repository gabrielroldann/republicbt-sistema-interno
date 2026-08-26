/**
 * Dados de demonstração.
 *
 * Determinístico de propósito: os números não podem mudar a cada F5, senão
 * ninguém confia no que está vendo — e mostrar para os sócios vira loteria.
 *
 * Este arquivo some quando o Supabase entrar. `queries.ts` é o ponto de troca.
 */
import type {
  Campanha, Canal, Cliente, Compra, Conversa, Etapa, Lead, Mensagem,
  MotivoPerda, Vendedor,
} from '@/crm/types';

/* PRNG com semente fixa: mesma sequência sempre. */
function mulberry32(semente: number) {
  return function () {
    semente |= 0;
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260817);
const escolher = <T>(itens: T[]): T => itens[Math.floor(rnd() * itens.length)];
const entre = (a: number, b: number) => Math.floor(rnd() * (b - a + 1)) + a;

const diasAtras = (d: number) =>
  new Date(Date.now() - d * 86_400_000).toISOString();

/* ---------------------------------------------------------------- fixos -- */

export const etapas: Etapa[] = [
  { id: 'novo', nome: 'Novo contato', ordem: 1, tipo: 'aberta', cor: 'gold' },
  { id: 'atendimento', nome: 'Em atendimento', ordem: 2, tipo: 'aberta', cor: 'gold' },
  { id: 'proposta', nome: 'Proposta enviada', ordem: 3, tipo: 'aberta', cor: 'info' },
  { id: 'negociacao', nome: 'Negociação', ordem: 4, tipo: 'aberta', cor: 'attention' },
  { id: 'ganho', nome: 'Venda ganha', ordem: 5, tipo: 'ganho', cor: 'positive' },
  { id: 'perdido', nome: 'Venda perdida', ordem: 6, tipo: 'perdido', cor: 'negative' },
];

export const motivosPerda: MotivoPerda[] = [
  { id: 'preco', nome: 'Preço acima do orçamento', ordem: 1 },
  { id: 'concorrente', nome: 'Comprou em concorrente', ordem: 2 },
  { id: 'sumiu', nome: 'Não respondeu mais', ordem: 3 },
  { id: 'pesquisando', nome: 'Só pesquisando preço', ordem: 4 },
  { id: 'indisponivel', nome: 'Modelo indisponível', ordem: 5 },
  { id: 'prazo', nome: 'Prazo de entrega', ordem: 6 },
  { id: 'frete', nome: 'Fora de Fortaleza (frete)', ordem: 7 },
];

export const vendedores: Vendedor[] = [
  { id: 'v1', nome: 'Gabriel Roldan', iniciais: 'GR', ativo: true },
  { id: 'v2', nome: 'Sócio B', iniciais: 'SB', ativo: true },
  { id: 'v3', nome: 'Sócio C', iniciais: 'SC', ativo: true },
];

export const campanhas: Campanha[] = [
  { id: 'meta:verao-2026', nome: 'Verão 2026 — Raquetes', canal: 'meta' },
  { id: 'meta:institucional', nome: 'Institucional', canal: 'meta' },
  { id: 'meta:retargeting', nome: 'Retargeting', canal: 'meta' },
  { id: 'organico', nome: 'Orgânico', canal: 'organico' },
  { id: 'indicacao', nome: 'Indicação', canal: 'indicacao' },
  { id: 'nao_rastreado', nome: 'Não rastreado', canal: 'outro' },
];

const NOMES = [
  'Ana Ribeiro', 'Bruno Alves', 'Carla Dias', 'Diego Souza', 'Elisa Matos',
  'Fábio Nunes', 'Gisele Prado', 'Hugo Lima', 'Iara Costa', 'João Peixoto',
  'Karen Sales', 'Lucas Braga', 'Marina Rocha', 'Nuno Ferraz', 'Olívia Ramos',
  'Paulo Teles', 'Quésia Melo', 'Rafael Pinto', 'Sofia Cunha', 'Tiago Amorim',
  'Úrsula Vidal', 'Vitor Aragão', 'Wanda Freire', 'Yuri Bastos',
];

const PRODUTOS = [
  'Raquete Nox ML10', 'Raquete Vision Master', 'Raquete Drop Shot Pro',
  'Raqueteira Nox', 'Kit iniciante', 'Bolas + overgrip',
];

const CRIATIVOS = ['carrossel-a', 'video-b', 'estatica-c', null];

/* --------------------------------------------------------------- leads -- */

export const clientes: Cliente[] = [];
export const leads: Lead[] = [];

// Distribuição pensada para parecer uma loja de verdade: muita gente parada no
// começo do funil e pouca no fim. Funil que afunila igual em todo lugar é
// desenho, não é loja.
const DISTRIBUICAO: { etapa: string; qtd: number }[] = [
  { etapa: 'novo', qtd: 7 },
  { etapa: 'atendimento', qtd: 5 },
  { etapa: 'proposta', qtd: 4 },
  { etapa: 'negociacao', qtd: 2 },
  { etapa: 'ganho', qtd: 3 },
  { etapa: 'perdido', qtd: 4 },
];

let seq = 0;
for (const { etapa, qtd } of DISTRIBUICAO) {
  for (let i = 0; i < qtd; i++) {
    const nome = NOMES[seq % NOMES.length];
    const idade = entre(0, 21);          // dias desde a criação
    const parado = Math.min(idade, entre(0, 9));
    const campanha = escolher(campanhas);
    const fechado = etapa === 'ganho' || etapa === 'perdido';

    const cliente: Cliente = {
      id: `c${seq}`,
      // Telefone canônico, como o banco normaliza: 55 + DDD + 9 + 8 dígitos.
      // Gerar com 8 dígitos depois do DDD produziria número inválido — e o
      // link do WhatsApp sairia quebrado sem ninguém perceber.
      telefone: `5585${9}${String(10000000 + seq * 111713).slice(0, 8)}`,
      nome,
      campanhaOrigem: campanha.id,
      primeiroContatoEm: diasAtras(idade),
    };
    clientes.push(cliente);

    leads.push({
      id: `l${seq}`,
      clienteId: cliente.id,
      titulo: `${escolher(PRODUTOS)} — ${nome.split(' ')[0]}`,
      valor: escolher([700, 700, 890, 450, 1200, 350]),
      etapaId: etapa,
      responsavelId: escolher(vendedores).id,
      campanhaId: campanha.id,
      utmContent: campanha.canal === 'meta' ? escolher(CRIATIVOS) : null,
      motivoPerdaId: etapa === 'perdido' ? escolher(motivosPerda).id : null,
      criadoEm: diasAtras(idade),
      fechadoEm: fechado ? diasAtras(Math.max(idade - entre(1, 4), 0)) : null,
      atualizadoEm: diasAtras(parado),
    });
    seq++;
  }
}

/* ─────────────────────────────────────────────────── caixa de entrada ─── */

export const canais: Canal[] = [
  { id: 'loja', nome: 'Republic BT', tipo: 'loja', via: 'cloud_api',
    telefone: '5585999990000', vendedorId: null, ativo: true },
  { id: 'vend:v1', nome: 'Gabriel', tipo: 'vendedor', via: 'evolution',
    telefone: '5585988881111', vendedorId: 'v1', ativo: true },
  { id: 'vend:v2', nome: 'Sócio B', tipo: 'vendedor', via: 'evolution',
    telefone: '5585988882222', vendedorId: 'v2', ativo: true },
];

const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export const conversas: Conversa[] = [];
export const mensagens: Mensagem[] = [];

/**
 * As conversas saem dos leads abertos, e não é enfeite: no banco a conversa
 * aponta para o lead. Inventar conversa sem lead aqui produziria uma tela que
 * não existe em produção — o pior tipo de demonstração, a que convence de uma
 * coisa que depois não funciona.
 */
const PRIMEIRAS = [
  'Oi, vi o anúncio da raquete. Ainda tem?',
  'Boa tarde! Vocês têm raquete pra iniciante?',
  'Qual o valor da Nox ML10?',
  'Vocês entregam em Fortaleza?',
  'Oi! Tenho interesse no kit iniciante',
  'Aceita cartão em quantas vezes?',
  'Vi vocês no Instagram, queria saber dos preços',
  'Tem raquete de carbono?',
];
const RESPOSTAS = [
  'Oi! Aqui é o Gabriel, especialista em raquetes da Republic BT. Tudo bem?',
  'Temos sim! Qual seu nível de jogo?',
  'Posso te mandar as opções que temos em estoque',
];
const REPLICAS = [
  'Jogo há uns 6 meses, nível iniciante/intermediário',
  'Pode mandar sim',
  'E qual você recomenda?',
  'Consigo ver pessoalmente?',
];

let seqMsg = 0;
const gravar = (m: Omit<Mensagem, 'id'>) => {
  mensagens.push({ id: `m${seqMsg++}`, ...m });
};

// Só leads abertos: conversa em lead fechado seria histórico, e histórico não
// pertence a uma caixa de ENTRADA.
const abertosParaConversa = leads
  .filter((l) => l.fechadoEm == null)
  .slice(0, 12);

abertosParaConversa.forEach((lead, i) => {
  const cliente = clientes.find((c) => c.id === lead.clienteId)!;
  // Um terço fica sem dono: é a fila esperando distribuição, e é o estado que
  // a tela precisa mostrar bem, porque é o que exige ação.
  const semDono = i % 3 === 0;
  const horas = entre(0, 40);

  const conv: Conversa = {
    id: `cv${i}`,
    canalId: 'loja',
    clienteId: cliente.id,
    leadId: lead.id,
    telefone: cliente.telefone!,
    status: semDono ? 'nova' : 'em_atendimento',
    atendenteId: semDono ? null : lead.responsavelId,
    naoLidas: semDono ? entre(1, 3) : (i % 4 === 0 ? 1 : 0),
    ultimaMensagemEm: null,            // preenchido pelas mensagens, abaixo
    ultimaMensagemClienteEm: null,
    criadaEm: horasAtras(horas + entre(3, 20)),
  };
  conversas.push(conv);

  gravar({
    conversaId: conv.id, direcao: 'entrada', tipo: 'texto',
    conteudo: PRIMEIRAS[i % PRIMEIRAS.length], midiaUrl: null,
    status: 'entregue', erro: null, autorId: null,
    enviadaEm: horasAtras(semDono ? horas : horas + 2),
  });

  if (!semDono) {
    gravar({
      conversaId: conv.id, direcao: 'saida', tipo: 'texto',
      conteudo: RESPOSTAS[i % RESPOSTAS.length], midiaUrl: null,
      status: 'lida', erro: null, autorId: lead.responsavelId,
      enviadaEm: horasAtras(horas + 1),
    });
    gravar({
      conversaId: conv.id, direcao: 'entrada', tipo: 'texto',
      conteudo: REPLICAS[i % REPLICAS.length], midiaUrl: null,
      status: 'entregue', erro: null, autorId: null,
      enviadaEm: horasAtras(horas),
    });
  }
});

/**
 * O relógio da conversa vem das MENSAGENS, nunca inventado à parte.
 *
 * Antes os dois eram sorteados separadamente, e a lista mostrava 04:49 numa
 * conversa cuja única mensagem era das 02:49. Ninguém confia numa caixa de
 * entrada que se contradiz na própria tela — e em produção esses dois valores
 * saem da mesma transação, então a demonstração tem que refletir isso.
 */
function sincronizarRelogios() {
  for (const c of conversas) {
    const doThread = mensagens.filter((m) => m.conversaId === c.id);
    if (!doThread.length) continue;
    const ultima = Math.max(...doThread.map((m) => +new Date(m.enviadaEm)));
    const doCliente = doThread.filter((m) => m.direcao === 'entrada');
    c.ultimaMensagemEm = new Date(ultima).toISOString();
    // A janela de 24h conta a partir do CLIENTE — por isso os dois campos.
    if (doCliente.length) {
      c.ultimaMensagemClienteEm = new Date(
        Math.max(...doCliente.map((m) => +new Date(m.enviadaEm))),
      ).toISOString();
    }
  }
}

/**
 * O caso que justifica o desenho inteiro: o MESMO cliente, duas conversas.
 *
 * Ele escreveu para o número da loja; o vendedor abriu do número dele. São
 * threads diferentes, no mesmo lead. O índice único antigo, por telefone,
 * rejeitava a segunda — e o fluxo morria com erro de chave duplicada.
 */
[1, 4].forEach((i, k) => {
  const original = conversas[i];
  if (!original) return;
  const vendedorId = original.atendenteId ?? 'v1';
  const canal = canais.find((c) => c.vendedorId === vendedorId) ?? canais[1];

  const conv: Conversa = {
    id: `cv-vend-${k}`,
    canalId: canal.id,
    clienteId: original.clienteId,
    leadId: original.leadId,
    telefone: original.telefone,
    status: 'em_atendimento',
    atendenteId: vendedorId,
    naoLidas: k === 0 ? 2 : 0,
    ultimaMensagemEm: null,            // sincronizado abaixo, a partir do thread
    ultimaMensagemClienteEm: null,
    criadaEm: horasAtras(30),
  };
  conversas.push(conv);

  const nome = clientes.find((c) => c.id === conv.clienteId)?.nome?.split(' ')[0] ?? '';
  const vendNome = vendedores.find((v) => v.id === vendedorId)?.nome.split(' ')[0] ?? '';

  gravar({
    conversaId: conv.id, direcao: 'saida', tipo: 'texto',
    conteudo: `Oi ${nome}, aqui é o ${vendNome}, especialista em raquetes da Republic BT. Vi que você chamou a gente no WhatsApp da loja e vou te atender por aqui.`,
    midiaUrl: null, status: 'lida', erro: null, autorId: vendedorId,
    enviadaEm: horasAtras(28),
  });
  gravar({
    conversaId: conv.id, direcao: 'entrada', tipo: 'texto',
    conteudo: 'Opa, beleza! Show', midiaUrl: null,
    status: 'entregue', erro: null, autorId: null, enviadaEm: horasAtras(27),
  });
  gravar({
    conversaId: conv.id, direcao: 'saida', tipo: 'texto',
    conteudo: 'Te mandei as fotos das duas que separei aqui',
    midiaUrl: null, status: 'entregue', erro: null, autorId: vendedorId,
    enviadaEm: horasAtras(k === 0 ? 2 : 8),
  });
  gravar({
    conversaId: conv.id, direcao: 'entrada', tipo: 'imagem',
    conteudo: 'essa aqui é a que eu vi', midiaUrl: 'meta:1234567890',
    status: 'entregue', erro: null, autorId: null,
    enviadaEm: horasAtras(k === 0 ? 0.5 : 6),
  });
});

// Depois de TODAS as threads existirem — inclusive as dos números dos
// vendedores. Rodar no meio deixaria metade das conversas sem relógio.
sincronizarRelogios();

/**
 * Uma conversa com a janela FECHADA, de propósito.
 *
 * É o estado que a tela mais erra: sem ele na demonstração, ninguém desenha o
 * aviso, e o vendedor só descobre a regra quando a mensagem não sai. Vem DEPOIS
 * da sincronização, senão seria sobrescrito por ela.
 */
if (conversas[2]) {
  conversas[2].ultimaMensagemClienteEm = horasAtras(30);
  conversas[2].ultimaMensagemEm = horasAtras(30);
}

/** Conversas abertas — o sinal visual no card do funil. */
export const conversasAbertas = new Set(
  conversas.filter((c) => c.status !== 'resolvida' && c.leadId)
    .map((c) => c.leadId!),
);

/**
 * Compras fechadas.
 *
 * No banco isso é a tabela `venda`; aqui é só o suficiente para o histórico do
 * cliente ter o que mostrar. Cada lead ganho vira uma compra, e alguns clientes
 * ganham uma recompra antiga — recompra é a venda mais barata que existe, e o
 * histórico precisa deixá-la visível.
 */
export const compras: Compra[] = [];
for (const l of leads) {
  if (l.etapaId !== 'ganho') continue;
  compras.push({
    id: `cp-${l.id}`,
    data: l.fechadoEm ?? l.criadoEm,
    descricao: l.titulo ?? 'Venda',
    valor: l.valor ?? 0,
  });
}
// duas recompras antigas, para o histórico não parecer sempre de primeira viagem
for (const l of leads.filter((x) => x.etapaId === 'ganho').slice(0, 2)) {
  compras.push({
    id: `cp-antiga-${l.id}`,
    data: diasAtras(entre(90, 180)),
    descricao: 'Bolas + overgrip',
    valor: 120,
  });
  // a recompra pertence ao MESMO cliente
  (compras[compras.length - 1] as Compra & { clienteId?: string }).clienteId = l.clienteId;
}

/** de qual cliente é cada compra */
export const clienteDaCompra = new Map<string, string>();
for (const l of leads) {
  if (l.etapaId === 'ganho') clienteDaCompra.set(`cp-${l.id}`, l.clienteId);
}
for (const l of leads.filter((x) => x.etapaId === 'ganho').slice(0, 2)) {
  clienteDaCompra.set(`cp-antiga-${l.id}`, l.clienteId);
}
