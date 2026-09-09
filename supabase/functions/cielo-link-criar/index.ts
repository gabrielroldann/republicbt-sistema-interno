/**
 * CRIAR LINK DE PAGAMENTO NA CIELO A PARTIR DE UM PEDIDO MONTADO NO PAINEL
 *
 * O vendedor escolhe produto(s)/quantidade/cliente (parecido com Nova Venda),
 * a gente grava um `pedido_link` (sem efeito financeiro ainda) e pede pra
 * Cielo criar o link de verdade. O link volta pra tela pra o vendedor copiar
 * e mandar pelo WhatsApp.
 *
 * A `venda` só nasce quando a Cielo confirmar que foi pago (função
 * `cielo-link-notificacao`, do outro lado do webhook) -- esta função aqui
 * não mexe em venda nem estoque.
 *
 * IMPORTANTE: a API do Link de Pagamento não tem Sandbox. As credenciais
 * abaixo são sempre de PRODUÇÃO -- use o "Modo Teste" do site Cielo pra
 * gerar cobranças que não são cobradas de verdade enquanto testamos.
 *
 * Variáveis: CIELO_LINK_CLIENT_ID, CIELO_LINK_CLIENT_SECRET (diferentes das
 *   CIELO_CLIENT_ID/CIELO_ACCESS_TOKEN usadas na maquininha -- são produtos
 *   Cielo distintos, com autenticação distinta),
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticas)
 *
 * Revisado (09/2026) contra a documentação oficial (docs.cielo.com.br/link)
 * junto da reescrita de `cielo-link-notificacao` -- a lógica de
 * `encontrarUrl()` já estava correta: acha o `shortUrl` (link real, voltado
 * pro cliente) antes de qualquer `links[].href` (recurso interno da API, não
 * é o link de pagamento em si). Nenhuma mudança de código, só confirmação.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2.45.4';

const LINK_CLIENT_ID = Deno.env.get('CIELO_LINK_CLIENT_ID') ?? '';
const LINK_CLIENT_SECRET = Deno.env.get('CIELO_LINK_CLIENT_SECRET') ?? '';
const TOKEN_URL = 'https://cieloecommerce.cielo.com.br/api/public/v2/token';
const PRODUCTS_URL = 'https://cieloecommerce.cielo.com.br/api/public/v1/products/';

// Número máximo de parcelas oferecido no link -- não temos uma tela de
// configuração pra isso ainda, então fica fixo aqui. Fácil de virar
// parâmetro no corpo da requisição se um dia precisar variar por venda.
const MAX_PARCELAS = 12;

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const erro = (msg: string, status = 400, detalhe?: unknown) =>
  new Response(JSON.stringify({ error: msg, detalhe }), {
    status, headers: { ...cors, 'content-type': 'application/json' },
  });

/**
 * Código curto que vai pro campo `OrderNumber` da Cielo -- é o elo entre o
 * link e o nosso `pedido_link`. A Cielo exige: só letras/números, até 20
 * caracteres, e pede pra não repetir em menos de 24h -- por isso o timestamp
 * em base36 (muda a cada milissegundo) + 4 caracteres aleatórios.
 */
function gerarOrderNumber(): string {
  const agora = Date.now().toString(36).toUpperCase();
  const aleatorio = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `RBT${agora}${aleatorio}`.slice(0, 20);
}

/** Procura a primeira string que pareça URL em qualquer profundidade do
 * objeto de resposta da Cielo -- feito assim (em vez de um campo fixo tipo
 * `resposta.url`) porque não temos como testar a resposta real sem
 * credenciais de Produção, e a documentação da Cielo não deixa 100% claro
 * o nome exato do campo. Assim que o primeiro link real for gerado, dá pra
 * fixar o campo certo aqui se quiser.
 */
function encontrarUrl(obj: unknown): string | undefined {
  if (typeof obj === 'string') return /^https?:\/\//.test(obj) ? obj : undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) { const r = encontrarUrl(item); if (r) return r; }
    return undefined;
  }
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) { const r = encontrarUrl(v); if (r) return r; }
  }
  return undefined;
}

