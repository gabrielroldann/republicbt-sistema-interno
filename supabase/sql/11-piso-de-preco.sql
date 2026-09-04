-- ============================================================================
-- VENDEDOR VENDE, MAS NÃO NO PREJUÍZO SEM NINGUÉM PERCEBER.
--
-- O RLS já deixa o vendedor gravar a própria venda (venda_escrita_ins:
-- vendedor_id = vendedor_atual()). O campo de preço sempre foi número livre,
-- sem piso -- a tela mostra a margem calculada ao vivo, mas isso é só
-- informativo, não impede nada. Um vendedor podia digitar R$ 50 numa raquete
-- de custo R$ 400, ver a margem negativa na tela, e mandar assim mesmo.
--
-- Esta migração fecha só esse buraco especifico, sem reabrir a decisão maior
-- de "vendedor vende ou não". Sócio e admin continuam podendo vender abaixo
-- do custo de propósito -- liquidação, encalhe, brinde -- e não são pegos
-- pela trava.
--
-- Trigger, não CHECK constraint: CHECK não tem acesso fácil e óbvio a
-- "quem está gravando" sem depender de eh_gestor() rodar em contexto de
-- checagem de linha, o que é possível mas não é o lugar convencional para essa
-- lógica -- e um trigger fica mais claro para quem ler daqui a um ano.
--
-- Testado direto pela API REST, com login de verdade (vendedor e admin), não
-- só pela regra em si: vendedor abaixo do custo → 400; vendedor acima → 201;
-- gestor abaixo do custo → 201, passa por cima de propósito.
-- ============================================================================
create or replace function impedir_venda_abaixo_do_custo()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not eh_gestor() and new.preco_unit < new.custo_unit then
    raise exception
      'o preço (R$ %) não pode ficar abaixo do custo (R$ %). Se for liquidação ou encalhe, peça para um sócio registrar.',
      new.preco_unit, new.custo_unit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists venda_piso_de_preco on venda;
create trigger venda_piso_de_preco
  before insert or update on venda
  for each row
  execute function impedir_venda_abaixo_do_custo();
