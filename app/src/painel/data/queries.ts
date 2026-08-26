/**
 * CAMADA DE ACESSO A DADOS — este é o único arquivo que conhece a origem.
 *
 * Trocar mock por Supabase = reescrever o corpo destas funções mantendo as
 * assinaturas. Nenhum componente, hook ou página muda.
 *
 * Ex.:  export async function getResumo(p: Periodo): Promise<ResumoPeriodo> {
 *         const { data } = await supabase.rpc('resumo_periodo', {...});
 *         return data;
 *       }
 */

import {
  CATEGORIAS, FORMAS_PAGAMENTO,
  type AcompanhamentoMeta, type Campanha, type Categoria, type Conta,
  type CustoFixo, type CustoMidia, type RetornoCampanha,
  type DesempenhoVendedor, type Despesa, type EstimativaImposto, type FaixaSimples,
  type FatiaCategoria, type FormaPagamento, type ItemEstoque, type LucroUnitario,
  type MetaLoja, type MovimentoCaixa, type MovimentoEstoque, type Pagamento, type Periodo,
  type PontoDia, type PontoSerie, type Produto, type ResumoPeriodo, type StatusConta,
  type Venda, type VendaCompleta, type Vendedor,
} from '@/painel/types';
import {
  aplicarCustosFixos, campanhas, contas, custosFixos, custosMidia, despesas,
  leadsMock, metasLoja, movimentos, pagamentos, produtos, SALDO_INICIAL, vendas,
  vendedores, HOJE,
} from './mock';
/**
 * As escritas. Em modo demonstração não fazem nada e o mock segue sendo a
 * verdade; com banco ligado, gravam no Supabase e recarregam a memória.
 */
import {
  gravando, gravarArquivarProduto, gravarConta, gravarCustoFixo, gravarCustoMidia,
  gravarCustoProduto, gravarDespesa, gravarEntrega, gravarExcluirConta,
  gravarExcluirDespesa, gravarLiquidarConta, gravarMeta, gravarMovimento,
  gravarPagamento, gravarProduto, gravarVenda, gravarVendedor, gravarVendedorAtivo,
} from './escritas';
import {
  diffDias, fimDoMes, inicioDoMes, isoDia, mesRef, somarDias, ymDe,
} from '@/lib/utils';

/** Latência artificial: garante que os estados de carregamento sejam reais. */
const atraso = (ms = 180) => new Promise((res) => setTimeout(res, ms));

const taxaDe = (f: FormaPagamento) =>
  FORMAS_PAGAMENTO.find((x) => x.id === f)?.taxa ?? 0;

/**
 * ÍNDICES EM MEMÓRIA — e a armadilha que eles criaram.
 *
 * Estes mapas existem para não varrer o array a cada linha da tela. Eram
 * construídos UMA vez, na carga do módulo, o que funcionava enquanto os dados
 * vinham de um gerador que nunca mudava.
 *
 * Com o banco, a fonte é recarregada — e os mapas ficavam com o conteúdo
 * antigo. O sintoma foi silencioso e caro: o painel mostrava 487 pagamentos no
 * banco e "Recebido R$ 0,00" na tela, porque `pagamentosPorVenda` ainda
 * apontava para o array vazio de antes. Nenhum erro, nenhum aviso: só um zero
 * que parecia resultado.
 *
 * Por isso agora eles são REconstruídos, e `reindexar()` é chamado toda vez que
 * a fonte muda.
 */
const mapaProdutos = new Map<string, Produto>();
const mapaVendedores = new Map<string, Vendedor>();
const mapaVendas = new Map<string, Venda>();
const pagamentosPorVenda = new Map<string, Pagamento[]>();

export function reindexar() {
  mapaProdutos.clear();
  for (const p of produtos) mapaProdutos.set(p.id, p);

  mapaVendedores.clear();
  for (const v of vendedores) mapaVendedores.set(v.id, v);

  mapaVendas.clear();
  for (const v of vendas) mapaVendas.set(v.id, v);

  pagamentosPorVenda.clear();
  for (const p of pagamentos) {
    const lista = pagamentosPorVenda.get(p.vendaId) ?? [];
    lista.push(p);
    pagamentosPorVenda.set(p.vendaId, lista);
  }
}

// Em modo demonstração o gerador já preencheu tudo na importação.
reindexar();

/** Enriquece uma venda com produto, vendedor, pagamentos e a matemática. */
function completar(v: Venda): VendaCompleta {
  const produto = mapaProdutos.get(v.produtoId)!;
  const vendedor = mapaVendedores.get(v.vendedorId)!;

  const receita = v.precoUnit * v.quantidade;
  const custo = v.custoUnit * v.quantidade;
  // A taxa CONGELADA na venda, não a da tabela de hoje. Consultar a tabela a
  // cada leitura fazia a margem do passado mudar sozinha quando a maquininha
  // reajustava — foi o furo que a conferência contra o banco expôs.
  const taxa = receita * (v.taxaPct / 100);

  // O crédito do trade-in NÃO entra aqui: ele troca caixa por ativo, não é
  // desconto. Descontar da margem faria a venda parecer pior do que foi.
  const margem = receita - custo - taxa;

  const creditoTradeIn = v.tradeIn?.valorCredito ?? 0;
  const aReceber = receita - creditoTradeIn;
  const meus = pagamentosPorVenda.get(v.id) ?? [];
  const recebido = meus.reduce((s, p) => s + p.valor, 0);
  const emAberto = Math.max(aReceber - recebido, 0);

  const statusPagamento: VendaCompleta['statusPagamento'] =
    recebido <= 0 ? 'aberto' : emAberto > 0.01 ? 'parcial' : 'pago';

  return {
    ...v, produto, vendedor, receita, custo, taxa, margem,
    margemPct: receita > 0 ? (margem / receita) * 100 : 0,
    pagamentos: meus,
    creditoTradeIn, aReceber, recebido, emAberto, statusPagamento,
    // comissão sobre o que ENTROU: ninguém deve comissão de dinheiro que não caiu
    comissao: recebido * (v.comissaoPct / 100),
  };
}

const dentro = (dataISO: string, p: Periodo) =>
  dataISO >= isoDia(p.de) && dataISO <= isoDia(p.ate);

function noPeriodo(p: Periodo): VendaCompleta[] {
  return vendas.filter((v) => dentro(v.data, p)).map(completar);
}

/** Mesmo número de dias, imediatamente antes — base das comparações. */
export function periodoAnterior(p: Periodo): Periodo {
  const dias = diffDias(p.ate, p.de) + 1;
  return { de: somarDias(p.de, -dias), ate: somarDias(p.de, -1) };
}

function despesasNoPeriodo(p: Periodo) {
  return despesas.filter((d) => dentro(d.data, p));
}

/**
 * Despesas OPERACIONAIS — exclui compra de mercadoria.
 *
 * Comprar estoque é troca de caixa por ativo, não despesa do resultado: aquele
 * custo já aparece como CMV quando o produto é vendido. Somar os dois contaria
 * a mercadoria duas vezes e faria o lucro despencar em todo mês de reposição.
 * No fluxo de caixa, ao contrário, a compra entra integralmente — lá o que
 * importa é o dinheiro que saiu da conta.
 */
function despesasOperacionais(p: Periodo) {
  return despesasNoPeriodo(p).filter((d) => d.categoria !== 'fornecedores');
}

/* ---------- resumo ---------- */

