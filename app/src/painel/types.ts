/** Modelo de domínio. Espelha o que serão as tabelas no Supabase. */

export type Categoria = 'raquetes' | 'roupas' | 'raqueteiras' | 'acessorios';

export const CATEGORIAS: { id: Categoria; label: string }[] = [
  { id: 'raquetes', label: 'Raquetes' },
  { id: 'roupas', label: 'Roupas' },
  { id: 'raqueteiras', label: 'Raqueteiras' },
  { id: 'acessorios', label: 'Acessórios' },
];

export type FormaPagamento = 'pix' | 'credito' | 'credito_parcelado' | 'debito' | 'dinheiro';

export const FORMAS_PAGAMENTO: { id: FormaPagamento; label: string; taxa: number }[] = [
  { id: 'pix', label: 'Pix', taxa: 0.99 },
  { id: 'debito', label: 'Débito', taxa: 1.99 },
  { id: 'credito', label: 'Crédito à vista', taxa: 3.49 },
  { id: 'credito_parcelado', label: 'Crédito parcelado', taxa: 5.49 },
  { id: 'dinheiro', label: 'Dinheiro', taxa: 0 },
];

export interface Vendedor {
  id: string;
  nome: string;
  iniciais: string;
  metaMensal: number;
  comissaoPct: number;
  ativo: boolean;
}

export interface Produto {
  id: string;
  sku: string;
  nome: string;
  categoria: Categoria;
  marca: string;
  /** custo médio ponderado do saldo atual — muda a cada entrada de mercadoria */
  custo: number;
  preco: number;
  estoqueMin: number;
  ativo: boolean;
}

/**
 * NÃO existe campo de saldo em `Produto`, e isso é deliberado.
 *
 * O saldo é a soma dos movimentos. Campo de saldo é o que desincroniza: basta
 * uma venda gravada sem baixar o estoque, ou uma baixa sem venda, para os dois
 * números divergirem em silêncio — e ninguém descobre até faltar mercadoria com
 * o sistema dizendo que tem. Mesma regra da view `saldo_estoque` no banco.
 */
export type TipoMovimentoEstoque =
  | 'entrada' | 'venda' | 'ajuste' | 'devolucao' | 'perda';

export interface MovimentoEstoque {
  id: string;
  produtoId: string;
  /** positivo entra, negativo sai */
  quantidade: number;
  tipo: TipoMovimentoEstoque;
  /** só em entrada: quanto custou a unidade nessa remessa */
  custoUnit: number | null;
  /** frete da remessa inteira, rateado no custo da unidade */
  freteRateado: number;
  vendaId: string | null;
  observacao: string | null;
  data: string;
}

export type CanalVenda =
  | 'trafego_pago' | 'instagram' | 'indicacao' | 'whatsapp' | 'presencial' | 'recompra';

export const CANAIS_VENDA: { id: CanalVenda; label: string }[] = [
  { id: 'trafego_pago', label: 'Tráfego pago' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'indicacao', label: 'Indicação' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'presencial', label: 'Presencial' },
  { id: 'recompra', label: 'Recompra' },
];

export type StatusEntrega = 'pendente' | 'entregue';
export type StatusPagamento = 'aberto' | 'parcial' | 'pago';

export interface Pagamento {
  id: string;
  vendaId: string;
  data: string;
  valor: number;
  forma: FormaPagamento;
}

/**
 * Raquete usada recebida como parte do pagamento.
 *
 * O crédito NÃO é desconto: é troca de caixa por ativo. Entra menos dinheiro,
 * mas a loja ganha uma raquete de seminovas que vale aproximadamente o crédito.
 * Tratar como desconto faria a margem parecer menor do que é.
 */
export interface TradeIn {
  modelo: string;
  valorCredito: number;
  recebida: boolean;
}

