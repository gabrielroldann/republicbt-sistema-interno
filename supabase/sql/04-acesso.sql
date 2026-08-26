-- ============================================================================
-- Republic BT — níveis de acesso
--
-- A REGRA QUE VALE MAIS QUE TODO O RESTO DESTE ARQUIVO:
--
--   Esconder um campo na tela NÃO é controle de acesso.
--
-- O Supabase expõe uma API REST sobre as tabelas. Qualquer pessoa com a chave
-- anônima — que está no JavaScript do navegador, visível para todo mundo —
-- consegue consultar direto e ler o que a tela não mostrou. O vendedor abre o
-- console do navegador e vê o custo de todas as raquetes.
--
-- Por isso o controle mora AQUI, em RLS, e a tela apenas reflete.
--
-- Depende de 01-nucleo.sql e 02-crm.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Papéis
--
--   admin      dono. Tudo, inclusive usuários e configuração.
--   socio      tudo do financeiro e do CRM. Não mexe em usuários.
--   vendedor   só o CRM. Nunca vê custo, margem, comissão dos outros,
--              despesa, conta ou meta.
-- ----------------------------------------------------------------------------
alter table vendedor
  add column if not exists auth_user_id uuid unique,
  add column if not exists papel text not null default 'vendedor';

do $$ begin
  alter table vendedor add constraint vendedor_papel_check
    check (papel in ('admin','socio','vendedor'));
exception when duplicate_object then null; end $$;


-- ----------------------------------------------------------------------------
-- CONFIGURAÇÃO — decisões que mudam sem deploy.
--
-- "O vendedor enxerga os leads dos outros?" é decisão de negócio, não de
-- código. Hoje, com três sócios que também vendem, transparência ajuda: um
-- cobre a ausência do outro. Quando entrar vendedor contratado, a resposta
-- provavelmente muda — e mudar não pode exigir programador.
-- ----------------------------------------------------------------------------
create table if not exists configuracao (
  chave     text primary key,
  valor     jsonb not null,
  descricao text
);

insert into configuracao (chave, valor, descricao) values
  ('vendedor_ve_leads_de_todos', 'true',
   'Vendedor enxerga o funil inteiro (true) ou só os leads dele (false)'),
  -- Começa DESLIGADO, ao contrário do funil.
  --
  -- Toda conversa nasce sem dono, na caixa da loja, esperando distribuição. Se
  -- o vendedor enxergasse a fila inteira, a caixa geral estaria aberta para
  -- todos e cada um escolheria o cliente que parece mais fácil — o rodízio
  -- viraria enfeite e o lead chato sobraria para ninguém.
  ('vendedor_ve_conversas_de_todos', 'false',
   'Vendedor enxerga a caixa da loja inteira (true) ou só o que foi atribuído a ele (false)')
on conflict (chave) do nothing;


-- ============================================================================
-- QUEM ESTÁ PEDINDO
--
-- `auth.uid()` é do Supabase e devolve o usuário autenticado. Os testes locais
-- substituem por um dublê — ver `teste-acesso.mjs`.
-- ============================================================================

create or replace function vendedor_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from vendedor where auth_user_id = auth.uid() and ativo;
$$;

create or replace function papel_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select papel from vendedor where auth_user_id = auth.uid() and ativo),
    'nenhum');
$$;

/** admin ou sócio — quem pode ver dinheiro. */
create or replace function eh_gestor()
returns boolean
language sql
stable
as $$ select papel_atual() in ('admin','socio'); $$;

create or replace function eh_admin()
returns boolean
language sql
stable
as $$ select papel_atual() = 'admin'; $$;

create or replace function config_bool(p_chave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select valor::text::boolean from configuracao where chave = p_chave), false); $$;


-- ============================================================================
-- POLICIES
--
-- Sem policy, RLS bloqueia tudo. Cada linha abaixo é uma permissão explícita.
--
-- ARMADILHA QUE JÁ CUSTOU CARO AQUI:
--
--   `for all` INCLUI select. E policies permissivas se combinam com OU.
--
-- Ou seja: uma policy de escrita `for all using (está_logado)` ao lado de uma
-- policy de leitura restrita ANULA a restrição — o banco lê a mais frouxa das
-- duas e libera. O vendedor passava a enxergar o funil inteiro mesmo com a
-- configuração desligada, sem erro nenhum aparecer.
--
-- Por isso, daqui para baixo, escrita é sempre `for insert` / `for update` /
-- `for delete`, nunca `for all` quando existe um select mais restrito.
-- ============================================================================

