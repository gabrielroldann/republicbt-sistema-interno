import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/field';
import { KpiCard } from '@/painel/components/KpiCard';
import { Table, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { GraficoMensal } from '@/painel/components/charts';
import { useEstimativaImposto, useFaturamentoMensal } from '@/painel/data/hooks';
import { ANEXO_I, aliquotaEfetiva, faixaDe } from '@/painel/data/queries';
import { fmtBRL, fmtMesAno, fmtPct } from '@/lib/utils';

export default function Impostos() {
  const est = useEstimativaImposto();
  const meses = useFaturamentoMensal(12);

  // As alíquotas são editáveis de propósito: mudam por lei e por regime, e o
  // usuário precisa poder conferir o cálculo em vez de aceitar caixa-preta.
  const [tabela, setTabela] = useState(ANEXO_I);

  const recalculado = useMemo(() => {
    if (!est.data) return null;
    const rbt12 = est.data.rbt12;
    const faixa = tabela.find((f) => rbt12 <= f.ate) ?? tabela[tabela.length - 1];
    const efetiva = aliquotaEfetiva(rbt12, faixa);
    return {
      faixa,
      efetiva,
      das: est.data.faturamentoMes * (efetiva / 100),
      idx: tabela.indexOf(faixa),
    };
  }, [est.data, tabela]);

  const carregando = est.isLoading || meses.isLoading;
  const d = est.data;
  const faixaAtual = recalculado?.faixa ?? (d ? faixaDe(d.rbt12) : null);
  const proxima = recalculado && recalculado.idx < tabela.length - 1 ? tabela[recalculado.idx + 1] : null;
  const falta = faixaAtual && d ? faixaAtual.ate - d.rbt12 : null;
  const progressoFaixa = faixaAtual && d ? (d.rbt12 / faixaAtual.ate) * 100 : 0;

  function editar(i: number, campo: 'aliquotaNominal' | 'parcelaDeduzir', valor: number) {
    setTabela((t) => t.map((f, k) => (k === i ? { ...f, [campo]: valor } : f)));
  }

  return (
    <div className="stagger space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-attention/25 bg-attention-soft px-3 py-2.5 text-xs text-attention">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          <strong className="font-semibold">Estimativa, não apuração.</strong> Este módulo projeta o
          DAS a partir do faturamento registrado aqui e das alíquotas do Anexo I. Não considera
          retenções, ICMS-ST, sublimites estaduais nem outras particularidades. Não substitui o
          cálculo do contador e não serve para recolhimento.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Receita bruta 12 meses" valor={fmtBRL(d?.rbt12 ?? 0)} carregando={carregando}
          hint="RBT12 — define a faixa"
        />
        <KpiCard
          label="Alíquota efetiva" valor={fmtPct(recalculado?.efetiva ?? 0, 2)} carregando={carregando}
          hint={faixaAtual ? `nominal ${fmtPct(faixaAtual.aliquotaNominal, 2)}` : undefined}
        />
        <KpiCard
          label="Faturamento do mês" valor={fmtBRL(d?.faturamentoMes ?? 0)} carregando={carregando}
          hint="base do DAS"
        />
        <KpiCard
          label="DAS estimado" valor={fmtBRL(recalculado?.das ?? 0)} destaque carregando={carregando}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Faturamento dos últimos 12 meses</CardTitle>
              <CardDescription>É a soma destas barras que determina a faixa</CardDescription>
            </div>
            {faixaAtual && <Badge variant="navy">{faixaAtual.faixa}ª faixa</Badge>}
          </CardHeader>
          <CardContent className="px-2">
            {carregando
              ? <Skeleton className="mx-3 h-[240px]" />
              : <GraficoMensal dados={meses.data ?? []} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Distância da próxima faixa</CardTitle>
              <CardDescription>Cruzar o limite aumenta a alíquota</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {carregando || !faixaAtual ? <Skeleton className="h-24" /> : (
              <>
                <div className="mb-1.5 flex items-baseline justify-between text-2xs">
                  <span className="text-muted">Faixa {faixaAtual.faixa}</span>
                  <span className="tabular-nums font-semibold text-ink-2">{fmtPct(progressoFaixa, 0)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-elev">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      progressoFaixa > 90 ? 'bg-attention' : 'bg-navy-600'
                    }`}
                    style={{ width: `${Math.min(progressoFaixa, 100)}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-2xs text-faint">
                  <span>{fmtBRL(d?.rbt12 ?? 0)}</span>
                  <span>{fmtBRL(faixaAtual.ate)}</span>
                </div>

                <div className="mt-4 space-y-2 border-t border-line-soft pt-3 text-xs">
                  <Linha rotulo="Falta para a próxima faixa" valor={falta !== null ? fmtBRL(falta) : '—'} />
                  {proxima && (
                    <>
                      <Linha
                        rotulo="Alíquota efetiva se cruzar"
                        valor={fmtPct(aliquotaEfetiva(proxima.ate, proxima), 2)}
                      />
                      <Linha
                        rotulo="Impacto no DAS do mês"
                        valor={`+ ${fmtBRL(
                          (d?.faturamentoMes ?? 0) *
                            ((aliquotaEfetiva(faixaAtual.ate + 1, proxima) - (recalculado?.efetiva ?? 0)) / 100),
                        )}`}
                        destaque
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Simples Nacional — Anexo I (comércio)</CardTitle>
            <CardDescription>
              Alíquota efetiva = ((RBT12 × alíquota nominal) − parcela a deduzir) ÷ RBT12.
              É por isso que quase ninguém paga a alíquota de tabela.
            </CardDescription>
          </div>
        </CardHeader>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Faixa</TH>
                <TH num>Receita bruta em 12 meses até</TH>
                <TH num>Alíquota nominal</TH>
                <TH num>Parcela a deduzir</TH>
                <TH num>Efetiva no teto da faixa</TH>
              </tr>
            </THead>
            <TBody>
              {tabela.map((f, i) => {
                const atual = faixaAtual?.faixa === f.faixa;
                return (
                  <TR key={f.faixa} className={atual ? 'bg-navy-600/15' : undefined}>
                    <TD>
                      <span className="flex items-center gap-2">
                        <span className={`font-medium ${atual ? 'text-navy-200' : 'text-ink-2'}`}>
                          {f.faixa}ª
                        </span>
                        {atual && <Badge variant="navy">atual</Badge>}
                      </span>
                    </TD>
                    <TD num className="text-ink-2">{fmtBRL(f.ate)}</TD>
                    <TD num>
                      <Input
                        className="ml-auto h-7 w-20 text-right text-xs"
                        type="number" step="0.01" value={f.aliquotaNominal}
                        onChange={(e) => editar(i, 'aliquotaNominal', Number(e.target.value))}
                      />
                    </TD>
                    <TD num>
                      <Input
                        className="ml-auto h-7 w-28 text-right text-xs"
                        type="number" step="1" value={f.parcelaDeduzir}
                        onChange={(e) => editar(i, 'parcelaDeduzir', Number(e.target.value))}
                      />
                    </TD>
                    <TD num className="font-medium text-ink">
                      {fmtPct(aliquotaEfetiva(f.ate, f), 2)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
        <div className="border-t border-line-soft px-5 py-3 text-2xs text-faint">
          Os campos são editáveis para conferência e simulação — as alíquotas mudam por lei e por
          anexo. Confirme os valores vigentes com o contador antes de usar como base de decisão.
        </div>
      </Card>

      {d && (
        <Card>
          <CardHeader><CardTitle>Memória de cálculo</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <Linha rotulo="RBT12 (soma dos 12 meses)" valor={fmtBRL(d.rbt12)} />
            <Linha rotulo="Faixa aplicável" valor={`${faixaAtual?.faixa}ª — até ${fmtBRL(faixaAtual?.ate ?? 0)}`} />
            <Linha rotulo="Alíquota nominal" valor={fmtPct(faixaAtual?.aliquotaNominal ?? 0, 2)} />
            <Linha rotulo="Parcela a deduzir" valor={fmtBRL(faixaAtual?.parcelaDeduzir ?? 0)} />
            <Linha rotulo="Alíquota efetiva" valor={fmtPct(recalculado?.efetiva ?? 0, 2)} />
            <Linha rotulo={`Faturamento de ${fmtMesAno(meses.data?.at(-1)?.mes ?? '')}`} valor={fmtBRL(d.faturamentoMes)} />
            <Linha rotulo="DAS estimado" valor={fmtBRL(recalculado?.das ?? 0)} destaque />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted">{rotulo}</span>
      <span className={`tabular-nums font-semibold ${destaque ? 'text-gold-300' : 'text-ink'}`}>{valor}</span>
    </div>
  );
}