export interface Venda {
  id: string;
  data: string; // ISO yyyy-mm-dd
  produtoId: string;
  vendedorId: string;
  quantidade: number;
  precoUnit: number;
  custoUnit: number;
  formaPagamento: FormaPagamento;
  parcelas: number;
  /** snapshot da comissão do vendedor na data — mudar a taxa não reescreve o passado */
  comissaoPct: number;
  /**
   * A taxa da maquininha NAQUELE dia, congelada.
   *
   * Existia só no banco e faltava aqui: a aplicação consultava a tabela de
   * formas de pagamento a cada leitura, então bastava a maquininha mudar de
   * preço para toda a margem histórica mudar junto. O erro apareceu na
   * conferência contra o banco — R$1.150,08 na tela contra R$962,35 no banco,
   * sobre as mesmas 58 vendas.
   */
  taxaPct: number;
  entrega: StatusEntrega;
  clienteNome?: string;
  clienteFone?: string;
  cidade?: string;
  canal?: CanalVenda;
  /**
   * A campanha que gerou ESTA compra, congelada na venda.
   *
   * Diferente da campanha de ORIGEM do cliente, que é quem o trouxe pela
   * primeira vez. Em novembro, quem veio do anúncio de verão volta pelo de
   * Natal: a venda é do Natal, a origem continua sendo o verão.
   */
  campanhaId?: string | null;
  tradeIn?: TradeIn;
  observacoes?: string;
}

/** Venda já resolvida com produto, vendedor e pagamentos — o que as telas consomem. */
export interface VendaCompleta extends Venda {
  produto: Produto;
  vendedor: Vendedor;
  receita: number;
  custo: number;
  taxa: number;
  margem: number;
  margemPct: number;

  pagamentos: Pagamento[];
  creditoTradeIn: number;
  /** o que o cliente precisa pagar em dinheiro: receita − crédito do trade-in */
  aReceber: number;
  recebido: number;
  emAberto: number;
  statusPagamento: StatusPagamento;
  /** comissão incide sobre o RECEBIDO, não sobre o contratado */
  comissao: number;
}

export type TipoMovimento = 'entrada' | 'saida';

export interface Despesa {
  id: string;
  data: string;
  descricao: string;
  categoria: 'aluguel' | 'folha' | 'fornecedores' | 'marketing' | 'operacional' | 'impostos';
  valor: number;
  recorrente: boolean;
  /**
   * Quando veio do modelo de custo fixo. Linha assim NÃO se edita aqui — se
   * editasse, o modelo e o lançamento passariam a discordar e ninguém saberia
   * qual dos dois manda. Alterar é lá, no modelo.
   */
  custoFixoId?: string | null;
}

export interface MovimentoCaixa {
  id: string;
  data: string;
  descricao: string;
  tipo: TipoMovimento;
  categoria: string;
  valor: number;
}

export type StatusConta = 'paga' | 'pendente' | 'vencida';

export interface Conta {
  id: string;
  tipo: 'pagar' | 'receber';
  descricao: string;
  contraparte: string;
  valor: number;
  vencimento: string;
  /**
   * A data em que foi paga, ou nulo. É ESTE o dado guardado.
   *
   * `status` abaixo é DERIVADO, nunca gravado — status guardado envelhece: uma
   * conta salva como "pendente" continua "pendente" depois de vencida e
   * ninguém percebe. Mesma regra da view `v_conta` no banco.
   */
  pagoEm: string | null;
  status: StatusConta;
}

export interface Periodo {
  de: Date;
  ate: Date;
}

export type Papel = 'admin' | 'vendedor';

/* ---------- agregados devolvidos pela camada de dados ---------- */

export interface ResumoPeriodo {
  faturamento: number;
  custoMercadoria: number;
  taxas: number;
  lucroBruto: number;
  despesas: number;
  /** comissão do período — sai do lucro, e é rastreada por venda, não em despesa */
  comissao: number;
  lucroLiquido: number;
  ticketMedio: number;
  numeroVendas: number;
  unidadesVendidas: number;
  /** contratado ≠ recebido: com parcelamento, a diferença é o que ainda vai entrar */
  recebido: number;
  emAberto: number;
  comissaoAPagar: number;
  creditoTradeIn: number;
  entregasPendentes: number;
}

export interface PontoSerie {
  data: string;
  faturamento: number;
  lucro: number;
}

/* ---------- campanhas e retorno de mídia ---------- */

