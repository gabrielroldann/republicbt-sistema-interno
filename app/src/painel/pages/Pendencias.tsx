import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, Inbox, Loader2, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/field';
import {
  linkarClienteNaVenda, listarClientesLeadAmbiguo, listarVendasSemCliente,
  type ClienteLeadAmbiguo, type VendaSemCliente,
} from '@/painel/data/pendencias';
import { FORMAS_PAGAMENTO } from '@/painel/types';
import { fmtBRL, fmtData } from '@/lib/utils';

/**
 * A FILA DO SÓCIO.
 *
 * Duas pendências que o sistema não resolve sozinho — ver o cabeçalho de
 * `painel/data/pendencias.ts` para o porquê de cada uma. Tela pensada pra ser
 * curta na maioria dos dias: se os três fluxos de venda estão pedindo
 * telefone e o trigger `venda_fecha_lead` está fechando os leads óbvios,
 * isso aqui devia ficar vazio quase sempre.
 */
export default function Pendencias() {
  const qc = useQueryClient();

  const qVendas = useQuery({ queryKey: ['pendencias-vendas'], queryFn: listarVendasSemCliente });
  const qLeads = useQuery({ queryKey: ['pendencias-leads'], queryFn: listarClientesLeadAmbiguo });

  const vazio = (qVendas.data?.length ?? 0) === 0 && (qLeads.data?.length ?? 0) === 0;

  return (
    <div className="stagger space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">Pendências</h1>
        <p className="text-caption text-muted">
          Vendas sem cliente linkado e negociações que o sistema não conseguiu fechar sozinho.
        </p>
      </div>

      {!qVendas.isLoading && !qLeads.isLoading && vazio && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-positive" />
            <p className="text-body font-medium text-ink">Nada pendente</p>
            <p className="text-caption text-muted">Todas as vendas recentes já estão linkadas a um cliente.</p>
          </CardContent>
        </Card>
      )}

      <SecaoVendasSemCliente
        vendas={qVendas.data}
        carregando={qVendas.isLoading}
        onLinkado={() => {
          qc.invalidateQueries({ queryKey: ['pendencias-vendas'] });
          qc.invalidateQueries({ queryKey: ['pendencias-leads'] });
          // Mesma chave do sininho na Sidebar — sem isto o número só cairia
          // no próximo refetch automático, até 60s depois.
          qc.invalidateQueries({ queryKey: ['pendencias-total'] });
        }}
      />

      <SecaoLeadsAmbiguos leads={qLeads.data} carregando={qLeads.isLoading} />
    </div>
  );
}

function SecaoVendasSemCliente({
  vendas, carregando, onLinkado,
}: { vendas: VendaSemCliente[] | undefined; carregando: boolean; onLinkado: () => void }) {
  if (carregando) return null;
  if (!vendas || vendas.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line-soft px-5 py-2.5">
        <Inbox className="h-4 w-4 text-attention" />
        <span className="text-sm font-semibold text-ink">Vendas sem cliente</span>
        <Badge variant="attention" className="ml-1">{vendas.length}</Badge>
      </div>
      <ul className="divide-y divide-line-soft">
        {vendas.map((v) => <LinhaVendaSemCliente key={v.id} venda={v} onLinkado={onLinkado} />)}
      </ul>
    </Card>
  );
}

function LinhaVendaSemCliente({
  venda, onLinkado,
}: { venda: VendaSemCliente; onLinkado: () => void }) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const mLinkar = useMutation({
    mutationFn: () => linkarClienteNaVenda(venda.id, telefone, nome.trim() || null),
    onSuccess: onLinkado,
    onError: (e) => setErro(e instanceof Error ? e.message : 'não deu para linkar o cliente'),
  });

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-[180px] flex-1">
        <p className="text-body font-medium text-ink">{venda.produtoNome}</p>
        <p className="text-2xs text-faint">
          {fmtData(venda.criadoEm)} · {venda.vendedorNome} ·{' '}
          {FORMAS_PAGAMENTO.find((f) => f.id === venda.formaPagamento)?.label ?? venda.formaPagamento}
          {venda.canal ? ` · ${venda.canal}` : ''}
        </p>
      </div>
      <span className="text-body font-semibold text-ink">{fmtBRL(venda.valor)}</span>

      <div className="flex items-center gap-1.5">
        <Input
          value={nome} onChange={(e) => setNome(e.target.value)}
          placeholder="nome (opcional)" className="h-8 w-32 text-xs"
        />
        <Input
          value={telefone} onChange={(e) => setTelefone(e.target.value)}
          placeholder="telefone" inputMode="tel" className="h-8 w-32 text-xs"
        />
        <Button
          size="sm" disabled={!telefone.trim() || mLinkar.isPending}
          onClick={() => { setErro(null); mLinkar.mutate(); }}
        >
          {mLinkar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          Linkar
        </Button>
      </div>

      {erro && <p className="w-full text-2xs text-negative">{erro}</p>}
    </li>
  );
}

function SecaoLeadsAmbiguos({
  leads, carregando,
}: { leads: ClienteLeadAmbiguo[] | undefined; carregando: boolean }) {
  if (carregando) return null;
  if (!leads || leads.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line-soft px-5 py-2.5">
        <AlertTriangle className="h-4 w-4 text-attention" />
        <span className="text-sm font-semibold text-ink">Negociações ambíguas</span>
        <Badge variant="attention" className="ml-1">{leads.length}</Badge>
      </div>
      <p className="border-b border-line-soft px-5 py-2 text-2xs text-faint">
        Esse cliente comprou, mas tem mais de um negócio aberto no CRM — escolha manualmente qual foi.
      </p>
      <ul className="divide-y divide-line-soft">
        {leads.map((c) => (
          <li key={c.clienteId} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-[180px] flex-1">
              <p className="text-body font-medium text-ink">{c.clienteNome}</p>
              <p className="text-2xs text-faint">{c.clienteTelefone}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.leads.map((l) => (
                <Badge key={l.id} variant="neutral" title={l.titulo}>{l.etapaNome}</Badge>
              ))}
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/crm"><ExternalLink className="h-3.5 w-3.5" /> Abrir no CRM</Link>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
