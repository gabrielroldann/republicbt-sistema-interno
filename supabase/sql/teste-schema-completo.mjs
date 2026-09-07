/**
 * O SCHEMA INTEIRO, DO ZERO.
 *
 * Os outros testes carregam só até onde precisam (01-06, ou 01-05) — nenhum
 * deles nunca aplicou os arquivos 08 em diante. Foi assim que o repositório
 * ficou, por meses, incapaz de reconstruir sozinho o banco que já está em
 * produção: faltavam ~12 migrações (Instagram, carrinho, Link de Pagamento/
 * Cielo, NCM/CFOP, CPF...) que só existiam aplicadas direto no projeto, nunca
 * como arquivo aqui.
 *
 * Este teste não verifica REGRA DE NEGÓCIO (isso é papel dos outros) — só
 * prova uma coisa, mas a mais básica de todas: que TODO o schema, do 01 ao
 * mais recente, aplica sem erro num banco vazio, na ordem em que os arquivos
 * existem. Se algum arquivo novo depender de algo que um arquivo anterior
 * ainda não criou, é aqui que aparece — antes de virar uma migração órfã.
 *
 *   npm run teste-schema-completo
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const base = new URL('.', import.meta.url).pathname;
const db = await new PGlite();

let falhas = 0;
const ok = (c, m) => { console.log(`   ${c ? '✓' : '✗ FALHOU:'} ${m}`); if (!c) falhas++; };

// Dublê mínimo do que o Supabase fornece de fábrica: as três roles-base e as
// tabelas de auth que algumas migrações tocam (vendedor.usuario é semeado a
// partir de auth.users; o alinhamento de e-mail mexe em auth.identities).
// Não é o GoTrue de verdade — é só o suficiente para o DDL/DML rodar.
await db.exec(`
  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;  exception when duplicate_object then null; end $$;

  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;

  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );
  create table if not exists auth.identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    provider text,
    identity_data jsonb
  );

  -- A publicação de realtime é criada pela própria infra do Supabase, não por
  -- migração nenhuma — precisa existir aqui só para o "alter publication ...
  -- add table" (arquivo 13) ter onde adicionar.
  do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
`);

// A ordem aqui É o que se está testando — não um glob ordenado por nome.
// Arquivos 07, 09 e 10 não existem como arquivo próprio: 07 (correção de
// views SECURITY DEFINER) já nasceu aplicado direto nas views de 02/04; 09 e
// 10 estão consolidados dentro de 08 (o próprio arquivo diz isso no
// cabeçalho). 99 é semente de dados de demonstração, carregada por último.
const ARQUIVOS = [
  '01-nucleo.sql', '02-crm.sql', '03-site.sql', '04-acesso.sql', '05-funil.sql',
  '06-custos.sql', '08-fechar-anon.sql', '11-piso-de-preco.sql', '12-venda-so-gestor.sql',
  '13-realtime-conexao-e-exclusao-de-conversa.sql', '14-canal-instagram.sql',
  '15-carrinho-cielo-nfe-pedido-link.sql', '16-venda-fecha-lead.sql',
  '17-indices-cliente-id.sql', '18-vendedor-usuario-e-permissoes.sql',
  '19-alinhar-email-auth-usuarios-semente.sql', '20-otimiza-rls-link-e-indices-fk.sql',
];

console.log(`\napliando ${ARQUIVOS.length} arquivos de schema, um banco vazio, do zero:\n`);
for (const a of ARQUIVOS) {
  try {
    await db.exec(readFileSync(`${base}/${a}`, 'utf8'));
    ok(true, a);
  } catch (e) {
    ok(false, `${a} — ${e.message}`);
    // Um arquivo que falha deixa o banco num estado incerto para os
    // próximos — não adianta insistir, e o objetivo (achar ONDE quebra) já
    // foi cumprido.
    break;
  }
}

// 99-semente-hoje.sql fica de fora do replay automático de propósito: é
// semente de DEMONSTRAÇÃO com um placeholder (`<<uid-do-gabriel>>`) que se
// substitui à mão pelo uid real antes de rodar — não é schema, e "falhar"
// nesse placeholder não indica um problema no repositório.
const IGNORADOS = new Set(['99-semente-hoje.sql']);

// Conferir que nenhum arquivo de SCHEMA ficou de fora desta lista por
// esquecimento (novo arquivo criado e nunca somado ao replay).
const noDisco = readdirSync(base)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const faltando = noDisco.filter((f) => !ARQUIVOS.includes(f) && !IGNORADOS.has(f));
ok(faltando.length === 0,
   faltando.length === 0
     ? 'nenhum arquivo de schema ficou de fora desta lista'
     : `arquivo(s) de schema na pasta que este teste não carrega: ${faltando.join(', ')}`);

console.log(`\n${falhas === 0
  ? 'O schema inteiro se reconstrói do zero, só com os arquivos deste repositório.'
  : `${falhas} falha(s) — o repositório não reproduz sozinho o banco de produção.`}`);
process.exit(falhas === 0 ? 0 : 1);