export interface Campanha {
  id: string;
  nome: string;
  canal: 'meta' | 'google' | 'organico' | 'indicacao' | 'loja' | 'site' | 'outro';
  ativa: boolean;
  /** o id do ANÚNCIO na Meta. É o que o webhook entrega — não o da campanha. */
  metaAdId: string | null;
}

/** Quanto se gastou numa campanha, numa competência. */
export interface CustoMidia {
  campanhaId: string;
  mes: string;
  gasto: number;
}

/**
 * O retorno de uma campanha.
 *
 * É a pergunta que começou o projeto: onde o dinheiro de anúncio virou venda,
 * e onde só virou conversa.
 */
export interface RetornoCampanha {
  campanha: Campanha;
  mes: string;
  gasto: number;

  leads: number;
  vendas: number;
  receita: number;
  /** receita menos custo da mercadoria, taxa e comissão — antes da estrutura */
  contribuicao: number;

  /** gasto ÷ leads: o que custou fazer o telefone tocar */
  custoPorLead: number | null;
  /** gasto ÷ vendas: o que custou trazer um cliente que comprou */
  custoPorVenda: number | null;
  /** vendas ÷ leads, em % */
  conversao: number;
  /** receita ÷ gasto — o número que a Meta chama de ROAS */
  retorno: number | null;
  /**
   * contribuição − gasto. É o que sobra DEPOIS de pagar a mercadoria e o
   * anúncio, e é ele que decide manter ou cortar. ROAS alto com margem baixa
   * ainda dá prejuízo, e é o erro mais comum de quem olha só o ROAS.
   */
  sobra: number;
}

/* ---------- custo fixo e lucro por unidade ---------- */

/**
 * O MODELO de um custo fixo, não o lançamento.
 *
 * "Aluguel é R$3.400 por mês" é o modelo; "em agosto pagamos R$3.400" é o
 * lançamento, que vive em `despesa`. Separar os dois é o que permite reajustar
 * o aluguel em setembro sem reescrever agosto — o mesmo princípio de
 * `venda.taxa_pct`, que é congelada na venda.
 */
export interface CustoFixo {
  id: string;
  nome: string;
  categoria: 'aluguel' | 'folha' | 'operacional';
  valorMensal: number;
  ativo: boolean;
}

/**
 * A cascata do lucro por unidade, numa competência mensal.
 *
 * MENSAL, e não no período do filtro global: aluguel é cobrado por mês. Dividir
 * o aluguel de um mês pelas vendas de uma semana daria um número sem
 * significado nenhum — e pior, um número que parece preciso.
 */
export interface LucroUnitario {
  /** competência, '2026-08' */
  mes: string;
  categoria: Categoria;
  unidades: number;
  faturamentoCategoria: number;

  /* variáveis: acompanham cada unidade vendida */
  precoMedio: number;
  custoMedio: number;
  taxaMedia: number;
  comissaoMedia: number;
  impostoMedio: number;
  aliquotaSimples: number;

  /** o que cada unidade deixa antes de pagar a estrutura */
  margemContribuicao: number;
  margemContribuicaoPct: number;

  /* mídia: separada porque é a única linha que se controla no mês seguinte */
  midiaTotal: number;
  midiaPorUnidade: number;
  depoisDaMidia: number;

  /* estrutura: rateada pela fatia da categoria no faturamento */
  estruturaTotal: number;
  shareFaturamento: number;
  estruturaRateada: number;
  estruturaPorUnidade: number;

  /** a última linha */
  lucroUnitario: number;
  lucroUnitarioPct: number;

  /** quantas unidades pagam estrutura + mídia no mês */
  pontoEquilibrio: number;
  /** quanto falta (ou sobra) para chegar lá */
  faltamParaEquilibrio: number;

  /**
   * Mês ainda correndo.
   *
   * Importa porque o mês corrente tem as vendas de alguns dias e o custo fixo
   * de trinta. Comparado sem ajuste, todo mês parece um desastre até o dia 28 —
   * e aí ninguém mais abre a tela.
   */
  mesEmAndamento: boolean;
  diasDecorridos: number;
  diasDoMes: number;
}

