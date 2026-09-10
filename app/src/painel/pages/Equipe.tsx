import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Pencil, Power, UserPlus, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Campo } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { alternarVendedorAtivo, definirMeta, salvarVendedor } from '@/painel/data/queries';
import { useAcompanhamentoMeta, useDesempenho, useMetas, useVendedores } from '@/painel/data/hooks';
import { cn, fmtBRL, fmtMesAno, fmtPct, mesRef } from '@/lib/utils';
import type { Vendedor } from '@/painel/types';

/* ---------- cadastro de vendedor ---------- */

const schemaVendedor = z.object({
  nome: z.string().trim().min(2, 'Informe o nome'),
  metaMensal: z.coerce.number().min(0),
  comissaoPct: z.coerce.number().min(0).max(100, 'Máximo 100%'),
});
type FormVendedor = z.infer<typeof schemaVendedor>;

/* ---------- meta da loja ---------- */

const schemaMeta = z.object({
  mes: z.string().min(7),
  receita: z.coerce.number().min(0),
});
type FormMeta = z.infer<typeof schemaMeta>;

export default function Equipe() {
  const qc = useQueryClient();
  const { data: vendedores, isLoading } = useVendedores();
  const { data: desempenho } = useDesempenho();
  const { data: metas } = useMetas();
  const { data: acomp } = useAcompanhamentoMeta();
  const [editando, setEditando] = useState<Vendedor | null>(null);

  const fv = useForm<FormVendedor>({
    resolver: zodResolver(schemaVendedor),
    defaultValues: { nome: '', metaMensal: 18000, comissaoPct: 3 },
  });

  const fm = useForm<FormMeta>({
    resolver: zodResolver(schemaMeta),
    defaultValues: { mes: mesRef(), receita: acomp?.meta ?? 50000 },
  });

  async function submeterVendedor(f: FormVendedor) {
    await salvarVendedor({ id: editando?.id, ...f });
    await qc.invalidateQueries();
    fv.reset({ nome: '', metaMensal: 18000, comissaoPct: 3 });
    setEditando(null);
  }

  function editar(v: Vendedor) {
    setEditando(v);
    fv.reset({ nome: v.nome, metaMensal: v.metaMensal, comissaoPct: v.comissaoPct });
  }

  async function submeterMeta(f: FormMeta) {
    await definirMeta(f.mes, f.receita);
    await qc.invalidateQueries();
  }

  const metasOrdenadas = [...(metas ?? [])].sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 8);

  return (
    <div className="stagger space-y-5">
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        {/* cadastro em formulário aberto, não escondido atrás de ícone */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{editando ? 'Editar vendedor' : 'Cadastrar vendedor'}</CardTitle>
              <CardDescription>
                {editando ? `Alterando ${editando.nome}` : 'Nome, meta mensal e percentual de comissão'}
              </CardDescription>
            </div>
            {editando && (
              <Button
                variant="ghost" size="iconSm"
                onClick={() => { setEditando(null); fv.reset({ nome: '', metaMensal: 18000, comissaoPct: 3 }); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardHeader>
          <form onSubmit={fv.handleSubmit(submeterVendedor)} className="space-y-3 px-5 pb-5">
            <Campo label="Nome *">
              <Input {...fv.register('nome')} placeholder="Pedro Luca" />
              {fv.formState.errors.nome && (
                <p className="mt-1 text-2xs text-negative">{fv.formState.errors.nome.message}</p>
              )}
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Meta mensal (R$)">
                <Input type="number" step="500" {...fv.register('metaMensal')} />
              </Campo>
              <Campo label="Comissão (%)" hint="sobre o recebido">
                <Input type="number" step="0.1" {...fv.register('comissaoPct')} />
                {fv.formState.errors.comissaoPct && (
                  <p className="mt-1 text-2xs text-negative">{fv.formState.errors.comissaoPct.message}</p>
                )}
              </Campo>
            </div>
            <Button type="submit" className="w-full">
              <UserPlus className="h-3.5 w-3.5" />
              {editando ? 'Salvar alterações' : 'Cadastrar vendedor'}
            </Button>
            <p className="text-2xs leading-relaxed text-faint">
              A comissão incide sobre o valor <strong className="text-muted">recebido</strong>, não
              sobre o contratado — com parcelamento, ninguém deve comissão de dinheiro que ainda
              não entrou.
            </p>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Equipe</CardTitle>
              <CardDescription>Meta e comissão de cada vendedor, com o realizado do período</CardDescription>
            </div>
            <Badge variant="neutral">
              {(vendedores ?? []).filter((v) => v.ativo).length} ativo(s)
            </Badge>
          </CardHeader>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Vendedor</TH>
                  <TH num>Meta mensal</TH>
                  <TH num>Comissão</TH>
                  <TH num>Realizado no período</TH>
                  <TH num>Comissão a pagar</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                    <TR key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TD key={j}><Skeleton className="h-3.5 w-full" /></TD>
                      ))}
                    </TR>
                  ))
                  : (vendedores ?? []).map((v) => {
                    const d = desempenho?.find((x) => x.vendedor.id === v.id);
                    return (
                      <TR key={v.id} className={cn(!v.ativo && 'opacity-45')}>
                        <TD>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-600/25 text-[10px] font-semibold text-navy-200">
                              {v.iniciais}
                            </span>
                            <div>
                              <div className="font-medium text-ink">{v.nome}</div>
                              {!v.ativo && <div className="text-2xs text-faint">inativo</div>}
                            </div>
                          </div>
                        </TD>
                        <TD num>{fmtBRL(v.metaMensal)}</TD>
                        <TD num className="text-ink-2">{fmtPct(v.comissaoPct)}</TD>
                        <TD num>
                          {d ? (
                            <div>
                              <div className="font-semibold text-ink">{fmtBRL(d.faturamento)}</div>
                              <div className={cn(
                                'text-2xs',
                                d.progressoMeta >= 100 ? 'text-positive' : 'text-faint',
                              )}>
                                {fmtPct(d.progressoMeta, 0)} da meta
                              </div>
                            </div>
                          ) : '—'}
                        </TD>
                        <TD num className="text-ink-2">{d ? fmtBRL(d.comissao) : '—'}</TD>
                        <TD>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="iconSm" title="Editar" onClick={() => editar(v)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="iconSm"
                              title={v.ativo ? 'Desativar' : 'Reativar'}
                              onClick={async () => { await alternarVendedorAtivo(v.id); await qc.invalidateQueries(); }}
                            >
                              <Power className={cn('h-3.5 w-3.5', v.ativo ? 'text-positive' : 'text-faint')} />
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
              </TBody>
            </Table>
          </TableWrap>
          <div className="border-t border-line-soft px-5 py-3 text-2xs text-faint">
            Vendedor sai da operação sendo <strong className="text-muted">desativado</strong>, nunca
            excluído — apagar levaria junto todo o histórico de vendas dele, e o passado precisa
            continuar existindo nos relatórios.
          </div>
        </Card>
      </div>

      {/* meta da loja, por competência */}
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Meta de receita da loja</CardTitle>
              <CardDescription>Definida por competência mensal</CardDescription>
            </div>
          </CardHeader>
          <form onSubmit={fm.handleSubmit(submeterMeta)} className="space-y-3 px-5 pb-5">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Competência"><Input type="month" {...fm.register('mes')} /></Campo>
              <Campo label="Meta (R$)"><Input type="number" step="500" {...fm.register('receita')} /></Campo>
            </div>
            <Button type="submit" className="w-full">Salvar meta</Button>
            <p className="text-2xs leading-relaxed text-faint">
              A meta da loja alimenta o acompanhamento de ritmo na Visão Geral. Vale definir
              acompanhando a sazonalidade — dezembro e janeiro puxam o beach tennis para cima,
              junho e julho para baixo.
            </p>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Metas por competência</CardTitle>
              <CardDescription>Últimos meses</CardDescription>
            </div>
          </CardHeader>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Competência</TH>
                  <TH num>Meta de receita</TH>
                  <TH>Situação</TH>
                </tr>
              </THead>
              <TBody>
                {metasOrdenadas.map((m) => {
                  const atual = m.mes === mesRef();
                  return (
                    <TR key={m.mes}>
                      <TD>
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-ink capitalize">{fmtMesAno(m.mes)}</span>
                          {atual && <Badge variant="navy">atual</Badge>}
                        </span>
                      </TD>
                      <TD num className="font-semibold text-ink">{fmtBRL(m.receita)}</TD>
                      <TD>
                        {atual && acomp ? (
                          <span className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-elev">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  acomp.cobertura >= 1 ? 'bg-positive' : 'bg-attention',
                                )}
                                style={{ width: `${Math.min(acomp.atingimento, 100)}%` }}
                              />
                            </div>
                            <span className="text-2xs tabular-nums text-muted">
                              {fmtPct(acomp.atingimento, 0)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-2xs text-faint">encerrada</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      </div>
    </div>
  );
}
