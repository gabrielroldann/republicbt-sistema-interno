/**
 * CONTRASTE DO BOTÃO PRIMÁRIO, NOS TRÊS TEMAS.
 *
 * Existe por causa de um bug que ficou meses invisível: o `tailwind-merge` não
 * sabia que `text-body` é um TAMANHO de fonte e o tratava como COR, então
 * descartava `text-ongold` por "conflito". O botão de ação primária ficava com
 * o cinza herdado do corpo sobre o ouro — 1,5:1 de contraste, contra os 4,5:1
 * que texto exige.
 *
 * Ninguém percebeu no navy e no escuro porque o cinza-claro sobre ouro ainda
 * dá para ler mal e mal. Só apareceu no tema claro, onde o ouro escurece.
 *
 * O teste MEDE a cor computada e calcula o contraste WCAG. Conferir se a classe
 * está no HTML não bastaria: o que importa é o que o navegador pinta.
 *
 *   npm run servidor-teste      (num terminal)
 *   node teste-contraste.cjs    (no outro)
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

/** Luminância relativa, fórmula da WCAG 2.1. */
const luminancia = (rgb) => {
  const s = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};

const contraste = (a, b) => {
  const [l1, l2] = [luminancia(a), luminancia(b)];
  const [claro, escuro] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (escuro + 0.05);
};

const rgb = (css) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

/** 4,5:1 é o mínimo da WCAG AA para texto normal. */
const MINIMO = 4.5;

(async () => {
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await nav.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  pg.on('pageerror', (e) => erros.push(String(e)));

  let falhas = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${m}`); if (!c) falhas++; };

  await pg.goto('http://localhost:4501/crm', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1200);
  if (await pg.locator('input[type="email"]').count()) {
    await pg.locator('input[type="email"]').fill('gabriel@republicbt.com.br');
    await pg.locator('input[type="password"]').fill(SENHA);
    await pg.locator('button:has-text("Entrar")').click();
    await pg.waitForTimeout(4500);
  }

  /**
   * As medições precisam ser DIFERENTES entre os temas.
   *
   * Na primeira versão deste teste os três deram exatamente a mesma cor e ele
   * passou — porque o tema não estava trocando, e eu medi o navy três vezes.
   * Um teste que passa sem exercitar o que promete é pior que um que falha.
   */
  const vistos = new Set();

  for (const tema of ['navy', 'dark', 'light']) {
    // NUM SISTEMA SÓ, O TEMA TAMBÉM É SÓ UM.
    //
    // Quando eram dois apps, cada um guardava o seu: `republicbt:tema` e
    // `republicbt:crm:tema`. Trocar para claro no painel e continuar escuro ao
    // pular para o CRM não é preferência, é a mesma pessoa vendo duas
    // aparências dentro do que ela entende como um sistema. Chave única.
    // Uma armadilha que já caiu aqui: na primeira versão usei a chave do outro
    // app e os três temas mediram a MESMA cor — o teste passava sem verificar
    // nada. Por isso as checagens abaixo exigem que `html[data-tema]` mude de
    // verdade e que as cores saiam distintas.
    //
    // O id vai como TEXTO SIMPLES, não JSON.
    await pg.evaluate((t) => localStorage.setItem('republicbt:tema', t), tema);
    await pg.reload({ waitUntil: 'networkidle' });
    await pg.waitForTimeout(3500);

    const medido = await pg.evaluate(() => {
      const b = document.querySelector('aside button');   // "Novo lead"
      if (!b) return null;
      const s = getComputedStyle(b);
      return {
        fg: s.color, bg: s.backgroundColor,
        temOngold: b.className.includes('text-ongold'),
        aplicado: document.documentElement.getAttribute('data-tema'),
      };
    });

    if (!medido) { ok(false, `${tema}: botão primário não encontrado`); continue; }

    ok(medido.aplicado === tema,
       `${tema}: o tema realmente trocou (html data-tema="${medido.aplicado}")`);

    const r = contraste(rgb(medido.fg), rgb(medido.bg));
    ok(medido.temOngold,
       `${tema}: o botão mantém a classe text-ongold (o merge não a descartou)`);
    ok(r >= MINIMO,
       `${tema}: contraste ${r.toFixed(2)}:1 — mínimo ${MINIMO}:1 ` +
       `(${medido.fg} sobre ${medido.bg})`);

    vistos.add(`${medido.fg}|${medido.bg}`);
  }

  ok(vistos.size >= 2,
     `os temas produzem cores diferentes de verdade (${vistos.size} combinações distintas)`);

  ok(erros.length === 0, `sem erro no console${erros.length ? ': ' + erros[0] : ''}`);

  console.log(`\n${falhas === 0
    ? 'O botão primário é legível nos três temas.'
    : `${falhas} falha(s).`}`);
  await nav.close();
  process.exit(falhas === 0 ? 0 : 1);
})();
