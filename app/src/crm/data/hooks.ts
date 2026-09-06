import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  atribuirLead, atualizarCliente, criarLead, excluirCliente,
  excluirClienteComHistorico, getCampanhas, getClientes, getEtapas, getFunil,
  getHistoricoCliente, getLead, getMotivosPerda, getVendedores, moverLead,
  type AtualizarClienteInput, type FiltrosFunil,
} from './queries';
import { MOCK, supabase } from '@/lib/supabase';
import type { NovoLeadInput } from '@/crm/types';

/* Listas que quase não mudam: cacheadas por bastante tempo. */
const fixo = { staleTime: 10 * 60_000 };

export const useEtapas = () => useQuery({ queryKey: ['etapas'], queryFn: getEtapas, ...fixo });
export const useMotivosPerda = () =>
  useQuery({ queryKey: ['motivos'], queryFn: getMotivosPerda, ...fixo });
export const useVendedores = () =>
  useQuery({ queryKey: ['vendedores'], queryFn: getVendedores, ...fixo });
export const useCampanhas = () =>
  useQuery({ queryKey: ['campanhas'], queryFn: getCampanhas, ...fixo });

/** A lista de clientes cresce sozinha a cada mensagem nova — atualiza a cada
 * 30s pra quem deixar a tela aberta ver os que acabaram de chegar. */
export const useClientes = (busca?: string) =>
  useQuery({
    queryKey: ['clientes', busca],
    queryFn: () => getClientes(busca),
    refetchInterval: 30_000,
  });

export function useAtualizarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string } & AtualizarClienteInput) => {
      const { id, ...resto } = v;
      return atualizarCliente(id, resto);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export function useExcluirCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => excluirCliente(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export const useHistoricoCliente = (id: string | null) =>
  useQuery({
    queryKey: ['historico-cliente', id],
    queryFn: () => getHistoricoCliente(id!),
    enabled: !!id,
  });

/** "Zera tudo de uma vez" — apaga lead, conversa e venda do cliente, depois o cliente. */
export function useExcluirClienteComHistorico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => excluirClienteComHistorico(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['funil'] });
      qc.invalidateQueries({ queryKey: ['conversas'] });
    },
  });
}

export const useFunil = (f: FiltrosFunil) =>
  useQuery({ queryKey: ['funil', f], queryFn: () => getFunil(f) });

export const useLead = (id: string | undefined) =>
  useQuery({ queryKey: ['lead', id], queryFn: () => getLead(id!), enabled: !!id });

/**
 * Toda mutação invalida o funil. Sem isso o card volta para a coluna antiga no
 * próximo render, e o vendedor acha que o arrasto não funcionou.
 */
function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['funil'] });
    qc.invalidateQueries({ queryKey: ['lead'] });
  };
}

export function useMoverLead() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { leadId: string; etapaId: string; motivoPerdaId?: string }) =>
      moverLead(v.leadId, v.etapaId, v.motivoPerdaId),
    onSuccess: invalidar,
  });
}

export function useCriarLead() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: NovoLeadInput) => criarLead(v),
    onSuccess: invalidar,
  });
}

export function useAtribuirLead() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { leadId: string; vendedorId: string | null }) =>
      atribuirLead(v.leadId, v.vendedorId),
    onSuccess: invalidar,
  });
}

/* ---------------------------------------------- personalização do funil -- */

import {
  criarEtapa, excluirEtapa, getContagemPorEtapa, renomearEtapa, reordenarEtapas,
} from './queries';
import type { CorEtapa } from '@/crm/types';

export const useContagemPorEtapa = () =>
  useQuery({ queryKey: ['contagem-etapa'], queryFn: getContagemPorEtapa });

/**
 * Mexer no funil invalida quase tudo: as colunas mudam, a contagem muda, e o
 * card do lead pode ter trocado de etapa. Invalidar demais custa um refetch;
 * invalidar de menos deixa a tela mentindo.
 */
function useInvalidarFunil() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['etapas'] });
    qc.invalidateQueries({ queryKey: ['funil'] });
    qc.invalidateQueries({ queryKey: ['contagem-etapa'] });
  };
}

export function useCriarEtapa() {
  const invalidar = useInvalidarFunil();
  return useMutation({
    mutationFn: (v: { nome: string; cor?: CorEtapa; depoisDe?: string }) =>
      criarEtapa(v.nome, v.cor, v.depoisDe),
    onSuccess: invalidar,
  });
}

export function useRenomearEtapa() {
  const invalidar = useInvalidarFunil();
  return useMutation({
    mutationFn: (v: { id: string; nome: string; cor?: CorEtapa }) =>
      renomearEtapa(v.id, v.nome, v.cor),
    onSuccess: invalidar,
  });
}

export function useReordenarEtapas() {
  const invalidar = useInvalidarFunil();
  return useMutation({
    mutationFn: (ids: string[]) => reordenarEtapas(ids),
    onSuccess: invalidar,
  });
}

export function useExcluirEtapa() {
  const invalidar = useInvalidarFunil();
  return useMutation({
    mutationFn: (v: { id: string; moverPara: string }) => excluirEtapa(v.id, v.moverPara),
    onSuccess: invalidar,
  });
}

/* -------------------------------------------------- o card do lead ------- */

import { atualizarLead, getLeadDetalhe, type AtualizarLeadInput } from './queries';

export const useLeadDetalhe = (id: string | null) =>
  useQuery({
    queryKey: ['lead-detalhe', id],
    queryFn: () => getLeadDetalhe(id!),
    enabled: !!id,
  });

/* ═════════════════════════════════════════════════ caixa de entrada ════ */

