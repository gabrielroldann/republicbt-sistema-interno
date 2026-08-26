import { MessageCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, fmtBRL } from '@/lib/utils';
import { formatarTelefone } from '@/crm/data/queries';
import type { LeadCompleto } from '@/crm/types';

/**
 * O card do funil.
 *
 * Três informações e nada além: quem é, quanto vale, de onde veio. Card cheio
 * de dado vira parede de texto e o vendedor para de ler — e um funil que
 * ninguém lê não organiza nada.
 */
export function CardLead({
  lead, arrastando, onArrastar, onAbrir,
}: {
  lead: LeadCompleto;
  arrastando: boolean;
  onArrastar: (id: string | null) => void;
  onAbrir: (id: string) => void;
}) {
  const fechado = lead.fechadoEm != null;

  // Lead parado é o sinal mais barato de venda perdida por esquecimento.
  // Só faz sentido em lead aberto: fechado não tem o que cobrar.
  const alerta = !fechado && lead.diasParado >= 5;

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', lead.id);
        onArrastar(lead.id);
      }}
      onDragEnd={() => onArrastar(null)}
      onClick={() => onAbrir(lead.id)}
      className={cn(
        'group cursor-pointer rounded-md border bg-card p-3 transition-all duration-150 ease-padrao',
        'hover:border-line-strong hover:bg-elev/40 active:cursor-grabbing',
        arrastando ? 'opacity-40' : 'opacity-100',
        alerta ? 'border-attention-line' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 flex-1 truncate text-body font-semibold text-ink">
          {lead.cliente.nome ?? 'Sem nome'}
        </h4>
        {lead.valor != null && (
          <span className="shrink-0 text-num text-ink">{fmtBRL(lead.valor)}</span>
        )}
      </div>

      {lead.titulo && (
        <p className="mt-0.5 truncate text-caption text-muted">{lead.titulo}</p>
      )}

      <p className="mt-1 text-caption tabular-nums text-faint">
        {formatarTelefone(lead.cliente.telefone)}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {/* A origem é o motivo de o CRM existir: ela precisa estar visível
            sem clique, senão ninguém usa para decidir mídia. */}
        {lead.campanha && (
          <Badge variant={lead.campanha.id === 'nao_rastreado' ? 'neutral' : 'navy'}>
            {lead.campanha.nome}
          </Badge>
        )}

        {lead.motivoPerdaId && (
          <Badge variant="negative">{rotuloMotivo(lead.motivoPerdaId)}</Badge>
        )}

        {alerta && (
          <Badge variant="attention" ponto>
            <Clock className="h-3 w-3" />
            {lead.diasParado}d parado
          </Badge>
        )}

        {lead.temConversaAberta && (
          <span title="conversa aberta no WhatsApp" className="text-positive">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
        )}

        <span className="ml-auto shrink-0">
          {lead.responsavel ? (
            <span
              title={lead.responsavel.nome}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-700 text-[10px] font-bold text-white"
            >
              {lead.responsavel.iniciais}
            </span>
          ) : (
            <span
              title="sem responsável"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line-strong text-[10px] text-faint"
            >
              ?
            </span>
          )}
        </span>
      </div>
    </article>
  );
}

const MOTIVOS: Record<string, string> = {
  preco: 'Preço',
  concorrente: 'Concorrente',
  sumiu: 'Sumiu',
  pesquisando: 'Pesquisando',
  indisponivel: 'Indisponível',
  prazo: 'Prazo',
  frete: 'Frete',
};
const rotuloMotivo = (id: string) => MOTIVOS[id] ?? id;
