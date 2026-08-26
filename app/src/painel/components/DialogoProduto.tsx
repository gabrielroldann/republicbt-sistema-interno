import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/field';
import { useAtualizarProduto, useCriarProduto } from '@/painel/data/hooks';
import { fmtBRL, fmtPct } from '@/lib/utils';
import { CATEGORIAS, type Categoria, type ItemEstoque } from '@/painel/types';

/**
 * Cadastrar ou editar produto.
 *
 * A margem aparece embaixo dos campos, calculada enquanto se digita. É a única
 * pergunta que importa na hora de precificar, e deixá-la para o dono fazer de
 * cabeça é o caminho mais curto para uma raquete cadastrada com 8% de margem
 * sem ninguém notar.
 */
export function DialogoProduto({
  aberto, produto, onFechar,
}: { aberto: boolean; produto: ItemEstoque | null; onFechar: () => void }) {
  const criar = useCriarProduto();
  const atualizar = useAtualizarProduto();

  const [sku, setSku] = useState('');
  const [nome, setNome] = useState('');
  const [marca, setMarca] = useState('');
  const [categoria, setCategoria] = useState<Categoria>('raquetes');
  const [custo, setCusto] = useState('');
  const [preco, setPreco] = useState('');
  const [estoqueMin, setEstoqueMin] = useState('3');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setSku(produto?.sku ?? '');
    setNome(produto?.nome ?? '');
    setMarca(produto?.marca ?? '');
    setCategoria(produto?.categoria ?? 'raquetes');
    setCusto(produto ? String(produto.custo) : '');
    setPreco(produto ? String(produto.preco) : '');
    setEstoqueMin(produto ? String(produto.estoqueMin) : '3');
  }, [aberto, produto]);

  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
  const c = num(custo);
  const p = num(preco);
  const margemOk = Number.isFinite(c) && Number.isFinite(p) && p > 0;
  const margemPct = margemOk ? ((p - c) / p) * 100 : 0;

  async function salvar() {
    setErro(null);
    const dados = {
      sku, nome, marca, categoria,
      custo: c, preco: p, estoqueMin: Math.max(Math.trunc(num(estoqueMin)) || 0, 0),
    };
    try {
      if (produto) await atualizar.mutateAsync({ id: produto.id, ...dados });
      else await criar.mutateAsync(dados);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para salvar');
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{produto ? 'Editar produto' : 'Novo produto'}</DialogTitle>
        <DialogDescription>
          {produto
            ? 'Mudar o preço aqui NÃO reescreve o que já foi vendido — cada venda congelou preço e custo na hora.'
            : 'O custo aqui é o inicial. A partir da primeira entrada de mercadoria ele passa a ser a média ponderada.'}
        </DialogDescription>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => { e.preventDefault(); void salvar(); }}
        >
          <div className="grid grid-cols-[1fr_1.6fr] gap-3">
            <Campo rotulo="SKU">
              <Input value={sku} onChange={(e) => setSku(e.target.value)}
                     placeholder="RAQ-NOX-ML10" className="uppercase" autoFocus />
            </Campo>
            <Campo rotulo="Nome">
              <Input value={nome} onChange={(e) => setNome(e.target.value)}
                     placeholder="Nox ML10 Pro Cup" />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Marca">
              <Input value={marca} onChange={(e) => setMarca(e.target.value)}
                     placeholder="Nox" />
            </Campo>
            <Campo rotulo="Categoria">
              <Select value={categoria}
                      onChange={(e) => setCategoria(e.target.value as Categoria)}>
                {CATEGORIAS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </Select>
            </Campo>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Campo rotulo="Custo">
              <Input value={custo} onChange={(e) => setCusto(e.target.value)}
                     inputMode="decimal" placeholder="430" className="tabular-nums" />
            </Campo>
            <Campo rotulo="Preço de venda">
              <Input value={preco} onChange={(e) => setPreco(e.target.value)}
                     inputMode="decimal" placeholder="700" className="tabular-nums" />
            </Campo>
            <Campo rotulo="Estoque mínimo">
              <Input value={estoqueMin} onChange={(e) => setEstoqueMin(e.target.value)}
                     inputMode="numeric" className="tabular-nums" />
            </Campo>
          </div>

          {/* A margem calculada na hora — a pergunta que importa ao precificar. */}
          {margemOk && (
            <div
              data-margem={margemPct.toFixed(2)}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-caption ${
                margemPct < 15
                  ? 'border-negative-line bg-negative-soft'
                  : margemPct < 25
                    ? 'border-attention-line bg-attention-soft'
                    : 'border-line bg-elev'
              }`}
            >
              <span className="text-muted">
                Margem bruta
                {margemPct < 15 && ' — muito baixa para cobrir taxa, comissão e imposto'}
              </span>
              <span className="tabular-nums font-semibold text-ink">
                {fmtPct(margemPct)} · {fmtBRL(p - c)}
              </span>
            </div>
          )}

          {erro && (
            <p className="rounded-md border border-negative-line bg-negative-soft px-3 py-2 text-caption text-negative">
              {erro}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={criar.isPending || atualizar.isPending}>
              {produto ? 'Salvar' : 'Cadastrar'}
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
