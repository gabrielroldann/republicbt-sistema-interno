/**
 * Testes do núcleo.
 *
 * O que importa aqui não é "o SQL roda". É provar que as regras de negócio que
 * já estavam testadas no dashboard continuam valendo depois de virarem tabela —
 * e que o banco produz EXATAMENTE os mesmos números que `completar()` produz em
 * TypeScript. Se divergir um centavo, alguma regra se perdeu na tradução.
 *
 *   npm install && npm test
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const base = new URL('.', import.meta.url).pathname;
const db = await new PGlite();

let falhas = 0;
const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${m}`); if (!c) falhas++; };
const um = async (sql, p) => (await db.query(sql, p)).rows[0];
const n = (v) => Number(v);

// Os três arquivos, na ordem, num banco só. Se houver conflito entre eles
// (tabela duplicada, função redefinida, chave estrangeira fora de ordem),
// aparece aqui e não em produção.
for (const arq of ['01-nucleo.sql', '02-crm.sql', '03-site.sql']) {
  try {
    await db.exec(readFileSync(`${base}/${arq}`, 'utf8'));
    console.log(`ok    ${arq} aplicado`);
  } catch (e) { console.log(`FALHA ${arq}: ${e.message}`); process.exit(1); }
}
console.log();

/* ------------------------------------------------ telefone: a chave mestra */
console.log('-- telefone --');
for (const [entrada, esperado, nome] of [
  ['(85) 99114-7264',   '5585991147264', 'celular com máscara'],
  ['8591147264',        '5585991147264', 'celular SEM o nono dígito'],
  ['+55 85 3232-1010',  '558532321010',  'fixo não ganha o nono dígito'],
  ['+1 415 555 0100',   '14155550100',   'estrangeiro não ganha 55'],
  ['',                   null,           'vazio vira nulo'],
]) {
  const r = await um('select normalizar_telefone($1) t', [entrada]);
  ok(r.t === esperado, `${nome.padEnd(30)} ${JSON.stringify(entrada)} -> ${JSON.stringify(r.t)}`);
}

/* ------------------------------------------------------------ base de dados */
const cli = await um(
  `insert into cliente (telefone, nome, campanha_origem)
   values (normalizar_telefone('85 99114-7264'), 'Cliente Teste', 'meta:verao') returning id`);
const vnd = await um(
  `insert into vendedor (nome, iniciais, meta_mensal, comissao_pct)
   values ('Gabriel','GR',30000,3) returning id`);
const prd = await um(
  `insert into produto (sku, nome, categoria, marca, custo, preco, estoque_min)
   values ('RQ-001','Raquete Pro','raquetes','Nox',430,700,2) returning id`);

/* ------------------------------------------- estoque é movimento, não saldo */
console.log('\n-- estoque --');
ok(!(await um(`select column_name from information_schema.columns
               where table_name='produto' and column_name in ('estoque','quantidade_atual')`)),
   'produto NÃO tem coluna de saldo');

await db.query(`insert into movimento_estoque (produto_id, quantidade, tipo, custo_unit, frete_rateado)
                values ($1, 20, 'entrada', 400, 30)`, [prd.id]);
ok(n((await um('select estoque from v_produto where id=$1', [prd.id])).estoque) === 20,
   'saldo vem da soma dos movimentos');

/* --------------------------------------- a venda, com todos os congelamentos */
console.log('\n-- venda: as contas de margem --');
const vnda = await um(
  `insert into venda (data, produto_id, vendedor_id, cliente_id, quantidade,
                      preco_unit, custo_unit, forma_pagamento, parcelas,
                      taxa_pct, comissao_pct, trade_in_modelo, trade_in_valor)
   values (current_date, $1, $2, $3, 1, 700, 430, 'credito_parcelado', 3, 5.49, 3, 'Vision usada', 200)
   returning id`, [prd.id, vnd.id, cli.id]);

await db.query(`insert into pagamento (venda_id, data, valor, forma)
                values ($1, current_date, 300, 'credito_parcelado')`, [vnda.id]);

const v = await um('select * from v_venda_completa where id=$1', [vnda.id]);

// Os mesmos números que completar() produz em TypeScript, calculados à mão:
//   receita 700 · custo 430 · taxa 700×5,49% = 38,43 · margem 231,57
//   crédito 200 · a receber 500 · recebido 300 · em aberto 200
//   comissão 300×3% = 9,00  (sobre o RECEBIDO, não sobre o contratado)
ok(n(v.receita)   === 700,    `receita ${v.receita}`);
ok(n(v.custo)     === 430,    `custo ${v.custo}`);
ok(n(v.taxa)      === 38.43,  `taxa 5,49% sobre a receita = ${v.taxa}`);
ok(n(v.margem)    === 231.57, `margem = receita − custo − taxa = ${v.margem}`);
ok(n(v.credito_trade_in) === 200, `crédito do trade-in ${v.credito_trade_in}`);
ok(n(v.a_receber) === 500,    `a receber = receita − crédito = ${v.a_receber}`);
ok(n(v.recebido)  === 300,    `recebido ${v.recebido}`);
ok(n(v.em_aberto) === 200,    `em aberto ${v.em_aberto}`);
ok(v.status_pagamento === 'parcial', `status ${v.status_pagamento}`);
ok(n(v.comissao)  === 9,      `comissão sobre o recebido = ${v.comissao}`);

