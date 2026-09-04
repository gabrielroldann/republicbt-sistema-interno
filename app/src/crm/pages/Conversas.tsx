import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRightLeft, Check, CheckCheck, ExternalLink, Image,
  Inbox, MessageCircle, Search, Send, Smartphone, Store, Trash2, User, X,
} from 'lucide-react';
import { DialogoMeuNumero } from '@/crm/components/DialogoMeuNumero';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import {
  useAbrirNoMeuNumero, useAssumirConversa, useCaixaRealtime, useConversas,
  useConversasDoCliente, useEnviarMensagem, useExcluirConversa, useMarcarLida,
  useMensagens, useVendedores,
} from '@/crm/data/hooks';
import { formatarTelefone, linkWhatsApp } from '@/crm/data/queries';
import { useSessao } from '@/store/sessao';
import { cn, fmtHora, fmtQuando } from '@/lib/utils';
import type { ConversaCompleta, Mensagem } from '@/crm/types';

type Aba = 'loja' | 'vendedor';

export default function Conversas() {
  useCaixaRealtime();
  const { vendedorId, papel } = useSessao();
  const [aba, setAba] = useState<Aba>('loja');
  const [semDono, setSemDono] = useState(false);
  const [busca, setBusca] = useState('');
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const filtros = useMemo(() => ({
    canalTipo: aba, papel, vendedorId,
    semDono: semDono || undefined,
    busca: busca || undefined,
  }), [aba, papel, vendedorId, semDono, busca]);

  const { data: conversas, isLoading } = useConversas(filtros);
  const marcarLida = useMarcarLida();

  const aberta = conversas?.find((c) => c.id === abertaId) ?? null;

  // Abrir a conversa é ler a conversa. Exigir um segundo clique em "marcar como
  // lida" seria trabalho manual para registrar algo que o sistema já sabe.
  useEffect(() => {
    if (aberta && aberta.naoLidas > 0) marcarLida.mutate(aberta.id);
  }, [aberta?.id, aberta?.naoLidas]);

  const semDonoTotal = (conversas ?? []).filter((c) => c.atendenteId == null).length;

  /**
   * Ir para uma conversa que pode estar na OUTRA aba.
   *
   * O tipo de canal vem junto de propósito. Antes isso era um `useEffect` que
   * limpava a seleção sempre que a aba mudava — e o resultado era que, ao
   * atender pelo próprio número, o vendedor era jogado numa tela vazia: a
   * conversa nova é do canal 'vendedor' e a lista ainda estava na aba da loja.
   * Trocar de aba por clique limpa; trocar de aba para SEGUIR alguém, não.
   */
  const irPara = (id: string, tipo: Aba) => { setAba(tipo); setAbertaId(id); };
  const trocarAba = (nova: Aba) => { setAba(nova); setAbertaId(null); };

  return (
    <div className="flex h-full min-h-0">
      {/* ---------------------------------------------------------- lista -- */}
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-3 py-3">
          <div className="mb-2.5 flex rounded-md bg-app p-0.5">
            <AbaBotao
              id="loja" ativa={aba === 'loja'} onClick={() => trocarAba('loja')}
              icone={Store} label="Caixa da loja"
            />
            <AbaBotao
              id="vendedor" ativa={aba === 'vendedor'} onClick={() => trocarAba('vendedor')}
              icone={Smartphone} label="Meu número"
            />
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, telefone ou mensagem"
              className="w-full pl-8"
            />
          </div>

          {aba === 'loja' && (
            <button
              onClick={() => setSemDono(!semDono)}
              className={cn(
                'mt-2 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-caption transition-colors',
                semDono
                  ? 'bg-gold-400/15 text-gold-300'
                  : 'text-muted hover:bg-elev/60 hover:text-ink-2',
              )}
            >
              <Inbox className="h-3.5 w-3.5" />
              Só as sem vendedor
              {semDonoTotal > 0 && !semDono && (
                <span className="ml-auto tabular-nums text-faint">{semDonoTotal}</span>
              )}
              {semDono && <X className="ml-auto h-3 w-3" />}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && !conversas ? (
            <div className="space-y-1.5 p-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-elev/40" />
              ))}
            </div>
          ) : (conversas ?? []).length === 0 ? (
            <Vazio aba={aba} filtrando={!!busca || semDono} />
          ) : (
            (conversas ?? []).map((c) => (
              <ItemLista
                key={c.id} conversa={c}
                ativa={c.id === abertaId}
                onAbrir={() => setAbertaId(c.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* --------------------------------------------------------- thread -- */}
      {aberta
        ? (
          <Thread
            key={aberta.id} conversa={aberta} onIrPara={irPara}
            onExcluida={() => setAbertaId(null)}
          />
        )
        : <NadaAberto />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ lista ══ */

function AbaBotao({
  ativa, onClick, icone: Icone, label, id,
}: {
  ativa: boolean; onClick: () => void; icone: typeof Store;
  label: string; id: Aba;
}) {
  return (
    <button
      onClick={onClick}
      data-aba={id}
      aria-pressed={ativa}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-caption font-medium transition-colors duration-150',
        ativa ? 'bg-surface text-ink shadow-painel' : 'text-muted hover:text-ink-2',
      )}
    >
      <Icone className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ItemLista({
  conversa: c, ativa, onAbrir,
}: { conversa: ConversaCompleta; ativa: boolean; onAbrir: () => void }) {
  const semDono = c.atendenteId == null;

  return (
    <button
      onClick={onAbrir}
      // Âncoras para o teste de interface. Sem elas o teste depende da ordem
      // das <span>, e qualquer ajuste de layout quebra a verificação — o que
      // faz a equipe passar a ignorar o teste em vez de consertar o código.
      data-conversa={c.id}
      data-cliente={c.cliente.nome ?? ''}
      data-sem-dono={semDono ? '1' : '0'}
      className={cn(
        'relative flex w-full gap-2.5 border-b border-line-soft px-3 py-2.5 text-left transition-colors duration-150',
        ativa ? 'bg-elev' : 'hover:bg-elev/50',
        // A barra dourada marca o que exige ação — não o que está selecionado.
        // Selecionado já se lê pelo fundo; sem dono é o que se perde na rolagem.
        semDono && 'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-gold-400',
      )}
    >
      <div className={cn(
        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
        semDono ? 'bg-gold-400 text-ongold' : 'bg-elev text-muted',
      )}>
        {iniciais(c.cliente.nome, c.telefone)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
            {c.cliente.nome ?? formatarTelefone(c.telefone)}
          </span>
          <span className="shrink-0 text-caption tabular-nums text-faint">
            {fmtQuando(c.ultimaMensagemEm)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-caption text-muted">
            {c.ultimaDirecao === 'saida' && <span className="text-faint">Você: </span>}
            {c.ultimaMensagem ?? 'Sem mensagens'}
          </p>
          {c.naoLidas > 0 && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-bold tabular-nums text-ongold">
              {c.naoLidas}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {/* A campanha aparece SEM clique. É o motivo de o CRM existir:
              origem escondida atrás de um clique não decide mídia nenhuma. */}
          {c.campanha && (
            <Badge variant={c.campanha.id === 'nao_rastreado' ? 'neutral' : 'navy'}
                   className="max-w-[170px] truncate">
              {c.campanha.nome}
            </Badge>
          )}
          {semDono
            ? <Badge variant="destaque" ponto>Sem vendedor</Badge>
            : c.atendente && <Badge variant="neutral">{c.atendente.nome.split(' ')[0]}</Badge>}
          {!c.janelaAberta && <Badge variant="attention">Janela fechada</Badge>}
        </div>
      </div>
    </button>
  );
}

function Vazio({ aba, filtrando }: { aba: Aba; filtrando: boolean }) {
  return (
    <div className="px-6 py-14 text-center">
      <Inbox className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-3 text-body text-ink-2">
        {filtrando ? 'Nada com esse filtro' : 'Nenhuma conversa'}
      </p>
      <p className="mt-1 text-caption text-muted">
        {filtrando
          ? 'Limpe a busca para ver a caixa inteira.'
          : aba === 'loja'
            ? 'Quando alguém chamar o número do anúncio, aparece aqui.'
            : 'As conversas que você abrir do seu número aparecem aqui.'}
      </p>
    </div>
  );
}

function NadaAberto() {
  return (
    <div className="flex flex-1 items-center justify-center bg-app">
      <div className="max-w-xs text-center">
        <MessageCircle className="mx-auto h-7 w-7 text-faint" />
        <p className="mt-3 text-body text-ink-2">Escolha uma conversa</p>
        <p className="mt-1 text-caption text-muted">
          As sem vendedor têm a barra dourada — são as que ainda esperam alguém.
        </p>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════ thread ══ */

function Thread({
  conversa: c, onIrPara, onExcluida,
}: {
  conversa: ConversaCompleta;
  onIrPara: (id: string, tipo: 'loja' | 'vendedor') => void;
  onExcluida: () => void;
}) {
  const { vendedorId, papel } = useSessao();
  const { data: mensagens, isLoading } = useMensagens(c.id);
  const { data: vendedores } = useVendedores();
  const { data: outras } = useConversasDoCliente(c.clienteId, c.id);

  const assumir = useAssumirConversa();
  const enviar = useEnviarMensagem();
  const abrirMeuNumero = useAbrirNoMeuNumero();
  const excluir = useExcluirConversa();

  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  // Espelha a RLS (`eh_gestor()`) — não é a regra em si, só evita mostrar um
  // botão que o banco recusaria.
  const souGestor = papel === 'admin' || papel === 'socio';

  const eu = vendedores?.find((v) => v.id === vendedorId);
  const meuCanal = c.canal.vendedorId === vendedorId;
  const semDono = c.atendenteId == null;

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens?.length, c.id]);

  async function mandar() {
    setErro(null);
    if (!texto.trim()) return;
    try {
      await enviar.mutateAsync({ conversaId: c.id, texto, autorId: vendedorId });
      setTexto('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para enviar');
    }
  }

  async function atenderPeloMeuNumero(t: string) {
    setErro(null);
    try {
      const novaId = await abrirMeuNumero.mutateAsync({
        conversaOrigemId: c.id, vendedorId, texto: t,
      });
      setDialogoAberto(false);
      // Sempre 'vendedor': a conversa que acabou de nascer é do número dele.
      onIrPara(novaId, 'vendedor');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para abrir');
    }
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-app">
      {/* ---------------------------------------------------- cabeçalho -- */}
      <header className="border-b border-line bg-surface px-5 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-title text-ink">
              {c.cliente.nome ?? formatarTelefone(c.telefone)}
            </h2>
            <p className="mt-0.5 text-caption tabular-nums text-muted">
              {formatarTelefone(c.telefone)}
              <span className="mx-1.5 text-faint">·</span>
              {c.canal.via === 'instagram'
                ? 'chegou pelo Instagram'
                : c.canal.tipo === 'loja'
                  ? 'chegou pelo número da loja'
                  : `seu número (${formatarTelefone(c.canal.telefone)})`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {semDono && (
              <Button
                size="sm"
                onClick={() => assumir.mutate({ conversaId: c.id, vendedorId })}
              >
                <User className="h-3.5 w-3.5" /> Assumir
              </Button>
            )}

            {/* O movimento central: o cliente chegou pela loja, o atendimento
                acontece do número do vendedor. Só faz sentido na aba da loja
                — e só pra WhatsApp: o cliente do Instagram não tem número. */}
            {c.canal.tipo === 'loja' && c.canal.via !== 'instagram' && (
              <Button size="sm" variant={semDono ? 'outline' : 'default'}
                      onClick={() => setDialogoAberto(true)}>
                <ArrowRightLeft className="h-3.5 w-3.5" /> Atender pelo meu número
              </Button>
            )}

            {linkWhatsApp(c.telefone) && (
              <a href={linkWhatsApp(c.telefone)!} target="_blank" rel="noreferrer"
                 title="Abrir no WhatsApp do celular">
                <Button size="sm" variant="ghost">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            )}

            {/* Só admin/sócio — dado de teste ou lixo, não ação do dia a dia. */}
            {souGestor && (
              <Button
                size="sm" variant="ghost" title="Excluir conversa"
                className="hover:text-negative"
                onClick={() => setConfirmandoExclusao(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {c.campanha && (
            <Badge variant={c.campanha.id === 'nao_rastreado' ? 'neutral' : 'navy'}>
              {c.campanha.nome}
            </Badge>
          )}
          {c.atendente && <Badge variant="neutral">Atende: {c.atendente.nome}</Badge>}
          {semDono && <Badge variant="destaque" ponto>Sem vendedor</Badge>}

          {/* A MESMA pessoa nos dois números. Sem este atalho o vendedor abre
              a thread da loja, não acha o que já falou, e repete a pergunta. */}
          {(outras ?? []).map((o) => (
            <button key={o.id} onClick={() => onIrPara(o.id, o.canal.tipo)}>
              <Badge variant="info" className="cursor-pointer hover:opacity-80">
                {o.canal.tipo === 'loja' ? <Store className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                {o.canal.tipo === 'loja' ? 'Conversa da loja' : `Número de ${o.canal.nome}`}
              </Badge>
            </button>
          ))}
        </div>
      </header>

      {/* ---------------------------------------------------- mensagens -- */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading && !mensagens ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-md bg-elev/40" />
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-1">
            {agruparPorDia(mensagens ?? []).map(({ dia, itens }) => (
              <div key={dia}>
                <div className="my-3 flex items-center gap-3">
                  <span className="h-px flex-1 bg-line-soft" />
                  <span className="text-caption text-faint">{dia}</span>
                  <span className="h-px flex-1 bg-line-soft" />
                </div>
                {itens.map((m) => (
                  <Balao key={m.id} mensagem={m}
                         autor={vendedores?.find((v) => v.id === m.autorId)?.nome} />
                ))}
              </div>
            ))}
            <div ref={fim} />
          </div>
        )}
      </div>

      {/* ----------------------------------------------------- composer -- */}
      <footer className="border-t border-line bg-surface px-5 py-3">
        {!c.janelaAberta ? (
          <JanelaFechada
            podeAbrir={c.canal.tipo === 'loja'}
            onAbrir={() => setDialogoAberto(true)}
          />
        ) : (
          <>
            {c.canal.tipo === 'loja' && !meuCanal && (
              // Responder pelo número da loja funciona, mas não é o fluxo: o
              // cliente ficaria com duas frentes de conversa e não saberia
              // para qual responder.
              <p className="mb-2 text-caption text-faint">
                Isto sai do número da loja. Para atender de verdade, use o seu.
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  // Enter envia, Shift+Enter quebra linha. É o que a mão do
                  // vendedor já sabe fazer de outros aplicativos.
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void mandar(); }
                }}
                rows={1}
                placeholder={`Mensagem para ${(c.cliente.nome ?? '').split(' ')[0] || 'o cliente'}`}
                className="max-h-32 min-h-[38px] flex-1 resize-none rounded-md border border-line bg-app px-3 py-2 text-body text-ink placeholder:text-faint focus:border-gold-400 focus:outline-none"
              />
              <Button onClick={() => void mandar()} disabled={!texto.trim() || enviar.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {erro && (
          <p className="mt-2 rounded-md border border-negative-line bg-negative-soft px-3 py-2 text-caption text-negative">
            {erro}
          </p>
        )}
      </footer>

      <DialogoMeuNumero
        aberto={dialogoAberto}
        cliente={c.cliente.nome}
        vendedor={eu?.nome ?? null}
        onFechar={() => { setDialogoAberto(false); setErro(null); }}
        onEnviar={(t) => void atenderPeloMeuNumero(t)}
        erro={dialogoAberto ? erro : null}
      />

      <Dialog open={confirmandoExclusao} onOpenChange={setConfirmandoExclusao}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Excluir conversa com "{c.cliente.nome ?? formatarTelefone(c.telefone)}"</DialogTitle>
          <DialogDescription>
            Apaga a conversa e todas as mensagens dela. Não pode ser desfeito.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmandoExclusao(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive" size="sm" disabled={excluir.isPending}
              onClick={async () => {
                await excluir.mutateAsync(c.id);
                setConfirmandoExclusao(false);
                onExcluida();
              }}
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * A janela de 24h fechada.
 *
 * Explica a regra e oferece a saída no mesmo lugar. Sem isso o vendedor digita,
 * clica em enviar, e a mensagem simplesmente não sai — o pior tipo de falha,
 * porque parece que o sistema quebrou quando na verdade a Meta é que recusa.
 */
function JanelaFechada({ podeAbrir, onAbrir }: { podeAbrir: boolean; onAbrir: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-attention-line bg-attention-soft px-3 py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-attention" />
      <div className="min-w-0 flex-1">
        <p className="text-caption text-ink-2">
          Passaram 24 horas desde a última mensagem do cliente. Neste número só
          sai template aprovado pela Meta — texto livre não é entregue.
        </p>
        {podeAbrir && (
          <Button size="sm" variant="outline" className="mt-2" onClick={onAbrir}>
            <ArrowRightLeft className="h-3.5 w-3.5" /> Atender pelo meu número
          </Button>
        )}
      </div>
    </div>
  );
}

function Balao({ mensagem: m, autor }: { mensagem: Mensagem; autor?: string }) {
  const minha = m.direcao === 'saida';

  return (
    <div className={cn('flex', minha ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-lg px-3 py-2',
          minha
            ? 'rounded-br-sm bg-gold-400/15 text-ink'
            : 'rounded-bl-sm border border-line-soft bg-surface text-ink',
        )}
      >
        {m.tipo !== 'texto' && (
          <div className="mb-1 flex items-center gap-1.5 text-caption text-muted">
            <Image className="h-3 w-3" />
            {{ imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento',
               localizacao: 'Localização', contato: 'Contato', sistema: 'Sistema',
               outro: 'Anexo' }[m.tipo] ?? 'Anexo'}
          </div>
        )}

        <p className="whitespace-pre-wrap break-words text-body">{m.conteudo}</p>

        <div className="mt-1 flex items-center justify-end gap-1 text-caption text-faint">
          {minha && autor && <span className="mr-auto">{autor.split(' ')[0]}</span>}
          <span className="tabular-nums">{fmtHora(m.enviadaEm)}</span>
          {minha && (
            m.status === 'falhou'
              ? <AlertTriangle className="h-3 w-3 text-negative" />
              : m.status === 'lida'
                ? <CheckCheck className="h-3 w-3 text-info" />
                : m.status === 'entregue'
                  ? <CheckCheck className="h-3 w-3" />
                  : <Check className="h-3 w-3" />
          )}
        </div>

        {m.erro && <p className="mt-1 text-caption text-negative">{m.erro}</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── auxiliares ── */

function iniciais(nome: string | null, telefone: string) {
  if (!nome?.trim()) return telefone.slice(-2);
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/**
 * Separadores de dia na conversa.
 *
 * Sem eles, uma thread de duas semanas vira um bloco só e o vendedor não sabe
 * se "amanhã eu te mando" foi ontem ou no mês passado.
 */
function agruparPorDia(ms: Mensagem[]) {
  const hoje = new Date().toDateString();
  const ontem = new Date(Date.now() - 86_400_000).toDateString();

  const grupos: { dia: string; itens: Mensagem[] }[] = [];
  for (const m of ms) {
    const d = new Date(m.enviadaEm);
    const chave = d.toDateString();
    const rotulo = chave === hoje ? 'Hoje'
      : chave === ontem ? 'Ontem'
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.dia === rotulo) ultimo.itens.push(m);
    else grupos.push({ dia: rotulo, itens: [m] });
  }
  return grupos;
}
