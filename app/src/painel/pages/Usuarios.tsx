import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Loader2, ShieldAlert, UserPlus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select, Campo, Segmentado } from '@/components/ui/field';
import { Table, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import {
  atualizarPapelEPermissoes, criarUsuario, definirAtivo, listarUsuarios, resetarSenha,
  type PapelUsuario, type Usuario,
} from '@/painel/data/usuarios';
import { cn } from '@/lib/utils';
import { useSessao } from '@/store/sessao';

/**
 * USUÁRIOS — quem consegue entrar no sistema, e com qual papel.
 *
 * Diferente de "Equipe e Metas": lá é o cadastro comercial (meta, comissão);
 * aqui é login e acesso. Um vendedor pode existir num lugar sem existir no
 * outro por um tempo — ex.: acabou de ser contratado e ainda não tem meta
 * definida, mas já precisa entrar no CRM no primeiro dia.
 *
 * A Republic não tem e-mail próprio ainda, então o login é por NOME DE
 * USUÁRIO (ver `Login.tsx` e a Edge Function `gerenciar-usuario`) — a senha
 * é gerada aqui, mostrada UMA VEZ, e o dono troca no primeiro acesso.
 */
export default function Usuarios() {
  const qc = useQueryClient();
  const { vendedorId: meuId } = useSessao();
  const { data: usuarios, isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: listarUsuarios });
  const [senhaGerada, setSenhaGerada] = useState<{ usuario: string; senha: string } | null>(null);

  return (
    <div className="stagger space-y-5">
      <div>
        <h1 className="text-lg font-bold text-ink">Usuários</h1>
        <p className="text-caption text-muted">Quem tem login, com qual papel, e o que cada um pode fazer</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <FormularioCriarUsuario onCriado={(usuario, senha) => {
          qc.invalidateQueries({ queryKey: ['usuarios'] });
          setSenhaGerada({ usuario, senha });
        }} />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Contas</CardTitle>
              <CardDescription>Papel e permissões de cada login</CardDescription>
            </div>
            <Badge variant="neutral">{(usuarios ?? []).filter((u) => u.ativo).length} ativo(s)</Badge>
          </CardHeader>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Nome</TH>
                  <TH>Usuário</TH>
                  <TH>Papel</TH>
                  <TH>Link de Pagamento</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                    <TR key={i}><TD colSpan={5}>&nbsp;</TD></TR>
                  ))
                  : (usuarios ?? []).map((u) => (
                    <LinhaUsuario
                      key={u.id} usuario={u} souEu={u.id === meuId}
                      onSenhaGerada={(senha) => setSenhaGerada({ usuario: u.usuario ?? u.nome, senha })}
                      onMudou={() => qc.invalidateQueries({ queryKey: ['usuarios'] })}
                    />
                  ))}
              </TBody>
            </Table>
          </TableWrap>
          <div className="border-t border-line-soft px-5 py-3 text-2xs text-faint">
            Ninguém é excluído aqui — desativar tira o acesso na hora (o banco confere isto a cada
            ação), sem apagar o histórico de vendas ou conversas já ligado à pessoa.
          </div>
        </Card>
      </div>

      <DialogSenha
        senha={senhaGerada}
        onFechar={() => setSenhaGerada(null)}
      />
    </div>
  );
}

function FormularioCriarUsuario({ onCriado }: { onCriado: (usuario: string, senha: string) => void }) {
  const [nome, setNome] = useState('');
  const [usuario, setUsuario] = useState('');
  const [papel, setPapel] = useState<PapelUsuario>('vendedor');
  const [linkPagamento, setLinkPagamento] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const mCriar = useMutation({
    mutationFn: () => criarUsuario({
      nome: nome.trim(),
      usuario: usuario.trim().toLowerCase(),
      papel,
      permissoes: papel === 'vendedor' ? { link_pagamento: linkPagamento } : {},
    }),
    onSuccess: (senha) => {
      onCriado(usuario.trim().toLowerCase(), senha);
      setNome(''); setUsuario(''); setPapel('vendedor'); setLinkPagamento(true);
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'não deu para criar o usuário'),
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Criar usuário</CardTitle>
          <CardDescription>Gera o login — a senha aparece uma vez só, ao final</CardDescription>
        </div>
      </CardHeader>
      <form
        onSubmit={(e) => { e.preventDefault(); setErro(null); mCriar.mutate(); }}
        className="space-y-3 px-5 pb-5"
      >
        <Campo label="Nome *">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Pedro Luca" required />
        </Campo>
        <Campo label="Usuário (login) *" hint="letras minúsculas, sem espaço — ex.: pedro.luca">
          <Input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value.toLowerCase().replace(/\s+/g, '.'))}
            placeholder="pedro.luca" required
          />
        </Campo>
        <Campo label="Papel *">
          <Select value={papel} onChange={(e) => setPapel(e.target.value as PapelUsuario)}>
            <option value="vendedor">Vendedor</option>
            <option value="socio">Sócio</option>
            <option value="admin">Administrador (acesso total)</option>
          </Select>
        </Campo>

        {papel === 'vendedor' && (
          <Campo label="Gerar Link de Pagamento" hint="sem isso, o link só sai pelo painel (sócio/admin)">
            <Segmentado
              opcoes={[{ valor: true, label: 'Sim' }, { valor: false, label: 'Não' }]}
              valor={linkPagamento} aoMudar={setLinkPagamento}
            />
          </Campo>
        )}

        {papel === 'admin' && (
          <p className="flex items-start gap-1.5 rounded-md border border-attention/30 bg-attention-soft px-2.5 py-2 text-2xs text-attention">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Administrador vê e mexe em tudo, inclusive financeiro e outros usuários.
          </p>
        )}

        {erro && <p className="text-2xs text-negative">{erro}</p>}

        <Button type="submit" className="w-full" disabled={mCriar.isPending}>
          {mCriar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          Criar usuário
        </Button>
      </form>
    </Card>
  );
}

