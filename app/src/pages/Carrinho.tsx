import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard, Loader2, LogOut, Minus, Plus, RefreshCw, Search, ShoppingCart, Trash2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useEstoque } from '@/painel/data/hooks';
import { useSessao } from '@/store/sessao';
import { fmtBRL } from '@/lib/utils';
import { CATEGORIAS, type Categoria } from '@/painel/types';
import {
  adicionarItem, cancelarCarrinho, definirQuantidade,
  enviarParaMaquininha, esvaziarCarrinho, getOuCriarCarrinhoAberto, removerItem,
  simularPagamento, verificarPagamento, type Carrinho as TCarrinho,
} from '@/painel/data/carrinho';

/**
 * A TELA DE CARRINHO — pensada para o celular do vendedor, na loja.
 *
 * Fluxo: monta o carrinho tocando nos produtos → "Enviar para a maquininha"
 * cria o pedido no Sandbox da Cielo → o vendedor passa o cartão na maquininha
 * de verdade → aperta "Verificar pagamento" (não há webhook da Cielo
 * registrado, então é toque, não automático) → se pago, a venda é gravada
 * sozinha, com comissão e tudo.
 *
 * Fica FORA do Shell do painel (sem menu lateral): esta tela é para caber na
 * tela de um celular, instalada como atalho (ver `public/manifest.json`).
 */