/* ---------------------------------------------------------------- vendedor */
-- Todo mundo vê a lista de colegas: precisa para atribuir lead e ver quem
-- atendeu. Mas só o admin cria, edita ou desativa gente.
drop policy if exists vendedor_leitura on vendedor;
create policy vendedor_leitura on vendedor
  for select using (papel_atual() <> 'nenhum');

drop policy if exists vendedor_escrita on vendedor;
drop policy if exists vendedor_escrita_ins on vendedor;
drop policy if exists vendedor_escrita_upd on vendedor;
drop policy if exists vendedor_escrita_del on vendedor;
create policy vendedor_escrita_ins on vendedor for insert with check (eh_admin());
create policy vendedor_escrita_upd on vendedor for update using (eh_admin()) with check (eh_admin());
create policy vendedor_escrita_del on vendedor for delete using (eh_admin());

/* ----------------------------------------------------------- configuração */
drop policy if exists config_leitura on configuracao;
create policy config_leitura on configuracao
  for select using (papel_atual() <> 'nenhum');

drop policy if exists config_escrita on configuracao;
drop policy if exists config_escrita_ins on configuracao;
drop policy if exists config_escrita_upd on configuracao;
drop policy if exists config_escrita_del on configuracao;
create policy config_escrita_ins on configuracao for insert with check (eh_admin());
create policy config_escrita_upd on configuracao for update using (eh_admin()) with check (eh_admin());
create policy config_escrita_del on configuracao for delete using (eh_admin());

alter table configuracao enable row level security;

/* ----------------------------------------------------------------- cliente */
drop policy if exists cliente_leitura on cliente;
create policy cliente_leitura on cliente
  for select using (papel_atual() <> 'nenhum');

drop policy if exists cliente_escrita on cliente;
drop policy if exists cliente_escrita_ins on cliente;
drop policy if exists cliente_escrita_upd on cliente;
drop policy if exists cliente_escrita_del on cliente;
create policy cliente_escrita_ins on cliente for insert with check (papel_atual() <> 'nenhum');
create policy cliente_escrita_upd on cliente for update using (papel_atual() <> 'nenhum') with check (papel_atual() <> 'nenhum');
create policy cliente_escrita_del on cliente for delete using (papel_atual() <> 'nenhum');

/* -------------------------------------------------------------------- lead */
-- Aqui a configuração entra: o vendedor vê o funil inteiro ou só o dele.
drop policy if exists lead_leitura on lead;
create policy lead_leitura on lead
  for select using (
    eh_gestor()
    or (papel_atual() = 'vendedor' and (
          config_bool('vendedor_ve_leads_de_todos')
          or responsavel_id = vendedor_atual()
          or responsavel_id is null))   -- lead sem dono está na fila de todos
  );

drop policy if exists lead_escrita on lead;
drop policy if exists lead_escrita_ins on lead;
drop policy if exists lead_escrita_upd on lead;
drop policy if exists lead_escrita_del on lead;
create policy lead_escrita_ins on lead for insert with check (papel_atual() <> 'nenhum');
create policy lead_escrita_upd on lead for update using (papel_atual() <> 'nenhum') with check (papel_atual() <> 'nenhum');
create policy lead_escrita_del on lead for delete using (papel_atual() <> 'nenhum');

/* ------------------------------------------------------------------- canal */
-- Os números da loja. Todo mundo logado lê: a tela precisa do nome do canal
-- para dizer "chegou no número da loja" ou "conversa do seu número".
--
-- Não há segredo nesta tabela, e isso é de propósito. `phone_number_id` e
-- `instancia` são IDENTIFICADORES, não credenciais — o token da Meta e a chave
-- do Evolution moram em variável de ambiente da Edge Function e nunca tocam o
-- banco. Se um dia alguém for tentado a guardar token aqui, é aqui que quebra:
-- esta tabela é legível por qualquer vendedor.
drop policy if exists canal_leitura on canal;
create policy canal_leitura on canal for select using (papel_atual() <> 'nenhum');

