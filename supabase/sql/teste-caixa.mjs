/**
 * TESTES DA CAIXA DE ENTRADA
 *
 * O que se prova aqui é a CHEGADA do cliente: a mensagem que entra pelo número
 * da loja vira cliente, lead, conversa e campanha — uma vez só, na ordem certa,
 * mesmo quando a Meta reenvia ou entrega fora de ordem.
 *
 * Os dois casos que mais importam, porque os dois já quebraram o desenho:
 *
 *   1. O mesmo cliente tem DUAS conversas ao mesmo tempo (número da loja e
 *      número do vendedor). O índice único antigo, por telefone, rejeitava a
 *      segunda — e o fluxo inteiro morria com erro de chave duplicada.
 *
 *   2. O webhook chega repetido. Sem idempotência, a mensagem aparece duas
 *      vezes para o vendedor e o contador de não lidas mente.
 *
 *   npm run teste-caixa
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const base = new URL('.', import.meta.url).pathname;
const db = await new PGlite();

let falhas = 0;
const ok = (c, m) => { console.log(`   ${c ? '✓' : '✗ FALHOU:'} ${m}`); if (!c) falhas++; };
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
const titulo = (t) => console.log(`\n${'─'.repeat(66)}\n${t}\n${'─'.repeat(66)}`);
const barra = async (sql, p) => {
  try { await db.query(sql, p); return false; } catch { return true; }
};

await db.exec(`
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
`);

for (const arq of ['01-nucleo.sql', '02-crm.sql', '03-site.sql', '04-acesso.sql']) {
  try { await db.exec(readFileSync(`${base}/${arq}`, 'utf8')); }
  catch (e) { console.log(`FALHA ${arq}: ${e.message}`); process.exit(1); }
}
await db.exec(`
  grant usage on schema public to authenticated;
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
  grant usage on schema auth to authenticated;
  grant execute on all functions in schema auth to authenticated;
`);
console.log('   schema aplicado');

/* ------------------------------------------------------------- os canais -- */
const AUTH = {
  admin: '11111111-1111-1111-1111-111111111111',
  vend:  '33333333-3333-3333-3333-333333333333',
  vend2: '44444444-4444-4444-4444-444444444444',
};

