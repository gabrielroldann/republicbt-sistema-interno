/**
 * WEBHOOK DO INSTAGRAM (mensagens diretas)
 *
 * Irmã de `whatsapp/index.ts` — mesmas quatro decisões (responde 200 antes de
 * processar, grava o corpo cru antes de parsear, confere assinatura sobre os
 * bytes originais, não guarda segredo no banco), mas o formato do evento é
 * outro: `object: "instagram"`, `entry[].messaging[]`, e o cliente é
 * identificado por um IGSID (não telefone) — por isso vira `ig:<IGSID>` antes
 * de chegar em `receber_mensagem` (ver migração
 * `identificar_cliente_e_receber_mensagem_aceitam_instagram`).
 *
 * O VERIFY TOKEN é reaproveitado do WhatsApp (é uma string nossa, não da
 * Meta — não tem problema repetir). Mas o APP SECRET é diferente: o produto
 * "Instagram" nesse app tem um ID e uma chave secreta PRÓPRIOS (aparecem
 * juntos na tela "Conheça a API do Instagram" do App Dashboard), separados
 * do app principal usado no WhatsApp. Por isso um secret dedicado.
 *
 * Variáveis necessárias:
 *   WHATSAPP_VERIFY_TOKEN (reaproveitado), INSTAGRAM_APP_SECRET,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticas)
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const APP_SECRET   = Deno.env.get('INSTAGRAM_APP_SECRET') ?? '';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

function igualEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function assinaturaConfere(corpoCru: Uint8Array, cabecalho: string | null) {
  if (!APP_SECRET) return false;
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

/** O texto que representa a mensagem na lista da caixa de entrada. */
function conteudoDe(msg: any): string | null {
  if (msg.text) return msg.text;
  if (msg.is_deleted) return '[mensagem apagada]';
  if (msg.is_unsupported) return '[mensagem não suportada]';
  const anexo = msg.attachments?.[0];
  if (anexo) {
    const rotulos: Record<string, string> = {
      image: '[imagem]', video: '[vídeo]', audio: '[áudio]', file: '[arquivo]',
      share: '[compartilhamento]', story_mention: '[menção no story]',
      ig_reel: '[reel]', reel: '[reel]',
    };
    return rotulos[anexo.type] ?? `[${anexo.type}]`;
  }
  if (msg.reply_to?.story) return '[respondeu a um story]';
  return null;
}

const TIPOS: Record<string, string> = {
  image: 'imagem', video: 'video', audio: 'audio', file: 'documento',
};

function tipoDe(msg: any): string {
  const t = msg.attachments?.[0]?.type;
  return TIPOS[t] ?? 'texto';
}

function midiaDe(msg: any): string | null {
  return msg.attachments?.[0]?.payload?.url ?? null;
}

/* -------------------------------------------------------------------------- */

async function processar(corpo: any, eventoId: number | null) {
  const erros: string[] = [];

  for (const entry of corpo?.entry ?? []) {
    // O ID da própria conta do Instagram da loja — é por ele que sabemos de
    // qual canal é o evento, igual ao phone_number_id no WhatsApp.
    const igId = entry?.id;
    const { data: canal } = await db
      .from('canal').select('id').eq('ig_id', igId).eq('ativo', true).maybeSingle();

    if (!canal) {
      erros.push(`ig_id desconhecido: ${igId}`);
      continue;
    }

    for (const evento of entry?.messaging ?? []) {
      const msg = evento?.message;
      if (!msg || msg.is_echo) continue; // eco = mensagem que NÓS mandamos, não do cliente
      // Reações/postbacks/seen chegam sem `message` — tratamos só mensagem por
      // enquanto; o resto é registrado no `evento_webhook` mas não vira linha
      // na caixa de entrada.

      try {
        const { error } = await db.rpc('receber_mensagem', {
          p_canal_id:      canal.id,
          p_telefone:      `ig:${evento.sender.id}`,
          p_nome:          null, // o webhook não traz nome — só o IGSID
          p_wa_message_id: msg.mid,
          p_tipo:          tipoDe(msg),
          p_conteudo:      conteudoDe(msg),
          p_midia_url:     midiaDe(msg),
          p_enviada_em:    new Date(evento.timestamp).toISOString(),
          p_referral:      null,
        });
        if (error) erros.push(`${msg.mid}: ${error.message}`);
      } catch (e) {
        erros.push(`${msg.mid}: ${e instanceof Error ? e.message : String(e)}`);
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

  const bytes = new Uint8Array(await req.arrayBuffer());

  if (!await assinaturaConfere(bytes, req.headers.get('x-hub-signature-256'))) {
    return new Response('assinatura inválida', { status: 403 });
  }

  let corpo: any;
  try {
    corpo = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return new Response('ok', { status: 200 });
  }

  const { data: evento } = await db
    .from('evento_webhook').insert({ origem: 'instagram', corpo }).select('id').single();

  const trabalho = processar(corpo, evento?.id ?? null);
  // @ts-ignore EdgeRuntime existe no Supabase, não na tipagem do Deno
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(trabalho);
  else await trabalho;

  return new Response('ok', { status: 200 });
});
