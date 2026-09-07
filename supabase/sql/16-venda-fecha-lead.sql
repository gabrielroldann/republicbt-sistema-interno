-- ============================================================================
-- VENDA -> LEAD: fecha sozinho o negócio aberto no CRM quando a venda nasce
-- ligada a um cliente que já tinha um lead em aberto.
--
-- Antes disso, uma venda feita fora do fluxo "marcar como ganho" do CRM
-- (maquininha, Link de Pagamento, ou Nova Venda sem vir de um lead) nunca
-- fechava o negócio correspondente -- ficava pra sempre aberto, mesmo já
-- vendido.
--
-- Só decide sozinho quando não tem ambiguidade: exatamente UM lead aberto
-- (etapa.tipo = 'aberta') pra aquele cliente. Se tiver mais de um, não
-- escolhe por conta própria -- fica pra resolução manual depois (tela de
-- pendências, ainda não construída). Zero leads abertos também não faz nada,
-- é só uma venda sem negociação prévia no CRM.
--
-- Trigger, não chamada explícita: dispara em qualquer venda que já nasça com
-- cliente_id, ou que ganhe um depois (UPDATE) -- cobre os três caminhos que
-- criam venda hoje (Nova Venda, maquininha, Link de Pagamento) sem precisar
-- mexer em nenhum dos três, e cobre também qualquer caminho novo que apareça.
--
-- Testado direto no banco com DO block: cliente com 1 lead aberto -> fecha
-- (etapa vira 'ganho', fechado_em preenchido); cliente com 2 leads abertos ->
-- nenhum dos dois é tocado; cliente sem lead -> venda grava normal, sem erro.
-- ============================================================================
create or replace function fechar_lead_ao_vender()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_lead_id uuid;
  v_abertos integer;
begin
  if new.cliente_id is null then
    return new;
  end if;

  select count(*) into v_abertos
  from lead l
  join etapa e on e.id = l.etapa_id
  where l.cliente_id = new.cliente_id
    and e.tipo = 'aberta'
    and l.deletado_em is null;

  if v_abertos = 1 then
    select l.id into v_lead_id
    from lead l
    join etapa e on e.id = l.etapa_id
    where l.cliente_id = new.cliente_id
      and e.tipo = 'aberta'
      and l.deletado_em is null;

    update lead
    set etapa_id = 'ganho', fechado_em = now(), atualizado_em = now()
    where id = v_lead_id;
  end if;

  return new;
end;
$function$;

drop trigger if exists venda_fecha_lead on venda;
create trigger venda_fecha_lead
  after insert or update of cliente_id on venda
  for each row
  when (new.cliente_id is not null)
  execute function fechar_lead_ao_vender();
