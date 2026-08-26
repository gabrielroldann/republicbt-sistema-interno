import { NavLink, useLocation } from 'react-router-dom';
import { BarChart3, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSessao } from '@/store/sessao';

/**
 * TROCAR ENTRE O PAINEL E O CRM.
 *
 * Fica no topo das duas barras laterais, no mesmo lugar nas duas — se mudasse
 * de posição, a pessoa teria que procurar toda vez que trocasse.
 *
 * Só aparece para quem tem os dois. Para o vendedor não existe: mostrar um
 * seletor de uma opção só é ruído, e um seletor com uma opção bloqueada é pior
 * ainda — anuncia uma porta que ele não pode abrir.
 *
 * E ele NÃO é o controle de acesso. Quem barra é o RLS; se o vendedor digitar
 * /painel na URL, o portão do `App` raiz o devolve, e mesmo que não devolvesse
 * o banco recusaria tudo que é dinheiro.
 */
export function SeletorSistema({ recolhida }: { recolhida?: boolean }) {
  const { areas } = useSessao();
  const local = useLocation();

  if (areas.length < 2) return null;

  const atual = local.pathname.startsWith('/crm') ? 'crm' : 'painel';

  const itens = [
    { id: 'painel', to: '/painel', label: 'Painel', icone: BarChart3 },
    { id: 'crm', to: '/crm', label: 'CRM', icone: MessageSquare },
  ] as const;

  if (recolhida) {
    return (
      <div className="flex flex-col gap-1 px-2 pb-2">
        {itens.map(({ id, to, label, icone: Icone }) => (
          <NavLink
            key={id} to={to} title={label}
            className={cn(
              'flex h-8 items-center justify-center rounded-md transition-colors duration-150',
              atual === id
                ? 'bg-gold-400 text-ongold'
                : 'text-faint hover:bg-elev hover:text-ink-2',
            )}
          >
            <Icone className="h-4 w-4" />
          </NavLink>
        ))}
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <div className="flex rounded-md bg-app p-0.5" data-seletor-sistema>
        {itens.map(({ id, to, label, icone: Icone }) => (
          <NavLink
            key={id}
            to={to}
            data-sistema={id}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-caption font-semibold transition-colors duration-150',
              atual === id
                ? 'bg-gold-400 text-ongold'
                : 'text-muted hover:text-ink-2',
            )}
          >
            <Icone className="h-3.5 w-3.5" />
            {label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
