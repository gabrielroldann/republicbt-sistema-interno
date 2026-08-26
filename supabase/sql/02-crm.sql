-- ============================================================================
-- Republic BT — CRM próprio
--
-- Substitui o antigo 02-kommo.sql. O lead deixa de ser espelho do Kommo e passa
-- a NASCER aqui: é a nossa entidade, não a cópia da de outro sistema.
--
-- `kommo_lead_id` continua existindo, opcional, para o caso de um dia importar.
--
-- Depende de 01-nucleo.sql (`cliente`, `vendedor`, `normalizar_telefone`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CAMPANHA — continua igual: a Meta não saiu, só o Kommo.
-- ----------------------------------------------------------------------------
create table if not exists campanha (
  id        text primary key,       -- 'meta:ad:120384...' ou 'manual:verao-01'
  nome      text not null,
  canal     text not null default 'meta'
            check (canal in ('meta','google','organico','indicacao','loja','site','outro')),
  ativa     boolean not null default true,
  criada_em timestamptz not null default now()
);

-- O webhook do WhatsApp NÃO entrega o id da campanha.
--
-- No `referral` vem apenas `source_id`, que é o id do ANÚNCIO. Subir dali para
-- o conjunto e para a campanha exige a API de Marketing da Meta, que é outra
-- credencial e outro momento. Então o anúncio é gravado como veio, e a
-- hierarquia é preenchida depois — por um job, sem tocar em lead nenhum.
--
-- Guardar o anúncio é mais útil do que parece: é o nível em que se decide qual
-- criativo cortar. Campanha inteira raramente é a unidade de decisão.
-- Código curto que vai no link: wa.me/...?text=Quero a Nox [VERAO26]
--
-- Serve para tudo que NÃO é Click-to-WhatsApp e por isso não tem `referral`:
-- QR code no balcão, link no story, link de professor. Sem isso, metade do que
-- traz cliente chega como "não rastreado".
alter table campanha add column if not exists codigo           text;
alter table campanha add column if not exists meta_ad_id       text;
alter table campanha add column if not exists meta_adset_id    text;
alter table campanha add column if not exists meta_campanha_id text;
alter table campanha add column if not exists resolvida        boolean not null default false;

create unique index if not exists idx_campanha_ad
  on campanha (meta_ad_id) where meta_ad_id is not null;

-- Dois códigos iguais fariam o lead cair na campanha errada, em silêncio.
create unique index if not exists idx_campanha_codigo
  on campanha (upper(codigo)) where codigo is not null;

insert into campanha (id, nome, canal) values
  ('nao_rastreado', 'Não rastreado', 'outro'),
  ('organico',      'Orgânico',      'organico'),
  ('indicacao',     'Indicação',     'indicacao'),
  ('loja',          'Loja física',   'loja')
on conflict (id) do nothing;


create table if not exists custo_midia (
  data          date not null,
  campanha_id   text not null references campanha(id),
  gasto         numeric(12,2) not null default 0,
  impressoes    integer not null default 0,
  cliques       integer not null default 0,
  origem        text not null default 'manual' check (origem in ('manual','meta_api')),
  atualizado_em timestamptz not null default now(),
  primary key (data, campanha_id)
);


-- ----------------------------------------------------------------------------
-- ETAPA do funil.
--
-- No Kommo eram os IDs 142 e 143 reservados. Agora o funil é nosso, então as
-- etapas são linhas — dá para renomear e reordenar sem mexer em código.
--
-- `tipo` é o que o sistema entende; `nome` é o que o vendedor lê. Renomear
-- "Proposta enviada" para "Orçamento" não pode quebrar nenhum relatório.
-- ----------------------------------------------------------------------------
create table if not exists etapa (
  id    text primary key,
  nome  text not null,
  ordem integer not null,
  tipo  text not null default 'aberta' check (tipo in ('aberta','ganho','perdido'))
);

insert into etapa (id, nome, ordem, tipo) values
  ('novo',        'Novo contato',     1, 'aberta'),
  ('atendimento', 'Em atendimento',   2, 'aberta'),
  ('proposta',    'Proposta enviada', 3, 'aberta'),
  ('negociacao',  'Negociação',       4, 'aberta'),
  ('ganho',       'Venda ganha',      5, 'ganho'),
  ('perdido',     'Venda perdida',    6, 'perdido')
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- MOTIVO DE PERDA — lista fixa, não texto livre.
--
-- Se o vendedor digitar o motivo, o relatório vira 40 frases diferentes
-- dizendo a mesma coisa, e não decide nada.
-- ----------------------------------------------------------------------------
create table if not exists motivo_perda (
  id    text primary key,
  nome  text not null,
  ordem integer not null,
  ativo boolean not null default true
);

insert into motivo_perda (id, nome, ordem) values
  ('preco',        'Preço acima do orçamento',   1),
  ('concorrente',  'Comprou em concorrente',     2),
  ('sumiu',        'Não respondeu mais',         3),
  ('pesquisando',  'Só pesquisando preço',       4),
  ('indisponivel', 'Modelo indisponível',        5),
  ('prazo',        'Prazo de entrega',           6),
  ('frete',        'Fora de Fortaleza (frete)',  7)
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- LEAD — agora nosso.
-- ----------------------------------------------------------------------------
create table if not exists lead (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references cliente(id),
  titulo         text,                     -- "Raquete Nox — Ana"
  valor          numeric(12,2),            -- expectativa, não é venda

  etapa_id       text not null default 'novo' references etapa(id),
  responsavel_id uuid references vendedor(id),

  -- CONGELADA na criação. Ver trigger abaixo.
  campanha_id    text references campanha(id),

  -- de onde a origem veio, quando veio de anúncio
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_content    text,
  ctwa_clid      text,                     -- devolve o clique à Meta na CAPI
  ad_id          text,

  motivo_perda_id text references motivo_perda(id),

  criado_em      timestamptz not null default now(),
  fechado_em     timestamptz,
  atualizado_em  timestamptz not null default now(),
  deletado_em    timestamptz,

  -- só para um eventual import futuro; hoje fica nulo
  kommo_lead_id  bigint unique
);

create index if not exists idx_lead_cliente  on lead (cliente_id);
create index if not exists idx_lead_etapa    on lead (etapa_id) where deletado_em is null;
create index if not exists idx_lead_campanha on lead (campanha_id);
create index if not exists idx_lead_criado   on lead (criado_em);
create index if not exists idx_lead_resp     on lead (responsavel_id) where deletado_em is null;


-- Origem congelada: primeiro toque vence. Em novembro o cliente do anúncio de
-- verão volta pelo de Natal; se a origem fosse a última campanha, o verão
-- perderia retroativamente uma venda que gerou.
create or replace function congelar_campanha_lead()
returns trigger language plpgsql as $$
begin
  if old.campanha_id is not null and new.campanha_id is distinct from old.campanha_id then
    new.campanha_id := old.campanha_id;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_congelar_campanha_lead on lead;
create trigger trg_congelar_campanha_lead
  before update on lead for each row execute function congelar_campanha_lead();


-- A venda aponta para a campanha que gerou AQUELA compra (≠ campanha_origem do
-- cliente, que é quem trouxe a pessoa pela primeira vez).
alter table venda drop constraint if exists venda_campanha_id_fkey;
alter table venda add constraint venda_campanha_id_fkey
  foreign key (campanha_id) references campanha(id);


-- ----------------------------------------------------------------------------
-- CANAL — os números por onde a loja fala.
--
-- Existem dois tipos, e eles funcionam por vias diferentes de propósito:
--
--   loja      — o número do anúncio. Cloud API oficial da Meta. Só RECEBE o
--               primeiro contato. É o único lugar onde o `ctwa_clid` chega, e
--               por isso é o número que não pode ser banido.
--   vendedor  — o chip que o vendedor leva no celular. Pareado por QR
--               (Evolution), porque é a única via em que a conversa aparece ao
--               mesmo tempo no CRM e no aplicativo dele.
--
-- `phone_number_id` é o que roteia o webhook: a Meta manda o id do número, não
-- o telefone. Sem esse mapa a mensagem chega sem dono.
-- ----------------------------------------------------------------------------
create table if not exists canal (
  id            text primary key,            -- 'loja', 'vend:gabriel'
  nome          text not null,               -- 'Republic BT', 'Gabriel'
  tipo          text not null check (tipo in ('loja','vendedor')),
  via           text not null check (via in ('cloud_api','evolution')),

  telefone      text not null unique,        -- normalizado, 55DDD9XXXXXXXX

  -- Cloud API: como a Meta identifica o número no webhook
  phone_number_id text unique,
  -- Evolution: o nome da instância pareada por QR
  instancia     text unique,

  -- só faz sentido em tipo='vendedor'
  vendedor_id   uuid references vendedor(id),

  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),

  -- Um canal de loja não tem dono; um de vendedor não existe sem dono. Deixar
  -- isso solto produz conversa que não cai na caixa de ninguém.
  constraint canal_dono_coerente check (
    (tipo = 'loja'     and vendedor_id is null) or
    (tipo = 'vendedor' and vendedor_id is not null)
  ),
  -- Cada via precisa do seu identificador, senão não dá para receber nem enviar.
  constraint canal_via_identificada check (
    (via = 'cloud_api' and phone_number_id is not null) or
    (via = 'evolution' and instancia       is not null)
  )
);

