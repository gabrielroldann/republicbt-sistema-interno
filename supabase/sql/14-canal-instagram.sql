-- ============================================================================
-- INSTAGRAM COMO CANAL DA CAIXA DE ENTRADA.
--
-- Aplicado em produção como duas migrações (preparar_canal_instagram,
-- identificar_cliente_e_receber_mensagem_aceitam_instagram) e nunca trazido
-- para o repositório — a Edge Function `instagram` e a `enviar-whatsapp`
-- dependiam de uma coluna (`canal.ig_id`) e um valor de `via` que nenhum
-- arquivo aqui criava. Consolidado aqui para o schema voltar a ser
-- reproduzível a partir do zero.
--
-- Instagram é um canal novo, igual em espírito ao WhatsApp (cloud_api) e ao
-- vendedor (evolution), mas com uma diferença que importa: o cliente do
-- Instagram não tem telefone, tem um ID interno (IGSID). Em vez de reescrever
-- todo o esquema (que hoje é organizado em torno de telefone: cliente,
-- conversa, tudo), a solução pragmática — a mesma que ferramentas de inbox
-- como Chatwoot usam — é representar o IGSID como um "telefone" sintético,
-- prefixado ('ig:17841...'), reaproveitando 100% do funil/lead/conversa que
-- já existe.
-- ============================================================================

alter table canal drop constraint canal_via_check;
alter table canal add constraint canal_via_check
  check (via in ('cloud_api', 'evolution', 'instagram'));

alter table canal add column if not exists ig_id text unique;

alter table canal drop constraint canal_via_identificada;
alter table canal add constraint canal_via_identificada check (
  (via = 'cloud_api' and phone_number_id is not null) or
  (via = 'evolution' and instancia is not null) or
  (via = 'instagram' and ig_id is not null)
);

-- Os dois pontos de entrada que hoje SEMPRE normalizavam telefone. Um IGSID
-- ('ig:17841...') não é telefone e normalizar_telefone o destruiria (ela só
-- extrai dígitos). O bypass é cirúrgico: só muda o caminho quando o valor já
-- chega no nosso formato sintético — o comportamento de WhatsApp
-- (cloud_api/evolution) não muda em nem uma linha. Esta versão já inclui a
-- correção de corrida por `on conflict` (aplicada antes, em produção, como a
-- migração corrigir_corrida_identificar_cliente).
create or replace function public.identificar_cliente(
  p_telefone_bruto text, p_nome text default null, p_email text default null,
  p_campanha_origem text default null
)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tel text := case when p_telefone_bruto like 'ig:%' then p_telefone_bruto
                      else normalizar_telefone(p_telefone_bruto) end;
  v_id uuid;
begin
  if v_tel is not null then
    insert into cliente (telefone, nome, email, campanha_origem)
    values (v_tel, p_nome, nullif(p_email, ''), p_campanha_origem)
    on conflict (telefone) do update set
      nome = coalesce(cliente.nome, excluded.nome),
      email = coalesce(cliente.email, excluded.email),
      campanha_origem = coalesce(cliente.campanha_origem, excluded.campanha_origem)
    returning id into v_id;
    return v_id;
  end if;

  if p_email is not null and p_email <> '' then
    select id into v_id from cliente where lower(email) = lower(p_email) limit 1;
    if v_id is not null then
      update cliente set nome = coalesce(cliente.nome, p_nome) where id = v_id;
      return v_id;
    end if;
  end if;

  insert into cliente (telefone, nome, email, campanha_origem)
  values (v_tel, p_nome, nullif(p_email, ''), p_campanha_origem) returning id into v_id;
  return v_id;
end $function$;

create or replace function public.receber_mensagem(p_canal_id text, p_telefone text, p_nome text default null, p_wa_message_id text default null, p_tipo text default 'texto', p_conteudo text default null, p_midia_url text default null, p_enviada_em timestamp with time zone default now(), p_referral jsonb default null)
returns table(conversa_id uuid, lead_id uuid, mensagem_id uuid, primeira boolean)
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tel text := case when p_telefone like 'ig:%' then p_telefone
                      else normalizar_telefone(p_telefone) end;
  v_campanha text; v_cliente uuid; v_conversa uuid; v_lead uuid; v_msg uuid;
  v_primeira boolean := false;
begin
  if v_tel is null or (v_tel not like 'ig:%' and length(v_tel) < 10) then
    raise exception 'telefone inválido: %', p_telefone using errcode = 'check_violation';
  end if;
  if not exists (select 1 from canal where id = p_canal_id and ativo) then
    raise exception 'canal % não existe ou está inativo', p_canal_id;
  end if;

  v_campanha := campanha_do_referral(p_referral, p_conteudo);
  v_cliente := identificar_cliente(v_tel, p_nome, null, nullif(v_campanha, 'nao_rastreado'));

  select id into v_conversa from conversa where canal_id = p_canal_id and telefone = v_tel;
  if v_conversa is null then
    v_primeira := true;
    insert into conversa (canal_id, cliente_id, telefone, ctwa_clid, ad_id)
    values (p_canal_id, v_cliente, v_tel, nullif(p_referral->>'ctwa_clid', ''),
            nullif(p_referral->>'source_id', ''))
    returning id into v_conversa;
  end if;

  select l.id into v_lead from lead l
  where l.cliente_id = v_cliente and l.deletado_em is null and l.fechado_em is null
  order by l.criado_em desc limit 1;

  if v_lead is null then
    v_lead := criar_lead(p_telefone => v_tel, p_nome => p_nome,
      p_campanha_id => v_campanha, p_campanha_nome => nullif(p_referral->>'headline', ''),
      p_utm => jsonb_build_object('ctwa_clid', p_referral->>'ctwa_clid',
        'ad_id', p_referral->>'source_id', 'utm_source','meta'));
  end if;

  update conversa set lead_id = v_lead
  where conversa.id = v_conversa and conversa.lead_id is null;

  insert into mensagem (conversa_id, direcao, tipo, conteudo, midia_url,
                        wa_message_id, status, enviada_em)
  values (v_conversa, 'entrada', p_tipo, p_conteudo, p_midia_url,
          nullif(p_wa_message_id, ''), 'entregue', p_enviada_em)
  on conflict (wa_message_id) do nothing returning id into v_msg;

  if v_msg is null then
    return query select v_conversa, v_lead, null::uuid, false;
    return;
  end if;

  update conversa set
    ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, p_enviada_em), p_enviada_em),
    ultima_mensagem_cliente_em = greatest(coalesce(ultima_mensagem_cliente_em, p_enviada_em), p_enviada_em),
    nao_lidas = nao_lidas + 1,
    status = case when status = 'resolvida' then 'nova' else status end
  where id = v_conversa;

  return query select v_conversa, v_lead, v_msg, v_primeira;
end $function$;
