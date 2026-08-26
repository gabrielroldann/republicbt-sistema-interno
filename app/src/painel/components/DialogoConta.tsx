import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/field';
import { useAtualizarConta, useCriarConta } from '@/painel/data/hooks';
import { isoDia } from '@/lib/utils';
import type { Conta } from '@/painel/types';

/**
 * Lançar ou editar uma conta.
 *
 * Cinco campos, e nenhum a mais: descrição, quem, quanto, quando, e se é a
 * pagar ou a receber. Formulário longo é o que mata lançamento manual — o dono
 * está entre um cliente e outro e não preenche dez campos, então a conta não
 * entra e o fluxo de caixa passa a mentir.
 */
export function DialogoConta({
  aberto, conta, tipoPadrao, onFechar,
}: {
  aberto: boolean;
  /** nulo = criando */
  conta: Conta | null;
  tipoPadrao: 'pagar' | 'receber';
  onFechar: () => void;
}) {
  const criar = useCriarConta();
  const atualizar = useAtualizarConta();

  const [tipo, setTipo] = useState<'pagar' | 'receber'>(tipoPadrao);
  const [descricao, setDescricao] = useState('');
  const [contraparte, setContraparte] = useState('');
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState(isoDia(new Date()));
  const [erro, setErro] = useState<string | null>(null);

  // Reabrir com o texto da conta ANTERIOR seria editar a errada sem perceber.
  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setTipo(conta?.tipo ?? tipoPadrao);
    setDescricao(conta?.descricao ?? '');
    setContraparte(conta?.contraparte ?? '');
    setValor(conta ? String(conta.valor) : '');
    setVencimento(conta?.vencimento ?? isoDia(new Date()));
  }, [aberto, conta, tipoPadrao]);

  async function salvar() {
    setErro(null);
    const v = Number(valor.replace(/\./g, '').replace(',', '.'));
    const dados = { tipo, descricao, contraparte, valor: v, vencimento };
    try {
      if (conta) await atualizar.mutateAsync({ id: conta.id, ...dados });
      else await criar.mutateAsync(dados);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para salvar');
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogTitle>{conta ? 'Editar conta' : 'Nova conta'}</DialogTitle>
        <DialogDescription>
          {conta
            ? 'Alterar aqui muda o saldo previsto e o fluxo de caixa.'
            : 'Entra no saldo previsto e no fluxo de caixa assim que salvar.'}
        </DialogDescription>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => { e.preventDefault(); void salvar(); }}
        >
          <Campo rotulo="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as 'pagar' | 'receber')}>
              <option value="pagar">A pagar</option>
              <option value="receber">A receber</option>
            </Select>
          </Campo>

          <Campo rotulo="Descrição">
            <Input
              value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Nota fiscal 4821 — lote de raquetes" autoFocus
            />
          </Campo>

          <Campo rotulo={tipo === 'pagar' ? 'Para quem' : 'De quem'}>
            <Input
              value={contraparte} onChange={(e) => setContraparte(e.target.value)}
              placeholder={tipo === 'pagar' ? 'Drop Shot Brasil' : 'Juliana Freitas'}
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor">
              <Input
                value={valor} onChange={(e) => setValor(e.target.value)}
                inputMode="decimal" placeholder="0,00" className="tabular-nums"
              />
            </Campo>
            <Campo rotulo="Vencimento">
              <Input
                type="date" value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                className="tabular-nums"
              />
            </Campo>
          </div>

          {erro && (
            <p className="rounded-md border border-negative-line bg-negative-soft px-3 py-2 text-caption text-negative">
              {erro}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={criar.isPending || atualizar.isPending}>
              {conta ? 'Salvar' : 'Lançar conta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Campo = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-label uppercase text-faint">{rotulo}</label>
    {children}
  </div>
);
