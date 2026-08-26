const { chromium } = require('playwright');

(async () => {
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await nav.newPage({ viewport: { width: 1440, height: 900 } });

  const erros = [];
  pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  pg.on('pageerror', (e) => erros.push(String(e)));

  await pg.goto('http://localhost:4501/crm', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(600);

  let falhas = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${m}`); if (!c) falhas++; };

  // ---- as colunas do funil existem ----
  const colunas = await pg.locator('section h3').allTextContents();
  ok(colunas.length === 6, `6 colunas no funil -> ${colunas.length}`);
  ok(colunas.join('|').includes('NOVO CONTATO') || colunas.some(c => /novo contato/i.test(c)),
     `primeira coluna: ${colunas[0]}`);

  // ---- cards renderizaram ----
  const cards = await pg.locator('article').count();
  ok(cards > 0, `${cards} cards de lead na tela`);

  // ---- a campanha aparece SEM clique (é o motivo do CRM existir) ----
  const comCampanha = await pg.locator('article', { hasText: 'Verão 2026' }).count();
  ok(comCampanha > 0, `campanha visível no card sem precisar abrir (${comCampanha} cards)`);

  // ---- contagem por coluna bate com os cards ----
  const primeira = pg.locator('section').first();
  const badge = await primeira.locator('header span').last().textContent();
  const nessa = await primeira.locator('article').count();
  ok(Number(badge) === nessa, `contador da coluna (${badge}) bate com os cards (${nessa})`);

  // ---- ARRASTAR: novo contato -> em atendimento ----
  const origem = pg.locator('section').nth(0);
  const destino = pg.locator('section').nth(1);
  const antesOrigem = await origem.locator('article').count();
  const antesDestino = await destino.locator('article').count();

  const card = origem.locator('article').first();
  const nomeArrastado = (await card.locator('h4').textContent())?.trim();

  // HTML5 drag-and-drop nativo precisa ser disparado à mão no Playwright
  await card.hover();
  await pg.mouse.down();
  await destino.hover();
  await pg.mouse.move(400, 400, { steps: 8 });
  await pg.mouse.up();
  // fallback: dispatch dos eventos de dataTransfer
  await pg.evaluate(() => {
    const dt = new DataTransfer();
    const card = document.querySelectorAll('section')[0].querySelector('article');
    const alvo = document.querySelectorAll('section')[1];
    card.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    alvo.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    alvo.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    card.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true }));
  });
  await pg.waitForTimeout(700);

  const depoisOrigem = await origem.locator('article').count();
  const depoisDestino = await destino.locator('article').count();
  ok(depoisOrigem === antesOrigem - 1 && depoisDestino === antesDestino + 1,
     `arrastou "${nomeArrastado}": ${antesOrigem}->${depoisOrigem} e ${antesDestino}->${depoisDestino}`);

  // ---- ARRASTAR PARA PERDIDO abre o diálogo de motivo ----
  await pg.evaluate(() => {
    const dt = new DataTransfer();
    const secoes = document.querySelectorAll('section');
    const card = secoes[0].querySelector('article');
    const perdido = secoes[5];
    card.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    perdido.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    perdido.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await pg.waitForTimeout(400);
  const dialogo = await pg.locator('text=Por que perdeu?').count();
  ok(dialogo > 0, 'arrastar para Perdido EXIGE motivo: o diálogo abriu');

  const botaoPerder = pg.locator('button', { hasText: 'Marcar como perdido' });
  ok(await botaoPerder.isDisabled(), 'confirmar fica bloqueado enquanto não escolhe motivo');

  await pg.locator('button', { hasText: 'Preço acima do orçamento' }).click();
  ok(!(await botaoPerder.isDisabled()), 'escolhido o motivo, o botão libera');
  await botaoPerder.click();
  await pg.waitForTimeout(600);
  ok(await pg.locator('section').nth(5).locator('article').count() > 0, 'lead foi para Perdido');

  await pg.screenshot({ path: '/tmp/crm-funil.png', fullPage: false });

  // ---- a barra lateral, no mesmo estilo do dashboard ----
  const aside = pg.locator('aside');
  ok(await aside.count() === 1, 'existe barra lateral');
  ok((await aside.textContent() ?? '').includes('Republic BT'), 'marca na barra lateral');
  ok((await aside.locator('text=Atendimento').count()) > 0, 'grupo Atendimento');
  ok((await aside.locator('text=Cadastro').count()) > 0, 'grupo Cadastro');
  ok((await aside.locator('a', { hasText: 'Funil' }).count()) > 0, 'item Funil navegável');
  ok((await aside.locator('nav a[href="/crm/conversas"]').count()) > 0,
     'item Conversas navegável');
  // Item ainda não construído aparece apagado, mas não vira link quebrado —
  // oferecer uma tela que não existe é pior do que não oferecer.
  ok((await aside.locator('a', { hasText: 'Clientes' }).count()) === 0,
     'Clientes aparece apagado, sem virar link quebrado');

  const larguraAberta = (await aside.boundingBox())?.width ?? 0;
  await pg.locator('button', { hasText: 'Recolher' }).click();
  await pg.waitForTimeout(400);
  const larguraFechada = (await aside.boundingBox())?.width ?? 0;
  ok(larguraFechada < larguraAberta && larguraFechada <= 70,
     `recolher funciona: ${larguraAberta}px -> ${larguraFechada}px`);
  await aside.locator('button').last().click();
  await pg.waitForTimeout(400);

  // ---- captura rápida, agora pelo botão da barra lateral ----
  await pg.locator('aside button', { hasText: 'Novo lead' }).click();
  await pg.waitForTimeout(300);
  const criar = pg.locator('button', { hasText: 'Criar lead' });
  ok(await criar.isDisabled(), 'sem telefone, não dá para criar');

  await pg.locator('input[inputmode="tel"]').fill('8591147264');
  await pg.waitForTimeout(200);
  const aviso = await pg.locator('text=/Será salvo como/').textContent();
  ok(/\(85\) 99114-7264/.test(aviso ?? ''),
     `telefone sem o nono dígito é mostrado já normalizado: ${aviso?.trim()}`);
  ok(!(await criar.isDisabled()), 'com telefone válido, o botão libera');

  await pg.locator('input[placeholder="Como a pessoa se apresentou"]').fill('Teste Playwright');
  await criar.click();
  await pg.waitForTimeout(700);
  const achou = await pg.locator('article', { hasText: 'Teste Playwright' }).count();
  ok(achou > 0, 'lead criado aparece no funil');

  await pg.screenshot({ path: '/tmp/crm-novo.png' });

  console.log(erros.length ? `\nERROS DE CONSOLE:\n${erros.join('\n')}` : '\nsem erro de console');
  console.log(falhas ? `\n${falhas} falha(s)` : '\nInterface ok.');
  await nav.close();
  process.exit(falhas || erros.length ? 1 : 0);
})();
