-- ============================================================================
-- Republic BT — personalização do funil
--
-- Criar, renomear, reordenar e excluir etapas.
--
-- O que parece simples e não é:
--
--   1. Excluir etapa com lead dentro. Para onde vão os leads? Apagar junto
--      seria perder histórico de venda. Deixar órfão quebra o funil.
--   2. As etapas de GANHO e PERDIDO não são opcionais. `mover_lead` decide
--      pelo `tipo`, o relatório de conversão conta por elas, e o dashboard
--      soma vendas a partir delas. Excluir uma dessas quebra tudo em silêncio.
--   3. Reordenar por número inteiro colide: mover o item 3 para a posição 1
--      exige reescrever vários. Aqui a ordem é reescrita inteira, sempre.
--
-- Depende de 02-crm.sql e 04-acesso.sql.
-- ============================================================================

-- A ordem NÃO é única de propósito: durante uma reordenação existem estados
-- intermediários com números repetidos, e uma restrição de unicidade abortaria
-- a operação no meio.
drop index if exists etapa_ordem_unica;

-- Cor da etapa no kanban. Antes era derivada do tipo; com etapa personalizada,
-- quem cria escolhe.
alter table etapa
  add column if not exists cor text not null default 'navy';

do $$ begin
  alter table etapa add constraint etapa_cor_check
    check (cor in ('navy','gold','positive','negative','attention','info','neutral'));
exception when duplicate_object then null; end $$;

update etapa set cor = 'positive'  where tipo = 'ganho'   and cor = 'navy';
update etapa set cor = 'negative'  where tipo = 'perdido' and cor = 'navy';
update etapa set cor = 'gold'      where tipo = 'aberta'  and cor = 'navy';


-- ----------------------------------------------------------------------------
-- INVARIANTES DO FUNIL
--
-- Um funil sem etapa de ganho não registra venda. Sem etapa aberta, lead novo
-- não tem onde entrar. Estas regras existem para que ninguém consiga, sem
-- querer, deixar a loja num estado que não funciona.
-- ----------------------------------------------------------------------------
create or replace function validar_funil()
returns trigger
language plpgsql
as $$
declare
  n_aberta  int;
  n_ganho   int;
  n_perdido int;
begin
  select count(*) filter (where tipo = 'aberta'),
         count(*) filter (where tipo = 'ganho'),
         count(*) filter (where tipo = 'perdido')
    into n_aberta, n_ganho, n_perdido
  from etapa;

  if n_aberta < 1 then
    raise exception 'o funil precisa de pelo menos uma etapa aberta'
      using errcode = 'check_violation';
  end if;
  if n_ganho <> 1 then
    raise exception 'o funil precisa de exatamente uma etapa de ganho'
      using errcode = 'check_violation';
  end if;
  if n_perdido <> 1 then
    raise exception 'o funil precisa de exatamente uma etapa de perdido'
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

drop trigger if exists trg_validar_funil on etapa;
create constraint trigger trg_validar_funil
  after insert or update or delete on etapa
  deferrable initially deferred
  for each row execute function validar_funil();


-- O `tipo` de uma etapa NUNCA muda depois de criada.
--
-- Se alguém transformasse "Proposta enviada" em tipo 'ganho', todas as vendas
-- do histórico passariam a ser contadas de novo — e o faturamento do painel
-- mudaria sozinho, sem ninguém ter vendido nada.
create or replace function congelar_tipo_etapa()
returns trigger language plpgsql as $$
begin
  if new.tipo is distinct from old.tipo then
    raise exception 'o tipo da etapa não pode mudar (%s → %s)', old.tipo, new.tipo
      using errcode = 'check_violation';
  end if;
  if new.id is distinct from old.id then
    raise exception 'o id da etapa não pode mudar: os leads apontam para ele'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_congelar_tipo_etapa on etapa;
create trigger trg_congelar_tipo_etapa
  before update on etapa for each row execute function congelar_tipo_etapa();


-- ----------------------------------------------------------------------------
-- Identificador legível, gerado uma vez e imutável.
--
-- `id` legível ajuda a depurar ("etapa_id = proposta" diz mais que um uuid),
-- mas renomear a etapa NÃO pode mudá-lo — os leads apontam para ele.
-- ----------------------------------------------------------------------------
create or replace function gerar_id_etapa(p_nome text)
returns text
language plpgsql
as $$
declare
  base_id text;
  novo    text;
  n       int := 1;