const dono = await um(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Gabriel','GR','admin',$1) returning id`, [AUTH.admin]);
const vend = await um(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Vendedor C','VC','vendedor',$1) returning id`, [AUTH.vend]);
const vend2 = await um(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Vendedor D','VD','vendedor',$1) returning id`, [AUTH.vend2]);

await db.query(`insert into canal (id,nome,tipo,via,telefone,phone_number_id)
  values ('loja','Republic BT','loja','cloud_api','5585999990000','PNID_LOJA')`);
await db.query(`insert into canal (id,nome,tipo,via,telefone,instancia,vendedor_id)
  values ('vend:c','Vendedor C','vendedor','evolution','5585988880000','inst-c',$1)`,
  [vend.id]);

/* ---------------------------------------------------------- o referral ----- */
/** O formato exato que a Meta manda na primeira mensagem de quem clicou. */
const anuncioVerao = {
  source_url: 'https://fb.me/2abcXYZ',
  source_id: '120219876543210',
  source_type: 'ad',
  headline: 'Raquetes Nox com 20% off',
  body: 'Só nesta semana',
  media_type: 'image',
  ctwa_clid: 'ARAaBBBcccDDD111',
};

const receber = (args) => um(
  `select * from receber_mensagem(
     p_canal_id      => $1,
     p_telefone      => $2,
     p_nome          => $3,
     p_wa_message_id => $4,
     p_tipo          => $5,
     p_conteudo      => $6,
     p_midia_url     => null,
     p_enviada_em    => $7,
     p_referral      => $8)`,
  [args.canal ?? 'loja', args.tel, args.nome ?? null, args.wamid ?? null,
   args.tipo ?? 'texto', args.texto ?? null,
   args.em ?? new Date().toISOString(),
   args.referral ? JSON.stringify(args.referral) : null]);

/* ═══════════════════════════════════════════════════════ a primeira vez ═══ */
titulo('O CLIENTE CHEGA PELO ANÚNCIO — o momento que paga a conta');

const r1 = await receber({
  tel: '(85) 99114-7264', nome: 'Ana Ribeiro',
  wamid: 'wamid.AAA1', texto: 'Oi, vi o anúncio da raquete',
  referral: anuncioVerao,
});

ok(r1.primeira === true, 'primeira mensagem abre uma conversa nova');
ok(r1.conversa_id && r1.lead_id && r1.mensagem_id,
   'uma mensagem produz conversa, lead e mensagem de uma vez só');

const lead1 = await um('select * from lead where id=$1', [r1.lead_id]);
ok(lead1.campanha_id === 'meta:ad:120219876543210',
   `a campanha veio do anúncio: ${lead1.campanha_id}`);
ok(lead1.ctwa_clid === 'ARAaBBBcccDDD111',
   'o ctwa_clid ficou guardado — é o que devolve a conversão para a Meta');
ok(lead1.ad_id === '120219876543210', 'o id do anúncio ficou no lead');

const camp = await um(`select * from campanha where id='meta:ad:120219876543210'`);
ok(camp.nome === 'Raquetes Nox com 20% off',
   'a campanha nasceu com o TÍTULO do anúncio, não com o número cru');
ok(camp.meta_ad_id === '120219876543210' && camp.resolvida === false,
   'fica marcada como não resolvida: falta subir para conjunto e campanha');

const cli1 = await um('select * from cliente where id=$1', [lead1.cliente_id]);
ok(cli1.telefone === '5585991147264',
   `o telefone foi normalizado na entrada: ${cli1.telefone}`);
ok(cli1.campanha_origem === 'meta:ad:120219876543210',
   'a origem do cliente foi congelada no anúncio que o trouxe');

const conv1 = await um('select * from conversa where id=$1', [r1.conversa_id]);
ok(conv1.canal_id === 'loja', 'a conversa nasceu no canal da loja');
ok(conv1.atendente_id === null && conv1.status === 'nova',
   'nasce SEM dono: quem distribui é a automação, não a chegada');
ok(conv1.nao_lidas === 1, 'uma não lida');

/* ═══════════════════════════════════════════════════════════ o reenvio ═══ */
titulo('A META REENVIA — o webhook que chega duas vezes');

const r1bis = await receber({
  tel: '5585991147264', nome: 'Ana Ribeiro',
  wamid: 'wamid.AAA1', texto: 'Oi, vi o anúncio da raquete',
  referral: anuncioVerao,
});

ok(r1bis.mensagem_id === null,
   'o reenvio não grava mensagem nova — devolve nulo e sai');
ok(r1bis.conversa_id === r1.conversa_id && r1bis.lead_id === r1.lead_id,
   'e devolve a MESMA conversa e o MESMO lead');

const n1 = await um('select count(*)::int c from mensagem where conversa_id=$1',
  [r1.conversa_id]);
ok(n1.c === 1, `a conversa continua com uma mensagem só: ${n1.c}`);

const conv1b = await um('select nao_lidas from conversa where id=$1', [r1.conversa_id]);
ok(conv1b.nao_lidas === 1,
   'e o contador de não lidas NÃO inflou — reenvio não é mensagem nova');

/* ═════════════════════════════════════════════════════ fora de ordem ═══ */
titulo('A META ENTREGA FORA DE ORDEM — a mensagem atrasada');

const agora = new Date();
const cedo  = new Date(agora.getTime() - 60 * 60_000).toISOString();  // 1h antes

await receber({ tel: '5585991147264', wamid: 'wamid.AAA2',
  texto: 'segunda mensagem', em: agora.toISOString() });
const depoisDaNova = await um('select ultima_mensagem_em from conversa where id=$1',
  [r1.conversa_id]);

await receber({ tel: '5585991147264', wamid: 'wamid.AAA0',
  texto: 'mensagem atrasada, de uma hora atrás', em: cedo });
const depoisDaAtrasada = await um('select ultima_mensagem_em from conversa where id=$1',
  [r1.conversa_id]);

ok(+new Date(depoisDaAtrasada.ultima_mensagem_em) === +new Date(depoisDaNova.ultima_mensagem_em),
   'a mensagem atrasada NÃO faz a conversa voltar no tempo nem sumir do topo');

const ordem = (await db.query(
  `select conteudo from mensagem where conversa_id=$1 order by enviada_em`,
  [r1.conversa_id])).rows.map(r => r.conteudo);
ok(ordem[0].startsWith('mensagem atrasada'),
   'mas o CHAT a mostra no lugar certo: ordena pelo relógio do WhatsApp');

/* ═════════════════════════════════════════════ o lead não se multiplica ═══ */
titulo('O CLIENTE MANDA CINCO MENSAGENS — e continua sendo um lead');

for (let i = 0; i < 5; i++) {
  await receber({ tel: '5585991147264', wamid: `wamid.SEQ${i}`, texto: `msg ${i}` });
}
const leads1 = await um(`select count(*)::int c from lead where cliente_id=$1`,
  [lead1.cliente_id]);
ok(leads1.c === 1, `cinco mensagens, um lead só: ${leads1.c}`);

/* ═══════════════════════════════ DUAS CONVERSAS, O MESMO CLIENTE ═══ */
titulo('O VENDEDOR ABRE DO NÚMERO DELE — duas conversas ao mesmo tempo');

const r2 = await receber({
  canal: 'vend:c', tel: '5585991147264',
  wamid: 'wamid.VC1', texto: 'Oi Gabriel, respondendo aqui',
});

ok(r2.primeira === true, 'no número do vendedor é uma conversa nova');
ok(r2.conversa_id !== r1.conversa_id, 'e é outra conversa, não a mesma');
ok(r2.lead_id === r1.lead_id,
   'MAS é o MESMO lead: dois canais, um interesse, um card no funil');

const abertas = await um(`select count(*)::int c from conversa
  where cliente_id=$1 and status <> 'resolvida'`, [lead1.cliente_id]);
ok(abertas.c === 2,
   `as duas conversas convivem abertas: ${abertas.c} — era aqui que o banco recusava`);

const conv2 = await um('select * from v_conversa where id=$1', [r2.conversa_id]);
ok(conv2.canal_tipo === 'vendedor' && conv2.canal_via === 'evolution',
   'a view sabe de que tipo de número é a conversa');
ok(conv2.campanha_nome === 'Raquetes Nox com 20% off',
   'e a campanha aparece na conversa do vendedor, herdada pelo lead');

/* ═══════════════════════════════════════════════════════════ a janela ═══ */
titulo('A JANELA DE 24H — que só existe num dos dois canais');

ok((await um('select janela_aberta from v_conversa where id=$1',
  [r1.conversa_id])).janela_aberta === true, 'loja: janela aberta após o cliente falar');

await db.query(`update conversa set ultima_mensagem_cliente_em = now() - interval '25 hours'
                where id=$1`, [r1.conversa_id]);
ok((await um('select janela_aberta from v_conversa where id=$1',
  [r1.conversa_id])).janela_aberta === false,
   'loja: passadas 24h a janela fecha sozinha — só template sai');

await db.query(`update conversa set ultima_mensagem_cliente_em = now() - interval '25 hours'
                where id=$1`, [r2.conversa_id]);
ok((await um('select janela_aberta from v_conversa where id=$1',
  [r2.conversa_id])).janela_aberta === true,
   'vendedor: não existe janela no canal por QR — e o aviso não aparece à toa');

/* ═════════════════════════════════════════════════════════ o orgânico ═══ */
titulo('QUEM CHEGA SEM ANÚNCIO — honesto sobre o que não se sabe');

const r3 = await receber({
  tel: '5585912345678', nome: 'Bruno', wamid: 'wamid.BBB1',
  texto: 'oi, vocês tem raquete?',
});
const lead3 = await um('select * from lead where id=$1', [r3.lead_id]);
ok(lead3.campanha_id === 'nao_rastreado',
   'sem referral, o lead fica marcado como não rastreado');
ok(lead3.ctwa_clid === null, 'e sem ctwa_clid, que é o correto');

const cli3 = await um('select campanha_origem from cliente where id=$1', [lead3.cliente_id]);
ok(cli3.campanha_origem === null,
   'a ORIGEM do cliente fica nula, não "nao_rastreado": não saber não é uma origem');

// e se depois ele clicar no anúncio, a origem finalmente é conhecida
await receber({ tel: '5585912345678', wamid: 'wamid.BBB2',
  texto: 'vi o anúncio agora', referral: anuncioVerao });
const cli3b = await um('select campanha_origem from cliente where id=$1', [lead3.cliente_id]);
ok(cli3b.campanha_origem === 'meta:ad:120219876543210',
   'quando o anúncio aparece depois, ELE vira a origem — congela-se a primeira CONHECIDA');

/* ═════════════════════════════════ campanha pelo CÓDIGO no texto ═══ */
titulo('QUEM CHEGA POR LINK COM CÓDIGO — QR do balcão, story, professor');

await db.query(`insert into campanha (id, nome, canal, codigo, ativa) values
  ('link:verao26','Verão 26 — link direto','outro','VERAO26',true),
  ('link:antiga','Campanha encerrada','outro','ANTIGA',false)`);

const rc1 = await receber({
  tel: '5585988776655', nome: 'Carlos', wamid: 'wamid.COD1',
  texto: 'Oi! Quero a Nox ML10 [VERAO26]',
});
const leadC = await um('select * from lead where id=$1', [rc1.lead_id]);
ok(leadC.campanha_id === 'link:verao26',
   `o código no texto virou campanha: ${leadC.campanha_id}`);

const cliC = await um('select campanha_origem from cliente where id=$1', [leadC.cliente_id]);
ok(cliC.campanha_origem === 'link:verao26',
   'e a origem do cliente também — link é origem conhecida, não "não rastreado"');

// minúsculo funciona: o cliente pode editar a mensagem antes de mandar
const rc2 = await receber({
  tel: '5585988776644', wamid: 'wamid.COD2', texto: 'quero saber preço [verao26]',
});
ok((await um('select campanha_id from lead where id=$1', [rc2.lead_id])).campanha_id
   === 'link:verao26', 'código em minúsculo também casa');

// código inventado NÃO cria campanha fantasma
const rc3 = await receber({
  tel: '5585988776633', wamid: 'wamid.COD3', texto: 'oi [PROMOCAOQUENAOEXISTE]',
});
ok((await um('select campanha_id from lead where id=$1', [rc3.lead_id])).campanha_id
   === 'nao_rastreado',
   'código que não existe NÃO cria campanha fantasma no painel de mídia');

// campanha desativada não recebe lead novo
const rc4 = await receber({
  tel: '5585988776622', wamid: 'wamid.COD4', texto: 'oi [ANTIGA]',
});
ok((await um('select campanha_id from lead where id=$1', [rc4.lead_id])).campanha_id
   === 'nao_rastreado', 'campanha desativada não recebe lead novo');

// o anúncio de verdade GANHA do código, quando os dois vêm juntos
const rc5 = await receber({
  tel: '5585988776611', wamid: 'wamid.COD5',
  texto: 'vim pelo anúncio [VERAO26]', referral: anuncioVerao,
});
ok((await um('select campanha_id from lead where id=$1', [rc5.lead_id])).campanha_id
   === 'meta:ad:120219876543210',
   'com referral E código, o ANÚNCIO vence: ele é o dado da Meta, não um texto digitável');

/* ═══════════════════════════════════════════════════════ o que recusa ═══ */
titulo('O QUE O BANCO RECUSA');

ok(await barra(`select receber_mensagem('loja','123')`),
   'telefone inválido é recusado na porta, não vira cliente fantasma');
ok(await barra(`select receber_mensagem('canal-que-nao-existe','5585991147264')`),
   'canal inexistente é recusado');

await db.query(`update canal set ativo = false where id='vend:c'`);
ok(await barra(`select receber_mensagem('vend:c','5585991147264')`),
   'canal desativado para de receber — é assim que se aposenta um chip banido');
await db.query(`update canal set ativo = true where id='vend:c'`);

ok(await barra(`insert into canal (id,nome,tipo,via,telefone,phone_number_id)
                values ('x','X','vendedor','cloud_api','5585900000001','PNID_X')`),
   'canal de vendedor SEM vendedor é recusado: conversa que não cai na caixa de ninguém');
ok(await barra(`insert into canal (id,nome,tipo,via,telefone)
                values ('y','Y','loja','cloud_api','5585900000002')`),
   'canal cloud_api sem phone_number_id é recusado: o webhook não teria como rotear');

/* ═══════════════════════════════════════════════════════════ reabrir ═══ */
titulo('O CLIENTE VOLTA DEPOIS DE RESOLVIDO');

await db.query(`update conversa set status='resolvida' where id=$1`, [r1.conversa_id]);
const r4 = await receber({ tel: '5585991147264', wamid: 'wamid.VOLTA', texto: 'oi de novo' });
ok(r4.conversa_id === r1.conversa_id,
   'reabre a MESMA thread — o WhatsApp tem uma conversa por contato, e o CRM também');
ok((await um('select status from conversa where id=$1', [r1.conversa_id])).status === 'nova',
   'e volta para "nova", pedindo atendimento');

await db.query('select marcar_lida($1)', [r1.conversa_id]);
ok((await um('select nao_lidas from conversa where id=$1', [r1.conversa_id])).nao_lidas === 0,
   'marcar como lida zera o contador');

/* ══════════════════════════════════════════════════════════════ acesso ═══ */
titulo('A CAIXA DA LOJA NÃO É DE TODO MUNDO');

async function como(uid, fn) {
  await db.exec(`set role authenticated;`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
}
const conta = async (sql, p) => {
  try { return Number((await um(`select count(*)::int c from (${sql}) t`, p)).c); }
  catch { return -1; }
};

await como(AUTH.admin, async () => {
  ok(await conta(`select * from conversa`) >= 3, 'o admin vê a caixa inteira');
});

await como(AUTH.vend2, async () => {
  ok(await conta(`select * from conversa`) === 0,
     'o vendedor D NÃO vê a caixa da loja: conversa sem dono não é de todos');
  ok(await conta(`select * from v_conversa`) === 0,
     'e nem pela view — security_invoker mantém o RLS de pé');
});

await como(AUTH.vend, async () => {
  ok(await conta(`select * from conversa`) === 1,
     'o vendedor C vê UMA: a do número dele, e mais nada da loja');
});

// agora a loja atribui a conversa a ele
await db.query(`select assumir_conversa($1,$2)`, [r1.conversa_id, vend.id]);
await como(AUTH.vend, async () => {
  ok(await conta(`select * from conversa`) === 2,
     'depois de atribuída, a conversa da loja aparece para ele — e só para ele');
});
await como(AUTH.vend2, async () => {
  ok(await conta(`select * from conversa`) === 0,
     'e continua invisível para o colega');
});

// a chave que liga a tela ao banco
await como(AUTH.vend, async () => {
  ok(await conta(`select * from mensagem`) > 0,
     'a mensagem segue a conversa: se ele vê a conversa, vê o chat');
});
await como(AUTH.vend2, async () => {
  ok(await conta(`select * from mensagem`) === 0,
     'e quem não vê a conversa não lê uma linha do chat');
});

/* ------------------------------------------------------------------------- */
console.log(`\n${'═'.repeat(66)}`);
if (falhas === 0) {
  console.log(`
  A chegada do cliente funciona.

  O que isto prova: a mensagem que entra pelo número da loja vira cliente,
  lead, conversa e campanha uma vez só — mesmo com a Meta reenviando e
  entregando fora de ordem. O mesmo cliente conversa nos dois números ao
  mesmo tempo sem colidir, e a caixa da loja não é visível para o vendedor
  MESMO consultando o banco por fora da tela.
`);
} else {
  console.log(`\n  ${falhas} verificação(ões) falharam.\n`);
  process.exit(1);
}