export default function Carrinho() {
  const { vendedorId, nome, sair } = useSessao();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<Categoria | 'todas'>('todas');
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const { data: produtos } = useEstoque();

  const carrinhoQuery = useQuery({
    queryKey: ['carrinho-aberto', vendedorId],
    queryFn: () => getOuCriarCarrinhoAberto(vendedorId),
    enabled: !!vendedorId,
    staleTime: 0,
  });

  const carrinho = carrinhoQuery.data;
  const chaveCarrinho = ['carrinho-aberto', vendedorId] as const;
  const invalidar = () => qc.invalidateQueries({ queryKey: chaveCarrinho });

  /**
   * ATUALIZAÇÃO OTIMISTA — por que o toque precisa parecer instantâneo.
   *
   * Antes, cada clique esperava a gravação no Supabase E uma releitura do
   * carrinho inteiro antes de mudar qualquer coisa na tela — 3 a 4 idas e
   * voltas de rede em sequência, meio segundo a mais de "nada acontece" no
   * wifi da loja.
   *
   * Aqui a tela muda na hora, como se já tivesse dado certo, e a gravação
   * roda por trás. Se falhar, `onError` devolve o carrinho para como estava
   * — o vendedor vê o erro em vez de um carrinho mentiroso.
   */
  function otimista(atualizar: (c: TCarrinho) => TCarrinho) {
    return async () => {
      await qc.cancelQueries({ queryKey: chaveCarrinho });
      const anterior = qc.getQueryData<TCarrinho>(chaveCarrinho);
      if (anterior) qc.setQueryData(chaveCarrinho, atualizar(anterior));
      return { anterior };
    };
  }
  function reverter(ctx?: { anterior?: TCarrinho }) {
    if (ctx?.anterior) qc.setQueryData(chaveCarrinho, ctx.anterior);
  }

  const mAdicionar = useMutation({
    mutationFn: ({ produtoId, preco }: { produtoId: string; preco: number }) =>
      adicionarItem(carrinho!.id, produtoId, preco),
    onMutate: ({ produtoId, preco }) => otimista((c) => {
      const existe = c.itens.find((i) => i.produtoId === produtoId);
      if (existe) {
        return { ...c, itens: c.itens.map((i) =>
          i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + 1 } : i) };
      }
      const produto = produtos?.find((p) => p.id === produtoId);
      return { ...c, itens: [...c.itens, {
        id: `tmp-${produtoId}`, produtoId, preco,
        sku: produto?.sku ?? '', nome: produto?.nome ?? '', quantidade: 1, precoUnit: preco,
      }] };
    })(),
    onError: (e, _v, ctx) => { reverter(ctx); setErro(e instanceof Error ? e.message : 'não deu para adicionar'); },
    onSettled: invalidar,
  });

  const mQuantidade = useMutation({
    mutationFn: ({ itemId, q }: { itemId: string; q: number }) => definirQuantidade(itemId, q),
    onMutate: ({ itemId, q }) => otimista((c) => ({
      ...c,
      itens: q <= 0
        ? c.itens.filter((i) => i.id !== itemId)
        : c.itens.map((i) => (i.id === itemId ? { ...i, quantidade: q } : i)),
    }))(),
    onError: (e, _v, ctx) => { reverter(ctx); setErro(e instanceof Error ? e.message : 'não deu para atualizar'); },
    onSettled: invalidar,
  });

  const mRemover = useMutation({
    mutationFn: (itemId: string) => removerItem(itemId),
    onMutate: (itemId) => otimista((c) => ({ ...c, itens: c.itens.filter((i) => i.id !== itemId) }))(),
    onError: (e, _v, ctx) => { reverter(ctx); setErro(e instanceof Error ? e.message : 'não deu para remover'); },
    onSettled: invalidar,
  });

  const mEnviar = useMutation({
    mutationFn: () => enviarParaMaquininha(carrinho!.id),
    onSuccess: invalidar,
    onError: (e) => setErro(e instanceof Error ? e.message : 'não deu para enviar para a maquininha'),
  });

  const mCancelar = useMutation({
    mutationFn: () => cancelarCarrinho(carrinho!.id),
    onSuccess: invalidar,
    onError: (e) => setErro(e instanceof Error ? e.message : 'não deu para cancelar'),
  });

  // Só existe pra testar sem maquininha física — some quando a produção da
  // Cielo estiver ligada (ver painel/data/carrinho.ts).
  const mSimular = useMutation({
    mutationFn: () => simularPagamento(carrinho!.id),
    onSuccess: () => { invalidar(); void verificar(); },
    onError: (e) => setErro(e instanceof Error ? e.message : 'não deu para simular o pagamento'),
  });

  const mEsvaziar = useMutation({
    mutationFn: () => esvaziarCarrinho(carrinho!.id),
    onMutate: () => otimista((c) => ({ ...c, itens: [] }))(),
    onError: (e, _v, ctx) => { reverter(ctx); setErro(e instanceof Error ? e.message : 'não deu para esvaziar'); },
    onSettled: invalidar,
  });

  const [ultimoResultado, setUltimoResultado] = useState<
    { ok: true; vendaIds: string[] } | { ok: false; status?: string } | null
  >(null);

  async function verificar() {
    if (!carrinho) return;
    setErro(null);
    setConfirmando(true);
    try {
      const r = await verificarPagamento(carrinho.id);
      if (r.ok) setUltimoResultado({ ok: true, vendaIds: r.vendaIds ?? [] });
      else setUltimoResultado({ ok: false, status: r.status });
      invalidar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para verificar o pagamento');
    } finally {
      setConfirmando(false);
    }
  }

  const total = useMemo(
    () => (carrinho?.itens ?? []).reduce((s, i) => s + i.precoUnit * i.quantidade, 0),
    [carrinho],
  );
  const totalItens = useMemo(
    () => (carrinho?.itens ?? []).reduce((s, i) => s + i.quantidade, 0),
    [carrinho],
  );

  // Sem estoque continua na lista (o vendedor pode estar de olho numa reposição
  // chegando) mas afunda para o fim e entra "apagado" — em vez de sumir, o que
  // faria parecer que a loja nunca teve aquele produto.
  const catalogo = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (produtos ?? [])
      .filter((p) => {
        if (categoria !== 'todas' && p.categoria !== categoria) return false;
        if (!b) return true;
        return p.nome.toLowerCase().includes(b) || p.sku.toLowerCase().includes(b);
      })
      .sort((a, b2) => (b2.estoque > 0 ? 1 : 0) - (a.estoque > 0 ? 1 : 0));
  }, [produtos, busca, categoria]);

  const qtdNoCarrinho = (produtoId: string) =>
    carrinho?.itens.find((i) => i.produtoId === produtoId)?.quantidade ?? 0;

  if (!carrinho) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  // TELA DE SUCESSO — depois de confirmar o pagamento, some com o carrinho e
  // deixa só o "montar outro" à vista. Voltar para a tela de produtos com o
  // carrinho ainda cheio faria fácil vender a mesma raquete duas vezes.
  if (ultimoResultado?.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-400 text-ongold">
          <CreditCard className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold text-ink">Venda registrada</h1>
        <p className="text-caption text-muted">
          {ultimoResultado.vendaIds.length} {ultimoResultado.vendaIds.length === 1 ? 'item lançado' : 'itens lançados'} com a comissão calculada.
        </p>
        <Button onClick={() => { setUltimoResultado(null); invalidar(); }}>
          Montar outro carrinho
        </Button>
      </div>
    );
  }

  const enviando = carrinho.status === 'enviado_para_maquininha';

  return (
    <div className="flex min-h-screen flex-col bg-app pb-28">
      {/* cabeçalho */}
      <header className="sticky top-0 z-10 border-b border-line bg-app/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-ink">Carrinho</p>
            <p className="text-2xs text-faint">{nome}</p>
          </div>
          <button onClick={() => void sair()} className="text-faint hover:text-muted" aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {erro && (
        <div className="mx-4 mt-3 flex items-start justify-between gap-2 rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-xs text-negative">
          <span>{erro}</span>
          <button onClick={() => setErro(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* carrinho atual */}
      {carrinho.itens.length > 0 && (
        <section className="mx-4 mt-3 rounded-md border border-line bg-elev">
          <div className="flex items-center justify-between border-b border-line-soft px-3.5 py-2">
            <p className="text-2xs font-semibold uppercase tracking-wide text-faint">
              {totalItens} {totalItens === 1 ? 'item' : 'itens'}
            </p>
            {!enviando && (
              <button
                onClick={() => mEsvaziar.mutate()}
                className="text-2xs text-faint hover:text-negative"
              >
                esvaziar
              </button>
            )}
          </div>
          <ul className="divide-y divide-line-soft">
            {carrinho.itens.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-ink">{item.nome}</p>
                  <p className="text-2xs text-faint">{fmtBRL(item.precoUnit)} un.</p>
                </div>
                {!enviando ? (
                  <div className="flex items-center gap-1.5">
                    <Button size="iconSm" variant="outline"
                      onClick={() => mQuantidade.mutate({ itemId: item.id, q: item.quantidade - 1 })}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-5 text-center text-body text-ink">{item.quantidade}</span>
                    <Button size="iconSm" variant="outline"
                      onClick={() => mQuantidade.mutate({ itemId: item.id, q: item.quantidade + 1 })}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="iconSm" variant="ghost"
                      onClick={() => mRemover.mutate(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-body text-ink">×{item.quantidade}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {enviando ? (
        <section className="mx-4 mt-4 flex flex-col items-center gap-3 rounded-md border border-gold-400/40 bg-gold-400/10 px-4 py-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold-300" />
          <div>
            <p className="text-body font-semibold text-ink">Aguardando o pagamento</p>
            <p className="mt-1 text-caption text-muted">
              Passe o cartão na maquininha e depois toque em verificar.
            </p>
          </div>
          <div className="flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={() => mCancelar.mutate()}>
              Cancelar pedido
            </Button>
            <Button className="flex-1" onClick={verificar} disabled={confirmando}>
              {confirmando
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              Verificar pagamento
            </Button>
          </div>
          {ultimoResultado && ultimoResultado.ok === false && (
            <p className="text-caption text-faint">
              Ainda não caiu{ultimoResultado.status ? ` (status: ${ultimoResultado.status})` : ''}. Tente de novo em alguns segundos.
            </p>
          )}

          {/*
            SÓ PRA TESTE — sem maquininha física, nada paga esse pedido
            sozinho. Simula o pagamento no Sandbox (a própria Cielo documenta
            esse endpoint só pra isso) e já confere na sequência.
          */}
          <div className="mt-1 w-full border-t border-line-soft pt-3">
            <button
              onClick={() => mSimular.mutate()}
              disabled={mSimular.isPending || confirmando}
              className="w-full text-center text-caption text-faint underline decoration-dotted hover:text-muted disabled:opacity-50"
            >
              {mSimular.isPending ? 'Simulando pagamento…' : 'Simular pagamento (Sandbox, sem maquininha)'}
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* busca e categorias */}
          <div className="mx-4 mt-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar produto ou SKU"
                className="pl-8"
              />
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              <ChipCategoria ativo={categoria === 'todas'} onClick={() => setCategoria('todas')}>
                Todas
              </ChipCategoria>
              {CATEGORIAS.map((c) => (
                <ChipCategoria key={c.id} ativo={categoria === c.id} onClick={() => setCategoria(c.id)}>
                  {c.label}
                </ChipCategoria>
              ))}
            </div>
          </div>

          {/* catálogo */}
          <div className="mx-4 mt-3 grid grid-cols-2 gap-2.5">
            {catalogo.map((p) => {
              const qtd = qtdNoCarrinho(p.id);
              const semEstoque = p.estoque <= 0;
              return (
                <div
                  key={p.id}
                  className={
                    'flex flex-col rounded-md border border-line bg-elev p-3 transition-opacity duration-150' +
                    (semEstoque ? ' opacity-45' : '')
                  }
                >
                  <p className="line-clamp-2 min-h-[2.4em] text-caption font-medium text-ink">{p.nome}</p>
                  <p className={'mt-0.5 text-2xs ' + (semEstoque ? 'text-negative' : 'text-faint')}>
                    {semEstoque ? 'sem estoque' : `${p.estoque} em estoque`}
                  </p>
                  <p className="mt-1.5 text-body font-bold text-ink">{fmtBRL(p.preco)}</p>
                  <Button
                    size="sm"
                    variant={qtd > 0 ? 'default' : 'outline'}
                    className="mt-2"
                    disabled={semEstoque || mAdicionar.isPending}
                    onClick={() => mAdicionar.mutate({ produtoId: p.id, preco: p.preco })}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {qtd > 0 ? `No carrinho (${qtd})` : 'Adicionar'}
                  </Button>
                </div>
              );
            })}
            {catalogo.length === 0 && (
              <p className="col-span-2 py-8 text-center text-caption text-faint">
                Nenhum produto encontrado.
              </p>
            )}
          </div>
        </>
      )}

      {/* barra fixa de total + ação principal */}
      {!enviando && carrinho.itens.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-elev px-4 py-3">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="flex-1">
              <p className="text-2xs text-faint">Total</p>
              <p className="text-lg font-bold text-ink">{fmtBRL(total)}</p>
            </div>
            <Button
              size="default"
              className="flex-1"
              disabled={mEnviar.isPending}
              onClick={() => mEnviar.mutate()}
            >
              {mEnviar.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ShoppingCart className="h-4 w-4" />}
              Enviar para a maquininha
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChipCategoria({
  ativo, onClick, children,
}: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-2xs font-medium transition-colors duration-150 ' +
        (ativo
          ? 'border-gold-400 bg-gold-400 text-ongold'
          : 'border-line bg-elev text-muted hover:text-ink-2')
      }
    >
      {children}
    </button>
  );
}
