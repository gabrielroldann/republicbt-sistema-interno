/**
 * RECEBER O WEBHOOK DO LINK DE PAGAMENTO (URL de Mudança de Status /
 * URL de Notificação) E, SE REALMENTE PAGO, GRAVAR A VENDA E EMITIR A NOTA.
 *
 * A Cielo documenta explicitamente que essas URLs NÃO TÊM autenticação
 * nenhuma (nem header customizado, no caso do Link de Pagamento) -- qualquer
 * um que descubra este endereço pode mandar um POST fingindo que um pedido
 * foi pago. Por isso esta função NUNCA confia no conteúdo do POST pra
 * decidir se a venda acontece: ele só serve pra saber QUAL pedido consultar.
 * A confirmação de verdade vem de uma chamada de volta pra API da Cielo
 * (Consultar transação), autenticada com nossas credenciais.
 *
 * Tudo que chega aqui é gravado em `evento_webhook` (origem='cielo_link')
 * antes de mais nada -- útil pra depurar o formato exato da primeira
 * notificação real, já que a documentação da Cielo não deixa 100% claro
 * todos os nomes de campo.
 *
 * Sempre responde 200: a Cielo reenvia (3x, de 1h em 1h) se não receber 200,
 * e reenviar não ajuda quando o problema é "não achei o pedido" -- fica
 * registrado em `evento_webhook.erro` pra investigar manualmente.
 *
 * IMPORTANTE (IN 87/2025): o campo `autorizacao_cartao` da `venda` é o que
 * `focus-nfe-emitir` usa pra decidir se preenche os campos de vinculação
 * pagamento-nota (CNPJ da credenciadora, código de autorização). Aqui
 * sempre preenchemos com algo -- o código de autorização real se a consulta
 * trouxer um, senão o próprio `checkout_cielo_order_number` -- porque todo
 * pagamento por Link de Pagamento tem um identificador único por transação
 * (não é "Pix estático"), logo cai na obrigatoriedade de vinculação
 * automática da norma -- nunca deixar essa venda sem o campo, ou a nota sai
 * sem o vínculo que a Sefaz espera encontrar.
 *
 * CORREÇÃO (09/2026) -- conferido contra a documentação oficial da Cielo
 * (docs.cielo.com.br/link/reference), não mais só heurística às cegas:
 *
 *   1. `GET /v2/merchantOrderNumber/{numero}` devolve um ARRAY de
 *      `{ checkoutOrderNumber, createdDate, links }` -- o campo é
 *      `checkoutOrderNumber` (sem "cielo" no meio!), diferente do
 *      `checkout_cielo_order_number` que aparece nas notificações. O código
 *      antigo procurava só `checkoutcieloordernumber` normalizado e NUNCA
 *      batia com esse campo -- toda venda que dependesse desse fallback
 *      (quando a notificação não trazia o identificador direto) ficava sem
 *      resolver o pedido, e a venda nunca nascia. Também pode haver mais de
 *      um item no array (pedido pago em mais de uma tentativa) -- agora
 *      consulta cada um e prioriza o que estiver `Paid`.
 *   2. `GET /v2/orders/{checkout_cielo_order_number}` devolve
 *      `payment.type` como texto exato (`"CreditCard"`, `"DebitCard"`,
 *      `"Pix"`, `"QrCode"`, `"QrCodeDebit"`, `"Boleto"`...) e
 *      `payment.numberOfPayments` como número -- lidos direto agora, com a
 *      varredura de texto antiga (`adivinharFormaPagamento`) só como rede de
 *      segurança se por algum motivo o campo não vier.
 *   3. Pix não tem "código de autorização" de cartão -- o identificador que
 *      vale pra conciliação é o `end_to_end_id` do Banco Central. Antes o
 *      código sempre priorizava `authorizationCode` (só existe pra cartão);
 *      agora, quando a forma é Pix, prioriza o end-to-end id.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2.45.4';

const LINK_CLIENT_ID = Deno.env.get('CIELO_LINK_CLIENT_ID') ?? '';
const LINK_CLIENT_SECRET = Deno.env.get('CIELO_LINK_CLIENT_SECRET') ?? '';
const TOKEN_URL = 'https://cieloecommerce.cielo.com.br/api/public/v2/token';
const BASE_URL = 'https://cieloecommerce.cielo.com.br/api/public/v2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const STATUS_PAGO = new Set(['paid']);
const STATUS_ENCERRADO_SEM_PAGAMENTO = new Set(['denied', 'voided', 'expired', 'notfinalized']);

/**
 * Espelha `painel/types.ts` -- se mudar lá, muda aqui. ATENÇÃO: é a tabela
 * do LINK DE PAGAMENTO, DIFERENTE da maquininha presencial (`cielo-confirmar-
 * venda` usa outra) -- taxas de canal de cobrança distinto, mesmo quando o
 * "forma_pagamento" tem o mesmo nome no nosso enum. Antes usava 5.49% fixo
 * pra qualquer parcelamento (cópia da tabela errada e desatualizada) --
 * corrigido pra tabela real por parcelas do Link (Visa/Master).
 */
