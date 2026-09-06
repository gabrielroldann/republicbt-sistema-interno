import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { supabase } from '@/lib/supabase';

/**
 * Entrar.
 *
 * Não é enfeite: todo o controle de acesso do banco depende de saber QUEM está
 * pedindo. Sem sessão, `auth.uid()` volta nulo, o RLS trata a pessoa como
 * "ninguém" e o banco recusa tudo — o painel abre zerado e parece que a loja
 * não vendeu nada.
 */
/**
 * A Republic não tem domínio de e-mail próprio ainda, então o login é por
 * NOME DE USUÁRIO. Por baixo o Supabase Auth continua exigindo um e-mail —
 * este é o mesmo domínio sintético usado pela função `gerenciar-usuario` ao
 * criar a conta. Nunca é enviado e-mail para lá, é só um formato válido.
 */
const DOMINIO_INTERNO = 'republicbt.internal';

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEntrando(true);
    try {
      const email = `${usuario.trim().toLowerCase()}@${DOMINIO_INTERNO}`;
      const { error } = await supabase.auth.signInWithPassword({
        email, password: senha,
      });
      // A mensagem do Supabase é genérica de propósito: ela não diz se o
      // usuário existe, para não virar uma forma de descobrir quem tem conta.
      // Traduzo mantendo essa ambiguidade.
      if (error) {
        setErro(/invalid login/i.test(error.message)
          ? 'Usuário ou senha incorretos.' : error.message);
      }
    } catch {
      setErro('não deu para conectar. Confira sua internet.');
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-gold-400 text-body font-extrabold text-ongold">
            RB
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-ink">Republic BT</h1>
          <p className="mt-1 text-xs text-muted">Gestão interna</p>
        </div>

        <form onSubmit={entrar}
              className="space-y-3 rounded-md border border-line bg-elev p-5">
          <div>
            <label className="mb-1 block text-2xs uppercase tracking-wide text-faint">Usuário</label>
            <Input type="text" value={usuario} onChange={(e) => setUsuario(e.target.value)}
                   autoComplete="username" autoFocus required />
          </div>
          <div>
            <label className="mb-1 block text-2xs uppercase tracking-wide text-faint">Senha</label>
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                   autoComplete="current-password" required />
          </div>

          {erro && (
            <p className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-xs text-negative">
              {erro}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={entrando}>
            <LogIn className="h-4 w-4" />
            {entrando ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
