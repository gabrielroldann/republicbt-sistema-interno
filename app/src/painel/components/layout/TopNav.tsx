import { useLocation } from 'react-router-dom';
import { PeriodoPicker } from './PeriodoPicker';
import { useFiltros } from '@/painel/store/filtros';
import { fmtData } from '@/lib/utils';

const titulos: Record<string, { titulo: string; sub: string }> = {
  '/': { titulo: 'Visão Geral', sub: 'Faturamento, lucro e ritmo da meta' },
  '/vendas': { titulo: 'Vendas', sub: 'Histórico com custo, margem e recebimento' },
  '/vendedores': { titulo: 'Desempenho por Vendedor', sub: 'Ranking, meta e comissão' },
  '/equipe': { titulo: 'Equipe e Metas', sub: 'Cadastro de vendedores e definição de metas' },
  '/financeiro': { titulo: 'Fluxo de Caixa', sub: 'Entradas, saídas e contas a pagar e receber' },
  '/impostos': { titulo: 'Impostos', sub: 'Estimativa de DAS pelo Simples Nacional' },
  '/estoque': { titulo: 'Estoque', sub: 'Saldo, giro, margem e capital parado' },
  '/configuracoes': { titulo: 'Configurações', sub: 'Aparência do painel' },
};

/** Barra superior: título da página e o período que escopa todos os módulos. */
export function TopNav() {
  const { pathname } = useLocation();
  const periodo = useFiltros((s) => s.periodo);

  const base = '/' + (pathname.split('/')[1] ?? '');
  const t = titulos[base === '/' ? '/' : base] ?? { titulo: 'Republic BT', sub: '' };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 px-6 py-3.5 backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title text-ink">{t.titulo}</h1>
          {t.sub && <p className="mt-0.5 text-caption text-muted">{t.sub}</p>}
        </div>

        {/* Escrito por extenso: o período vale para a tela inteira, não pode
            ficar escondido atrás de um ícone de calendário. */}
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-caption text-faint">
            Período em análise ·{' '}
            <span className="font-semibold text-ink-2">
              {fmtData(periodo.de)} a {fmtData(periodo.ate)}
            </span>
          </span>
          <PeriodoPicker />
        </div>
      </div>
    </header>
  );
}
