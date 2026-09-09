/**
 * DIAGNÓSTICO DE FALHA NA EMISSÃO DA NFC-e.
 *
 * Achado na bateria de testes: 2 das 3 vendas reais que já existiam
 * ficaram com `status_nfe = null` para sempre — nem 'autorizado' nem
 * 'erro_autorizacao'. Causa: `focus-nfe-emitir` só sabia gravar essas duas
 * respostas; qualquer outro formato de erro que a Focus NFe devolvesse
 * (autenticação, payload inválido, etc — que não vêm como
 * `{status:'erro_autorizacao'}`) passava batido, sem tocar a venda. A nota
 * "sumia" sem deixar rastro em quem for investigar depois, só na tela de
 * quem estava olhando na hora.
 *
 * Duas mudanças:
 *   1. Novo valor 'erro_envio' em status_nfe — cobre qualquer falha que não
 *      seja rejeição formal da SEFAZ (é isso que 'erro_autorizacao' já
 *      cobria e continua cobrindo).
 *   2. Coluna `mensagem_nfe` — guarda o motivo em texto, pra não precisar
 *      abrir o Focus NFe toda vez que uma nota falhar.
 */

alter table venda drop constraint venda_status_nfe_check;
alter table venda add constraint venda_status_nfe_check
  check (status_nfe in ('pendente', 'autorizado', 'erro_autorizacao', 'erro_envio', 'denegado', 'cancelado'));

alter table venda add column if not exists mensagem_nfe text;
comment on column venda.mensagem_nfe is
  'Motivo da última falha de emissão (erro_autorizacao ou erro_envio) -- vazio quando autorizado ou nunca tentado.';
