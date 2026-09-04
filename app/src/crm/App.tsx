import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '@/crm/components/layout/Shell';
import { NovoLead } from '@/crm/components/NovoLead';
import Funil from '@/crm/pages/Funil';
import ConfigurarFunil from '@/crm/pages/ConfigurarFunil';
import Conversas from '@/crm/pages/Conversas';
import Clientes from '@/crm/pages/Clientes';
import Configuracoes from '@/crm/pages/Configuracoes';

/**
 * O CRM, agora como ÁREA de um sistema só.
 *
 * Login, sessão e o aviso de "conta sem vendedor" subiram para o `App` raiz —
 * aqui ficou só o que é do CRM.
 *
 * As rotas são RELATIVAS: o raiz monta esta árvore sob `/crm/*`, então `index`
 * aqui é `/crm`, e `conversas` é `/crm/conversas`.
 */
export default function AreaCrm() {
  // O "Novo lead" mora na barra lateral, como o "Registrar venda" do painel.
  // Por isso o diálogo vive aqui em cima, e não dentro da página.
  const [novoAberto, setNovoAberto] = useState(false);

  return (
    <>
      <Shell onNovoLead={() => setNovoAberto(true)}>
        <Routes>
          <Route index element={<Funil />} />
          <Route path="conversas" element={<Conversas />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="funil/configurar" element={<ConfigurarFunil />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </Shell>

      <NovoLead aberto={novoAberto} onFechar={() => setNovoAberto(false)} />
    </>
  );
}
