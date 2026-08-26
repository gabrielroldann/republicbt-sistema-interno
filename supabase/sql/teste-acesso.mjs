/**
 * TESTES DE ACESSO
 *
 * O que estes testes provam não é que a tela esconde — é que o BANCO recusa.
 *
 * A diferença importa: o Supabase expõe uma API REST sobre as tabelas, e a
 * chave anônima está no JavaScript do navegador, à vista de todo mundo. Um
 * vendedor curioso abre o console e consulta direto. Se o controle estivesse só
 * na tela, ele leria o custo de todas as raquetes.
 *
 *   npm run teste-acesso
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const base = new URL('.', import.meta.url).pathname;
const db = await new PGlite();

let falhas = 0;
const ok = (c, m) => { console.log(`   ${c ? '✓' : '✗ FALHOU:'} ${m}`); if (!c) falhas++; };
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
const titulo = (t) => console.log(`\n${'─'.repeat(66)}\n${t}\n${'─'.repeat(66)}`);

/* ------------------------------------------------------------------------- */
/* Dublê do Supabase.                                                         */
/* `auth.uid()` lê de uma variável de sessão, que é como o Supabase faz.       */
/* ------------------------------------------------------------------------- */
await db.exec(`
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  -- papel usado pelo PostgREST para quem está logado
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
`);

for (const arq of ['01-nucleo.sql', '02-crm.sql', '03-site.sql', '04-acesso.sql']) {
  try {
    await db.exec(readFileSync(`${base}/${arq}`, 'utf8'));
  } catch (e) { console.log(`FALHA ${arq}: ${e.message}`); process.exit(1); }
}
/**
 * O Supabase concede acesso amplo ao papel `authenticated` e deixa o RLS ser o
 * único freio. Sem reproduzir isso, o banco recusaria por falta de GRANT — e o
 * teste passaria pelo motivo errado, sem provar nada sobre as policies.
 */
await db.exec(`
  grant usage on schema public to authenticated;
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
  grant usage on schema auth to authenticated;
  grant execute on all functions in schema auth to authenticated;
`);

console.log('   schema aplicado (4 arquivos) + grants do Supabase');

/* ------------------------------------------------------- dados de teste -- */
const AUTH = {
  admin: '11111111-1111-1111-1111-111111111111',
  socio: '22222222-2222-2222-2222-222222222222',
  vend:  '33333333-3333-3333-3333-333333333333',
  vend2: '44444444-4444-4444-4444-444444444444',
};