create index if not exists idx_canal_vendedor on canal (vendedor_id) where ativo;


-- ----------------------------------------------------------------------------
-- CONVERSA
--
-- Repare no que NÃO é coluna: `janela_expira_em`. A janela de 24h da Meta é
-- calculada a partir da última mensagem DO CLIENTE — guardá-la como campo faria
-- ela envelhecer errado, do mesmo jeito que o status da conta envelhece.
--
-- E repare no que É coluna agora: `canal_id`. O mesmo cliente tem DUAS conversas
-- abertas ao mesmo tempo — a que ele começou no número da loja e a que o
-- vendedor abriu do número dele. São conversas diferentes, no mesmo lead.
-- ----------------------------------------------------------------------------
create table if not exists conversa (
  id            uuid primary key default gen_random_uuid(),
  canal_id      text not null references canal(id),
  cliente_id    uuid not null references cliente(id),
  lead_id       uuid references lead(id),
  telefone      text not null,               -- o do CLIENTE, normalizado

  status        text not null default 'nova'
                check (status in ('nova','em_atendimento','resolvida')),
  -- nulo = ninguém assumiu. É esta coluna que impede a resposta dupla.
  atendente_id  uuid references vendedor(id),
  assumida_em   timestamptz,

  -- origem do anúncio, quando a conversa nasceu de um Click-to-WhatsApp
  ctwa_clid     text,
  ad_id         text,

  ultima_mensagem_em         timestamptz,
  -- separado de propósito: a janela de 24h conta a partir do CLIENTE
  ultima_mensagem_cliente_em timestamptz,

  nao_lidas     integer not null default 0,
  criada_em     timestamptz not null default now()
);

