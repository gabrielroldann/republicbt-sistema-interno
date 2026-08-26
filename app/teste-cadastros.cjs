/**
 * TESTE DOS CADASTROS
 *
 * Produto, entrada de mercadoria, despesa e gasto de mídia — as quatro coisas
 * que o sistema lia e nunca deixava escrever.
 *
 * O que mais importa aqui é o CUSTO MÉDIO PONDERADO. É a conta que ninguém faz
 * de cabeça e que muda a margem de todas as vendas seguintes: se ela estiver
 * errada, todo número de lucro do painel fica errado junto, e de um jeito que
 * ninguém percebe olhando.
 *
 *   npm run dev -- --port 4300
 *   node teste-cadastros.cjs
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
  const perto = (a, b, tol = 0.02) => Math.abs(a - b) < tol;
  const num = (s) => Number(String(s).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));

  /**
   * O saldo da linha, lido do padrão "<saldo>/ mín <mínimo>".
   *
   * Antes eu testava `\b10\b` no texto inteiro da linha, e falhava sempre: o
   * texto sai como "Raquetes10/ mín 3" e não existe fronteira de palavra entre
   * uma letra e um dígito. O teste acusava erro num número que estava certo —
   * o tipo de falso positivo que faz a equipe parar de confiar no teste.
   */
  const saldoDaLinha = async (loc) => {
    const m = /(-?\d+)\s*\/\s*mín/.exec((await loc.textContent()) ?? '');
    return m ? Number(m[1]) : NaN;
  };

  /* ═══════════════════════════════════════════════════════ produto ══ */
  await pg.goto('http://localhost:4501/painel/estoque', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1200);

  const linhas = pg.locator('tbody tr');
  ok(await linhas.count() > 0, `o estoque lista produto (${await linhas.count()})`);
  ok(await pg.locator('button', { hasText: 'Novo produto' }).count() === 1,
     'existe botão de cadastrar produto');

  await pg.locator('button', { hasText: 'Novo produto' }).click();
  await pg.waitForTimeout(500);
  let dlg = pg.locator('[role="dialog"]').last();

  await dlg.locator('input').nth(0).fill('TST-RAQ-001');
  await dlg.locator('input').nth(1).fill('Raquete de Teste');
  await dlg.locator('input').nth(2).fill('Marca Teste');
  const decimais = dlg.locator('input[inputmode="decimal"]');
  await decimais.nth(0).fill('400');   // custo
  await decimais.nth(1).fill('1000');  // preço
  await pg.waitForTimeout(400);

  // A margem calculada na hora, antes de salvar
  const margem = await dlg.locator('[data-margem]').getAttribute('data-margem');
  ok(perto(Number(margem), 60), `a margem aparece enquanto se digita: ${margem}%`);

  await dlg.locator('button', { hasText: 'Cadastrar' }).click();
  await pg.waitForTimeout(1300);
  ok((await pg.locator('[role="dialog"]').count()) === 0, 'o diálogo fecha ao salvar');

  await pg.locator('input[placeholder*="Buscar"]').fill('TST-RAQ-001');
  await pg.waitForTimeout(900);
  const nova = pg.locator('tbody tr').first();
  ok((await nova.textContent() ?? '').includes('Raquete de Teste'),
     'o produto novo aparece no estoque');
  ok((await saldoDaLinha(nova)) === 0,
     'e nasce com estoque zero — cadastrar não é o mesmo que ter mercadoria');

  /* ---- SKU repetido é recusado ------------------------------------------ */
  await pg.locator('button', { hasText: 'Novo produto' }).click();
  await pg.waitForTimeout(400);
  dlg = pg.locator('[role="dialog"]').last();
  await dlg.locator('input').nth(0).fill('TST-RAQ-001');
  await dlg.locator('input').nth(1).fill('Outra qualquer');
  await dlg.locator('input[inputmode="decimal"]').nth(1).fill('500');
  await dlg.locator('button', { hasText: 'Cadastrar' }).click();
  await pg.waitForTimeout(800);
  ok((await pg.locator('[role="dialog"]').count()) === 1,
     'SKU repetido NÃO salva — dois cadastros da mesma raquete dividiriam o estoque');
  ok(/já existe/.test(await dlg.textContent() ?? ''), 'e a tela diz o motivo');
  await dlg.locator('button', { hasText: 'Cancelar' }).click();
  await pg.waitForTimeout(500);

  /* ═════════════════════════════ CUSTO MÉDIO PONDERADO ══════════════════ */
  await pg.locator('tbody tr').first().locator('button[title="Dar entrada ou ajustar"]').click();
  await pg.waitForTimeout(700);
  dlg = pg.locator('[role="dialog"]').last();

  // Entrada 1: 10 unidades a R$400, sem frete. Saldo era 0 → custo vira 400.
  await dlg.locator('input[inputmode="numeric"]').first().fill('10');
  await dlg.locator('input[inputmode="decimal"]').nth(0).fill('400');
  await pg.waitForTimeout(500);
  let previa = await dlg.locator('[data-previa]').textContent();
  ok(/0 → 10/.test(previa ?? ''), 'a prévia mostra o saldo antes e depois');

  await dlg.locator('button', { hasText: 'Dar entrada' }).last().click();
  await pg.waitForTimeout(1300);

  let linha = pg.locator('tbody tr').first();
  let txt = await linha.textContent();
  ok((await saldoDaLinha(linha)) === 10, 'o saldo virou 10');
  ok(/400,00/.test(txt ?? ''), 'e o custo continua R$400 — saldo era zero');

  // Entrada 2: 10 unidades a R$500 + R$200 de frete.
  //   custo com frete = 500 + 200/10 = 520
  //   média = (10×400 + 10×520) / 20 = 460
  await linha.locator('button[title="Dar entrada ou ajustar"]').click();
  await pg.waitForTimeout(700);
  dlg = pg.locator('[role="dialog"]').last();
  await dlg.locator('input[inputmode="numeric"]').first().fill('10');
  await dlg.locator('input[inputmode="decimal"]').nth(0).fill('500');
  await dlg.locator('input[inputmode="decimal"]').nth(1).fill('200');
  await pg.waitForTimeout(600);

  previa = await dlg.locator('[data-previa]').textContent();
  ok(/520,00/.test(previa ?? ''),
     'o FRETE entra no custo: 500 + 200÷10 = R$520 — é o que loja pequena mais esquece');
  ok(/460,00/.test(previa ?? ''),
     'e a média ponderada sai certa: (10×400 + 10×520) ÷ 20 = R$460');
  ok(/10 → 20/.test(previa ?? ''), 'saldo 10 → 20');

  await dlg.locator('button', { hasText: 'Dar entrada' }).last().click();
  await pg.waitForTimeout(1300);

  linha = pg.locator('tbody tr').first();
  txt = await linha.textContent();
  ok((await saldoDaLinha(linha)) === 20, 'o saldo somou: 20 unidades');
  ok(/460,00/.test(txt ?? ''), 'e o custo do produto virou a média: R$460');
  ok(/54,0%|54%/.test(txt ?? ''),
     'a margem caiu junto, no preço de R$1.000: de 60% para 54%');

  /* ---- ajuste de inventário -------------------------------------------- */
  await linha.locator('button[title="Dar entrada ou ajustar"]').click();
  await pg.waitForTimeout(700);
  dlg = pg.locator('[role="dialog"]').last();
  await dlg.locator('button', { hasText: 'Ajustar inventário' }).click();
  await pg.waitForTimeout(400);
  await dlg.locator('input[inputmode="numeric"]').first().fill('18');
  await pg.waitForTimeout(400);
  ok(/-2/.test(await dlg.textContent() ?? ''), 'a diferença do inventário aparece: −2');

  const btnAjuste = dlg.locator('button', { hasText: 'Registrar ajuste' });
  ok(await btnAjuste.isDisabled(), 'ajuste SEM motivo fica bloqueado — sumiço precisa de rastro');
  await dlg.locator('input[placeholder*="Inventário"]').fill('Inventário de teste');
  await pg.waitForTimeout(300);
  await btnAjuste.click();
  await pg.waitForTimeout(1300);

  ok((await saldoDaLinha(pg.locator('tbody tr').first())) === 18,
     'o ajuste desceu o saldo para 18');

  // e ficou registrado no histórico
  await pg.locator('tbody tr').first().locator('button[title="Dar entrada ou ajustar"]').click();
  await pg.waitForTimeout(700);
  dlg = pg.locator('[role="dialog"]').last();
  await dlg.locator('button', { hasText: 'Histórico' }).click();
  await pg.waitForTimeout(500);
  const hist = await dlg.textContent();
  ok(/Perda/.test(hist ?? ''), 'e o histórico registra a perda, em vez de sobrescrever o saldo');
  ok(/\+10/.test(hist ?? ''), 'com as duas entradas também');
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(500);

  /* ═══════════════════════════════════════════════════════ despesas ══ */
  await pg.goto('http://localhost:4501/painel/financeiro', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(800);
  await pg.locator('button', { hasText: 'Despesas' }).first().click();
  await pg.waitForTimeout(1100);

  const despesas = pg.locator('[data-despesa]');
  ok(await despesas.count() > 0, `a lista de despesas carrega (${await despesas.count()})`);

  const travadas = pg.locator('[data-travada="1"]');
  ok(await travadas.count() > 0,
     'as linhas vindas do modelo de custo fixo aparecem travadas');
  ok((await travadas.first().locator('button[title="Editar"]').count()) === 0,
     'e NÃO têm botão de editar — uma verdade só, o valor muda no modelo');

  const antes = await despesas.count();
  await pg.locator('button', { hasText: 'Nova despesa' }).click();
  await pg.waitForTimeout(500);
  dlg = pg.locator('[role="dialog"]').last();
  await dlg.locator('input').nth(0).fill('Reforma de teste');
  await dlg.locator('input[inputmode="decimal"]').fill('1500');
  await dlg.locator('button', { hasText: 'Lançar' }).click();
  await pg.waitForTimeout(1300);
  ok((await despesas.count()) === antes + 1, 'a despesa nova entra na lista');

  const minha = pg.locator('[data-despesa]', { hasText: 'Reforma de teste' }).first();
  ok((await minha.getAttribute('data-travada')) === '0', 'e é editável, ao contrário das do modelo');

  /* ---- fornecedores avisa que não entra no resultado -------------------- */
  await pg.locator('button', { hasText: 'Nova despesa' }).click();
  await pg.waitForTimeout(500);
  dlg = pg.locator('[role="dialog"]').last();
  await dlg.locator('select').selectOption('fornecedores');
  await pg.waitForTimeout(400);
  ok(/não.*entra no resultado/i.test(await dlg.textContent() ?? ''),
     'escolher "fornecedores" avisa que compra de estoque vira ativo, não despesa');
  await dlg.locator('button', { hasText: 'Cancelar' }).click();
  await pg.waitForTimeout(500);

  /* ══════════════════════════════════════════════════════ campanhas ══ */
  await pg.goto('http://localhost:4501/painel/campanhas', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1300);

  const camps = pg.locator('[data-campanha]');
  ok(await camps.count() > 0, `a tela de campanhas lista (${await camps.count()})`);

  const corpo = await pg.locator('main').textContent();
  for (const col of ['Gasto', 'Leads', 'Por lead', 'Vendas', 'Conversão',
                     'Receita', 'Retorno', 'Sobra']) {
    ok(new RegExp(col).test(corpo ?? ''), `coluna "${col}"`);
  }
  ok(/retorno alto com margem baixa ainda\s+dá prejuízo|retorno alto com margem baixa/i.test(corpo ?? ''),
     'e a tela explica por que a SOBRA decide, não o retorno');

  const paga = camps.filter({ has: pg.locator('input[data-gasto]') }).first();
  const idCamp = await paga.getAttribute('data-campanha');
  const sobraAntes = Number(await paga.getAttribute('data-sobra'));

  const campoGasto = paga.locator('input[data-gasto]');
  const gastoAntes = num(await campoGasto.inputValue());
  await campoGasto.fill(String(gastoAntes + 1000));
  await campoGasto.blur();
  await pg.waitForTimeout(1500);

  const depois = pg.locator(`[data-campanha="${idCamp}"]`).first();
  const sobraDepois = Number(await depois.getAttribute('data-sobra'));
  ok(perto(sobraAntes - sobraDepois, 1000, 1),
     `gastar R$1.000 a mais derruba a sobra em exatamente R$1.000: ` +
     `${sobraAntes.toFixed(2)} → ${sobraDepois.toFixed(2)}`);

  // e o gasto virou despesa de marketing no financeiro
  await pg.goto('http://localhost:4501/painel/financeiro', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(800);
  await pg.locator('button', { hasText: 'Despesas' }).first().click();
  await pg.waitForTimeout(1100);
  ok((await pg.locator('[data-despesa]', { hasText: 'Meta Ads' }).count()) > 0,
     'e o gasto de mídia aparece como despesa — o dinheiro saiu de verdade');

  ok(erros.length === 0, `sem erro no console${erros.length ? `: ${erros[0]}` : ''}`);

  console.log(`\n${falhas === 0 ? 'Os cadastros funcionam.' : `${falhas} falha(s).`}`);
  await nav.close();
  process.exit(falhas === 0 ? 0 : 1);
})();
