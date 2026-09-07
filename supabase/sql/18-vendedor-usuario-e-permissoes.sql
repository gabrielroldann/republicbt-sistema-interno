-- Nome de usuário (login interno) e permissões finas por vendedor.
--
-- `usuario` substitui e-mail pessoal no login: a Republic não tem domínio de
-- e-mail próprio ainda, então a conta de autenticação usa um e-mail interno
-- sintético (usuario@republicbt.internal, nunca enviado a lugar nenhum) e a
-- pessoa loga digitando só o nome de usuário. Ver Edge Function
-- `gerenciar-usuario` e `src/pages/Login.tsx`.
--
-- `permissoes` é uma extensão do papel fixo (admin/socio/vendedor), para
-- ligar/desligar capacidades específicas sem criar um papel novo para cada
-- combinação. Hoje só existe a chave `link_pagamento` (vendedor comum gerar
-- Link de Pagamento pela Cielo) — a tabela `pedido_link` já tem RLS que deixa
-- qualquer vendedor ver/criar só os próprios pedidos, então isto é só
-- liberação de tela, não abertura de dado novo.
alter table vendedor
  add column if not exists usuario text,
  add column if not exists permissoes jsonb not null default '{}'::jsonb;

create unique index if not exists idx_vendedor_usuario on vendedor (lower(usuario));

-- Preenche os usuários-semente a partir do e-mail atual, para não ficarem
-- sem `usuario` (a UI nova exige esse campo daqui para frente).
update vendedor v
set usuario = split_part(u.email, '@', 1)
from auth.users u
where v.auth_user_id = u.id and v.usuario is null;