create index if not exists idx_conversa_cliente on conversa (cliente_id);
create index if not exists idx_conversa_lead    on conversa (lead_id);
create index if not exists idx_conversa_fila
  on conversa (canal_id, ultima_mensagem_em desc) where status <> 'resolvida';

-- UMA thread por par (nosso número, número do cliente). Para sempre.
--
-- Duas mudanças aqui, e as duas foram erro antes:
--
-- 1. O índice antigo era único só por TELEFONE. Como o cliente passa a ter uma
--    conversa no número da loja e outra no número do vendedor ao mesmo tempo, a
--    segunda era rejeitada pelo banco — o fluxo inteiro morria com erro de
--    chave duplicada, que não diz nada a quem lê.
--
-- 2. O índice antigo era parcial (`where status <> 'resolvida'`), então um
--    cliente que voltasse depois de resolvido ganhava uma thread nova e o
--    histórico se partia em pedaços. O WhatsApp tem uma conversa por contato, e
--    é assim que qualquer pessoa espera que funcione. `status` volta a ser só
--    um marcador de trabalho, que pode reabrir.
create unique index if not exists idx_conversa_canal_telefone
  on conversa (canal_id, telefone);


-- ----------------------------------------------------------------------------
-- MENSAGEM
-- ----------------------------------------------------------------------------
create table if not exists mensagem (
  id            uuid primary key default gen_random_uuid(),
  conversa_id   uuid not null references conversa(id) on delete cascade,
  direcao       text not null check (direcao in ('entrada','saida')),
  tipo          text not null default 'texto'
                -- 'outro' existe porque o WhatsApp inventa tipo novo sem avisar
                -- (enquete, pedido, reação). Recusar o desconhecido faria a
                -- mensagem sumir da conversa e o vendedor responderia no vazio;
                -- guardar como 'outro' mantém a thread honesta.
                check (tipo in ('texto','imagem','audio','video','documento',
                                'localizacao','contato','sistema','outro')),
  conteudo      text,
  midia_url     text,

  -- Idempotência: o webhook da Meta chega repetido e fora de ordem.
  wa_message_id text unique,
  status        text not null default 'enviada'
                check (status in ('enviada','entregue','lida','falhou')),
  erro          text,
  -- nulo quando a mensagem é do cliente
  autor_id      uuid references vendedor(id),

  -- `enviada_em` é o relógio do WhatsApp; `criada_em` é o nosso.
  --
  -- Os dois existem porque a Meta reenvia e entrega fora de ordem: uma mensagem
  -- das 14h02 pode chegar depois da das 14h05. Ordenar pelo nosso relógio
  -- montaria a conversa embaralhada, e o vendedor leria a resposta antes da
  -- pergunta. A diferença entre os dois também é a medida honesta de atraso.
  enviada_em    timestamptz not null default now(),
  criada_em     timestamptz not null default now()
);