const TAXAS_FIXAS: Record<string, number> = { pix: 0.99, debito: 1.32, dinheiro: 0 };
const TAXAS_CREDITO_LINK_PARCELADO: Record<number, number> = {
  1: 3.84, 2: 5.55, 3: 6.13, 4: 6.73, 5: 7.39, 6: 7.99,
  7: 8.60, 8: 9.45, 9: 10.41, 10: 10.71, 11: 11.68, 12: 12.57,
};
function taxaDe(forma: string, parcelas: number): number {
  if (forma === 'credito' || forma === 'credito_parcelado') {
    const p = Math.min(Math.max(Math.round(parcelas) || 1, 1), 12);
    return TAXAS_CREDITO_LINK_PARCELADO[p];
  }
  return TAXAS_FIXAS[forma] ?? 0;
}

/**
 * `payment.type` da consulta (docs.cielo.com.br/link/reference/conteúdo-das-
 * notificações, tabela "Payment_method_type") -- valor literal em inglês.
 * QrCode/QrCodeDebit não têm equivalente exato no nosso enum de 5 formas;
 * mapeados pro parente mais próximo (crédito/débito) só pra nunca deixar a
 * venda sem forma de pagamento -- registrado na observação pra conferência.
 */
const TIPO_PAGAMENTO_CIELO: Record<string, string> = {
  creditcard: 'credito', // vira 'credito_parcelado' abaixo se numberOfPayments > 1
  debitcard: 'debito',
  pix: 'pix',
  qrcode: 'credito',
  qrcodedebit: 'debito',
};

async function registrarEvento(corpo: unknown, erro?: string) {
  await db.from('evento_webhook').insert({
    origem: 'cielo_link', corpo, erro: erro ?? null, processado_em: new Date().toISOString(),
  });
}

/** Percorre o objeto procurando uma chave cujo nome (normalizado) bata com
 * um dos candidatos -- assim funciona tanto pra `checkout_cielo_order_number`
 * quanto `CheckoutCieloOrderNumber` sem precisar adivinhar a casing exata. */
function acharCampo(obj: unknown, candidatos: string[], profundidade = 0): string | undefined {
  if (profundidade > 6 || !obj || typeof obj !== 'object') return undefined;
  for (const [chave, valor] of Object.entries(obj as Record<string, unknown>)) {
    const norm = chave.toLowerCase().replace(/_/g, '');
    if (candidatos.includes(norm) && (typeof valor === 'string' || typeof valor === 'number')) {
      return String(valor);
    }
  }
  for (const valor of Object.values(obj as Record<string, unknown>)) {
    if (valor && typeof valor === 'object') {
      const r = acharCampo(valor, candidatos, profundidade + 1);
      if (r) return r;
    }
  }
  return undefined;
}

/** Acha o primeiro texto de status ("Paid", "Denied"...) em qualquer
 * profundidade -- comparando com a lista oficial de valores em inglês da
 * tabela de status da Cielo, pra não pegar um "status" de outra coisa. */
