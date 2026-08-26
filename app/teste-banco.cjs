/**
 * O PAINEL CONTRA O BANCO.
 *
 * Os outros testes provam que a tela é coerente consigo mesma. Este prova que
 * ela é coerente com o BANCO — que é outra coisa, e a que importa quando o
 * número decide pagamento de fornecedor.
 *
 * Os valores esperados vêm de uma consulta SQL feita à mão, não da própria
 * aplicação. Se eu deixasse o teste calcular o esperado com o mesmo código que
 * a tela usa, ele passaria mesmo com a conta errada — que é o pior tipo de
 * teste: o que dá confiança sem verificar nada.
 *
 * Foi ele que pegou dois bugs de dinheiro:
 *
 *   1. "Recebido R$ 0,00" com 487 pagamentos no banco — os índices em memória
 *      não eram reconstruídos depois da carga.
 *   2. A taxa da maquininha era CONSULTADA a cada leitura em vez de usar a
 *      congelada na venda: R$1.150,08 na tela contra R$962,35 no banco.
 *
 *   npm run servidor-teste     (num terminal)
 *   node teste-banco.cjs       (no outro)
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

/**
 * POR QUE OS ESPERADOS DEIXARAM DE SER NÚMEROS FIXOS.
 *
 * A tela abre em "30 dias", uma janela que ANDA com o calendário. Com os
 * valores escritos à mão o teste passava hoje e falhava amanhã — foi o que
 * aconteceu: R$ 52.497,00 virou R$ 52.428,00 só porque o dia mudou, e uma
 * falha assim treina a gente a ignorar o resultado, que é pior do que não ter
 * teste nenhum.
 *
 * O que NÃO mudou é o princípio: o esperado continua vindo do banco por um
 * caminho que a aplicação não usa. Aqui as linhas cruas de `venda`, `pagamento`
 * e `despesa` são baixadas pela API REST e somadas neste arquivo, com aritmética
 * escrita à mão. Se o painel voltar a consultar a taxa da maquininha de hoje em
 * vez da congelada, esta soma continua certa e a tela é que discorda — que foi
 * exatamente como esse bug apareceu.
 */
const fs = require('fs');
const env = Object.fromEntries(
  fs.readFileSync(`${__dirname}/.env.local`, 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const API = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

async function token(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: SENHA }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`login falhou: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function tabela(jwt, caminho) {
  const r = await fetch(`${API}/rest/v1/${caminho}`, {
    headers: { apikey: ANON, authorization: `Bearer ${jwt}` },
  });
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${await r.text()}`);
  return r.json();
}

/** A mesma janela que o botão "30 dias" usa: hoje e os 29 dias anteriores. */
function janela() {
  const fim = new Date();
  const ini = new Date(fim);
  ini.setDate(ini.getDate() - 29);
  const d = (x) => x.toISOString().slice(0, 10);
  return { de: d(ini), ate: d(fim) };
}

async function esperadoDoBanco() {
  const jwt = await token('gabriel@republicbt.com.br');
  const { de, ate } = janela();

  const vendas = await tabela(jwt,
    `venda?select=id,quantidade,preco_unit,custo_unit,taxa_pct,comissao_pct`
    + `&data=gte.${de}&data=lte.${ate}`);
  const ids = new Set(vendas.map((v) => v.id));

  const pagamentos = (await tabela(jwt, `pagamento?select=venda_id,valor`))
    .filter((p) => ids.has(p.venda_id));

  /**
   * `fornecedores` fica DE FORA.
   *
   * Comprar raquete não é despesa do resultado: é trocar caixa por estoque. O
   * custo só aparece quando a peça é vendida, e aí ele já está no CMV. Somar os
   * dois conta a mesma mercadoria duas vezes e o lucro despenca todo mês de
   * reposição — no banco de hoje, R$ 14.000 de diferença numa reposição só.
   *
   * No fluxo de caixa a compra entra inteira. São perguntas diferentes: uma é
   * "quanto sobrou", a outra é "quanto saiu da conta".
   */
  const despesas = (await tabela(jwt,
    `despesa?select=valor,categoria&data=gte.${de}&data=lte.${ate}`))
    .filter((d) => d.categoria !== 'fornecedores');

  const soma = (xs, f) => xs.reduce((t, x) => t + f(x), 0);

  const faturamento = soma(vendas, (v) => v.preco_unit * v.quantidade);
  const recebidoPorVenda = new Map();
  for (const p of pagamentos) {
    recebidoPorVenda.set(p.venda_id, (recebidoPorVenda.get(p.venda_id) ?? 0) + Number(p.valor));
  }
  const recebido = soma([...recebidoPorVenda.values()], (x) => x);

  return {
    vendas: vendas.length,
    faturamento,
    cmv: soma(vendas, (v) => v.custo_unit * v.quantidade),
    // A taxa é sobre o valor da venda, com o percentual CONGELADO nela.
    taxas: soma(vendas, (v) => v.preco_unit * v.quantidade * (v.taxa_pct / 100)),
    recebido,
    // Comissão incide sobre o que ENTROU, não sobre o contratado.
    comissao: soma(vendas, (v) =>
      (recebidoPorVenda.get(v.id) ?? 0) * (v.comissao_pct / 100)),
    despesas: soma(despesas, (d) => Number(d.valor)),
  };
}

