-- ============================================================================
-- MAQUININHA (CARRINHO), NOTA FISCAL E LINK DE PAGAMENTO.
--
-- Seis migrações aplicadas em produção entre 02/09 e 04/09
-- (criar_carrinho_e_campos_cielo_venda, adicionar_ncm_cfop_produto,
-- adicionar_cpf_cliente_e_tipo_entrega_venda, adicionar_caminho_xml_venda,
-- criar_pedido_link_pagamento, adicionar_cliente_id_ao_carrinho) e nunca
-- trazidas para o repositório — os arquivos 17 e 20 (índices e RLS sobre
-- `carrinho`/`pedido_link`) dependiam de tabelas que nenhum arquivo aqui
-- criava. Consolidado aqui, na ordem em que aconteceu, para o replay 01→N
-- voltar a funcionar do zero.
-- ============================================================================

-- 1) CARRINHO: rascunho de baixo risco. O vendedor monta sozinho, sem efeito
-- financeiro nenhum — quem grava a `venda` de verdade é sempre um processo
-- do sistema (service_role), nunca a sessão do vendedor.
create table carrinho (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedor(id),
  status text not null default 'aberto'
    check (status in ('aberto','enviado_para_maquininha','pago','expirado','cancelado')),
  cielo_order_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table carrinho_item (
  id uuid primary key default gen_random_uuid(),
  carrinho_id uuid not null references carrinho(id) on delete cascade,
  produto_id uuid not null references produto(id),
  quantidade integer not null default 1 check (quantidade > 0),
  preco_unit numeric not null,
  criado_em timestamptz not null default now()
);

alter table carrinho enable row level security;
alter table carrinho_item enable row level security;

-- vendedor só vê/mexe no próprio carrinho; gestor vê tudo
create policy carrinho_leitura on carrinho for select
  using (eh_gestor() or vendedor_id = vendedor_atual());
create policy carrinho_escrita_ins on carrinho for insert
  with check (vendedor_id = vendedor_atual());
create policy carrinho_escrita_upd on carrinho for update
  using (eh_gestor() or vendedor_id = vendedor_atual());

create policy carrinho_item_leitura on carrinho_item for select
  using (exists (select 1 from carrinho c where c.id = carrinho_id
    and (eh_gestor() or c.vendedor_id = vendedor_atual())));
create policy carrinho_item_escrita_ins on carrinho_item for insert
  with check (exists (select 1 from carrinho c where c.id = carrinho_id
    and c.vendedor_id = vendedor_atual() and c.status = 'aberto'));
create policy carrinho_item_escrita_del on carrinho_item for delete
  using (exists (select 1 from carrinho c where c.id = carrinho_id
    and c.vendedor_id = vendedor_atual() and c.status = 'aberto'));

-- Campos novos em venda: rastro do pagamento Cielo + status da nota fiscal.
-- Nada disso é preenchido à mão — vem do processo automático ou fica nulo
-- até a Focus NFe estar pronta.
alter table venda
  add column carrinho_id uuid references carrinho(id),
  add column autorizacao_cartao text,
  add column terminal_pagamento text,
  add column id_transacao_cielo text,
  add column chave_nfe text,
  add column numero_nfe text,
  add column serie_nfe text,
  add column status_nfe text
    check (status_nfe in ('pendente','autorizado','erro_autorizacao','denegado','cancelado')),
  add column caminho_danfe text,
  add column qrcode_url text;

-- 2) NCM e CFOP são obrigatórios pra emitir qualquer nota fiscal (NFC-e).
-- Ficam nulos até serem confirmados por categoria/produto — sem isso a Edge
-- Function de emissão precisa recusar a venda, não inventar um valor.
alter table produto add column ncm text;
alter table produto add column cfop text;

comment on column produto.ncm is
  'Código NCM (8 dígitos, sem pontuação) — obrigatório pra emitir NFC-e. Confirmar com contador antes de usar em produção.';
comment on column produto.cfop is
  'CFOP da operação de venda (ex: 5102 = venda de mercadoria adquirida de terceiros, dentro do estado).';

-- Raquetes de beach tennis: 9506.59.00 ("Outras" raquetes de tênis/badminton
-- e semelhantes, mesmo não encordoadas) — confirmado em 3 fontes (Focus NFe/
-- TIPI, Cosmos/Bluesoft, tabela oficial NCM vigente 03/09/2026 da Receita
-- Federal). AINDA ASSIM: confirmar com o contador antes de emitir nota real,
-- por ser a categoria de maior valor unitário.
update produto set ncm = '95065900', cfop = '5102' where categoria = 'raquetes';

-- 3) CPF só é exigido pela SEFAZ quando a NFC-e é de entrega a domicílio.
-- Retirada na loja (mesmo combinada por WhatsApp) não precisa disso.
alter table cliente add column cpf text;
comment on column cliente.cpf is
  'Só coletado quando o pedido vai ser entregue no endereço do cliente — retirada na loja não exige CPF na nota.';

