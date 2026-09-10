/**
 * CRIAR CONTA DE LOGIN E RESETAR SENHA
 *
 * Precisa rodar no servidor porque as duas ações usam `auth.admin.*`, que só
 * funciona com a service_role key — se essa chave fosse para o navegador,
 * qualquer um logado criaria conta de admin para si mesmo.
 *
 * A Republic ainda não tem domínio de e-mail próprio, então o login é por
 * NOME DE USUÁRIO: por baixo, cada usuário vira uma conta Supabase Auth com
 * um e-mail sintético `usuario@republicbt.internal`, que nunca é enviado a
 * lugar nenhum — existe só porque o Auth exige um e-mail.
 *
 * `verify_jwt` desligado pelo mesmo motivo das outras funções: a conferência
 * de quem está pedindo (e que precisa ser admin) é feita aqui, na mão, para
 * devolver erro em português.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const DOMINIO_INTERNO = 'republicbt.internal';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const erro = (msg: string, status = 400) =>
  new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...cors, 'content-type': 'application/json' },
  });

function gerarSenhaTemporaria(): string {
  // Sem caracteres ambíguos (0/O, 1/l/I) — é para ser lida e digitada na hora
  // de trocar, não decorada.
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

/** Mesmo algoritmo de `salvarVendedor` (queries.ts) — duas iniciais, maiúsculas. */
function gerarIniciais(nome: string): string {
  const iniciais = nome.trim().split(/\s+/).slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '').join('');
  return iniciais || 'V';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const auth = req.headers.get('Authorization') ?? '';
  const { data: usuarioAuth } = await db.auth.getUser(auth.replace('Bearer ', ''));
  if (!usuarioAuth?.user) return erro('não autenticado', 401);

  const { data: solicitante } = await db
    .from('vendedor').select('id, papel').eq('auth_user_id', usuarioAuth.user.id)
    .eq('ativo', true).maybeSingle();
  if (!solicitante || solicitante.papel !== 'admin') {
    return erro('só o usuário master pode gerenciar contas', 403);
  }

  let corpo: {
    acao?: 'criar' | 'resetar_senha';
    nome?: string; usuario?: string; papel?: string;
    permissoes?: Record<string, boolean>;
    comissaoPct?: number;
    vendedorId?: string;
  };
  try { corpo = await req.json(); } catch { return erro('corpo inválido'); }

  if (corpo.acao === 'resetar_senha') {
    if (!corpo.vendedorId) return erro('vendedorId é obrigatório');

    const { data: alvo } = await db
      .from('vendedor').select('auth_user_id').eq('id', corpo.vendedorId).maybeSingle();
    if (!alvo?.auth_user_id) return erro('usuário não encontrado ou sem login', 404);

    const senha = gerarSenhaTemporaria();
    const { error } = await db.auth.admin.updateUserById(alvo.auth_user_id, { password: senha });
    if (error) return erro(error.message, 500);

    return new Response(JSON.stringify({ ok: true, senha }), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  if (corpo.acao === 'criar') {
    const nome = corpo.nome?.trim();
    const usuario = corpo.usuario?.trim().toLowerCase();
    const papel = corpo.papel;

    if (!nome) return erro('nome é obrigatório');
    if (!usuario || !/^[a-z0-9._-]{3,20}$/.test(usuario)) {
      return erro('usuário deve ter 3-20 caracteres: letras minúsculas, números, ponto, hífen ou underscore');
    }
    if (!['admin', 'socio', 'vendedor'].includes(papel ?? '')) {
      return erro('papel deve ser admin, socio ou vendedor');
    }
    const comissaoPct = papel === 'vendedor'
      ? Math.max(0, Math.min(100, Number(corpo.comissaoPct) || 0))
      : 0;

    const email = `${usuario}@${DOMINIO_INTERNO}`;
    const senha = gerarSenhaTemporaria();

    const { data: criado, error: eAuth } = await db.auth.admin.createUser({
      email, password: senha, email_confirm: true,
    });
    if (eAuth) {
      return erro(
        /already.*registered|duplicate/i.test(eAuth.message)
          ? 'já existe um usuário com esse nome' : eAuth.message,
        409,
      );
    }

    const { error: eVendedor } = await db.from('vendedor').insert({
      nome, usuario, papel,
      iniciais: gerarIniciais(nome),
      permissoes: corpo.permissoes ?? {},
      auth_user_id: criado.user.id,
      meta_mensal: 0, comissao_pct: comissaoPct, ativo: true,
    });
    if (eVendedor) {
      // Não deixa órfão: se a linha de vendedor falhar, desfaz a conta de auth.
      await db.auth.admin.deleteUser(criado.user.id);
      return erro(eVendedor.message, 500);
    }

    return new Response(JSON.stringify({ ok: true, senha }), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  return erro('ação inválida: use "criar" ou "resetar_senha"');
});