(async () => {
  const ESPERADO = await esperadoDoBanco();
  const { de, ate } = janela();
  console.log(`janela ${de} a ${ate} · ${ESPERADO.vendas} vendas · `
    + `R$ ${ESPERADO.faturamento.toFixed(2)} faturado\n`);

  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await nav.newPage({ viewport: { width: 1600, height: 1050 } });
  const erros = [];
  pg.on('pageerror', (e) => erros.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  let falhas = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${m}`); if (!c) falhas++; };
  const perto = (a, b, tol = 0.05) => Math.abs(a - b) < tol;
  const num = (s) => Number(String(s).replace(/[^\d,]/g, '').replace(',', '.'));
  const kpi = async (rot) =>
    num(await pg.locator(`[data-kpi="${rot}"]`).getAttribute('data-valor'));

  const entrar = async (email) => {
    await pg.goto('http://localhost:4500/painel', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(1200);
    if (await pg.locator('input[type="email"]').count()) {
      await pg.locator('input[type="email"]').fill(email);
      await pg.locator('input[type="password"]').fill(SENHA);
      await pg.locator('button:has-text("Entrar")').click();
      await pg.waitForTimeout(7000);
    }
  };

  /* ══════════════════════════════════════════════ o sócio vê tudo ═══ */
  await entrar('gabriel@republicbt.com.br');
  ok((await pg.locator('[data-kpi]').count()) > 0, 'o painel abre com dados do banco');

  ok(perto(await kpi('Faturamento'), ESPERADO.faturamento),
     `faturamento bate com o banco: ${ESPERADO.faturamento.toFixed(2)}`);
  ok(perto(await kpi('Recebido no período'), ESPERADO.recebido),
     `recebido bate: ${ESPERADO.recebido.toFixed(2)} — contratado ≠ recebido`);
  ok(perto(await kpi('Comissão a pagar'), ESPERADO.comissao),
     `comissão bate: ${ESPERADO.comissao.toFixed(2)} — calculada sobre o RECEBIDO`);

  const emAberto = await kpi('Em aberto');
  ok(perto(ESPERADO.recebido + emAberto, ESPERADO.faturamento, 1),
     `recebido + em aberto = faturamento (${ESPERADO.recebido.toFixed(2)} + ${emAberto.toFixed(2)})`);

  /**
   * O lucro, decomposto.
   *
   * Usa a taxa CONGELADA da venda. Com a taxa consultada na tabela de hoje o
   * resultado dava R$1.150,08 em vez de R$962,35 — e mudaria de novo no dia em
   * que a maquininha reajustasse, reescrevendo o passado.
   */
  const esperadoLucro = ESPERADO.faturamento - ESPERADO.cmv - ESPERADO.taxas
                      - ESPERADO.despesas - ESPERADO.comissao;
  ok(perto(await kpi('Lucro líquido'), esperadoLucro, 1),
     `lucro = faturamento − CMV − taxa congelada − despesa − comissão = ${esperadoLucro.toFixed(2)}`);

  ok((await kpi('Número de vendas')) === ESPERADO.vendas,
     `número de vendas: ${ESPERADO.vendas}`);

  /* ═════════════════════════════════ o vendedor NÃO vê dinheiro ═══ */
  await pg.context().clearCookies();
  await pg.evaluate(() => localStorage.clear()).catch(() => {});
  await entrar('vendedor@republicbt.com.br');

  const corpo = (await pg.locator('body').textContent()) ?? '';
  ok(!/Fluxo de Caixa/.test(corpo), 'o vendedor não vê o menu de Fluxo de Caixa');
  ok(!/Campanhas/.test(corpo), 'nem o de Campanhas — gasto de mídia é dado de sócio');
  ok(!/Impostos/.test(corpo), 'nem o de Impostos');

  await pg.goto('http://localhost:4500/painel/financeiro', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(2500);
  ok(!/Fluxo de caixa|Contas a pagar/.test((await pg.locator('body').textContent()) ?? ''),
     'e digitando a URL direto também não entra — o gate redireciona');

  ok(erros.length === 0, `sem erro no console${erros.length ? ': ' + erros[0] : ''}`);

  console.log(`\n${falhas === 0
    ? 'O painel bate com o banco, número por número.'
    : `${falhas} falha(s).`}`);
  await nav.close();
  process.exit(falhas === 0 ? 0 : 1);
})();
