import { NavLink } from 'react-router-dom';
import {
  KanbanSquare, Link2, LogOut, MessageSquare, PanelLeft, PanelLeftClose, Plus, Settings,
  ShoppingCart, SlidersHorizontal, Users, type LucideIcon,
} from 'lucide-react';
import { MOCK } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { SeletorSistema } from '@/components/SeletorSistema';
import { Select } from '@/components/ui/field';
import { LISTA_TEMAS } from '@/tema/temas';
import { useTema } from '@/tema/useTema';
import { useNaoLidasTotal, useVendedores } from '@/crm/data/hooks';
import { useSessao } from '@/store/sessao';
import { useFiltrosCrm } from '@/crm/store/filtros';

interface Item {
  to: string;
  label: string;
  icone: LucideIcon;
  /** ainda não construído — aparece apagado, com o motivo no title */
  emBreve?: string;
  /** só o dono vê. O banco também recusa, mas não vale oferecer o que
      vai ser negado. */
  soAdmin?: boolean;
  /**
   * Só aparece para vendedor comum com essa chave ligada em `permissoes`.
   * Sócio e admin não precisam: eles já têm o equivalente dentro do painel —
   * duplicar a entrada aqui só confundiria qual delas usar.
   */
  somenteVendedorComPermissao?: string;
}

const grupos: { titulo: string; itens: Item[] }[] = [
  {
    titulo: 'Atendimento',
    itens: [
      { to: '/crm/conversas', label: 'Conversas', icone: MessageSquare },
      { to: '/crm', label: 'Funil', icone: KanbanSquare },
      // Fora de `/crm/*` de propósito (ver App.tsx) — tela cheia, sem menu,
      // pensada para o celular do vendedor na loja.
      { to: '/carrinho', label: 'Carrinho (maquininha)', icone: ShoppingCart },
      { to: '/crm/link-pagamento', label: 'Link de Pagamento', icone: Link2,
        somenteVendedorComPermissao: 'link_pagamento' },
    ],
  },
  {
    titulo: 'Cadastro',
    itens: [
      { to: '/crm/clientes', label: 'Clientes', icone: Users },
    ],
  },
  {
    titulo: 'Configuração',
    itens: [
      { to: '/crm/funil/configurar', label: 'Funil', icone: SlidersHorizontal,
        soAdmin: true },
      // Sem `soAdmin`: tema é preferência pessoal, não permissão. O vendedor
      // que enxerga melhor no claro precisa poder trocar sem pedir a ninguém.
      { to: '/crm/configuracoes', label: 'Preferências', icone: Settings },
    ],
  },
];