export interface FatiaCategoria {
  categoria: Categoria;
  label: string;
  faturamento: number;
  margem: number;
  unidades: number;
}

export interface DesempenhoVendedor {
  vendedor: Vendedor;
  numeroVendas: number;
  faturamento: number;
  margem: number;
  ticketMedio: number;
  comissao: number;
  progressoMeta: number;
  posicao: number;
}

export interface FaixaSimples {
  faixa: number;
  ate: number;
  aliquotaNominal: number;
  parcelaDeduzir: number;
}

export interface EstimativaImposto {
  rbt12: number;
  faixa: FaixaSimples;
  proximaFaixa: FaixaSimples | null;
  aliquotaEfetiva: number;
  faturamentoMes: number;
  dasEstimado: number;
  faltaParaProximaFaixa: number | null;
}

/* ---------- meta da loja: ritmo, projeção e risco ---------- */

export interface MetaLoja {
  /** competência no formato "2026-08" */
  mes: string;
  receita: number;
}

export type NivelRisco = 'no_ritmo' | 'atencao' | 'alto';

export interface AcompanhamentoMeta {
  mes: string;
  meta: number;
  acumulado: number;
  restante: number;
  atingimento: number;

  diasNoMes: number;
  diasDecorridos: number;
  diasRestantes: number;
  /** dias distintos em que houve pelo menos uma venda */
  diasComVenda: number;

  ritmoAtual: number;
  ritmoNecessario: number;
  /** onde o mês fecha mantendo o ritmo atual */
  projecao: number;
  /** projeção ÷ meta */
  cobertura: number;
  /** quanto deveria ter vendido a esta altura do mês, em linha reta */
  esperadoHoje: number;
  /** acumulado − esperado. Negativo = atrasado. */
  gap: number;

  ticketMedio: number;
  vendasNoMes: number;
  vendasPorDiaNecessarias: number;

  risco: NivelRisco;
}

export interface PontoDia {
  data: string;
  faturamento: number;
  vendas: number;
  margem: number;
}

/* ---------- entidades vindas do CRM (Kommo) ---------- */
// Modeladas agora, alimentadas por mock, para que a troca pela API real
// não exija mexer em tela nenhuma. Ver src/data/kommo.ts.

export type StatusLead = 'aberto' | 'ganho' | 'perdido';

export interface Lead {
  id: string;
  criadoEm: string;
  nome: string;
  telefone: string;
  valor: number;
  status: StatusLead;
  pipelineId: string;
  estagioId: string;
  responsavelId: string;
  canal: string;
  tags: string[];
  motivoPerda?: string;
  fechadoEm?: string;
}

export interface EstagioPipeline {
  id: string;
  pipelineId: string;
  nome: string;
  ordem: number;
  leads: number;
  valor: number;
  ticketMedio: number;
  /** conversão em relação à etapa anterior */
  conversaoEtapa: number;
  percentualPipeline: number;
}

export interface Pipeline {
  id: string;
  nome: string;
  ativo: boolean;
  leads: number;
  valor: number;
  estagios: EstagioPipeline[];
}

export interface MotivoPerda {
  motivo: string;
  quantidade: number;
  /** receita que deixou de existir — mais importante que a contagem */
  valorPerdido: number;
  percentualQuantidade: number;
  percentualValor: number;
}

export interface GanhosPerdas {
  ganhos: number;
  perdidos: number;
  valorGanho: number;
  valorPerdido: number;
  winRate: number;
  /** dias entre criação do lead e fechamento */
  cicloMedioDias: number;
}

export interface OrigemLead {
  canal: string;
  leads: number;
  valor: number;
  ganhos: number;
  perdidos: number;
  winRate: number;
}

export interface ItemEstoque extends Produto {
  /** DERIVADO da soma dos movimentos — não existe como campo em `Produto` */
  estoque: number;
  margemUnit: number;
  margemPct: number;
  capitalParado: number;
  vendidos30d: number;
  giro: 'parado' | 'lento' | 'normal' | 'rapido';
  diasDeCobertura: number | null;
  abaixoDoMinimo: boolean;
}
