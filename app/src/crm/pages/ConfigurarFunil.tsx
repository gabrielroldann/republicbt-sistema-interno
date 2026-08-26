import { useEffect, useState } from 'react';
import { GripVertical, Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  useContagemPorEtapa, useCriarEtapa, useEtapas, useExcluirEtapa,
  useRenomearEtapa, useReordenarEtapas,
} from '@/crm/data/hooks';
import { useSessao } from '@/store/sessao';
import { cn } from '@/lib/utils';
import type { CorEtapa, Etapa } from '@/crm/types';

const CORES: { id: CorEtapa; nome: string; classe: string }[] = [
  { id: 'gold', nome: 'Ouro', classe: 'bg-gold-400' },
  { id: 'navy', nome: 'Azul', classe: 'bg-navy-500' },
  { id: 'info', nome: 'Informação', classe: 'bg-info' },
  { id: 'attention', nome: 'Atenção', classe: 'bg-attention' },
  { id: 'positive', nome: 'Positivo', classe: 'bg-positive' },
  { id: 'negative', nome: 'Negativo', classe: 'bg-negative' },
  { id: 'neutral', nome: 'Neutro', classe: 'bg-muted' },
];
const classeCor = (c: CorEtapa) => CORES.find((x) => x.id === c)?.classe ?? 'bg-muted';

