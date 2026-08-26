/**
 * TESTE DOS TEMAS NO CRM
 *
 * O que importa provar aqui não é que a tela mostra três cartões — é que
 * escolher um MUDA O APP DE VERDADE e que a escolha sobrevive ao F5.
 *
 * Por isso o teste lê a variável CSS calculada no `<html>`, não a aparência do
 * cartão. Um seletor que só olhasse o cartão passaria mesmo se o clique não
 * fizesse nada.
 *
 *   npm run servidor-teste       (num terminal)
 *   node teste-temas-ui.cjs      (no outro)
 */
const { chromium } = require('playwright');

/**
 * A SENHA NÃO FICA NO CÓDIGO.
 *
 * Ela vem do `.env.local`, que o .gitignore segura. Antes estava escrita aqui
 * dentro, e junto com a URL do projeto no HOJE-ROTEIRO.md formava um par que
 * abre o banco da loja. Repositório privado não é cofre: basta um colaborador
 * a mais, um fork, ou o dia em que o repo virar público.
 */
const SENHA = (() => {
  const fs = require('fs');
  const arq = `${__dirname}/.env.local`;
  if (fs.existsSync(arq)) {
    const m = /^TESTE_SENHA=(.*)$/m.exec(fs.readFileSync(arq, 'utf8'));
    if (m) return m[1].trim();
  }
  if (process.env.TESTE_SENHA) return process.env.TESTE_SENHA;
  console.error('Defina TESTE_SENHA no .env.local (ou no ambiente) para rodar este teste.');
  process.exit(2);
})();

(async () => {
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await nav.newPage({ viewport: { width: 1500, height: 940 } });
  const erros = [];
  pg.on('pageerror', (e) => erros.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  let falhas = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${m}`); if (!c) falhas++; };

  /** A cor de fundo REAL do app, calculada pelo navegador. */
  const corDoApp = () => pg.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--c-app').trim());

  await pg.goto('http://localhost:4501/crm', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1200);

  if (await pg.locator('input[type="email"]').count()) {
    await pg.locator('input[type="email"]').fill('gabriel@republicbt.com.br');
    await pg.locator('input[type="password"]').fill(SENHA);
    await pg.locator('button:has-text("Entrar")').click();
    await pg.waitForTimeout(4500);
  }

  /* ---- os dois caminhos até a tela ------------------------------------- */
  ok((await pg.locator('aside a[href="/crm/configuracoes"]').count()) === 2,
     'o menu e a engrenagem levam à mesma tela');

  await pg.getByRole('link', { name: 'Preferências' }).click();
  await pg.waitForTimeout(1500);

  const cartoes = pg.locator('[data-escolher-tema]');
  const n = await cartoes.count();
  ok(n === 3, `os 3 temas aparecem (${n})`);
  ok((await pg.locator('[data-escolher-tema][aria-pressed="true"]').count()) === 1,
     'exatamente um marcado como "Em uso"');

  const texto = (await pg.locator('body').textContent()) ?? '';
  ok(/Em uso/.test(texto), 'o tema ativo é identificável sem passar o mouse');

  /* ---- a prévia é do CRM, não do painel financeiro --------------------- */
  ok(!/gráfico|Gráfico/.test(texto),
     'a tela não fala de gráfico: a prévia mostra caixa de entrada e funil');

  /* ---- trocar muda o app DE VERDADE ------------------------------------ */
  const antes = await corDoApp();

  const lista = await cartoes.evaluateAll((els) => els.map((e) => ({
    id: e.getAttribute('data-escolher-tema'),
    ativo: e.getAttribute('aria-pressed') === 'true',
  })));
  const alvo = lista.find((x) => !x.ativo);

  await pg.locator(`[data-escolher-tema="${alvo.id}"]`).click();
  await pg.waitForTimeout(1200);

  const depois = await corDoApp();
  ok(antes !== depois,
     `escolher "${alvo.id}" muda a cor do app: ${antes} → ${depois}`);
  ok((await pg.locator(`[data-escolher-tema="${alvo.id}"][aria-pressed="true"]`).count()) === 1,
     'e o cartão escolhido passa a ser o "Em uso"');

  /* ---- e sobrevive ao F5 ----------------------------------------------- */
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForTimeout(3200);
  ok((await corDoApp()) === depois,
     'a escolha sobrevive ao F5 — fica salva neste navegador');

  /* ---- e vale no app inteiro, não só nesta tela ------------------------ */
  await pg.getByRole('link', { name: 'Conversas' }).click();
  await pg.waitForTimeout(2000);
  ok((await corDoApp()) === depois, 'e vale nas outras telas do CRM');

  /* ---- o vendedor também escolhe: tema é preferência, não permissão ----- */
  const menu = (await pg.locator('aside').first().textContent()) ?? '';
  ok(/Preferências/.test(menu), 'o item fica visível para todo mundo');

  ok(erros.length === 0, `sem erro no console${erros.length ? ': ' + erros[0] : ''}`);

  console.log(`\n${falhas === 0 ? 'Os temas funcionam no CRM.' : `${falhas} falha(s).`}`);
  await nav.close();
  process.exit(falhas === 0 ? 0 : 1);
})();