-- Ordenação pelo relógio do WhatsApp, nunca por ordem de chegada.
create index if not exists idx_mensagem_conversa on mensagem (conversa_id, enviada_em);


-- ----------------------------------------------------------------------------
-- Log cru do webhook da Meta. Barato, e salva a pele: se o parser tiver um bug,
-- dá para reprocessar em vez de perder as mensagens do dia.
-- ----------------------------------------------------------------------------
create table if not exists evento_webhook (
  id            bigserial primary key,
  origem        text not null default 'meta',
  recebido_em   timestamptz not null default now(),
  corpo         jsonb not null,
  processado_em timestamptz,
  erro          text
);

create index if not exists idx_evento_nao_processado
  on evento_webhook (recebido_em) where processado_em is null;


-- ============================================================================
-- VIEWS
-- ============================================================================

-- A caixa de entrada, com a janela de 24h calculada na hora.
--
-- `security_invoker = true` é o que faz o RLS de `conversa` continuar valendo
-- aqui dentro. Sem isso a view roda com os direitos de quem a criou e vira uma
-- porta dos fundos: o vendedor não lê a tabela, mas lê a view — e a view mostra
-- a caixa da loja inteira. A view não é o lugar de afrouxar acesso; quando ela
-- serve para esconder COLUNA (como `v_produto_venda`), aí sim é o contrário.
create or replace view v_conversa
with (security_invoker = true) as
select
  c.*,
  cl.nome   as cliente_nome,
  v.nome    as atendente_nome,
  ca.nome   as canal_nome,
  ca.tipo   as canal_tipo,
  ca.via    as canal_via,
  l.etapa_id,
  l.campanha_id,
  camp.nome as campanha_nome,
  -- A última mensagem, para a lista não precisar de uma consulta por linha.
  (select m.conteudo from mensagem m
    where m.conversa_id = c.id order by m.enviada_em desc limit 1) as ultima_mensagem,
  (select m.direcao  from mensagem m
    where m.conversa_id = c.id order by m.enviada_em desc limit 1) as ultima_direcao,
  -- A janela vale para o canal `cloud_api`. No `evolution` não existe janela —
  -- e mostrar um aviso que não se aplica ensina o vendedor a ignorar avisos.
  case when ca.via = 'cloud_api'
       then c.ultima_mensagem_cliente_em + interval '24 hours' end as janela_expira_em,
  case when ca.via <> 'cloud_api' then true
       else (c.ultima_mensagem_cliente_em is not null
             and c.ultima_mensagem_cliente_em > now() - interval '24 hours')
  end as janela_aberta
from conversa c
join canal ca on ca.id = c.canal_id
join cliente cl on cl.id = c.cliente_id
left join vendedor v on v.id = c.atendente_id
left join lead l on l.id = c.lead_id
left join campanha camp on camp.id = l.campanha_id;


-- O funil, do jeito que o kanban precisa.
create or replace view v_funil as
select
  e.id as etapa_id, e.nome as etapa_nome, e.ordem, e.tipo,
  count(l.id)::int                   as leads,
  coalesce(sum(l.valor), 0)          as valor
from etapa e
left join lead l on l.etapa_id = e.id and l.deletado_em is null
group by e.id, e.nome, e.ordem, e.tipo;


-- ============================================================================
-- FUNÇÕES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- assumir_conversa — a trava que impede dois vendedores de responderem juntos.
--
-- É um UPDATE CONDICIONAL, não um "leia e depois escreva". Se fosse em dois
-- passos, os dois leriam "está livre" antes de qualquer um escrever, e os dois
-- entrariam. Aqui o segundo simplesmente não atualiza linha nenhuma e recebe
-- `false` — que é a resposta certa.
-- ----------------------------------------------------------------------------
create or replace function assumir_conversa(p_conversa uuid, p_vendedor uuid)
returns boolean
language plpgsql
as $$
declare v_ok boolean;
begin
  update conversa
  set atendente_id = p_vendedor,
      assumida_em  = coalesce(assumida_em, now()),
      status       = 'em_atendimento'
  where id = p_conversa
    and (atendente_id is null or atendente_id = p_vendedor)
  returning true into v_ok;

  return coalesce(v_ok, false);