drop policy if exists canal_escrita_ins on canal;
drop policy if exists canal_escrita_upd on canal;
drop policy if exists canal_escrita_del on canal;
create policy canal_escrita_ins on canal for insert with check (eh_admin());
create policy canal_escrita_upd on canal for update using (eh_admin()) with check (eh_admin());
create policy canal_escrita_del on canal for delete using (eh_admin());

/* ---------------------------------------------------------------- conversa */
--
-- Note o que SUMIU daqui: `or atendente_id is null`.
--
-- Fazia sentido quando a fila era de todos e quem estivesse livre puxava. Agora
-- toda conversa nasce sem dono na caixa da loja, esperando distribuição — e
-- `atendente_id is null` significaria que o vendedor enxerga a caixa geral
-- inteira. A cláusula que parecia generosa era a que furava o modelo.
--
drop policy if exists conversa_leitura on conversa;
create policy conversa_leitura on conversa
  for select using (
    eh_gestor()
    or (papel_atual() = 'vendedor' and (
          config_bool('vendedor_ve_conversas_de_todos')
          or atendente_id = vendedor_atual()
          -- o próprio número dele: a conversa que ele abriu do celular
          or exists (select 1 from canal ca
                     where ca.id = conversa.canal_id
                       and ca.vendedor_id = vendedor_atual())))
  );

drop policy if exists conversa_escrita on conversa;
drop policy if exists conversa_escrita_ins on conversa;
drop policy if exists conversa_escrita_upd on conversa;
drop policy if exists conversa_escrita_del on conversa;
create policy conversa_escrita_ins on conversa for insert with check (papel_atual() <> 'nenhum');
create policy conversa_escrita_upd on conversa for update using (papel_atual() <> 'nenhum') with check (papel_atual() <> 'nenhum');
create policy conversa_escrita_del on conversa for delete using (papel_atual() <> 'nenhum');

-- A mensagem herda o acesso da conversa: se ele enxerga a conversa, enxerga
-- as mensagens dela.
drop policy if exists mensagem_tudo on mensagem;
drop policy if exists mensagem_leitura on mensagem;
create policy mensagem_leitura on mensagem for select using (
  exists (select 1 from conversa c where c.id = mensagem.conversa_id));
drop policy if exists mensagem_escrita on mensagem;
drop policy if exists mensagem_escrita_ins on mensagem;
drop policy if exists mensagem_escrita_upd on mensagem;
drop policy if exists mensagem_escrita_del on mensagem;
create policy mensagem_escrita_ins on mensagem for insert with check (papel_atual() <> 'nenhum');
create policy mensagem_escrita_upd on mensagem for update using (papel_atual() <> 'nenhum') with check (papel_atual() <> 'nenhum');
create policy mensagem_escrita_del on mensagem for delete using (papel_atual() <> 'nenhum');

/* -------------------------------------------------------- campanha e mídia */
-- Campanha o vendedor lê (aparece no card do lead). O GASTO, não: quanto a
-- loja investe em mídia é informação de sócio.
drop policy if exists campanha_leitura on campanha;
create policy campanha_leitura on campanha
  for select using (papel_atual() <> 'nenhum');

drop policy if exists campanha_escrita on campanha;
drop policy if exists campanha_escrita_ins on campanha;
drop policy if exists campanha_escrita_upd on campanha;
drop policy if exists campanha_escrita_del on campanha;
create policy campanha_escrita_ins on campanha for insert with check (eh_gestor());
create policy campanha_escrita_upd on campanha for update using (eh_gestor()) with check (eh_gestor());
create policy campanha_escrita_del on campanha for delete using (eh_gestor());

drop policy if exists custo_midia_gestor on custo_midia;
create policy custo_midia_gestor on custo_midia for select using (eh_gestor());
drop policy if exists custo_midia_escrita on custo_midia;
drop policy if exists custo_midia_escrita_ins on custo_midia;
drop policy if exists custo_midia_escrita_upd on custo_midia;
drop policy if exists custo_midia_escrita_del on custo_midia;
create policy custo_midia_escrita_ins on custo_midia for insert with check (eh_gestor());
create policy custo_midia_escrita_upd on custo_midia for update using (eh_gestor()) with check (eh_gestor());
create policy custo_midia_escrita_del on custo_midia for delete using (eh_gestor());

