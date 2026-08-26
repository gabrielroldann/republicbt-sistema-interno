/**
 * WEBHOOK DO WHATSAPP CLOUD API
 *
 * A porta de entrada da loja. Tudo que um cliente manda para o número do
 * anúncio chega aqui, e é o ÚNICO lugar do sistema onde o `ctwa_clid` existe —
 * a Meta entrega esse identificador uma vez, na primeira mensagem, e nunca mais.
 * Perder aqui é perder a atribuição da campanha para sempre.
 *
 * Quatro decisões que valem mais que o resto do arquivo:
 *
 *   1. RESPONDE 200 ANTES DE PROCESSAR. A Meta reenvia o evento se não receber
 *      200 rápido. Processar primeiro e responder depois transforma qualquer
 *      lentidão nossa numa tempestade de reenvios.
 *
 *   2. GRAVA O CORPO CRU ANTES DE PARSEAR. Se o parser tiver bug, dá para
 *      reprocessar o dia inteiro. Sem isso, um `undefined` numa linha faz a
 *      loja perder as mensagens da manhã sem ninguém notar.
 *
 *   3. CONFERE A ASSINATURA sobre os BYTES ORIGINAIS. Reserializar o JSON muda
 *      espaços e ordem de chaves, e o HMAC não bate mais — o clássico "funciona
 *      no teste, recusa tudo em produção".
 *
 *   4. NÃO GUARDA SEGREDO NO BANCO. Token e app secret vivem em variável de
 *      ambiente. A tabela `canal` é legível por qualquer vendedor.
 *
 * Variáveis necessárias:
 *   WHATSAPP_VERIFY_TOKEN   inventado por nós, colado no painel da Meta
 *   WHATSAPP_APP_SECRET     App Secret do app da Meta
 *   SUPABASE_URL            automática
 *   SUPABASE_SERVICE_ROLE_KEY  automática — ignora RLS, e é por isso que este
 *                              arquivo nunca deve rodar no navegador
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const APP_SECRET   = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

/* -------------------------------------------------------------------------- */
/* Assinatura                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Comparação em tempo constante.
 *
 * `a === b` sai no primeiro byte diferente, e a diferença de tempo entre "errou
 * no byte 1" e "errou no byte 30" é medível pela rede. Com paciência, isso
 * permite descobrir a assinatura correta byte a byte. Aqui todos os bytes são
 * sempre percorridos.
 */
function igualEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function assinaturaConfere(corpoCru: Uint8Array, cabecalho: string | null) {
  if (!APP_SECRET) return false;              // sem segredo configurado, recusa
  if (!cabecalho?.startsWith('sha256=')) return false;

  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', chave, corpoCru);
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  return igualEmTempoConstante(hex, cabecalho.slice(7));
}

/* -------------------------------------------------------------------------- */
/* Tradução dos tipos do WhatsApp para os nossos                               */
/* -------------------------------------------------------------------------- */
const TIPOS: Record<string, string> = {
  text: 'texto', image: 'imagem', audio: 'audio', voice: 'audio',
  video: 'video', document: 'documento', sticker: 'imagem',
  location: 'localizacao', contacts: 'contato', system: 'sistema',
};

/** O texto que representa a mensagem na lista da caixa de entrada. */
function conteudoDe(msg: any): string | null {
  switch (msg.type) {
    case 'text':        return msg.text?.body ?? null;
    case 'image':       return msg.image?.caption ?? '[imagem]';
    case 'video':       return msg.video?.caption ?? '[vídeo]';
    case 'document':    return msg.document?.filename ?? '[documento]';
    case 'audio':
    case 'voice':       return '[áudio]';
    case 'sticker':     return '[figurinha]';
    case 'location':    return msg.location?.name ?? '[localização]';
    case 'contacts':    return '[contato]';
    case 'reaction':    return `[reagiu ${msg.reaction?.emoji ?? ''}]`.trim();
    // O cliente que clica num botão do template responde por aqui. É texto de
    // verdade e precisa aparecer na conversa, senão a resposta dele some.
    case 'button':      return msg.button?.text ?? null;
    case 'interactive': return msg.interactive?.button_reply?.title
                            ?? msg.interactive?.list_reply?.title ?? null;
    case 'unsupported': return '[mensagem não suportada]';
    default:            return `[${msg.type}]`;
  }
}

/**
 * O id da mídia, não a mídia.
 *
 * Baixar o arquivo exige outra chamada autenticada à Meta e o link expira em
 * cinco minutos. Fazer isso aqui dentro atrasaria o 200 e provocaria reenvio.
 * Guarda-se o id; um job posterior baixa e troca por uma URL do Storage.
 */
