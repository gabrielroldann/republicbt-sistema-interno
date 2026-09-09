/**
 * SIMULAR PAGAMENTO — só existe porque estamos em Sandbox.
 *
 * Em Produção a Cielo cria a transação sozinha assim que o cliente passa o
 * cartão na maquininha de verdade. Em Sandbox não existe maquininha nenhuma
 * recebendo o pedido — por isso a própria documentação da Cielo Smart tem um
 * endpoint (`POST /orders/{id}/transactions`) só pra simular esse pagamento
 * manualmente, e diz explicitamente: "Recurso utilizado somente para
 * Ambiente de Sandbox".
 *
 * ATENÇÃO — status em 02/09/2026: este endpoint da Cielo está devolvendo
 * 500 (erro interno DELES) pra qualquer corpo de requisição testado, mesmo
 * seguindo exatamente a Entidade "Payment product" documentada
 * (`payment_product.primary_product_name/secondary_product_name/number_of_quotas`).
 * A validação de campo obrigatório passa a aceitar `payment_product`, então
 * o nome do campo está certo — o 500 acontece depois disso, dentro do
 * processamento deles. Deixado assim de propósito: se a Cielo consertar o
 * Sandbox, isso passa a funcionar sem eu precisar tocar aqui de novo.
 *
 * Esta função faz os dois passos que, numa loja de verdade, a maquininha
 * faria sozinha: registra a transação simulada e muda o pedido para PAY.
 * Depois disso, `cielo-confirmar-venda` funciona exatamente igual ao fluxo
 * real (ela só olha o status do pedido, não sabe se foi maquininha ou
 * simulação).
 *
 * ESTA FUNÇÃO NÃO TEM LUGAR EM PRODUÇÃO — quando o Merchant ID de produção
 * chegar, o BASE_URL das outras funções muda para lá e esta aqui deixa de
 * fazer sentido (o recurso só existe no Sandbox).
 *
 * Variáveis: CIELO_CLIENT_ID, CIELO_ACCESS_TOKEN, CIELO_MERCHANT_ID,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticas)
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CLIENT_ID   = Deno.env.get('CIELO_CLIENT_ID') ?? '';
const ACCESS_TOKEN = Deno.env.get('CIELO_ACCESS_TOKEN') ?? '';
const MERCHANT_ID  = Deno.env.get('CIELO_MERCHANT_ID') ?? '';
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

function numeroAleatorio(digitos: number) {
  return String(Math.floor(Math.random() * 10 ** digitos)).padStart(digitos, '0');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

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
    .from('carrinho').select('id, vendedor_id, status, cielo_order_id')
    .eq('id', corpo.carrinhoId).maybeSingle();

  if (!carrinho) return erro('carrinho não encontrado', 404);
  if (carrinho.vendedor_id !== vendedor.id) return erro('esse carrinho não é seu', 403);
  if (carrinho.status !== 'enviado_para_maquininha' || !carrinho.cielo_order_id) {
    return erro(`carrinho precisa estar 'enviado_para_maquininha' (está '${carrinho.status}')`, 409);
  }

  const pedidoId = carrinho.cielo_order_id as string;

  const { data: itens } = await db
    .from('carrinho_item').select('quantidade, preco_unit').eq('carrinho_id', carrinho.id);
  const precoTotal = (itens ?? []).reduce(
    (soma, i) => soma + Math.round(Number(i.preco_unit) * 100) * i.quantidade, 0,
  );

  // 1. simula a transação (só existe em Sandbox — ver comentário do topo)
  const rTransacao = await fetch(`${BASE_URL}/orders/${pedidoId}/transactions`, {
    method: 'POST',
    headers: headersCielo(),
    body: JSON.stringify({
      id: crypto.randomUUID(),
      external_id: pedidoId,
      status: 'CONFIRMED',
      terminal_number: '00000001',
      authorization_code: numeroAleatorio(6),
      number: numeroAleatorio(8),
      amount: precoTotal,
      transaction_type: 'PAYMENT',
      payment_product: {
        primary_product_name: 'CREDITO',
        secondary_product_name: 'A VISTA',
        number_of_quotas: 0,
      },
    }),
  });
  if (!rTransacao.ok) {
    const detalheTexto = await rTransacao.text().catch(() => '');
    return erro('Cielo recusou simular a transação (endpoint de Sandbox deles, fora do nosso controle)', 502, { status: rTransacao.status, corpo: detalheTexto });
  }

  // 2. muda o pedido pra pago — sem isso `GET /orders/{id}` continua mostrando ENTERED
  const rPagar = await fetch(`${BASE_URL}/orders/${pedidoId}?operation=PAY`, {
    method: 'PUT',
    headers: headersCielo(),
  });
  if (!rPagar.ok) {
    const corpoErro = await rPagar.json().catch(() => ({}));
    return erro('transação simulada mas a Cielo recusou marcar como paga', 502, corpoErro);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});