/* --------------------------------------------------- etapa e motivo (fixos) */
drop policy if exists etapa_leitura on etapa;
create policy etapa_leitura on etapa for select using (papel_atual() <> 'nenhum');
drop policy if exists etapa_escrita on etapa;
drop policy if exists etapa_escrita_ins on etapa;
drop policy if exists etapa_escrita_upd on etapa;
drop policy if exists etapa_escrita_del on etapa;
create policy etapa_escrita_ins on etapa for insert with check (eh_admin());
create policy etapa_escrita_upd on etapa for update using (eh_admin()) with check (eh_admin());
create policy etapa_escrita_del on etapa for delete using (eh_admin());

drop policy if exists motivo_leitura on motivo_perda;
create policy motivo_leitura on motivo_perda for select using (papel_atual() <> 'nenhum');
drop policy if exists motivo_escrita on motivo_perda;
drop policy if exists motivo_escrita_ins on motivo_perda;
drop policy if exists motivo_escrita_upd on motivo_perda;
drop policy if exists motivo_escrita_del on motivo_perda;
create policy motivo_escrita_ins on motivo_perda for insert with check (eh_admin());
create policy motivo_escrita_upd on motivo_perda for update using (eh_admin()) with check (eh_admin());
create policy motivo_escrita_del on motivo_perda for delete using (eh_admin());

/* ----------------------------------------------------------------- produto */
--
-- O PONTO SENSÍVEL. A tabela `produto` tem `custo`, e o vendedor não pode
-- saber quanto a loja paga na raquete: isso vira argumento de negociação de
-- comissão e é o tipo de número que vaza para o concorrente.
--
-- RLS é por LINHA, não por coluna. Então o vendedor não lê a tabela — lê a
-- view `v_produto_venda`, que simplesmente não tem a coluna.
--
drop policy if exists produto_gestor on produto;
create policy produto_gestor on produto for select using (eh_gestor());
drop policy if exists produto_escrita on produto;
drop policy if exists produto_escrita_ins on produto;
drop policy if exists produto_escrita_upd on produto;
drop policy if exists produto_escrita_del on produto;
create policy produto_escrita_ins on produto for insert with check (eh_gestor());
create policy produto_escrita_upd on produto for update using (eh_gestor()) with check (eh_gestor());
create policy produto_escrita_del on produto for delete using (eh_gestor());

create or replace view v_produto_venda
with (security_invoker = false) as
  select id, sku, nome, categoria, marca, preco, estoque_min, ativo,
         slug, descricao, publicado, ordem
  from produto
  where ativo;

comment on view v_produto_venda is
  'O que o vendedor vê do catálogo: sem custo. security_invoker=false faz a view
   rodar com os direitos de quem a criou, contornando o RLS da tabela.';

/* ------------------------------------------------------ movimento e venda */
drop policy if exists movimento_gestor on movimento_estoque;
create policy movimento_gestor on movimento_estoque for select using (eh_gestor());
drop policy if exists movimento_escrita on movimento_estoque;
drop policy if exists movimento_escrita_ins on movimento_estoque;
drop policy if exists movimento_escrita_upd on movimento_estoque;
drop policy if exists movimento_escrita_del on movimento_estoque;
create policy movimento_escrita_ins on movimento_estoque for insert with check (eh_gestor());
create policy movimento_escrita_upd on movimento_estoque for update using (eh_gestor()) with check (eh_gestor());
create policy movimento_escrita_del on movimento_estoque for delete using (eh_gestor());

-- Venda: gestor vê tudo; vendedor vê só as dele — e mesmo assim sem custo nem
-- margem, pela view abaixo.
drop policy if exists venda_leitura on venda;
create policy venda_leitura on venda
  for select using (eh_gestor() or vendedor_id = vendedor_atual());

drop policy if exists venda_escrita on venda;
drop policy if exists venda_escrita_ins on venda;
drop policy if exists venda_escrita_upd on venda;
drop policy if exists venda_escrita_del on venda;
create policy venda_escrita_ins on venda for insert with check (eh_gestor() or vendedor_id = vendedor_atual());
create policy venda_escrita_upd on venda for update using (eh_gestor() or vendedor_id = vendedor_atual()) with check (eh_gestor() or vendedor_id = vendedor_atual());
create policy venda_escrita_del on venda for delete using (eh_gestor() or vendedor_id = vendedor_atual());

