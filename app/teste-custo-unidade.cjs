/**
 * TESTE DO LUCRO POR RAQUETE
 *
 * Prova a ARITMÉTICA contra o que está na tela, não contra o que a função
 * devolve — se a tela mostrar uma linha e somar outra, ninguém percebe olhando,
 * mas a decisão de preço sai errada.
 *
 * Cada linha carrega `data-valor` com o número cru, então o teste confere a
 * cascata sem parsear "R$ 1.234,56" (que muda com locale e formatação).
 *
 *   npm run dev -- --port 4300
 *   node teste-custo-unidade.cjs
 */
const { chromium } = require('playwright');

(async () => {
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await nav.newPage({ viewport: { width: 1600, height: 1000 } });
  const erros = [];
  pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  pg.on('pageerror', (e) => erros.push(String(e)));

  let falhas = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${m}`); if (!c) falhas++; };
  /** Centavos: comparar float exato falharia por 0,0000001. */
  const perto = (a, b, tol = 0.01) => Math.abs(a - b) < tol;
  const brl = (n) => `R$ ${n.toFixed(2).replace('.', ',')}`;

  await pg.goto('http://localhost:4501/painel/financeiro', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(800);

  await pg.locator('button', { hasText: 'Custo por raquete' }).click();
  await pg.waitForTimeout(1200);

  const ler = async () => {
    const linhas = await pg.locator('[data-linha]').all();
    const v = {};
    for (const l of linhas) {
      v[await l.getAttribute('data-linha')] = Number(await l.getAttribute('data-valor'));
    }
    return v;
  };

  let v = await ler();
  const esperadas = ['preco', 'custo', 'taxa', 'comissao', 'imposto',
                     'contribuicao', 'midia', 'pos-midia', 'estrutura', 'lucro'];
  ok(esperadas.every((k) => k in v),
     `a cascata tem as ${esperadas.length} linhas`);

  console.log(`\n   preço      ${brl(v.preco)}`);
  console.log(`   custo      ${brl(v.custo)}`);
  console.log(`   taxa       ${brl(v.taxa)}`);
  console.log(`   comissão   ${brl(v.comissao)}`);
  console.log(`   imposto    ${brl(v.imposto)}`);
  console.log(`   ─ contribuição ${brl(v.contribuicao)}`);
  console.log(`   mídia      ${brl(v.midia)}`);
  console.log(`   ─ pós-mídia    ${brl(v['pos-midia'])}`);
  console.log(`   estrutura  ${brl(v.estrutura)}`);
  console.log(`   ═ LUCRO        ${brl(v.lucro)}\n`);

  /* ---------------------------------------------------- a aritmética ---- */
  ok(perto(v.contribuicao, v.preco + v.custo + v.taxa + v.comissao + v.imposto),
     'margem de contribuição = preço − custo − taxa − comissão − imposto');
  ok(perto(v['pos-midia'], v.contribuicao + v.midia),
     'depois da mídia = contribuição − mídia');
  ok(perto(v.lucro, v['pos-midia'] + v.estrutura),
     'lucro = depois da mídia − estrutura');

  /* -------------------------------------------------------- os sinais --- */
  ok(v.preco > 0, 'o preço é a única linha positiva de entrada');
  ok([v.custo, v.taxa, v.comissao, v.imposto, v.midia, v.estrutura].every((x) => x <= 0),
     'todas as deduções são negativas — nenhuma soma por engano');

  /* ------------------------------------------- as contas de dentro ------ */
  ok(v.custo < 0 && Math.abs(v.custo) < v.preco,
     'o custo da mercadoria é menor que o preço (senão a loja vende no prejuízo)');
  ok(Math.abs(v.taxa) < Math.abs(v.custo),
     'a taxa da maquininha é muito menor que a mercadoria');

  const textoImposto = await pg.locator('[data-linha="imposto"]').textContent();
  ok(/Simples Nacional \(\d/.test(textoImposto ?? ''),
     'o imposto mostra a alíquota efetiva usada');
  ok(/12 meses/.test(textoImposto ?? ''),
     'e explica que a alíquota vem do faturamento dos 12 meses, não do mês');

  /* -------------------------------------- a estrutura é rateada ---------- */
  const textoEstrutura = await pg.locator('[data-linha="estrutura"]').textContent();
  ok(/fatia no faturamento/.test(textoEstrutura ?? ''),
     'a linha da estrutura mostra o rateio, não só o resultado');
  ok(/custo fixo lançado em/.test(textoEstrutura ?? ''),
     'e diz "lançado no mês" — senão brigaria com o total do modelo ao lado');

  /* ------------------------------- mês fechado não é proporcionalizado --- */
  const seletor = pg.locator('[data-seletor="mes"]');
  const meses = await seletor.locator('option').count();
  if (meses > 1) {
    await seletor.selectOption({ index: 1 });
    await pg.waitForTimeout(1300);
    const fechado = await ler();
    ok(perto(fechado.lucro, fechado['pos-midia'] + fechado.estrutura),
       'a cascata fecha também num mês fechado');
    const t = await pg.locator('main').textContent();
    ok(!/mês em andamento/.test(t ?? ''),
       'e mês fechado NÃO mostra o aviso de proporcional');
    await seletor.selectOption({ index: 0 });
    await pg.waitForTimeout(1300);
    v = await ler();
  }

  /* ------------------------------------------------ ponto de equilíbrio -- */
  const corpo = await pg.locator('main').textContent();
  ok(/Ponto de equil/.test(corpo ?? ''), 'ponto de equilíbrio na tela');
  ok(/antes do pró-labore/.test(corpo ?? ''),
     'e o aviso de que ninguém está se pagando ainda');
  ok(/estrutura é dividida pelo volume do mês/i.test(corpo ?? ''),
     'e o aviso de que o número cai em mês fraco sem a raquete ter piorado');
  ok(/Compra de estoque não entra/i.test(corpo ?? ''),
     'e o aviso sobre reposição de estoque');

  /* ═══════════════════════════ mexer num custo fixo muda o lucro ═══════ */
  const editor = pg.locator('form').last();
  await editor.locator('input').first().fill('Teste do aluguel dobrado');
  await editor.locator('input').last().fill('10000');
  await editor.locator('button[type="submit"]').click();
  await pg.waitForTimeout(1500);

  const v2 = await ler();
  ok(Math.abs(v2.estrutura) > Math.abs(v.estrutura),
     `adicionar custo fixo aumenta a estrutura rateada: ${brl(v.estrutura)} → ${brl(v2.estrutura)}`);
  ok(v2.lucro < v.lucro,
     `e o lucro por raquete cai: ${brl(v.lucro)} → ${brl(v2.lucro)}`);
  ok(perto(v2.contribuicao, v.contribuicao),
     'MAS a margem de contribuição NÃO muda — custo fixo não é custo da unidade');
  ok(perto(v2.lucro, v2['pos-midia'] + v2.estrutura),
     'e a cascata continua fechando depois da mudança');

  /* ---- e o lucro cai aproximadamente o que a estrutura subiu ------------- */
  ok(perto(v.lucro - v2.lucro, Math.abs(v2.estrutura) - Math.abs(v.estrutura), 0.02),
     'a queda no lucro é exatamente o aumento da estrutura por unidade');

  /* ---- idempotência: salvar de novo não empilha ------------------------- */
  const antesDeRepetir = v2.estrutura;
  const linhaTeste = pg.locator('div', { hasText: 'Teste do aluguel dobrado' }).last();
  const campo = linhaTeste.locator('input');
  if (await campo.count()) {
    await campo.fill('10000');
    await campo.blur();
    await pg.waitForTimeout(1200);
    const v3 = await ler();
    ok(perto(v3.estrutura, antesDeRepetir, 0.02),
       'salvar o mesmo valor de novo NÃO empilha outra despesa no mês');
  }

  ok(erros.length === 0, `sem erro no console${erros.length ? `: ${erros[0]}` : ''}`);

  console.log(`\n${falhas === 0 ? 'A conta do lucro por raquete fecha.' : `${falhas} falha(s).`}`);
  await nav.close();
  process.exit(falhas === 0 ? 0 : 1);
})();