function LinhaUsuario({
  usuario, souEu, onSenhaGerada, onMudou,
}: { usuario: Usuario; souEu: boolean; onSenhaGerada: (senha: string) => void; onMudou: () => void }) {
  const mPapel = useMutation({
    mutationFn: (papel: PapelUsuario) => atualizarPapelEPermissoes(usuario.id, papel, usuario.permissoes),
    onSuccess: onMudou,
  });
  const mPermissao = useMutation({
    mutationFn: (linkPagamento: boolean) =>
      atualizarPapelEPermissoes(usuario.id, usuario.papel, { ...usuario.permissoes, link_pagamento: linkPagamento }),
    onSuccess: onMudou,
  });
  const mReset = useMutation({
    mutationFn: () => resetarSenha(usuario.id),
    onSuccess: onSenhaGerada,
  });
  const mAtivo = useMutation({
    // Valor de destino explícito (não um "alternar") — ver o comentário em
    // `definirAtivo`, em usuarios.ts.
    mutationFn: () => definirAtivo(usuario.id, !usuario.ativo),
    onSuccess: onMudou,
  });

  return (
    <TR className={cn(!usuario.ativo && 'opacity-45')}>
      <TD>
        <div className="font-medium text-ink">{usuario.nome}</div>
        {!usuario.ativo && <div className="text-2xs text-faint">desativado</div>}
      </TD>
      <TD className="font-mono text-ink-2">{usuario.usuario ?? '—'}</TD>
      <TD>
        <Select
          className="h-8 w-40 text-xs"
          value={usuario.papel}
          disabled={mPapel.isPending || souEu}
          title={souEu ? 'Peça para outro admin trocar o seu papel' : undefined}
          onChange={(e) => mPapel.mutate(e.target.value as PapelUsuario)}
        >
          <option value="vendedor">Vendedor</option>
          <option value="socio">Sócio</option>
          <option value="admin">Administrador</option>
        </Select>
      </TD>
      <TD>
        {usuario.papel === 'vendedor' ? (
          <Segmentado
            opcoes={[{ valor: true, label: 'Sim' }, { valor: false, label: 'Não' }]}
            valor={!!usuario.permissoes.link_pagamento}
            aoMudar={(v) => mPermissao.mutate(v)}
          />
        ) : (
          <span className="text-2xs text-faint">já tem no painel</span>
        )}
      </TD>
      <TD>
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost" size="sm" title="Gerar nova senha temporária"
            disabled={mReset.isPending || !usuario.ativo}
            onClick={() => mReset.mutate()}
          >
            {mReset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            Resetar senha
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => mAtivo.mutate()}
            disabled={mAtivo.isPending || (souEu && usuario.ativo)}
            title={souEu && usuario.ativo ? 'Você não pode se desativar' : undefined}
          >
            {usuario.ativo ? 'Desativar' : 'Reativar'}
          </Button>
        </div>
      </TD>
    </TR>
  );
}

function DialogSenha({
  senha, onFechar,
}: { senha: { usuario: string; senha: string } | null; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    if (!senha) return;
    navigator.clipboard?.writeText(senha.senha);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Dialog open={!!senha} onOpenChange={(open) => { if (!open) onFechar(); }}>
      <DialogContent className="text-center">
        <div className="flex flex-col items-center gap-3 py-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-positive-soft text-positive">
            <Check className="h-6 w-6" />
          </div>
          <DialogTitle>Senha gerada</DialogTitle>
          <DialogDescription>
            Repasse para <strong className="text-ink-2">{senha?.usuario}</strong> agora — ela só aparece
            esta vez. Peça para trocar assim que entrar.
          </DialogDescription>
          <p className="break-all rounded bg-elev px-3 py-2 font-mono text-body text-ink-2">
            {senha?.senha}
          </p>
          <div className="flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={copiar}>
              <Copy className="h-3.5 w-3.5" /> {copiado ? 'Copiado!' : 'Copiar'}
            </Button>
            <Button className="flex-1" onClick={onFechar}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