create or replace view v_venda_vendedor
with (security_invoker = true) as
  select
    v.id, v.data, v.produto_id, v.vendedor_id, v.cliente_id, v.campanha_id,
    v.quantidade, v.preco_unit, v.forma_pagamento, v.parcelas, v.entrega,
    v.canal, v.trade_in_valor, v.criado_em,
    (v.preco_unit * v.quantidade) as receita,
    -- a comissão dele, ele pode ver: é o salário dele
    round(coalesce(pg.recebido, 0) * v.comissao_pct / 100, 2) as comissao,
    coalesce(pg.recebido, 0) as recebido
  from venda v
  left join (select venda_id, sum(valor) recebido from pagamento group by 1) pg
    on pg.venda_id = v.id;

comment on view v_venda_vendedor is
  'A venda como o vendedor pode ver: sem custo_unit, sem margem, sem taxa.
   security_invoker=true mantém o RLS de `venda`, então ele só vê as próprias.';

drop policy if exists pagamento_leitura on pagamento;
create policy pagamento_leitura on pagamento
  for select using (
    eh_gestor()
    or exists (select 1 from venda v
               where v.id = pagamento.venda_id and v.vendedor_id = vendedor_atual())
  );

drop policy if exists pagamento_escrita on pagamento;
drop policy if exists pagamento_escrita_ins on pagamento;
drop policy if exists pagamento_escrita_upd on pagamento;
drop policy if exists pagamento_escrita_del on pagamento;
create policy pagamento_escrita_ins on pagamento for insert with check (eh_gestor());
create policy pagamento_escrita_upd on pagamento for update using (eh_gestor()) with check (eh_gestor());
create policy pagamento_escrita_del on pagamento for delete using (eh_gestor());

/* ------------------------------------------------- financeiro: só gestor */
drop policy if exists despesa_gestor on despesa;
create policy despesa_gestor on despesa for select using (eh_gestor());
drop policy if exists despesa_escrita on despesa;
drop policy if exists despesa_escrita_ins on despesa;
drop policy if exists despesa_escrita_upd on despesa;
drop policy if exists despesa_escrita_del on despesa;
create policy despesa_escrita_ins on despesa for insert with check (eh_gestor());
create policy despesa_escrita_upd on despesa for update using (eh_gestor()) with check (eh_gestor());
create policy despesa_escrita_del on despesa for delete using (eh_gestor());

drop policy if exists conta_gestor on conta;
create policy conta_gestor on conta for select using (eh_gestor());
drop policy if exists conta_escrita on conta;
drop policy if exists conta_escrita_ins on conta;
drop policy if exists conta_escrita_upd on conta;
drop policy if exists conta_escrita_del on conta;
create policy conta_escrita_ins on conta for insert with check (eh_gestor());
create policy conta_escrita_upd on conta for update using (eh_gestor()) with check (eh_gestor());
create policy conta_escrita_del on conta for delete using (eh_gestor());

drop policy if exists meta_gestor on meta_loja;
create policy meta_gestor on meta_loja for select using (eh_gestor());
drop policy if exists meta_escrita on meta_loja;
drop policy if exists meta_escrita_ins on meta_loja;
drop policy if exists meta_escrita_upd on meta_loja;
drop policy if exists meta_escrita_del on meta_loja;
create policy meta_escrita_ins on meta_loja for insert with check (eh_gestor());
create policy meta_escrita_upd on meta_loja for update using (eh_gestor()) with check (eh_gestor());
create policy meta_escrita_del on meta_loja for delete using (eh_gestor());

/* ----------------------------------------------- infraestrutura: ninguém */
-- `evento_webhook` só é escrito pela Edge Function, que usa a service role e
-- ignora RLS. Nenhum usuário precisa ler isso.
-- (sem policy = ninguém acessa)


-- ============================================================================
-- O QUE CADA PAPEL VÊ — resumo
--
--                       admin   sócio   vendedor
--   funil, lead           x       x        x
--   conversa, mensagem    x       x        x
--   cliente               x       x        x
--   catálogo com preço    x       x        x
--   CUSTO do produto      x       x        —
--   MARGEM da venda       x       x        —
--   comissão própria      x       x        x
--   comissão dos outros   x       x        —
--   gasto de mídia        x       x        —
--   despesa, conta, meta  x       x        —
--   criar/editar usuário  x       —        —
--   mudar configuração    x       —        —
-- ============================================================================
