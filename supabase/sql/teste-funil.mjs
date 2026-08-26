/**
 * TESTES DA PERSONALIZAÇÃO DO FUNIL
 *
 * O caminho feliz é fácil. O que estes testes cobrem são as tentativas de
 * deixar a loja num estado que não funciona: funil sem etapa de ganho, etapa
 * apagada com lead dentro, tipo trocado por baixo do pano.
 *
 *   npm run teste-funil
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const base = new URL('.', import.meta.url).pathname;
const db = await new PGlite();

let falhas = 0;
const ok = (c, m) => { console.log(`   ${c ? '✓' : '✗ FALHOU:'} ${m}`); if (!c) falhas++; };
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
const q = async (sql, p) => (await db.query(sql, p)).rows;
const titulo = (t) => console.log(`\n${'─'.repeat(66)}\n${t}\n${'─'.repeat(66)}`);

await db.exec(`
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
`);
for (const a of ['01-nucleo.sql', '02-crm.sql', '03-site.sql', '04-acesso.sql', '05-funil.sql']) {
  try { await db.exec(readFileSync(`${base}/${a}`, 'utf8')); }
  catch (e) { console.log(`FALHA ${a}: ${e.message}`); process.exit(1); }
}
await db.exec(`
  grant usage on schema public to authenticated;
  grant all on all tables in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
  grant usage on schema auth to authenticated;
  grant execute on all functions in schema auth to authenticated;`);
console.log('   schema aplicado (5 arquivos)');

const ADMIN = '11111111-1111-1111-1111-111111111111';
const VEND = '33333333-3333-3333-3333-333333333333';
await db.query(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Gabriel','GR','admin',$1)`, [ADMIN]);
const vend = await um(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Vendedor','VC','vendedor',$1) returning id`, [VEND]);
const cli = await um(`insert into cliente (telefone,nome)
  values ('5585991147264','Ana') returning id`);

/** Entra na pele de alguém. Sem isso, `eh_admin()` é falso e tudo é recusado. */
async function como(uid, fn) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [uid ?? '']);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const barrado = async (fn) => {
  try { await fn(); return false; } catch { return true; }
};
const ordem = async () =>
  (await q(`select id from etapa order by ordem`)).map((e) => e.id).join(' → ');

/* ═══════════════════════════════════════════════════════════════ criar ═══ */
titulo('CRIAR ETAPA');

await como(ADMIN, async () => {
  const nova = await um(`select criar_etapa('Aguardando pagamento','info') as id`);
  ok(nova.id === 'aguardando_pagamento',
     `id gerado a partir do nome: ${nova.id}`);

  const acento = await um(`select criar_etapa('Pré-negociação') as id`);
  ok(acento.id === 'pre_negociacao', `acento e hífen tratados: ${acento.id}`);

  const repetido = await um(`select criar_etapa('Pré-negociação') as id`);
  ok(repetido.id === 'pre_negociacao_2', `nome repetido ganha sufixo: ${repetido.id}`);

  const e = await um(`select ordem, tipo from etapa where id='aguardando_pagamento'`);
  const ganho = await um(`select ordem from etapa where tipo='ganho'`);
  ok(e.tipo === 'aberta', 'etapa nova nasce aberta');
  ok(Number(e.ordem) < Number(ganho.ordem),
     'e entra ANTES do ganho — kanban se lê da esquerda para a direita');

  // inserir no meio
  await um(`select criar_etapa('Follow-up','attention','novo') as id`);
  const dep = await q(`select id from etapa where tipo='aberta' order by ordem`);
  ok(dep[0].id === 'novo' && dep[1].id === 'follow_up',
     `criada logo depois de "novo": ${dep.map(x => x.id).join(' → ')}`);
});

/* ═════════════════════════════════════════════════════════ reordenar ═══ */
titulo('REORDENAR');

await como(ADMIN, async () => {
  const abertas = (await q(`select id from etapa where tipo='aberta' order by ordem`))
    .map((e) => e.id);
  const invertida = [...abertas].reverse();

  await db.query(`select reordenar_etapas($1::text[])`, [invertida]);
  const depois = (await q(`select id from etapa where tipo='aberta' order by ordem`))
    .map((e) => e.id);
  ok(depois.join() === invertida.join(), 'a ordem inteira foi reescrita');

  const fim = await q(`select id, tipo from etapa order by ordem desc limit 2`);
  ok(fim[0].tipo === 'perdido' && fim[1].tipo === 'ganho',
     'ganho e perdido continuam no fim, sempre');

  ok(await barrado(() => db.query(`select reordenar_etapas($1::text[])`,
       [abertas.slice(1)])),
     'lista incompleta é recusada — meia reordenação não existe');

  ok(await barrado(() => db.query(`select reordenar_etapas($1::text[])`,
       [[...abertas.slice(1), 'ganho']])),
     'não dá para arrastar o "Venda ganha" para o meio do funil');

  ok(await barrado(() => db.query(`select reordenar_etapas($1::text[])`,
       [[...abertas.slice(1), 'inexistente']])),
     'etapa inexistente na lista é recusada');
});

