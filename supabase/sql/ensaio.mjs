/**
 * ENSAIO DO FLUXO COMPLETO — CRM próprio
 *
 * Anúncio → conversa → lead → atendimento → venda → painel.
 *
 * Roda num Postgres embutido: não precisa de conta, de número no WhatsApp, de
 * cartão nem de internet. Prova que a lógica fecha ponta a ponta.
 *
 *   npm run ensaio
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const base = new URL('.', import.meta.url).pathname;
const db = await new PGlite();
for (const a of ['01-nucleo.sql', '02-crm.sql', '03-site.sql']) {
  await db.exec(readFileSync(`${base}/${a}`, 'utf8'));
}

const q = async (sql, p) => (await db.query(sql, p)).rows;
const um = async (sql, p) => (await q(sql, p))[0];
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => `${Number(v).toFixed(1)}%`;
const n = (v) => Number(v);
const titulo = (t) => console.log(`\n${'─'.repeat(68)}\n${t}\n${'─'.repeat(68)}`);

let erros = 0;
const confere = (c, m) => { console.log(`   ${c ? '✓' : '✗ FALHOU:'} ${m}`); if (!c) erros++; };

/**
 * A chegada de um lead. Captura rápida do CRM e webhook da Meta usam a MESMA
 * função — um caminho só de criação, senão os dados divergem conforme a porta.
 */
