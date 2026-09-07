-- ============================================================================
-- TRÊS AJUSTES PEQUENOS DA CAIXA DE ENTRADA, SEGUIDOS NO TEMPO.
--
-- Aplicados em produção como migrações separadas (ligar_realtime_caixa_de_entrada,
-- preparar_canal_vendedor_status_conexao, restringir_exclusao_conversa_a_gestor,
-- assumir_conversa_atribui_lead) e nunca trazidos para este arquivo — o schema
-- do repositório ficou incapaz de reproduzir sozinho o que já está em produção.
-- Consolidados aqui, na ordem em que aconteceram, para o replay 01→N voltar a
-- funcionar do zero.
-- ============================================================================

-- 1) REALTIME: conversa e mensagem passam a notificar assinantes (a caixa de
-- entrada atualiza sozinha quando chega mensagem nova, sem esperar um F5).
-- `replica identity full` é necessário para o realtime enxergar o valor
-- ANTERIOR da linha em updates, não só o novo.
alter table conversa replica identity full;
alter table mensagem replica identity full;
alter publication supabase_realtime add table conversa, mensagem;

-- 2) STATUS DE CONEXÃO DO CANAL DO VENDEDOR (Evolution/QR code): a tela do
-- vendedor precisa mostrar se o WhatsApp dele está conectado, conectando, ou
-- caiu — sem isso, "não chegou mensagem" e "o número caiu" pareciam a mesma
-- coisa.
alter table canal add column if not exists instancia_evolution text;
alter table canal add column if not exists status_conexao text not null default 'desconectado'
  check (status_conexao in ('desconectado', 'conectando', 'conectado'));

-- o canal da loja já está funcionando de verdade, então já nasce marcado
update canal set status_conexao = 'conectado' where id = 'loja';

-- 3) EXCLUIR CONVERSA só por admin/sócio. Antes, qualquer papel autenticado
-- apagava — inclusive vendedor, sem essa ser uma ação do dia a dia dele
-- (conversa só se apaga por ser teste ou lixo).
drop policy if exists conversa_escrita_del on conversa;
create policy conversa_escrita_del on conversa for delete using (eh_gestor());

-- 4) ASSUMIR CONVERSA também assume o LEAD ligado a ela, quando o lead ainda
-- não tem responsável. Antes, o vendedor assumia a conversa mas o card do
-- funil continuava "de ninguém" até alguém mexer nele manualmente.
create or replace function public.assumir_conversa(p_conversa uuid, p_vendedor uuid)
returns boolean
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare v_ok boolean; v_lead uuid;
begin
  update conversa set atendente_id = p_vendedor,
      assumida_em = coalesce(assumida_em, now()), status = 'em_atendimento'
  where id = p_conversa and (atendente_id is null or atendente_id = p_vendedor)
  returning true, lead_id into v_ok, v_lead;

  -- O dono da conversa vira o dono do lead. Só quando o lead ainda não tem
  -- responsável: assumir uma conversa não deve tomar um lead de outra pessoa
  -- que já estava com ele.
  if coalesce(v_ok, false) and v_lead is not null then
    update lead set responsavel_id = p_vendedor
    where id = v_lead and responsavel_id is null;
  end if;

  return coalesce(v_ok, false);
end $function$;
