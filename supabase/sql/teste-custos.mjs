/**
 * TESTES DOS CUSTOS FIXOS
 *
 * O que se prova aqui é a idempotência e a proteção do passado — os dois erros
 * que fariam o lucro por raquete mentir sem dar nenhum sinal:
 *
 *   1. Aplicar o modelo duas vezes empilharia dois aluguéis no mês, e o lucro
 *      afundaria a cada salvamento na tela. Parece problema de negócio, não
 *      bug, e por isso demora semanas para alguém desconfiar do sistema.
 *
 *   2. Reajustar o aluguel hoje não pode reescrever o resultado de março. Mês
 *      fechado é fato; se ele muda sozinho, nenhum relatório vale nada.
 *
 *   npm run teste-custos
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

for (const arq of ['01-nucleo.sql', '02-crm.sql', '03-site.sql', '04-acesso.sql',
                   '05-funil.sql', '06-custos.sql']) {
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
console.log('   schema aplicado (6 arquivos)');

const AUTH = {
  socio: '22222222-2222-2222-2222-222222222222',
  vend:  '33333333-3333-3333-3333-333333333333',
};
await db.query(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Sócio B','SB','socio',$1)`, [AUTH.socio]);
await db.query(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Vendedor C','VC','vendedor',$1)`, [AUTH.vend]);

const mesAtual = new Date().toISOString().slice(0, 7);

/* ═══════════════════════════════════════════════════════════ o modelo ═══ */
titulo('O MODELO MENSAL');

await db.query(`insert into custo_fixo (nome,categoria,valor_mensal) values
  ('Aluguel da loja','aluguel',3400),
  ('Folha de pagamento','folha',6200),
  ('Energia elétrica','operacional',620),
  ('Água','operacional',110),
  ('Internet','operacional',160)`);

const tot = await um('select * from v_custo_fixo_mensal');
ok(Number(tot.total) === 10490, `o total do modelo soma: ${tot.total}`);
ok(Number(tot.operacional) === 890, 'e separa por categoria: operacional 890');
ok(tot.itens === 5, '5 itens ativos');

ok(await barra(`insert into custo_fixo (nome,categoria,valor_mensal)
                values ('aluguel da loja','aluguel',3400)`),
   'nome repetido é recusado — aluguel dobrado no relatório é invisível');
ok(await barra(`insert into custo_fixo (nome,categoria,valor_mensal)
                values ('Reposição','fornecedores',9000)`),
   'compra de estoque NÃO é custo fixo: ela vira custo da peça quando vende');
ok(await barra(`insert into custo_fixo (nome,categoria,valor_mensal)
                values ('Meta Ads','marketing',2000)`),
   'anúncio NÃO é custo fixo: é linha própria, decidida de novo todo mês');
ok(await barra(`insert into custo_fixo (nome,categoria,valor_mensal)
                values ('Negativo','operacional',-10)`),
   'valor negativo é recusado');

/* ═══════════════════════════════════════════════════════ a aplicação ═══ */
titulo('APLICAR NO MÊS — e aplicar de novo, e de novo');

const n1 = await um('select aplicar_custos_fixos($1) as n', [mesAtual]);
ok(n1.n === 5, `gerou 5 despesas: ${n1.n}`);

const soma1 = await um(`select coalesce(sum(valor),0) v, count(*)::int c from despesa
  where custo_fixo_id is not null`);
ok(Number(soma1.v) === 10490 && soma1.c === 5,
   `as despesas do mês somam o modelo: ${soma1.v} em ${soma1.c} linhas`);

await db.query('select aplicar_custos_fixos($1)', [mesAtual]);
await db.query('select aplicar_custos_fixos($1)', [mesAtual]);
const soma2 = await um(`select coalesce(sum(valor),0) v, count(*)::int c from despesa
  where custo_fixo_id is not null`);
ok(Number(soma2.v) === 10490 && soma2.c === 5,
   `aplicar três vezes NÃO empilha: ${soma2.v} em ${soma2.c} linhas`);

/* ---- despesa avulsa não é apagada pela reaplicação --------------------- */
await db.query(`insert into despesa (data,descricao,categoria,valor)
  values (($1||'-12')::date,'Manutenção do ar-condicionado','operacional',780)`,
  [mesAtual]);