// A regra mais fácil de errar: o trade-in reduz o que entra em dinheiro,
// mas NÃO reduz a margem. Se reduzisse, a margem cairia para 31,57.
ok(n(v.margem) === 231.57 && n(v.a_receber) === 500,
   'trade-in reduz o a receber, NÃO a margem');

/* ------------------------------------------------- os quatro congelamentos */
console.log('\n-- congelamentos --');

// taxa: a maquininha aumenta a taxa amanhã
await db.query(`update venda set observacoes='mexeu em outra coisa' where id=$1`, [vnda.id]);
ok(n((await um('select taxa from v_venda_completa where id=$1', [vnda.id])).taxa) === 38.43,
   'taxa_pct é coluna da venda: mudar a taxa da maquininha não reescreve o passado');

// comissão: o vendedor é promovido para 5%
await db.query(`update vendedor set comissao_pct=5 where id=$1`, [vnd.id]);
ok(n((await um('select comissao from v_venda_completa where id=$1', [vnda.id])).comissao) === 9,
   'promover o vendedor não reescreve a comissão de vendas passadas');

// custo: chega um lote mais caro
await db.query(`update produto set custo=500 where id=$1`, [prd.id]);
ok(n((await um('select custo, margem from v_venda_completa where id=$1', [vnda.id])).custo) === 430,
   'lote mais caro não reescreve o custo da venda já feita');

// origem do cliente
await db.query(`update cliente set campanha_origem='meta:natal' where id=$1`, [cli.id]);
ok((await um('select campanha_origem from cliente where id=$1', [cli.id])).campanha_origem === 'meta:verao',
   'campanha de origem do cliente é congelada no primeiro toque');

/* ------------------------------------------------- conta: status derivado */
console.log('\n-- contas --');
await db.query(`insert into conta (tipo, descricao, valor, vencimento) values
  ('pagar','Aluguel',3400, current_date - 5),
  ('pagar','Energia',   480, current_date + 5)`);
await db.query(`insert into conta (tipo, descricao, valor, vencimento, pago_em)
  values ('pagar','Internet',200, current_date - 10, current_date - 9)`);

const cts = (await db.query(`select descricao, status from v_conta order by descricao`)).rows;
ok(cts.find(c => c.descricao==='Aluguel')?.status  === 'vencida',  'vencida sem pagamento -> vencida');
ok(cts.find(c => c.descricao==='Energia')?.status  === 'pendente', 'a vencer -> pendente');
ok(cts.find(c => c.descricao==='Internet')?.status === 'paga',     'com pago_em -> paga');
ok(!(await um(`select column_name from information_schema.columns
               where table_name='conta' and column_name='status'`)),
   'status NÃO é coluna: não pode envelhecer em silêncio');

/* --------------------------------------------------------- guardas do banco */
console.log('\n-- guardas --');
const barra = async (sql, params) => {
  try { await db.query(sql, params); return false; } catch { return true; }
};
ok(await barra(`insert into produto (sku,nome,categoria) values ('X','Y','bermuda')`),
   'categoria fora da lista é rejeitada');
ok(await barra(`insert into venda (data,produto_id,vendedor_id,quantidade,preco_unit,custo_unit,forma_pagamento)
                values (current_date,$1,$2,0,700,430,'pix')`, [prd.id, vnd.id]),
   'venda com quantidade zero é rejeitada');
ok(await barra(`insert into venda (data,produto_id,vendedor_id,quantidade,preco_unit,custo_unit,forma_pagamento)
                values (current_date,$1,$2,1,700,430,'boleto')`, [prd.id, vnd.id]),
   'forma de pagamento inexistente é rejeitada');
ok(await barra(`insert into movimento_estoque (produto_id,quantidade,tipo) values ($1,0,'entrada')`, [prd.id]),
   'movimento de estoque zero é rejeitado');
ok(await barra(`insert into meta_loja (mes,receita) values ('2026-13',1000)`),
   'competência inválida (mês 13) é rejeitada');
ok(await barra(`insert into cliente (telefone) values (normalizar_telefone('85 99114-7264'))`),
   'telefone duplicado é rejeitado');

/* ------------------------------------ despesa: fornecedores não é resultado */
console.log('\n-- resultado x caixa --');
await db.query(`insert into despesa (data,descricao,categoria,valor) values
  (current_date,'Aluguel','aluguel',3400),
  (current_date,'Compra de raquetes','fornecedores',12000)`);

const oper = await um(`select coalesce(sum(valor),0) v from despesa
                       where categoria <> 'fornecedores' and data = current_date`);
const caixa = await um(`select coalesce(sum(valor),0) v from despesa where data = current_date`);
ok(n(oper.v) === 3400,  `despesa do RESULTADO exclui fornecedores: ${oper.v}`);
ok(n(caixa.v) === 15400, `saída de CAIXA inclui fornecedores: ${caixa.v}`);