export async function getResumo(p: Periodo): Promise<ResumoPeriodo> {
  await atraso();
  const vs = noPeriodo(p);
  const faturamento = vs.reduce((s, v) => s + v.receita, 0);
  const custoMercadoria = vs.reduce((s, v) => s + v.custo, 0);
  const taxas = vs.reduce((s, v) => s + v.taxa, 0);
  const desp = despesasOperacionais(p).reduce((s, d) => s + d.valor, 0);
  const comissao = vs.reduce((s, v) => s + v.comissao, 0);
  const lucroBruto = faturamento - custoMercadoria - taxas;
  return {
    faturamento,
    custoMercadoria,
    taxas,
    lucroBruto,
    despesas: desp,
    comissao,
    /**
     * A COMISSÃO SAI DAQUI. Antes não saía, e o lucro vinha inflado.
     *
     * Ela é rastreada por venda (`comissao_pct` congelado em cada uma), não em
     * `despesa` — a folha da tabela de despesas é o salário fixo, que não muda
     * com o quanto se vende. Como o lucro só subtraía despesas, a comissão
     * sumia do resultado: quanto mais a loja vendesse, mais o lucro mentia
     * para cima. Um erro que só aparece quando a operação cresce, que é o
     * pior momento para descobrir.
     */
    lucroLiquido: lucroBruto - desp - comissao,
    ticketMedio: vs.length ? faturamento / vs.length : 0,
    numeroVendas: vs.length,
    unidadesVendidas: vs.reduce((s, v) => s + v.quantidade, 0),
    recebido: vs.reduce((s, v) => s + v.recebido, 0),
    emAberto: vs.reduce((s, v) => s + v.emAberto, 0),
    comissaoAPagar: vs.reduce((s, v) => s + v.comissao, 0),
    creditoTradeIn: vs.reduce((s, v) => s + v.creditoTradeIn, 0),
    entregasPendentes: vs.filter((v) => v.entrega === 'pendente').length,
  };
}

/* ---------- série temporal ---------- */

export async function getSerie(p: Periodo): Promise<PontoSerie[]> {
  await atraso();
  const vs = noPeriodo(p);
  const mapa = new Map<string, PontoSerie>();

  for (let d = new Date(p.de); d <= p.ate; d = somarDias(d, 1)) {
    mapa.set(isoDia(d), { data: isoDia(d), faturamento: 0, lucro: 0 });
  }
  for (const v of vs) {
    const ponto = mapa.get(v.data);
    if (!ponto) continue;
    ponto.faturamento += v.receita;
    ponto.lucro += v.margem;
  }
  return [...mapa.values()];
}

/* ---------- categorias ---------- */

export async function getPorCategoria(p: Periodo): Promise<FatiaCategoria[]> {
  await atraso();
  const vs = noPeriodo(p);
  return CATEGORIAS.map(({ id, label }) => {
    const doGrupo = vs.filter((v) => v.produto.categoria === id);
    return {
      categoria: id,
      label,
      faturamento: doGrupo.reduce((s, v) => s + v.receita, 0),
      margem: doGrupo.reduce((s, v) => s + v.margem, 0),
      unidades: doGrupo.reduce((s, v) => s + v.quantidade, 0),
    };
  }).sort((a, b) => b.faturamento - a.faturamento);
}

/* ---------- vendas ---------- */

export interface FiltrosVenda {
  categoria?: Categoria | 'todas';
  vendedorId?: string | 'todos';
  formaPagamento?: FormaPagamento | 'todas';
  busca?: string;
}

export async function getVendas(p: Periodo, f: FiltrosVenda = {}): Promise<VendaCompleta[]> {
  await atraso();
  let vs = noPeriodo(p);
  if (f.categoria && f.categoria !== 'todas') vs = vs.filter((v) => v.produto.categoria === f.categoria);
  if (f.vendedorId && f.vendedorId !== 'todos') vs = vs.filter((v) => v.vendedorId === f.vendedorId);
  if (f.formaPagamento && f.formaPagamento !== 'todas') vs = vs.filter((v) => v.formaPagamento === f.formaPagamento);
  if (f.busca?.trim()) {
    const q = f.busca.trim().toLowerCase();
    vs = vs.filter(
      (v) => v.produto.nome.toLowerCase().includes(q) ||
             v.produto.sku.toLowerCase().includes(q) ||
             v.vendedor.nome.toLowerCase().includes(q),
    );
  }
  return vs.sort((a, b) => b.data.localeCompare(a.data));
}

/* ---------- mutations ---------- */
// Alteram o mock em memória. Com backend viram POST/PATCH — as telas não mudam.

export interface NovaVendaInput {
  data: string;
  produtoId: string;
  vendedorId: string;
  quantidade: number;
  precoUnit: number;
  formaPagamento: FormaPagamento;
  parcelas: number;
  entrega: Venda['entrega'];
  clienteNome?: string;
  clienteFone?: string;
  cidade?: string;
  canal?: Venda['canal'];
  tradeIn?: Venda['tradeIn'];
  observacoes?: string;
  /** opcional: registra a primeira entrada de dinheiro já no ato */
  primeiroPagamento?: { data: string; valor: number; forma: FormaPagamento };
}

export async function registrarVenda(input: NovaVendaInput): Promise<Venda> {
  const produto = mapaProdutos.get(input.produtoId);
  const vendedor = mapaVendedores.get(input.vendedorId);
  if (!produto) throw new Error('Produto não encontrado');

  const taxaPct = FORMAS_PAGAMENTO.find((f) => f.id === input.formaPagamento)?.taxa ?? 0;

  /**
   * Com banco ligado, GRAVA PRIMEIRO e volta.
   *
   * Se a memória fosse atualizada antes, uma escrita recusada pelo RLS deixaria
   * a tela mostrando uma venda que não existe — e o vendedor iria embora
   * achando que registrou. `gravarVenda` recarrega tudo, então o resto desta
   * função só vale para o modo demonstração.
   */
  if (gravando()) {
    const id = await gravarVenda({
      data: input.data,
      produtoId: input.produtoId,
      vendedorId: input.vendedorId,
      quantidade: input.quantidade,
      precoUnit: input.precoUnit,
      custoUnit: produto.custo,
      formaPagamento: input.formaPagamento,
      parcelas: input.parcelas,
      taxaPct,
      comissaoPct: vendedor?.comissaoPct ?? 0,
      entrega: input.entrega,
      canal: input.canal ?? null,
      clienteNome: input.clienteNome ?? null,
      clienteFone: input.clienteFone ?? null,
      cidade: input.cidade ?? null,
      tradeInModelo: input.tradeIn?.modelo ?? null,
      tradeInValor: input.tradeIn?.valorCredito ?? 0,
      observacoes: input.observacoes ?? null,
    });

    if (input.primeiroPagamento && input.primeiroPagamento.valor > 0) {
      await gravarPagamento(id, input.primeiroPagamento.data,
        input.primeiroPagamento.valor, input.primeiroPagamento.forma);
    }
    return mapaVendas.get(id) ?? (vendas.find((v) => v.id === id) as Venda);
  }

  const venda: Venda = {
    id: `s${vendas.length + 1}-${Date.now().toString(36)}`,
    data: input.data,
    produtoId: input.produtoId,
    vendedorId: input.vendedorId,
    quantidade: input.quantidade,
    precoUnit: input.precoUnit,
    // custo vem do catálogo e é CONGELADO aqui — reposição futura mais cara não
    // reescreve a margem desta venda
    custoUnit: produto.custo,
    formaPagamento: input.formaPagamento,
    parcelas: input.parcelas,
    comissaoPct: vendedor?.comissaoPct ?? 0,
    taxaPct,
    entrega: input.entrega,
    clienteNome: input.clienteNome,
    clienteFone: input.clienteFone,
    cidade: input.cidade,
    canal: input.canal,
    tradeIn: input.tradeIn,
    observacoes: input.observacoes,
  };

  vendas.push(venda);
  mapaVendas.set(venda.id, venda);

  // Baixa de estoque: vender GRAVA UM MOVIMENTO, não subtrai de um campo.
  //
  // Antes fazia `produto.estoque -= qtd`, com um `Math.max(…, 0)` que escondia
  // o problema: vender mais do que havia simplesmente parava em zero, e a
  // divergência sumia sem deixar rastro. Como movimento, o saldo pode ficar
  // negativo — e negativo é justamente o sinal de que algo foi vendido sem ter
  // entrado, que é o que se quer enxergar.
  movimentos.push({
    id: `mv-v-${venda.id}`,
    produtoId: produto.id,
    quantidade: -input.quantidade,
    tipo: 'venda',
    custoUnit: produto.custo,
    freteRateado: 0,
    vendaId: venda.id,
    observacao: null,
    data: venda.data,
  });

  if (input.primeiroPagamento && input.primeiroPagamento.valor > 0) {
    await registrarPagamento({
      vendaId: venda.id,
      ...input.primeiroPagamento,
    });
  }

  return venda;
}

