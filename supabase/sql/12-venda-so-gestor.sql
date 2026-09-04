-- ============================================================================
-- SÓ GESTOR GRAVA VENDA.
--
-- Decisão de produto: o sócio lança tudo, no dashboard. Vendedor não registra
-- venda -- nem pela tela (que nunca ofereceu isso de verdade), nem por baixo
-- dos panos.
--
-- A policy antiga (`vendedor_id = vendedor_atual()`) é de antes desta decisão
-- e permitia o vendedor gravar a própria venda direto pela API, sem tela
-- nenhuma no caminho. Fechado agora -- se o volume crescer e isso virar
-- gargalo para o gestor, é uma migração pequena reabrir, e nada nesta troca
-- impede isso no futuro.
--
-- Testado direto pela API, com login de verdade: vendedor tentando gravar a
-- própria venda → 403 (RLS); gestor gravando uma venda em nome do vendedor →
-- 201, continua funcionando normalmente.
-- ============================================================================
drop policy if exists venda_escrita_ins on venda;
drop policy if exists venda_escrita_upd on venda;
drop policy if exists venda_escrita_del on venda;

create policy venda_escrita_ins on venda for insert with check (eh_gestor());
create policy venda_escrita_upd on venda for update using (eh_gestor()) with check (eh_gestor());
create policy venda_escrita_del on venda for delete using (eh_gestor());