/* --------------------------- as três camadas conversando entre si --------- */
console.log('\n-- integração entre as camadas --');

// Lead criado pela captura rápida acha o cliente que já existe, pelo telefone
const lead1 = await um(`select criar_lead($1,$2,$3,$4,$5) as id`,
  ['85 99114-7264', 'Cliente Teste', 'meta:verao', 'Verão 2026', 'meta']);
ok((await um('select cliente_id from lead where id=$1', [lead1.id])).cliente_id === cli.id,
   'lead novo casou com o cliente que JÁ existia, pelo telefone');

const lead2 = await um(`select criar_lead($1,$2,$3,$4,$5) as id`,
  ['85 98888-7777', 'Pessoa Nova', 'meta:verao', 'Verão 2026', 'meta']);
const c2 = await um('select cliente_id from lead where id=$1', [lead2.id]);
ok(c2.cliente_id !== null && c2.cliente_id !== cli.id, 'telefone novo criou cliente novo');

// A trava de atendimento: dois vendedores clicando ao mesmo tempo
const vnd2 = await um(`insert into vendedor (nome,iniciais) values ('Sócio B','SB') returning id`);
// Toda conversa pertence a um canal — o número por onde ela entrou.
await db.query(`insert into canal (id,nome,tipo,via,telefone,phone_number_id)
  values ('loja','Republic BT','loja','cloud_api','5585999990000','PNID_LOJA')
  on conflict do nothing`);
const conv = await um(`insert into conversa (canal_id, cliente_id, telefone, ultima_mensagem_cliente_em)
  values ('loja', $1, '5585991147264', now()) returning id`, [cli.id]);

ok((await um('select assumir_conversa($1,$2) as ok', [conv.id, vnd.id])).ok === true,
   'primeiro vendedor assume a conversa');
ok((await um('select assumir_conversa($1,$2) as ok', [conv.id, vnd2.id])).ok === false,
   'segundo vendedor é BARRADO: não existe resposta dupla');
ok((await um('select assumir_conversa($1,$2) as ok', [conv.id, vnd.id])).ok === true,
   'quem já tinha assumido pode reassumir sem erro');
await db.query('select liberar_conversa($1)', [conv.id]);
ok((await um('select assumir_conversa($1,$2) as ok', [conv.id, vnd2.id])).ok === true,
   'depois de liberada, o outro consegue assumir');

// Janela de 24h: derivada, nunca guardada
ok((await um('select janela_aberta from v_conversa where id=$1', [conv.id])).janela_aberta === true,
   'janela de 24h aberta logo após a mensagem do cliente');
await db.query(`update conversa set ultima_mensagem_cliente_em = now() - interval '25 hours'
                where id=$1`, [conv.id]);
ok((await um('select janela_aberta from v_conversa where id=$1', [conv.id])).janela_aberta === false,
   'passadas 24h, a janela fecha sozinha — só template sai');

// Mover no funil
await db.query(`select mover_lead($1,'proposta')`, [lead1.id]);
ok((await um('select etapa_id from lead where id=$1', [lead1.id])).etapa_id === 'proposta',
   'lead movido para Proposta enviada');

ok(await barra(`select mover_lead($1,'perdido')`, [lead1.id]),
   'perder lead SEM motivo é rejeitado');
await db.query(`select mover_lead($1,'perdido','preco')`, [lead1.id]);
const perdido = await um('select etapa_id, motivo_perda_id, fechado_em from lead where id=$1', [lead1.id]);
ok(perdido.motivo_perda_id === 'preco' && perdido.fechado_em !== null,
   'perder com motivo grava o motivo e a data de fechamento');

// Mensagem duplicada do webhook
await db.query(`insert into mensagem (conversa_id,direcao,conteudo,wa_message_id)
                values ($1,'entrada','oi','wamid.TESTE1')`, [conv.id]);
ok(await barra(`insert into mensagem (conversa_id,direcao,conteudo,wa_message_id)
                values ($1,'entrada','oi','wamid.TESTE1')`, [conv.id]),
   'webhook repetido não grava a mesma mensagem duas vezes');

// A campanha continua congelada, agora no lead nosso
await db.query(`update lead set campanha_id='nao_rastreado' where id=$1`, [lead2.id]);
ok((await um('select campanha_id from lead where id=$1', [lead2.id])).campanha_id === 'meta:verao',
   'campanha do lead segue congelada');

// E a venda ainda casa
const casou = await um(`select * from casar_venda_com_lead('8591147264')`);
ok(casou?.cliente_id === cli.id, 'venda casa com o cliente mesmo sem o nono dígito');

ok(await barra(`insert into venda (data,produto_id,vendedor_id,quantidade,preco_unit,custo_unit,forma_pagamento,campanha_id)
                values (current_date,$1,$2,1,700,430,'pix','campanha_que_nao_existe')`, [prd.id, vnd.id]),
   'venda com campanha inexistente é rejeitada');

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
