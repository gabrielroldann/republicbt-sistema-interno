-- ============================================================================
-- Republic BT — custos fixos
--
-- O MODELO de um custo fixo, não o lançamento.
--
--   "Aluguel é R$3.400 por mês"      → custo_fixo  (esta tabela)
--   "Em agosto pagamos R$3.400"      → despesa     (01-nucleo.sql)
--
-- A separação existe para não criar um SEGUNDO lugar onde se digita aluguel.
-- Se o lucro por raquete lesse daqui e o fluxo de caixa lesse de `despesa`, os
-- dois divergiriam no primeiro reajuste e ninguém saberia qual está certo.
-- Aqui o modelo GERA a despesa, e todo o resto do sistema continua lendo
-- `despesa` — uma verdade só.
--
-- É o mesmo princípio de `venda.taxa_pct`: reajustar hoje não pode reescrever
-- o passado. Mês fechado é fato, não previsão.
--
-- Depende de 01-nucleo.sql (`despesa`) e 04-acesso.sql (`eh_gestor`).
-- ============================================================================

create table if not exists custo_fixo (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  -- As mesmas categorias de `despesa`, menos duas, e a ausência é a regra:
  --   'fornecedores' é compra de estoque, que vira custo da peça quando vende;
  --   'marketing'    é linha própria no lucro por unidade, porque é o único
  --                  custo que se decide de novo todo mês.
  categoria    text not null check (categoria in ('aluguel','folha','operacional')),
  valor_mensal numeric(12,2) not null check (valor_mensal >= 0),
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- Um custo com o mesmo nome duas vezes é quase sempre dedo trocado, e o efeito
-- é a loja pagar aluguel dobrado no relatório sem ninguém notar.
create unique index if not exists idx_custo_fixo_nome
  on custo_fixo (lower(nome)) where ativo;


-- Liga a despesa ao modelo que a gerou. É esta coluna que torna a aplicação
-- idempotente: sem ela, só o texto da descrição diria se a linha veio do
-- modelo, e renomear "Energia" para "Energia elétrica" duplicaria o mês.
alter table despesa add column if not exists custo_fixo_id uuid references custo_fixo(id);

-- Competência como COLUNA, não como expressão no índice.
--
-- `date_trunc('month', data)` seria o natural, mas o Postgres recusa: a função
-- não é IMMUTABLE (depende do fuso), e índice exige imutabilidade. Guardar o
-- 'aaaa-mm' resolve e ainda deixa a consulta legível.
alter table despesa add column if not exists competencia text;

create unique index if not exists idx_despesa_custo_fixo_mes
  on despesa (custo_fixo_id, competencia)
  where custo_fixo_id is not null;


-- ----------------------------------------------------------------------------
-- aplicar_custos_fixos — materializa o modelo como despesa da competência.
--
-- IDEMPOTENTE: roda quantas vezes quiser e o mês continua com uma linha por
-- custo. Sem isso, cada edição na tela empilharia mais um aluguel no mês e o
-- lucro afundaria a cada salvamento — um bug que parece problema de negócio, e
-- por isso demora semanas para ser reconhecido como bug.
--
-- Só mexe na competência pedida, e RECUSA mês fechado por padrão: reajustar o
-- aluguel hoje não pode reescrever o resultado de março.
-- ----------------------------------------------------------------------------
create or replace function aplicar_custos_fixos(
  p_mes text,
  p_forcar boolean default false
)
returns integer
language plpgsql
as $$
declare
  v_dia   date;
  v_n     integer := 0;
begin
  if p_mes !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'competência inválida: % (use aaaa-mm)', p_mes
      using errcode = 'check_violation';
  end if;

  v_dia := (p_mes || '-05')::date;

  if not p_forcar and v_dia < date_trunc('month', current_date) then
    raise exception 'mês % já fechou; use p_forcar => true para reescrever', p_mes
      using errcode = 'check_violation';
  end if;

  -- Fora o que este modelo gerou neste mês. As despesas avulsas e o marketing
  -- ficam: elas não vieram daqui e não são nossas para apagar.
  delete from despesa
  where custo_fixo_id is not null and competencia = p_mes;

  insert into despesa (data, descricao, categoria, valor, recorrente,
                       custo_fixo_id, competencia)
  select v_dia, c.nome, c.categoria, c.valor_mensal, true, c.id, p_mes
  from custo_fixo c
  where c.ativo;

  get diagnostics v_n = row_count;
  return v_n;
end $$;


-- O total do modelo — o que a loja paga todo mês, venda ou não venda.
create or replace view v_custo_fixo_mensal
with (security_invoker = true) as
  select
    coalesce(sum(valor_mensal), 0)                                   as total,
    coalesce(sum(valor_mensal) filter (where categoria = 'aluguel'), 0)     as aluguel,
    coalesce(sum(valor_mensal) filter (where categoria = 'folha'), 0)       as folha,
    coalesce(sum(valor_mensal) filter (where categoria = 'operacional'), 0) as operacional,
    count(*)::int                                                    as itens
  from custo_fixo where ativo;


-- ----------------------------------------------------------------------------
-- Acesso: custo fixo é dado de sócio.
--
-- Aluguel e folha dizem o tamanho real da operação, e folha diz quanto cada
-- pessoa ganha. Vendedor não lê — nem pela view.
-- ----------------------------------------------------------------------------
alter table custo_fixo enable row level security;

drop policy if exists custo_fixo_gestor on custo_fixo;
create policy custo_fixo_gestor on custo_fixo for select using (eh_gestor());

drop policy if exists custo_fixo_ins on custo_fixo;
drop policy if exists custo_fixo_upd on custo_fixo;
drop policy if exists custo_fixo_del on custo_fixo;
create policy custo_fixo_ins on custo_fixo for insert with check (eh_gestor());
create policy custo_fixo_upd on custo_fixo for update using (eh_gestor()) with check (eh_gestor());
create policy custo_fixo_del on custo_fixo for delete using (eh_gestor());