export default function ConfigurarFunil() {
  const { papel } = useSessao();
  const { data: etapas } = useEtapas();
  const { data: contagem } = useContagemPorEtapa();

  const criar = useCriarEtapa();
  const renomear = useRenomearEtapa();
  const reordenar = useReordenarEtapas();
  const excluir = useExcluirEtapa();

  const [ordem, setOrdem] = useState<string[]>([]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState<CorEtapa>('gold');
  const [aExcluir, setAExcluir] = useState<Etapa | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const abertas = (etapas ?? []).filter((e) => e.tipo === 'aberta');
  const fechadas = (etapas ?? []).filter((e) => e.tipo !== 'aberta');

  // A ordem local existe para o arrasto responder na hora. O servidor recebe a
  // lista inteira depois — nunca "mova X para N".
  useEffect(() => { setOrdem(abertas.map((e) => e.id)); }, [etapas]);

  if (papel !== 'admin') {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <Lock className="mx-auto h-6 w-6 text-faint" />
          <p className="mt-3 text-body text-ink-2">Só o administrador altera o funil.</p>
          <p className="mt-1 text-caption text-muted">
            Mudar etapa mexe no histórico de todo mundo — por isso a decisão é de
            uma pessoa só.
          </p>
        </div>
      </div>
    );
  }

  const emOrdem = ordem
    .map((id) => abertas.find((e) => e.id === id))
    .filter((e): e is Etapa => !!e);

  /**
   * O id vem do `dataTransfer`, não do estado.
   *
   * Mesma armadilha do kanban: `setArrastando` é assíncrono e, quando o `drop`
   * dispara, o estado pode ainda ser o anterior — o arrasto some sem erro.
   * O estado fica só para a opacidade.
   */
  function soltar(alvoId: string, dt: DataTransfer) {
    const de = dt.getData('text/plain') || arrastando;
    setArrastando(null);
    if (!de || de === alvoId) return;

    const nova = [...ordem];
    nova.splice(nova.indexOf(alvoId), 0, ...nova.splice(nova.indexOf(de), 1));
    setOrdem(nova);
    reordenar.mutate(nova, {
      onError: (e) => {
        setErro(e instanceof Error ? e.message : 'não deu para reordenar');
        setOrdem(abertas.map((x) => x.id));   // volta ao que o servidor tem
      },
    });
  }

  async function adicionar() {
    setErro(null);
    if (!novoNome.trim()) return;
    try {
      await criar.mutateAsync({ nome: novoNome, cor: novaCor });
      setNovoNome('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para criar');
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-6">
        <header className="mb-5">
          <h1 className="text-title text-ink">Configurar funil</h1>
          <p className="mt-1 text-caption text-muted">
            Arraste para reordenar. As etapas de ganho e perdido não saem do fim —
            o sistema inteiro decide por elas.
          </p>
        </header>

        {erro && (
          <p className="mb-4 rounded-md border border-negative-line bg-negative-soft px-3 py-2 text-caption text-negative">
            {erro}
          </p>
        )}

        {/* etapas abertas — reordenáveis */}
        <ul className="space-y-1.5">
          {emOrdem.map((e) => (
            <li
              key={e.id}
              draggable
              onDragStart={(ev) => {
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('text/plain', e.id);
                setArrastando(e.id);
              }}
              onDragEnd={() => setArrastando(null)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={(ev) => { ev.preventDefault(); soltar(e.id, ev.dataTransfer); }}
              className={cn(
                'flex items-center gap-3 rounded-md border bg-card px-3 py-2.5 transition-all duration-150',
                arrastando === e.id ? 'opacity-40' : 'opacity-100',
                'border-line hover:border-line-strong',
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-faint active:cursor-grabbing" />
              <span className={cn('h-5 w-[3px] shrink-0 rounded-full', classeCor(e.cor))} />

              <Input
                defaultValue={e.nome}
                onBlur={(ev) => {
                  const nome = ev.target.value.trim();
                  if (nome && nome !== e.nome) {
                    renomear.mutate({ id: e.id, nome },
                      { onError: () => { ev.target.value = e.nome; } });
                  } else {
                    ev.target.value = e.nome;
                  }
                }}
                className="h-8 flex-1 border-transparent bg-transparent px-1 hover:border-line"
              />

              <Select
                value={e.cor}
                onChange={(ev) => renomear.mutate({
                  id: e.id, nome: e.nome, cor: ev.target.value as CorEtapa,
                })}
                className="h-8 w-32 text-caption"
              >
                {CORES.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Select>

              <span className="w-16 shrink-0 text-right text-caption tabular-nums text-faint">
                {contagem?.[e.id] ?? 0} leads
              </span>

              <button
                onClick={() => { setErro(null); setAExcluir(e); }}
                disabled={abertas.length <= 1}
                title={abertas.length <= 1
                  ? 'o funil precisa de pelo menos uma etapa aberta'
                  : 'excluir'}
                className="shrink-0 text-faint transition-colors hover:text-negative disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        {/* nova etapa */}
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); void adicionar(); }}
        >
          <Input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome da nova etapa"
            className="flex-1"
          />
          <Select
            value={novaCor}
            onChange={(e) => setNovaCor(e.target.value as CorEtapa)}
            className="w-32"
          >
            {CORES.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Button type="submit" disabled={!novoNome.trim() || criar.isPending}>
            <Plus className="h-4 w-4" strokeWidth={2.5} /> Adicionar
          </Button>
        </form>

        {/* etapas fixas */}
        <h2 className="mb-2 mt-8 text-label uppercase text-faint">Etapas fixas</h2>
        <ul className="space-y-1.5">
          {fechadas.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-md border border-line-soft bg-app px-3 py-2.5"
            >
              <Lock className="h-4 w-4 shrink-0 text-faint" />
              <span className={cn('h-5 w-[3px] shrink-0 rounded-full', classeCor(e.cor))} />
              <span className="flex-1 text-body text-ink-2">{e.nome}</span>
              <span className="text-caption tabular-nums text-faint">
                {contagem?.[e.id] ?? 0} leads
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-caption text-muted">
          Ganho e perdido não podem ser renomeadas para outro significado nem
          excluídas: o painel financeiro conta as vendas a partir delas.
        </p>
      </div>

      <DialogoExcluir
        etapa={aExcluir}
        etapas={abertas}
        quantos={aExcluir ? (contagem?.[aExcluir.id] ?? 0) : 0}
        onFechar={() => setAExcluir(null)}
        onConfirmar={async (moverPara) => {
          try {
            await excluir.mutateAsync({ id: aExcluir!.id, moverPara });
            setAExcluir(null);
          } catch (e) {
            setErro(e instanceof Error ? e.message : 'não deu para excluir');
          }
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ excluir -- */

/**
 * Excluir etapa não é só apagar: os leads dentro dela precisam ir para algum
 * lugar. Apagá-los junto destruiria histórico de relacionamento — e, no caso
 * dos ganhos, histórico financeiro.
 */
function DialogoExcluir({
  etapa, etapas, quantos, onFechar, onConfirmar,
}: {
  etapa: Etapa | null;
  etapas: Etapa[];
  quantos: number;
  onFechar: () => void;
  onConfirmar: (moverPara: string) => void;
}) {
  const destinos = etapas.filter((e) => e.id !== etapa?.id);
  const [destino, setDestino] = useState('');

  useEffect(() => { setDestino(destinos[0]?.id ?? ''); }, [etapa]);

  return (
    <Dialog open={etapa != null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Excluir "{etapa?.nome}"</DialogTitle>
        <DialogDescription>
          {quantos > 0
            ? `${quantos} lead${quantos > 1 ? 's' : ''} está nesta etapa. Nenhum será apagado — escolha para onde vão.`
            : 'Não há lead nesta etapa.'}
        </DialogDescription>

        {quantos > 0 && (
          <div className="mt-4">
            <label className="mb-1.5 block text-label uppercase text-faint">
              Mover os leads para
            </label>
            <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
              {destinos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Select>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={!destino}
            onClick={() => onConfirmar(destino)}
          >
            Excluir etapa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