export async function registrarPagamento(p: {
  vendaId: string; data: string; valor: number; forma: FormaPagamento;
}) {
  if (gravando()) {
    await gravarPagamento(p.vendaId, p.data, p.valor, p.forma);
    return pagamentos.find((x) => x.vendaId === p.vendaId && x.data === p.data)!;
  }
  const novo: Pagamento = { id: `pg${pagamentos.length + 1}-${Date.now().toString(36)}`, ...p };
  pagamentos.push(novo);
  const lista = pagamentosPorVenda.get(p.vendaId) ?? [];
  lista.push(novo);
  pagamentosPorVenda.set(p.vendaId, lista);
  return novo;
}

export async function marcarEntrega(vendaId: string, status: Venda['entrega']) {
  if (gravando()) return gravarEntrega(vendaId, status === 'entregue');
  const v = mapaVendas.get(vendaId);
  if (v) v.entrega = status;
}

export async function salvarVendedor(dados: {
  id?: string; nome: string; metaMensal: number; comissaoPct: number; ativo?: boolean;
}) {
  if (gravando()) {
    const iniciais = dados.nome.trim().split(/\s+/).slice(0, 2)
      .map((x) => x[0]?.toUpperCase() ?? '').join('') || 'V';
    const id = await gravarVendedor(dados.id ?? null, {
      nome: dados.nome.trim(), iniciais,
      metaMensal: dados.metaMensal, comissaoPct: dados.comissaoPct,
    });
    return vendedores.find((v) => v.id === id);
  }
  if (dados.id) {
    const v = mapaVendedores.get(dados.id);
    if (v) Object.assign(v, dados);
    return v;
  }
  const iniciais = dados.nome.trim().split(/\s+/).slice(0, 2)
    .map((x) => x[0]?.toUpperCase() ?? '').join('');
  const novo: Vendedor = {
    id: `v${vendedores.length + 1}-${Date.now().toString(36)}`,
    nome: dados.nome.trim(),
    iniciais: iniciais || 'V',
    metaMensal: dados.metaMensal,
    comissaoPct: dados.comissaoPct,
    ativo: dados.ativo ?? true,
  };
  vendedores.push(novo);
  mapaVendedores.set(novo.id, novo);
  return novo;
}

export async function alternarVendedorAtivo(id: string) {
  if (gravando()) {
    const atual = vendedores.find((v) => v.id === id);
    return gravarVendedorAtivo(id, !(atual?.ativo ?? true));
  }
  const v = mapaVendedores.get(id);
  // Desativar em vez de excluir: vendedor removido levaria junto o histórico
  // de vendas dele, e o passado não pode desaparecer.
  if (v) v.ativo = !v.ativo;
}

/* ---------- vendedores ---------- */

export async function getVendedores(): Promise<Vendedor[]> {
  await atraso(60);
  return vendedores;
}

export async function getDesempenho(p: Periodo): Promise<DesempenhoVendedor[]> {
  await atraso();
  const vs = noPeriodo(p);
  // A meta é mensal; o período pode ser maior ou menor. Proporcionalizamos pelo
  // número de dias para o progresso não mentir em janelas curtas.
  const dias = diffDias(p.ate, p.de) + 1;
  const fatorMeta = dias / 30;

  const linhas = vendedores.map((vendedor) => {
    const minhas = vs.filter((v) => v.vendedorId === vendedor.id);
    const faturamento = minhas.reduce((s, v) => s + v.receita, 0);
    const margem = minhas.reduce((s, v) => s + v.margem, 0);
    const metaPeriodo = vendedor.metaMensal * fatorMeta;
    return {
      vendedor,
      numeroVendas: minhas.length,
      faturamento,
      margem,
      ticketMedio: minhas.length ? faturamento / minhas.length : 0,
      // sobre o recebido, não sobre o contratado
      comissao: minhas.reduce((s, v) => s + v.comissao, 0),
      progressoMeta: metaPeriodo > 0 ? (faturamento / metaPeriodo) * 100 : 0,
      posicao: 0,
    };
  });

  return linhas
    .sort((a, b) => b.faturamento - a.faturamento)
    .map((l, i) => ({ ...l, posicao: i + 1 }));
}

/* ---------- caixa ---------- */

export async function getMovimentos(p: Periodo): Promise<MovimentoCaixa[]> {
  await atraso();
  // Caixa segue o PAGAMENTO, não a venda: parcela de dezembro entra em dezembro,
  // não no dia em que o cliente fechou o negócio.
  const entradas: MovimentoCaixa[] = pagamentos
    .filter((pg) => dentro(pg.data, p))
    .map((pg) => {
      const venda = mapaVendas.get(pg.vendaId);
      const taxaPct = taxaDe(pg.forma) / 100;
      return {
        id: `mv-${pg.id}`,
        data: pg.data,
        descricao: venda ? `${venda.quantidade}x ${mapaProdutos.get(venda.produtoId)?.nome}` : 'Recebimento',
        tipo: 'entrada' as const,
        categoria: 'Vendas',
        valor: pg.valor * (1 - taxaPct), // líquido da taxa do meio de pagamento
      };
    });
  const saidas: MovimentoCaixa[] = despesasNoPeriodo(p).map((d) => ({
    id: `mv-${d.id}`,
    data: d.data,
    descricao: d.descricao,
    tipo: 'saida',
    categoria: d.categoria,
    valor: d.valor,
  }));
  return [...entradas, ...saidas].sort((a, b) => b.data.localeCompare(a.data));
}

export interface PontoSaldo { data: string; entradas: number; saidas: number; saldo: number }

export async function getFluxoCaixa(p: Periodo): Promise<PontoSaldo[]> {
  await atraso();
  // Saldo acumulado precisa considerar TUDO que aconteceu antes do período,
  // senão a linha começa do zero e engana quem olha.
  const liquido = (pg: Pagamento) => pg.valor * (1 - taxaDe(pg.forma) / 100);

  const antes = { ent: 0, sai: 0 };
  for (const pg of pagamentos) if (pg.data < isoDia(p.de)) antes.ent += liquido(pg);
  for (const d of despesas) if (d.data < isoDia(p.de)) antes.sai += d.valor;

  let saldo = SALDO_INICIAL + antes.ent - antes.sai;

  const porDia = new Map<string, { entradas: number; saidas: number }>();
  for (let d = new Date(p.de); d <= p.ate; d = somarDias(d, 1)) {
    porDia.set(isoDia(d), { entradas: 0, saidas: 0 });
  }
  for (const pg of pagamentos) {
    const x = porDia.get(pg.data);
    if (x) x.entradas += liquido(pg);
  }
  for (const d of despesasNoPeriodo(p)) {
    const x = porDia.get(d.data);
    if (x) x.saidas += d.valor;
  }

  return [...porDia.entries()].map(([data, x]) => {
    saldo += x.entradas - x.saidas;
    return { data, entradas: x.entradas, saidas: x.saidas, saldo };
  });
}

