import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Loader2, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select, Campo } from '@/components/ui/field';
import { gravando } from '@/painel/data/escritas';
import { criarLinkPagamento } from '@/painel/data/linkPagamento';
import { useEstoque } from '@/painel/data/hooks';
import { fmtBRL } from '@/lib/utils';

/**
 * GERAR LINK DE PAGAMENTO (CIELO) PRA MANDAR PELO WHATSAPP.
 *
 * Só produto + quantidade por enquanto — um item por link. A Edge Function
 * já aceita vários itens (`itens: []`), então dá pra virar um carrinho de
 * verdade depois sem mexer no back-end; a tela é que ficou simples de
 * propósito pro caso mais comum (uma raquete, um cliente, um link).
 *
 * A venda só nasce quando a Cielo confirmar o pagamento (webhook do outro
 * lado) — aqui só cria o link. Por isso não tem cálculo de margem/comissão
 * nesta tela: isso só existe depois que vira venda de verdade.
 */
export default function LinkPagamento() {
  const navigate = useNavigate();
  const { data: produtos } = useEstoque();

  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<
    | { ok: true; linkUrl: string }
    | { ok: true; linkUrl: null; aviso: string }
    | { ok: false; mensagem: string }
    | null
  >(null);
  const [copiado, setCopiado] = useState(false);

  const produto = produtos?.find((p) => p.id === produtoId);
  const valorTotal = (produto?.preco ?? 0) * quantidade;

  async function gerar() {
    if (!produtoId) return;
    setCopiado(false);
    setResultado(null);
    setCarregando(true);

    if (!gravando()) {
      // Modo demonstração: não existe Edge Function pra chamar de verdade.
      setResultado({ ok: false, mensagem: 'Modo demonstração — não gera link de verdade aqui.' });
      setCarregando(false);
      return;
    }

    try {
      const r = await criarLinkPagamento([{ produtoId, quantidade }]);
      if (r.linkUrl) {
        setResultado({ ok: true, linkUrl: r.linkUrl });
      } else {
        setResultado({
          ok: false,
          mensagem: r.aviso ?? r.error ?? 'A Cielo não retornou a URL do link — confira os logs da função.',
        });
      }
    } catch (e) {
      setResultado({ ok: false, mensagem: e instanceof Error ? e.message : 'Falha ao criar o link.' });
    } finally {
      setCarregando(false);
    }
  }

  function copiar(url: string) {
    navigator.clipboard?.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="stagger space-y-4 pb-10">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="iconSm" onClick={() => navigate('/painel/vendas')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted">
          Gera um link de pagamento Cielo. Quando o cliente pagar, a venda e a nota fiscal saem sozinhas.
        </span>
      </div>

      <Dialog open={carregando || !!resultado} onOpenChange={(open) => { if (!open) setResultado(null); }}>
        <DialogContent showClose={!carregando} className="text-center">
          {carregando ? (
            <div className="flex flex-col items-center gap-3 py-3">
              <Loader2 className="h-8 w-8 animate-spin text-gold-400" />
              <DialogTitle>Gerando o link…</DialogTitle>
              <DialogDescription>Não feche esta janela até terminar.</DialogDescription>
            </div>
          ) : resultado?.ok && resultado.linkUrl ? (
            <div className="flex flex-col items-center gap-3 py-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-positive-soft text-positive">
                <Check className="h-6 w-6" />
              </div>
              <DialogTitle>Link gerado</DialogTitle>
              <p className="break-all rounded bg-elev px-3 py-2 font-mono text-2xs text-ink-2">
                {resultado.linkUrl}
              </p>
              <div className="flex w-full gap-2">
                <Button variant="outline" className="flex-1" onClick={() => copiar(resultado.linkUrl!)}>
                  <Copy className="h-3.5 w-3.5" /> {copiado ? 'Copiado!' : 'Copiar'}
                </Button>
                <Button asChild className="flex-1">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(resultado.linkUrl!)}`}
                    target="_blank" rel="noreferrer"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </Button>
              </div>
              <Button variant="ghost" className="mt-1 w-full" onClick={() => setResultado(null)}>Fechar</Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-1">
              <DialogTitle>Não consegui gerar o link</DialogTitle>
              <DialogDescription>
                {resultado && !resultado.ok ? resultado.mensagem : 'Falha desconhecida.'}
              </DialogDescription>
              <Button variant="outline" className="mt-1 w-full" onClick={() => setResultado(null)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <div className="border-b border-line-soft px-5 py-2.5">
          <span className="text-sm font-semibold text-ink">Produto</span>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Item *" className="lg:col-span-2">
            <Select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
              <option value="">Selecione</option>
              {(produtos ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} — {p.marca} · saldo {p.estoque}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Quantidade">
            <Input
              type="number" min={1} value={quantidade}
              onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 1))}
            />
          </Campo>
          <Campo label="Valor do link" hint={produto ? `tabela ${fmtBRL(produto.preco)}` : undefined}>
            <Input value={fmtBRL(valorTotal)} disabled />
          </Campo>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={gerar} disabled={!produtoId || carregando}>
          Gerar link de pagamento
        </Button>
      </div>
    </div>
  );
}
