/**
 * ENVIAR MENSAGEM PELO WHATSAPP
 *
 * Roda no servidor por um motivo só: o token da Meta não pode ir para o
 * navegador. Se fosse enviado do front, qualquer pessoa abriria o console,
 * copiaria o token e passaria a mandar mensagem em nome da loja.
 *
 * Descobre por qual número mandar a partir do CANAL da conversa:
 *   cloud_api  → API oficial da Meta (o número da loja)
 *   evolution  → número do vendedor, pareado por QR. Ainda não ligado.
 *
 * Variáveis:
 *   WHATSAPP_TOKEN             token da Meta (temporário de 24h serve)
 *   SUPABASE_URL               automática
 *   SUPABASE_SERVICE_ROLE_KEY  automática — ignora RLS, e é por isso que este
 *                              arquivo nunca pode rodar no navegador
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const VERSAO = 'v21.0';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const erro = (msg: string, status = 400) =>
  new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...cors, 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  /**
   * Quem está pedindo.
   *
   * A função roda com service_role, que ignora RLS — então ela PRECISA
   * conferir o usuário na mão. Sem isto, qualquer um com a chave anônima
   * mandaria mensagem em nome da loja para qualquer número.
   */
  const auth = req.headers.get('Authorization') ?? '';
  const { data: usuario } = await db.auth.getUser(auth.replace('Bearer ', ''));
  if (!usuario?.user) return erro('não autenticado', 401);

  const { data: vendedor } = await db
    .from('vendedor').select('id').eq('auth_user_id', usuario.user.id)
    .eq('ativo', true).maybeSingle();
  if (!vendedor) return erro('usuário não é um vendedor ativo', 403);

  let corpo: { conversaId?: string; texto?: string; mensagemId?: string };
  try { corpo = await req.json(); } catch { return erro('corpo inválido'); }

  const { conversaId, texto, mensagemId } = corpo;
  if (!conversaId || !texto?.trim()) return erro('conversa e texto são obrigatórios');

  /* ---- de qual número sai, e para quem ---------------------------------- */
  const { data: conversa } = await db
    .from('conversa')
    .select('telefone, ultima_mensagem_cliente_em, canal:canal_id (id, via, phone_number_id, instancia, ativo)')
    .eq('id', conversaId).maybeSingle();

  if (!conversa) return erro('conversa não encontrada', 404);

  const canal = conversa.canal as unknown as {
    id: string; via: string; phone_number_id: string | null;
    instancia: string | null; ativo: boolean;
  };
  if (!canal?.ativo) return erro('o número desta conversa está desativado');

  if (canal.via === 'evolution') {
    // Honesto em vez de silencioso: o número do vendedor ainda não tem via de
    // envio. Fingir sucesso deixaria a mensagem na tela sem ter saído.
    return erro(
      'o número do vendedor ainda não está conectado. ' +
      'Por enquanto responda pelo número da loja.', 501,
    );
  }

  if (!TOKEN) return erro('WHATSAPP_TOKEN não configurado no servidor', 500);
  if (!canal.phone_number_id) return erro('canal sem phone_number_id', 500);

  /**
   * A JANELA DE 24 HORAS.
   *
   * Fora dela a Meta recusa texto livre e só aceita template aprovado. Conferir
   * aqui, antes de chamar a API, transforma um erro críptico da Meta numa frase
   * que diz o que fazer.
   */
  const ultima = conversa.ultima_mensagem_cliente_em
    ? new Date(conversa.ultima_mensagem_cliente_em).getTime() : 0;
  if (Date.now() - ultima > 24 * 3600_000) {
    return erro(
      'passaram 24h desde a última mensagem do cliente: neste número só sai ' +
      'template aprovado pela Meta.', 409,
    );
  }

  /* ---- envia ------------------------------------------------------------ */
  const r = await fetch(
    `https://graph.facebook.com/${VERSAO}/${canal.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: conversa.telefone,
        type: 'text',
        text: { preview_url: false, body: texto.trim() },
      }),
    },
  );

  const resposta = await r.json().catch(() => ({}));

  if (!r.ok) {
    const detalhe = resposta?.error?.message ?? `HTTP ${r.status}`;
    if (mensagemId) {
      await db.from('mensagem')
        .update({ status: 'falhou', erro: detalhe }).eq('id', mensagemId);
    }
    return erro(detalhe, 502);
  }

  /**
   * Guarda o `wamid` que a Meta devolveu.
   *
   * É por ele que o recibo de entrega volta no webhook — sem gravar, a
   * mensagem fica presa em "enviada" para sempre, mesmo depois de lida.
   */
  const wamid = resposta?.messages?.[0]?.id ?? null;
  if (mensagemId && wamid) {
    await db.from('mensagem').update({ wa_message_id: wamid }).eq('id', mensagemId);
  }

  return new Response(JSON.stringify({ ok: true, wamid }), {
    headers: { ...cors, 'content-type': 'application/json' },
  });
});