/**
 * STATUS DERIVADO, nunca guardado.
 *
 * Uma conta gravada como "pendente" continua "pendente" depois de vencida, e
 * ninguém percebe — é o mesmo erro do campo de saldo em estoque. Aqui o status
 * sai de `pagoEm` + `vencimento` a cada leitura, então não tem como envelhecer.
 * Espelha a view `v_conta` do banco.
 */
function statusConta(c: Conta): StatusConta {
  if (c.pagoEm) return 'paga';
  return c.vencimento < isoDia(new Date()) ? 'vencida' : 'pendente';
}

export async function getContas(): Promise<Conta[]> {
  await atraso(120);
  return contas
    .map((c) => ({ ...c, status: statusConta(c) }))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export interface ContaInput {
  tipo: 'pagar' | 'receber';
  descricao: string;
  contraparte: string;
  valor: number;
  vencimento: string;
}

function validarConta(i: ContaInput) {
  if (!i.descricao.trim()) throw new Error('a conta precisa de descrição');
  if (!Number.isFinite(i.valor) || i.valor <= 0) throw new Error('valor precisa ser maior que zero');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.vencimento)) throw new Error('vencimento inválido');
}

export async function criarConta(i: ContaInput): Promise<string> {
  await atraso();
  validarConta(i);
  if (gravando()) {
    await gravarConta(null, { tipo: i.tipo, descricao: i.descricao.trim(),
      contraparte: i.contraparte.trim(), valor: i.valor, vencimento: i.vencimento });
    return '';
  }
  const id = `c-${Date.now()}`;
  contas.push({
    ...i,
    id,
    descricao: i.descricao.trim(),
    contraparte: i.contraparte.trim(),
    pagoEm: null,
    status: 'pendente',
  });
  return id;
}

export async function atualizarConta(id: string, i: ContaInput): Promise<void> {
  await atraso();
  validarConta(i);
  if (gravando()) {
    return gravarConta(id, { tipo: i.tipo, descricao: i.descricao.trim(),
      contraparte: i.contraparte.trim(), valor: i.valor, vencimento: i.vencimento });
  }
  const c = contas.find((x) => x.id === id);
  if (!c) throw new Error('conta não encontrada');
  Object.assign(c, i, {
    descricao: i.descricao.trim(),
    contraparte: i.contraparte.trim(),
  });
}

export async function excluirConta(id: string): Promise<void> {
  await atraso();
  if (gravando()) return gravarExcluirConta(id);
  const i = contas.findIndex((x) => x.id === id);
  if (i >= 0) contas.splice(i, 1);
}

/**
 * Marcar e DESMARCAR.
 *
 * Antes só dava para marcar, e o clique era irreversível — um toque errado e a
 * conta ficava paga para sempre, sem caminho de volta. Pior: o estado vivia no
 * componente, então bastava trocar de aba para a marcação sumir. As duas coisas
 * juntas produzem o pior resultado possível: parece que salvou, e não salvou.
 */
export async function liquidarConta(id: string, pago: boolean): Promise<void> {
  await atraso(60);
  if (gravando()) return gravarLiquidarConta(id, pago ? isoDia(new Date()) : null);
  const c = contas.find((x) => x.id === id);
  if (c) c.pagoEm = pago ? isoDia(new Date()) : null;
}

/* ---------- impostos: Simples Nacional, Anexo I (comércio) ---------- */

export const ANEXO_I: FaixaSimples[] = [
  { faixa: 1, ate: 180000, aliquotaNominal: 4.0, parcelaDeduzir: 0 },
  { faixa: 2, ate: 360000, aliquotaNominal: 7.3, parcelaDeduzir: 5940 },
  { faixa: 3, ate: 720000, aliquotaNominal: 9.5, parcelaDeduzir: 13860 },
  { faixa: 4, ate: 1800000, aliquotaNominal: 10.7, parcelaDeduzir: 22500 },
  { faixa: 5, ate: 3600000, aliquotaNominal: 14.3, parcelaDeduzir: 87300 },
  { faixa: 6, ate: 4800000, aliquotaNominal: 19.0, parcelaDeduzir: 378000 },
];

export interface PontoMes { mes: string; faturamento: number }

export async function getFaturamentoMensal(meses = 12): Promise<PontoMes[]> {
  await atraso();
  const mapa = new Map<string, number>();
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(HOJE.getFullYear(), HOJE.getMonth() - i, 1);
    mapa.set(ymDe(d), 0);
  }
  for (const v of vendas) {
    const ym = ymDe(v.data);
    if (mapa.has(ym)) mapa.set(ym, mapa.get(ym)! + v.precoUnit * v.quantidade);
  }
  return [...mapa.entries()].map(([mes, faturamento]) => ({ mes, faturamento }));
}

/**
 * Alíquota efetiva do Simples: ((RBT12 × nominal) − parcela a deduzir) / RBT12.
 * É por isso que ninguém paga a alíquota "de tabela" — só a nominal da faixa 1.
 */
export function aliquotaEfetiva(rbt12: number, faixa: FaixaSimples) {
  if (rbt12 <= 0) return 0;
  return ((rbt12 * (faixa.aliquotaNominal / 100) - faixa.parcelaDeduzir) / rbt12) * 100;
}

export function faixaDe(rbt12: number): FaixaSimples {
  return ANEXO_I.find((f) => rbt12 <= f.ate) ?? ANEXO_I[ANEXO_I.length - 1];
}

/* ═══════════════════════════════════════════ lucro por unidade ══════════ */

/**
 * A ÚLTIMA LINHA: quanto sobra de cada raquete depois de tudo.
 *
 * A conta é uma cascata, e a ordem importa porque cada bloco responde a uma
 * pergunta diferente:
 *
 *   preço − custo − taxa − comissão − imposto  = MARGEM DE CONTRIBUIÇÃO
 *       "vender mais uma unidade melhora minha vida?"
 *   − mídia por venda                          = DEPOIS DA MÍDIA
 *       "o anúncio se paga?"
 *   − estrutura rateada                        = LUCRO POR UNIDADE
 *       "a loja inteira se paga?"
 *
 * TRÊS ARMADILHAS, e as três estão tratadas aqui:
 *
 * 1. O DENOMINADOR É O MÊS. A estrutura é dividida pelas unidades vendidas no
 *    mês, então num mês fraco cada raquete "absorve" mais aluguel e o lucro
 *    por raquete despenca — sem que a raquete tenha piorado em nada. Por isso
 *    a margem de contribuição aparece separada: ela é a verdade da unidade; o
 *    lucro por unidade é a verdade do mês.
 *
 * 2. O RATEIO É POR FATURAMENTO. Se raquete é 70% do que a loja fatura, ela
 *    absorve 70% do aluguel. Jogar tudo em cima da raquete faria acessório
 *    parecer lucro puro, quando ele também ocupa prateleira e luz.
 *
 * 3. IMPOSTO É VARIÁVEL, NÃO ESTRUTURA. O Simples é percentual do faturamento:
 *    entra por unidade, junto com taxa e comissão. Por isso a categoria
 *    'impostos' é EXCLUÍDA do bolo de custos fixos — estaria contada duas
 *    vezes, e o erro seria invisível porque as duas linhas parecem legítimas.
 */