end $$;


-- Devolver a conversa para a fila.
create or replace function liberar_conversa(p_conversa uuid)
returns void language sql as $$
  update conversa
  set atendente_id = null, assumida_em = null, status = 'nova'
  where id = p_conversa;
$$;


-- ----------------------------------------------------------------------------
-- criar_lead — usada pela captura rápida E pelo webhook da Meta.
--
-- Um caminho só de criação: se a tela criasse de um jeito e o webhook de outro,
-- os dados divergiriam conforme a porta de entrada, e isso é impossível de
-- depurar depois.
-- ----------------------------------------------------------------------------
create or replace function criar_lead(
  p_telefone       text,
  p_nome           text default null,
  p_campanha_id    text default null,
  p_campanha_nome  text default null,
  p_campanha_canal text default 'meta',
  p_responsavel_id uuid default null,
  p_titulo         text default null,
  p_valor          numeric default null,
  p_utm            jsonb default null
)
returns uuid
language plpgsql
as $$
declare
  v_cliente uuid;
  v_lead    uuid;
begin
  -- A campanha é garantida aqui, não pela aplicação: a chave estrangeira não
  -- perdoa ordem, e se a tela esquecer de criá-la o lead inteiro é rejeitado.
  if p_campanha_id is not null then
    insert into campanha (id, nome, canal)
    values (p_campanha_id, coalesce(p_campanha_nome, p_campanha_id),
            coalesce(p_campanha_canal, 'meta'))
    on conflict (id) do nothing;
  end if;

  -- `nullif` porque "não rastreado" NÃO é uma origem, é a ausência dela.
  --
  -- A origem do cliente é congelada no primeiro toque e nunca mais muda. Se
  -- gravássemos 'nao_rastreado' ali, o cliente que mandou um "oi" solto na
  -- segunda e clicou no anúncio na terça ficaria marcado como sem origem para
  -- sempre — e o anúncio que trouxe a venda perderia o crédito. Congela-se a
  -- primeira origem CONHECIDA, não a primeira linha gravada.
  v_cliente := identificar_cliente(p_telefone, p_nome, null,
                                   nullif(p_campanha_id, 'nao_rastreado'));

  insert into lead (
    cliente_id, titulo, valor, responsavel_id, campanha_id,
    utm_source, utm_medium, utm_campaign, utm_content, ctwa_clid, ad_id
  ) values (
    v_cliente, p_titulo, p_valor, p_responsavel_id, p_campanha_id,
    p_utm->>'utm_source', p_utm->>'utm_medium', p_utm->>'utm_campaign',
    p_utm->>'utm_content', p_utm->>'ctwa_clid', p_utm->>'ad_id'
  )
  returning id into v_lead;

  return v_lead;
end $$;


-- ----------------------------------------------------------------------------
-- identificar_cliente — o casamento das três aparições.
--
-- Na dúvida, cria separado: juntar dois cadastros depois dá trabalho mas é
-- possível; separar duas pessoas fundidas por engano é quase impossível,
-- porque as compras já se misturaram.
-- ----------------------------------------------------------------------------
create or replace function identificar_cliente(
  p_telefone_bruto text,
  p_nome text default null,
  p_email text default null,
  p_campanha_origem text default null
)
returns uuid
language plpgsql
as $$
declare
  v_tel text := normalizar_telefone(p_telefone_bruto);
  v_id  uuid;
begin
  if v_tel is not null then
    select id into v_id from cliente where telefone = v_tel;
  end if;

  if v_id is null and p_email is not null and p_email <> '' then
    select id into v_id from cliente where lower(email) = lower(p_email) limit 1;
  end if;

  if v_id is not null then
    -- completa o que faltava, sem sobrescrever o que já existe
    update cliente set
      nome     = coalesce(cliente.nome, p_nome),
      email    = coalesce(cliente.email, nullif(p_email, '')),
      telefone = coalesce(cliente.telefone, v_tel),
      campanha_origem = coalesce(cliente.campanha_origem, p_campanha_origem)
    where id = v_id;
    return v_id;
  end if;

  insert into cliente (telefone, nome, email, campanha_origem)
  values (v_tel, p_nome, nullif(p_email, ''), p_campanha_origem)
  returning id into v_id;

  return v_id;
