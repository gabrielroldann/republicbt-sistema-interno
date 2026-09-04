/**
 * Hooks de dados. As telas consomem SÓ daqui — nunca importam queries.ts direto.
 * Quando o Supabase entrar, estes hooks continuam idênticos.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as q from './queries';
import * as k from './kommo';
import { useFiltros } from '@/painel/store/filtros';
import type { Categoria, Periodo } from '@/painel/types';

/** Chave estável a partir do período — evita refetch desnecessário. */
const chave = (p: Periodo) => [p.de.toISOString().slice(0, 10), p.ate.toISOString().slice(0, 10)];

export function usePeriodo(): Periodo {
  return useFiltros((s) => s.periodo);
}

export function useResumo(periodo?: Periodo) {
  const atual = usePeriodo();
  const p = periodo ?? atual;
  return useQuery({ queryKey: ['resumo', ...chave(p)], queryFn: () => q.getResumo(p) });
}

export function useResumoAnterior() {
  const p = q.periodoAnterior(usePeriodo());
  return useQuery({ queryKey: ['resumo', ...chave(p)], queryFn: () => q.getResumo(p) });
}

export function useSerie() {
  const p = usePeriodo();
  return useQuery({ queryKey: ['serie', ...chave(p)], queryFn: () => q.getSerie(p) });
}

export function usePorCategoria() {
  const p = usePeriodo();
  return useQuery({ queryKey: ['categorias', ...chave(p)], queryFn: () => q.getPorCategoria(p) });
}

export function useVendas(filtros: q.FiltrosVenda = {}) {
  const p = usePeriodo();
  return useQuery({
    queryKey: ['vendas', ...chave(p), JSON.stringify(filtros)],
    queryFn: () => q.getVendas(p, filtros),
  });
}

export function useVendedores() {
  return useQuery({ queryKey: ['vendedores'], queryFn: q.getVendedores });
}

export function useDesempenho() {
  const p = usePeriodo();
  return useQuery({ queryKey: ['desempenho', ...chave(p)], queryFn: () => q.getDesempenho(p) });
}

export function useMovimentos() {
  const p = usePeriodo();
  return useQuery({ queryKey: ['movimentos', ...chave(p)], queryFn: () => q.getMovimentos(p) });
}

export function useFluxoCaixa() {
  const p = usePeriodo();
  return useQuery({ queryKey: ['fluxo', ...chave(p)], queryFn: () => q.getFluxoCaixa(p) });
}

export function useContas() {
  return useQuery({ queryKey: ['contas'], queryFn: q.getContas });
}

export function useFaturamentoMensal(meses = 12) {
  return useQuery({ queryKey: ['fatMensal', meses], queryFn: () => q.getFaturamentoMensal(meses) });
}

export function useEstimativaImposto() {
  return useQuery({ queryKey: ['imposto'], queryFn: q.getEstimativaImposto });
}

export function useEstoque() {
  return useQuery({ queryKey: ['estoque'], queryFn: q.getEstoque });
}

/* ---------- meta da loja ---------- */

export function useAcompanhamentoMeta(mes?: string) {
  return useQuery({
    queryKey: ['meta', mes ?? 'atual'],
    queryFn: () => q.getAcompanhamentoMeta(mes),
  });
}

export function useFaturamentoDiario(mes: string) {
  return useQuery({ queryKey: ['fatDiario', mes], queryFn: () => q.getFaturamentoDiario(mes) });
}

export function useMetas() {
  return useQuery({ queryKey: ['metas'], queryFn: q.getMetas });
}

/* ---------- campanhas e retorno de mídia ---------- */

export function useCampanhas() {
  return useQuery({ queryKey: ['campanhas'], queryFn: q.getCampanhas, staleTime: 600_000 });
}

function useInvalidarCampanhas() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['campanhas'] });
    qc.invalidateQueries({ queryKey: ['retorno-campanhas'] });
  };
}

export function useCriarCampanha() {
  const invalidar = useInvalidarCampanhas();
  return useMutation({
    mutationFn: (i: q.CampanhaInput) => q.criarCampanha(i),
    onSuccess: invalidar,
  });
}