export async function getLucroUnitario(
  mes: string, categoria: Categoria = 'raquetes',
): Promise<LucroUnitario> {
  await atraso();

  const doMes = vendas.filter((v) => ymDe(v.data) === mes);
  const daCategoria = doMes
    .map(completar)
    .filter((v) => v.produto.categoria === categoria);

  const unidades = daCategoria.reduce((s, v) => s + v.quantidade, 0);
  const faturamentoCategoria = daCategoria.reduce((s, v) => s + v.receita, 0);
  const faturamentoTotal = doMes.map(completar).reduce((s, v) => s + v.receita, 0);

  // A alíquota do Simples depende do faturamento dos ÚLTIMOS 12 MESES, não do
  // mês. Uma loja que cresce muda de faixa e a margem encolhe sozinha.
  const rbt12 = rbt12Ate(mes);
  const aliquota = aliquotaEfetiva(rbt12, faixaDe(rbt12));

  /** Divisão que devolve zero em vez de Infinity ou NaN. */
  const por = (total: number) => (unidades > 0 ? total / unidades : 0);

  const precoMedio    = por(faturamentoCategoria);
  const custoMedio    = por(daCategoria.reduce((s, v) => s + v.custo, 0));
  const taxaMedia     = por(daCategoria.reduce((s, v) => s + v.taxa, 0));
  const comissaoMedia = por(daCategoria.reduce((s, v) => s + v.comissao, 0));
  const impostoMedio  = precoMedio * (aliquota / 100);

  const margemContribuicao = precoMedio - custoMedio - taxaMedia - comissaoMedia - impostoMedio;

  /* ---- mídia: linha própria, porque é a que se controla no mês seguinte -- */
  const doMesDespesa = (cats: Despesa['categoria'][]) =>
    despesas.filter((d) => ymDe(d.data) === mes && cats.includes(d.categoria))
            .reduce((s, d) => s + d.valor, 0);

  /**
   * MÊS EM ANDAMENTO: a estrutura entra proporcional aos dias corridos.
   *
   * Sem isto, no dia 5 a loja tem as vendas de cinco dias e o aluguel de trinta,
   * e o lucro por raquete aparece como um prejuízo enorme. O número não estaria
   * "errado" — estaria comparando coisas de tamanhos diferentes, que é pior,
   * porque parece preciso. E a consequência prática é que o dono deixa de abrir
   * a tela até o fim do mês, justamente quando ainda dava para reagir.
   *
   * Mês fechado usa o valor cheio: ali não há o que proporcionalizar.
   */
  const [ano, mesNum] = mes.split('-').map(Number);
  const diasDoMes = new Date(ano, mesNum, 0).getDate();
  const mesEmAndamento = mes === mesRef();
  const diasDecorridos = mesEmAndamento ? Math.min(HOJE.getDate(), diasDoMes) : diasDoMes;
  const fracao = diasDecorridos / diasDoMes;

  const midiaTotal = doMesDespesa(['marketing']) * fracao;
  // A mídia inteira é atribuída à categoria porque o anúncio é de raquete. Se
  // um dia houver campanha de roupa, isto vira rateio por campanha.
  const midiaPorUnidade = por(midiaTotal);
  const depoisDaMidia = margemContribuicao - midiaPorUnidade;

  /* ---- estrutura: sem fornecedores (é ativo), sem marketing (linha acima),
          sem impostos (já saiu por unidade) --------------------------------- */
  const estruturaTotal = doMesDespesa(['aluguel', 'folha', 'operacional']) * fracao;

  const shareFaturamento = faturamentoTotal > 0
    ? faturamentoCategoria / faturamentoTotal
    : 0;
  const estruturaRateada = estruturaTotal * shareFaturamento;
  const estruturaPorUnidade = por(estruturaRateada);

  const lucroUnitario = depoisDaMidia - estruturaPorUnidade;

  /**
   * PONTO DE EQUILÍBRIO — quantas unidades pagam a conta do mês.
   *
   * Divide pela MARGEM DE CONTRIBUIÇÃO, nunca pelo lucro por unidade: o lucro
   * já tem a estrutura descontada dentro dele, e dividir a estrutura por um
   * número que já a contém é circular. Erro comum, e produz um alvo otimista
   * demais justamente para quem mais precisa do número certo.
   */
  const custoDoMes = estruturaRateada + midiaTotal;
  const pontoEquilibrio = margemContribuicao > 0
    ? Math.ceil(custoDoMes / margemContribuicao)
    : 0;

  return {
    mes, categoria, unidades, faturamentoCategoria,
    precoMedio, custoMedio, taxaMedia, comissaoMedia, impostoMedio,
    aliquotaSimples: aliquota,
    margemContribuicao,
    margemContribuicaoPct: precoMedio > 0 ? (margemContribuicao / precoMedio) * 100 : 0,
    midiaTotal, midiaPorUnidade, depoisDaMidia,
    estruturaTotal, shareFaturamento, estruturaRateada, estruturaPorUnidade,
    lucroUnitario,
    lucroUnitarioPct: precoMedio > 0 ? (lucroUnitario / precoMedio) * 100 : 0,
    pontoEquilibrio,
    faltamParaEquilibrio: pontoEquilibrio - unidades,
    mesEmAndamento, diasDecorridos, diasDoMes,
  };
}

/** Receita bruta dos 12 meses que terminam na competência dada. */
function rbt12Ate(mes: string): number {
  const [a, m] = mes.split('-').map(Number);
  const fim = new Date(a, m, 1, 12);                 // 1º do mês seguinte
  const ini = new Date(a, m - 12, 1, 12);
  return vendas
    .filter((v) => {
      const d = new Date(`${v.data}T12:00:00`);
      return d >= ini && d < fim;
    })
    .reduce((s, v) => s + v.precoUnit * v.quantidade, 0);
}

/** Meses com venda, do mais recente para o mais antigo — o seletor da tela. */
export async function getCompetencias(): Promise<string[]> {
  await atraso();
  return [...new Set(vendas.map((v) => ymDe(v.data)))].sort().reverse();
}

/* ---------- custos fixos: o modelo mensal que o dono edita ---------- */

export async function getCustosFixos(): Promise<CustoFixo[]> {
  await atraso();
  return custosFixos.filter((c) => c.ativo);
}

export async function salvarCustoFixo(c: Omit<CustoFixo, 'id'> & { id?: string }) {
  await atraso();
  if (!c.nome.trim()) throw new Error('o custo precisa de nome');
  if (c.valorMensal < 0) throw new Error('valor não pode ser negativo');

  if (gravando()) {
    return gravarCustoFixo(c.id ?? null, {
      nome: c.nome.trim(), categoria: c.categoria,
      valorMensal: c.valorMensal, ativo: true,
    }, mesRef());
  }

  const existente = c.id ? custosFixos.find((x) => x.id === c.id) : null;
  if (existente) {
    Object.assign(existente, { ...c, nome: c.nome.trim() });
  } else {
    custosFixos.push({ ...c, id: `cf${Date.now()}`, nome: c.nome.trim() });
  }
  // O modelo mudou: a despesa do mês corrente acompanha. Meses fechados NÃO —
  // reajustar o aluguel hoje não pode reescrever o que se pagou em março.
  aplicarCustosFixos(mesRef());
}

