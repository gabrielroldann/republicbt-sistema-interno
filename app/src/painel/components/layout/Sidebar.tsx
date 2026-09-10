import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Boxes, Inbox, KeyRound, LayoutDashboard, LogOut, Megaphone, PanelLeft, PanelLeftClose,
  Plus, Receipt, Settings, ShieldCheck, ShoppingCart, Smartphone, Target, User, Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOCK } from '@/lib/supabase';
import { SeletorSistema } from '@/components/SeletorSistema';
import { useFiltros } from '@/painel/store/filtros';
import { vendedores } from '@/painel/data/mock';
import { contarPendencias } from '@/painel/data/pendencias';
import { Select } from '@/components/ui/field';
import { useSessao } from '@/store/sessao';

interface Item {
  to: string;
  label: string;
  icone: LucideIcon;
  /** Módulos financeiros só existem para sócio/admin. */
  soAdmin?: boolean;
  /**
   * Mais estrito que `soAdmin`: só admin de VERDADE, não sócio. A tabela
   * `vendedor` (Equipe, Usuários) só aceita escrita de quem passa em
   * `eh_admin()` no banco — mostrar para sócio seria oferecer uma tela que
   * ele abre e não consegue usar.
   */
  soAdminDeVerdade?: boolean;
}

const grupos: { titulo: string; itens: Item[] }[] = [
  { titulo: 'Visão', itens: [{ to: '/painel', label: 'Visão Geral', icone: LayoutDashboard }] },
  {
    titulo: 'Comercial',
    itens: [
      { to: '/painel/vendas', label: 'Vendas', icone: ShoppingCart },
      // Fora de `/painel/*` de propósito (ver App.tsx) — tela cheia, sem menu,
      // pensada para o celular. Fica aqui só como atalho de quem já está no
      // painel e precisa abrir rápido, num computador ou testando.
      { to: '/carrinho', label: 'Carrinho (maquininha)', icone: Smartphone },
      { to: '/painel/vendedores', label: 'Desempenho', icone: Users },
      { to: '/painel/pendencias', label: 'Pendências', icone: Inbox, soAdmin: true },
      { to: '/painel/equipe', label: 'Equipe e Metas', icone: Target, soAdmin: true, soAdminDeVerdade: true },
      { to: '/painel/usuarios', label: 'Usuários', icone: KeyRound, soAdmin: true, soAdminDeVerdade: true },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { to: '/painel/financeiro', label: 'Fluxo de Caixa', icone: BarChart3, soAdmin: true },
      { to: '/painel/campanhas', label: 'Campanhas', icone: Megaphone, soAdmin: true },
      { to: '/painel/impostos', label: 'Impostos', icone: Receipt, soAdmin: true },
    ],
  },
  {
    titulo: 'Operação',
    itens: [
      { to: '/painel/estoque', label: 'Produtos', icone: Boxes },
      { to: '/painel/configuracoes', label: 'Configurações', icone: Settings },
    ],
  },
];