end $$;


-- ----------------------------------------------------------------------------
-- mover_lead — arrastar no kanban.
--
-- Perder exige motivo, e o motivo vem da lista. Sem isso o relatório de perdas
-- não decide nada.
-- ----------------------------------------------------------------------------
create or replace function mover_lead(
  p_lead uuid,
  p_etapa text,
  p_motivo_perda text default null
)
returns void
language plpgsql
as $$
declare v_tipo text;
begin
  select tipo into v_tipo from etapa where id = p_etapa;
  if not found then
    raise exception 'etapa % não existe', p_etapa;
  end if;

  if v_tipo = 'perdido' and p_motivo_perda is null then
    raise exception 'perder um lead exige motivo' using errcode = 'check_violation';
  end if;

  update lead set
    etapa_id        = p_etapa,
    motivo_perda_id = case when v_tipo = 'perdido' then p_motivo_perda else null end,
    fechado_em      = case when v_tipo in ('ganho','perdido') then now() end
  where id = p_lead;
end $$;


-- ----------------------------------------------------------------------------
-- casar_venda_com_lead — chamada ao registrar a venda.
-- Devolve cliente e campanha para congelar na venda.
-- ----------------------------------------------------------------------------
create or replace function casar_venda_com_lead(p_telefone_bruto text)
returns table (cliente_id uuid, lead_id uuid, campanha_id text)
language sql
stable
as $$
  with alvo as (select normalizar_telefone(p_telefone_bruto) as tel)
  select c.id, l.id, l.campanha_id
  from cliente c
  join alvo a on a.tel is not null
  left join lateral (
    select l2.* from lead l2
    where l2.cliente_id = c.id and l2.deletado_em is null
    -- primeiro toque: o lead mais antigo é quem trouxe o cliente
    order by l2.criado_em asc limit 1
  ) l on true
  where c.telefone = a.tel
     -- mesma pessoa cadastrada sem o nono dígito
     or c.telefone = left(a.tel, 4) || substring(a.tel from 6)
  limit 1;
$$;


-- ----------------------------------------------------------------------------
-- campanha_do_referral — o `referral` da Meta virando uma campanha nossa.
--
-- Chega assim, na primeira mensagem de quem clicou no anúncio:
--
--   { "source_id": "120219...", "source_type": "ad", "headline": "...",
--     "body": "...", "source_url": "https://fb.me/...", "ctwa_clid": "ARAa..." }
--
-- `source_id` é o ANÚNCIO, não a campanha. É o que a Meta dá, e é o que a gente
-- grava — inventar um id de campanha que não existe seria pior do que não ter.
-- ----------------------------------------------------------------------------
create or replace function campanha_do_referral(p_referral jsonb, p_texto text default null)
returns text
language plpgsql
as $$
declare
  v_ad     text := nullif(p_referral->>'source_id', '');
  v_codigo text;
  v_nome   text;
begin
  /*
   * SEM REFERRAL, TENTA O CÓDIGO NO TEXTO.
   *
   * O `referral` só existe em Click-to-WhatsApp. Mas boa parte do que traz
   * cliente NÃO é anúncio: QR code no balcão, link no story, link que um
   * professor de beach tennis manda para os alunos. Nesses casos a mensagem
   * chega sem origem nenhuma e o lead nasce "não rastreado" — que é o mesmo
   * que não saber de onde vem metade do movimento.
   *
   * A saída é o link já trazer o código no texto:
   *
   *   wa.me/5585...?text=Quero a Nox [VERAO26]
   *
   * O cliente não digita nada: o WhatsApp abre com a frase pronta. Aqui a
   * gente lê o que está entre colchetes e casa com a campanha.
   */
  if v_ad is null and p_texto is not null then
    v_codigo := upper((regexp_match(p_texto, '\[([A-Za-z0-9_-]{2,30})\]'))[1]);

    if v_codigo is not null then
      -- Só aceita código que EXISTE. Senão qualquer pessoa escrevendo
      -- "[TESTE]" criaria uma campanha fantasma no painel de mídia.
      if exists (select 1 from campanha where upper(codigo) = v_codigo and ativa) then
        return (select id from campanha where upper(codigo) = v_codigo and ativa limit 1);
      end if;
    end if;
  end if;

  if v_ad is null then
    return 'nao_rastreado';
  end if;

  -- O título do anúncio é o nome legível até o job da API de Marketing rodar.
  -- Sem ele o painel mostraria "meta:ad:120219..." e ninguém decide nada olhando
  -- para um número de 17 dígitos.
  v_nome := coalesce(nullif(p_referral->>'headline', ''), 'Anúncio ' || v_ad);

  insert into campanha (id, nome, canal, meta_ad_id)
  values ('meta:ad:' || v_ad, v_nome, 'meta', v_ad)
  on conflict (id) do nothing;

  return 'meta:ad:' || v_ad;
