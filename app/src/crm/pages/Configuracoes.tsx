import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LISTA_TEMAS, type Tema } from '@/tema/temas';
import { useTema } from '@/tema/useTema';

/**
 * A prévia é o próprio CRM em miniatura, não uma amostra de cor.
 *
 * O truque: as variáveis do tema são escritas no `style` do contêiner. Como
 * todas as classes do Tailwind já apontam para essas mesmas variáveis, tudo o
 * que estiver dentro se pinta sozinho com o tema da prévia — sem trocar o tema
 * da aplicação. Isso permite os três lado a lado, comparáveis de verdade.
 *
 * E ela mostra CAIXA DE ENTRADA E FUNIL, não gráfico e KPI como a do painel
 * financeiro. Prever um gráfico num app que não tem nenhum faria a pessoa
 * escolher o tema por uma tela que ela nunca vai ver.
 */
function tokensComoEstilo(tema: Tema): CSSProperties {
  return Object.fromEntries(Object.entries(tema.tokens)) as CSSProperties;
}

function Previa({ tema }: { tema: Tema }) {
  return (
    <div
      style={tokensComoEstilo(tema)}
      className="overflow-hidden rounded-md border border-line bg-app"
    >
      <div className="flex h-[152px]">
        {/* barra lateral */}
        <div className="flex w-[54px] shrink-0 flex-col gap-1.5 border-r border-line bg-surface p-2">
          <div className="mb-1 h-3 w-full rounded-sm bg-gold-400" />
          <div className="h-2 w-full rounded-sm bg-elev" />
          <div className="h-2 w-4/5 rounded-sm bg-line-soft" />
          <div className="h-2 w-3/4 rounded-sm bg-line-soft" />
        </div>

        {/* caixa de entrada */}
        <div className="flex w-[86px] shrink-0 flex-col gap-1 border-r border-line bg-surface p-1.5">
          {[
            { dono: false, campanha: true },
            { dono: true, campanha: true },
            { dono: false, campanha: false },
          ].map((c, i) => (
            <div
              key={i}
              className={cn(
                'relative rounded-sm px-1.5 py-1',
                i === 1 ? 'bg-elev' : 'bg-transparent',
                // a barra dourada marca o que espera vendedor
                !c.dono && 'before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-full before:bg-gold-400',
              )}
            >
              <div className="ml-1 h-1.5 w-10 rounded-full bg-line-strong" />
              <div className="ml-1 mt-1 h-1 w-full rounded-full bg-line-soft" />
              <div className="ml-1 mt-1 flex gap-0.5">
                {c.campanha && (
                  <span className="h-[7px] w-7 rounded-full bg-navy-500" />
                )}
                {!c.dono && (
                  <span className="h-[7px] w-6 rounded-full bg-gold-400/50" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* funil */}
        <div className="flex min-w-0 flex-1 gap-1 p-1.5">
          {[
            { cor: 'bg-gold-400', cards: 3 },
            { cor: 'bg-info', cards: 2 },
            { cor: 'bg-positive', cards: 1 },
          ].map((col, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col gap-1 rounded-sm border border-line-soft bg-app p-1">
              <div className="flex items-center gap-1">
                <span className={cn('h-2 w-[2px] shrink-0 rounded-full', col.cor)} />
                <span className="h-1 w-full rounded-full bg-line-strong" />
              </div>
              {Array.from({ length: col.cards }, (_, k) => (
                <div key={k} className="rounded-sm border border-line-soft bg-card px-1 py-1">
                  <div className="h-1 w-full rounded-full bg-line-strong" />
                  <div className="mt-1 h-1 w-2/3 rounded-full bg-line-soft" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Configuracoes() {
  const { id, setTema } = useTema();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
        <header>
          <h1 className="text-title text-ink">Configurações</h1>
          <p className="mt-1 text-caption text-muted">
            Preferências deste navegador
          </p>
        </header>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Tema da interface</CardTitle>
              <CardDescription>
                A escolha vale para este navegador e fica salva — cada pessoa da
                equipe usa o seu, sem atrapalhar a dos outros.
              </CardDescription>
            </div>
            <Badge variant="neutral">{LISTA_TEMAS.length} temas</Badge>
          </CardHeader>

          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {LISTA_TEMAS.map((t) => {
                const ativo = t.id === id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTema(t.id)}
                    aria-pressed={ativo}
                    // `data-escolher-tema`, e não `data-tema`: o próprio sistema
                    // de temas já escreve `data-tema` no <html>, e um seletor
                    // por `[data-tema]` pegava a página inteira junto.
                    data-escolher-tema={t.id}
                    className={cn(
                      'group rounded-md border p-3 text-left transition-colors duration-150 ease-padrao',
                      ativo
                        ? 'border-gold-400 bg-elev/60'
                        : 'border-line bg-card hover:border-line-strong hover:bg-elev/40',
                    )}
                  >
                    <Previa tema={t} />

                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{t.nome}</span>
                          {ativo && (
                            <span className="flex items-center gap-1 text-caption font-semibold text-gold-400">
                              <Check className="h-3 w-3" strokeWidth={3} /> Em uso
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-caption leading-snug text-muted">
                          {t.descricao}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-1 pt-0.5">
                        {t.amostras.map((c) => (
                          <span
                            key={c}
                            className="h-4 w-4 rounded-sm border border-line-strong"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Como o tema funciona</CardTitle>
              <CardDescription>Para quem for mexer no código depois</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-body text-ink-2">
            <p>
              Nenhuma cor está escrita nas telas. Toda cor é uma variável no
              elemento raiz, e o tema apenas troca o valor dessas variáveis — por
              isso a troca é instantânea e nenhuma tela precisa saber que existe
              mais de um tema.
            </p>
            <p>
              O ouro atravessa os três: é a marca. No tema claro ele escurece,
              porque ouro claro sobre branco não teria contraste suficiente para
              texto de botão.
            </p>
            <p className="text-muted">
              É o mesmo arquivo do painel financeiro —{' '}
              <code className="rounded-sm bg-elev px-1 py-0.5 text-caption text-gold-300">
                src/tema/temas.ts
              </code>
              . Um quarto tema acrescentado lá aparece aqui sozinho, nos dois
              sistemas.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
