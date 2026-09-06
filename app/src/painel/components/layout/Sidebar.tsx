import { NavLink } from 'react-router-dom';
import {
  BarChart3, Boxes, Inbox, KeyRound, LayoutDashboard, LogOut, Megaphone, PanelLeft, PanelLeftClose,
  Plus, Receipt, Settings, ShieldCheck, ShoppingCart, Smartphone, Target, User, Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SeletorSistema } from '@/components/SeletorSistema';
import { useFiltros } from '@/painel/store/filtros';
import { vendedores } from '@/painel/data/mock';
import { Select } from '@/components/ui/field';

interface Item {
  to: string;
  label: string;
  icone: LucideIcon;
  /** Módulos financeiros só existem para sócio/admin. */
  soAdmin?: boolean;
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
      { to: '/painel/equipe', label: 'Equipe e Metas', icone: Target, soAdmin: true },
      { to: '/painel/usuarios', label: 'Usuários', icone: KeyRound, soAdmin: true },
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
      { to: '/painel/estoque', label: 'Estoque', icone: Boxes },
      { to: '/painel/configuracoes', label: 'Configurações', icone: Settings },
    ],
  },
];

export function Sidebar({
  recolhida, alternar,
}: { recolhida: boolean; alternar: () => void }) {
  const { papel, setPapel, vendedorLogado, setVendedorLogado } = useFiltros();
  const admin = papel === 'admin';

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
          const visiveis = g.itens.filter((i) => admin || !i.soAdmin);
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
                    title={recolhida ? label : undefined}
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
                        <Icone className={cn('h-[17px] w-[17px] shrink-0', isActive && 'text-gold-400')} strokeWidth={1.9} />
                        {!recolhida && <span className="truncate">{label}</span>}
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
        {!recolhida && (
          <>
            {/* Em produção vem do auth; aqui é seletor para conferir as duas visões. */}
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
            {admin ? 'GR' : vendedorLogado.iniciais}
          </div>
          {!recolhida && (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-caption font-semibold text-ink">
                  {admin ? 'Gabriel Roldan' : vendedorLogado.nome}
                </div>
                <div className="text-caption text-faint">{admin ? 'Sócio' : 'Vendedor'}</div>
              </div>
              <button className="text-faint transition-colors hover:text-ink-2" title="Sair">
                <LogOut className="h-4 w-4" />
              </button>
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
