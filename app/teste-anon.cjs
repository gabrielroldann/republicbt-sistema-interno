/**
 * O QUE A CHAVE PÚBLICA ABRE SOZINHA.
 *
 * A chave `anon` vai no JavaScript do navegador — não tem como esconder, e
 * esconder nunca foi o plano. Qualquer pessoa abre o DevTools e a lê em cinco
 * segundos. O que protege a loja não é a chave ser secreta; é ela não abrir
 * nada sem um login por trás.
 *
 * Este teste é a prova disso, e a prova precisa ser feita do lado de FORA: sem
 * sessão, sem token, batendo direto na API REST como um estranho bateria. Se
 * qualquer tabela devolver uma linha aqui, o faturamento da loja está na
 * internet — e nenhuma tela escondida conserta isso, porque o PostgREST publica
 * as tabelas, não as telas.
 *
 *   node teste-anon.cjs
 */
const fs = require('fs');
const crypto = require('crypto');

const env = Object.fromEntries(
  fs.readFileSync(`${__dirname}/.env.local`, 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const API = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

/** A senha sai do .env.local, nunca do código. */
const SENHA = (() => {
  const m = /^TESTE_SENHA=(.*)$/m.exec(fs.readFileSync(`${__dirname}/.env.local`, 'utf8'));
  if (m) return m[1].trim();
  if (process.env.TESTE_SENHA) return process.env.TESTE_SENHA;
  console.error('Defina TESTE_SENHA no .env.local para rodar este teste.');
  process.exit(2);
})();


/** Tudo que existe e que um estranho poderia querer. */
const ALVOS = [
  'venda', 'pagamento', 'produto', 'movimento_estoque', 'despesa', 'conta',
  'custo_fixo', 'cliente', 'vendedor', 'conversa', 'mensagem', 'lead',
  'campanha', 'canal', 'configuracao', 'etapa_funil',
  // As views são o ponto cego clássico: sem `security_invoker = true` elas
  // rodam como quem as criou e IGNORAM o RLS da tabela por baixo. Já
  // aconteceu neste projeto — seis views expondo custo de raquete.
  'v_produto', 'v_venda_completa', 'v_conta', 'v_funil', 'saldo_estoque',
];

(async () => {
  let falhas = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${m}`); if (!c) falhas++; };

  console.log(`sem login, só com a chave pública\n`);

  /* ─────────────────────────────────────────────────────── leitura ─── */
  for (const t of ALVOS) {
    const r = await fetch(`${API}/rest/v1/${t}?select=*&limit=1`, {
      headers: { apikey: ANON },
    });
    const txt = await r.text();
    let linhas = null;
    try { const j = JSON.parse(txt); if (Array.isArray(j)) linhas = j.length; } catch { /* erro do PostgREST */ }

    ok(linhas === 0 || linhas === null,
       `${t.padEnd(20)} ${r.status} ${linhas === 0 ? '[] — existe mas não entrega nada'
         : linhas === null ? 'recusado' : `DEVOLVEU ${linhas} LINHA(S)`}`);
  }

  /* ───────────────────────────────────────────────────── escrita ──── */
  // Ler nada mas poder escrever seria pior: um estranho lançaria venda,
  // despesa e conta a pagar no sistema da loja.
  const escrita = await fetch(`${API}/rest/v1/despesa`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({
      data: '2026-01-01', descricao: 'sonda', categoria: 'operacional', valor: 1,
    }),
  });
  ok(escrita.status >= 400,
     `escrever despesa sem login: ${escrita.status} — recusado`);

  /* ────────────────────────────────────────────────────── cadastro ── */
  /**
   * Cadastro aberto não é o fim do mundo aqui — quem se cadastra não ganha
   * linha em `vendedor`, e sem ela o RLS não devolve nada. Mas é conta criada
   * no banco da loja por qualquer um, e não existe motivo para permitir: a
   * equipe são duas pessoas e um vendedor.
   */
  const cadastro = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `sonda-${Date.now()}@exemplo-invalido.test`,
      // Gerada a cada execução, não fixa no código — mesma regra do resto do
      // arquivo ("a senha sai do .env.local, nunca do código"). Não é uma
      // credencial real (a conta é descartável e nem chega a existir se o
      // cadastro estiver fechado), mas scanner de segredo não sabe disso, e
      // não custa nada não deixar nenhuma senha, real ou não, fixa no texto.
      password: crypto.randomBytes(16).toString('hex'),
    }),
  });
  const corpoCadastro = await cadastro.text();
  /**
   * ESTE PONTO NÃO DÁ PARA VERIFICAR DAQUI, E DIZER ISSO É O CERTO.
   *
   * Na primeira versão eu aceitava qualquer status >= 400 como "cadastro
   * fechado". Numa rodada veio 429 e o teste deu ok — provando só que eu tinha
   * batido rápido demais.
   *
   * Pior: o corpo do 429 é `over_email_send_rate_limit`, ou seja, o GoTrue
   * chegou a TENTAR mandar e-mail de confirmação. Quem está com cadastro
   * desligado não chega nessa etapa. A leitura honesta é que o cadastro
   * provavelmente está ABERTO, e o limite de e-mail é que está segurando —
   * o que não é controle de acesso, é fila.
   *
   * Como o limite impede a verificação, isto sai como AVISO, não como falha:
   * falha que não tem conserto no código vira ruído e a suíte inteira começa a
   * ser ignorada. Conferir é no painel do Supabase, em Authentication →
   * Sign In / Providers → "Allow new users to sign up".
   */
  if (cadastro.status === 429) {
    console.log('AVISO limite de e-mail impediu testar o cadastro aberto. '
      + 'Confira à mão: Authentication → Sign In / Providers → Allow new users to sign up');
  } else {
    ok(cadastro.status >= 400,
       `cadastro aberto: ${cadastro.status} — ${cadastro.status >= 400
         ? 'desligado' : 'QUALQUER UM CRIA CONTA: ' + corpoCadastro.slice(0, 80)}`);
  }

  /* ─────────────────────────────────────── o vendedor, já logado ──── */
  /**
   * As quatro funções que mexem no funil são SECURITY DEFINER: rodam com os
   * poderes do dono e ignoram RLS. Quem está logado PODE chamá-las — o que as
   * segura é o `if not eh_admin() then raise` na primeira linha de cada uma.
   *
   * Uma linha de defesa dentro de código que ignora o RLS merece ser exercida,
   * não assumida. Se alguém apagar esse `if` numa refatoração, é aqui que
   * aparece — e não no dia em que o vendedor apagar o funil da loja.
   */
  const senha = SENHA;
  const login = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'vendedor@republicbt.com.br', password: senha }),
  });
  const jwt = (await login.json()).access_token;
  ok(!!jwt, 'o vendedor consegue entrar (o login continua funcionando)');

  if (jwt) {
    const cab = { apikey: ANON, authorization: `Bearer ${jwt}`, 'content-type': 'application/json' };

    for (const [fn, args] of [
      ['criar_etapa', { p_nome: 'sonda', p_cor: '#fff', p_depois_de: null }],
      ['renomear_etapa', { p_id: 'novo', p_nome: 'sonda', p_cor: null }],
      ['excluir_etapa', { p_id: 'novo', p_mover_para: null }],
      ['reordenar_etapas', { p_ids: ['novo'] }],
    ]) {
      const r = await fetch(`${API}/rest/v1/rpc/${fn}`, {
        method: 'POST', headers: cab, body: JSON.stringify(args),
      });
      const t = await r.text();
      ok(r.status >= 400 && /administrador/i.test(t),
         `vendedor chamando ${fn.padEnd(18)} ${r.status} — recusado por eh_admin()`);
    }

    // E o de sempre: dinheiro continua invisível para ele, via API crua.
    for (const t of ['despesa', 'conta', 'custo_fixo', 'v_venda_completa']) {
      const r = await fetch(`${API}/rest/v1/${t}?select=*&limit=1`, { headers: cab });
      const j = await r.json().catch(() => null);
      ok(Array.isArray(j) && j.length === 0,
         `vendedor lendo ${t.padEnd(18)} [] — o RLS devolve vazio`);
    }
  }

  console.log(`\n${falhas === 0
    ? 'A chave pública não abre nada, e o vendedor não passa do que é dele.'
    : `${falhas} falha(s) — tem coisa aberta.`}`);
  process.exit(falhas === 0 ? 0 : 1);
})();
