import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';

/**
 * Casca do CRM — mesma estrutura do dashboard: barra lateral recolhível à
 * esquerda, conteúdo à direita. É a mesma loja; não faz sentido duas
 * navegações diferentes.
 */
export function Shell({
  children, onNovoLead,
}: { children: ReactNode; onNovoLead: () => void }) {
  const [recolhida, setRecolhida] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        recolhida={recolhida}
        alternar={() => setRecolhida((v) => !v)}
        onNovoLead={onNovoLead}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
