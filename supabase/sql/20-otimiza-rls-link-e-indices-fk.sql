-- 1) auth_rls_initplan: `auth.uid()` sem `select` é reavaliado LINHA A LINHA.
-- Envolver em `(select auth.uid())` deixa o Postgres calcular uma vez só por
-- consulta — mesmo resultado, mais rápido conforme a tabela cresce. Achado
-- pelo advisor de performance depois de criar o Link de Pagamento.
drop policy if exists "vendedor cria seus próprios pedidos de link" on pedido_link;
create policy "vendedor cria seus próprios pedidos de link" on pedido_link
  for insert with check (
    vendedor_id in (select id from vendedor where auth_user_id = (select auth.uid()))
  );

drop policy if exists "vendedor vê seus próprios pedidos de link" on pedido_link;
create policy "vendedor vê seus próprios pedidos de link" on pedido_link
  for select using (
    vendedor_id in (select id from vendedor where auth_user_id = (select auth.uid()))
  );

drop policy if exists "vendedor cria itens nos seus pedidos de link" on pedido_link_item;
create policy "vendedor cria itens nos seus pedidos de link" on pedido_link_item
  for insert with check (
    pedido_link_id in (
      select id from pedido_link where vendedor_id in (
        select id from vendedor where auth_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "vendedor vê itens dos seus pedidos de link" on pedido_link_item;
create policy "vendedor vê itens dos seus pedidos de link" on pedido_link_item
  for select using (
    pedido_link_id in (
      select id from pedido_link where vendedor_id in (
        select id from vendedor where auth_user_id = (select auth.uid())
      )
    )
  );

-- 2) Índices em FK que o advisor de performance apontou como faltando.
-- Volume ainda é pequeno, mas são baratos de criar agora e evitam scan
-- completo conforme as tabelas crescem (mesmo raciocínio da migração 14).
create index if not exists idx_carrinho_vendedor on carrinho (vendedor_id);
create index if not exists idx_carrinho_item_carrinho on carrinho_item (carrinho_id);
create index if not exists idx_carrinho_item_produto on carrinho_item (produto_id);
create index if not exists idx_conversa_atendente on conversa (atendente_id);
create index if not exists idx_custo_midia_campanha on custo_midia (campanha_id);
create index if not exists idx_lead_motivo_perda on lead (motivo_perda_id);
create index if not exists idx_mensagem_autor on mensagem (autor_id);
create index if not exists idx_pedido_link_vendedor on pedido_link (vendedor_id);
create index if not exists idx_pedido_link_item_pedido on pedido_link_item (pedido_link_id);
create index if not exists idx_pedido_link_item_produto on pedido_link_item (produto_id);
create index if not exists idx_venda_campanha on venda (campanha_id);
create index if not exists idx_venda_carrinho on venda (carrinho_id);
create index if not exists idx_venda_pedido_link on venda (pedido_link_id);