begin
  base_id := lower(btrim(p_nome));
  -- sem `unaccent` (extensão que pode não existir): troca à mão o que aparece
  base_id := translate(base_id,
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn');
  base_id := regexp_replace(base_id, '[^a-z0-9]+', '_', 'g');
  base_id := btrim(base_id, '_');
  if base_id = '' then base_id := 'etapa'; end if;

  novo := base_id;
  while exists (select 1 from etapa where id = novo) loop
    n := n + 1;
    novo := base_id || '_' || n;
  end loop;
  return novo;
end $$;


-- ============================================================================
-- OPERAÇÕES
-- ============================================================================

/**
 * Cria uma etapa aberta.
 *
 * Sempre entra ANTES de ganho e perdido: uma etapa de trabalho depois do
 * "Venda ganha" não faria sentido no kanban, que se lê da esquerda para a
 * direita.
 */
create or replace function criar_etapa(
  p_nome text,
  p_cor text default 'gold',
  p_depois_de text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    text;
  v_ordem int;
begin
  if not eh_admin() then
    raise exception 'só o administrador altera o funil' using errcode = '42501';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'a etapa precisa de nome' using errcode = 'check_violation';
  end if;

  v_id := gerar_id_etapa(p_nome);

  if p_depois_de is null then
    -- no fim das abertas
    select coalesce(max(ordem), 0) + 1 into v_ordem from etapa where tipo = 'aberta';
  else
    select ordem + 1 into v_ordem from etapa where id = p_depois_de and tipo = 'aberta';
    if v_ordem is null then
      raise exception 'etapa de referência % não existe ou não é aberta', p_depois_de
        using errcode = 'check_violation';
    end if;
  end if;

  update etapa set ordem = ordem + 1 where ordem >= v_ordem;
  insert into etapa (id, nome, ordem, tipo, cor)
  values (v_id, btrim(p_nome), v_ordem, 'aberta', coalesce(p_cor, 'gold'));

  return v_id;
end $$;


create or replace function renomear_etapa(p_id text, p_nome text, p_cor text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'só o administrador altera o funil' using errcode = '42501';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'a etapa precisa de nome' using errcode = 'check_violation';
  end if;

  update etapa
  set nome = btrim(p_nome),
      cor  = coalesce(p_cor, cor)
  where id = p_id;

  if not found then
    raise exception 'etapa % não existe', p_id using errcode = 'check_violation';
  end if;
end $$;


/**
 * Reordena as etapas ABERTAS.
 *
 * Recebe a lista inteira, na ordem desejada, e reescreve tudo. Enviar a ordem
 * completa em vez de "mova o item X para a posição N" elimina toda uma classe
 * de bug: não existe estado intermediário inconsistente, e duas pessoas
 * arrastando ao mesmo tempo terminam numa das duas ordens, nunca numa mistura.
 *
 * Ganho e perdido não entram: ficam sempre no fim.
 */
create or replace function reordenar_etapas(p_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abertas int;
  v_i       int := 0;
  v_id      text;
begin
  if not eh_admin() then
    raise exception 'só o administrador altera o funil' using errcode = '42501';
  end if;

  select count(*) into v_abertas from etapa where tipo = 'aberta';

  if array_length(p_ids, 1) is distinct from v_abertas then
    raise exception 'a lista precisa conter todas as % etapas abertas', v_abertas
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from unnest(p_ids) i(id)
    left join etapa e on e.id = i.id and e.tipo = 'aberta'
    where e.id is null
  ) then
    raise exception 'a lista tem etapa que não existe ou não é aberta'
      using errcode = 'check_violation';
  end if;

  foreach v_id in array p_ids loop
    v_i := v_i + 1;
    update etapa set ordem = v_i where id = v_id;
  end loop;

  -- ganho e perdido sempre no fim, nessa ordem
  update etapa set ordem = v_i + 1 where tipo = 'ganho';
  update etapa set ordem = v_i + 2 where tipo = 'perdido';
end $$;


/**
 * Exclui uma etapa, movendo os leads dela para outra.
 *
 * Os leads NÃO são apagados. Um lead é histórico de relacionamento e, se virou
 * venda, é histórico financeiro — apagar por causa de uma mudança de funil
 * seria destruir dado por motivo cosmético.
 *
 * Ganho e perdido não são excluíveis: o sistema inteiro decide por elas.
 */
create or replace function excluir_etapa(p_id text, p_mover_para text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo    text;
  v_destino text;
  v_movidos int;
begin
  if not eh_admin() then
    raise exception 'só o administrador altera o funil' using errcode = '42501';
  end if;

  select tipo into v_tipo from etapa where id = p_id;
  if v_tipo is null then
    raise exception 'etapa % não existe', p_id using errcode = 'check_violation';
  end if;
  if v_tipo <> 'aberta' then
    raise exception 'as etapas de ganho e perdido não podem ser excluídas'
      using errcode = 'check_violation';
  end if;
  if p_id = p_mover_para then
    raise exception 'escolha outra etapa para receber os leads'
      using errcode = 'check_violation';
  end if;

  select id into v_destino from etapa where id = p_mover_para and tipo = 'aberta';
  if v_destino is null then
    raise exception 'a etapa de destino precisa existir e ser aberta'
      using errcode = 'check_violation';
  end if;

  update lead set etapa_id = v_destino where etapa_id = p_id;
  get diagnostics v_movidos = row_count;

  delete from etapa where id = p_id;

  -- fecha o buraco na numeração
  perform reordenar_etapas(array(
    select id from etapa where tipo = 'aberta' order by ordem
  ));

  return v_movidos;
end $$;
