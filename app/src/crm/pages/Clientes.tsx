import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ExternalLink, Pencil, Search, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { Campo, Input } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { EstadoVazio, Table, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import {
  useAtualizarCliente, useClientes, useExcluirCliente, useExcluirClienteComHistorico,
  useHistoricoCliente,
} from '@/crm/data/hooks';
import { formatarTelefone, linkWhatsApp } from '@/crm/data/queries';
import { useSessao } from '@/store/sessao';
import { fmtData } from '@/lib/utils';
import type { Cliente } from '@/crm/types';

/**
 * Todo cliente que já falou com a loja, uma vez só. Não existe botão de
 * "novo cliente" aqui: o cadastro nasce sozinho no primeiro contato — é
 * `identificar_cliente`, no banco, quem cria a linha (ver `receber_mensagem`
 * em `supabase/sql/02-crm.sql`). Esta tela é a vitrine dele, o pré-cadastro
 * que uma venda futura já encontra pronto — e o lugar de corrigir nome/e-mail
 * ou tirar da lista quem entrou por engano.
 */
export default function Clientes() {
  const [busca, setBusca] = useState('');
  const buscaAtiva = useMemo(() => busca.trim() || undefined, [busca]);
  const { data: clientes, isLoading } = useClientes(buscaAtiva);

  const [editando, setEditando] = useState<Cliente | null>(null);
  const [excluindo, setExcluindo] = useState<Cliente | null>(null);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4">
        <div>
          <h1 className="text-body font-semibold text-ink">Clientes</h1>
          <p className="text-caption text-faint">
            Todo mundo que já mandou mensagem pra loja, com nome e telefone prontos pra quando a venda acontecer.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, telefone ou e-mail"
            className="pl-9"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <Card>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Cliente</TH>
                  <TH>Telefone</TH>
                  <TH>E-mail</TH>
                  <TH>Cidade</TH>
                  <TH>Origem</TH>
                  <TH>Primeiro contato</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                    <TR key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TD key={j}><Skeleton className="h-3.5 w-full" /></TD>
                      ))}
                    </TR>
                  ))
                  : clientes?.map((c) => (
                    <TR key={c.id}>
                      <TD className="font-medium text-ink">{c.nome ?? '—'}</TD>
                      <TD className="text-muted">{formatarTelefone(c.telefone)}</TD>
                      <TD className="text-muted">{c.email ?? '—'}</TD>
                      <TD className="text-muted">{c.cidade ?? '—'}</TD>
                      <TD className="text-muted">{c.campanhaOrigem ?? '—'}</TD>
                      <TD className="text-muted">{fmtData(c.primeiroContatoEm)}</TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          {linkWhatsApp(c.telefone) && (
                            <a
                              href={linkWhatsApp(c.telefone)!}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir no WhatsApp"
                              className="flex h-7 w-7 items-center justify-center text-faint transition-colors hover:text-ink-2"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <Button variant="ghost" size="iconSm" onClick={() => setEditando(c)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="iconSm" onClick={() => setExcluindo(c)} title="Excluir"
                            className="hover:text-negative"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
            {!isLoading && (clientes?.length ?? 0) === 0 && (
              <EstadoVazio titulo="Nenhum cliente ainda">
                <Users className="mx-auto mb-1 h-4 w-4 text-faint" />
                Assim que alguém mandar a primeira mensagem pro WhatsApp da loja, aparece aqui.
              </EstadoVazio>
            )}
          </TableWrap>
        </Card>
      </div>

      <DialogoEditar cliente={editando} onFechar={() => setEditando(null)} />
      <DialogoExcluir cliente={excluindo} onFechar={() => setExcluindo(null)} />
    </div>
  );
}

/* ---------------------------------------------------------- editar ---- */

interface FormEdicao {
  nome: string;
  email: string;
  cidade: string;
}

function DialogoEditar({ cliente, onFechar }: { cliente: Cliente | null; onFechar: () => void }) {
  const atualizar = useAtualizarCliente();
  const { register, handleSubmit, reset } = useForm<FormEdicao>();

  // Reabrir o diálogo para OUTRO cliente precisa recarregar os valores, não
  // herdar os do anterior — por isso a dependência é o id, não o objeto.
  useEffect(() => {
    if (cliente) {
      reset({ nome: cliente.nome ?? '', email: cliente.email ?? '', cidade: cliente.cidade ?? '' });
    }
  }, [cliente?.id, reset]);

  async function salvar(v: FormEdicao) {
    if (!cliente) return;
    await atualizar.mutateAsync({
      id: cliente.id,
      nome: v.nome.trim() || null,
      email: v.email.trim() || null,
      cidade: v.cidade.trim() || null,
    });
    onFechar();
  }

  return (
    <Dialog open={cliente != null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogTitle>Editar cliente</DialogTitle>
        <DialogDescription>{formatarTelefone(cliente?.telefone ?? null)}</DialogDescription>

        <form onSubmit={handleSubmit(salvar)} className="mt-4 space-y-3">
          <Campo label="Nome">
            <Input {...register('nome')} />
          </Campo>
          <Campo label="E-mail">
            <Input type="email" {...register('email')} />
          </Campo>
          <Campo label="Cidade">
            <Input {...register('cidade')} />
          </Campo>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={atualizar.isPending}>Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------- excluir ---- */

function DialogoExcluir({ cliente, onFechar }: { cliente: Cliente | null; onFechar: () => void }) {
  const { papel } = useSessao();
  const souGestor = papel === 'admin' || papel === 'socio';

  const { data: historico } = useHistoricoCliente(cliente?.id ?? null);
  const excluir = useExcluirCliente();
  const excluirTudo = useExcluirClienteComHistorico();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoTudo, setConfirmandoTudo] = useState(false);

  const temHistorico = !!historico && (historico.leads + historico.conversas + historico.vendas) > 0;

  async function confirmar() {
    if (!cliente) return;
    setErro(null);
    try {
      await excluir.mutateAsync(cliente.id);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para excluir');
    }
  }

  async function confirmarTudo() {
    if (!cliente) return;
    setErro(null);
    try {
      await excluirTudo.mutateAsync(cliente.id);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para excluir');
    }
  }

  function fechar() {
    setErro(null);
    setConfirmandoTudo(false);
    onFechar();
  }

  const partes = historico && [
    historico.leads > 0 && `${historico.leads} lead${historico.leads > 1 ? 's' : ''}`,
    historico.conversas > 0 && `${historico.conversas} conversa${historico.conversas > 1 ? 's' : ''}`,
    historico.vendas > 0 && `${historico.vendas} venda${historico.vendas > 1 ? 's' : ''}`,
  ].filter(Boolean).join(', ');

  return (
    <Dialog open={cliente != null} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Excluir "{cliente?.nome ?? formatarTelefone(cliente?.telefone ?? null)}"</DialogTitle>
        <DialogDescription>
          Esta ação não pode ser desfeita.
        </DialogDescription>

        {temHistorico && (
          <p className="mt-3 text-caption text-attention">
            Este cliente tem {partes} vinculado — o cliente sozinho não sai
            enquanto isso existir.
          </p>
        )}

        {erro && <p className="mt-3 text-caption text-negative">{erro}</p>}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={fechar}>Cancelar</Button>
          {temHistorico && souGestor && !confirmandoTudo && (
            <Button
              variant="destructive" size="sm" onClick={() => setConfirmandoTudo(true)}
            >
              Excluir tudo junto
            </Button>
          )}
          {confirmandoTudo ? (
            <Button
              variant="destructive" size="sm" onClick={confirmarTudo} disabled={excluirTudo.isPending}
            >
              Confirmar: apagar {partes} e o cliente
            </Button>
          ) : (
            !temHistorico && (
              <Button
                variant="destructive" size="sm" onClick={confirmar} disabled={excluir.isPending}
              >
                Excluir
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
