import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { AlertTriangle, Info, Pencil, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Card, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { Campo, Input, Select } from '@/components/ui/field';
import { KpiCard } from '@/painel/components/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCompetencias, useCriarCampanha, useAtualizarCampanha, useRetornoCampanhas,
  useSalvarCustoMidia,
} from '@/painel/data/hooks';
import { cn, fmtBRL, fmtMesAno, fmtNum, fmtPct, mesRef } from '@/lib/utils';
import type { Campanha, RetornoCampanha } from '@/painel/types';

/**
 * ONDE O DINHEIRO DE ANÚNCIO VIROU VENDA.
 *
 * A tela existe por uma frase: "não quero torrar dinheiro em campanha
 * ineficiente". Para responder isso são precisos os dois lados — quanto entrou
 * de lead e venda, e quanto saiu de verba. O segundo lado não tinha onde ser
 * digitado, então metade da conta simplesmente não existia.
 *
 * A coluna que decide é a ÚLTIMA, não o ROAS. ROAS de 5 parece ótimo, mas numa
 * raquete de 30% de margem sobra R$0,50 por real gasto; se a margem cair para
 * 20%, o mesmo ROAS passa a dar prejuízo sem o número mudar.
 */
export default function Campanhas() {
  const { data: competencias } = useCompetencias();
  const [mes, setMes] = useState(mesRef());
  const [dialogo, setDialogo] = useState<'criar' | Campanha | null>(null);

  useEffect(() => {
    if (competencias?.length && !competencias.includes(mes)) setMes(competencias[0]);
  }, [competencias]);

  const { data: linhas, isLoading } = useRetornoCampanhas(mes);
  const salvar = useSalvarCustoMidia();

  const pagas = (linhas ?? []).filter((l) => l.campanha.canal === 'meta');
  const t = {
    gasto: pagas.reduce((s, l) => s + l.gasto, 0),
    leads: pagas.reduce((s, l) => s + l.leads, 0),
    vendas: pagas.reduce((s, l) => s + l.vendas, 0),
    receita: pagas.reduce((s, l) => s + l.receita, 0),
    sobra: pagas.reduce((s, l) => s + l.sobra, 0),
  };

  const perdendo = pagas.filter((l) => l.gasto > 0 && l.sobra < 0);

  return (
    <div className="stagger space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-title text-ink">Retorno das campanhas</h2>
          <p className="mt-1 max-w-2xl text-caption text-muted">
            Quanto saiu de verba e quanto voltou em venda.{' '}
            <strong className="text-ink-2">O gasto você digita na coluna “Gasto”.</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select data-seletor="mes" value={mes} onChange={(e) => setMes(e.target.value)}
                  className="w-40">
            {(competencias ?? [mes]).map((m) => (
              <option key={m} value={m}>{fmtMesAno(m)}</option>
            ))}
          </Select>
          <Button size="sm" onClick={() => setDialogo('criar')}>
            <Plus className="h-3.5 w-3.5" /> Nova campanha
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Investido em mídia" valor={fmtBRL(t.gasto)} carregando={isLoading} />
        <KpiCard label="Leads" valor={fmtNum(t.leads)} carregando={isLoading}
                 hint={t.gasto > 0 && t.leads > 0 ? `${fmtBRL(t.gasto / t.leads)} por lead` : undefined} />
        <KpiCard label="Vendas" valor={fmtNum(t.vendas)} carregando={isLoading}
                 hint={t.leads > 0 ? `${fmtPct((t.vendas / t.leads) * 100)} de conversão` : undefined} />
        <KpiCard label="Receita gerada" valor={fmtBRL(t.receita)} carregando={isLoading}
                 hint={t.gasto > 0 ? `${(t.receita / t.gasto).toFixed(1)}x o investido` : undefined} />
        <KpiCard label="Sobra depois da mídia" valor={fmtBRL(t.sobra)} destaque
                 carregando={isLoading}
                 hint="receita − mercadoria − taxa − comissão − anúncio" />
      </div>

      {perdendo.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-md border border-negative-line bg-negative-soft px-3 py-2.5 text-caption">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
          <p className="text-muted">
            <strong className="text-ink-2">
              {perdendo.length} campanha{perdendo.length > 1 ? 's' : ''} gastando mais
              do que deixa:
            </strong>{' '}
            {perdendo.map((l) => l.campanha.nome).join(', ')}. Cada real ali sai do
            bolso e não volta — mesmo que o ROAS pareça bom.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Campanha por campanha</CardTitle>
            <CardDescription>
              Em {fmtMesAno(mes)} · clique no gasto para editar
            </CardDescription>
          </div>
        </CardHeader>

        {isLoading ? (
          <div className="space-y-2 px-5 pb-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-body">
              <thead>
                <tr className="border-y border-line-soft text-label uppercase text-faint">
                  <th className="px-5 py-2 text-left font-medium">Campanha</th>
                  <th className="px-3 py-2 text-right font-medium">Gasto</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">Por lead</th>
                  <th className="px-3 py-2 text-right font-medium">Vendas</th>
                  <th className="px-3 py-2 text-right font-medium">Conversão</th>
                  <th className="px-3 py-2 text-right font-medium">Receita</th>
                  <th className="px-3 py-2 text-right font-medium">Retorno</th>
                  <th className="px-5 py-2 text-right font-medium">Sobra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {(linhas ?? []).map((l) => (
                  <Linha
                    key={l.campanha.id} l={l}
                    onGasto={(gasto) =>
                      salvar.mutate({ campanhaId: l.campanha.id, mes, gasto })}
                    onEditar={() => setDialogo(l.campanha)}
                  />
                ))}
                {(linhas ?? []).length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-xs text-faint">
                      Nenhum lead, venda ou gasto em {fmtMesAno(mes)}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-start gap-2.5 border-t border-line-soft px-5 py-3 text-2xs text-faint">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <p>
            <strong className="text-muted">Retorno</strong> é receita ÷ gasto — o que a
            Meta chama de ROAS. <strong className="text-muted">Sobra</strong> é o que
            resta depois de pagar mercadoria, maquininha, comissão e o próprio anúncio.
            É a sobra que decide manter ou cortar: retorno alto com margem baixa ainda
            dá prejuízo. Campanhas sem gasto (orgânico, indicação) aparecem para
            comparação — elas trazem venda sem consumir verba.
          </p>
        </div>
      </Card>

      <DialogoCampanha estado={dialogo} onFechar={() => setDialogo(null)} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function Linha({
  l, onGasto, onEditar,
}: { l: RetornoCampanha; onGasto: (g: number) => void; onEditar: () => void }) {
  const paga = l.campanha.canal === 'meta';
  const ruim = paga && l.gasto > 0 && l.sobra < 0;

  return (
    <tr
      data-campanha={l.campanha.id}
      data-sobra={l.sobra.toFixed(2)}
      className={cn('transition-colors', ruim ? 'bg-negative-soft/40' : 'hover:bg-elev/50')}
    >
      <td className="px-5 py-2.5">
        <div className="group flex items-center gap-2">
          <span className="truncate font-medium text-ink">{l.campanha.nome}</span>
          {!l.campanha.ativa && <Badge variant="neutral">pausada</Badge>}
          <button
            onClick={onEditar} title="Editar campanha"
            className="text-faint opacity-0 transition-opacity hover:text-ink-2 group-hover:opacity-100"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
        {l.campanha.codigo && (
          <div className="text-2xs text-faint">código [{l.campanha.codigo}]</div>
        )}
        {l.campanha.metaAdId && (
          <div className="text-2xs text-faint">anúncio {l.campanha.metaAdId}</div>
        )}
      </td>

      <td className="px-3 py-2.5 text-right">
        {paga ? (
          <Input
            defaultValue={String(l.gasto)}
            inputMode="decimal"
            data-gasto={l.campanha.id}
            onBlur={(e) => {
              const v = Number(e.target.value.replace(/\./g, '').replace(',', '.'));
              if (Number.isFinite(v) && v !== l.gasto) onGasto(v);
              else e.target.value = String(l.gasto);
            }}
            className="h-7 w-24 text-right text-num tabular-nums"
          />
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>

      <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{fmtNum(l.leads)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
        {l.custoPorLead != null ? fmtBRL(l.custoPorLead) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{fmtNum(l.vendas)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
        {l.leads > 0 ? fmtPct(l.conversao) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtBRL(l.receita)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {l.retorno != null ? (
          <span className={l.retorno >= 1 ? 'text-ink-2' : 'text-negative'}>
            {l.retorno.toFixed(1)}x
          </span>
        ) : <span className="text-faint">—</span>}
      </td>

      {/* A coluna que decide. */}
      <td className="px-5 py-2.5 text-right">
        <span className={cn(
          'inline-flex items-center gap-1 tabular-nums font-semibold',
          l.sobra < 0 ? 'text-negative' : 'text-positive',
        )}>
          {paga && l.gasto > 0 && (
            l.sobra < 0
              ? <TrendingDown className="h-3.5 w-3.5" />
              : <TrendingUp className="h-3.5 w-3.5" />
          )}
          {fmtBRL(l.sobra)}
        </span>
      </td>
    </tr>
  );
}

/* -------------------------------------------------- cadastro de campanha -- */

interface FormCampanha {
  nome: string;
  canal: Campanha['canal'];
  codigo: string;
  ativa: boolean;
}

const CANAIS: { valor: Campanha['canal']; label: string }[] = [
  { valor: 'meta', label: 'Meta (Instagram/Facebook)' },
  { valor: 'google', label: 'Google' },
  { valor: 'organico', label: 'Orgânico' },
  { valor: 'indicacao', label: 'Indicação' },
  { valor: 'loja', label: 'Loja física' },
  { valor: 'site', label: 'Site' },
  { valor: 'outro', label: 'Outro' },
];

/**
 * Um diálogo só, pros dois casos — criar (`estado === 'criar'`) e editar
 * (`estado` é a própria campanha). O "código" é o que faz o rastreio sem
 * anúncio pago: qualquer mensagem que chegar com `[CÓDIGO]` no texto vira
 * essa campanha sozinha (ver `campanha_do_referral`, em `02-crm.sql`).
 */
function DialogoCampanha({
  estado, onFechar,
}: { estado: 'criar' | Campanha | null; onFechar: () => void }) {
  const criar = useCriarCampanha();
  const atualizar = useAtualizarCampanha();
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormCampanha>();

  const editando = estado !== 'criar' ? estado : null;
  const aberto = estado != null;

  useEffect(() => {
    if (estado === 'criar') {
      reset({ nome: '', canal: 'meta', codigo: '', ativa: true });
    } else if (estado) {
      reset({
        nome: estado.nome, canal: estado.canal,
        codigo: estado.codigo ?? '', ativa: estado.ativa,
      });
    }
  }, [estado, reset]);

  async function salvar(v: FormCampanha) {
    setErro(null);
    const input = {
      nome: v.nome, canal: v.canal, codigo: v.codigo.trim() || null, ativa: v.ativa,
    };
    try {
      if (editando) await atualizar.mutateAsync({ id: editando.id, ...input });
      else await criar.mutateAsync(input);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para salvar');
    }
  }

  function fechar() {
    setErro(null);
    onFechar();
  }

  const salvando = criar.isPending || atualizar.isPending;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <DialogTitle>{editando ? 'Editar campanha' : 'Nova campanha'}</DialogTitle>
        <DialogDescription>
          {editando
            ? 'Campanhas criadas automaticamente por anúncio real também podem ser renomeadas aqui.'
            : 'Para rastrear um link de bio ou story sem anúncio pago — não precisa de anúncio da Meta rodando.'}
        </DialogDescription>

        <form onSubmit={handleSubmit(salvar)} className="mt-4 space-y-3">
          <Campo label="Nome">
            <Input {...register('nome', { required: true })} placeholder="Ex.: Verão 26 — Raquetes" />
            {errors.nome && <p className="mt-1 text-2xs text-negative">obrigatório</p>}
          </Campo>

          <Campo label="Canal">
            <Select {...register('canal')}>
              {CANAIS.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
            </Select>
          </Campo>

          <Campo
            label="Código de rastreio (opcional)"
            hint='Sem colchetes — "VERAO26", não "[VERAO26]". Quem mandar mensagem com esse código no texto vira lead desta campanha automaticamente.'
          >
            <Input {...register('codigo')} placeholder="VERAO26" className="uppercase" />
          </Campo>

          <Campo label="Status">
            <Select {...register('ativa', { setValueAs: (v) => v === 'true' })}>
              <option value="true">Ativa</option>
              <option value="false">Pausada</option>
            </Select>
          </Campo>

          {erro && <p className="text-2xs text-negative">{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={fechar}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={salvando}>Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
