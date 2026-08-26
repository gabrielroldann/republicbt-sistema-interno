# Banco — Republic BT

**Um banco só.** Site, dashboard e integração com o Kommo leem e escrevem aqui.
É isso que dispensa sincronizador entre catálogos e evita o "o site diz que tem e
a loja diz que não".

## Aplicar

No SQL Editor do Supabase, **nesta ordem**:

| Arquivo | O que traz | Depende de |
|---|---|---|
| `sql/01-nucleo.sql` | cliente, vendedor, produto, estoque, venda, pagamento, despesa, conta, meta | — |
| `sql/02-crm.sql` | campanha, custo de mídia, etapa, lead, **canal**, conversa, mensagem | 01 |
| `sql/03-site.sql` | fotos, reserva de estoque, sessão do site | 01 |
| `sql/04-acesso.sql` | papéis, configuração e **RLS** | 01, 02 |
| `sql/05-funil.sql` | criar, renomear, reordenar e excluir etapa | 02, 04 |
| `sql/06-custos.sql` | custo fixo mensal e `aplicar_custos_fixos` | 01, 04 |

A ordem não é preferência: o `02` usa `cliente` e `normalizar_telefone`, e o `03`
usa `produto` e `movimento_estoque`.

> O `02` chamava-se `02-kommo.sql`. Com o Kommo fora, o **lead deixou de ser
> espelho de outro sistema e passou a nascer aqui** — por isso virou `02-crm.sql`,
> com etapa, motivo de perda, conversa e mensagem.

## Testar

```bash
cd supabase/sql
npm install
npm test          # 60 casos de regra de negócio
npm run ensaio    # o fluxo completo, narrado
npm run teste-acesso   # 30 casos de nível de acesso
npm run teste-funil    # 30 casos de personalização do funil
npm run teste-caixa    # 48 casos da chegada do cliente pelo WhatsApp
npm run teste-custos   # 22 casos de custo fixo e competência
```

### O webhook, sem depender da Meta

A verificação do Meta Business leva dias e não depende de código. Para não
esperar por ela só para descobrir que o parser erra o `ctwa_clid`:

```bash
supabase functions serve whatsapp --env-file .env.local   # num terminal
node functions/simular.mjs                                # no outro
```

O simulador dispara payloads no formato exato da Meta: mensagem de anúncio,
orgânica, imagem, áudio, reação, tipo desconhecido, reenvio duplicado, número
não cadastrado e recibo de entrega.

60 casos num Postgres real embutido — sem banco, sem internet, sem configuração.
Rode depois de qualquer mexida no SQL.

Os testes não verificam se o SQL roda; verificam se as **regras de negócio**
continuam valendo depois de virarem tabela:

- telefone normalizado, incluindo o nono dígito e o número estrangeiro
- os quatro congelamentos (custo, preço, comissão, taxa de pagamento)
- trade-in reduz o a receber e **não** a margem
- comissão sobre o recebido, não sobre o contratado
- estoque como movimento, sem campo de saldo
- status de conta derivado, para não envelhecer em silêncio
- despesa do resultado exclui compra de estoque
- reserva do site sem furar o estoque do balcão
- webhook repetido sem dar baixa duas vezes
- **dois vendedores não assumem a mesma conversa** — a trava do atendimento
- janela de 24h da Meta calculada, nunca guardada
- perder lead sem motivo é rejeitado

## Decisões que estão codificadas aqui

**Nenhum campo de saldo.** `produto` não tem `estoque`; a view `v_produto`
calcula. Campo de saldo é o que desincroniza.

**Nenhum campo de status em `conta`.** Status guardado envelhece: uma conta
gravada como "pendente" continua "pendente" depois de vencida e ninguém percebe.
A view `v_conta` deriva de `pago_em` e `vencimento`.

**`venda.taxa_pct` é coluna.** Antes a taxa da forma de pagamento era consultada
a cada leitura — bastava a maquininha mudar de preço para toda a margem histórica
mudar junto. Foi o furo que a migração para o banco expôs.

**`v_venda_completa` é a única definição das contas de margem.** Site, dashboard
e qualquer relatório futuro respondem o mesmo número porque leem a mesma fórmula.

**`assumir_conversa` é UPDATE condicional, não leitura seguida de escrita.** Em
dois passos, os dois vendedores leriam "está livre" antes de qualquer um
escrever, e os dois entrariam. Mesma classe de problema da reserva de estoque.

**A janela de 24h não é coluna.** Ela é calculada a partir da última mensagem
*do cliente*, na view `v_conversa`. Guardada como campo, envelheceria errado —
igual ao status da conta. E só vale no canal `cloud_api`: no canal por QR não
existe janela, e mostrar um aviso que não se aplica ensina a ignorar avisos.

**A conversa pertence a um CANAL, e é única por (canal, telefone).** O mesmo
cliente tem duas conversas abertas ao mesmo tempo — a que ele começou no número
da loja e a que o vendedor abriu do número dele. O índice antigo, único só por
telefone, **rejeitava a segunda**: o fluxo inteiro morria com erro de chave
duplicada, que não diz nada a quem lê. E era parcial em `status <> 'resolvida'`,
o que dava thread nova a quem voltasse depois de resolvido, partindo o histórico.