/* ══════════════════════════════════════════════════════════ renomear ═══ */
titulo('RENOMEAR');

await como(ADMIN, async () => {
  await db.query(`select renomear_etapa('aguardando_pagamento','Aguardando Pix','positive')`);
  const e = await um(`select id, nome, cor from etapa where id='aguardando_pagamento'`);
  ok(e.nome === 'Aguardando Pix' && e.cor === 'positive', 'nome e cor mudaram');
  ok(e.id === 'aguardando_pagamento',
     'mas o id NÃO mudou: os leads apontam para ele');

  ok(await barrado(() => db.query(`select renomear_etapa('aguardando_pagamento','   ')`)),
     'nome vazio é recusado');
});

/* ════════════════════════════════ as invariantes que protegem a loja ═══ */
titulo('O QUE NÃO PODE ACONTECER');

await como(ADMIN, async () => {
  ok(await barrado(() => db.query(`update etapa set tipo='ganho' where id='proposta'`)),
     'trocar o TIPO de uma etapa é bloqueado — mudaria o faturamento do histórico');

  ok(await barrado(() => db.query(`update etapa set id='outro' where id='proposta'`)),
     'trocar o ID é bloqueado — os leads ficariam órfãos');

  ok(await barrado(() => db.query(`delete from etapa where tipo='ganho'`)),
     'apagar a etapa de ganho é bloqueado');

  ok(await barrado(() => db.query(`delete from etapa where tipo='perdido'`)),
     'apagar a etapa de perdido é bloqueado');

  ok(await barrado(() => db.query(`delete from etapa where tipo='aberta'`)),
     'apagar TODAS as abertas é bloqueado: lead novo não teria onde entrar');
});

/* ════════════════════════════════════════════════════════════ excluir ═══ */
titulo('EXCLUIR ETAPA COM LEAD DENTRO');

await como(ADMIN, async () => {
  const alvo = await um(`select id from etapa where tipo='aberta' order by ordem limit 1`);
  const destino = await um(`select id from etapa where tipo='aberta' and id<>$1
                            order by ordem limit 1`, [alvo.id]);

  await db.query(`insert into lead (cliente_id,etapa_id,titulo) values
    ($1,$2,'Lead A'), ($1,$2,'Lead B'), ($1,$2,'Lead C')`, [cli.id, alvo.id]);

  ok(await barrado(() => db.query(`delete from etapa where id=$1`, [alvo.id])),
     'apagar direto no banco é barrado pela chave estrangeira dos leads');

  const movidos = await um(`select excluir_etapa($1,$2) as n`, [alvo.id, destino.id]);
  ok(Number(movidos.n) === 3, `os 3 leads foram MOVIDOS, não apagados (${movidos.n})`);

  ok((await um(`select count(*)::int c from lead where etapa_id=$1`, [destino.id])).c === 3,
     'e estão na etapa de destino');
  ok((await um(`select count(*)::int c from etapa where id=$1`, [alvo.id])).c === 0,
     'a etapa sumiu');

  const seq = (await q(`select ordem from etapa where tipo='aberta' order by ordem`))
    .map((e) => Number(e.ordem));
  ok(seq.every((v, i) => v === i + 1),
     `a numeração fecha o buraco: ${seq.join(',')}`);

  ok(await barrado(() => db.query(`select excluir_etapa('ganho','novo')`)),
     'excluir a etapa de ganho é recusado');

  const sobra = await um(`select id from etapa where tipo='aberta' order by ordem limit 1`);
  ok(await barrado(() => db.query(`select excluir_etapa($1,$1)`, [sobra.id])),
     'mover os leads para a própria etapa que está sendo apagada é recusado');
});

/* ══════════════════════════════════════════════════════════ permissão ═══ */
titulo('QUEM PODE MEXER NO FUNIL');

await como(VEND, async () => {
  ok(await barrado(() => db.query(`select criar_etapa('Etapa do vendedor')`)),
     'vendedor NÃO cria etapa');
  ok(await barrado(() => db.query(`select renomear_etapa('novo','Outro nome')`)),
     'vendedor NÃO renomeia');
  ok(await barrado(() => db.query(`select excluir_etapa('novo','proposta')`)),
     'vendedor NÃO exclui');
  ok((await q(`select id from etapa`)).length > 0, 'mas LÊ o funil normalmente');
});

await como(null, async () => {
  ok(await barrado(() => db.query(`select criar_etapa('Sem login')`)),
     'sem login não cria nada');
});

console.log(`\n   funil final: ${await ordem()}`);
console.log(`\n${'═'.repeat(66)}`);
console.log(falhas
  ? `\n  ${falhas} falha(s).\n`
  : `\n  Personalização do funil funciona, e o funil não pode ser quebrado.

  Nenhuma sequência de cliques deixa a loja sem etapa de ganho, sem etapa
  aberta, ou com lead apontando para etapa que não existe.\n`);
process.exit(falhas ? 1 : 0);
