import { useMemo, useState } from 'react';
import { Search, User, X } from 'lucide-react';
import { CardLead } from '@/crm/components/CardLead';
import { DialogoPerda } from '@/crm/components/DialogoPerda';
import { PainelLead } from '@/crm/components/PainelLead';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { useCampanhas, useFunil, useMoverLead, useVendedores } from '@/crm/data/hooks';
import { useSessao } from '@/store/sessao';
import { useFiltrosCrm } from '@/crm/store/filtros';
import { cn, fmtBRL } from '@/lib/utils';
import type { ColunaFunil } from '@/crm/types';

export default function Funil() {
  const [busca, setBusca] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const [campanhaId, setCampanhaId] = useState('');
  const { vendedorId } = useSessao();
  const { soMeus, setSoMeus } = useFiltrosCrm();
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  // Perder exige motivo: o arrasto fica pendurado até a pessoa escolher.
  const [pendente, setPendente] = useState<{ leadId: string; nome: string } | null>(null);

  const filtros = useMemo(
    () => ({
      busca: busca || undefined,
      // "Só os meus" vence o seletor: é um atalho, não mais um filtro empilhado.
      responsavelId: soMeus ? vendedorId : (responsavelId || undefined),
      campanhaId: campanhaId || undefined,
    }),
    [busca, responsavelId, campanhaId, soMeus, vendedorId],
  );

  const { data: colunas, isLoading } = useFunil(filtros);
  const { data: vendedores } = useVendedores();
  const { data: campanhas } = useCampanhas();
  const mover = useMoverLead();

  const temFiltro = !!(busca || responsavelId || campanhaId || soMeus);

  /**
   * O id do lead vem do `dataTransfer`, NÃO do estado do React.
   *
   * O estado é atualizado de forma assíncrona: quando o `drop` dispara, o
   * `setArrastando` do `dragstart` pode ainda não ter sido aplicado, e o
   * arrasto falha em silêncio. O `dataTransfer` é síncrono e é para isso que
   * ele existe. O estado fica só para o efeito visual de opacidade.
   */
  function soltar(etapaId: string, tipo: string, dt: DataTransfer) {
    const leadId = dt.getData('text/plain') || arrastando;
    setArrastando(null);
    setAlvo(null);
    if (!leadId) return;

    const atual = colunas?.flatMap((c) => c.leads).find((l) => l.id === leadId);
    if (!atual || atual.etapaId === etapaId) return;

    if (tipo === 'perdido') {
      setPendente({ leadId, nome: atual.cliente.nome ?? 'Este lead' });
      return;
    }
    mover.mutate({ leadId, etapaId });
  }

  return (
    <div className="flex h-full flex-col">
      {/* barra de filtros */}
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome ou telefone"
            className="w-56 pl-8"
          />
        </div>

        <Button
          variant={soMeus ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSoMeus(!soMeus)}
        >
          <User className="h-3.5 w-3.5" /> Só os meus
        </Button>

        <Select
          value={soMeus ? '' : responsavelId}
          disabled={soMeus}
          onChange={(e) => setResponsavelId(e.target.value)}
          className="w-40 disabled:opacity-40"
        >
          <option value="">Todos os vendedores</option>
          {(vendedores ?? []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
        </Select>

        <Select value={campanhaId} onChange={(e) => setCampanhaId(e.target.value)}
                className="w-52">
          <option value="">Todas as campanhas</option>
          {(campanhas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>

        {temFiltro && (
          <Button
            variant="ghost" size="sm"
            onClick={() => {
              setBusca(''); setResponsavelId(''); setCampanhaId(''); setSoMeus(false);
            }}
          >
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        )}

        <span className="ml-auto text-caption tabular-nums text-faint">
          {(colunas ?? []).reduce((s, c) => s + c.leads.length, 0)} leads
        </span>
      </header>

      {/* o kanban */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-w-max gap-3 p-4">
          {isLoading && !colunas
            ? Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="w-[272px] animate-pulse rounded-md bg-elev/40" />
              ))
            : (colunas ?? []).map((col) => (
                <Coluna
                  key={col.etapa.id}
                  col={col}
                  destacada={alvo === col.etapa.id && arrastando != null}
                  onSobre={() => setAlvo(col.etapa.id)}
                  onSair={() => setAlvo((a) => (a === col.etapa.id ? null : a))}
                  onSoltar={(dt) => soltar(col.etapa.id, col.etapa.tipo, dt)}
                  onArrastar={setArrastando}
                  arrastando={arrastando}
                  onAbrir={setAberto}
                />
              ))}
        </div>
      </div>

      <PainelLead leadId={aberto} onFechar={() => setAberto(null)} />

      <DialogoPerda
        aberto={pendente != null}
        nome={pendente?.nome ?? ''}
        onCancelar={() => setPendente(null)}
        onConfirmar={(motivoPerdaId) => {
          mover.mutate({ leadId: pendente!.leadId, etapaId: 'perdido', motivoPerdaId });
          setPendente(null);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------- coluna -- */

function Coluna({
  col, destacada, onSobre, onSair, onSoltar, onArrastar, arrastando, onAbrir,
}: {
  col: ColunaFunil;
  destacada: boolean;
  onSobre: () => void;
  onSair: () => void;
  onSoltar: (dt: DataTransfer) => void;
  onArrastar: (id: string | null) => void;
  arrastando: string | null;
  onAbrir: (id: string) => void;
}) {
  // A cor vem da configuração do funil, não do tipo — quem monta o funil
  // escolhe, e o mesmo tom aparece aqui e na tela de configuração.
  const cor = {
    gold: 'bg-gold-400', navy: 'bg-navy-500', info: 'bg-info',
    attention: 'bg-attention', positive: 'bg-positive',
    negative: 'bg-negative', neutral: 'bg-muted',
  }[col.etapa.cor] ?? 'bg-muted';

  return (
    <section
      onDragOver={(e) => { e.preventDefault(); onSobre(); }}
      onDragLeave={onSair}
      onDrop={(e) => { e.preventDefault(); onSoltar(e.dataTransfer); }}
      className={cn(
        'flex w-[272px] shrink-0 flex-col rounded-md border transition-colors duration-150',
        destacada ? 'border-gold-400 bg-gold-400/5' : 'border-line-soft bg-app',
      )}
    >
      <header className="flex items-center gap-2 border-b border-line-soft px-3 py-2.5">
        <span className={cn('h-4 w-[3px] shrink-0 rounded-full', cor)} />
        <h3 className="min-w-0 flex-1 truncate text-caption font-semibold uppercase tracking-wide text-ink-2">
          {col.etapa.nome}
        </h3>
        <span className="shrink-0 text-caption tabular-nums text-faint">{col.leads.length}</span>
      </header>

      {col.valor > 0 && (
        <div className="border-b border-line-soft px-3 py-1.5 text-caption tabular-nums text-muted">
          {fmtBRL(col.valor)}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {col.leads.length === 0 ? (
          <p className="px-2 py-6 text-center text-caption text-faint">
            {destacada ? 'Solte aqui' : 'Vazio'}
          </p>
        ) : (
          col.leads.map((l) => (
            <CardLead
              key={l.id}
              lead={l}
              arrastando={arrastando === l.id}
              onArrastar={onArrastar}
              onAbrir={onAbrir}
            />
          ))
        )}
      </div>
    </section>
  );
}
