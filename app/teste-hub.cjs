/**
 * O HUB: UM LOGIN, DUAS ÁREAS, UM NÍVEL DE ACESSO.
 *
 * É a checagem que só existe porque os dois apps viraram um. As outras suítes
 * provam que o painel e o CRM continuam funcionando; esta prova a coisa nova —
 * que dá para trocar de sistema sem sair, e que o vendedor NÃO troca.
 *
 * Roda contra a construção ligada no banco (`dist`, porta 4500), porque a
 * pergunta aqui é sobre papel e sessão de verdade, não sobre tela.
 *
 *   npm run build && python3 servidor-teste.py
 *   node teste-hub.cjs
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

const BASE = 'http://localhost:4500';

(async () => {
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let falhas = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${m}`); if (!c) falhas++; };

  /** Cada papel numa aba limpa: sessão do Supabase vaza entre navegações. */
  const entrar = async (email) => {
    const ctx = await nav.newContext({ viewport: { width: 1500, height: 950 } });
    const pg = await ctx.newPage();
    const erros = [];
    pg.on('pageerror', (e) => erros.push(String(e)));
    pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

    await pg.goto(BASE + '/', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(1200);
    await pg.locator('input[type="email"]').fill(email);
    await pg.locator('input[type="password"]').fill(SENHA);
    await pg.locator('button:has-text("Entrar")').click();
    await pg.waitForTimeout(8000);
    return { ctx, pg, erros };
  };

  /* ═══════════════════════════════════════════════════ o sócio ═══ */
  const socio = await entrar('gabriel@republicbt.com.br');
  ok(/\/painel/.test(socio.pg.url()), `o sócio cai no painel: ${socio.pg.url()}`);

  const seletor = socio.pg.locator('[data-seletor-sistema]');
  ok((await seletor.count()) === 1, 'o seletor de sistema está na barra');
  ok((await seletor.locator('[data-sistema]').count()) === 2,
     'com as duas áreas — painel e CRM');

  // Trocar CLICANDO, que é a promessa: sem abrir outro site.
  await seletor.locator('[data-sistema="crm"]').click();
  await socio.pg.waitForTimeout(3000);
  ok(/\/crm/.test(socio.pg.url()), `um clique leva ao CRM: ${socio.pg.url()}`);
  ok((await socio.pg.locator('aside').count()) > 0, 'e a barra do CRM carregou');

  await socio.pg.locator('[data-seletor-sistema] [data-sistema="painel"]').click();
  await socio.pg.waitForTimeout(2500);
  ok(/\/painel/.test(socio.pg.url()), 'e volta para o painel pelo mesmo lugar');
  ok((await socio.pg.locator('[data-kpi]').count()) > 0,
     'com os indicadores no lugar — o painel não perdeu estado na ida e volta');

  /**
   * A área é lembrada.
   *
   * Quem passa o dia no CRM não quer cair no painel toda manhã. O F5 abaixo
   * simula justamente isso: a sessão continua, e o sistema volta onde estava.
   */
  await socio.pg.locator('[data-seletor-sistema] [data-sistema="crm"]').click();
  await socio.pg.waitForTimeout(2000);
  await socio.pg.goto(BASE + '/', { waitUntil: 'networkidle' });
  await socio.pg.waitForTimeout(6000);
  ok(/\/crm/.test(socio.pg.url()),
     `entrando pela raiz, volta para a última área usada: ${socio.pg.url()}`);

  ok(socio.erros.length === 0,
     `sem erro no console do sócio${socio.erros.length ? ': ' + socio.erros[0] : ''}`);
  await socio.ctx.close();

  /* ════════════════════════════════════════════════ o vendedor ═══ */
  const vend = await entrar('vendedor@republicbt.com.br');
  ok(/\/crm/.test(vend.pg.url()), `o vendedor cai direto no CRM: ${vend.pg.url()}`);

  // Seletor de uma opção só é ruído; seletor com opção bloqueada é pior —
  // anuncia uma porta que ele não pode abrir.
  ok((await vend.pg.locator('[data-seletor-sistema]').count()) === 0,
     'e não vê seletor nenhum — o painel não é oferecido');

  await vend.pg.goto(BASE + '/painel', { waitUntil: 'networkidle' });
  await vend.pg.waitForTimeout(4000);
  ok(/\/crm/.test(vend.pg.url()),
     `digitando /painel na URL, o portão devolve: ${vend.pg.url()}`);

  // O portão é conveniência. A garantia é o RLS: mesmo que a tela abrisse, o
  // banco recusa tudo que é dinheiro. Isso quem prova é teste-banco.cjs.
  const corpo = (await vend.pg.locator('body').textContent()) ?? '';
  ok(!/Fluxo de caixa|Contas a pagar|Lucro líquido/i.test(corpo),
     'e em nenhum momento aparece número de dinheiro na tela dele');

  ok(vend.erros.length === 0,
     `sem erro no console do vendedor${vend.erros.length ? ': ' + vend.erros[0] : ''}`);
  await vend.ctx.close();

  console.log(`\n${falhas === 0
    ? 'Um sistema, um login, e o vendedor só no CRM.'
    : `${falhas} falha(s).`}`);
  await nav.close();
  process.exit(falhas === 0 ? 0 : 1);
})();