const dono = await um(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Gabriel','GR','admin',$1) returning id`, [AUTH.admin]);
const socio = await um(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Sócio B','SB','socio',$1) returning id`, [AUTH.socio]);
const vend = await um(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Vendedor C','VC','vendedor',$1) returning id`, [AUTH.vend]);
const vend2 = await um(`insert into vendedor (nome,iniciais,papel,auth_user_id)
  values ('Vendedor D','VD','vendedor',$1) returning id`, [AUTH.vend2]);

const prod = await um(`insert into produto (sku,nome,categoria,custo,preco)
  values ('RQ-1','Nox ML10','raquetes',430,700) returning id`);
const cli = await um(`insert into cliente (telefone,nome)
  values ('5585991147264','Ana') returning id`);

const leadDoC = await um(`insert into lead (cliente_id,responsavel_id,titulo,valor)
  values ($1,$2,'Lead do C',700) returning id`, [cli.id, vend.id]);
await db.query(`insert into lead (cliente_id,responsavel_id,titulo,valor)
  values ($1,$2,'Lead do D',890)`, [cli.id, vend2.id]);

const vendaC = await um(`insert into venda
  (data,produto_id,vendedor_id,cliente_id,quantidade,preco_unit,custo_unit,
   forma_pagamento,taxa_pct,comissao_pct)
  values (current_date,$1,$2,$3,1,700,430,'pix',0.99,3) returning id`,
  [prod.id, vend.id, cli.id]);
await db.query(`insert into venda
  (data,produto_id,vendedor_id,cliente_id,quantidade,preco_unit,custo_unit,
   forma_pagamento,taxa_pct,comissao_pct)
  values (current_date,$1,$2,$3,1,890,520,'pix',0.99,3)`,
  [prod.id, vend2.id, cli.id]);

await db.query(`insert into despesa (data,descricao,categoria,valor)
  values (current_date,'Aluguel','aluguel',3400)`);
await db.query(`insert into campanha (id,nome,canal) values ('meta:v','Verão','meta')
  on conflict do nothing`);
await db.query(`insert into custo_midia (data,campanha_id,gasto)
  values (current_date,'meta:v',820)`);

/* -------------------------------------------------------- como cada um ---- */
/**
 * Entra na pele de um usuário: assume o papel `authenticated` (que é o que o
 * PostgREST usa) e define o `sub` do token. A partir daqui, o RLS vale.
 */
async function como(uid, fn) {
  await db.exec(`set role authenticated;`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  try { return await fn(); }
  finally { await db.exec(`reset role;`); }
}

const conta = async (sql) => {
  try { return Number((await um(`select count(*)::int c from (${sql}) t`)).c); }
  catch { return -1; }   // -1 = recusado de vez (nem chega no RLS)
};
/** Zero linhas ou recusa: os dois significam "não lê". */
const naoLe = async (sql) => (await conta(sql)) <= 0;
const barrado = async (sql) => {
  try { await db.query(sql); return false; } catch { return true; }
};

/**
 * UPDATE bloqueado por RLS NÃO dá erro — ele simplesmente não encontra linha e
 * afeta zero. Testar por exceção daria falso negativo, e pior: código que
 * confia em "não deu erro, então gravou" mente para o usuário.
 */
const naoAltera = async (sql) => {
  try { return (await db.query(sql)).affectedRows === 0; }
  catch { return true; }   // recusado de vez também serve
};

/* ═══════════════════════════════════════════════════════════ o vendedor ═══ */
titulo('O VENDEDOR — o papel que precisa ser contido');

await como(AUTH.vend, async () => {
  ok(await naoLe('select * from produto'),
     'NÃO lê a tabela produto (é onde mora o custo)');

  ok(await conta('select * from v_produto_venda') > 0,
     'lê o catálogo pela view, com preço e sem custo');

  const cols = (await db.query(`select column_name from information_schema.columns
                                where table_name='v_produto_venda'`)).rows.map(r => r.column_name);
  ok(!cols.includes('custo'),
     'a view do catálogo não TEM a coluna custo — não é só filtro de tela');

  ok(await naoLe('select * from despesa'), 'não lê despesa');
  ok(await naoLe('select * from conta'), 'não lê contas a pagar');
  ok(await naoLe('select * from meta_loja'), 'não lê a meta da loja');
  ok(await naoLe('select * from custo_midia'),
     'não lê quanto a loja gasta em anúncio');
  ok(await conta('select * from campanha') > 0,
     'mas LÊ as campanhas: precisa para ver a origem no card');

  // vendas
  ok(await conta('select * from venda') === 1,
     'lê só a própria venda, não a do colega');

  const vv = (await db.query(`select column_name from information_schema.columns
                              where table_name='v_venda_vendedor'`)).rows.map(r => r.column_name);
  ok(!vv.includes('custo_unit') && !vv.includes('margem'),
     'a view de venda dele não tem custo nem margem');
  ok(vv.includes('comissao'), 'mas tem a comissão: é o salário dele');

  ok(await barrado(`insert into despesa (data,descricao,categoria,valor)
                    values (current_date,'x','aluguel',10)`),
     'não consegue lançar despesa');
  // RLS não grita: só não deixa a linha ser tocada.
  ok(await naoAltera(`update vendedor set papel='admin' where id='${vend.id}'`),
     'NÃO consegue se promover a admin');
  ok((await um(`select papel from vendedor where id='${vend.id}'`)).papel === 'vendedor',
     'e o papel dele continua vendedor depois da tentativa');
  ok(await naoAltera(`update configuracao set valor='false'
                      where chave='vendedor_ve_leads_de_todos'`),
     'não consegue mudar a configuração da loja');
});

/* ══════════════════════════════════ a configuração que muda sem deploy ═══ */
titulo('A configuração de visibilidade do funil');

await como(AUTH.vend, async () => {
  ok(await conta('select * from lead') === 2,
     'com "vendedor vê todos" ligado, enxerga o funil inteiro');
});

await db.exec(`reset role`);
await db.query(`update configuracao set valor='false'
                where chave='vendedor_ve_leads_de_todos'`);

await como(AUTH.vend, async () => {
  ok(await conta('select * from lead') === 1,
     'desligado, passa a ver só os leads dele — sem uma linha de código mudar');
});

await db.exec(`reset role`);
await db.query(`update configuracao set valor='true'
                where chave='vendedor_ve_leads_de_todos'`);

/* ═════════════════════════════════════════════════════════════ o sócio ═══ */
titulo('O SÓCIO — vê o dinheiro, não mexe em gente');

await como(AUTH.socio, async () => {
  ok(await conta('select * from produto') > 0, 'lê o produto com custo');
  ok(await conta('select * from despesa') > 0, 'lê despesa');
  ok(await conta('select * from custo_midia') > 0, 'lê o gasto de mídia');
  ok(await conta('select * from venda') === 2, 'lê TODAS as vendas');
  ok(await conta('select * from v_venda_completa') === 2, 'lê margem e custo');
  ok(await barrado(`insert into vendedor (nome,iniciais) values ('Novo','NV')`),
     'NÃO cria usuário — isso é do admin');
  ok(await naoAltera(`update vendedor set papel='admin' where id='${vend.id}'`),
     'nem promove ninguém');
});

/* ═════════════════════════════════════════════════════════════ o admin ═══ */
titulo('O ADMIN — o dono');

await como(AUTH.admin, async () => {
  ok(await conta('select * from produto') > 0, 'lê tudo do catálogo');
  ok(await conta('select * from v_venda_completa') === 2, 'lê margem de todas as vendas');
  ok(!(await barrado(`insert into vendedor (nome,iniciais) values ('Novo','NV')`)),
     'cria usuário');
  ok(!(await barrado(`update configuracao set valor='true'
                      where chave='vendedor_ve_leads_de_todos'`)),
     'muda a configuração da loja');
});

/* ═══════════════════════════════════════════════ quem não está logado ═══ */
titulo('SEM LOGIN — o caso que mais importa');

await como(null, async () => {
  ok(await naoLe('select * from lead'), 'não lê lead');
  ok(await naoLe('select * from cliente'), 'não lê cliente');
  ok(await naoLe('select * from venda'), 'não lê venda');
  ok(await naoLe('select * from produto'), 'não lê produto');
  ok(await naoLe('select * from despesa'), 'não lê o financeiro');
});

/* ------------------------------------------------------------------------ */
console.log(`\n${'═'.repeat(66)}`);
console.log(falhas
  ? `\n  ${falhas} falha(s) de acesso — NÃO suba assim.\n`
  : `\n  Todos os níveis de acesso se comportam como devem.

  O que isto prova: o vendedor não consegue ler custo, margem, despesa nem
  gasto de mídia MESMO consultando o banco direto, por fora da tela.\n`);
process.exit(falhas ? 1 : 0);