end $$;


-- ----------------------------------------------------------------------------
-- receber_mensagem — a única porta de entrada de mensagem de cliente.
--
-- Faz tudo o que a chegada exige, numa transação só: acha ou cria o cliente,
-- acha ou cria a thread, cria o lead se for o primeiro contato, e grava a
-- mensagem. Se isso estivesse espalhado pela aplicação, uma falha no meio
-- deixaria conversa sem lead ou lead sem conversa — e ninguém descobre isso no
-- dia, descobre no fim do mês quando o relatório não bate.
--
-- IDEMPOTENTE por `wa_message_id`, e isso não é zelo: a Meta reenvia o webhook
-- sempre que não recebe 200 rápido o bastante. Sem a trava, uma lentidão nossa
-- vira mensagem repetida na tela do vendedor e contador de não lidas inflado.
-- ----------------------------------------------------------------------------
create or replace function receber_mensagem(
  p_canal_id      text,
  p_telefone      text,
  p_nome          text        default null,
  p_wa_message_id text        default null,
  p_tipo          text        default 'texto',
  p_conteudo      text        default null,
  p_midia_url     text        default null,
  p_enviada_em    timestamptz default now(),
  p_referral      jsonb       default null
)
returns table (conversa_id uuid, lead_id uuid, mensagem_id uuid, primeira boolean)
language plpgsql
as $$
declare
  v_tel      text := normalizar_telefone(p_telefone);
  v_campanha text;
  v_cliente  uuid;
  v_conversa uuid;
  v_lead     uuid;
  v_msg      uuid;
  v_primeira boolean := false;
begin
  -- `normalizar_telefone` é lenient de propósito: número estrangeiro passa
  -- inteiro, sem ganhar o 55. Ótimo para cadastro digitado à mão, insuficiente
  -- aqui — o WhatsApp sempre entrega o número internacional completo, então
  -- qualquer coisa com menos de 10 dígitos é lixo de parser, e lixo de parser
  -- vira cliente fantasma no funil se não morrer na porta.
  if v_tel is null or length(v_tel) < 10 then
    raise exception 'telefone inválido: %', p_telefone using errcode = 'check_violation';
  end if;
  if not exists (select 1 from canal where id = p_canal_id and ativo) then
    raise exception 'canal % não existe ou está inativo', p_canal_id;
  end if;

  -- O texto vai junto: sem `referral`, a origem pode estar no [CODIGO].
  v_campanha := campanha_do_referral(p_referral, p_conteudo);

  -- A campanha de origem do CLIENTE só é gravada se ele ainda não tinha uma:
  -- quem trouxe a pessoa foi o primeiro anúncio, não o último. O `nullif` vive
  -- dentro de `identificar_cliente` — ver a nota em `criar_lead`.
  v_cliente := identificar_cliente(v_tel, p_nome, null,
                                   nullif(v_campanha, 'nao_rastreado'));

  -- ---- a thread: uma por (nosso número, número dele) -----------------------
  select id into v_conversa
  from conversa where canal_id = p_canal_id and telefone = v_tel;

  if v_conversa is null then
    v_primeira := true;
    insert into conversa (canal_id, cliente_id, telefone, ctwa_clid, ad_id)
    values (p_canal_id, v_cliente, v_tel,
            nullif(p_referral->>'ctwa_clid', ''),
            nullif(p_referral->>'source_id', ''))
    returning id into v_conversa;
  end if;

  -- ---- o lead: um por interesse, não um por mensagem -----------------------
  -- Reaproveita o lead ABERTO do cliente. Sem isso, cada mensagem nova viraria
  -- um card no funil e o kanban afogaria em duplicata no primeiro dia. Cliente
  -- que já comprou e volta ganha lead novo — aí é outra venda de verdade.
  select l.id into v_lead
  from lead l
  where l.cliente_id = v_cliente and l.deletado_em is null and l.fechado_em is null
  order by l.criado_em desc limit 1;

  if v_lead is null then
    v_lead := criar_lead(
      p_telefone       => v_tel,
      p_nome           => p_nome,
      p_campanha_id    => v_campanha,
      p_campanha_nome  => nullif(p_referral->>'headline', ''),
      p_utm            => jsonb_build_object(
                            'ctwa_clid', p_referral->>'ctwa_clid',
                            'ad_id',     p_referral->>'source_id',
                            'utm_source','meta')
    );
  end if;

  -- Qualificado (`conversa.lead_id`) porque `returns table (lead_id ...)` cria
  -- uma variável com o mesmo nome da coluna, e o Postgres recusa a ambiguidade.
  update conversa set lead_id = v_lead
  where conversa.id = v_conversa and conversa.lead_id is null;

  -- ---- a mensagem ----------------------------------------------------------
  insert into mensagem (conversa_id, direcao, tipo, conteudo, midia_url,
                        wa_message_id, status, enviada_em)
  values (v_conversa, 'entrada', p_tipo, p_conteudo, p_midia_url,
          nullif(p_wa_message_id, ''), 'entregue', p_enviada_em)
  on conflict (wa_message_id) do nothing
  returning id into v_msg;

  -- Reenvio: a mensagem já estava lá. Sai sem mexer em contador nem em relógio.
  if v_msg is null then
    return query select v_conversa, v_lead, null::uuid, false;
    return;
  end if;

  update conversa set
    -- `greatest` porque a Meta entrega fora de ordem: uma mensagem atrasada das
    -- 14h02 não pode fazer a conversa "voltar no tempo" e sumir do topo da fila.
    ultima_mensagem_em         = greatest(coalesce(ultima_mensagem_em, p_enviada_em), p_enviada_em),
    ultima_mensagem_cliente_em = greatest(coalesce(ultima_mensagem_cliente_em, p_enviada_em), p_enviada_em),
    nao_lidas                  = nao_lidas + 1,
    status                     = case when status = 'resolvida' then 'nova' else status end
  where id = v_conversa;

  return query select v_conversa, v_lead, v_msg, v_primeira;