export async function excluirCustoFixo(id: string) {
  await atraso();
  const c = custosFixos.find((x) => x.id === id);
  if (gravando() && c) {
    return gravarCustoFixo(id, {
      nome: c.nome, categoria: c.categoria,
      valorMensal: c.valorMensal, ativo: false,
    }, mesRef());
  }
  // Desativa em vez de apagar: o histórico dos meses em que ele existiu
  // continua valendo, e o relatório de março não pode mudar por causa disso.
  if (c) c.ativo = false;
  aplicarCustosFixos(mesRef());
}

export async function getEstimativaImposto(): Promise<EstimativaImposto> {
  await atraso();
  const meses = await getFaturamentoMensal(12);
  const rbt12 = meses.reduce((s, m) => s + m.faturamento, 0);
  const faixa = faixaDe(rbt12);
  const idx = ANEXO_I.indexOf(faixa);
  const proximaFaixa = idx >= 0 && idx < ANEXO_I.length - 1 ? ANEXO_I[idx + 1] : null;
  const efetiva = aliquotaEfetiva(rbt12, faixa);
  const faturamentoMes = meses[meses.length - 1]?.faturamento ?? 0;

  return {
    rbt12,
    faixa,
    proximaFaixa,
    aliquotaEfetiva: efetiva,
    faturamentoMes,
    dasEstimado: faturamentoMes * (efetiva / 100),
    faltaParaProximaFaixa: proximaFaixa ? faixa.ate - rbt12 : null,
  };
}

/* ---------- meta da loja: ritmo, projeção e risco ---------- */

export async function getMetas(): Promise<MetaLoja[]> {
  await atraso(60);
  return metasLoja;
}

/** Altera a meta de uma competência. Vira mutation quando houver backend. */
export async function definirMeta(mes: string, receita: number) {
  if (gravando()) return gravarMeta(mes, receita);
  const alvo = metasLoja.find((m) => m.mes === mes);
  if (alvo) alvo.receita = receita;
  else metasLoja.push({ mes, receita });
}

/** Faturamento, número de vendas e margem por dia de uma competência. */
export async function getFaturamentoDiario(mes: string): Promise<PontoDia[]> {
  await atraso();
  const inicio = inicioDoMes(mes);
  const fim = fimDoMes(mes);
  const mapa = new Map<string, PontoDia>();
  for (let d = new Date(inicio); d < fim; d = somarDias(d, 1)) {
    mapa.set(isoDia(d), { data: isoDia(d), faturamento: 0, vendas: 0, margem: 0 });
  }
  for (const v of vendas) {
    const p = mapa.get(v.data);
    if (!p) continue;
    const c = completar(v);
    p.faturamento += c.receita;
    p.margem += c.margem;
    p.vendas += 1;
  }
  return [...mapa.values()];
}

/**
 * Acompanhamento de meta da competência.
 *
 * A conta que quase todo painel erra: "ritmo necessário por dia" NÃO é o valor
 * que falta — é o que falta DIVIDIDO pelos dias que restam. Sem essa divisão o
 * número fica na casa das centenas de milhares e não significa nada.
 */
export async function getAcompanhamentoMeta(mes = mesRef()): Promise<AcompanhamentoMeta> {
  await atraso();

  const dias = await getFaturamentoDiario(mes);
  const meta = metasLoja.find((m) => m.mes === mes)?.receita ?? 0;

  const inicio = inicioDoMes(mes);
  const fimExclusivo = fimDoMes(mes);
  const diasNoMes = Math.round((fimExclusivo.getTime() - inicio.getTime()) / 86400000);

  // Se a competência já fechou, "hoje" é o último dia dela.
  const hoje = new Date(HOJE);
  const dentroDoMes = hoje >= inicio && hoje < fimExclusivo;
  const diasDecorridos = dentroDoMes ? hoje.getDate() : diasNoMes;
  const diasRestantes = Math.max(diasNoMes - diasDecorridos, 0);

  const ateHoje = dias.slice(0, diasDecorridos);
  const acumulado = ateHoje.reduce((s, d) => s + d.faturamento, 0);
  const vendasNoMes = ateHoje.reduce((s, d) => s + d.vendas, 0);
  const diasComVenda = ateHoje.filter((d) => d.vendas > 0).length;

  const restante = Math.max(meta - acumulado, 0);
  const ritmoAtual = diasDecorridos > 0 ? acumulado / diasDecorridos : 0;
  const ritmoNecessario = diasRestantes > 0 ? restante / diasRestantes : 0;
  const projecao = acumulado + ritmoAtual * diasRestantes;
  const cobertura = meta > 0 ? projecao / meta : 0;
  const esperadoHoje = meta * (diasDecorridos / diasNoMes);
  const ticketMedio = vendasNoMes > 0 ? acumulado / vendasNoMes : 0;

  const risco: AcompanhamentoMeta['risco'] =
    cobertura >= 1 ? 'no_ritmo' : cobertura >= 0.85 ? 'atencao' : 'alto';

  return {
    mes, meta, acumulado, restante,
    atingimento: meta > 0 ? (acumulado / meta) * 100 : 0,
    diasNoMes, diasDecorridos, diasRestantes, diasComVenda,
    ritmoAtual, ritmoNecessario, projecao, cobertura,
    esperadoHoje,
    gap: acumulado - esperadoHoje,
    ticketMedio, vendasNoMes,
    vendasPorDiaNecessarias: ticketMedio > 0 ? ritmoNecessario / ticketMedio : 0,
    risco,
  };
}

/* ---------- estoque ---------- */

/**
 * O saldo é CONTA, nunca campo.
 *
 * Espelha a view `saldo_estoque` do banco. Campo de saldo é o que desincroniza:
 * basta uma venda gravada sem baixar o estoque para os dois números divergirem
 * em silêncio, e ninguém descobre até faltar mercadoria com o sistema dizendo
 * que tem.
 */
export function saldoDe(produtoId: string): number {
  return movimentos
    .filter((m) => m.produtoId === produtoId)
    .reduce((s, m) => s + m.quantidade, 0);
}

export async function getEstoque(): Promise<ItemEstoque[]> {
  await atraso();
  const corte = isoDia(somarDias(HOJE, -30));
  const vendidos = new Map<string, number>();
  for (const v of vendas) {
    if (v.data >= corte) vendidos.set(v.produtoId, (vendidos.get(v.produtoId) ?? 0) + v.quantidade);
  }

  // Uma passada só sobre os movimentos: filtrar por produto dentro do map faria
  // uma varredura por item, e com o histórico de um ano isso trava a tela.
  const saldos = new Map<string, number>();
  for (const m of movimentos) {
    saldos.set(m.produtoId, (saldos.get(m.produtoId) ?? 0) + m.quantidade);
  }

  return produtos.filter((p) => p.ativo).map((p) => {
    const estoque = saldos.get(p.id) ?? 0;
    const v30 = vendidos.get(p.id) ?? 0;
    const porDia = v30 / 30;
    const cobertura = porDia > 0 ? estoque / porDia : null;
    // Giro pela relação entre o que saiu em 30 dias e o que ainda tem parado.
    const razao = estoque > 0 ? v30 / estoque : v30 > 0 ? 99 : 0;
    const giro: ItemEstoque['giro'] =
      v30 === 0 ? 'parado' : razao < 0.5 ? 'lento' : razao < 1.5 ? 'normal' : 'rapido';

    return {
      ...p,
      estoque,
      margemUnit: p.preco - p.custo,
      margemPct: p.preco > 0 ? ((p.preco - p.custo) / p.preco) * 100 : 0,
      capitalParado: estoque * p.custo,
      vendidos30d: v30,
      giro,
      diasDeCobertura: cobertura,
      abaixoDoMinimo: estoque <= p.estoqueMin,
    };
  });
}