async function obterToken(): Promise<string> {
  const basic = btoa(`${LINK_CLIENT_ID}:${LINK_CLIENT_SECRET}`);
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
  });
  if (!r.ok) throw new Error(`token: ${r.status} ${await r.text()}`);
  const dados = await r.json();
  return dados.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!LINK_CLIENT_ID || !LINK_CLIENT_SECRET) {
    return erro('CIELO_LINK_CLIENT_ID / CIELO_LINK_CLIENT_SECRET não configurados ainda', 500);
  }

  const auth = req.headers.get('Authorization') ?? '';
  const { data: usuario } = await db.auth.getUser(auth.replace('Bearer ', ''));
  if (!usuario?.user) return erro('não autenticado', 401);

  const { data: vendedor } = await db
    .from('vendedor').select('id').eq('auth_user_id', usuario.user.id)
    .eq('ativo', true).maybeSingle();
  if (!vendedor) return erro('usuário não é um vendedor ativo', 403);

  let corpo: { itens?: { produtoId: string; quantidade: number }[]; clienteId?: string | null };
  try { corpo = await req.json(); } catch { return erro('corpo inválido'); }
  if (!corpo.itens || corpo.itens.length === 0) return erro('itens é obrigatório');

  const produtoIds = corpo.itens.map((i) => i.produtoId);
  const { data: produtos } = await db
    .from('produto').select('id, sku, nome, preco').in('id', produtoIds);
  if (!produtos || produtos.length !== produtoIds.length) {
    return erro('algum produto não foi encontrado', 404);
  }

  const itensCompletos = corpo.itens.map((i) => {
    const produto = produtos.find((p) => p.id === i.produtoId)!;
    return { ...i, sku: produto.sku, nome: produto.nome, precoUnit: Number(produto.preco) };
  });
  const valorTotal = itensCompletos.reduce((soma, i) => soma + i.precoUnit * i.quantidade, 0);
  if (valorTotal <= 0) return erro('valor total precisa ser maior que zero', 422);

  const orderNumber = gerarOrderNumber();

  // 1. grava o pedido_link ANTES de chamar a Cielo -- se a chamada falhar no
  // meio do caminho, sobra um registro 'aberto' que dá pra tentar de novo,
  // em vez de um link fantasma que a Cielo criou mas a gente não sabe de qual
  // pedido é.
  const { data: pedidoLink, error: erroPedido } = await db.from('pedido_link').insert({
    vendedor_id: vendedor.id,
    cliente_id: corpo.clienteId ?? null,
    merchant_order_number: orderNumber,
    valor_total: valorTotal,
  }).select('id').single();
  if (erroPedido || !pedidoLink) return erro('falhou ao gravar o pedido', 500, erroPedido?.message);

  const { error: erroItens } = await db.from('pedido_link_item').insert(
    itensCompletos.map((i) => ({
      pedido_link_id: pedidoLink.id,
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      preco_unit: i.precoUnit,
    })),
  );
  if (erroItens) return erro('falhou ao gravar os itens do pedido', 500, erroItens.message);

  // 2. token + criação do link na Cielo
  let token: string;
  try {
    token = await obterToken();
  } catch (e) {
    return erro('falhou ao autenticar na Cielo (Link de Pagamento)', 502, String(e));
  }

  const nomeProduto = itensCompletos.length === 1
    ? itensCompletos[0].nome
    : `Pedido Republic Beach Tennis (${itensCompletos.length} itens)`;

  const rCriar = await fetch(PRODUCTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      OrderNumber: orderNumber,
      type: 'Payment',
      name: nomeProduto.slice(0, 128),
      price: Math.round(valorTotal * 100),
      maxNumberOfInstallments: MAX_PARCELAS,
      sku: itensCompletos[0].sku?.slice(0, 32),
    }),
  });
  const corpoResposta = await rCriar.json().catch(() => ({}));

  if (!rCriar.ok) {
    return erro('Cielo recusou criar o link de pagamento', 502, corpoResposta);
  }

  const linkUrl = encontrarUrl(corpoResposta);
  const linkId = (corpoResposta as { id?: string }).id ?? null;

  await db.from('pedido_link').update({
    status: 'enviado',
    link_id: linkId,
    link_url: linkUrl ?? null,
    atualizado_em: new Date().toISOString(),
  }).eq('id', pedidoLink.id);

  if (!linkUrl) {
    // Não travar a operação por isto -- o link pode ter sido criado mesmo
    // assim. Devolve a resposta crua da Cielo pra investigar o campo certo.
    return new Response(JSON.stringify({
      ok: true, pedidoLinkId: pedidoLink.id, linkUrl: null,
      aviso: 'link criado mas não consegui identificar a URL na resposta da Cielo -- confira `respostaCrua`',
      respostaCrua: corpoResposta,
    }), { headers: { ...cors, 'content-type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true, pedidoLinkId: pedidoLink.id, linkUrl, orderNumber }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});
