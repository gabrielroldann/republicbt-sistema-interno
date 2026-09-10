import { supabase } from '@/lib/supabase';
import { recarregar } from '@/painel/data/fonte';

/**
 * ACESSO — quem consegue logar e o que consegue fazer.
 *
 * Separado de `queries.ts`/`gravarVendedor`, que é o cadastro COMERCIAL
 * (nome, meta, comissão) usado nas contas de vendas e comissão. Aqui é
 * identidade e permissão: login, papel, e as capacidades soltas em
 * `permissoes`. Mesma lógica do módulo `pendencias.ts` — consulta a tabela
 * direto, sem passar pelo cache de vendedores usado no cálculo financeiro.
 */
export type PapelUsuario = 'admin' | 'socio' | 'vendedor';

export interface Usuario {
  id: string;
  nome: string;
  usuario: string | null;
  papel: PapelUsuario;
  permissoes: Record<string, boolean>;
  ativo: boolean;
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('vendedor')
    .select('id, nome, usuario, papel, permissoes, ativo')
    .order('nome');
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => ({
    id: v.id as string,
    nome: v.nome as string,
    usuario: v.usuario as string | null,
    papel: v.papel as PapelUsuario,
    permissoes: (v.permissoes as Record<string, boolean>) ?? {},
    ativo: v.ativo as boolean,
  }));
}

/**
 * Cria a conta de login (Auth) e a linha de vendedor correspondente, numa
 * única chamada — precisa da service_role key, por isso vai para a Edge
 * Function em vez de um insert direto daqui.
 */
export async function criarUsuario(dados: {
  nome: string; usuario: string; papel: PapelUsuario; permissoes?: Record<string, boolean>;
  comissaoPct?: number;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('gerenciar-usuario', {
    body: { acao: 'criar', ...dados },
  });
  if (error) throw new Error(await extrairErro(error));
  if (data?.error) throw new Error(data.error);
  // A Edge Function grava direto no banco, por fora do cache do painel — sem
  // isto, o vendedor recém-criado não aparece em Equipe/Desempenho até
  // alguma outra escrita do painel disparar um recarregamento.
  await recarregar();
  return data.senha as string;
}

/** Gera uma senha temporária nova para quem já tem login — a pessoa troca no primeiro acesso. */
export async function resetarSenha(vendedorId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('gerenciar-usuario', {
    body: { acao: 'resetar_senha', vendedorId },
  });
  if (error) throw new Error(await extrairErro(error));
  if (data?.error) throw new Error(data.error);
  return data.senha as string;
}

/** Papel e permissões são só uma linha da tabela — RLS já restringe a escrita a admin. */
export async function atualizarPapelEPermissoes(
  id: string, papel: PapelUsuario, permissoes: Record<string, boolean>,
) {
  const { error } = await supabase.from('vendedor').update({ papel, permissoes }).eq('id', id);
  if (error) throw new Error(error.message);
  await recarregar();
}

/**
 * Ativa ou desativa — com o valor final explícito, não um "alternar".
 *
 * `alternarVendedorAtivo` (queries.ts) decide o próximo valor lendo o cache
 * em memória do painel, que só é preenchido por `recarregar()`. Um usuário
 * criado nesta tela ainda não está nesse cache, então o toggle "adivinharia"
 * errado o estado atual. Aqui o estado vem de `listarUsuarios()`, que é
 * sempre fresco — por isso a tela manda o valor de destino, não pede para
 * inferir.
 */
export async function definirAtivo(id: string, ativo: boolean) {
  const { error } = await supabase.from('vendedor').update({ ativo }).eq('id', id);
  if (error) throw new Error(error.message);
  await recarregar();
}

/**
 * As Edge Functions devolvem o erro de negócio no corpo da resposta, mas o
 * SDK só expõe `error.message` genérico ("Edge Function returned a non-2xx
 * status code") — o mesmo sintoma que apareceu no envio do Instagram. Aqui dá
 * pra buscar o corpo de verdade porque `error.context` é a Response crua.
 */
async function extrairErro(error: unknown): Promise<string> {
  const generico = error instanceof Error ? error.message : 'falha desconhecida';
  const contexto = (error as { context?: unknown } | null)?.context;
  if (contexto instanceof Response) {
    try {
      const corpo = await contexto.clone().json();
      if (typeof corpo?.error === 'string') return corpo.error;
    } catch { /* corpo não era JSON — segue com a mensagem genérica */ }
  }
  return generico;
}
