import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Plus, Trash2 } from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { KpiCard } from '@/painel/components/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCompetencias, useCustosFixos, useExcluirCustoFixo, useLucroUnitario,
  useSalvarCustoFixo,
} from '@/painel/data/hooks';
import { cn, fmtBRL, fmtMesAno, fmtNum, fmtPct, mesRef } from '@/lib/utils';
import type { CustoFixo, LucroUnitario } from '@/painel/types';

/**
 * QUANTO SOBRA DE CADA RAQUETE.
 *
 * A tela responde três perguntas em ordem, e a ordem é o desenho:
 *
 *   margem de contribuição   "vender mais uma melhora minha vida?"
 *   depois da mídia          "o anúncio se paga?"
 *   lucro por raquete        "a loja inteira se paga?"
 *
 * As três aparecem, não só a última. Só a última esconderia a informação mais
 * acionável: numa loja que está começando, a margem de contribuição pode estar
 * ótima e o lucro por unidade negativo — e a conclusão disso não é "mexer no
 * preço", é "vender mais". São remédios opostos para o mesmo sintoma.
 */
export function CustoPorUnidade() {
  const { data: competencias } = useCompetencias();
  const [mes, setMes] = useState(mesRef());

  // A competência corrente pode não ter venda ainda. Cair na mais recente que
  // TEM é melhor do que abrir a tela zerada e parecer quebrada.
  useEffect(() => {
    if (competencias?.length && !competencias.includes(mes)) setMes(competencias[0]);
  }, [competencias]);

  const { data: lu, isLoading } = useLucroUnitario(mes);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-title text-ink">Quanto sobra de cada raquete</h2>
          <p className="mt-1 max-w-2xl text-caption text-muted">
            Preço de venda menos tudo: mercadoria, maquininha, comissão, imposto,
            anúncio e a fatia da estrutura que a raquete banca.{' '}
            <strong className="text-ink-2">
              Aluguel, luz, água e salários você digita ao lado, em “Custos fixos”.
            </strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lu?.mesEmAndamento && (
            <Badge variant="attention">
              mês em andamento · dia {lu.diasDecorridos} de {lu.diasDoMes}
            </Badge>
          )}
          <Select data-seletor="mes" value={mes}
                  onChange={(e) => setMes(e.target.value)} className="w-40">
            {(competencias ?? [mes]).map((m) => (
              <option key={m} value={m}>{fmtMesAno(m)}</option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading || !lu ? (
        <Skeleton className="h-96 w-full" />
      ) : lu.unidades === 0 ? (
        <SemVenda mes={mes} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Margem de contribuição"
              valor={fmtBRL(lu.margemContribuicao)}
              hint={`${fmtPct(lu.margemContribuicaoPct)} do preço — antes da estrutura`}
            />
            <KpiCard
              label="Depois do anúncio"
              valor={fmtBRL(lu.depoisDaMidia)}
              hint={`${fmtBRL(lu.midiaPorUnidade)} de mídia por raquete`}
              inverterCor={lu.depoisDaMidia < 0}
            />
            <KpiCard
              label="Lucro por raquete"
              valor={fmtBRL(lu.lucroUnitario)}
              hint={`${fmtPct(lu.lucroUnitarioPct)} do preço · antes do pró-labore`}
              destaque
            />
            <KpiCard
              label="Ponto de equilíbrio"
              valor={`${fmtNum(lu.pontoEquilibrio)} raquetes`}
              hint={lu.faltamParaEquilibrio > 0
                ? `faltam ${fmtNum(lu.faltamParaEquilibrio)} para pagar o mês`
                : `vendidas ${fmtNum(lu.unidades)} — o mês está pago`}
            />
          </div>

          {/*
            O EDITOR VEM ANTES DOS AVISOS. Estava o contrário, e o resultado é
            que a única coisa acionável da tela ficava enterrada embaixo de
            quatro parágrafos de explicação — quem abriu a página não achou onde
            digitar o aluguel. Explicação é para quem já viu o número; o campo é
            para quem chegou agora.
          */}
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <Cascata lu={lu} />
            <div className="space-y-4">
              <EditorCustosFixos />
              <Avisos lu={lu} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ cascata ══ */

function Cascata({ lu }: { lu: LucroUnitario }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>A conta, linha por linha</CardTitle>
          <CardDescription>
            {fmtNum(lu.unidades)} raquete{lu.unidades > 1 ? 's' : ''} vendida
            {lu.unidades > 1 ? 's' : ''} em {fmtMesAno(lu.mes)} · valores médios por unidade
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-body">
          <tbody>
            <Linha id="preco" rotulo="Preço médio de venda" valor={lu.precoMedio} tipo="entrada" />

            <Linha id="custo" rotulo="Custo da raquete" valor={-lu.custoMedio}
                   nota="o que a loja pagou no fornecedor" />
            <Linha id="taxa" rotulo="Taxa da maquininha" valor={-lu.taxaMedia}
                   nota="congelada na venda, não recalculada depois" />
            <Linha id="comissao" rotulo="Comissão do vendedor" valor={-lu.comissaoMedia}
                   nota="sobre o recebido, não sobre o contratado" />
            <Linha id="imposto" rotulo={`Simples Nacional (${fmtPct(lu.aliquotaSimples, 2)})`}
                   valor={-lu.impostoMedio}
                   nota="alíquota efetiva, pelo faturamento dos 12 meses" />

            <Subtotal id="contribuicao" rotulo="Margem de contribuição"
                      valor={lu.margemContribuicao}
                      pct={lu.margemContribuicaoPct}
                      nota="o que cada raquete deixa para pagar a loja" />

            <Linha id="midia" rotulo="Anúncio por raquete" valor={-lu.midiaPorUnidade}
                   nota={`${fmtBRL(lu.midiaTotal)} no mês ÷ ${fmtNum(lu.unidades)} vendidas`} />

            <Subtotal id="pos-midia" rotulo="Depois do anúncio" valor={lu.depoisDaMidia} />

            <Linha id="estrutura" rotulo="Estrutura rateada" valor={-lu.estruturaPorUnidade}
                   // "lançado no mês", não "do modelo": o mês real inclui as
                   // despesas avulsas (uma manutenção, uma reforma) que não
                   // estão no modelo mensal. Sem essa palavra, o total aqui
                   // parece brigar com o total do editor ao lado.
                   nota={`${fmtBRL(lu.estruturaTotal)} de custo fixo lançado em `
                       + `${fmtMesAno(lu.mes)} × ${fmtPct(lu.shareFaturamento * 100)} `
                       + `de fatia no faturamento ÷ ${fmtNum(lu.unidades)}`
                       + (lu.mesEmAndamento
                            ? ` · proporcional a ${lu.diasDecorridos} de ${lu.diasDoMes} dias`
                            : '')} />

            <Subtotal id="lucro" rotulo="Lucro por raquete" valor={lu.lucroUnitario}
                      pct={lu.lucroUnitarioPct} final />
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Linha({
  rotulo, valor, nota, tipo, id,
}: {
  rotulo: string; valor: number; nota?: string; tipo?: 'entrada'; id?: string;
}) {
  const negativo = valor < 0;
  return (
    // `data-valor` carrega o número cru para o teste conferir a aritmética sem
    // depender de parsear "R$ 1.234,56" — que muda com locale e com formatação.
    <tr data-linha={id} data-valor={valor}
        className="border-b border-line-soft last:border-0">
      <td className="py-2 pr-3 align-top">
        <div className={cn('text-body', tipo === 'entrada' ? 'font-medium text-ink' : 'text-ink-2')}>
          {rotulo}
        </div>
        {nota && <div className="mt-0.5 text-caption text-faint">{nota}</div>}
      </td>
      <td className={cn(
        'w-32 py-2 text-right align-top text-num tabular-nums',
        negativo ? 'text-muted' : 'text-ink',
      )}>
        {negativo ? `− ${fmtBRL(Math.abs(valor))}` : fmtBRL(valor)}
      </td>
    </tr>
  );
}

function Subtotal({
  rotulo, valor, pct, nota, final, id,
}: {
  rotulo: string; valor: number; pct?: number; nota?: string;
  final?: boolean; id?: string;
}) {
  return (
    <tr data-linha={id} data-valor={valor} className={cn(
      'border-t',
      final ? 'border-gold-400/40' : 'border-line',
    )}>
      <td className="py-2.5 pr-3 align-top">
        <div className={cn(
          'font-semibold',
          final ? 'text-body text-gold-300' : 'text-body text-ink',
        )}>
          {rotulo}
        </div>
        {nota && <div className="mt-0.5 text-caption text-faint">{nota}</div>}
        {final && (
          <div className="mt-0.5 text-caption text-attention">
            antes do pró-labore dos sócios
          </div>
        )}
      </td>
      <td className={cn(
        'w-32 py-2.5 text-right align-top tabular-nums',
        final ? 'text-lg font-bold' : 'text-num font-semibold',
        valor < 0 ? 'text-negative' : final ? 'text-gold-300' : 'text-ink',
      )}>
        {fmtBRL(valor)}
        {pct !== undefined && (
          <div className="mt-0.5 text-caption font-normal text-faint">{fmtPct(pct)}</div>
        )}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════ avisos ══ */

/**
 * O que o número NÃO diz.
 *
 * Sem estes avisos o lucro por raquete vira uma armadilha: ele cai em mês fraco
 * porque o aluguel se divide entre menos unidades, e quem lê conclui que a
 * raquete piorou — quando o que piorou foi o volume. São conclusões opostas.
 */
function Avisos({ lu }: { lu: LucroUnitario }) {
  const prejuizo = lu.lucroUnitario < 0;
  const contribuiPositivo = lu.margemContribuicao > 0;

  return (
    <Card>
      <CardHeader><div><CardTitle>Como ler este número</CardTitle></div></CardHeader>
      <CardContent className="space-y-3 text-caption">
        {prejuizo && contribuiPositivo && (
          <Aviso tom="attention">
            <strong className="text-ink-2">Cada raquete deixa {fmtBRL(lu.margemContribuicao)},
            mas o mês não fecha.</strong> O problema não é a raquete nem o preço:
            é volume. Faltam {fmtNum(Math.max(lu.faltamParaEquilibrio, 0))} para
            cobrir a estrutura. Baixar preço aqui piora.
          </Aviso>
        )}

        {!contribuiPositivo && (
          <Aviso tom="negative">
            <strong className="text-ink-2">A margem de contribuição está negativa.</strong>{' '}
            Cada raquete vendida aumenta o prejuízo — vender mais não resolve.
            Aqui o problema é preço, custo de compra ou comissão.
          </Aviso>
        )}

        {lu.mesEmAndamento && (
          <Aviso tom="attention">
            <strong className="text-ink-2">O mês ainda está correndo.</strong> A
            estrutura entra proporcional aos {lu.diasDecorridos} dias já corridos
            de {lu.diasDoMes} — senão a loja teria as vendas de{' '}
            {lu.diasDecorridos} dias contra o aluguel de {lu.diasDoMes} e todo
            mês pareceria um desastre até o dia 28. Para decidir, use um mês
            fechado.
          </Aviso>
        )}

        <Aviso tom="info">
          <strong className="text-ink-2">A estrutura é dividida pelo volume do mês.</strong>{' '}
          Num mês fraco cada raquete absorve mais aluguel e este número cai
          sozinho, sem que nada tenha mudado na raquete. Para comparar preço e
          fornecedor, olhe a margem de contribuição.
        </Aviso>

        <Aviso tom="info">
          <strong className="text-ink-2">Nenhum sócio está sendo pago aqui.</strong>{' '}
          O que sobra é antes do pró-labore. Quando vocês começarem a tirar,
          cadastre como custo fixo e este número cai na hora.
        </Aviso>

        <Aviso tom="info">
          <strong className="text-ink-2">Compra de estoque não entra.</strong>{' '}
          Repor mercadoria é troca de caixa por ativo; ela vira custo aqui em
          cima, na linha da raquete, quando a peça é vendida. Somar as duas
          coisas faria a loja parecer no prejuízo em todo mês de reposição.
        </Aviso>
      </CardContent>
    </Card>
  );
}

function Aviso({
  tom, children,
}: { tom: 'info' | 'attention' | 'negative'; children: React.ReactNode }) {
  const estilo = {
    info: 'border-line bg-elev text-muted',
    attention: 'border-attention-line bg-attention-soft text-muted',
    negative: 'border-negative-line bg-negative-soft text-muted',
  }[tom];
  const Icone = tom === 'info' ? Info : AlertTriangle;
  const cor = { info: 'text-faint', attention: 'text-attention', negative: 'text-negative' }[tom];

  return (
    <div className={cn('flex gap-2.5 rounded-md border px-3 py-2.5', estilo)}>
      <Icone className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', cor)} />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

/* ═════════════════════════════════════════════════════ custos fixos ══ */

const CATEGORIAS_CUSTO: { id: CustoFixo['categoria']; label: string }[] = [
  { id: 'aluguel', label: 'Aluguel' },
  { id: 'folha', label: 'Folha' },
  { id: 'operacional', label: 'Operacional' },
];

/**
 * Onde o dono digita aluguel, luz, água, vendedor.
 *
 * O que se edita aqui é o MODELO mensal, não o lançamento: mexer no valor
 * atualiza a despesa do mês corrente e deixa os meses fechados como estão.
 * Reajustar o aluguel hoje não pode reescrever o resultado de março.
 */
function EditorCustosFixos() {
  const { data: custos } = useCustosFixos();
  const salvar = useSalvarCustoFixo();
  const excluir = useExcluirCustoFixo();

  const [nome, setNome] = useState('');
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState<CustoFixo['categoria']>('operacional');
  const [erro, setErro] = useState<string | null>(null);

  const total = (custos ?? []).reduce((s, c) => s + c.valorMensal, 0);

  async function adicionar() {
    setErro(null);
    const v = Number(valor.replace(/\./g, '').replace(',', '.'));
    if (!nome.trim() || !Number.isFinite(v)) {
      setErro('preencha nome e valor');
      return;
    }
    try {
      await salvar.mutateAsync({ nome, categoria, valorMensal: v, ativo: true });
      setNome(''); setValor('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para salvar');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <div>
            <CardTitle>Custos fixos — modelo mensal</CardTitle>
            <CardDescription>
              O que a loja paga todo mês, venda ou não venda
            </CardDescription>
          </div>
          <Badge variant="neutral" className="shrink-0">{fmtBRL(total)}/mês</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-1">
        {(custos ?? []).map((c) => (
          <div key={c.id}
               className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elev/60">
            <span className="min-w-0 flex-1 truncate text-body text-ink-2">{c.nome}</span>

            <Input
              defaultValue={String(c.valorMensal)}
              inputMode="decimal"
              onBlur={(e) => {
                const v = Number(e.target.value.replace(/\./g, '').replace(',', '.'));
                if (Number.isFinite(v) && v !== c.valorMensal) {
                  salvar.mutate({ ...c, valorMensal: v });
                } else {
                  e.target.value = String(c.valorMensal);
                }
              }}
              className="h-7 w-24 text-right text-num tabular-nums"
            />

            <button
              onClick={() => excluir.mutate(c.id)}
              title="remover deste mês em diante"
              className="shrink-0 text-faint opacity-0 transition-opacity hover:text-negative group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <form
          className="flex items-center gap-2 pt-2"
          onSubmit={(e) => { e.preventDefault(); void adicionar(); }}
        >
          <Input
            value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Energia" className="h-8 flex-1"
          />
          <Select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CustoFixo['categoria'])}
            className="h-8 w-28 text-caption"
          >
            {CATEGORIAS_CUSTO.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
          <Input
            value={valor} onChange={(e) => setValor(e.target.value)}
            inputMode="decimal" placeholder="0,00"
            className="h-8 w-24 text-right tabular-nums"
          />
          <Button type="submit" size="sm" variant="outline" className="shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>

        {erro && <p className="pt-1 text-caption text-negative">{erro}</p>}

        <p className="pt-2 text-caption text-faint">
          Este é o <strong className="text-muted">modelo</strong>: mexer aqui
          atualiza a despesa do mês corrente e deixa os meses fechados como
          estão. Gastos avulsos (uma manutenção, uma reforma) entram na conta do
          mês em que aconteceram mesmo sem estar nesta lista — por isso o total
          da conta ao lado pode ser maior que este.
        </p>
        <p className="text-caption text-faint">
          Anúncio não entra aqui — aparece em linha própria na conta, porque é o
          único custo que você decide de novo todo mês.
        </p>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function SemVenda({ mes }: { mes: string }) {
  return (
    <Card>
      <CardContent className="py-14 text-center">
        <p className="text-body text-ink-2">Nenhuma raquete vendida em {fmtMesAno(mes)}</p>
        <p className="mx-auto mt-1 max-w-md text-caption text-muted">
          Sem unidade vendida não há por onde dividir a estrutura. O custo fixo do
          mês continua correndo — ele aparece inteiro no fluxo de caixa.
        </p>
      </CardContent>
    </Card>
  );
}