**`receber_mensagem` é a única porta de entrada, e é idempotente.** Cliente,
thread, lead e mensagem numa transação só — espalhado pela aplicação, uma falha
no meio deixaria conversa sem lead ou lead sem conversa, e isso não se descobre
no dia, se descobre no fim do mês quando o relatório não bate. A idempotência
por `wa_message_id` não é zelo: a Meta reenvia sempre que não recebe 200 rápido,
e sem a trava qualquer lentidão nossa vira mensagem repetida e não-lida inflada.

**`mensagem` tem dois relógios: `enviada_em` e `criada_em`.** A Meta entrega
fora de ordem — uma mensagem das 14h02 chega depois da das 14h05. Ordenar pelo
nosso relógio montaria a conversa embaralhada, com a resposta antes da pergunta.
Por isso `ultima_mensagem_em` usa `greatest`: a mensagem atrasada não faz a
conversa voltar no tempo e sumir do topo da fila.

**"Não rastreado" não é uma origem, é a ausência dela.** `campanha_origem` do
cliente é congelada no primeiro toque CONHECIDO, não na primeira linha gravada —
senão quem manda um "oi" solto na segunda e clica no anúncio na terça fica sem
origem para sempre, e o anúncio perde o crédito da venda.

**O webhook não entrega o id da campanha, só o do anúncio.** No `referral` vem
`source_id`, que é o anúncio. Subir para conjunto e campanha exige a API de
Marketing, que é outra credencial e outro momento — então a campanha nasce como
`meta:ad:<id>` com o título do anúncio por nome, e a hierarquia é preenchida
depois. Guardar o anúncio é mais útil do que parece: é o nível em que se decide
qual criativo cortar.

**Token e app secret nunca tocam o banco.** A tabela `canal` guarda
`phone_number_id` e `instancia`, que são identificadores, e é legível por
qualquer vendedor. Os segredos vivem em variável de ambiente da Edge Function.

**Esconder na tela não é controle de acesso.** O Supabase expõe uma API REST
sobre as tabelas, e a chave anônima está no JavaScript do navegador. Um vendedor
curioso abre o console e consulta direto. Por isso o controle mora em RLS
(`04-acesso.sql`) e a tela apenas reflete.

**`for all` inclui SELECT — e policies permissivas se combinam com OU.** Uma
policy de escrita `for all using (está_logado)` ao lado de uma leitura restrita
**anula** a restrição. Esse furo existiu aqui: o vendedor enxergava o funil
inteiro mesmo com a configuração desligada, sem erro nenhum. Escrita agora é
sempre `for insert` / `for update` / `for delete`.

**UPDATE bloqueado por RLS não dá erro** — afeta zero linhas, em silêncio. Código
que confia em "não deu erro, então gravou" mente para o usuário.

**O vendedor não lê a tabela `produto`.** RLS é por linha, não por coluna, e é lá
que mora o `custo`. Ele lê `v_produto_venda`, que simplesmente não tem a coluna.
Mesma ideia em `v_venda_vendedor`: sem custo, sem margem, mas com a comissão
dele — que é o salário dele.

**O funil é personalizável, mas não quebrável.** Nenhuma sequência de cliques
deixa a loja sem etapa de ganho, sem etapa aberta, ou com lead apontando para
etapa que não existe — um gatilho adiado valida isso a cada mudança.

**O `tipo` e o `id` de uma etapa nunca mudam.** Transformar "Proposta enviada"
em tipo `ganho` faria o faturamento do histórico mudar sozinho, sem ninguém ter
vendido nada. E mudar o `id` deixaria os leads órfãos.

**Excluir etapa move os leads, não apaga.** Lead é histórico de relacionamento
e, quando virou venda, histórico financeiro. `excluir_etapa` exige para onde os
leads vão e devolve quantos foram movidos.

**Reordenar recebe a lista inteira, nunca "mova X para N".** Não existe estado
intermediário inconsistente, e duas pessoas arrastando ao mesmo tempo terminam
numa das duas ordens — nunca numa mistura.

**Custo fixo é MODELO, despesa é lançamento.** "Aluguel é R$3.400 por mês" é
`custo_fixo`; "em agosto pagamos R$3.400" é `despesa`. O modelo GERA a despesa,
e o resto do sistema continua lendo só `despesa` — se o lucro lesse de um lugar
e o fluxo de caixa de outro, os dois divergiriam no primeiro reajuste e ninguém
saberia qual está certo.

**`aplicar_custos_fixos` é idempotente, e o vínculo é por id.** Rodar N vezes
deixa o mês igual. Sem isso, cada salvamento na tela empilharia mais um aluguel
e o lucro afundaria — um bug que parece problema de negócio, e por isso demora
semanas para ser reconhecido como bug. O vínculo é `custo_fixo_id`, não a
descrição: renomear "Energia" para "Energia elétrica" não pode duplicar o mês.

**Mês fechado só muda se alguém pedir por escrito.** Reajustar o aluguel hoje
não reescreve o resultado de março — `aplicar_custos_fixos` recusa competência
passada a menos que receba `p_forcar => true`.

**Competência é COLUNA, não expressão no índice.** `date_trunc('month', data)`
seria o natural, mas depende do fuso e por isso não é `IMMUTABLE` — o Postgres
recusa no índice.

**Não crie `using (true)` "só para testar":** isso publica o faturamento da loja
na internet.
