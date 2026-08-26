const { chromium } = require('playwright');
(async () => {
  const nav = await chromium.launch({ args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const pg = await nav.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = [];
  pg.on('console', m => { if (m.type()==='error') erros.push(m.text()); });
  pg.on('pageerror', e => erros.push(String(e)));

  let falhas = 0;
  const ok = (c,m) => { console.log(`${c?'ok   ':'FALHA'} ${m}`); if(!c) falhas++; };

  await pg.goto('http://localhost:4501/crm', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(700);

  // ---- abre ao clicar no card ----
  ok(await pg.locator('aside[role="dialog"]').count() === 0, 'o painel começa fechado');
  const card = pg.locator('article').first();
  const nomeCard = (await card.locator('h4').textContent())?.trim();
  await card.click();
  await pg.waitForTimeout(700);

  const painel = pg.locator('aside[role="dialog"]');
  ok(await painel.count() === 1, 'clicar no card abre o painel');
  ok((await painel.locator('input').first().inputValue()) === nomeCard,
     `mostra o cliente certo: ${nomeCard}`);

  // ---- o que o vendedor precisa antes de responder ----
  const texto = await painel.textContent();
  ok(/\(\d{2}\) \d{4,5}-\d{4}/.test(texto ?? ''), 'telefone formatado');
  ok((await painel.locator('a[href^="https://wa.me/"]').count()) > 0,
     'botão que abre o WhatsApp já no contato certo');
  const wa = await painel.locator('a[href^="https://wa.me/"]').getAttribute('href');
  ok(/^https:\/\/wa\.me\/55\d{11}\?text=/.test(wa ?? ''),
     `link em E.164 e com mensagem pronta: ${wa?.slice(0, 42)}...`);

  ok((await painel.locator('text=Etapa').count()) > 0, 'seletor de etapa');
  ok((await painel.locator('text=Responsável').count()) > 0, 'seletor de responsável');

  // ---- perder NÃO tem atalho aqui: o motivo é obrigatório ----
  const opcoes = await painel.locator('select').first().locator('option').allTextContents();
  ok(!opcoes.some(o => /perdida/i.test(o)),
     'a etapa de perdido fica FORA do seletor — senão haveria caminho sem motivo');
  ok((await painel.locator('text=/motivo é obrigatório/').count()) > 0,
     'e a tela explica por quê');

  // ---- editar em linha ----
  const valorInput = painel.locator('input[inputmode="decimal"]');
  await valorInput.fill('1234');
  await valorInput.blur();
  await pg.waitForTimeout(700);
  ok((await pg.locator('article', { hasText: nomeCard }).first().textContent() ?? '')
       .includes('1.234'),
     'editar o valor no painel reflete no card do funil');

  // ---- mover pelo seletor ----
  const antesGanho = await pg.locator('section').nth(4).locator('article').count();
  await painel.locator('select').first().selectOption({ label: 'Negociação' });
  await pg.waitForTimeout(800);
  const emNegociacao = await pg.locator('section').nth(3).locator('article').count();
  ok(emNegociacao > 0, `mover pelo painel funciona (Negociação tem ${emNegociacao})`);

  // ---- histórico do cliente ----
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(500);
  ok(await pg.locator('aside[role="dialog"]').count() === 0, 'Esc fecha o painel');

  // procura um lead ganho, que tem compra no histórico
  const ganho = pg.locator('section').nth(4).locator('article').first();
  if (await ganho.count()) {
    await ganho.click();
    await pg.waitForTimeout(700);
    const p2 = pg.locator('aside[role="dialog"]');
    ok((await p2.locator('text=Histórico do cliente').count()) > 0,
       'lead ganho mostra o histórico do cliente');
    ok((await p2.locator('text=/compra/').count()) > 0, 'com as compras somadas');
    ok((await p2.locator('text=Já comprou').count()) > 0,
       'e a marca "Já comprou" — recompra é a venda mais barata que existe');
    ok((await p2.locator('button', { hasText: 'Registrar venda' }).count()) > 0,
       'na etapa de ganho aparece o botão de registrar venda');
    await pg.screenshot({ path: '/sessions/zealous-pensive-cannon/mnt/outputs/crm-painel-lead.png' });
  }

  // ---- fechar clicando fora ----
  await pg.mouse.click(400, 400);
  await pg.waitForTimeout(500);
  ok(await pg.locator('aside[role="dialog"]').count() === 0, 'clicar fora fecha');

  console.log(erros.length ? `\nERROS:\n${erros.join('\n')}` : '\nsem erro de console');
  console.log(falhas ? `\n${falhas} falha(s)` : '\nPainel do lead ok.');
  await nav.close();
  process.exit(falhas || erros.length ? 1 : 0);
})();