-- Distingue "vai buscar" de "entregar no endereço" pra fins de nota fiscal.
-- Separado do campo `entrega` (que é status de cumprimento: pendente/entregue),
-- este é o TIPO da operação, que já precisa ser sabido no momento da venda.
alter table venda add column tipo_entrega text not null default 'retirada'
  check (tipo_entrega = any (array['retirada'::text, 'domicilio'::text]));
comment on column venda.tipo_entrega is
  'retirada = cliente busca na loja (NFC-e presencial, sem CPF). domicilio = entrega no endereço (NFC-e exige CPF/CNPJ do cliente).';

-- 4) XML da nota — documento fiscal oficial, exigido por lei guardar por 5
-- anos. Hoje hospedado pela Focus NFe; considerar arquivar cópia própria no
-- futuro.
alter table venda add column caminho_xml text;
comment on column venda.caminho_xml is
  'URL do XML da NFC-e (documento fiscal oficial, exigido por lei guardar por 5 anos) — hoje hospedado pela Focus NFe; considerar arquivar cópia própria no futuro.';

-- 5) LINK DE PAGAMENTO: espelha o par carrinho/carrinho_item, mas para o
-- Link de Pagamento Cielo (venda por WhatsApp, sem maquininha por perto). O
-- vendedor monta o pedido no painel, a gente gera o link pela API da Cielo, e
-- quando a Cielo avisar que foi pago (via webhook consultado de volta —
-- nunca confiamos no POST puro, porque essas URLs não têm autenticação
-- nenhuma), a `venda` nasce daqui, igual ao carrinho da maquininha.
create table public.pedido_link (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.vendedor(id),
  cliente_id uuid references public.cliente(id),
  status text not null default 'aberto'
    check (status in ('aberto', 'enviado', 'pago', 'cancelado', 'expirado')),
  -- Código curto (<=20 alnum) que a gente manda pra Cielo como "OrderNumber"
  -- — é o elo entre o link e este pedido. Cielo exige não repetir em <24h,
  -- por isso tem timestamp embutido no gerador (na Edge Function).
  merchant_order_number text not null unique,
  checkout_cielo_order_number text,
  link_id text,
  link_url text,
  valor_total numeric not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on column public.pedido_link.merchant_order_number is 'OrderNumber enviado à Cielo na criação do link — é como identificamos o pedido de volta quando a notificação chega.';
comment on column public.pedido_link.checkout_cielo_order_number is 'Identificador que a Cielo gera pro pedido — preenchido só depois que o comprador finaliza (vem na notificação).';

create table public.pedido_link_item (
  id uuid primary key default gen_random_uuid(),
  pedido_link_id uuid not null references public.pedido_link(id) on delete cascade,
  produto_id uuid not null references public.produto(id),
  quantidade integer not null default 1 check (quantidade > 0),
  preco_unit numeric not null,
  criado_em timestamptz not null default now()
);

-- venda ganha o vínculo, igual carrinho_id — pra saber que essa venda nasceu
-- de um link de pagamento (e não de maquininha nem Nova Venda manual).
alter table public.venda add column pedido_link_id uuid references public.pedido_link(id);

alter table public.pedido_link enable row level security;
alter table public.pedido_link_item enable row level security;

-- Mesmo padrão do carrinho: o vendedor só mexe no que é dele. A Edge Function
-- que cria/consulta usa service_role e ignora RLS mesmo assim. (RLS aqui já
-- na forma final, otimizada — ver comentário do arquivo 20.)
create policy "vendedor vê seus próprios pedidos de link"
  on public.pedido_link for select
  using (vendedor_id in (select id from public.vendedor where auth_user_id = (select auth.uid())));

create policy "vendedor cria seus próprios pedidos de link"
  on public.pedido_link for insert
  with check (vendedor_id in (select id from public.vendedor where auth_user_id = (select auth.uid())));

create policy "vendedor vê itens dos seus pedidos de link"
  on public.pedido_link_item for select
  using (pedido_link_id in (
    select id from public.pedido_link
    where vendedor_id in (select id from public.vendedor where auth_user_id = (select auth.uid()))
  ));

create policy "vendedor cria itens nos seus pedidos de link"
  on public.pedido_link_item for insert
  with check (pedido_link_id in (
    select id from public.pedido_link
    where vendedor_id in (select id from public.vendedor where auth_user_id = (select auth.uid()))
  ));

-- 6) cliente_id no carrinho — mesmo motivo do pedido_link: a tela de
-- Pendências e qualquer relatório futuro precisam saber de qual cliente é
-- aquele carrinho.
alter table carrinho add column cliente_id uuid references cliente(id);