function acharStatusTexto(obj: unknown, profundidade = 0): string | undefined {
  if (profundidade > 6 || !obj || typeof obj !== 'object') return undefined;
  const conhecidos = ['paid', 'pending', 'authorized', 'authorizedidpaypending', 'denied', 'expired', 'voided', 'notfinalized'];
  for (const valor of Object.values(obj as Record<string, unknown>)) {
    if (typeof valor === 'string' && conhecidos.includes(valor.toLowerCase())) return valor.toLowerCase();
  }
  for (const valor of Object.values(obj as Record<string, unknown>)) {
    if (valor && typeof valor === 'object') {
      const r = acharStatusTexto(valor, profundidade + 1);
      if (r) return r;
    }
  }
  return undefined;
}

/**
 * Extrai `{ checkoutOrderNumber, createdDate }[]` da resposta de
 * `GET /merchantOrderNumber/{numero}` (um array, podendo ter mais de um
 * pedido — mais de uma tentativa de pagamento pro mesmo order_number).
 * Tenta o formato documentado primeiro; cai pra uma varredura genérica se a
 * Cielo devolver algo fora do que a doc descreve (defensivo, igual ao resto
 * do arquivo).
 */
function listarCheckoutIds(dadosBusca: unknown): { id: string; criadoEm: string }[] {
  if (Array.isArray(dadosBusca)) {
    const itens = dadosBusca
      .map((item) => {
        const id = typeof item === 'object' && item
          ? (item as Record<string, unknown>).checkoutOrderNumber
          : undefined;
        const criadoEm = typeof item === 'object' && item
          ? (item as Record<string, unknown>).createdDate
          : undefined;
        return typeof id === 'string' ? { id, criadoEm: typeof criadoEm === 'string' ? criadoEm : '' } : null;
      })
      .filter((x): x is { id: string; criadoEm: string } => x !== null);
    if (itens.length > 0) {
      // Mais recente primeiro -- se houve mais de uma tentativa, a que
      // importa pra saber "pagou ou não" é a última.
      return itens.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    }
  }
  // Fallback: formato inesperado -- tenta achar QUALQUER campo que pareça
  // um identificador de checkout em qualquer lugar do objeto.
  const generico = acharCampo(dadosBusca, ['checkoutcieloordernumber', 'checkoutordernumber']);
  return generico ? [{ id: generico, criadoEm: '' }] : [];
}

/**
 * A forma de pagamento, lida do campo real `payment.type` (texto exato) --
 * acessado DIRETO no objeto `payment`, não por busca genérica: uma busca
 * genérica por uma chave chamada "type" bateria antes em `cart.items[].type`
 * (código numérico do tipo de produto, nada a ver com forma de pagamento),
 * já que `cart` vem antes de `payment` na resposta -- essa troca teria
 * classificado toda venda errado de um jeito bem mais difícil de notar que
 * o bug antigo. Cai na varredura de texto solta só se `payment` não vier no
 * formato esperado.
 */
function formaPagamentoDe(detalhe: unknown): { forma: string; parcelas: number } {
  const payment = (detalhe as { payment?: Record<string, unknown> } | null)?.payment;
  const tipo = typeof payment?.type === 'string' ? payment.type : undefined;
  const numeroPagamentosBruto = payment?.numberOfPayments;
  const parcelas = typeof numeroPagamentosBruto === 'number' && numeroPagamentosBruto > 0
    ? numeroPagamentosBruto : 1;

  if (tipo) {
    const mapeado = TIPO_PAGAMENTO_CIELO[tipo.toLowerCase()];
    if (mapeado) {
      const forma = mapeado === 'credito' && parcelas > 1 ? 'credito_parcelado' : mapeado;
      return { forma, parcelas };
    }
  }

  // Rede de segurança: varredura de texto solta, como antes desta correção.
  const texto = JSON.stringify(detalhe).toLowerCase();
  const parcelasTexto = texto.match(/"(?:numberofpayments|numberofinstallments|installments)"\s*:\s*(\d+)/);
  const parcelasFallback = parcelasTexto ? Math.max(1, parseInt(parcelasTexto[1], 10)) : parcelas;
  if (texto.includes('pix')) return { forma: 'pix', parcelas: 1 };
  if (texto.includes('debit')) return { forma: 'debito', parcelas: 1 };
  if (texto.includes('credit')) return { forma: parcelasFallback > 1 ? 'credito_parcelado' : 'credito', parcelas: parcelasFallback };
  return { forma: 'credito', parcelas: parcelasFallback };
}

