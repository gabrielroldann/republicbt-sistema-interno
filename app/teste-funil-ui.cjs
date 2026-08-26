const { chromium } = require('playwright');
(async () => {
  const nav = await chromium.launch({ args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const pg = await nav.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = [];
  pg.on('console', m => { if (m.type()==='error') erros.push(m.text()); });
  pg.on('pageerror', e => erros.push(String(e)));

  let falhas = 0;
  const ok = (c,m) => { console.log(`${c?'ok   ':'FALHA'} ${m}`); if(!c) falhas++; };

  await pg.goto('http://localhost:4501/crm/funil/configurar', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(700);

  ok((await pg.locator('h1').textContent()) === 'Configurar funil', 'a tela abre');

  const linhas = pg.locator('ul').first().locator('li');
  const antes = await linhas.count();
  ok(antes === 4, `4 etapas abertas listadas (${antes})`);

  const fixas = pg.locator('ul').nth(1).locator('li');
  ok(await fixas.count() === 2, 'ganho e perdido aparecem como fixas');
  ok(await fixas.first().locator('input').count() === 0,
     'etapa fixa NÃO tem campo de nome: não dá para renomear para outro sentido');

  // ---- criar ----
  await pg.locator('input[placeholder="Nome da nova etapa"]').fill('Aguardando Pix');
  await pg.locator('button', { hasText: 'Adicionar' }).click();
  await pg.waitForTimeout(600);
  ok(await linhas.count() === antes + 1, 'etapa criada aparece na lista');

  const nomes = await linhas.locator('input').evaluateAll(els => els.map(e => e.value));
  ok(nomes[nomes.length-1] === 'Aguardando Pix',
     `entra no fim das abertas, antes do ganho: ${nomes.join(' → ')}`);

  // Navega CLICANDO, não com goto: recarregar a página zera o mock em memória.
  // Com o Supabase isso não aconteceria, mas aqui falsearia o teste.
  // Por href: dois itens da barra lateral se chamam "Funil" (o kanban e a
  // configuração), e o texto sozinho é ambíguo.
  const irPara = async (href) => {
    await pg.locator(`aside nav a[href="${href}"]`).click();
    await pg.waitForTimeout(700);
  };

  // e aparece no kanban
  await irPara('/crm');
  await pg.waitForTimeout(300);
  const cols = await pg.locator('section h3').allTextContents();
  ok(cols.some(c => /aguardando pix/i.test(c)), `coluna nova no kanban: ${cols.length} colunas`);
  const iGanho = cols.findIndex(c => /ganha/i.test(c));
  const iNova = cols.findIndex(c => /aguardando pix/i.test(c));
  ok(iNova < iGanho, 'e vem antes de "Venda ganha"');

  // ---- renomear ----
  await irPara('/crm/funil/configurar');
  const primeiro = linhas.first().locator('input');
  await primeiro.fill('Primeiro contato');
  await primeiro.blur();
  await pg.waitForTimeout(700);
  await irPara('/crm');
  ok((await pg.locator('section h3').allTextContents()).some(c => /primeiro contato/i.test(c)),
     'renomear reflete no kanban');

  // ---- reordenar ----
  await irPara('/crm/funil/configurar');
  const ordemAntes = await linhas.locator('input').evaluateAll(e => e.map(x => x.value));
  await pg.evaluate(() => {
    const dt = new DataTransfer();
    const lis = document.querySelectorAll('ul li');
    const de = lis[0], para = lis[2];
    de.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    para.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    para.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await pg.waitForTimeout(700);
  const ordemDepois = await linhas.locator('input').evaluateAll(e => e.map(x => x.value));
  ok(ordemAntes.join() !== ordemDepois.join(),
     `arrastar reordenou: ${ordemAntes[0]} agora está na posição ${ordemDepois.indexOf(ordemAntes[0])+1}`);

  // ---- excluir com leads dentro ----
  const comLead = linhas.filter({ hasText: /[1-9]\d* leads/ }).first();
  const nomeAlvo = await comLead.locator('input').inputValue();
  const qtdTexto = await comLead.locator('span').last().textContent();
  await comLead.locator('button').last().click();
  await pg.waitForTimeout(400);

  ok(await pg.locator(`text=Excluir "${nomeAlvo}"`).count() > 0, 'diálogo de exclusão abriu');
  ok((await pg.locator('text=/Nenhum será apagado/').count()) > 0,
     `avisa que os leads serão movidos, não apagados (${qtdTexto?.trim()})`);
  ok(await pg.locator('text=Mover os leads para').count() > 0,
     'e pede para onde eles vão');

  const totalAntes = Number((await pg.locator('ul').first().locator('span').filter({ hasText: 'leads' })
    .allTextContents()).reduce((s,t)=> s + parseInt(t), 0));
  await pg.locator('button', { hasText: 'Excluir etapa' }).click();
  await pg.waitForTimeout(800);
  const totalDepois = Number((await pg.locator('ul').first().locator('span').filter({ hasText: 'leads' })
    .allTextContents()).reduce((s,t)=> s + parseInt(t), 0));
  ok(totalAntes === totalDepois,
     `nenhum lead sumiu: ${totalAntes} antes, ${totalDepois} depois`);

  await pg.screenshot({ path: '/sessions/zealous-pensive-cannon/mnt/outputs/crm-configurar-funil.png' });

  // ---- só admin ----
  await pg.evaluate(() => {
    const sel = document.querySelectorAll('aside select')[0];
    return sel;
  });
  console.log(erros.length ? `\nERROS:\n${erros.join('\n')}` : '\nsem erro de console');
  console.log(falhas ? `\n${falhas} falha(s)` : '\nConfiguração do funil ok.');
  await nav.close();
  process.exit(falhas || erros.length ? 1 : 0);
})();
