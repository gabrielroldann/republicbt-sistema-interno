/**
 * CONFIRMAR PAGAMENTO NA CIELO E GRAVAR A VENDA DE VERDADE
 *
 * Sem webhook cadastrado ainda (precisa contato manual com o suporte Cielo),
 * o jeito de saber que o cliente pagou é consultar o pedido (`GET /orders/{id}`).
 * Só quando o status vier `PAID` é que gravamos a `venda` — com `service_role`,
 * nunca com a sessão do vendedor, porque a RLS de `venda` só deixa gestor
 * inserir. Essa função é o único jeito de um vendedor fazer uma venda "nascer"
 * sozinho, e só acontece quando existe pagamento confirmado por trás.
 *
 * A NFC-e sai na hora, logo depois de gravar cada linha da venda — chamando a
 * Edge Function `focus-nfe-emitir` (mesma que a tela de Nova Venda usa, pra
 * não duplicar a lógica de montar o XML em dois lugares). Se a nota falhar,
 * NÃO desfaz a venda: ela já está paga e o estoque já baixou, a nota fica
 * pendente (`status_nfe`) pra reemitir depois.
 *
 * INTEGRAÇÃO DOS MEIOS DE PAGAMENTO (IN SEFAZ-CE 87/2025): é AQUI, e só
 * aqui, que a venda ganha `autorizacao_cartao`/`terminal_pagamento` — é o que
 * faz a nota sair com `tipo_integracao=1` em `focus-nfe-emitir`. Uma venda
 * gravada por qualquer outro caminho (a tela manual "Nova Venda") nunca tem
 * esses dados, porque não veio de uma consulta real à Cielo — e não tem como
 * ter: a norma exige o dado vir do sistema, não de alguém digitando um
 * número que leu no comprovante.
 *
 * PIX — ATENÇÃO, AINDA NÃO TESTADO DE VERDADE: o simulador de Sandbox
 * (`cielo-simular-pagamento`) só cobre CRÉDITO; nunca rodamos um PIX de
 * ponta a ponta pela Order Management da Cielo. A documentação pública da
 * Cielo (fora desta API específica) usa `end_to_end_id`/`EndToEndId` como o
 * identificador de um PIX pago — por isso a captura abaixo tenta os dois
 * nomes possíveis. Antes de confiar nisso em produção, bater um PIX de
 * verdade e conferir se `venda.autorizacao_cartao` saiu preenchido.
 *
 * CORREÇÃO (09/2026): `formaPagamentoDe`/`parcelas` liam `t.payment_fields`,
 * campo que nunca aparece na doc oficial da Cielo nem no que a própria
 * `cielo-simular-pagamento` envia (`payment_product`, conferido contra a
 * doc). Como `primario` sempre vinha `''`, TODA venda da maquininha saía
 * classificada como "crédito à vista" — inclusive débito e Pix — com taxa
 * errada e, mais grave, `tPag` errado na NFC-e. Corrigido para
 * `payment_product`. Ainda não confirmado contra uma resposta real da
 * Cielo (Sandbox de simulação fora do ar desde 02/09) — testar assim que
 * possível.
 *
 * Variáveis: CIELO_CLIENT_ID, CIELO_ACCESS_TOKEN, CIELO_MERCHANT_ID,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticas)
 */
import { createClient } from 'jsr:@supabase/supabase-js@2.45.4';

const CLIENT_ID    = Deno.env.get('CIELO_CLIENT_ID') ?? '';
const ACCESS_TOKEN  = Deno.env.get('CIELO_ACCESS_TOKEN') ?? '';
const MERCHANT_ID   = Deno.env.get('CIELO_MERCHANT_ID') ?? '';
const BASE_URL = 'https://api.cielo.com.br/sandbox-lio/order-management/v1';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

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

/** Espelha FORMAS_PAGAMENTO de painel/types.ts -- se mudar lá, muda aqui. */
const TAXAS: Record<string, number> = {
  pix: 0.99, debito: 1.99, credito: 3.49, credito_parcelado: 5.49, dinheiro: 0,
};

function formaPagamentoDe(t: any): string {
  const primario = t?.payment_product?.primary_product_name ?? '';
  const secundario = t?.payment_product?.secondary_product_name ?? '';
  if (primario === 'PIX') return 'pix';
  if (primario === 'DEBITO') return 'debito';
  if (primario === 'CREDITO') {
    return secundario === 'A VISTA' ? 'credito' : 'credito_parcelado';
  }
  return 'credito'; // fallback conservador -- nunca deixa sem forma de pagamento
}

/**
 * O identificador da transação que vale como "número de autorização" pra
 * SEFAZ (cAut) — em cartão é `authorization_code`; em PIX, pelo que a
 * documentação pública da Cielo indica, pode vir como `end_to_end_id` ou
 * `EndToEndId`. Nunca testamos um PIX de verdade nesta API específica (ver
 * comentário no topo do arquivo), por isso os três nomes como fallback.
 */
function autorizacaoDe(t: any): string {
  return String(t?.authorization_code ?? t?.end_to_end_id ?? t?.EndToEndId ?? '');
}

/**
 * Chama a Edge Function que já sabe montar e mandar a NFC-e pra Focus NFe.
 * Best-effort: erro aqui vira `nota.ok = false` na resposta, nunca derruba a
 * confirmação da venda (que já aconteceu e não deve ser desfeita).
 */