/* ═══════════════════════════════════════════ campanhas e retorno ═══════ */

export async function getCampanhas(): Promise<Campanha[]> {
  await atraso(80);
  return campanhas;
}

export async function getCustoMidia(mes: string): Promise<CustoMidia[]> {
  await atraso(80);
  return custosMidia.filter((c) => c.mes === mes);
}

export async function salvarCustoMidia(
  campanhaId: string, mes: string, gasto: number,
): Promise<void> {
  await atraso();
  if (!Number.isFinite(gasto) || gasto < 0) throw new Error('gasto não pode ser negativo');
  if (!campanhas.some((c) => c.id === campanhaId)) throw new Error('campanha não existe');

  if (gravando()) return gravarCustoMidia(campanhaId, mes, gasto);

  const existente = custosMidia.find((c) => c.campanhaId === campanhaId && c.mes === mes);
  if (existente) existente.gasto = gasto;
  else custosMidia.push({ campanhaId, mes, gasto });

  // O gasto de mídia também é despesa do mês — senão o resultado e o fluxo de
  // caixa ignorariam o dinheiro que saiu de verdade para a Meta.
  sincronizarDespesaDeMidia(mes);
}

/**
 * Uma linha de despesa de marketing por mês, somando o gasto de todas as
 * campanhas. Idempotente: refaz a linha em vez de empilhar.
 */
function sincronizarDespesaDeMidia(mes: string) {
  const total = custosMidia
    .filter((c) => c.mes === mes)
    .reduce((s, c) => s + c.gasto, 0);

  const id = `midia-${mes}`;
  const i = despesas.findIndex((d) => d.id === id);
  if (i >= 0) despesas.splice(i, 1);

  if (total > 0) {
    despesas.push({
      id, data: `${mes}-05`, descricao: 'Tráfego pago — Meta Ads',
      categoria: 'marketing', valor: total, recorrente: true, custoFixoId: null,
    });
    despesas.sort((a, b) => a.data.localeCompare(b.data));
  }
}

/**
 * O RETORNO POR CAMPANHA — a pergunta que começou o projeto.
 *
 * Devolve quatro leituras da mesma campanha, e as quatro discordam de
 * propósito, porque cada uma responde a coisa diferente:
 *
 *   custo por lead    quanto custou fazer o telefone tocar
 *   custo por venda   quanto custou trazer quem comprou
 *   retorno (ROAS)    quantos reais de receita por real de anúncio
 *   SOBRA             o que ficou depois de pagar mercadoria e anúncio
 *
 * A última é a que decide. ROAS de 5 parece ótimo, mas numa raquete de 30% de
 * margem ele deixa R$0,50 por real gasto — e se a margem cair para 20%, o
 * mesmo ROAS de 5 passa a dar prejuízo, sem o número mudar. Olhar só ROAS é o
 * erro mais caro de loja pequena que anuncia.
 */
export async function getRetornoCampanhas(mes: string): Promise<RetornoCampanha[]> {
  await atraso();

  const doMes = vendas.filter((v) => ymDe(v.data) === mes).map(completar);
  const leadsDoMes = leadsMock.filter((l) => ymDe(l.data) === mes);
  const gastos = new Map(
    custosMidia.filter((c) => c.mes === mes).map((c) => [c.campanhaId, c.gasto]));

  return campanhas
    .map((campanha): RetornoCampanha => {
      const vs = doMes.filter((v) => v.campanhaId === campanha.id);
      const ls = leadsDoMes.filter((l) => l.campanhaId === campanha.id);
      const gasto = gastos.get(campanha.id) ?? 0;

      const receita = vs.reduce((s, v) => s + v.receita, 0);
      // Contribuição, não margem bruta: tira também taxa e comissão, que são
      // dinheiro que sai de verdade a cada venda.
      const contribuicao = vs.reduce(
        (s, v) => s + (v.receita - v.custo - v.taxa - v.comissao), 0);

      return {
        campanha, mes, gasto,
        leads: ls.length,
        vendas: vs.length,
        receita,
        contribuicao,
        custoPorLead: ls.length > 0 && gasto > 0 ? gasto / ls.length : null,
        custoPorVenda: vs.length > 0 && gasto > 0 ? gasto / vs.length : null,
        conversao: ls.length > 0 ? (vs.length / ls.length) * 100 : 0,
        retorno: gasto > 0 ? receita / gasto : null,
        sobra: contribuicao - gasto,
      };
    })
    // Campanha sem gasto, sem lead e sem venda no mês é ruído na tela.
    .filter((r) => r.gasto > 0 || r.leads > 0 || r.vendas > 0)
    .sort((a, b) => b.gasto - a.gasto || b.receita - a.receita);
}

/* ---------- despesas ---------- */

export async function getDespesas(p: Periodo): Promise<Despesa[]> {
  await atraso(120);
  return despesasNoPeriodo(p)
    .slice()
    .sort((a, b) => b.data.localeCompare(a.data));
}

export interface DespesaInput {
  data: string;
  descricao: string;
  categoria: Despesa['categoria'];
  valor: number;
}

function validarDespesa(i: DespesaInput) {
  if (!i.descricao.trim()) throw new Error('a despesa precisa de descrição');
  if (!Number.isFinite(i.valor) || i.valor <= 0) throw new Error('valor precisa ser maior que zero');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.data)) throw new Error('data inválida');
}

export async function criarDespesa(i: DespesaInput): Promise<string> {
  await atraso();
  validarDespesa(i);
  if (gravando()) {
    await gravarDespesa(null, { ...i, descricao: i.descricao.trim() });
    return '';
  }
  const id = `d-${Date.now()}`;
  despesas.push({
    ...i, id, descricao: i.descricao.trim(), recorrente: false, custoFixoId: null,
  });
  despesas.sort((a, b) => a.data.localeCompare(b.data));
  return id;
}

/**
 * Despesa gerada pelo modelo de custo fixo NÃO se edita aqui.
 *
 * Se editasse, o modelo diria R$3.400 e o lançamento diria R$3.700, e nenhum
 * dos dois seria a verdade — na próxima vez que alguém salvasse o modelo, a
 * edição sumiria sem aviso. Uma verdade só: o valor muda no modelo.
 */
export async function atualizarDespesa(id: string, i: DespesaInput): Promise<void> {
  await atraso();
  validarDespesa(i);
  const d = despesas.find((x) => x.id === id);
  if (!d) throw new Error('despesa não encontrada');
  if (d.custoFixoId) {
    throw new Error('esta linha vem do modelo de custo fixo — altere o valor lá, em Custo por raquete');
  }
  if (gravando()) return gravarDespesa(id, { ...i, descricao: i.descricao.trim() });
  Object.assign(d, i, { descricao: i.descricao.trim() });
  despesas.sort((a, b) => a.data.localeCompare(b.data));
}

export async function excluirDespesa(id: string): Promise<void> {
  await atraso();
  const i = despesas.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (despesas[i].custoFixoId) {
    throw new Error('esta linha vem do modelo de custo fixo — remova o custo lá, em Custo por raquete');
  }
  if (gravando()) return gravarExcluirDespesa(id);
  despesas.splice(i, 1);
}

/* ---------- cadastro de produto ---------- */

export interface ProdutoInput {
  sku: string;
  nome: string;
  marca: string;
  categoria: Categoria;
  custo: number;
  preco: number;
  estoqueMin: number;
}

