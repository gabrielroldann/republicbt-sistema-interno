import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Shell } from '@/painel/components/layout/Shell';
import { useEhAdmin } from '@/painel/store/filtros';
import Overview from '@/painel/pages/Overview';
import Vendas from '@/painel/pages/Vendas';
import NovaVenda from '@/painel/pages/NovaVenda';
import Equipe from '@/painel/pages/Equipe';
import Vendedores from '@/painel/pages/Vendedores';
import VendedorDetalhe from '@/painel/pages/VendedorDetalhe';
import Financeiro from '@/painel/pages/Financeiro';
import Impostos from '@/painel/pages/Impostos';
import Campanhas from '@/painel/pages/Campanhas';
import Estoque from '@/painel/pages/Estoque';
import Configuracoes from '@/painel/pages/Configuracoes';

/**
 * O painel financeiro, agora como ÁREA de um sistema só.
 *
 * Login, sessão e carga de dados subiram para o `App` raiz — aqui ficou só o
 * que é do painel. Era isso que estava duplicado: os dois apps tinham o mesmo
 * bloco de "está logado? já carregou? tem cadastro?", e qualquer correção
 * precisava ser feita duas vezes.
 *
 * As rotas são RELATIVAS: o raiz monta esta árvore sob `/painel/*`, então
 * `index` aqui é `/painel`, e `vendas` é `/painel/vendas`.
 */
function SomenteAdmin({ children }: { children: ReactNode }) {
  const admin = useEhAdmin();
  return admin ? <>{children}</> : <Navigate to="." replace />;
}

export default function AreaPainel() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="vendas" element={<Vendas />} />
        <Route path="vendas/nova" element={<NovaVenda />} />
        <Route path="vendedores" element={<Vendedores />} />
        <Route path="vendedores/:id" element={<VendedorDetalhe />} />
        <Route path="equipe" element={<SomenteAdmin><Equipe /></SomenteAdmin>} />
        <Route path="financeiro" element={<SomenteAdmin><Financeiro /></SomenteAdmin>} />
        <Route path="campanhas" element={<SomenteAdmin><Campanhas /></SomenteAdmin>} />
        <Route path="impostos" element={<SomenteAdmin><Impostos /></SomenteAdmin>} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
}