async function emitirNotaFiscal(vendaId: string): Promise<{ ok: boolean; chave?: string; mensagem?: string }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/focus-nfe-emitir`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ vendaId, ambiente: 'homologacao' }),
    });
    const dados = await r.json().catch(() => null);
    if (dados?.resposta?.status === 'autorizado') {
      return { ok: true, chave: dados.resposta.chave_nfe };
    }
    return { ok: false, mensagem: dados?.resposta?.mensagem_sefaz ?? dados?.erro ?? 'falha desconhecida' };
  } catch (e) {
    return { ok: false, mensagem: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const auth = req.headers.get('Authorization') ?? '';
  const { data: usuario } = await db.auth.getUser(auth.replace('Bearer ', ''));
  if (!usuario?.user) return erro('não autenticado', 401);

  const { data: vendedor } = await db
    .from('vendedor').select('id, comissao_pct').eq('auth_user_id', usuario.user.id)
    .eq('ativo', true).maybeSingle();
  if (!vendedor) return erro('usuário não é um vendedor ativo', 403);

  let corpo: { carrinhoId?: string };
  try { corpo = await req.json(); } catch { return erro('corpo inválido'); }
  if (!corpo.carrinhoId) return erro('carrinhoId é obrigatório');

  const { data: carrinho } = await db
    .from('carrinho').select('id, vendedor_id, status, cielo_order_id, cliente_id')
    .eq('id', corpo.carrinhoId).maybeSingle();

  if (!carrinho) return erro('carrinho não encontrado', 404);
  if (carrinho.vendedor_id !== vendedor.id) return erro('esse carrinho não é seu', 403);
  if (carrinho.status === 'pago') return erro('esse carrinho já foi convertido em venda', 409);
  if (carrinho.status !== 'enviado_para_maquininha' || !carrinho.cielo_order_id) {
    return erro('esse carrinho ainda não foi enviado pra maquininha', 409);
  }

  // 1. consulta o pedido na Cielo
  const rPedido = await fetch(`${BASE_URL}/orders/${carrinho.cielo_order_id}`, {
    headers: headersCielo(),
  });
  if (!rPedido.ok) {
    const detalhe = await rPedido.json().catch(() => ({}));
    return erro('não consegui consultar o pedido na Cielo', 502, detalhe);
  }
  const pedido = await rPedido.json();

  if (pedido.status !== 'PAID') {
    return new Response(JSON.stringify({ ok: false, status: pedido.status }), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const transacao = (pedido.transactions ?? []).find((t: any) => t.transaction_type === 'PAYMENT')
    ?? (pedido.transactions ?? [])[0];
  if (!transacao) return erro('pedido pago mas sem transação encontrada -- avise o suporte', 500, pedido);

  const formaPagamento = formaPagamentoDe(transacao);
  const taxaPct = TAXAS[formaPagamento] ?? 0;
  const parcelas = Number(transacao?.payment_product?.number_of_quotas ?? 0) || 1;

  // 2. itens do carrinho, com dados do produto (custo congelado agora)
  const { data: itens } = await db
    .from('carrinho_item')
    .select('quantidade, preco_unit, produto:produto_id (id, custo)')
    .eq('carrinho_id', carrinho.id);

  if (!itens || itens.length === 0) return erro('carrinho sem itens', 422);

  const hoje = new Date().toISOString().slice(0, 10);
  const vendaIds: string[] = [];

  for (const item of itens) {
    const produto = item.produto as unknown as { id: string; custo: number };

    const { data: venda, error: erroVenda } = await db.from('venda').insert({
      data: hoje,
      produto_id: produto.id,
      vendedor_id: vendedor.id,
      cliente_id: carrinho.cliente_id,
      quantidade: item.quantidade,
      preco_unit: item.preco_unit,
      custo_unit: produto.custo,
      forma_pagamento: formaPagamento,
      parcelas,
      taxa_pct: taxaPct,
      comissao_pct: vendedor.comissao_pct ?? 0,
      entrega: 'entregue',
      canal: 'presencial',
      tipo_entrega: 'retirada',
      carrinho_id: carrinho.id,
      autorizacao_cartao: autorizacaoDe(transacao),
      terminal_pagamento: String(transacao.terminal_number ?? ''),
      id_transacao_cielo: String(transacao.id ?? transacao.external_id ?? ''),
      status_nfe: 'pendente',
      observacoes: `Venda via maquininha (Cielo) — pedido ${carrinho.cielo_order_id}`,
    }).select('id').single();

    if (erroVenda || !venda) {
      return erro('falhou ao gravar uma das linhas da venda', 500, erroVenda?.message);
    }

    await db.from('movimento_estoque').insert({
      produto_id: produto.id,
      quantidade: -item.quantidade,
      tipo: 'venda',
      custo_unit: produto.custo,
      venda_id: venda.id,
    });

    await db.from('pagamento').insert({
      venda_id: venda.id,
      data: hoje,
      valor: item.preco_unit * item.quantidade,
      forma: formaPagamento,
    });

    vendaIds.push(venda.id as string);
  }

  await db.from('carrinho')
    .update({ status: 'pago', atualizado_em: new Date().toISOString() })
    .eq('id', carrinho.id);

  // 3. emite a NFC-e de cada linha -- em paralelo, best-effort
  const notas = await Promise.all(vendaIds.map((id) => emitirNotaFiscal(id)));

  return new Response(JSON.stringify({ ok: true, vendaIds, notas }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});
