import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ChevronRight, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Campo } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { useDesempenho } from '@/painel/data/hooks';
import { useEhAdmin } from '@/painel/store/filtros';
import { salvarVendedor } from '@/painel/data/queries';
import { fmtBRL, fmtNum, fmtPct } from '@/lib/utils';
import type { Vendedor } from '@/painel/types';

export default function Vendedores() {
  const admin = useEhAdmin();
  const navigate = useNavigate();
  const { data, isLoading } = useDesempenho();

  return (
    <div className="stagger space-y-4">
      <Card>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>#</TH>
                <TH>Vendedor</TH>
                <TH num>Vendas</TH>
                <TH num>Faturamento</TH>
                <TH num>Ticket médio</TH>
                {admin && <TH num>Margem gerada</TH>}
                {admin && <TH num>Comissão</TH>}
                <TH>Meta do período</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                  <TR key={i}>
                    {Array.from({ length: admin ? 9 : 7 }).map((__, j) => (
                      <TD key={j}><Skeleton className="h-3.5 w-full" /></TD>
                    ))}
                  </TR>
                ))
                : (data ?? []).map((d) => (
                  <TR
                    key={d.vendedor.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/painel/vendedores/${d.vendedor.id}`)}
                  >
                    <TD>
                      <span className={`text-2xs font-bold ${d.posicao === 1 ? 'text-gold-500' : 'text-faint'}`}>
                        {d.posicao}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-600/20 text-[10px] font-semibold text-navy-200">
                          {d.vendedor.iniciais}
                        </span>
                        <span className="font-medium text-ink">{d.vendedor.nome}</span>
                      </div>
                    </TD>
                    <TD num>{fmtNum(d.numeroVendas)}</TD>
                    <TD num className="font-semibold text-ink">{fmtBRL(d.faturamento)}</TD>
                    <TD num className="text-muted">{fmtBRL(d.ticketMedio)}</TD>
                    {admin && (
                      <TD num className={d.margem >= 0 ? 'text-positive' : 'text-negative'}>
                        {fmtBRL(d.margem)}
                      </TD>
                    )}
                    {admin && <TD num className="text-ink-2">{fmtBRL(d.comissao)}</TD>}
                    <TD>
                      <div className="w-40">
                        <div className="mb-1 flex items-baseline justify-between text-2xs">
                          <span className="text-faint">{fmtBRL(d.vendedor.metaMensal)}/mês</span>
                          <span
                            className={`font-semibold ${
                              d.progressoMeta >= 100 ? 'text-positive'
                              : d.progressoMeta >= 70 ? 'text-ink-2' : 'text-attention'
                            }`}
                          >
                            {fmtPct(d.progressoMeta, 0)}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-elev">
                          <div
                            className={`h-full rounded-full transition-all duration-200 ${
                              d.progressoMeta >= 100 ? 'bg-positive'
                              : d.progressoMeta >= 70 ? 'bg-navy-600/200' : 'bg-attention'
                            }`}
                            style={{ width: `${Math.min(d.progressoMeta, 100)}%` }}
                          />
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        {admin && <EditarMeta vendedor={d.vendedor} />}
                        <ChevronRight className="h-4 w-4 text-faint" />
                      </div>
                    </TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </TableWrap>
      </Card>

      {!isLoading && (data?.length ?? 0) > 0 && (
        <p className="px-1 text-2xs text-faint">
          O progresso da meta é proporcional ao período selecionado — em uma janela de 7 dias,
          a meta considerada é um quarto da meta mensal.
        </p>
      )}
    </div>
  );
}

/* ---------- editar meta e comissão (somente sócio) ---------- */

const schema = z.object({
  metaMensal: z.coerce.number().min(0, 'Informe um valor válido'),
  comissaoPct: z.coerce.number().min(0).max(100, 'Máximo 100%'),
});
type Form = z.infer<typeof schema>;

function EditarMeta({ vendedor }: { vendedor: Vendedor }) {
  const [aberto, setAberto] = useState(false);
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { metaMensal: vendedor.metaMensal, comissaoPct: vendedor.comissaoPct },
  });

  async function salvar(v: Form) {
    await salvarVendedor({
      id: vendedor.id, nome: vendedor.nome, metaMensal: v.metaMensal, comissaoPct: v.comissaoPct,
    });
    await qc.invalidateQueries();
    setAberto(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="iconSm" onClick={(e) => e.stopPropagation()}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogTitle>Meta e comissão</DialogTitle>
        <DialogDescription>{vendedor.nome}</DialogDescription>

        <form onSubmit={handleSubmit(salvar)} className="mt-4 space-y-3">
          <Campo label="Meta mensal (R$)">
            <Input type="number" step="100" {...register('metaMensal')} />
            {errors.metaMensal && <p className="mt-1 text-2xs text-negative">{errors.metaMensal.message}</p>}
          </Campo>
          <Campo label="Comissão (%)" hint="Aplicada sobre o faturamento do vendedor.">
            <Input type="number" step="0.1" {...register('comissaoPct')} />
            {errors.comissaoPct && <p className="mt-1 text-2xs text-negative">{errors.comissaoPct.message}</p>}
          </Campo>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="submit" size="sm">Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