end $$;


-- ----------------------------------------------------------------------------
-- abrir_no_meu_numero — o movimento central do atendimento.
--
-- O cliente chegou pelo número da loja. Quando o vendedor assume, ele começa
-- uma conversa NOVA, do número dele, e é ali que a venda acontece. Não é
-- transferência: as duas threads continuam existindo, ligadas pelo mesmo lead.
--
-- Devolve a conversa de destino, criando-a se ainda não houver. Uma thread por
-- par (nosso número, número do cliente) — abrir uma segunda partiria o
-- histórico que no celular do vendedor é um só.
-- ----------------------------------------------------------------------------
create or replace function abrir_no_meu_numero(
  p_conversa_origem uuid,
  p_vendedor uuid
)
returns uuid
language plpgsql
as $$
declare
  v_origem  conversa%rowtype;
  v_canal   text;
  v_destino uuid;
begin
  select * into v_origem from conversa where id = p_conversa_origem;
  if not found then
    raise exception 'conversa de origem não existe';
  end if;

  select id into v_canal from canal
  where vendedor_id = p_vendedor and tipo = 'vendedor' and ativo
  limit 1;

  if v_canal is null then
    raise exception 'você ainda não tem um número conectado ao CRM'
      using errcode = 'check_violation';
  end if;

  select id into v_destino from conversa
  where canal_id = v_canal and telefone = v_origem.telefone;

  if v_destino is null then
    insert into conversa (canal_id, cliente_id, lead_id, telefone,
                          status, atendente_id, assumida_em)
    values (v_canal, v_origem.cliente_id, v_origem.lead_id, v_origem.telefone,
            'em_atendimento', p_vendedor, now())
    returning id into v_destino;
  end if;

  return v_destino;
end $$;


-- Marcar como lida: some o contador, e só.
create or replace function marcar_lida(p_conversa uuid)
returns void language sql as $$
  update conversa set nao_lidas = 0 where id = p_conversa;
$$;


alter table canal          enable row level security;
alter table campanha       enable row level security;
alter table custo_midia    enable row level security;
alter table etapa          enable row level security;
alter table motivo_perda   enable row level security;
alter table lead           enable row level security;
alter table conversa       enable row level security;
alter table mensagem       enable row level security;
alter table evento_webhook enable row level security;
