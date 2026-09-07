-- ============================================================================
-- ALINHA O E-MAIL DE AUTH DAS CONTAS-SEMENTE AO LOGIN POR USUÁRIO.
--
-- Aplicado em produção como a migração alinhar_email_auth_aos_usuarios_semente,
-- logo depois de vendedor_usuario_e_permissoes (arquivo 18) — e nunca trazido
-- para o repositório.
--
-- O login virou por nome de usuário (usuario@republicbt.internal por baixo,
-- ver arquivo 18 e a Edge Function `gerenciar-usuario`), mas as contas-semente
-- ainda tinham o e-mail antigo no Auth. Sem isto, a troca do Login.tsx
-- quebraria o acesso de quem já tinha conta — inclusive o admin.
-- ============================================================================
update auth.users u
set email = v.usuario || '@republicbt.internal'
from vendedor v
where v.auth_user_id = u.id and v.usuario is not null;

update auth.identities i
set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v.usuario || '@republicbt.internal'))
from vendedor v
where v.auth_user_id = i.user_id and v.usuario is not null and i.provider = 'email';
