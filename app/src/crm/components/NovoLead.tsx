import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Campo, Input, Select } from '@/components/ui/field';
import { useCampanhas, useCriarLead, useVendedores } from '@/crm/data/hooks';
import { formatarTelefone, normalizarTelefone } from '@/crm/data/queries';

/**
 * CAPTURA RÁPIDA.
 *
 * O único campo obrigatório é o telefone, porque é a chave que costura lead,
 * cliente e venda. Todo o resto é opcional e pode ser completado depois.
 *
 * Formulário longo é o que faz cadastro manual morrer: o vendedor está no meio
 * de uma conversa e não vai preencher oito campos. Se levar mais de dez
 * segundos, ele deixa para depois — e depois nunca chega.
 */
export function NovoLead({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { data: campanhas } = useCampanhas();
  const { data: vendedores } = useVendedores();
  const criar = useCriarLead();

  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [titulo, setTitulo] = useState('');
  const [valor, setValor] = useState('');
  const [campanhaId, setCampanhaId] = useState('nao_rastreado');
  const [responsavelId, setResponsavelId] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) {
      setTelefone(''); setNome(''); setTitulo(''); setValor('');
      setCampanhaId('nao_rastreado'); setResponsavelId(''); setErro(null);
    }
  }, [aberto]);

  const normalizado = normalizarTelefone(telefone);
  const valido = normalizado != null && normalizado.length >= 12;

  async function salvar() {
    setErro(null);
    if (!valido) { setErro('Telefone incompleto.'); return; }
    try {
      await criar.mutateAsync({
        telefone,
        nome: nome.trim() || undefined,
        titulo: titulo.trim() || undefined,
        valor: valor ? Number(valor.replace(',', '.')) : undefined,
        campanhaId,
        responsavelId: responsavelId || undefined,
      });
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Novo lead</DialogTitle>
        <DialogDescription>
          Só o telefone é obrigatório. O resto dá para completar depois.
        </DialogDescription>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => { e.preventDefault(); void salvar(); }}
        >
          <Campo label="Telefone">
            <Input
              autoFocus
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(85) 99114-7264"
            />
            {/* Mostrar o número já normalizado evita o erro mais comum: cadastrar
                o mesmo cliente duas vezes por causa do formato. */}
            {telefone && (
              <p className="mt-1 text-caption text-faint">
                {valido
                  ? `Será salvo como ${formatarTelefone(normalizado)}`
                  : 'Faltam dígitos'}
              </p>
            )}
          </Campo>

          <Campo label="Nome">
            <Input value={nome} onChange={(e) => setNome(e.target.value)}
                   placeholder="Como a pessoa se apresentou" />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Interesse">
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                     placeholder="Raquete Nox" />
            </Campo>
            <Campo label="Valor estimado">
              <Input inputMode="decimal" value={valor}
                     onChange={(e) => setValor(e.target.value)} placeholder="700" />
            </Campo>
          </div>

          <Campo label="Veio de">
            <Select value={campanhaId} onChange={(e) => setCampanhaId(e.target.value)}>
              {(campanhas ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Select>
            <p className="mt-1 text-caption text-faint">
              Na dúvida, deixe "Não rastreado" — é melhor que chutar.
            </p>
          </Campo>

          <Campo label="Responsável">
            <Select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              <option value="">Ninguém ainda</option>
              {(vendedores ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </Select>
          </Campo>

          {erro && (
            <p className="rounded border border-negative-line bg-negative-soft px-3 py-2 text-caption text-negative">
              {erro}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={!valido || criar.isPending}>
              {criar.isPending ? 'Salvando...' : 'Criar lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