async function chegaLead({ nome, titulo, valor, utm }, telefone, campanha) {
  const r = await um('select criar_lead($1,$2,$3,$4,$5,null,$6,$7,$8::jsonb) as id',
    [telefone, nome, campanha?.id ?? null, campanha?.nome ?? null,
     campanha?.canal ?? 'meta', titulo ?? null, valor ?? null,
     JSON.stringify(utm ?? {})]);
  return r.id;
}

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  ENSAIO — Republic BT                                            ║
║  anúncio → conversa → lead → atendimento → venda → painel        ║
╚══════════════════════════════════════════════════════════════════╝`);

/* ══════════════════════════════════════════════════════ 1. A loja ═══════ */
titulo('1. A loja');

const gabriel = await um(`insert into vendedor (nome,iniciais,meta_mensal,comissao_pct)
  values ('Gabriel','GR',18000,3) returning id`);
const socioB = await um(`insert into vendedor (nome,iniciais,meta_mensal,comissao_pct)
  values ('Sócio B','SB',12000,3) returning id`);

const raquete = await um(`insert into produto (sku,nome,categoria,marca,custo,preco,estoque_min)
  values ('RQ-NOX-01','Nox ML10 Pro Cup','raquetes','Nox',430,700,2) returning id`);

// 20 raquetes a R$400 + R$600 de frete = R$430 cada
await db.query(`insert into movimento_estoque (produto_id,quantidade,tipo,custo_unit,frete_rateado)
  values ($1,20,'entrada',400,30)`, [raquete.id]);
await db.query(`insert into meta_loja (mes,receita)
  values (to_char(current_date,'YYYY-MM'), 30000)`);

console.log(`   2 vendedores · 20 raquetes · meta ${brl(30000)}`);
confere(n((await um('select estoque from v_produto where id=$1', [raquete.id])).estoque) === 20,
  'saldo veio da soma dos movimentos, não de um campo');

/* ═══════════════════════════════════════════════════ 2. A campanha ═════ */
titulo('2. Segunda — sobe a campanha');

const VERAO = { id: 'meta:verao-2026', nome: 'Verão 2026 — Raquetes', canal: 'meta' };
const INSTIT = { id: 'meta:institucional', nome: 'Institucional', canal: 'meta' };
await db.query(`insert into campanha (id,nome,canal) values ($1,$2,'meta'),($3,$4,'meta')
  on conflict do nothing`, [VERAO.id, VERAO.nome, INSTIT.id, INSTIT.nome]);

for (let d = 6; d >= 0; d--) {
  await db.query(`insert into custo_midia (data,campanha_id,gasto,impressoes,cliques,origem)
    values (current_date - ($1)::int,$2,117.14,3200,88,'meta_api'),
           (current_date - ($1)::int,$3, 87.14,2100,41,'meta_api')`,
    [d, VERAO.id, INSTIT.id]);
}
console.log(`   "${VERAO.nome}" · 7 dias · ${brl((await um(
  `select sum(gasto) g from custo_midia where campanha_id=$1`, [VERAO.id])).g)}`);

/* ═════════════════════════════════════════════ 3. A cliente chega ══════ */
titulo('3. Terça, 14h — Ana clica no anúncio e manda mensagem');
console.log('   Meta gera ctwa_clid → Cloud API → nosso webhook → CRM\n');

const leadAna = await chegaLead({
  nome: 'Ana Ribeiro', titulo: 'Raquete Nox — Ana', valor: 700,
  utm: { utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'verao-2026',
         utm_content: 'criativo-carrossel-a', ctwa_clid: 'ARBxK9teste', ad_id: '120384' },
}, '(85) 99114-7264', VERAO);

const ana = await um(`select l.titulo, l.campanha_id, l.utm_content, l.ctwa_clid, l.etapa_id,
  c.id cliente_id, c.telefone, c.campanha_origem
  from lead l join cliente c on c.id=l.cliente_id where l.id=$1`, [leadAna]);

console.log(`   ${ana.titulo} · ${ana.telefone}`);
console.log(`   campanha ${ana.campanha_id} · criativo ${ana.utm_content}`);
console.log(`   ctwa_clid ${ana.ctwa_clid}   (é o que devolve a compra à Meta depois)`);
confere(ana.etapa_id === 'novo', 'lead entra em Novo contato');
confere(ana.campanha_origem === VERAO.id, 'campanha gravada também no cliente');

// a conversa que nasceu junto
const conversaAna = await um(`insert into conversa
  (cliente_id, lead_id, telefone, ctwa_clid, ad_id, ultima_mensagem_em, ultima_mensagem_cliente_em)
  values ($1,$2,$3,'ARBxK9teste','120384', now(), now()) returning id`,
  [ana.cliente_id, leadAna, ana.telefone]);
await db.query(`insert into mensagem (conversa_id,direcao,conteudo,wa_message_id)
  values ($1,'entrada','Oi, vi o anúncio da raquete. Ainda tem?','wamid.AAA1')`, [conversaAna.id]);

/* mais leads, para o painel ter com o que comparar */
await chegaLead({ nome: 'Bruno Alves', valor: 700,
  utm: { utm_campaign: 'verao-2026' } }, '85 98888-1122', VERAO);
const leadCarla = await chegaLead({ nome: 'Carla Dias', valor: 700,
  utm: { utm_campaign: 'institucional' } }, '85 97777-3344', INSTIT);
await chegaLead({ nome: 'Diego Souza', valor: 700 }, '85 96666-5566',
  { id: 'nao_rastreado', nome: 'Não rastreado', canal: 'outro' });

await db.query(`select mover_lead($1,'perdido','preco')`, [leadCarla]);
console.log(`   + 3 leads (1 perdido por preço, 1 sem origem)`);

/* ══════════════════════════════════════ 4. A fila e a resposta dupla ═══ */
titulo('4. Os dois sócios veem a conversa ao mesmo tempo');

const a1 = await um('select assumir_conversa($1,$2) as ok', [conversaAna.id, gabriel.id]);
const a2 = await um('select assumir_conversa($1,$2) as ok', [conversaAna.id, socioB.id]);
console.log(`   Gabriel clica em "assumir" → ${a1.ok ? 'assumiu' : 'barrado'}`);
console.log(`   Sócio B clica no mesmo instante → ${a2.ok ? 'assumiu' : 'barrado'}`);
confere(a1.ok === true && a2.ok === false, 'só um assume: a resposta dupla não acontece');

const j = await um('select janela_aberta, atendente_nome from v_conversa where id=$1',
  [conversaAna.id]);
console.log(`   em atendimento por ${j.atendente_nome} · janela de 24h ${j.janela_aberta ? 'aberta' : 'fechada'}`);

await db.query(`insert into mensagem (conversa_id,direcao,conteudo,autor_id,wa_message_id)
  values ($1,'saida','Temos sim! Te mando as fotos.',$2,'wamid.BBB1')`,
  [conversaAna.id, gabriel.id]);
await db.query(`select mover_lead($1,'proposta')`, [leadAna]);

/* ═══════════════════════════════════ 5. A conversa vira venda ══════════ */
titulo('5. Quinta — Ana fecha, direto da conversa');

const casou = await um(`select * from casar_venda_com_lead('85991147264')`);
console.log(`   telefone → cliente e campanha achados sozinhos: ${casou.campanha_id}`);
confere(casou.cliente_id === ana.cliente_id, 'casou com o cliente certo');

const venda = await um(`insert into venda
  (data,produto_id,vendedor_id,cliente_id,quantidade,preco_unit,custo_unit,
   forma_pagamento,parcelas,taxa_pct,comissao_pct,canal,campanha_id,
   trade_in_modelo,trade_in_valor,entrega)
  values (current_date,$1,$2,$3,1,700,430,'credito_parcelado',3,5.49,3,
          'trafego_pago',$4,'Vision Master usada',200,'entregue') returning id`,
  [raquete.id, gabriel.id, ana.cliente_id, casou.campanha_id]);

await db.query(`insert into movimento_estoque (produto_id,quantidade,tipo,custo_unit,venda_id)
  values ($1,-1,'venda',430,$2)`, [raquete.id, venda.id]);
await db.query(`insert into pagamento (venda_id,data,valor,forma)
  values ($1,current_date,166.67,'credito_parcelado')`, [venda.id]);
await db.query(`select mover_lead($1,'ganho')`, [leadAna]);

const vc = await um('select * from v_venda_completa where id=$1', [venda.id]);
console.log(`
   preço          ${brl(vc.receita).padStart(12)}
   custo          ${brl(vc.custo).padStart(12)}   congelado na venda
   taxa 5,49%     ${brl(vc.taxa).padStart(12)}   congelada na venda
   ────────────────────────────
   margem         ${brl(vc.margem).padStart(12)}   ${pct(vc.margem_pct)}

   trade-in       ${brl(vc.credito_trade_in).padStart(12)}   raquete usada recebida
   a receber      ${brl(vc.a_receber).padStart(12)}
   recebido       ${brl(vc.recebido).padStart(12)}   1ª de 3
   comissão       ${brl(vc.comissao).padStart(12)}   3% do RECEBIDO`);

confere(n(vc.margem) === 231.57, 'trade-in reduziu o a receber, não a margem');
confere(n(vc.comissao) === 5, 'comissão sobre os R$166,67 que entraram');
confere(n((await um('select estoque from v_produto where id=$1', [raquete.id])).estoque) === 19,
  'estoque baixou de 20 para 19');
confere((await um('select etapa_id from lead where id=$1', [leadAna])).etapa_id === 'ganho',
  'lead no funil marcado como ganho');

/* ═════════════════════════════════════════════════ 6. As telas ═════════ */
titulo('6. O que cada um vê');

console.log('\n   CRM — funil');
for (const e of await q('select * from v_funil order by ordem')) {
  console.log(`   ${String(e.etapa_nome).padEnd(20)}${String(e.leads).padStart(3)} leads` +
    `${brl(e.valor).padStart(14)}`);
}

const campanhas = await q(`
  with g as (select campanha_id, sum(gasto) gasto from custo_midia group by 1),
       l as (select campanha_id, count(*) leads from lead where deletado_em is null group by 1),
       v as (select campanha_id, count(*) vendas, sum(margem) margem
             from v_venda_completa where campanha_id is not null group by 1)
  select c.nome, coalesce(g.gasto,0) gasto, coalesce(l.leads,0) leads,
         coalesce(v.vendas,0) vendas, coalesce(v.margem,0) margem,
         case when coalesce(l.leads,0)>0 then g.gasto/l.leads end cpl,
         case when coalesce(g.gasto,0)>0
              then ((coalesce(v.margem,0)-g.gasto)/g.gasto)*100 end roi
  from campanha c
  left join g on g.campanha_id=c.id
  left join l on l.campanha_id=c.id
  left join v on v.campanha_id=c.id
  where coalesce(g.gasto,0)>0 or coalesce(l.leads,0)>0
  order by coalesce(g.gasto,0) desc`);

console.log('\n   DASHBOARD — campanhas');
console.log(`   ${'campanha'.padEnd(24)}${'gasto'.padStart(11)}${'leads'.padStart(7)}` +
  `${'CPL'.padStart(12)}${'vendas'.padStart(8)}${'margem'.padStart(12)}${'ROI'.padStart(9)}`);
console.log('   ' + '─'.repeat(83));
for (const c of campanhas) {
  console.log(`   ${String(c.nome).slice(0, 23).padEnd(24)}${brl(c.gasto).padStart(11)}` +
    `${String(c.leads).padStart(7)}${(c.cpl ? brl(c.cpl) : '—').padStart(12)}` +
    `${String(c.vendas).padStart(8)}${brl(c.margem).padStart(12)}` +
    `${(c.roi != null ? pct(c.roi) : '—').padStart(9)}` +
    (n(c.leads) < 30 ? '   amostra insuficiente' : ''));
}

const perdas = await q(`select m.nome, count(*)::int n from lead l
  join motivo_perda m on m.id=l.motivo_perda_id group by m.nome order by n desc`);
if (perdas.length) {
  console.log('\n   MOTIVOS DE PERDA');
  for (const p of perdas) console.log(`   ${String(p.nome).padEnd(30)}${String(p.n).padStart(4)}`);
}

/* ═══════════════════════════════ 7. O que quebra sistema em produção ═══ */
titulo('7. Os casos que quebram sistemas de verdade');

// Ana volta em novembro por outro anúncio
await db.query(`insert into campanha (id,nome,canal) values ('meta:natal','Natal 2026','meta')
  on conflict do nothing`);
const leadNatal = await chegaLead({ nome: 'Ana Ribeiro', valor: 890 },
  '(85) 99114-7264', { id: 'meta:natal', nome: 'Natal 2026', canal: 'meta' });

confere((await um('select campanha_origem from cliente where id=$1', [ana.cliente_id]))
  .campanha_origem === VERAO.id,
  'cliente que volta por outro anúncio NÃO rouba o crédito da campanha original');
confere((await um('select cliente_id from lead where id=$1', [leadNatal])).cliente_id === ana.cliente_id,
  'mas é a mesma pessoa: dois leads, um cliente');

// webhook repetido
let dup = false;
try {
  await db.query(`insert into mensagem (conversa_id,direcao,conteudo,wa_message_id)
    values ($1,'entrada','Oi, vi o anúncio da raquete. Ainda tem?','wamid.AAA1')`, [conversaAna.id]);
} catch { dup = true; }
confere(dup, 'webhook repetido não grava a mesma mensagem duas vezes');

// telefone antigo
confere((await um(`select * from casar_venda_com_lead('8591147264')`))?.cliente_id === ana.cliente_id,
  'telefone sem o nono dígito acha a mesma pessoa');

// lote novo mais caro
await db.query(`update produto set custo=520 where id=$1`, [raquete.id]);
confere(n((await um('select margem from v_venda_completa where id=$1', [venda.id])).margem) === 231.57,
  'lote novo mais caro não reescreve a margem da venda já feita');

// janela de 24h
await db.query(`update conversa set ultima_mensagem_cliente_em = now() - interval '25 hours'
  where id=$1`, [conversaAna.id]);
confere((await um('select janela_aberta from v_conversa where id=$1', [conversaAna.id]))
  .janela_aberta === false,
  'passadas 24h a janela fecha sozinha — daí em diante só template aprovado');

/* ═══════════════════════════════════════════════════════════════════════ */
console.log(`\n${'═'.repeat(68)}`);
console.log(erros
  ? `\n  ${erros} verificação(ões) falharam.\n`
  : `\n  Fluxo completo fecha ponta a ponta, sem Kommo.

  Prova: o lead nasce aqui, a campanha sobrevive até a margem, dois
  vendedores não respondem juntos, a janela de 24h é calculada e não
  guardada, e os congelamentos seguram.

  Falta o que só a conta real responde: se a Meta entrega o referral.\n`);
process.exit(erros ? 1 : 0);
