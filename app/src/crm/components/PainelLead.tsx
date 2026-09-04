import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, ExternalLink, MessageCircle, ShoppingBag, Star, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import {
  useAtualizarLead, useEtapas, useLeadDetalhe, useMoverLead, useVendedores,
} from '@/crm/data/hooks';
import { formatarTelefone, linkWhatsApp } from '@/crm/data/queries';
import { cn, fmtBRL, fmtData } from '@/lib/utils';
import { useSessao } from '@/store/sessao';
import type { LeadDetalhe } from '@/crm/types';

/**
 * O card do lead.
 *
 * É PAINEL LATERAL, não página. O vendedor abre, resolve e fecha dezenas de
 * vezes por dia — se cada abertura tirasse ele do funil, ele perderia o
 * contexto do que estava fazendo e voltaria rolando a tela para achar o lugar.
 */
export function PainelLead({
  leadId, onFechar,
}: { leadId: string | null; onFechar: () => void }) {
  const { data: lead, isLoading } = useLeadDetalhe(leadId);
  const { data: etapas } = useEtapas();
  const { data: vendedores } = useVendedores();
  const atualizar = useAtualizarLead();
  const mover = useMoverLead();

  // Fechar com Esc: o vendedor está com a mão no teclado, não no mouse.
  useEffect(() => {
    if (!leadId) return;
    const t = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, [leadId, onFechar]);

  if (!leadId) return null;

  return (
    <>
      <div
        onClick={onFechar}
        className="fixed inset-0 z-40 bg-black/40 animate-surgir"
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-line bg-surface shadow-flutuante animate-surgir"
        role="dialog"
        aria-label="Detalhes do lead"
      >
        {isLoading || !lead ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-elev/40" />
            ))}
          </div>
        ) : (
          <Conteudo
            lead={lead}
            etapas={etapas ?? []}
            vendedores={vendedores ?? []}
            onFechar={onFechar}
            onSalvar={(campos) => atualizar.mutate({ id: lead.id, ...campos })}
            onMover={(etapaId, motivo) =>
              mover.mutate({ leadId: lead.id, etapaId, motivoPerdaId: motivo })}
          />
        )}
      </aside>
    </>
  );
}

/* ------------------------------------------------------------ conteúdo -- */

