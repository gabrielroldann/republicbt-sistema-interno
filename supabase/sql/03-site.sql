-- ============================================================================
-- Republic BT — vitrine e reserva de estoque
--
-- Depende de 01-nucleo.sql (`produto`, `movimento_estoque`, `saldo_estoque`).
-- As colunas de vitrine do produto — slug, descrição, publicado, ordem — já
-- vivem no núcleo, porque produto é um só para site e loja.
--
-- A parte que importa aqui é `reservar_estoque`. Ela existe porque verificar o
-- saldo e depois inserir a reserva, em dois passos, é exatamente onde duas
-- pessoas comprando a última raquete no mesmo segundo passam as duas.
-- ============================================================================

create table if not exists produto_foto (
  id         uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produto(id) on delete cascade,
  url        text not null,
  alt        text,
  ordem      integer not null default 0
);

create index if not exists idx_foto_produto on produto_foto (produto_id);


-- ----------------------------------------------------------------------------
-- RESERVA
--
-- Reserva NÃO é baixa: não entra no financeiro, não vira custo, não é venda.
-- É uma promessa com validade. Se o pagamento não confirmar, expira e a peça
-- volta para a vitrine sozinha.
-- ----------------------------------------------------------------------------
create table if not exists reserva_estoque (
  id          uuid primary key default gen_random_uuid(),
  produto_id  uuid not null references produto(id),
  quantidade  integer not null check (quantidade > 0),
  pedido_id   uuid,
  criada_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  liberada_em timestamptz          -- preenchida ao virar venda ou ao cancelar
);

create index if not exists idx_reserva_ativa
  on reserva_estoque (produto_id) where liberada_em is null;


-- ----------------------------------------------------------------------------
-- Disponível para venda: o físico menos o que já está prometido a alguém.
-- É este que o site mostra, e é o mesmo que o balcão precisa enxergar — senão
-- o vendedor vende presencialmente a peça que alguém está pagando online.
-- ----------------------------------------------------------------------------
create or replace view disponivel_estoque as
select p.id as produto_id,
       s.saldo,
       coalesce(r.reservado, 0)::int as reservado,
       (s.saldo - coalesce(r.reservado, 0))::int as disponivel
from produto p
join saldo_estoque s on s.produto_id = p.id
left join (
  select produto_id, sum(quantidade) as reservado
  from reserva_estoque
  where liberada_em is null
    and expira_em > now()          -- reserva vencida não segura nada
  group by produto_id
) r on r.produto_id = p.id;


-- ----------------------------------------------------------------------------
-- reservar_estoque
--
-- `for update` na linha do produto serializa as tentativas concorrentes: a
-- segunda requisição espera a primeira terminar, relê o saldo já atualizado e
-- recebe "esgotado", que é a resposta certa.
--
-- Sem esse lock, as duas leem "tem 1" antes de qualquer uma escrever. O teste
-- manual nunca pega isso; a primeira promoção pega.
-- ----------------------------------------------------------------------------
create or replace function reservar_estoque(
  p_produto_id uuid,
  p_quantidade int,
  p_pedido_id uuid default null,
  p_minutos int default 20
)
returns uuid
language plpgsql
as $$
declare
  v_disponivel int;
  v_reserva_id uuid;
begin
  if p_quantidade <= 0 then
    raise exception 'quantidade precisa ser positiva';
  end if;

  perform 1 from produto where id = p_produto_id for update;
  if not found then
    raise exception 'produto % não existe', p_produto_id;
  end if;

  select disponivel into v_disponivel
  from disponivel_estoque where produto_id = p_produto_id;

  if coalesce(v_disponivel, 0) < p_quantidade then
    raise exception 'estoque insuficiente: disponível %, pedido %',
      coalesce(v_disponivel, 0), p_quantidade using errcode = 'check_violation';
  end if;

  insert into reserva_estoque (produto_id, quantidade, pedido_id, expira_em)
  values (p_produto_id, p_quantidade, p_pedido_id,
          now() + make_interval(mins => p_minutos))
  returning id into v_reserva_id;

  return v_reserva_id;
end $$;


-- ----------------------------------------------------------------------------
-- confirmar_reserva — pagamento aprovado.
--
-- A baixa acontece AQUI: não na criação do pedido (carrinho abandonado furaria
-- o estoque) nem no despacho (venderia de novo o que já foi pago).
-- ----------------------------------------------------------------------------
create or replace function confirmar_reserva(
  p_reserva_id uuid,
  p_custo_unit numeric default null
)
returns void
language plpgsql
as $$
declare r reserva_estoque;
begin
  select * into r from reserva_estoque where id = p_reserva_id for update;
  if not found then
    raise exception 'reserva % não existe', p_reserva_id;
  end if;

  -- Idempotência: o webhook do gateway chega mais de uma vez, e confirmar duas
  -- vezes viraria duas baixas de estoque.
  if r.liberada_em is not null then
    return;
  end if;

  insert into movimento_estoque (produto_id, quantidade, tipo, custo_unit, observacao)
  values (r.produto_id, -r.quantidade, 'venda', p_custo_unit,
          'pedido ' || coalesce(r.pedido_id::text, 'site'));

  update reserva_estoque set liberada_em = now() where id = p_reserva_id;
end $$;


create or replace function cancelar_reserva(p_reserva_id uuid)
returns void language sql as $$
  update reserva_estoque set liberada_em = now()
  where id = p_reserva_id and liberada_em is null;
$$;


-- Higiene, no cron. A view já ignora reserva vencida, então isto não muda o que
-- o site mostra: serve para a tabela não crescer para sempre.
create or replace function limpar_reservas_vencidas()
returns int language sql as $$
  with liberadas as (
    update reserva_estoque set liberada_em = now()
    where liberada_em is null and expira_em <= now()
    returning 1
  )
  select count(*)::int from liberadas;
$$;


-- ----------------------------------------------------------------------------
-- SESSÃO DO SITE — a UTM entra aqui e congela.
-- Quando a venda fecha no site, a origem para de ser inferida e vira campo.
-- ----------------------------------------------------------------------------
create table if not exists sessao_site (
  id           uuid primary key default gen_random_uuid(),
  criada_em    timestamptz not null default now(),
  cliente_id   uuid references cliente(id),
  utm_source   text, utm_medium text, utm_campaign text,
  utm_content  text, utm_term   text,
  referrer     text,
  fbclid       text,          -- devolve o clique à Meta na Conversions API
  primeira_url text
);

create index if not exists idx_sessao_cliente on sessao_site (cliente_id);


alter table produto_foto    enable row level security;
alter table reserva_estoque enable row level security;
alter table sessao_site     enable row level security;