function midiaDe(msg: any): string | null {
  const m = msg.image ?? msg.audio ?? msg.voice ?? msg.video
         ?? msg.document ?? msg.sticker;
  return m?.id ? `meta:${m.id}` : null;
}

/* -------------------------------------------------------------------------- */
/* Processamento                                                               */
/* -------------------------------------------------------------------------- */

async function processar(corpo: any, eventoId: number | null) {
  const erros: string[] = [];

  for (const entry of corpo?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const valor = change?.value;
      if (!valor) continue;

      // O webhook diz de QUAL número é o evento. Sem esse mapa, a mensagem
      // chega sem dono — e com dois números na mesma conta da Meta, iria para
      // a caixa errada.
      const pnid = valor?.metadata?.phone_number_id;
      const { data: canal } = await db
        .from('canal').select('id').eq('phone_number_id', pnid).eq('ativo', true)
        .maybeSingle();

      if (!canal) {
        erros.push(`phone_number_id desconhecido: ${pnid}`);
        continue;
      }

      /* ---- recibos de entrega das mensagens que NÓS mandamos --------------- */
      for (const st of valor.statuses ?? []) {
        const mapa: Record<string, string> = {
          sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou',
        };
        await db.from('mensagem')
          .update({
            status: mapa[st.status] ?? 'enviada',
            erro: st.errors?.[0]?.title ?? null,
          })
          .eq('wa_message_id', st.id);
      }

      /* ---- as mensagens dos clientes -------------------------------------- */
      const nomes = new Map<string, string>();
      for (const c of valor.contacts ?? []) {
        if (c?.wa_id && c?.profile?.name) nomes.set(c.wa_id, c.profile.name);
      }

      for (const msg of valor.messages ?? []) {
        try {
          const { error } = await db.rpc('receber_mensagem', {
            p_canal_id:      canal.id,
            p_telefone:      msg.from,
            p_nome:          nomes.get(msg.from) ?? null,
            p_wa_message_id: msg.id,
            p_tipo:          TIPOS[msg.type] ?? 'outro',
            p_conteudo:      conteudoDe(msg),
            p_midia_url:     midiaDe(msg),
            // O timestamp vem em segundos, como string. Multiplicar por mil e
            // esquecer o `Number` produz "Invalid Date", e a mensagem cai no
            // fim da conversa para sempre.
            p_enviada_em:    new Date(Number(msg.timestamp) * 1000).toISOString(),
            p_referral:      msg.referral ?? null,
          });
          if (error) erros.push(`${msg.id}: ${error.message}`);
        } catch (e) {
          erros.push(`${msg.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  if (eventoId != null) {
    await db.from('evento_webhook')
      .update({
        processado_em: new Date().toISOString(),
        erro: erros.length ? erros.join(' | ') : null,
      })
      .eq('id', eventoId);
  }
}

/* -------------------------------------------------------------------------- */
Deno.serve(async (req) => {
  const url = new URL(req.url);

  /* ---- a verificação, uma vez só, quando se cola a URL no painel ---------- */
  if (req.method === 'GET') {
    const modo    = url.searchParams.get('hub.mode');
    const token   = url.searchParams.get('hub.verify_token');
    const desafio = url.searchParams.get('hub.challenge');

    if (modo === 'subscribe' && VERIFY_TOKEN &&
        igualEmTempoConstante(token ?? '', VERIFY_TOKEN)) {
      return new Response(desafio ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  // Os BYTES originais. A assinatura é sobre eles, não sobre o JSON reserializado.
  const bytes = new Uint8Array(await req.arrayBuffer());

  if (!await assinaturaConfere(bytes, req.headers.get('x-hub-signature-256'))) {
    // 403, não 400: a Meta não deve reenviar o que foi recusado por assinatura.
    return new Response('assinatura inválida', { status: 403 });
  }

  let corpo: any;
  try {
    corpo = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // JSON quebrado com assinatura válida é problema da Meta, não nosso.
    // Reenviar não conserta, então 200 para não entrar em laço de retentativa.
    return new Response('ok', { status: 200 });
  }

  // Cru primeiro, sempre. Barato, e é o que salva o dia quando o parser erra.
  const { data: evento } = await db
    .from('evento_webhook').insert({ origem: 'meta', corpo }).select('id').single();

  // 200 AGORA. O processamento continua depois da resposta — é para isso que
  // serve o `waitUntil`. Fazer o inverso é convidar a Meta a reenviar tudo.
  const trabalho = processar(corpo, evento?.id ?? null);
  // @ts-ignore EdgeRuntime existe no Supabase, não na tipagem do Deno
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(trabalho);
  else await trabalho;

  return new Response('ok', { status: 200 });
});