export function Sidebar({
  recolhida, alternar, onNovoLead,
}: { recolhida: boolean; alternar: () => void; onNovoLead: () => void }) {
  const { id: tema } = useTema();
  const { vendedorId, papel, permissoes, nome, sair } = useSessao();
  const { vendedorDemo, setVendedorDemo } = useFiltrosCrm();
  const { data: vendedores } = useVendedores();
  // Sem filtro de canal/dono: é o total do que a pessoa enxerga, mesmo
  // recorte que o RLS já aplica em `getConversas`.
  const { data: naoLidas } = useNaoLidasTotal({ papel, vendedorId });

  // Com banco ligado, o nome vem da sessão — a lista de vendedores pode nem
  // ser legível pelo papel de quem entrou.
  const daLista = vendedores?.find((v) => v.id === vendedorDemo) ?? vendedores?.[0];
  const eu = MOCK ? daLista : {
    id: vendedorId,
    nome,
    iniciais: nome.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase(),
  };

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-padrao',
        recolhida ? 'w-16' : 'w-[236px]',
      )}
    >
      {/* marca */}
      <div className={cn('flex h-16 items-center border-b border-line',
        recolhida ? 'justify-center px-2' : 'px-5')}>
        {recolhida ? (
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gold-400 text-[11px] font-extrabold text-ongold">
            RB
          </div>
        ) : (
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight text-ink">Republic BT</div>
            <div className="mt-0.5 text-caption text-gold-400">CRM</div>
          </div>
        )}
      </div>

      {/* trocar de sistema: mesmo lugar nas duas barras */}
      <div className="pt-3">
        <SeletorSistema recolhida={recolhida} />
      </div>

      {/* ação primária — mesmo lugar e mesmo tratamento do "Registrar venda" */}
      <div className={cn('pt-4', recolhida ? 'px-2' : 'px-3')}>
        <button
          onClick={onNovoLead}
          title={recolhida ? 'Novo lead' : undefined}
          className={cn(
            'flex w-full items-center gap-2 rounded-md bg-gold-400 py-2.5 text-body font-semibold text-ongold transition-colors duration-150 ease-padrao hover:bg-gold-300',
            recolhida ? 'justify-center px-0' : 'px-3',
          )}
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          {!recolhida && <span>Novo lead</span>}
        </button>
      </div>

      <nav className={cn('flex-1 overflow-y-auto py-4', recolhida ? 'px-2' : 'px-3')}>
        {grupos.map((g) => {
          const visiveis = g.itens.filter((i) => {
            if (i.soAdmin && papel !== 'admin') return false;
            if (i.somenteVendedorComPermissao
              && !(papel === 'vendedor' && permissoes[i.somenteVendedorComPermissao])) return false;
            return true;
          });
          if (!visiveis.length) return null;
          return (
          <div key={g.titulo} className="mb-5">
            {!recolhida && (
              <div className="mb-1.5 px-3 text-label uppercase text-faint">{g.titulo}</div>
            )}
            <div className="space-y-0.5">
              {visiveis.map(({ to, label, icone: Icone, emBreve }) =>
                emBreve ? (
                  <span
                    key={to}
                    title={`${label} — ${emBreve}`}
                    className={cn(
                      'relative flex cursor-not-allowed items-center gap-2.5 rounded-md py-2 text-body font-medium text-faint/50',
                      recolhida ? 'justify-center px-0' : 'px-3',
                    )}
                  >
                    <Icone className="h-[17px] w-[17px] shrink-0" strokeWidth={1.9} />
                    {!recolhida && <span className="truncate">{label}</span>}
                  </span>
                ) : (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/crm'}
                    title={recolhida
                      ? (to === '/crm/conversas' && naoLidas ? `${label} — ${naoLidas} não lida(s)` : label)
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
                          <Icone
                            className={cn('h-[17px] w-[17px]', isActive && 'text-gold-400')}
                            strokeWidth={1.9}
                          />
                          {/* recolhida: só a bolinha, sem número — não cabe */}
                          {recolhida && to === '/crm/conversas' && !!naoLidas && (
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-gold-400" />
                          )}
                        </span>
                        {!recolhida && (
                          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                            <span className="truncate">{label}</span>
                            {to === '/crm/conversas' && !!naoLidas && (
                              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-bold tabular-nums text-ongold">
                                {naoLidas}
                              </span>
                            )}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ),
              )}
            </div>
          </div>
          );
        })}
      </nav>

      {/* perfil */}
      <div className="border-t border-line p-3">
        {/*
          O seletor só existe em modo demonstração.
          Com banco ligado, trocar de vendedor por um <select> seria mentira: o
          RLS decide pelo usuário autenticado, então a tela mudaria de nome e
          continuaria mostrando os dados do mesmo login.
        */}
        {!recolhida && MOCK && (
          <Select
            className="mb-2 h-8 text-caption"
            value={vendedorDemo}
            onChange={(e) => setVendedorDemo(e.target.value)}
          >
            {(vendedores ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </Select>
        )}

        <div className={cn('flex items-center gap-2.5 px-1 py-1',
          recolhida && 'justify-center px-0')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-400 text-[11px] font-bold text-ongold">
            {eu?.iniciais ?? '--'}
          </div>
          {!recolhida && (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-caption font-semibold text-ink">
                  {eu?.nome ?? 'Sem vendedor'}
                </div>
                <div className="text-caption text-faint">
                  {{ admin: 'Administrador', socio: 'Sócio', vendedor: 'Vendedor' }[papel]}
                </div>
              </div>
              {/*
                Antes este botão CICLAVA entre os temas. Virou atalho para a
                tela: rodízio escondido atrás de um ícone é uma interação que
                ninguém descobre, e agora existe um lugar onde dá para comparar
                os três antes de escolher.
              */}
              <NavLink
                to="/crm/configuracoes"
                title={`Tema: ${LISTA_TEMAS.find((t) => t.id === tema)?.nome}`}
                className="text-faint transition-colors hover:text-ink-2"
              >
                <Settings className="h-4 w-4" />
              </NavLink>
              {!MOCK && (
                <button
                  onClick={() => void sair()}
                  title="Sair"
                  className="text-faint transition-colors hover:text-negative"
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
