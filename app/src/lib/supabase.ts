import { createClient } from '@supabase/supabase-js';

/**
 * O cliente do banco.
 *
 * A chave `anon` fica visível no JavaScript do navegador — isso é por desenho,
 * não descuido. Ela não dá acesso a nada sozinha: quem decide o que cada pessoa
 * lê e escreve é o RLS, em `supabase/sql/04-acesso.sql`, a partir do usuário
 * autenticado.
 *
 * A `service_role` NUNCA entra aqui: ela ignora todo o RLS e só existe dentro
 * das Edge Functions, que rodam no servidor.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Sem as variáveis de ambiente, o painel roda em dados de demonstração — o que
 * permite abrir o projeto e navegar sem banco nenhum. Falhar em silêncio com
 * uma tela vazia seria pior: ninguém saberia se a loja não vendeu nada ou se a
 * configuração está errada.
 */
export const MOCK = !url || !anon;

export const supabase = MOCK
  ? (null as never)
  : createClient(url!, anon!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });

if (MOCK && import.meta.env.DEV) {
  console.info(
    '[Republic BT] Painel em dados de demonstração. ' +
    'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para ligar no banco.',
  );
}
