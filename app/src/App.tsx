import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Login from '@/pages/Login';
import { useSessao, type Area } from '@/store/sessao';

/**
 * CADA ÁREA É CARREGADA SOB DEMANDA.
 *
 * O painel carrega gráficos e tabelas — recharts e react-table pesam. Sem o
 * `lazy`, o vendedor baixaria tudo isso no celular só para abrir o CRM, e o
 * CRM é justamente o que ele usa em pé, no meio de um atendimento, com a
 * internet da loja.
 *
 * Não é otimização prematura: é a consequência direta de juntar num sistema só
 * dois apps de peso muito diferente.
 */
const AreaPainel = lazy(() => import('@/painel/App'));
const AreaCrm = lazy(() => import('@/crm/App'));
const Carrinho = lazy(() => import('@/pages/Carrinho'));

export default function App() {
  const {
    autenticado, carregando, semCadastro, erroCarga,
    areas, iniciar, sair, lembrarArea, areaInicial,
  } = useSessao();
  const local = useLocation();

  useEffect(() => { iniciar(); }, [iniciar]);

  // Lembra em qual sistema a pessoa estava, para o próximo login cair no mesmo.
  useEffect(() => {
    const area = local.pathname.startsWith('/crm') ? 'crm'
               : local.pathname.startsWith('/painel') ? 'painel' : null;
    if (area) lembrarArea(area);
  }, [local.pathname, lembrarArea]);

  // `autenticado === null` é "ainda não sei". Renderizar o login nesse estado
  // faria a tela piscar o formulário a cada F5 de quem já está dentro.
  if (carregando || autenticado === null) return <Carregando />;
  if (!autenticado) return <Login />;

  if (semCadastro) {
    return <Aviso onSair={() => void sair()}
      titulo="Sua conta ainda não está ligada a um vendedor"
      texto="O login funcionou, mas falta o administrador cadastrar você na equipe.
             Até lá o sistema não tem como saber o que é seu." />;
  }

  // Erro de carga NÃO pode virar painel zerado: zero em faturamento parece
  // resultado, não falha.
  if (erroCarga) {
    return <Aviso onSair={() => void sair()}
      titulo="Não deu para carregar os dados" texto={erroCarga} />;
  }

  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route path="/" element={<Navigate to={`/${areaInicial()}`} replace />} />

        <Route path="/painel/*" element={
          <SomenteArea area="painel" permitidas={areas}><AreaPainel /></SomenteArea>
        } />
        <Route path="/crm/*" element={
          <SomenteArea area="crm" permitidas={areas}><AreaCrm /></SomenteArea>
        } />

        {/*
          Fora de `painel`/`crm` de propósito: é a tela que o vendedor instala
          no celular (ver `public/manifest.json`), sem o menu lateral do painel
          — e qualquer vendedor ativo pode vender, então não tem `SomenteArea`.
        */}
        <Route path="/carrinho" element={<Carrinho />} />

        <Route path="*" element={<Navigate to={`/${areaInicial()}`} replace />} />
      </Routes>
    </Suspense>
  );
}

/**
 * O portão de área.
 *
 * NÃO é o controle de acesso — é conveniência. Quem barra de verdade é o RLS:
 * o vendedor que digitasse /painel na URL e passasse por aqui ainda veria zero
 * em custo, margem, despesa e conta, porque o banco recusa. Este portão existe
 * para ele não bater numa tela vazia sem entender por quê.
 */
function SomenteArea({
  area, permitidas, children,
}: { area: Area; permitidas: Area[]; children: React.ReactNode }) {
  if (!permitidas.includes(area)) {
    return <Navigate to={`/${permitidas[0]}`} replace />;
  }
  return <>{children}</>;
}

function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-gold-400" />
    </div>
  );
}

function Aviso({ titulo, texto, onSair }: {
  titulo: string; texto: string; onSair: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-attention" />
        <p className="mt-3 text-body text-ink">{titulo}</p>
        <p className="mt-1.5 text-xs text-muted">{texto}</p>
        <Button variant="outline" className="mt-4" onClick={onSair}>Sair</Button>
      </div>
    </div>
  );
}
