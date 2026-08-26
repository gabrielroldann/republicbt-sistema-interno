-- ============================================================================
-- SEMENTE DO TESTE DE HOJE
--
-- Rode DEPOIS dos arquivos 01 a 06, e depois de criar os usuários em
-- Authentication → Users no painel do Supabase.
--
-- TROQUE OS VALORES ENTRE << >> antes de rodar. Nada aqui adivinha nada.
--
-- Este arquivo é seguro de rodar mais de uma vez: tudo usa `on conflict`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AS PESSOAS
--
-- `auth_user_id` é o que liga a conta de login à linha de vendedor. Sem ele o
-- RLS trata a pessoa como "ninguém" e o CRM abre vazio — o que parece "a loja
-- não tem lead" e não "faltou um passo no cadastro".
--
-- Para achar o id: Authentication → Users → clique no usuário → copie o "UID".
-- ----------------------------------------------------------------------------
insert into vendedor (nome, iniciais, papel, auth_user_id, comissao_pct, ativo) values
  ('<<Gabriel Roldan>>', 'GR', 'admin',    '<<uid-do-gabriel>>'::uuid, 3, true),
  ('<<Sócio Dois>>',     'SD', 'socio',    '<<uid-do-socio>>'::uuid,   3, true),
  ('<<Sócio Três>>',     'ST', 'vendedor', '<<uid-do-vendedor>>'::uuid, 3, true)
on conflict (auth_user_id) do update
  set nome = excluded.nome, papel = excluded.papel, ativo = true;


-- ----------------------------------------------------------------------------
-- 2. O NÚMERO DA LOJA
--
-- `phone_number_id` é como a Meta identifica o número no webhook — não é o
-- telefone. Sem esse mapa a mensagem chega e o sistema não sabe de quem é.
--
-- Está na tela "Configuração da API" do app, como
-- "Identificação do número de telefone".
-- ----------------------------------------------------------------------------
insert into canal (id, nome, tipo, via, telefone, phone_number_id, ativo) values
  ('loja', 'Republic BT', 'loja', 'cloud_api',
   '<<5511999999999>>',            -- o número de TESTE da Meta, só dígitos
   '<<phone-number-id>>', true)
on conflict (id) do update
  set telefone = excluded.telefone,
      phone_number_id = excluded.phone_number_id,
      ativo = true;


-- ----------------------------------------------------------------------------
-- 3. OS NÚMEROS DOS VENDEDORES
--
-- Ficam cadastrados mas INATIVOS: o envio por eles depende do Evolution, que
-- ainda não existe. Cadastrar agora faz o botão "Atender pelo meu número"
-- aparecer com a mensagem certa em vez de sumir.
--
-- Descomente e preencha quando o Evolution entrar.
-- ----------------------------------------------------------------------------
-- insert into canal (id, nome, tipo, via, telefone, instancia, vendedor_id, ativo)
-- select 'vend:' || v.id, v.nome, 'vendedor', 'evolution',
--        '<<5585999999999>>', 'inst-' || v.id, v.id, false
-- from vendedor v where v.papel = 'vendedor'
-- on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 4. A CAMPANHA DO TESTE
--
-- O número de teste da Meta NÃO recebe Click-to-WhatsApp, então não vem
-- `referral`. A origem entra pelo código no texto do link:
--
--   https://wa.me/<<numero-de-teste>>?text=Quero%20a%20Nox%20%5BVERAO26%5D
--
-- O cliente não digita nada — o WhatsApp abre com a frase pronta.
-- ----------------------------------------------------------------------------
insert into campanha (id, nome, canal, codigo, ativa) values
  ('link:verao26',  'Verão 26 — Raquetes',      'outro', 'VERAO26',  true),
  ('link:iniciante','Kit iniciante — Instagram','outro', 'INICIANTE',true)
on conflict (id) do update
  set codigo = excluded.codigo, ativa = true;


-- ----------------------------------------------------------------------------
-- 5. UM POUCO DE CATÁLOGO, para a venda ter o que vender
-- ----------------------------------------------------------------------------
insert into produto (sku, nome, categoria, marca, custo, preco, estoque_min, ativo) values
  ('RAQ-NOX-ML10', 'Nox ML10 Pro Cup',    'raquetes',   'Nox',       430,  700, 3, true),
  ('RAQ-VL-ELIT',  'Vollo Elite Carbon',  'raquetes',   'Vollo',     560,  890, 3, true),
  ('RAQ-AD-ADP',   'Adidas Adipower BT',  'raquetes',   'Adidas',   1160, 1690, 2, true),
  ('ACE-OVG-PCK',  'Overgrip Pack 3un',   'acessorios', 'Drop Shot',  24,   69, 20, true)
on conflict (sku) do nothing;

-- Estoque inicial. O saldo é a soma dos movimentos — `produto` não tem campo
-- de estoque, de propósito: campo de saldo é o que desincroniza.
insert into movimento_estoque (produto_id, quantidade, tipo, custo_unit, observacao)
select p.id, 10, 'entrada', p.custo, 'Estoque inicial do teste'
from produto p
where p.sku in ('RAQ-NOX-ML10','RAQ-VL-ELIT','RAQ-AD-ADP','ACE-OVG-PCK')
  and not exists (
    select 1 from movimento_estoque m
    where m.produto_id = p.id and m.observacao = 'Estoque inicial do teste');


-- ----------------------------------------------------------------------------
-- 6. A MENSAGEM PADRÃO DO VENDEDOR
-- ----------------------------------------------------------------------------
insert into configuracao (chave, valor, descricao) values
  ('mensagem_padrao_vendedor',
   to_jsonb('Oi {cliente}, aqui é o {vendedor}, especialista em raquetes da {loja}. Vi que você chamou a gente no WhatsApp da loja e vou te atender por aqui.'::text),
   'Primeira mensagem que o vendedor manda ao assumir')
on conflict (chave) do nothing;


-- ============================================================================
-- CONFERÊNCIA — rode isto depois e olhe o resultado
-- ============================================================================
select 'vendedores'   as o_que, count(*)::text as quantos from vendedor where ativo
union all select 'com login',   count(*)::text from vendedor where auth_user_id is not null
union all select 'canais',      count(*)::text from canal where ativo
union all select 'campanhas',   count(*)::text from campanha where codigo is not null
union all select 'produtos',    count(*)::text from produto where ativo
union all select 'etapas',      count(*)::text from etapa;

-- "com login" tem que ser igual a "vendedores". Se for menor, alguém vai
-- conseguir entrar e não vai ver nada.
