/**
 * TESTE DAS CONTAS A PAGAR E RECEBER
 *
 * O que se prova aqui é que a ação PERSISTE e é REVERSÍVEL.
 *
 * Antes, "marcar como pago" vivia num Set no estado do componente: parecia
 * salvo, sumia ao trocar de aba, e não tinha volta. Essa combinação — parece
 * que gravou, não gravou, e não dá para desfazer — é a pior possível num
 * número que decide pagamento de fornecedor.
 *
 *   npm run dev -- --port 4300
 *   node teste-contas.cjs
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

  await pg.goto('http://localhost:4501/painel/financeiro', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(700);
  await pg.locator('button', { hasText: 'Contas a pagar e receber' }).click();
  await pg.waitForTimeout(1000);

  const linhas = pg.locator('[data-conta]');
  const total0 = await linhas.count();
  ok(total0 > 0, `a lista tem conta (${total0})`);

  const cartaoPagar = pg.locator('div').filter({ hasText: /^Contas a pagar/ }).first();
  ok(await pg.locator('button', { hasText: 'Nova' }).count() >= 2,
     'os dois cartões têm botão de lançar conta nova');

  /* ═══════════════════════════════════════════════════════ adicionar ══ */
  await pg.locator('button', { hasText: 'Nova' }).first().click();
  await pg.waitForTimeout(500);

  const dlg = pg.locator('[role="dialog"]').last();
  ok(await dlg.count() === 1, 'abre o diálogo de nova conta');
  ok(/Nova conta/.test(await dlg.textContent() ?? ''), 'com o título de criação');

  await dlg.locator('input').nth(0).fill('Conta de teste automatizado');
  await dlg.locator('input').nth(1).fill('Fornecedor Teste');
  await dlg.locator('input[inputmode="decimal"]').fill('1234,50');
  await dlg.locator('input[type="date"]').fill('2026-12-20');
  await dlg.locator('button', { hasText: 'Lançar conta' }).click();
  await pg.waitForTimeout(1200);

  ok((await pg.locator('[role="dialog"]').count()) === 0, 'o diálogo fecha ao salvar');
  ok((await linhas.count()) === total0 + 1, 'a conta nova aparece na lista');

  const nova = pg.locator('[data-conta]', { hasText: 'Conta de teste automatizado' }).first();
  ok(await nova.count() === 1, 'e é a que acabou de ser lançada');
  ok(/1\.234,50/.test(await nova.textContent() ?? ''),
     'com o valor formatado em real, aceitando vírgula na digitação');

  /* ---- validação: o que o formulário RECUSA ----------------------------- */
  await pg.locator('button', { hasText: 'Nova' }).first().click();
  await pg.waitForTimeout(400);
  const dlg2 = pg.locator('[role="dialog"]').last();
  await dlg2.locator('input[inputmode="decimal"]').fill('0');
  await dlg2.locator('button', { hasText: 'Lançar conta' }).click();
  await pg.waitForTimeout(600);
  ok((await pg.locator('[role="dialog"]').count()) === 1,
     'sem descrição o diálogo NÃO fecha');
  ok(/descrição/i.test(await dlg2.textContent() ?? ''),
     'e diz o que faltou, em vez de só não fazer nada');
  await dlg2.locator('button', { hasText: 'Cancelar' }).click();
  await pg.waitForTimeout(500);

  /* ═════════════════════════════════════════════════════════ editar ══ */
  await nova.locator('button[title="Editar"]').first().click({ force: true });
  await pg.waitForTimeout(600);
  const dlg3 = pg.locator('[role="dialog"]').last();
  ok(/Editar conta/.test(await dlg3.textContent() ?? ''), 'abre em modo de edição');
  ok((await dlg3.locator('input').nth(0).inputValue()) === 'Conta de teste automatizado',
     'com os dados da conta certa já preenchidos');

  await dlg3.locator('input[inputmode="decimal"]').fill('999');
  await dlg3.locator('button', { hasText: 'Salvar' }).click();
  await pg.waitForTimeout(1200);

  const editada = pg.locator('[data-conta]', { hasText: 'Conta de teste automatizado' }).first();
  ok(/999,00/.test(await editada.textContent() ?? ''), 'o valor editado aparece na lista');

  /* ══════════════════════════════ marcar pago, e DESMARCAR ══════════════ */
  const antes = await editada.getAttribute('data-status');
  await editada.locator('button[title="Marcar como paga"]').click();
  await pg.waitForTimeout(1000);

  const depois = pg.locator('[data-conta]', { hasText: 'Conta de teste automatizado' }).first();
  ok((await depois.getAttribute('data-status')) === 'paga',
     `marcar como paga muda o status: ${antes} → paga`);

  // O ponto que faltava: voltar atrás.
  await depois.locator('button[title^="Desmarcar"]').click();
  await pg.waitForTimeout(1000);
  const voltou = pg.locator('[data-conta]', { hasText: 'Conta de teste automatizado' }).first();
  ok((await voltou.getAttribute('data-status')) !== 'paga',
     'e DESMARCAR devolve para em aberto — um clique errado tem volta');

  /* ---- persiste ao sair e voltar da aba --------------------------------- */
  await voltou.locator('button[title="Marcar como paga"]').click();
  await pg.waitForTimeout(900);
  await pg.locator('button', { hasText: 'Fluxo de caixa' }).first().click();
  await pg.waitForTimeout(700);
  await pg.locator('button', { hasText: 'Contas a pagar e receber' }).click();
  await pg.waitForTimeout(1100);

  const persistiu = pg.locator('[data-conta]', { hasText: 'Conta de teste automatizado' }).first();
  ok((await persistiu.getAttribute('data-status')) === 'paga',
     'e a marcação SOBREVIVE a trocar de aba — antes vivia no estado do componente');

  /* ═════════════════════════════════════════════════════════ excluir ══ */
  const antesExcluir = await linhas.count();
  await persistiu.locator('button[title="Excluir"]').click({ force: true });
  await pg.waitForTimeout(600);

  const conf = pg.locator('[role="dialog"]').last();
  ok(/Excluir esta conta/.test(await conf.textContent() ?? ''),
     'excluir pede confirmação: sai do saldo previsto e não volta');
  ok(/999,00/.test(await conf.textContent() ?? ''),
     'e mostra QUAL conta, com o valor — não um "tem certeza?" genérico');

  await conf.locator('button', { hasText: 'Cancelar' }).click();
  await pg.waitForTimeout(700);
  ok((await linhas.count()) === antesExcluir, 'cancelar não exclui nada');

  await pg.locator('[data-conta]', { hasText: 'Conta de teste automatizado' }).first()
          .locator('button[title="Excluir"]').click({ force: true });
  await pg.waitForTimeout(500);
  await pg.locator('[role="dialog"]').last()
          .locator('button', { hasText: 'Excluir' }).click();
  await pg.waitForTimeout(1200);

  ok((await linhas.count()) === antesExcluir - 1, 'confirmar exclui');
  ok((await pg.locator('[data-conta]', { hasText: 'Conta de teste automatizado' }).count()) === 0,
     'e a conta some da lista');

  ok(erros.length === 0, `sem erro no console${erros.length ? `: ${erros[0]}` : ''}`);

  console.log(`\n${falhas === 0 ? 'As contas a pagar e receber funcionam.' : `${falhas} falha(s).`}`);
  await nav.close();
  process.exit(falhas === 0 ? 0 : 1);
})();