export function Sidebar({
  recolhida, alternar,
}: { recolhida: boolean; alternar: () => void }) {
  const { papel, setPapel, vendedorLogado, setVendedorLogado } = useFiltros();
  const admin = papel === 'admin';
  // Papel de verdade (não o achatado do painel financeiro) — é o que decide
  // "Equipe" e "Usuários", que só admin consegue de fato usar.
  const { papel: papelReal, sair } = useSessao();
  const souAdminDeVerdade = papelReal === 'admin';
  // Só quem vê a tela precisa da contagem — vendedor nem chega perto da rota.
  const { data: pendencias } = useQuery({
    queryKey: ['pendencias-total'],
    queryFn: contarPendencias,
    enabled: admin,
    refetchInterval: 60_000,
  });

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-padrao',
        recolhida ? 'w-16' : 'w-[236px]',
      )}
    >
      {/* marca */}
      <div className={cn('flex h-16 items-center border-b border-line', recolhida ? 'justify-center px-2' : 'px-5')}>
        {recolhida ? (
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gold-400 text-[11px] font-extrabold text-ongold">
            RB
          </div>
        ) : (
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight text-ink">Republic BT</div>
            <div className="mt-0.5 text-caption text-gold-400">Gestão interna</div>
          </div>
        )}
      </div>

      {/* trocar de sistema: mesmo lugar nas duas barras */}
      <div className="pt-3">
        <SeletorSistema recolhida={recolhida} />
      </div>

      {/* ação primária */}
      <div className={cn('pt-4', recolhida ? 'px-2' : 'px-3')}>
        <NavLink
          to="/painel/vendas/nova"
          title={recolhida ? 'Registrar venda' : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-md py-2.5 text-body font-semibold transition-colors duration-150 ease-padrao',
              recolhida ? 'justify-center px-0' : 'px-3',
              isActive ? 'bg-gold-300 text-ongold' : 'bg-gold-400 text-ongold hover:bg-gold-300',
            )
          }
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          {!recolhida && <span>Registrar venda</span>}
        </NavLink>
      </div>

      <nav className={cn('flex-1 overflow-y-auto py-4', recolhida ? 'px-2' : 'px-3')}>
        {grupos.map((g) => {
          const visiveis = g.itens.filter((i) => {
            if (i.soAdmin && !admin) return false;
            if (i.soAdminDeVerdade && !souAdminDeVerdade) return false;
            return true;
          });
          if (!visiveis.length) return null;
          return (
            <div key={g.titulo} className="mb-5">
              {!recolhida && (
                <div className="mb-1.5 px-3 text-label uppercase text-faint">{g.titulo}</div>
              )}
              <div className="space-y-0.5">
                {visiveis.map(({ to, label, icone: Icone }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/painel'}
                    title={recolhida
                      ? (to === '/painel/pendencias' && pendencias ? `${label} — ${pendencias}` : label)
                      : undefined}
                    className={({ isActive }) =>
                      cn(
                        // Barra de acento à esquerda além do fundo: é o que permite
                        // varrer a lista e achar a página atual sem ler.
                        'relative flex items-center gap-2.5 rounded-md py-2 text-body font-medium transition-colors duration-150 ease-padrao',
                        recolhida ? 'justify-center px-0' : 'px-3',
                        isActive
                          ? 'bg-elev text-ink before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-gold-400'
                          : 'text-muted hover:bg-elev/50 hover:text-ink-2',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="relative shrink-0">
                          <Icone className={cn('h-[17px] w-[17px]', isActive && 'text-gold-400')} strokeWidth={1.9} />
                          {recolhida && to === '/painel/pendencias' && !!pendencias && (
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-attention" />
                          )}
                        </span>
                        {!recolhida && (
                          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                            <span className="truncate">{label}</span>
                            {to === '/painel/pendencias' && !!pendencias && (
                              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-attention px-1 text-[10px] font-bold tabular-nums text-white">
                                {pendencias}
                              </span>
                            )}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* perfil */}
      <div className="border-t border-line p-3">
        {/*
          O seletor abaixo só existe em modo demonstração (sem banco ligado).
          Com banco ligado, quem decide o papel é o auth + RLS, e `iniciar()`
          (em store/sessao.ts) já sincroniza `vendedorLogado` com a linha real
          de `vendedor` de quem entrou — um <select> aqui só ofereceria trocar
          para um vendedor de mentira, com um id que não existe no banco (e
          quem tentasse "Registrar venda" nesse estado travaria no meio: ver
          NovaVenda.tsx). Mesmo motivo do guard em crm/components/layout/Sidebar.tsx.
        */}
        {!recolhida && MOCK && (
          <>
            <div className="mb-2 flex rounded-md border border-line p-0.5">
              <button
                onClick={() => setPapel('admin')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded py-1.5 text-caption font-medium transition-colors duration-150',
                  admin ? 'bg-elev text-ink' : 'text-muted hover:text-ink-2',
                )}
              >
                <ShieldCheck className="h-3 w-3" /> Sócio
              </button>
              <button
                onClick={() => setPapel('vendedor')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded py-1.5 text-caption font-medium transition-colors duration-150',
                  !admin ? 'bg-elev text-ink' : 'text-muted hover:text-ink-2',
                )}
              >
                <User className="h-3 w-3" /> Vendedor
              </button>
            </div>

            {!admin && (
              <Select
                className="mb-2 h-8 text-caption"
                value={vendedorLogado.id}
                onChange={(e) => {
                  const v = vendedores.find((x) => x.id === e.target.value);
                  if (v) setVendedorLogado(v);
                }}
              >
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </Select>
            )}
          </>
        )}

        <div className={cn('flex items-center gap-2.5 px-1 py-1', recolhida && 'justify-center px-0')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-400 text-[11px] font-bold text-ongold">
            {vendedorLogado.iniciais}
          </div>
          {!recolhida && (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-caption font-semibold text-ink">
                  {vendedorLogado.nome}
                </div>
                <div className="text-caption text-faint">
                  {{ admin: 'Administrador', socio: 'Sócio', vendedor: 'Vendedor' }[papelReal]}
                </div>
              </div>
              {!MOCK && (
                <button
                  onClick={() => void sair()}
                  className="text-faint transition-colors hover:text-negative"
                  title="Sair"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>

        <button
          onClick={alternar}
          className={cn(
            'mt-1 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-caption text-faint transition-colors duration-150 hover:bg-elev/50 hover:text-ink-2',
            recolhida && 'justify-center px-0',
          )}
        >
          {recolhida ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!recolhida && <span>Recolher</span>}
        </button>
      </div>
    </aside>
  );
}
