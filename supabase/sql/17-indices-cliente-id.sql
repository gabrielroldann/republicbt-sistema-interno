-- ============================================================================
-- ÍNDICES PARA AS FKs cliente_id ADICIONADAS NESTA SESSÃO.
--
-- O advisor de performance do Supabase acusou `carrinho.cliente_id` e
-- `pedido_link.cliente_id` sem índice cobrindo a FK. Sem volume de dado isso
-- não muda nada hoje, mas a tela de Pendências já filtra por cliente_id
-- (venda sem cliente, leads ambíguos ligados a cliente) e qualquer relatório
-- futuro vai fazer o mesmo -- mais barato resolver agora do que esperar a
-- tabela crescer e sentir a falta.
-- ============================================================================
create index if not exists idx_carrinho_cliente on carrinho (cliente_id);
create index if not exists idx_pedido_link_cliente on pedido_link (cliente_id);