await db.query('select aplicar_custos_fixos($1)', [mesAtual]);
const avulsa = await um(`select count(*)::int c from despesa
  where descricao like 'Manutenção%'`);
ok(avulsa.c === 1,
   'a despesa avulsa sobrevive à reaplicação — ela não veio do modelo');

/* ---- reajuste ---------------------------------------------------------- */
await db.query(`update custo_fixo set valor_mensal = 3800 where nome = 'Aluguel da loja'`);
await db.query('select aplicar_custos_fixos($1)', [mesAtual]);
const reajuste = await um(`select valor from despesa
  where descricao = 'Aluguel da loja' and custo_fixo_id is not null`);
ok(Number(reajuste.valor) === 3800, `o reajuste chega no mês corrente: ${reajuste.valor}`);

/* ---- renomear não duplica --------------------------------------------- */
await db.query(`update custo_fixo set nome = 'Energia' where nome = 'Energia elétrica'`);
await db.query('select aplicar_custos_fixos($1)', [mesAtual]);
const energia = await um(`select count(*)::int c from despesa
  where custo_fixo_id is not null and categoria = 'operacional'`);
ok(energia.c === 3,
   'renomear um custo NÃO duplica a linha: o vínculo é por id, não por texto');

/* ---- desativar --------------------------------------------------------- */
await db.query(`update custo_fixo set ativo = false where nome = 'Água'`);
await db.query('select aplicar_custos_fixos($1)', [mesAtual]);
const semAgua = await um(`select count(*)::int c from despesa
  where descricao = 'Água' and custo_fixo_id is not null`);
ok(semAgua.c === 0, 'desativar tira o custo do mês corrente');

/* ═════════════════════════════════════════════════════ o passado ═══ */
titulo('O PASSADO NÃO MUDA SOZINHO');

const mesPassado = (() => {
  const d = new Date(); d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 7);
})();

ok(await barra('select aplicar_custos_fixos($1)', [mesPassado]),
   `mês fechado (${mesPassado}) é RECUSADO — reajustar hoje não reescreve março`);

const forcado = await um('select aplicar_custos_fixos($1, true) as n', [mesPassado]);
ok(forcado.n === 4, 'mas dá para forçar, de propósito e por escrito');

ok(await barra(`select aplicar_custos_fixos('2026-13')`),
   'competência inválida é recusada');
ok(await barra(`select aplicar_custos_fixos('agosto')`),
   'competência em texto livre é recusada');

/* ═══════════════════════════════════════════════════════════ acesso ═══ */
titulo('CUSTO FIXO É DADO DE SÓCIO');

async function como(uid, fn) {
  await db.exec(`set role authenticated;`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
}
const conta = async (sql) => {
  try { return Number((await um(`select count(*)::int c from (${sql}) t`)).c); }
  catch { return -1; }
};

await como(AUTH.socio, async () => {
  ok(await conta('select * from custo_fixo') > 0, 'o sócio lê os custos fixos');
  ok(await conta('select * from v_custo_fixo_mensal') > 0, 'e lê o total');
});

await como(AUTH.vend, async () => {
  ok(await conta('select * from custo_fixo') <= 0,
     'o vendedor NÃO lê: folha diz quanto cada pessoa ganha');
  ok(await conta('select total from v_custo_fixo_mensal where total > 0') <= 0,
     'e nem pela view — security_invoker mantém o RLS de pé');
  ok(await barra(`insert into custo_fixo (nome,categoria,valor_mensal)
                  values ('Meu aumento','folha',9000)`),
     'e não cria custo nenhum');
});

/* ------------------------------------------------------------------------- */
console.log(`\n${'═'.repeat(66)}`);
if (falhas === 0) {
  console.log(`
  Os custos fixos se comportam.

  O que isto prova: aplicar o modelo N vezes deixa o mês igual, despesa avulsa
  não é apagada por engano, renomear não duplica, e mês fechado só muda se
  alguém pedir por escrito. O vendedor não lê nenhum desses números.
`);
} else {
  console.log(`\n  ${falhas} verificação(ões) falharam.\n`);
  process.exit(1);
}
