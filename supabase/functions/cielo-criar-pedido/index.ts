/**
 * CRIAR PEDIDO NA CIELO A PARTIR DO CARRINHO
 *
 * O vendedor monta o carrinho sozinho (tabela `carrinho`/`carrinho_item`, sem
 * efeito financeiro). Esta função é o momento em que isso vira um PEDIDO de
 * verdade na Cielo Smart: cria a Order com os itens, e libera pra pagamento
 * (`operation=PLACE`) — aí ela aparece na maquininha pro cliente pagar.
 *
 * A `venda` só nasce depois, quando o pagamento for confirmado (outra
 * função) — esta aqui só cria o pedido, não grava nada financeiro.
 *
 * Variáveis: CIELO_CLIENT_ID, CIELO_ACCESS_TOKEN, CIELO_MERCHANT_ID,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticas)
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CLIENT_ID   = Deno.env.get('CIELO_CLIENT_ID') ?? '';
const ACCESS_TOKEN = Deno.env.get('CIELO_ACCESS_TOKEN') ?? '';
const MERCHANT_ID  = Deno.env.get('CIELO_MERCHANT_ID') ?? '';
// Ambiente Sandbox por enquanto — troca pra produção quando tivermos o
// Merchant ID de produção (pedido feito por e-mail à Cielo, ainda pendente).
const BASE_URL = 'https://api.cielo.com.br/sandbox-lio/order-management/v1';

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

function headersCielo() {
  return {
    'client-id': CLIENT_ID,
    'access-token': ACCESS_TOKEN,
    'merchant-id': MERCHANT_ID,
    'content-type': 'application/json',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Mesmo padrão do enviar-whatsapp: a função roda com service_role (ignora
  // RLS), então confere o usuário na mão antes de mexer em qualquer coisa.
  const auth = req.headers.get('Authorization') ?? '';
  const { data: usuario } = await db.auth.getUser(auth.replace('Bearer ', ''));
  if (!usuario?.user) return erro('não autenticado', 401);

  const { data: vendedor } = await db
    .from('vendedor').select('id').eq('auth_user_id', usuario.user.id)
    .eq('ativo', true).maybeSingle();
  if (!vendedor) return erro('usuário não é um vendedor ativo', 403);

  let corpo: { carrinhoId?: string };
  try { corpo = await req.json(); } catch { return erro('corpo inválido'); }
  if (!corpo.carrinhoId) return erro('carrinhoId é obrigatório');

  const { data: carrinho } = await db
    .from('carrinho').select('id, vendedor_id, status')
    .eq('id', corpo.carrinhoId).maybeSingle();

  if (!carrinho) return erro('carrinho não encontrado', 404);
  if (carrinho.vendedor_id !== vendedor.id) return erro('esse carrinho não é seu', 403);
  if (carrinho.status !== 'aberto') return erro(`carrinho já está em status '${carrinho.status}'`, 409);

  const { data: itens } = await db
    .from('carrinho_item')
    .select('quantidade, preco_unit, produto:produto_id (sku, nome)')
    .eq('carrinho_id', carrinho.id);

  if (!itens || itens.length === 0) return erro('carrinho vazio', 422);

  const itensCielo = itens.map((i) => {
    const produto = i.produto as unknown as { sku: string; nome: string };
    return {
      sku: produto.sku,
      name: produto.nome,
      unit_price: String(Math.round(Number(i.preco_unit) * 100)),
      quantity: String(i.quantidade),
      unity_of_measure: 'EACH',
    };
  });

  const precoTotal = itens.reduce(
    (soma, i) => soma + Math.round(Number(i.preco_unit) * 100) * i.quantidade, 0,
  );

  // 1. cria o pedido já com os itens
  const rCriar = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: headersCielo(),
    body: JSON.stringify({
      reference: carrinho.id,
      status: 'DRAFT',
      price: String(precoTotal),
      items: itensCielo,
      transactions: [],
    }),
  });
  const corpoCriar = await rCriar.json().catch(() => ({}));
  if (!rCriar.ok) return erro('Cielo recusou criar o pedido', 502, corpoCriar);

  const pedidoId = corpoCriar.id as string;

  // 2. libera pra pagamento -- é isso que faz aparecer na maquininha
  const rLiberar = await fetch(`${BASE_URL}/orders/${pedidoId}?operation=PLACE`, {
    method: 'PUT',
    headers: headersCielo(),
  });
  if (!rLiberar.ok) {
    const corpoErro = await rLiberar.json().catch(() => ({}));
    return erro('pedido criado mas a Cielo recusou liberar pra pagamento', 502, corpoErro);
  }

  await db.from('carrinho')
    .update({ status: 'enviado_para_maquininha', cielo_order_id: pedidoId, atualizado_em: new Date().toISOString() })
    .eq('id', carrinho.id);

  return new Response(JSON.stringify({ ok: true, pedidoId }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});
