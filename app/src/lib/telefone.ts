/**
 * Telefone — a chave que costura cliente, lead, conversa e venda.
 *
 * Mora aqui, sozinho, porque os dois lados da camada de dados precisam dele: o
 * mock e o Supabase. Deixá-lo em um deles criaria import circular, e duplicá-lo
 * seria pior — se a tela normalizar de um jeito e o banco de outro, o
 * casamento falha em silêncio e a mesma pessoa vira dois cadastros.
 *
 * Espelha `normalizar_telefone` de `supabase/sql/01-nucleo.sql`. Mudou lá,
 * muda aqui.
 */
export function normalizarTelefone(bruto: string): string | null {
  if (!bruto?.trim()) return null;
  let d = bruto.replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return null;

  // Prefixar 55 às cegas quebra número estrangeiro: +1 415 555 0100 tem 11
  // dígitos e viraria "5514155550100".
  if (d.length === 10 || d.length === 11) {
    const ddd = Number(d.slice(0, 2));
    if (ddd >= 11 && ddd <= 99 && (d.length === 10 || d[2] === '9')) d = '55' + d;
  }
  if (!d.startsWith('55')) return d;

  // 55 + DDD + 8 dígitos = celular antigo, sem o nono dígito.
  if (d.length === 12 && '6789'.includes(d[4])) {
    d = d.slice(0, 4) + '9' + d.slice(4);
  }
  return d;
}

export function formatarTelefone(e164: string | null): string {
  if (!e164) return '—';
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/**
 * Link para abrir a conversa no WhatsApp do celular.
 *
 * Continua útil mesmo com a caixa de entrada pronta: é o caminho do vendedor
 * que prefere responder pelo aparelho. No canal por QR a thread é a mesma nos
 * dois lugares — é o mesmo WhatsApp, espelhado.
 */
export function linkWhatsApp(telefone: string | null, texto?: string): string | null {
  if (!telefone) return null;
  const t = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return `https://wa.me/${telefone}${t}`;
}
