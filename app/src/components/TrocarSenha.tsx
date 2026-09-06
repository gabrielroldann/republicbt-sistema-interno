import { useState } from 'react';
import { Check, KeyRound, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Campo } from '@/components/ui/field';
import { MOCK, supabase } from '@/lib/supabase';

/**
 * TROCAR A PRÓPRIA SENHA.
 *
 * Sem senha ATUAL de propósito: o Supabase já confia nesta sessão (é o mesmo
 * princípio de qualquer app logado — a barreira é ter entrado, não provar de
 * novo a cada ação dentro de casa). Existe só porque antes desta tela a ÚNICA
 * forma de trocar senha era pedir pro admin resetar de novo pela tela de
 * Usuários — bom para o primeiro acesso, ruim como rotina.
 *
 * Compartilhada entre Painel e CRM: é a mesma conta Supabase Auth nos dois,
 * então a tela não pode existir em duplicado e divergir.
 */
export function TrocarSenha() {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [estado, setEstado] = useState<'ocioso' | 'enviando' | 'ok'>('ocioso');
  const [erro, setErro] = useState<string | null>(null);

  if (MOCK) return null; // não existe sessão de verdade para trocar

  const podeEnviar = senha.length >= 6 && senha === confirmacao;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;
    setErro(null);
    setEstado('enviando');
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setErro(error.message);
      setEstado('ocioso');
      return;
    }
    setSenha('');
    setConfirmacao('');
    setEstado('ok');
    setTimeout(() => setEstado('ocioso'), 3000);
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Trocar minha senha</CardTitle>
          <CardDescription>Vale para o seu login — ninguém mais é afetado</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Campo label="Nova senha" hint="mínimo 6 caracteres">
            <Input
              type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
              autoComplete="new-password" minLength={6}
            />
          </Campo>
          <Campo label="Confirmar senha">
            <Input
              type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
              autoComplete="new-password"
            />
          </Campo>
          <Button type="submit" disabled={!podeEnviar || estado === 'enviando'}>
            {estado === 'enviando'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : estado === 'ok'
                ? <Check className="h-3.5 w-3.5" />
                : <KeyRound className="h-3.5 w-3.5" />}
            {estado === 'ok' ? 'Senha trocada' : 'Trocar senha'}
          </Button>
        </form>
        {confirmacao && senha !== confirmacao && (
          <p className="mt-2 text-2xs text-negative">As senhas não coincidem.</p>
        )}
        {erro && <p className="mt-2 text-2xs text-negative">{erro}</p>}
      </CardContent>
    </Card>
  );
}