/**
 * O identificador de autorização pra IN 87/2025 (cAut). Cartão usa
 * `payment.authorizationCode`; Pix não tem esse conceito -- o que vale pra
 * conciliação é o end-to-end id gerado pelo Banco Central. A documentação
 * não mostra um exemplo de resposta de Pix pra este endpoint específico
 * (o exemplo oficial é de cartão), então os nomes de campo prováveis
 * (`endToEndId`/variações) são tentados via busca genérica -- só isso, e só
 * pra Pix, ainda depende de confirmação com uma venda real.
 */
function numeroAutorizacaoDe(detalhe: unknown, forma: string, checkoutId: string): string {
  const payment = (detalhe as { payment?: Record<string, unknown> } | null)?.payment;
  if (forma === 'pix') {
    const direto = payment?.endToEndId ?? payment?.e2eId;
    if (typeof direto === 'string' && direto) return direto;
    const e2e = acharCampo(detalhe, ['endtoendid', 'paymentendtoendid', 'pagadorendtoendid']);
    if (e2e) return e2e;
  }
  const authDireto = payment?.authorizationCode;
  if (typeof authDireto === 'string' && authDireto) return authDireto;
  const auth = acharCampo(detalhe, ['authorizationcode', 'authorizationid', 'tid']);
  return auth ?? checkoutId;
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

/** Consulta um checkout_cielo_order_number específico. */
async function consultarPedido(checkoutId: string, token: string): Promise<unknown> {
  const r = await fetch(`${BASE_URL}/orders/${encodeURIComponent(checkoutId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.ok ? await r.json().catch(() => null) : null;
}

/** Espelha `emitirNotaFiscal` de cielo-confirmar-venda -- mesma lógica,
 * duplicada de propósito (Edge Functions não compartilham módulo fácil sem
 * complicar o deploy) em vez de importada. */
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
    if (dados?.resposta?.status === 'autorizado') return { ok: true, chave: dados.resposta.chave_nfe };
    return { ok: false, mensagem: dados?.resposta?.mensagem_sefaz ?? dados?.erro ?? 'falha desconhecida' };
  } catch (e) {
    return { ok: false, mensagem: String(e) };
  }
}

Deno.serve(async (req) => {
  // A Cielo não manda OPTIONS (não é chamada de browser), mas não custa nada
  // deixar tratado.
  if (req.method === 'OPTIONS') return new Response('ok');

  const contentType = req.headers.get('content-type') ?? '';
  const bruto = await req.text();
  let corpo: Record<string, unknown> = {};
  try {
    if (contentType.includes('application/json')) {
      corpo = JSON.parse(bruto);
    } else {
      // x-www-form-urlencoded é o formato documentado pro Link de Pagamento.
      corpo = Object.fromEntries(new URLSearchParams(bruto));
    }
  } catch {
    corpo = { _bruto: bruto };
  }

  // Responde 200 sempre a partir daqui -- qualquer coisa que der errado fica
  // registrada em evento_webhook, não faz sentido a Cielo reenviar 3x.
  const ok200 = (extra?: Record<string, unknown>) =>
    new Response(JSON.stringify({ recebido: true, ...extra }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });

  if (!LINK_CLIENT_ID || !LINK_CLIENT_SECRET) {
    await registrarEvento(corpo, 'CIELO_LINK_CLIENT_ID / CIELO_LINK_CLIENT_SECRET não configurados ainda');
    return ok200();
  }

  // Identificadores que podem vir na notificação (nomes variam por doc/versão
  // -- cobrindo os candidatos plausíveis em vez de fixar um só).
  const checkoutOrderNumber = acharCampo(corpo, ['checkoutcieloordernumber']);
  const merchantOrderNumberNotif = acharCampo(corpo, ['merchantordernumber', 'ordernumber', 'order_number']);

  if (!checkoutOrderNumber && !merchantOrderNumberNotif) {
    await registrarEvento(corpo, 'notificação sem nenhum identificador de pedido reconhecível');
    return ok200();
  }

  let token: string;
  try {
    token = await obterToken();
  } catch (e) {
    await registrarEvento(corpo, `falhou ao autenticar na Cielo: ${e}`);
    return ok200();
  }

  // 1. resolve o(s) checkout_cielo_order_number candidato(s) -- pode ser
  // mais de um se a notificação só trouxe o nosso próprio order_number e
  // houve mais de uma tentativa de pagamento pra ele.
  let candidatos: { id: string; criadoEm: string }[] = checkoutOrderNumber
    ? [{ id: checkoutOrderNumber, criadoEm: '' }]
    : [];
  if (candidatos.length === 0 && merchantOrderNumberNotif) {
    const rBusca = await fetch(`${BASE_URL}/merchantOrderNumber/${encodeURIComponent(merchantOrderNumberNotif)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dadosBusca = await rBusca.json().catch(() => ({}));
    if (!rBusca.ok) {
      await registrarEvento({ corpo, dadosBusca }, `consulta por order_number falhou: ${rBusca.status}`);
      return ok200();
    }
    candidatos = listarCheckoutIds(dadosBusca);
  }
  if (candidatos.length === 0) {
    await registrarEvento(corpo, 'não consegui resolver o checkout_cielo_order_number');
    return ok200();
  }

  // 2. consulta cada candidato (mais recente primeiro) até achar um Paid --
  // é esta chamada autenticada, não o que veio no POST, que decide o status.
  let checkoutId = candidatos[0].id;
  let detalhe: unknown = null;
  for (const c of candidatos) {
    const d = await consultarPedido(c.id, token);
    if (!d) continue;
    const status = acharStatusTexto(d);
    if (status && STATUS_PAGO.has(status)) {
      checkoutId = c.id;
      detalhe = d;
      break;
    }
    // guarda o primeiro que respondeu (o mais recente) como padrão, caso
    // nenhum esteja pago ainda -- é o que reflete melhor "o estado agora".
    if (!detalhe) { checkoutId = c.id; detalhe = d; }
  }
  if (!detalhe) {
    await registrarEvento({ corpo, candidatos }, 'nenhum candidato respondeu à consulta de pedido');
    return ok200();
  }

  const statusTexto = acharStatusTexto(detalhe);
  const merchantOrderNumber = merchantOrderNumberNotif ?? acharCampo(detalhe, ['merchantordernumber', 'ordernumber']);

  if (!merchantOrderNumber) {
    await registrarEvento({ corpo, detalhe }, 'consulta não retornou merchant_order_number pra casar com o pedido_link');
    return ok200();
  }

  const { data: pedidoLink } = await db
    .from('pedido_link')
    .select('id, status, vendedor_id, cliente_id')
    .eq('merchant_order_number', merchantOrderNumber)
    .maybeSingle();

  if (!pedidoLink) {
    await registrarEvento({ corpo, detalhe }, `nenhum pedido_link com merchant_order_number=${merchantOrderNumber}`);
    return ok200();
  }

  // idempotência: se já processamos como pago, não duplica venda numa
  // eventual notificação repetida.
  if (pedidoLink.status === 'pago') {
    return ok200({ jaProcessado: true });
  }

  await db.from('pedido_link').update({
    checkout_cielo_order_number: checkoutId,
    atualizado_em: new Date().toISOString(),
  }).eq('id', pedidoLink.id);

  if (!statusTexto) {
    await registrarEvento({ corpo, detalhe }, 'não consegui reconhecer o status da transação na resposta');
    return ok200();
  }

  if (STATUS_ENCERRADO_SEM_PAGAMENTO.has(statusTexto)) {
    const novoStatus = statusTexto === 'expired' ? 'expirado' : 'cancelado';
    await db.from('pedido_link').update({ status: novoStatus, atualizado_em: new Date().toISOString() }).eq('id', pedidoLink.id);
    return ok200({ status: novoStatus });
  }

  if (!STATUS_PAGO.has(statusTexto)) {
    // pendente, autorizado aguardando captura, biometria... nada a fazer
    // ainda -- a próxima notificação de mudança de status avisa quando mudar.
    // ATENÇÃO: "Authorized" (7) significa aprovado mas NÃO CAPTURADO --
    // só vira "Paid" se a captura automática estiver ligada nas
    // configurações da loja no site Cielo (Configurações > Captura e
    // Antifraude). Sem isso, a venda nunca nasce sozinha.
    return ok200({ status: statusTexto });
  }

  // 3. PAGO de verdade (confirmado pela consulta) -- grava a(s) venda(s).
  const { data: itens } = await db
    .from('pedido_link_item')
    .select('quantidade, preco_unit, produto:produto_id (id, custo)')
    .eq('pedido_link_id', pedidoLink.id);

  if (!itens || itens.length === 0) {
    await registrarEvento({ corpo, detalhe }, `pedido_link ${pedidoLink.id} pago mas sem itens -- não dá pra gravar venda`);
    return ok200();
  }

  const { forma: formaPagamento, parcelas } = formaPagamentoDe(detalhe);
  const hoje = new Date().toISOString().slice(0, 10);
  const vendaIds: string[] = [];

  // IN 87/2025: identificador de autorização que vai vincular a nota ao
  // pagamento -- cAut de cartão ou end-to-end id de Pix (ver numeroAutorizacaoDe).
  const numeroAutorizacao = numeroAutorizacaoDe(detalhe, formaPagamento, checkoutId);

  for (const item of itens) {
    const produto = item.produto as unknown as { id: string; custo: number };
    const { data: venda, error: erroVenda } = await db.from('venda').insert({
      data: hoje,
      produto_id: produto.id,
      vendedor_id: pedidoLink.vendedor_id,
      cliente_id: pedidoLink.cliente_id,
      quantidade: item.quantidade,
      preco_unit: item.preco_unit,
      custo_unit: produto.custo,
      forma_pagamento: formaPagamento,
      parcelas,
      taxa_pct: taxaDe(formaPagamento, parcelas),
      comissao_pct: 0,
      entrega: 'pendente',
      canal: 'whatsapp',
      tipo_entrega: 'retirada',
      pedido_link_id: pedidoLink.id,
      id_transacao_cielo: checkoutId,
      // Faz `focus-nfe-emitir` preencher os campos de vinculação pagamento-nota
      // exigidos pela IN 87/2025 -- sem isto a nota sairia sem o vínculo.
      autorizacao_cartao: numeroAutorizacao,
      status_nfe: 'pendente',
      observacoes: `Venda via Link de Pagamento (Cielo) -- pedido ${merchantOrderNumber}. Forma de pagamento lida de payment.type; conferir se o valor bate.`,
    }).select('id').single();

    if (erroVenda || !venda) {
      await registrarEvento({ corpo, detalhe }, `pedido_link ${pedidoLink.id} pago mas falhou ao gravar venda: ${erroVenda?.message}`);
      continue;
    }

    await db.from('movimento_estoque').insert({
      produto_id: produto.id, quantidade: -item.quantidade, tipo: 'venda',
      custo_unit: produto.custo, venda_id: venda.id,
    });
    await db.from('pagamento').insert({
      venda_id: venda.id, data: hoje, valor: item.preco_unit * item.quantidade, forma: formaPagamento,
      parcelas, taxa_pct: taxaDe(formaPagamento, parcelas),
    });
    vendaIds.push(venda.id as string);
  }

  await db.from('pedido_link')
    .update({ status: 'pago', atualizado_em: new Date().toISOString() })
    .eq('id', pedidoLink.id);

  const notas = await Promise.all(vendaIds.map((id) => emitirNotaFiscal(id)));

  await registrarEvento({ corpo, detalhe, vendaIds, notas });
  return ok200({ ok: true, vendaIds, notas });
});
