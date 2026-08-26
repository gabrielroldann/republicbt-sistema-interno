import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';
import { useMensagemPadrao, useSalvarMensagemPadrao } from '@/crm/data/hooks';
import { MARCADORES, preencherMarcadores } from '@/crm/data/queries';

/**
 * A PRIMEIRA MENSAGEM DO VENDEDOR.
 *
 * É o movimento central do fluxo da loja: o cliente chegou pelo número do
 * anúncio, e a partir daqui quem fala é o vendedor, do número dele, numa
 * conversa nova. Não é transferência — as duas threads continuam existindo.
 *
 * O texto vem pronto mas EDITÁVEL, e essa escolha é deliberada. Texto imposto
 * some de duas formas: ou o vendedor apaga tudo e digita o dele (e aí o padrão
 * não serviu para nada), ou manda no automático e soa robótico logo na
 * apresentação, que é o pior lugar para soar robótico.
 */
export function DialogoMeuNumero({
  aberto, cliente, vendedor, onFechar, onEnviar, erro,
}: {
  aberto: boolean;
  cliente: string | null;
  vendedor: string | null;
  onFechar: () => void;
  onEnviar: (texto: string) => void;
  erro?: string | null;
}) {
  const { data: padrao } = useMensagemPadrao();
  const salvarPadrao = useSalvarMensagemPadrao();

  const [texto, setTexto] = useState('');
  const [editandoModelo, setEditandoModelo] = useState(false);
  const [modelo, setModelo] = useState('');

  // Reabrir com o texto da conversa ANTERIOR seria mandar a apresentação para
  // a pessoa errada. Por isso recompõe a cada abertura.
  useEffect(() => {
    if (!aberto || !padrao) return;
    setTexto(preencherMarcadores(padrao, { cliente, vendedor }));
    setModelo(padrao);
    setEditandoModelo(false);
  }, [aberto, padrao, cliente, vendedor]);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Atender pelo seu número</DialogTitle>
        <DialogDescription>
          Esta mensagem sai do <strong className="text-ink-2">seu</strong> WhatsApp
          e começa uma conversa nova com {cliente ?? 'o cliente'}. Daqui em diante
          você responde por aqui ou pelo celular — é a mesma conversa.
        </DialogDescription>

        {editandoModelo ? (
          <div className="mt-4">
            <label className="mb-1 block text-label uppercase text-faint">
              Modelo padrão
            </label>
            <textarea
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-md border border-line bg-app px-3 py-2 text-body text-ink placeholder:text-faint focus:border-gold-400 focus:outline-none"
            />
            <p className="mt-1.5 text-caption text-faint">
              Marcadores trocados na hora do envio:{' '}
              {MARCADORES.map((m) => (
                <code key={m} className="mx-0.5 rounded bg-elev px-1 text-ink-2">{m}</code>
              ))}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  await salvarPadrao.mutateAsync(modelo);
                  setTexto(preencherMarcadores(modelo, { cliente, vendedor }));
                  setEditandoModelo(false);
                }}
                disabled={!modelo.trim()}
              >
                Salvar modelo
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditandoModelo(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={5}
              autoFocus
              className="w-full resize-none rounded-md border border-line bg-app px-3 py-2 text-body text-ink placeholder:text-faint focus:border-gold-400 focus:outline-none"
            />
            <button
              onClick={() => setEditandoModelo(true)}
              className="mt-1.5 text-caption text-faint underline-offset-2 transition-colors hover:text-ink-2 hover:underline"
            >
              Editar o modelo padrão de todas as conversas
            </button>
          </div>
        )}

        {erro && (
          <p className="mt-3 rounded-md border border-negative-line bg-negative-soft px-3 py-2 text-caption text-negative">
            {erro}
          </p>
        )}

        {!editandoModelo && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
            <Button onClick={() => onEnviar(texto)} disabled={!texto.trim()}>
              <Send className="h-4 w-4" /> Enviar e assumir
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
