import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMotivosPerda } from '@/crm/data/hooks';

/**
 * Perder um lead EXIGE motivo, e o motivo vem de uma lista fixa.
 *
 * Se fosse texto livre, o relatório de perdas viraria quarenta frases
 * diferentes dizendo a mesma coisa — e um relatório assim não decide nada.
 * O banco também recusa perder sem motivo; isto aqui é só o aviso antes.
 */
export function DialogoPerda({
  aberto, nome, onCancelar, onConfirmar,
}: {
  aberto: boolean;
  nome: string;
  onCancelar: () => void;
  onConfirmar: (motivoId: string) => void;
}) {
  const { data: motivos } = useMotivosPerda();
  const [escolhido, setEscolhido] = useState<string | null>(null);

  function fechar() {
    setEscolhido(null);
    onCancelar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Por que perdeu?</DialogTitle>
        <DialogDescription>
          {nome} — o motivo alimenta o relatório de perdas por valor.
        </DialogDescription>

        <div className="mt-4 space-y-1.5">
          {(motivos ?? []).map((m) => (
            <button
              key={m.id}
              onClick={() => setEscolhido(m.id)}
              className={cn(
                'flex w-full items-center rounded-md border px-3 py-2.5 text-left text-body transition-colors duration-150',
                escolhido === m.id
                  ? 'border-gold-400 bg-gold-400/10 text-ink'
                  : 'border-line bg-card text-ink-2 hover:border-line-strong hover:bg-elev/50',
              )}
            >
              {m.nome}
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={fechar}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={!escolhido}
            onClick={() => { onConfirmar(escolhido!); setEscolhido(null); }}
          >
            Marcar como perdido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