export function useAtualizarCampanha() {
  const invalidar = useInvalidarCampanhas();
  return useMutation({
    mutationFn: (v: { id: string } & q.CampanhaInput) => {
      const { id, ...resto } = v;
      return q.atualizarCampanha(id, resto);
    },
    onSuccess: invalidar,
  });
}

/** Por competência mensal, como o gasto de mídia é orçado e cobrado. */
export function useRetornoCampanhas(mes: string) {
  return useQuery({
    queryKey: ['retorno-campanhas', mes],
    queryFn: () => q.getRetornoCampanhas(mes),
  });
}

export function useSalvarCustoMidia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { campanhaId: string; mes: string; gasto: number }) =>
      q.salvarCustoMidia(v.campanhaId, v.mes, v.gasto),
    onSuccess: () => {
      // O gasto vira despesa de marketing: mexe no resultado, no fluxo e no
      // lucro por raquete. Invalidar só a própria tela deixaria os outros
      // números velhos ao lado do novo.
      for (const k of ['retorno-campanhas', 'despesas', 'resumo', 'fluxo',
                       'movimentos', 'lucro-unitario', 'serie']) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });
}

/* ---------- despesas ---------- */

export function useDespesas() {
  const p = usePeriodo();
  return useQuery({ queryKey: ['despesas', ...chave(p)], queryFn: () => q.getDespesas(p) });
}

function useInvalidarDespesas() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['despesas', 'resumo', 'fluxo', 'movimentos', 'serie',
                     'lucro-unitario']) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };
}

export function useCriarDespesa() {
  const invalidar = useInvalidarDespesas();
  return useMutation({ mutationFn: q.criarDespesa, onSuccess: invalidar });
}

export function useAtualizarDespesa() {
  const invalidar = useInvalidarDespesas();
  return useMutation({
    mutationFn: (v: { id: string } & q.DespesaInput) => {
      const { id, ...resto } = v;
      return q.atualizarDespesa(id, resto);
    },
    onSuccess: invalidar,
  });
}

export function useExcluirDespesa() {
  const invalidar = useInvalidarDespesas();
  return useMutation({ mutationFn: q.excluirDespesa, onSuccess: invalidar });
}

/* ---------- produto e estoque ---------- */

/**
 * Mexer em produto ou estoque respinga em quase tudo: catálogo, giro, capital
 * parado, e o custo médio muda a margem das próximas vendas. Invalidar de menos
 * deixa a tela mostrando o custo velho ao lado do saldo novo.
 */
function useInvalidarEstoque() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['estoque', 'movimentos-produto', 'resumo', 'categorias',
                     'lucro-unitario', 'serie']) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };
}

export function useCriarProduto() {
  const invalidar = useInvalidarEstoque();
  return useMutation({ mutationFn: q.criarProduto, onSuccess: invalidar });
}

export function useAtualizarProduto() {
  const invalidar = useInvalidarEstoque();
  return useMutation({
    mutationFn: (v: { id: string } & q.ProdutoInput) => {
      const { id, ...resto } = v;
      return q.atualizarProduto(id, resto);
    },
    onSuccess: invalidar,
  });
}

export function useArquivarProduto() {
  const invalidar = useInvalidarEstoque();
  return useMutation({ mutationFn: q.arquivarProduto, onSuccess: invalidar });
}

export function useDarEntrada() {
  const invalidar = useInvalidarEstoque();
  return useMutation({ mutationFn: q.darEntrada, onSuccess: invalidar });
}

export function useAjustarEstoque() {
  const invalidar = useInvalidarEstoque();
  return useMutation({
    mutationFn: (v: { produtoId: string; contagem: number; observacao: string }) =>
      q.ajustarEstoque(v.produtoId, v.contagem, v.observacao),
    onSuccess: invalidar,
  });
}

export function useMovimentosProduto(produtoId: string | null) {
  return useQuery({
    queryKey: ['movimentos-produto', produtoId],
    queryFn: () => q.getMovimentosProduto(produtoId!),
    enabled: !!produtoId,
  });
}

