import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrocarSenha } from '@/components/TrocarSenha';
import { cn } from '@/lib/utils';
import { LISTA_TEMAS, type Tema } from '@/tema/temas';
import { useTema } from '@/tema/useTema';

/**
 * A prévia é o próprio app em miniatura, não uma amostra de cor.
 *
 * O truque: as variáveis do tema são escritas no `style` do contêiner. Como
 * todas as classes do Tailwind já apontam para essas mesmas variáveis, tudo o
 * que estiver dentro se pinta sozinho com o tema da prévia — sem trocar o tema
 * da aplicação. Isso permite os três lado a lado, comparáveis de verdade.
 */
function tokensComoEstilo(tema: Tema): CSSProperties {
  return Object.fromEntries(Object.entries(tema.tokens)) as CSSProperties;
}

function Previa({ tema }: { tema: Tema }) {
  const barras = [38, 52, 44, 68, 58, 84];
  return (
    <div
      style={tokensComoEstilo(tema)}
      className="overflow-hidden rounded-md border border-line bg-app"
    >
      <div className="flex h-[152px]">
        {/* barra lateral */}
        <div className="flex w-[62px] shrink-0 flex-col gap-1.5 border-r border-line bg-surface p-2">
          <div className="mb-1 h-2.5 w-9 rounded-sm bg-gold-400" />
          <div className="h-2 w-full rounded-sm bg-elev" />
          <div className="h-2 w-4/5 rounded-sm bg-line-soft" />
          <div className="h-2 w-3/4 rounded-sm bg-line-soft" />
          <div className="h-2 w-4/5 rounded-sm bg-line-soft" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5">
          {/* blocos de número */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { cor: 'bg-gold-400', valor: 'R$ 46,1k' },
              { cor: 'bg-navy-500', valor: 'R$ 12,4k' },
              { cor: 'bg-positive', valor: '26,9%' },
            ].map((k) => (
              <div key={k.valor} className="flex items-center gap-1.5 rounded-sm bg-elev px-1.5 py-1.5">
                <span className={cn('h-5 w-[3px] shrink-0 rounded-full', k.cor)} />
                <span className="truncate text-[9px] font-extrabold leading-none text-ink">
                  {k.valor}
                </span>
              </div>
            ))}
          </div>

          {/* gráfico */}
          <div className="flex flex-1 items-end gap-1 rounded-sm border border-line bg-card px-2 pb-2 pt-2">
            {barras.map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-t-[2px]"
                style={{
                  height: `${h}%`,
                  background: i === barras.length - 1 ? tema.grafico.destaque : tema.grafico.serie,
                }}
              />
            ))}
          </div>

          {/* linha de tabela com status */}
          <div className="flex items-center justify-between rounded-sm bg-card px-2 py-1">
            <span className="h-1.5 w-14 rounded-full bg-line-strong" />
            <span
              className="rounded-full px-1.5 py-[1px] text-[7px] font-semibold"
              style={{
                background: 'var(--c-positive-soft)',
                color: `rgb(${tema.tokens['--c-positive']})`,
              }}
            >
              Pago
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Configuracoes() {
  const { id, setTema } = useTema();

  return (
    <div className="stagger space-y-5">
      <TrocarSenha />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Tema da interface</CardTitle>
            <CardDescription>
              A escolha vale para este navegador e fica salva — cada sócio pode usar o seu.
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
                      <p className="mt-1 text-caption leading-snug text-muted">{t.descricao}</p>
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
            Nenhuma cor está escrita nas telas. Toda cor é uma variável no elemento
            raiz, e o tema apenas troca o valor dessas variáveis — por isso a troca
            é instantânea e nenhuma tela precisa saber que existe mais de um tema.
          </p>
          <p>
            O ouro atravessa os três temas: é a marca. No tema claro ele escurece,
            porque ouro claro sobre branco não teria contraste suficiente para
            texto de botão.
          </p>
          <p className="text-muted">
            Para acrescentar um quarto tema, basta um objeto novo em{' '}
            <code className="rounded-sm bg-elev px-1 py-0.5 text-caption text-gold-300">
              src/tema/temas.ts
            </code>
            . Ele aparece aqui sozinho.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
