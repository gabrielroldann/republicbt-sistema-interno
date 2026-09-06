import { useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '@/crm/components/layout/Shell';
import { NovoLead } from '@/crm/components/NovoLead';
import Funil from '@/crm/pages/Funil';
import ConfigurarFunil from '@/crm/pages/ConfigurarFunil';
import Conversas from '@/crm/pages/Conversas';
import Clientes from '@/crm/pages/Clientes';
import Configuracoes from '@/crm/pages/Configuracoes';
// Mesma tela do painel — Link de Pagamento não é dado exclusivo de nenhuma
// área, só depende de papel/permissão (ver Sidebar), então reaproveita.
import LinkPagamento from '@/painel/pages/LinkPagamento';
import { useSessao } from '@/store/sessao';

/**
 * A Sidebar já ESCONDE "Link de Pagamento" do vendedor sem a permissão — mas
 * esconder o item de menu não impede digitar a URL direto. Sócio e admin
 * sempre passam (já têm o equivalente dentro do painel); vendedor só passa
 * com `permissoes.link_pagamento` ligado.
 */
function SomenteComPermissaoDeLink({ children }: { children: ReactNode }) {
  const { papel, permissoes } = useSessao();
  const liberado = papel !== 'vendedor' || !!permissoes.link_pagamento;
  return liberado ? <>{children}</> : <Navigate to="." replace />;
}

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
          <Route path="link-pagamento" element={
            <SomenteComPermissaoDeLink><LinkPagamento /></SomenteComPermissaoDeLink>
          } />
          <Route path="funil/configurar" element={<ConfigurarFunil />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </Shell>

      <NovoLead aberto={novoAberto} onFechar={() => setNovoAberto(false)} />
    </>
  );
}
