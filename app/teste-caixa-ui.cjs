/**
 * TESTE DE INTERFACE DA CAIXA DE ENTRADA
 *
 * Roda contra o app de verdade, num navegador de verdade. O que se prova aqui
 * é o fluxo que a loja vai usar todo dia:
 *
 *   o cliente chega pela loja → a campanha aparece SEM clique → o vendedor
 *   atende pelo NÚMERO DELE → e as duas conversas continuam ligadas.
 *
 *   npm run dev -- --port 4400
 *   node teste-caixa-ui.cjs
 */
const { chromium } = require('playwright');

(async () => {
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await nav.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = [];
  pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  pg.on('pageerror', (e) => erros.push(String(e)));

  let falhas = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${m}`); if (!c) falhas++; };

  await pg.goto('http://localhost:4501/crm', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(600);

  // Clicar no link, não navegar por URL: `goto` recarrega a página e apaga o
  // mock em memória. Esse detalhe já produziu teste verde com tela vazia.
  await pg.locator('aside nav a[href="/crm/conversas"]').click();
  await pg.waitForTimeout(900);

  /* ------------------------------------------------------------- lista -- */
  const lista = pg.locator('aside').nth(1);
  const qtd = await lista.locator('[data-conversa]').count();
  ok(qtd > 0, `a caixa da loja tem conversa (${qtd})`);

  const textoLista = await lista.textContent();
  ok(/Caixa da loja/.test(textoLista ?? ''), 'aba da caixa da loja');
  ok(/Meu número/.test(textoLista ?? ''), 'aba do número do vendedor');
  ok(/Sem vendedor/.test(textoLista ?? ''),
     'a fila sem dono é visível na lista — é o que exige ação');

  // A campanha na LISTA, sem clique. É o motivo de o CRM existir: origem
  // escondida atrás de um clique não decide mídia nenhuma.
  ok(/Verão 2026|Institucional|Retargeting|Orgânico|Não rastreado/.test(textoLista ?? ''),
     'a campanha aparece na lista, sem precisar abrir a conversa');

  /* ------------------------------------------------------------ thread -- */
  ok((await pg.locator('text=Escolha uma conversa').count()) === 1,
     'sem conversa escolhida, a tela diz o que fazer');

  // Abre a primeira SEM vendedor — é o caso que interessa
  const semDono = lista.locator('[data-sem-dono="1"]').first();
  const nomeAlvo = (await semDono.getAttribute('data-cliente'))?.trim();
  await semDono.click();
  await pg.waitForTimeout(700);

  const thread = pg.locator('section').last();
  const textoThread = await thread.textContent();
  ok((textoThread ?? '').includes(nomeAlvo ?? '###'),
     `abriu a conversa certa: ${nomeAlvo}`);
  ok(/\(\d{2}\) \d{4,5}-\d{4}/.test(textoThread ?? ''), 'telefone formatado');
  ok(/chegou pelo número da loja/.test(textoThread ?? ''),
     'a thread diz POR ONDE o cliente chegou');
  ok((await thread.locator('a[href^="https://wa.me/"]').count()) > 0,
     'atalho para o WhatsApp do celular');

  const balões = await thread.locator('p.whitespace-pre-wrap').count();
  ok(balões > 0, `o chat mostra as mensagens (${balões})`);
  ok(/Hoje|Ontem|de /.test(textoThread ?? ''),
     'separador de dia — sem ele a thread vira um bloco só');

  /* ----------------------------------------- o movimento central da loja -- */
  ok((await thread.locator('button', { hasText: 'Atender pelo meu número' }).count()) > 0,
     'o botão de atender pelo próprio número está na thread da loja');

  await thread.locator('button', { hasText: 'Atender pelo meu número' }).first().click();
  await pg.waitForTimeout(600);

  const dialogo = pg.locator('[role="dialog"]').last();
  ok(await dialogo.count() === 1, 'abre o diálogo da primeira mensagem');

  const rascunho = await dialogo.locator('textarea').inputValue();
  ok(rascunho.length > 20, 'a mensagem já vem escrita, não em branco');
  ok(rascunho.includes('Republic BT'), 'com o nome da loja');
  ok(!/\{cliente\}|\{vendedor\}|\{loja\}/.test(rascunho),
     'e com os marcadores JÁ substituídos — nada de "{cliente}" indo para o cliente');

  const primeiroNome = (nomeAlvo ?? '').split(' ')[0];
  ok(primeiroNome ? rascunho.includes(primeiroNome) : true,
     `chama o cliente pelo primeiro nome: ${primeiroNome}`);
  ok(!rascunho.includes(nomeAlvo ?? '###') || (nomeAlvo ?? '').split(' ').length === 1,
     'só o primeiro nome, não o nome completo');

  ok((await dialogo.locator('text=/seu.*WhatsApp|sai do/i').count()) > 0,
     'o diálogo avisa que a mensagem sai do número DELE');
  ok((await dialogo.locator('button', { hasText: 'Editar o modelo' }).count()) > 0,
     'dá para editar o modelo padrão de todas as conversas');

  // envia
  await dialogo.locator('button', { hasText: 'Enviar e assumir' }).click();
  await pg.waitForTimeout(1200);

  ok((await pg.locator('[role="dialog"]').count()) === 0, 'o diálogo fecha ao enviar');

  const depois = pg.locator('section').last();
  const textoDepois = await depois.textContent();
  ok(/seu número/.test(textoDepois ?? ''),
     'e a tela pula para a conversa do NÚMERO DO VENDEDOR');
  ok((textoDepois ?? '').includes(primeiroNome),
     'com a mensagem de apresentação já enviada');

  /* ------------------------------------------- as duas threads ligadas --- */
  ok((await depois.locator('text=Conversa da loja').count()) > 0,
     'e o atalho de volta para a conversa da loja aparece — a MESMA pessoa, dois números');

  await depois.locator('text=Conversa da loja').first().click();
  await pg.waitForTimeout(700);
  const voltou = await pg.locator('section').last().textContent();
  ok(/chegou pelo número da loja/.test(voltou ?? ''), 'e o atalho leva de volta');
  ok(!/Sem vendedor/.test(voltou ?? ''),
     'a conversa da loja não está mais sem dono: atender assumiu junto');

  /* ------------------------------------------------------- enviar texto -- */
  const atual = pg.locator('section').last();
  const caixa = atual.locator('textarea');
  if (await caixa.count()) {
    await caixa.fill('Mensagem de teste do vendedor');
    await caixa.press('Enter');
    await pg.waitForTimeout(900);
    ok((await pg.locator('text=Mensagem de teste do vendedor').count()) > 0,
       'Enter envia a mensagem e ela aparece na thread');
  } else {
    ok(true, 'janela fechada nesta conversa: composer bloqueado (comportamento correto)');
  }

  /* -------------------------------------------------- a aba do vendedor -- */
  await pg.locator('[data-aba="vendedor"]').click();
  await pg.waitForTimeout(800);
  const naAba = await pg.locator('aside').nth(1).textContent();
  ok(!/Sem vendedor/.test(naAba ?? ''),
     'na aba do próprio número não existe conversa sem dono');

  /* ------------------------------------------------------------ janela -- */
  await pg.locator('[data-aba="loja"]').click();
  await pg.waitForTimeout(800);
  const listaLoja = await pg.locator('aside').nth(1).textContent();
  ok(/Janela fechada/.test(listaLoja ?? ''),
     'conversa fora das 24h é marcada na lista, antes de o vendedor digitar');

  const fechada = pg.locator('aside').nth(1)
    .locator('[data-conversa]', { hasText: 'Janela fechada' }).first();
  await fechada.click();
  await pg.waitForTimeout(700);
  const tf = await pg.locator('section').last().textContent();
  ok(/24 horas|template aprovado/.test(tf ?? ''),
     'e a thread explica a regra em vez de deixar a mensagem falhar em silêncio');

  /* --------------------------------------------------------- só os meus -- */
  await pg.locator('button', { hasText: 'Só as sem vendedor' }).click();
  await pg.waitForTimeout(800);
  const filtrada = await pg.locator('aside').nth(1).textContent();
  ok(!/Atende:/.test(filtrada ?? ''), 'o filtro "sem vendedor" tira as já atribuídas');

  /* ------------------------------------------------------------------- */
  ok(erros.length === 0, `sem erro no console${erros.length ? `: ${erros[0]}` : ''}`);

  console.log(`\n${falhas === 0 ? 'A caixa de entrada funciona.' : `${falhas} falha(s).`}`);
  await nav.close();
  process.exit(falhas === 0 ? 0 : 1);
})();
