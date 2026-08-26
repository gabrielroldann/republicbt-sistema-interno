-- ============================================================================
-- Republic BT — núcleo do banco
--
-- Espelho de `dashboard/src/types.ts`. As regras de negócio que já estão
-- testadas no dashboard viram restrição de banco aqui, para não dependerem de
-- ninguém lembrar delas depois.
--
-- Ordem: este arquivo primeiro, depois 02-kommo.sql e 03-site.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Telefone: a chave que costura cliente, lead e venda.
--
-- Mora aqui, e em nenhum outro lugar. Se o site normalizar de um jeito e o
-- webhook do Kommo de outro, o casamento falha sem erro nenhum aparecer.
-- ----------------------------------------------------------------------------
create or replace function normalizar_telefone(bruto text)
returns text language plpgsql immutable as $$
declare d text; ddd int; primeiro text;
begin
  if bruto is null or btrim(bruto) = '' then return null; end if;

  d := regexp_replace(bruto, '\D', '', 'g');
  d := regexp_replace(d, '^0+', '');
  if d = '' then return null; end if;

  -- Prefixar 55 às cegas quebra número estrangeiro: +1 415 555 0100 tem 11
  -- dígitos e viraria "5514155550100". Por isso o formato é conferido antes.
  --   10 dígitos = DDD + 8   (fixo, ou celular antigo sem o nono dígito)
  --   11 dígitos = DDD + 9+8 → o terceiro dígito PRECISA ser 9
  if length(d) in (10, 11) then
    ddd := substring(d from 1 for 2)::int;
    if ddd between 11 and 99
       and (length(d) = 10 or substring(d from 3 for 1) = '9') then
      d := '55' || d;
    end if;
  end if;

  if left(d, 2) <> '55' then return d; end if;

  -- 55 + DDD + 8 dígitos = celular antigo. Fixo começa com 2..5, celular 6..9.
  if length(d) = 12 then
    primeiro := substring(d from 5 for 1);
    if primeiro in ('6','7','8','9') then
      d := left(d, 4) || '9' || substring(d from 5);
    end if;
  end if;

  return d;
end $$;


-- ----------------------------------------------------------------------------
-- CLIENTE — a identidade da loja.
--
-- A mesma pessoa aparece como contato no Kommo, conta no site e venda no
-- balcão. Sem esta tabela, "quanto essa pessoa já comprou" não tem resposta.
-- Lead, pedido e venda apenas REFERENCIAM; nenhum deles guarda a identidade.
-- ----------------------------------------------------------------------------
create table if not exists cliente (
  id                  uuid primary key default gen_random_uuid(),
  telefone            text unique,          -- normalizado; único, mas pode ser nulo
  nome                text,
  email               text,
  cidade              text,
  -- Campanha que trouxe a PESSOA, não a que gerou uma compra específica.
  -- Serve para "qual campanha traz cliente que volta". Congelada.
  campanha_origem     text,
  primeiro_contato_em timestamptz not null default now(),
  criado_em           timestamptz not null default now()
);

create index if not exists idx_cliente_email on cliente (email) where email is not null;

-- Origem congelada: primeiro toque vence, sempre.
create or replace function congelar_origem_cliente()
returns trigger language plpgsql as $$
begin
  if old.campanha_origem is not null
     and new.campanha_origem is distinct from old.campanha_origem then
    new.campanha_origem := old.campanha_origem;
  end if;
  return new;
end $$;

drop trigger if exists trg_congelar_origem_cliente on cliente;
create trigger trg_congelar_origem_cliente
  before update on cliente for each row execute function congelar_origem_cliente();


