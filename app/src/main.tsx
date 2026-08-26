import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';
import { iniciarTema } from '@/tema/useTema';
import '@/index.css';

/**
 * O tema é aplicado ANTES do primeiro render.
 *
 * Se esperasse o React montar, a página piscaria com as cores padrão do CSS e
 * só então trocaria — um flash branco em quem escolheu o tema escuro.
 */
iniciarTema();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Painel financeiro não pode recarregar sozinho a cada vez que a pessoa
      // volta para a aba: número que muda sem ação nenhuma destrói confiança.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