import {
  abrirNoMeuNumero, assumirConversa, contarNaoLidas, enviarMensagem, excluirConversa, getCanais,
  getConversa, getConversas, getConversasDoCliente, getMensagemPadrao, getMensagens,
  liberarConversa, marcarLida, setMensagemPadrao, type FiltrosCaixa,
} from './queries';

export const useCanais = () =>
  useQuery({ queryKey: ['canais'], queryFn: getCanais, ...fixo });

export const useMensagemPadrao = () =>
  useQuery({ queryKey: ['mensagem-padrao'], queryFn: getMensagemPadrao, ...fixo });

/**
 * A lista atualiza por Realtime (ver `useCaixaRealtime`, abaixo) — o
 * `refetchInterval` que sobrou aqui é só uma rede de segurança para o raro
 * evento que o WebSocket perder no caminho, não mais o mecanismo principal.
 */
export const useConversas = (f: FiltrosCaixa) =>
  useQuery({
    queryKey: ['conversas', f],
    queryFn: () => getConversas(f),
    refetchInterval: 30_000,
  });

export const useConversa = (id: string | null) =>
  useQuery({ queryKey: ['conversa', id], queryFn: () => getConversa(id!), enabled: !!id });

/**
 * O sininho da barra lateral do CRM.
 *
 * Chave começando em `'conversas'` de propósito: é o mesmo prefixo que
 * `useCaixaRealtime` já invalida a cada INSERT/UPDATE em `conversa` ou
 * `mensagem` — então enquanto a Caixa de Entrada está aberta isto atualiza
 * na hora, de graça. Fora dela, o `refetchInterval` cobre o resto.
 */
export const useNaoLidasTotal = (f: FiltrosCaixa) =>
  useQuery({
    queryKey: ['conversas', 'nao-lidas-total', f],
    queryFn: () => contarNaoLidas(f),
    refetchInterval: 30_000,
  });

export const useConversasDoCliente = (clienteId?: string, exceto?: string) =>
  useQuery({
    queryKey: ['conversas-cliente', clienteId, exceto],
    queryFn: () => getConversasDoCliente(clienteId!, exceto),
    enabled: !!clienteId,
  });

export const useMensagens = (conversaId: string | null) =>
  useQuery({
    queryKey: ['mensagens', conversaId],
    queryFn: () => getMensagens(conversaId!),
    enabled: !!conversaId,
    refetchInterval: 30_000,
  });

/**
 * REALTIME DA CAIXA DE ENTRADA.
 *
 * Ouve `INSERT`/`UPDATE` em `conversa` e `mensagem` direto do Postgres (via
 * `supabase_realtime`, ligado em `ligar_realtime_caixa_de_entrada`) e invalida
 * as queries certas — sem isso a tela só atualizava no F5 ou esperando o
 * polling, e o vendedor não pode ficar 8 segundos atrás de uma mensagem que
 * pede resposta rápida.
 *
 * Chamar uma vez, no topo da página da caixa de entrada. Em modo demonstração
 * (`MOCK`) não há canal para ouvir — o polling do `mock-queries` já resolve.
 */
export function useCaixaRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    if (MOCK) return;

    const canal = supabase
      .channel('caixa-de-entrada')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversa' }, () => {
        qc.invalidateQueries({ queryKey: ['conversas'] });
        qc.invalidateQueries({ queryKey: ['conversa'] });
        qc.invalidateQueries({ queryKey: ['conversas-cliente'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagem' }, () => {
        qc.invalidateQueries({ queryKey: ['mensagens'] });
        qc.invalidateQueries({ queryKey: ['conversas'] });
      })
      .subscribe();

    return () => { void supabase.removeChannel(canal); };
  }, [qc]);
}

function useInvalidarCaixa() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['conversas'] });
    qc.invalidateQueries({ queryKey: ['conversa'] });
    qc.invalidateQueries({ queryKey: ['mensagens'] });
    qc.invalidateQueries({ queryKey: ['conversas-cliente'] });
    // O dono da conversa vira o dono do lead: o funil precisa saber.
    qc.invalidateQueries({ queryKey: ['funil'] });
  };
}

export function useAssumirConversa() {
  const invalidar = useInvalidarCaixa();
  return useMutation({
    mutationFn: (v: { conversaId: string; vendedorId: string }) =>
      assumirConversa(v.conversaId, v.vendedorId),
    onSuccess: invalidar,
  });
}

export function useLiberarConversa() {
  const invalidar = useInvalidarCaixa();
  return useMutation({ mutationFn: liberarConversa, onSuccess: invalidar });
}

export function useExcluirConversa() {
  const invalidar = useInvalidarCaixa();
  return useMutation({ mutationFn: excluirConversa, onSuccess: invalidar });
}

export function useEnviarMensagem() {
  const invalidar = useInvalidarCaixa();
  return useMutation({
    mutationFn: (v: { conversaId: string; texto: string; autorId: string }) =>
      enviarMensagem(v.conversaId, v.texto, v.autorId),
    onSuccess: invalidar,
  });
}

export function useAbrirNoMeuNumero() {
  const invalidar = useInvalidarCaixa();
  return useMutation({
    mutationFn: (v: { conversaOrigemId: string; vendedorId: string; texto: string }) =>
      abrirNoMeuNumero(v.conversaOrigemId, v.vendedorId, v.texto),
    onSuccess: invalidar,
  });
}

export function useMarcarLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: marcarLida,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversas'] }),
  });
}

export function useSalvarMensagemPadrao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setMensagemPadrao,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mensagem-padrao'] }),
  });
}

export function useAtualizarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string } & AtualizarLeadInput) => {
      const { id, ...resto } = v;
      return atualizarLead(id, resto);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funil'] });
      qc.invalidateQueries({ queryKey: ['lead-detalhe'] });
    },
  });
}