function validarProduto(i: ProdutoInput, idAtual?: string) {
  if (!i.sku.trim()) throw new Error('o produto precisa de SKU');
  if (!i.nome.trim()) throw new Error('o produto precisa de nome');
  if (!(i.preco > 0)) throw new Error('preço precisa ser maior que zero');
  if (i.custo < 0) throw new Error('custo não pode ser negativo');

  // SKU repetido é o erro que mais dói depois: duas linhas para a mesma
  // raquete, o estoque dividido entre elas, e o giro mentindo nas duas.
  const chocando = produtos.find(
    (p) => p.id !== idAtual && p.sku.toLowerCase() === i.sku.trim().toLowerCase());
  if (chocando) throw new Error(`o SKU ${i.sku} já existe em "${chocando.nome}"`);
}

export async function criarProduto(i: ProdutoInput): Promise<string> {
  await atraso();
  validarProduto(i);
  if (gravando()) {
    return gravarProduto(null, { ...i, sku: i.sku.trim().toUpperCase(),
      nome: i.nome.trim(), marca: i.marca.trim() });
  }
  const id = `p-${Date.now()}`;
  produtos.push({
    ...i,
    id,
    sku: i.sku.trim().toUpperCase(),
    nome: i.nome.trim(),
    marca: i.marca.trim(),
    ativo: true,
  });
  return id;
}

/**
 * Editar produto NÃO reescreve o passado.
 *
 * Mudar o preço hoje não altera o que foi vendido ontem: a venda congelou
 * `precoUnit` e `custoUnit` na hora. É a mesma razão de `venda.taxa_pct` ter
 * virado coluna — sem isso, um reajuste reescreveria a margem histórica
 * inteira e o relatório do mês passado mudaria sozinho.
 */
export async function atualizarProduto(id: string, i: ProdutoInput): Promise<void> {
  await atraso();
  validarProduto(i, id);
  if (gravando()) {
    await gravarProduto(id, { ...i, sku: i.sku.trim().toUpperCase(),
      nome: i.nome.trim(), marca: i.marca.trim() });
    return;
  }
  const p = produtos.find((x) => x.id === id);
  if (!p) throw new Error('produto não encontrado');
  Object.assign(p, i, {
    sku: i.sku.trim().toUpperCase(),
    nome: i.nome.trim(),
    marca: i.marca.trim(),
  });
}

/**
 * Desativa, não apaga.
 *
 * Produto com venda no histórico não pode sumir: o relatório do mês passado
 * ficaria com uma venda apontando para o nada. Desativado some do catálogo e
 * da tela de estoque, e o histórico continua inteiro.
 */
export async function arquivarProduto(id: string): Promise<void> {
  await atraso();
  const p = produtos.find((x) => x.id === id);
  if (!p) throw new Error('produto não encontrado');
  if (saldoDe(id) > 0) {
    throw new Error(
      `ainda há ${saldoDe(id)} unidade(s) em estoque. Dê baixa antes de arquivar.`);
  }
  if (gravando()) return gravarArquivarProduto(id);
  p.ativo = false;
}

/* ---------- entrada de mercadoria ---------- */

export interface EntradaInput {
  produtoId: string;
  quantidade: number;
  /** o que a unidade custou NESTA remessa */
  custoUnit: number;
  /** frete da remessa inteira; é rateado no custo da unidade */
  frete?: number;
  observacao?: string;
}

/**
 * CUSTO MÉDIO PONDERADO.
 *
 * Quando chega remessa nova a um preço diferente, o custo do produto vira a
 * média entre o que já estava parado e o que acabou de entrar:
 *
 *   novo = (saldo × custo_atual + qtd × custo_entrada) ÷ (saldo + qtd)
 *
 * É o critério que o contador espera e o que a legislação brasileira aceita
 * para Simples. A alternativa — usar sempre o último custo — faz a margem dar
 * saltos que não correspondem a nada que aconteceu na loja.
 *
 * O FRETE ENTRA NO CUSTO. É a parte que loja pequena mais esquece: R$400 de
 * frete numa remessa de 10 raquetes são R$40 por unidade, e ignorá-los infla a
 * margem aparente em cada venda daquele lote.
 */
export async function darEntrada(i: EntradaInput): Promise<void> {
  await atraso();
  const p = produtos.find((x) => x.id === i.produtoId);
  if (!p) throw new Error('produto não encontrado');
  if (!(i.quantidade > 0)) throw new Error('quantidade precisa ser maior que zero');
  if (i.custoUnit < 0) throw new Error('custo não pode ser negativo');

  const frete = i.frete ?? 0;
  const custoComFrete = i.custoUnit + frete / i.quantidade;

  const saldo = saldoDe(i.produtoId);
  // `max(saldo, 0)`: com saldo negativo por algum ajuste errado, a média sairia
  // distorcida ou negativa. Nesse caso o custo da remessa nova é a verdade.
  const base = Math.max(saldo, 0);
  const novoCusto = (base * p.custo + i.quantidade * custoComFrete) / (base + i.quantidade);

  p.custo = Math.round(novoCusto * 100) / 100;

  // No banco, o movimento e o custo novo vão juntos: se só o movimento
  // gravasse, o saldo subiria e a margem continuaria a do lote anterior.
  if (gravando()) {
    await gravarCustoProduto(i.produtoId, p.custo);
    return gravarMovimento({
      produtoId: i.produtoId, quantidade: i.quantidade, tipo: 'entrada',
      custoUnit: i.custoUnit, frete, observacao: i.observacao?.trim() || null,
    });
  }

  movimentos.push({
    id: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    produtoId: i.produtoId,
    quantidade: i.quantidade,
    tipo: 'entrada',
    custoUnit: i.custoUnit,
    freteRateado: frete,
    vendaId: null,
    observacao: i.observacao?.trim() || null,
    data: isoDia(new Date()),
  });
}

/**
 * Ajuste de inventário — quando a contagem física não bate com o sistema.
 *
 * Grava a DIFERENÇA como movimento, em vez de sobrescrever o saldo. Assim fica
 * registrado que houve divergência e de quanto: sumiço repetido no mesmo
 * produto é sinal de furto ou de venda não lançada, e um saldo sobrescrito
 * apagaria justamente essa pista.
 */
export async function ajustarEstoque(
  produtoId: string, contagem: number, observacao: string,
): Promise<void> {
  await atraso();
  if (!produtos.some((x) => x.id === produtoId)) throw new Error('produto não encontrado');
  if (!observacao.trim()) throw new Error('ajuste exige motivo');

  const diferenca = contagem - saldoDe(produtoId);
  if (diferenca === 0) return;

  if (gravando()) {
    return gravarMovimento({
      produtoId, quantidade: diferenca,
      tipo: diferenca < 0 ? 'perda' : 'ajuste',
      observacao: observacao.trim(),
    });
  }

  movimentos.push({
    id: `mv-aj-${Date.now()}`,
    produtoId,
    quantidade: diferenca,
    tipo: diferenca < 0 ? 'perda' : 'ajuste',
    custoUnit: null,
    freteRateado: 0,
    vendaId: null,
    observacao: observacao.trim(),
    data: isoDia(new Date()),
  });
}

/** Nome com sufixo porque `getMovimentos` já existe, e é o do fluxo de CAIXA. */
export async function getMovimentosProduto(produtoId: string): Promise<MovimentoEstoque[]> {
  await atraso(80);
  return movimentos
    .filter((m) => m.produtoId === produtoId)
    .sort((a, b) => b.data.localeCompare(a.data));
}
