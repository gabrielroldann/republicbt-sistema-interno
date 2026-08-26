/**
 * Os formatos de entrada da camada de dados.
 *
 * Ficam num arquivo próprio porque os dois lados — mock e Supabase — precisam
 * deles, e se morassem em um dos dois haveria import circular.
 */

export interface FiltrosFunil {
  responsavelId?: string;
  campanhaId?: string;
  busca?: string;
}

export interface FiltrosCaixa {
  /** 'loja' = a caixa geral; 'vendedor' = as conversas dos números pessoais */
  canalTipo?: 'loja' | 'vendedor';
  /** quem está olhando — no banco quem decide é o RLS; isto é só espelho */
  papel: 'admin' | 'socio' | 'vendedor';
  vendedorId: string;
  /** só as sem dono: a fila que precisa de distribuição */
  semDono?: boolean;
  busca?: string;
}

export interface AtualizarLeadInput {
  titulo?: string | null;
  valor?: number | null;
  responsavelId?: string | null;
  clienteNome?: string | null;
}