-- ----------------------------------------------------------------------------
-- VENDEDOR
--
-- `comissao_pct` aqui é a taxa ATUAL, usada só para preencher vendas novas.
-- A venda guarda o próprio percentual: mudar a comissão não pode reescrever
-- o que já foi vendido.
-- ----------------------------------------------------------------------------
create table if not exists vendedor (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  iniciais     text not null,
  meta_mensal  numeric(12,2) not null default 0,
  comissao_pct numeric(5,2)  not null default 0,
  -- Nunca apagar vendedor: as vendas dele continuam existindo e precisam de nome.
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- PRODUTO
--
-- Repare no que NÃO existe aqui: campo de estoque. Estoque é movimento, e o
-- saldo é conta. Campo de saldo é exatamente o que desincroniza.
--
-- `custo` é o custo médio atual, para reposição e precificação. A venda congela
-- o custo dela.
-- ----------------------------------------------------------------------------
create table if not exists produto (
  id          uuid primary key default gen_random_uuid(),
  sku         text unique not null,
  nome        text not null,
  categoria   text not null
              check (categoria in ('raquetes','roupas','raqueteiras','acessorios')),
  marca       text not null default '',
  custo       numeric(12,2) not null default 0,
  preco       numeric(12,2) not null default 0,
  estoque_min integer not null default 0,
  ativo       boolean not null default true,

  -- vitrine do site (usadas só quando o site existir)
  slug        text unique,
  descricao   text,
  publicado   boolean not null default false,
  ordem       integer not null default 0,

  criado_em   timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- MOVIMENTO DE ESTOQUE — positivo entra, negativo sai.
--
-- `custo_unit` é congelado no movimento: comprar um lote mais caro semana que
-- vem não pode reescrever a margem do que já foi vendido.
-- `frete_rateado` é o frete da compra dividido por unidade — 20 raquetes a
-- R$400 com R$600 de frete custam R$430 cada, não R$400.
-- ----------------------------------------------------------------------------
create table if not exists movimento_estoque (
  id            uuid primary key default gen_random_uuid(),
  produto_id    uuid not null references produto(id),
  quantidade    integer not null check (quantidade <> 0),
  tipo          text not null
                check (tipo in ('entrada','venda','ajuste','devolucao','perda')),
  custo_unit    numeric(12,2),
  frete_rateado numeric(12,2) not null default 0,
  venda_id      uuid,
  observacao    text,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_movimento_produto on movimento_estoque (produto_id);
create index if not exists idx_movimento_data    on movimento_estoque (criado_em);


-- ----------------------------------------------------------------------------
-- VENDA
--
-- Quatro colunas são SNAPSHOT e nunca devem ser recalculadas por consulta:
--   preco_unit    o preço praticado naquele dia
--   custo_unit    o custo do produto naquele dia
--   comissao_pct  a comissão do vendedor naquele dia
--   taxa_pct      a taxa da forma de pagamento naquele dia
--
-- A `taxa_pct` é a correção de um furo que existia no dashboard: a taxa era
-- consultada na tabela de formas de pagamento a cada leitura. Bastava a
-- maquininha mudar de preço para toda a margem histórica mudar junto.
-- ----------------------------------------------------------------------------
create table if not exists venda (
  id               uuid primary key default gen_random_uuid(),
  data             date not null,
  produto_id       uuid not null references produto(id),
  vendedor_id      uuid not null references vendedor(id),
  cliente_id       uuid references cliente(id),

  quantidade       integer not null check (quantidade > 0),
  preco_unit       numeric(12,2) not null check (preco_unit >= 0),
  custo_unit       numeric(12,2) not null check (custo_unit >= 0),

  forma_pagamento  text not null
                   check (forma_pagamento in ('pix','credito','credito_parcelado','debito','dinheiro')),
  parcelas         integer not null default 1 check (parcelas >= 1),
  taxa_pct         numeric(5,2) not null default 0,
  comissao_pct     numeric(5,2) not null default 0,

  entrega          text not null default 'pendente'
                   check (entrega in ('pendente','entregue')),
  canal            text check (canal in
                   ('trafego_pago','instagram','indicacao','whatsapp','presencial','recompra','site')),
  -- campanha que gerou ESTA compra (≠ campanha_origem do cliente)
  campanha_id      text,

  -- Trade-in: o crédito NÃO é desconto. É troca de caixa por ativo — entra menos
  -- dinheiro, mas a loja ganha uma raquete de seminovas. Por isso reduz o
  -- `a_receber` e não a margem.
  trade_in_modelo  text,
  trade_in_valor   numeric(12,2) not null default 0 check (trade_in_valor >= 0),
  trade_in_recebida boolean not null default false,

  observacoes      text,
  criado_em        timestamptz not null default now()
);

create index if not exists idx_venda_data     on venda (data);
create index if not exists idx_venda_vendedor on venda (vendedor_id);
create index if not exists idx_venda_produto  on venda (produto_id);
create index if not exists idx_venda_cliente  on venda (cliente_id);


-- ----------------------------------------------------------------------------
-- PAGAMENTO — contratado ≠ recebido.
--
-- Com parcelamento, a venda existe hoje e o dinheiro entra ao longo dos meses.
-- A comissão incide sobre o recebido, e o fluxo de caixa segue a data do
-- pagamento, não a da venda.
-- ----------------------------------------------------------------------------
create table if not exists pagamento (
  id        uuid primary key default gen_random_uuid(),
  venda_id  uuid not null references venda(id) on delete cascade,
  data      date not null,
  valor     numeric(12,2) not null check (valor > 0),
  forma     text not null
            check (forma in ('pix','credito','credito_parcelado','debito','dinheiro')),
  criado_em timestamptz not null default now()
);

create index if not exists idx_pagamento_venda on pagamento (venda_id);
create index if not exists idx_pagamento_data  on pagamento (data);


-- ----------------------------------------------------------------------------
-- DESPESA
--
-- `fornecedores` é compra de estoque: sai do caixa mas NÃO é despesa do
-- resultado — vira ativo, e só vira custo quando o produto é vendido. Quem
-- soma tudo aqui como despesa acha que a loja dá prejuízo todo mês em que
-- repõe estoque.
-- ----------------------------------------------------------------------------
create table if not exists despesa (
  id         uuid primary key default gen_random_uuid(),
  data       date not null,
  descricao  text not null,
  categoria  text not null check (categoria in
             ('aluguel','folha','fornecedores','marketing','operacional','impostos')),
  valor      numeric(12,2) not null check (valor >= 0),
  recorrente boolean not null default false,
  criado_em  timestamptz not null default now()
);

create index if not exists idx_despesa_data on despesa (data);


-- ----------------------------------------------------------------------------
-- CONTA a pagar e a receber.
--
-- Repare que não existe coluna `status`. Status guardado envelhece: uma conta
-- gravada como "pendente" continua "pendente" depois de vencida, e ninguém
-- percebe. Aqui ele é calculado a partir de `pago_em` e `vencimento` (view
-- abaixo), então nunca mente.
-- ----------------------------------------------------------------------------
create table if not exists conta (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('pagar','receber')),
  descricao   text not null,
  contraparte text not null default '',
  valor       numeric(12,2) not null check (valor >= 0),
  vencimento  date not null,
  pago_em     date,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_conta_vencimento on conta (vencimento);


-- ----------------------------------------------------------------------------
-- META DA LOJA, por competência.
-- ----------------------------------------------------------------------------
create table if not exists meta_loja (
  mes       text primary key check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  receita   numeric(12,2) not null check (receita >= 0),
  criado_em timestamptz not null default now()
);


-- ============================================================================
-- VIEWS — o que o dashboard consome
-- ============================================================================

-- Saldo físico. É conta, nunca campo.
create or replace view saldo_estoque as
select p.id as produto_id,
       coalesce(sum(m.quantidade), 0)::int as saldo
from produto p
left join movimento_estoque m on m.produto_id = p.id
group by p.id;

-- Produto com saldo: preenche o campo `estoque` que o tipo Produto espera,
-- sem que ele exista como coluna em lugar nenhum.
create or replace view v_produto as
select p.*, s.saldo as estoque
from produto p
join saldo_estoque s on s.produto_id = p.id;

-- Conta com status derivado de verdade.
create or replace view v_conta as
select c.*,
       case
         when c.pago_em is not null            then 'paga'
         when c.vencimento < current_date      then 'vencida'
         else                                       'pendente'
       end as status
from conta c;

-- ----------------------------------------------------------------------------
-- VENDA COMPLETA — a única definição das contas de margem no banco.
--
-- Estas fórmulas são as mesmas de `completar()` em queries.ts. Ficam aqui para
-- que site, dashboard e qualquer relatório futuro respondam o mesmo número.
-- ----------------------------------------------------------------------------
create or replace view v_venda_completa as
select
  v.*,
  (v.preco_unit * v.quantidade)                          as receita,
  (v.custo_unit * v.quantidade)                          as custo,
  round(v.preco_unit * v.quantidade * v.taxa_pct / 100, 2) as taxa,
  -- Margem NÃO desconta o trade-in: crédito é troca de caixa por ativo.
  (v.preco_unit * v.quantidade)
    - (v.custo_unit * v.quantidade)
    - round(v.preco_unit * v.quantidade * v.taxa_pct / 100, 2) as margem,
  case when v.preco_unit * v.quantidade > 0 then
    round((((v.preco_unit * v.quantidade)
      - (v.custo_unit * v.quantidade)
      - round(v.preco_unit * v.quantidade * v.taxa_pct / 100, 2))
      / (v.preco_unit * v.quantidade)) * 100, 2)
  else 0 end                                             as margem_pct,
  v.trade_in_valor                                       as credito_trade_in,
  -- O que o cliente ainda precisa pagar em dinheiro.
  (v.preco_unit * v.quantidade) - v.trade_in_valor       as a_receber,
  coalesce(pg.recebido, 0)                               as recebido,
  greatest((v.preco_unit * v.quantidade) - v.trade_in_valor - coalesce(pg.recebido, 0), 0) as em_aberto,
  case
    when coalesce(pg.recebido, 0) <= 0 then 'aberto'
    when coalesce(pg.recebido, 0) >= (v.preco_unit * v.quantidade) - v.trade_in_valor then 'pago'
    else 'parcial'
  end                                                    as status_pagamento,
  -- Comissão sobre o RECEBIDO, não sobre o contratado.
  round(coalesce(pg.recebido, 0) * v.comissao_pct / 100, 2) as comissao
from venda v
left join (
  select venda_id, sum(valor) as recebido from pagamento group by venda_id
) pg on pg.venda_id = v.id;


-- ============================================================================
-- RLS — nada é público.
--
-- As Edge Functions usam a service role e ignoram RLS. O dashboard lê com a
-- chave anônima e, sem policy, não lê nada. As policies entram junto com o
-- login. Não crie `using (true)` "só para testar": isso publica o faturamento
-- da loja na internet.
-- ============================================================================
alter table cliente           enable row level security;
alter table vendedor          enable row level security;
alter table produto           enable row level security;
alter table movimento_estoque enable row level security;
alter table venda             enable row level security;
alter table pagamento         enable row level security;
alter table despesa           enable row level security;
alter table conta             enable row level security;
alter table meta_loja         enable row level security;