/* ---------- contas a pagar e receber ---------- */

/**
 * Mexer numa conta muda o saldo previsto e o fluxo de caixa. Invalidar de menos
 * deixa o KPI antigo ao lado da lista nova — e aí o número que decide pagamento
 * está errado na tela sem nenhum sinal.
 */
function useInvalidarContas() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['contas', 'fluxo', 'movimentos', 'resumo']) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };
}

export function useCriarConta() {
  const invalidar = useInvalidarContas();
  return useMutation({ mutationFn: q.criarConta, onSuccess: invalidar });
}

export function useAtualizarConta() {
  const invalidar = useInvalidarContas();
  return useMutation({
    mutationFn: (v: { id: string } & q.ContaInput) => {
      const { id, ...resto } = v;
      return q.atualizarConta(id, resto);
    },
    onSuccess: invalidar,
  });
}

export function useExcluirConta() {
  const invalidar = useInvalidarContas();
  return useMutation({ mutationFn: q.excluirConta, onSuccess: invalidar });
}

export function useLiquidarConta() {
  const invalidar = useInvalidarContas();
  return useMutation({
    mutationFn: (v: { id: string; pago: boolean }) => q.liquidarConta(v.id, v.pago),
    onSuccess: invalidar,
  });
}

/* ---------- lucro por unidade e custos fixos ---------- */

/**
 * Sem período global de propósito.
 *
 * Aluguel é cobrado por mês, então o rateio só faz sentido por competência
 * mensal. Se isto seguisse o filtro global, escolher "últimos 7 dias" dividiria
 * o aluguel de um mês inteiro pelas vendas de uma semana — e o resultado seria
 * um prejuízo inventado, com cara de número preciso.
 */
export function useLucroUnitario(mes: string, categoria: Categoria = 'raquetes') {
  return useQuery({
    queryKey: ['lucro-unitario', mes, categoria],
    queryFn: () => q.getLucroUnitario(mes, categoria),
  });
}

export function useCompetencias() {
  return useQuery({ queryKey: ['competencias'], queryFn: q.getCompetencias });
}

export function useCustosFixos() {
  return useQuery({ queryKey: ['custos-fixos'], queryFn: q.getCustosFixos });
}

/**
 * Mexer num custo fixo muda a despesa do mês — e, por tabela, o lucro, o fluxo
 * de caixa e o resumo. Invalidar de menos deixa a tela mostrando o lucro antigo
 * ao lado do custo novo, que é a pior combinação possível.
 */
function useInvalidarCustos() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['custos-fixos', 'lucro-unitario', 'resumo', 'fluxo',
                     'movimentos', 'serie']) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  };
}

export function useSalvarCustoFixo() {
  const invalidar = useInvalidarCustos();
  return useMutation({ mutationFn: q.salvarCustoFixo, onSuccess: invalidar });
}

export function useExcluirCustoFixo() {
  const invalidar = useInvalidarCustos();
  return useMutation({ mutationFn: q.excluirCustoFixo, onSuccess: invalidar });
}

/* ---------- CRM (Kommo) — modelado, ainda sem tela ---------- */
// Prontos para uso. Quando o Kommo entrar, só o corpo de kommo.ts muda.

export function usePipelines() {
  const p = usePeriodo();
  return useQuery({ queryKey: ['pipelines', ...chave(p)], queryFn: () => k.getPipelines(p) });
}

export function useGanhosPerdas() {
  const p = usePeriodo();
  return useQuery({ queryKey: ['ganhosPerdas', ...chave(p)], queryFn: () => k.getGanhosPerdas(p) });
}

export function useMotivosPerda() {
  const p = usePeriodo();
  return useQuery({ queryKey: ['motivos', ...chave(p)], queryFn: () => k.getMotivosPerda(p) });
}

export function useOrigemLeads() {
  const p = usePeriodo();
  return useQuery({ queryKey: ['origem', ...chave(p)], queryFn: () => k.getOrigemLeads(p) });
}
