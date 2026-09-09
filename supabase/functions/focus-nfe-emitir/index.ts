/**
 * EMITE A NFC-e DE UMA VENDA JÁ GRAVADA, via Focus NFe.
 *
 * Cada linha de `venda` vira UMA nota (a tabela hoje não agrupa vários
 * produtos de uma mesma compra sob um "pedido" comum — se o sócio vender
 * dois produtos diferentes numa única conversa de WhatsApp, isso gera duas
 * `venda` e, portanto, duas notas. Sem problema legal nisso, só vale saber.
 *
 * `ref` da Focus NFe = o próprio id da venda: chamar essa função duas vezes
 * pra mesma venda não duplica a nota, a Focus recusa como "já processada"
 * (quando autorizada — se deu erro antes, pode reenviar com o mesmo ref).
 *
 * CORS: chamada tanto pelo navegador (tela Nova Venda) quanto de servidor pra
 * servidor (`cielo-confirmar-venda`) — sem os headers abaixo, o navegador
 * bloqueia a resposta no preflight OPTIONS.
 *
 * INTEGRAÇÃO DOS MEIOS DE PAGAMENTO (IN SEFAZ-CE 87/2025, Grupo YA da NFC-e):
 * quando a venda carrega `autorizacao_cartao` (só o fluxo automático do
 * Carrinho/maquininha grava isso — ver `cielo-confirmar-venda`), a nota sai
 * com `tipo_integracao=1` (tpIntegra), o CNPJ da credenciadora, o número de
 * autorização (cAut) e agora também o identificador do terminal (idTermPag).
 * Venda sem esses dados — hoje, qualquer venda batida na tela manual "Nova
 * Venda" — sai como `tipo_integracao=2` (não integrado): correto para
 * dinheiro, mas ATENÇÃO: cartão/PIX registrados manualmente na tela do
 * painel nunca vão sair integrados, porque a nota não tem como saber o
 * código de autorização de verdade sem vir da API da Cielo. Ver
 * `PASSO-A-PASSO-INTEGRACAO-PAGAMENTOS.md` na raiz do repositório.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2.45.4';

const FORMA_PAGAMENTO_FOCUS: Record<string, string> = {
  dinheiro: '01',
  credito: '03',
  credito_parcelado: '03',
  debito: '04',
  pix: '17',
};

// Cielo S.A. — instituição de pagamento (credenciadora), CNPJ público.
const CNPJ_CIELO = '01027058000191';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function resposta(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { vendaId, ambiente } = await req.json();
    if (!vendaId) return resposta({ erro: 'vendaId é obrigatório' }, 400);

    const amb = ambiente === 'producao' ? 'producao' : 'homologacao';
    const nomeSecret = amb === 'producao' ? 'FOCUS_NFE_TOKEN_PRODUCAO' : 'FOCUS_NFE_TOKEN_HOMOLOGACAO';
    const token = Deno.env.get(nomeSecret);
    if (!token) return resposta({ erro: `Secret ${nomeSecret} não configurado no projeto` }, 500);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data: venda, error: eVenda } = await supabase.from('venda')
      .select(`
        id, quantidade, preco_unit, forma_pagamento, canal, tipo_entrega,
        autorizacao_cartao, terminal_pagamento,
        status_nfe, chave_nfe,
        produto:produto_id ( nome, sku, ncm, cfop ),
        cliente:cliente_id ( nome, cpf )
      `)
      .eq('id', vendaId).single();
    if (eVenda || !venda) return resposta({ erro: 'venda não encontrada', detalhe: eVenda?.message }, 404);

    if (venda.status_nfe === 'autorizado' && venda.chave_nfe) {
      return resposta({ aviso: 'essa venda já tem NFC-e autorizada', chave_nfe: venda.chave_nfe }, 200);
    }

    const produto = venda.produto as unknown as
      { nome: string; sku: string; ncm: string | null; cfop: string | null } | null;
    if (!produto?.ncm || !produto?.cfop) {
      const msg = `Produto "${produto?.nome ?? '?'}" está sem NCM/CFOP configurado — não dá pra emitir nota.`;
      // Mesmo achado do ramo de baixo: validação que barra ANTES de chamar a
      // Focus também precisa gravar status_nfe, senão a venda fica com
      // `null` pra sempre -- indistinguível de "nunca tentamos emitir".
      await supabase.from('venda').update({ status_nfe: 'erro_envio', mensagem_nfe: msg }).eq('id', vendaId);
      return resposta({ erro: msg }, 422);
    }

    const cliente = venda.cliente as unknown as { nome: string | null; cpf: string | null } | null;

    const domicilio = venda.tipo_entrega === 'domicilio';
    const presencaComprador = domicilio ? '4' : '1';

    if (domicilio && !cliente?.cpf) {
      const msg = 'Venda marcada como entrega a domicílio, mas o cliente não tem CPF cadastrado — a SEFAZ exige CPF/CNPJ do destinatário nesse caso (nome sozinho não é aceito).';
      await supabase.from('venda').update({ status_nfe: 'erro_envio', mensagem_nfe: msg }).eq('id', vendaId);
      return resposta({ erro: msg }, 422);
    }

    const formaPagamentoFocus = FORMA_PAGAMENTO_FOCUS[venda.forma_pagamento] ?? '99';
    const valorTotal = Number(venda.quantidade) * Number(venda.preco_unit);

    const formaPagamento: Record<string, unknown> = {
      forma_pagamento: formaPagamentoFocus,
      valor_pagamento: valorTotal,
    };
    // Grupo YA (tpIntegra/CNPJ/cAut/idTermPag) só pode ir na nota quando a
    // forma de pagamento é eletrônica -- confirmado agora com a SEFAZ de
    // verdade (ambiente homologação): uma venda em dinheiro com
    // `tipo_integracao` presente (mesmo '2', "não integrado") volta
    // REJEITADA, código 963 "Tipo de pagamento não aceita o grupo de
    // cartões ou boletos". Pix (tPag 17) aceita o grupo normalmente. Por
    // isso o grupo inteiro fica de fora quando a venda é em dinheiro --
    // antes desta correção, TODA venda em dinheiro seria rejeitada pela
    // SEFAZ assim que emitida (achado batendo a nota de teste de verdade).
    if (venda.forma_pagamento !== 'dinheiro') {
      if (venda.autorizacao_cartao) {
        formaPagamento.tipo_integracao = '1';
        formaPagamento.cnpj_credenciadora = CNPJ_CIELO;
        formaPagamento.nome_credenciadora = 'Cielo';
        formaPagamento.numero_autorizacao = venda.autorizacao_cartao;
        // idTermPag (Grupo YA) — identificador do terminal de pagamento.
        // Só faz sentido junto de tipo_integracao=1: a Focus/SEFAZ não pedem
        // isso em pagamento não integrado. Antes desta correção, o dado já
        // era gravado na venda (ver cielo-confirmar-venda) mas nunca chegava
        // até aqui — a nota saía sem esse campo, incompleta perante a norma.
        if (venda.terminal_pagamento) {
          formaPagamento.id_terminal_pagamento = venda.terminal_pagamento;
        }
      } else {
        formaPagamento.tipo_integracao = '2';
      }
    }

    const corpo: Record<string, unknown> = {
      cnpj_emitente: '68692679000160',
      data_emissao: new Date().toISOString().replace('Z', '+00:00'),
      presenca_comprador: presencaComprador,
      modalidade_frete: '9',
      local_destino: '1',
      natureza_operacao: 'VENDA AO CONSUMIDOR',
      indicador_inscricao_estadual_destinatario: '9',
      items: [
        {
          numero_item: '1',
          codigo_ncm: produto.ncm,
          codigo_produto: produto.sku,
          descricao: produto.nome,
          quantidade_comercial: Number(venda.quantidade),
          quantidade_tributavel: Number(venda.quantidade),
          cfop: produto.cfop,
          valor_unitario_comercial: Number(venda.preco_unit),
          valor_unitario_tributavel: Number(venda.preco_unit),
          valor_bruto: valorTotal,
          unidade_comercial: 'un',
          unidade_tributavel: 'un',
          icms_origem: '0',
          icms_situacao_tributaria: '102',
        },
      ],
      formas_pagamento: [formaPagamento],
    };
    if (domicilio && cliente?.cpf) {
      corpo.cpf_destinatario = cliente.cpf.replace(/\D/g, '');
      if (cliente?.nome) corpo.nome_destinatario = cliente.nome;
    }

    const baseUrl = amb === 'producao'
      ? 'https://api.focusnfe.com.br/v2/nfce'
      : 'https://homologacao.focusnfe.com.br/v2/nfce';
    const hostArquivos = amb === 'producao'
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';
    const auth = 'Basic ' + btoa(`${token}:`);

    const resp = await fetch(`${baseUrl}?ref=${vendaId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(corpo),
    });
    const texto = await resp.text();
    let dados: any;
    try { dados = JSON.parse(texto); } catch { dados = texto; }

    if (resp.status === 201 && dados?.status === 'autorizado') {
      const caminhoXml = dados.caminho_xml_nota_fiscal ? hostArquivos + dados.caminho_xml_nota_fiscal : null;
      await supabase.from('venda').update({
        status_nfe: 'autorizado',
        chave_nfe: dados.chave_nfe,
        numero_nfe: dados.numero,
        serie_nfe: dados.serie,
        caminho_danfe: dados.caminho_danfe,
        caminho_xml: caminhoXml,
        qrcode_url: dados.qrcode_url,
        mensagem_nfe: null,
      }).eq('id', vendaId);
      dados.url_danfe = hostArquivos + dados.caminho_danfe;
      dados.url_xml = caminhoXml;
    } else if (dados?.status === 'erro_autorizacao') {
      // A SEFAZ recusou a nota (rejeição formal, com mensagem própria).
      await supabase.from('venda').update({
        status_nfe: 'erro_autorizacao',
        mensagem_nfe: dados?.mensagem_sefaz ?? null,
      }).eq('id', vendaId);
    } else {
      // QUALQUER outro formato de resposta -- erro de autenticação, payload
      // rejeitado antes de chegar na SEFAZ, indisponibilidade da Focus, etc.
      // Achado na bateria de testes: sem este ramo, `status_nfe` ficava
      // `null` pra sempre nesses casos -- a nota "sumia" sem deixar rastro
      // nenhum no banco, só no que apareceu na tela de quem estava olhando
      // na hora. Sempre grava alguma coisa, mesmo que a mensagem seja crua.
      const motivo = typeof dados === 'string'
        ? dados.slice(0, 2000)
        : (dados?.mensagem ?? dados?.erro ?? dados?.message ?? JSON.stringify(dados)).toString().slice(0, 2000);
      await supabase.from('venda').update({
        status_nfe: 'erro_envio',
        mensagem_nfe: `HTTP ${resp.status}: ${motivo}`,
      }).eq('id', vendaId);
    }

    return resposta({ status_http: resp.status, corpo_enviado: corpo, resposta: dados }, 200);
  } catch (e) {
    return resposta({ erro: String(e) }, 500);
  }
});
