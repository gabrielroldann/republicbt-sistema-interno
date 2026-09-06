import { create } from 'zustand';
import { MOCK, supabase } from '@/lib/supabase';
import { carregar } from '@/painel/data/fonte';
import { useFiltros } from '@/painel/store/filtros';
import type { Papel } from '@/painel/types';

/**
 * QUEM ESTÁ USANDO O SISTEMA — uma sessão para os dois.
 *
 * É a razão principal de fundir os dois apps. Antes eram duas sessões
 * separadas: cada um lia o token do Supabase da sua própria origem, e trocar de
 * sistema significava entrar de novo.
 *
 * O QUE ESTA STORE **NÃO** É: controle de acesso. Ela decide o que a tela
 * oferece, para não mostrar caminho que o banco vai negar. Quem manda é o RLS —
 * esconder o Painel do vendedor é conveniência, não segurança. Se ele digitar
 * /painel na URL, o gate o manda de volta; e mesmo que não mandasse, o banco
 * devolveria vazio em tudo que é dinheiro.
 */
export type Area = 'painel' | 'crm';

/**
 * O papel como o BANCO guarda (`vendedor.papel`), com os três valores reais.
 * Diferente de `Papel` (em `@/painel/types`), que já vem colapsado para o
 * painel financeiro tratar admin e sócio como a mesma coisa — aqui, no CRM,
 * a distinção entre admin e sócio importa (ex.: quem pode excluir conversa).
 */
export type PapelBanco = 'admin' | 'socio' | 'vendedor';

/** Papel do banco: 'admin' e 'socio' veem os dois; 'vendedor' só o CRM. */
export function areasDoPapel(papel: string): Area[] {
  return papel === 'vendedor' ? ['crm'] : ['painel', 'crm'];
}

const CHAVE_ULTIMA_AREA = 'republicbt:area';

interface Sessao {
  /** `null` = ainda não sei. Evita piscar o login em quem já está dentro. */
  autenticado: boolean | null;
  carregando: boolean;
  /** entrou no Supabase mas não há linha de vendedor ligada a ele */
  semCadastro: boolean;
  erroCarga: string | null;

  vendedorId: string;
  nome: string;
  papel: PapelBanco;
  /** capacidades soltas além do papel fixo — ver migração `vendedor_usuario_e_permissoes` */
  permissoes: Record<string, boolean>;
  areas: Area[];

  iniciar: () => void;
  sair: () => Promise<void>;
  lembrarArea: (a: Area) => void;
  areaInicial: () => Area;
}

export const useSessao = create<Sessao>((set, get) => ({
  autenticado: MOCK ? true : null,
  carregando: !MOCK,
  semCadastro: false,
  erroCarga: null,

  /**
   * EM DEMONSTRAÇÃO A SESSÃO JÁ NASCE COM UM VENDEDOR.
   *
   * Quando eram dois apps, o CRM tinha a própria sessão e ela começava em 'v1';
   * ao juntar, esta store passou a valer pelos dois e eu a deixei começar vazia,
   * o que fazia sentido só para o lado do banco.
   *
   * O efeito, que o teste da caixa de entrada pegou: sem vendedor, o CRM não
   * achava o número dele nem o NOME, e a apresentação saía do jeito que iria
   * para o cliente — "Oi João, aqui é o , especialista em raquetes da Republic
   * BT". Um campo vazio no meio de uma frase não parece bug, parece descuido da
   * loja.
   *
   * Com banco ligado nada disto vale: `iniciar()` sobrescreve tudo com a linha
   * de `vendedor` do usuário autenticado.
   */
  vendedorId: MOCK ? 'v1' : '',
  nome: MOCK ? 'Gabriel Roldan' : '',
  papel: 'admin',
  permissoes: {},
  areas: ['painel', 'crm'],

  /**
   * Liga a sessão ao Supabase e carrega os dados do painel ANTES de liberar.
   *
   * A ordem importa: se a tela abrisse antes da carga, todo indicador mostraria
   * zero por um instante — e zero em faturamento não parece "carregando",
   * parece "a loja não vendeu nada".
   */
  iniciar: () => {
    if (MOCK) return;

    const aplicar = async (uid: string | null) => {
      if (!uid) {
        set({ autenticado: false, carregando: false, semCadastro: false });
        return;
      }

      const { data } = await supabase
        .from('vendedor')
        .select('id, nome, papel, iniciais, meta_mensal, comissao_pct, permissoes')
        .eq('auth_user_id', uid).maybeSingle();

      if (!data) {
        set({ autenticado: true, carregando: false, semCadastro: true });
        return;
      }

      const papel = data.papel as PapelBanco;

      // O painel financeiro tem seu próprio filtro de papel, herdado de quando
      // era um app sozinho. Mantido em sincronia aqui para não existirem duas
      // fontes de verdade sobre quem é quem.
      useFiltros.setState({
        papel: (papel === 'vendedor' ? 'vendedor' : 'admin') as Papel,
        vendedorLogado: {
          id: data.id, nome: data.nome, iniciais: data.iniciais,
          metaMensal: Number(data.meta_mensal ?? 0),
          comissaoPct: Number(data.comissao_pct ?? 0), ativo: true,
        },
      });

      const base = {
        autenticado: true, carregando: false, semCadastro: false,
        vendedorId: data.id, nome: data.nome, papel,
        permissoes: (data.permissoes as Record<string, boolean>) ?? {},
        areas: areasDoPapel(papel),
      };

      try {
        await carregar();
        set({ ...base, erroCarga: null });
      } catch (e) {
        // Falha de carga NÃO pode virar painel zerado: zero em faturamento
        // parece resultado, não erro.
        set({ ...base, erroCarga: e instanceof Error ? e.message : 'não deu para carregar' });
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      void aplicar(data.session?.user.id ?? null);
    });
    supabase.auth.onAuthStateChange((_e, sessao) => {
      void aplicar(sessao?.user.id ?? null);
    });
  },

  sair: async () => {
    if (!MOCK) await supabase.auth.signOut();
    set({ autenticado: false });
  },

  lembrarArea: (a) => {
    try { localStorage.setItem(CHAVE_ULTIMA_AREA, a); } catch { /* sem persistência */ }
  },

  /**
   * Onde a pessoa cai ao entrar.
   *
   * Vendedor vai direto para o CRM — é o único sistema dele, e uma tela de
   * escolha com uma opção só é pedágio. Sócio volta para onde estava, porque
   * quem passa o dia no painel não quer escolher de novo toda manhã.
   */
  areaInicial: () => {
    const { areas } = get();
    if (areas.length === 1) return areas[0];
    try {
      const salva = localStorage.getItem(CHAVE_ULTIMA_AREA) as Area | null;
      if (salva && areas.includes(salva)) return salva;
    } catch { /* ignora */ }
    return 'painel';
  },
}));
