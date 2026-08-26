-- ============================================================================
-- FECHAR O PAPEL PUBLICO
--
-- Aplicado no projeto como as migracoes 08, 09 e 10. Guardado aqui para o
-- schema continuar reproduzivel a partir do repositorio.
--
-- O PORQUE, em uma frase: a chave `anon` vai no JavaScript do navegador e nao
-- tem como esconder -- entao ela nao pode abrir nada.
--
-- Antes disto, o `anon` tinha privilegio em tudo e o que segurava era so o
-- RLS. Uma linha de defesa. Um `using (true)` escrito as pressas, uma view
-- nova sem `security_invoker`, e o faturamento da loja vai para a internet.
-- Ja aconteceu aqui uma vez, com seis views.
-- ============================================================================

-- 08 -------------------------------------------------------------- privilegio
revoke all   on all tables    in schema public from anon;
revoke all   on all sequences in schema public from anon;
revoke all   on all functions in schema public from anon;
revoke usage on schema public from anon;

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

grant usage on schema public to authenticated;
grant all on all tables    in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

-- 09 ------------------------------------------------------------------ PUBLIC
-- Revogar do `anon` nao bastou: duas funcoes seguiam respondendo sem login,
-- porque quem tinha o EXECUTE era o pseudo-papel PUBLIC, do qual todo papel
-- herda. Funcao no Postgres nasce executavel por PUBLIC.
revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;

grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- 10 ------------------------------------------------------------- search_path
-- Funcao sem `search_path` proprio usa o de quem chamou. Em SECURITY DEFINER
-- isso e escalada de privilegio: o chamador aponta para um schema dele, planta
-- la um `etapa` falso, e a funcao do dono executa o codigo dele com os poderes
-- do dono. Sao sete SECURITY DEFINER aqui, quatro delas escrevem no funil.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path%'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.assinatura);
  end loop;
end $$;