function Conteudo({
  lead, etapas, vendedores, onFechar, onSalvar, onMover,
}: {
  lead: LeadDetalhe;
  etapas: { id: string; nome: string; tipo: string }[];
  vendedores: { id: string; nome: string }[];
  onFechar: () => void;
  onSalvar: (c: { titulo?: string; valor?: number | null; responsavelId?: string | null;
                  clienteNome?: string }) => void;
  onMover: (etapaId: string, motivo?: string) => void;
}) {
  const [titulo, setTitulo] = useState(lead.titulo ?? '');
  const [valor, setValor] = useState(lead.valor?.toString() ?? '');
  const [nome, setNome] = useState(lead.cliente.nome ?? '');
  const navigate = useNavigate();

  // Quem grava venda é só o gestor -- no dashboard, decisão de produto (não é
  // gate de segurança: quem trava de verdade é a RLS em `venda`; aqui é só
  // não oferecer no CRM um botão que o vendedor nunca poderia usar).
  const gestor = useSessao((s) => s.papel !== 'vendedor');

  useEffect(() => {
    setTitulo(lead.titulo ?? '');
    setValor(lead.valor?.toString() ?? '');
    setNome(lead.cliente.nome ?? '');
  }, [lead.id]);

  const wa = linkWhatsApp(lead.cliente.telefone,
    `Oi ${(lead.cliente.nome ?? '').split(' ')[0]}, aqui é da Republic BT!`);

  const fechado = lead.fechadoEm != null;
  const recorrente = lead.compras.length > 0;

  return (
    <>
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => nome.trim() !== (lead.cliente.nome ?? '') &&
              onSalvar({ clienteNome: nome.trim() })}
            placeholder="Sem nome"
            className="h-8 border-transparent bg-transparent px-1 text-title hover:border-line"
          />
          <p className="mt-0.5 px-1 text-caption tabular-nums text-muted">
            {formatarTelefone(lead.cliente.telefone)}
          </p>
        </div>
        <button onClick={onFechar} className="mt-1 text-faint hover:text-ink-2">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* o que o vendedor precisa saber ANTES de responder */}
        <div className="flex flex-wrap items-center gap-1.5">
          {lead.campanha && (
            <Badge variant={lead.campanha.id === 'nao_rastreado' ? 'neutral' : 'navy'}>
              {lead.campanha.nome}
            </Badge>
          )}
          {lead.utmContent && <Badge variant="neutral">{lead.utmContent}</Badge>}
          {recorrente && (
            <Badge variant="destaque" ponto>
              <Star className="h-3 w-3" /> Já comprou
            </Badge>
          )}
          {!fechado && lead.diasParado >= 5 && (
            <Badge variant="attention" ponto>
              <Clock className="h-3 w-3" /> {lead.diasParado} dias parado
            </Badge>
          )}
        </div>

        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="block">
            <Button variant="outline" className="w-full">
              <MessageCircle className="h-4 w-4" /> Abrir no WhatsApp
              <ExternalLink className="ml-auto h-3 w-3 opacity-60" />
            </Button>
          </a>
        )}

        {/* campos */}
        <div className="space-y-3">
          <Campo rotulo="Etapa">
            <Select
              value={lead.etapaId}
              onChange={(e) => {
                const alvo = etapas.find((x) => x.id === e.target.value);
                // Perder exige motivo — o kanban trata isso com diálogo, e aqui
                // a etapa de perdido fica de fora para não criar um segundo
                // caminho que escapa da regra.
                if (alvo?.tipo === 'perdido') return;
                onMover(e.target.value);
              }}
            >
              {etapas.filter((e) => e.tipo !== 'perdido' || e.id === lead.etapaId)
                .map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Select>
            {etapas.find((e) => e.id === lead.etapaId)?.tipo !== 'perdido' && (
              <p className="mt-1 text-caption text-faint">
                Para marcar como perdido, arraste no funil — o motivo é obrigatório.
              </p>
            )}
          </Campo>

          <Campo rotulo="Responsável">
            <Select
              value={lead.responsavelId ?? ''}
              onChange={(e) => onSalvar({ responsavelId: e.target.value || null })}
            >
              <option value="">Ninguém ainda</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </Select>
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Interesse">
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                onBlur={() => titulo !== (lead.titulo ?? '') && onSalvar({ titulo })}
                placeholder="Raquete Nox"
              />
            </Campo>
            <Campo rotulo="Valor estimado">
              <Input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                onBlur={() => {
                  const v = valor ? Number(valor.replace(',', '.')) : null;
                  if (v !== lead.valor) onSalvar({ valor: v });
                }}
                placeholder="700"
              />
            </Campo>
          </div>
        </div>

        {/* histórico da PESSOA, não do lead */}
        {(lead.compras.length > 0 || lead.outrosLeads.length > 0) && (
          <section>
            <h3 className="mb-2 text-label uppercase text-faint">
              Histórico do cliente
            </h3>

            {lead.compras.length > 0 && (
              <div className="mb-3 rounded-md border border-positive-line bg-positive-soft px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-caption text-positive">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {lead.compras.length} compra{lead.compras.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-num text-ink">{fmtBRL(lead.totalComprado)}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {lead.compras.map((c) => (
                    <li key={c.id} className="flex justify-between text-caption text-ink-2">
                      <span className="truncate">{c.descricao}</span>
                      <span className="ml-3 shrink-0 tabular-nums text-muted">
                        {fmtData(c.data)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {lead.outrosLeads.length > 0 && (
              <ul className="space-y-1">
                {lead.outrosLeads.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center gap-2 rounded border border-line-soft px-3 py-2 text-caption"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink-2">
                      {o.titulo ?? 'Sem título'}
                    </span>
                    <span className="shrink-0 text-faint">
                      {etapas.find((e) => e.id === o.etapaId)?.nome}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="border-t border-line-soft pt-3 text-caption text-faint">
          <Linha rotulo="Criado" valor={fmtData(lead.criadoEm)} />
          <Linha rotulo="Última mexida" valor={fmtData(lead.atualizadoEm)} />
          {lead.fechadoEm && <Linha rotulo="Fechado" valor={fmtData(lead.fechadoEm)} />}
          {lead.cliente.campanhaOrigem && (
            <Linha rotulo="Trouxe o cliente" valor={lead.cliente.campanhaOrigem} />
          )}
        </section>
      </div>

      {/* a ação que fecha o ciclo -- só para gestor, é ele quem grava venda */}
      {gestor && etapas.find((e) => e.id === lead.etapaId)?.tipo === 'ganho' && (
        <footer className="border-t border-line p-4">
          <Button
            className="w-full"
            onClick={() => navigate('/painel/vendas/nova', {
              state: {
                clienteNome: lead.cliente.nome ?? '',
                clienteFone: lead.cliente.telefone ?? '',
                origemLead: [lead.titulo, lead.campanha?.nome].filter(Boolean).join(' — '),
              },
            })}
          >
            Registrar venda
          </Button>
          <p className="mt-1.5 text-center text-caption text-faint">
            O cliente e a campanha já vão preenchidos
          </p>
        </footer>
      )}
    </>
  );
}

const Campo = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-label uppercase text-faint">{rotulo}</label>
    {children}
  </div>
);

const Linha = ({ rotulo, valor }: { rotulo: string; valor: string }) => (
  <div className="flex justify-between py-0.5">
    <span>{rotulo}</span>
    <span className={cn('tabular-nums text-muted')}>{valor}</span>
  </div>
);
