/**
 * SIMULADOR DO WEBHOOK DA META
 *
 * Serve para uma coisa: provar que o fluxo funciona ANTES de a verificação do
 * Meta Business sair. Ela leva dias e não depende de código — esperar por ela
 * para só então descobrir que o parser erra o `ctwa_clid` seria perder duas
 * semanas de graça.
 *
 * Os payloads aqui têm o formato EXATO que a Meta manda. Foram escritos a
 * partir da documentação, não inventados: se um campo tem nome errado aqui, o
 * teste passa e a produção quebra, que é o pior resultado possível.
 *
 * COMO USAR
 *
 *   Num terminal:
 *     cd supabase && supabase functions serve whatsapp --env-file .env.local
 *
 *   No outro:
 *     node functions/simular.mjs
 *
 * O .env.local precisa de WHATSAPP_VERIFY_TOKEN e WHATSAPP_APP_SECRET. Os
 * mesmos valores entram aqui por variável de ambiente — se divergirem, todo
 * evento é recusado com 403, que é exatamente o comportamento desejado.
 *
 * Antes de rodar, o canal precisa existir no banco:
 *
 *   insert into canal (id,nome,tipo,via,telefone,phone_number_id)
 *   values ('loja','Republic BT','loja','cloud_api','5585999990000','PNID_TESTE');
 */
import { createHmac } from 'node:crypto';

const URL_FN   = process.env.URL_WEBHOOK   ?? 'http://localhost:54321/functions/v1/whatsapp';
const SEGREDO  = process.env.WHATSAPP_APP_SECRET    ?? 'segredo-de-teste';
const VERIFY   = process.env.WHATSAPP_VERIFY_TOKEN  ?? 'token-de-teste';
const PNID     = process.env.PHONE_NUMBER_ID ?? 'PNID_TESTE';

const CLIENTE  = '5585991147264';
const NOME     = 'Ana Ribeiro';

let falhas = 0;
const ok = (c, m) => { console.log(`   ${c ? '✓' : '✗ FALHOU:'} ${m}`); if (!c) falhas++; };

/* -------------------------------------------------------------------------- */
/* O envelope, como a Meta monta                                              */
/* -------------------------------------------------------------------------- */
const envelope = (valor) => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: '102290129340398',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '5585999990000', phone_number_id: PNID },
        ...valor,
      },
    }],
  }],
});

const mensagem = (msg, nome = NOME) => envelope({
  contacts: [{ profile: { name: nome }, wa_id: CLIENTE }],
  messages: [{ from: CLIENTE, timestamp: String(Math.floor(Date.now() / 1000)), ...msg }],
});

/**
 * O `referral` — o objeto que justifica o número da loja existir.
 *
 * Chega UMA vez, na primeira mensagem de quem clicou no anúncio, e nunca mais.
 * `source_id` é o id do ANÚNCIO (não da campanha), e `ctwa_clid` é o clique.
 */
const REFERRAL = {
  source_url: 'https://fb.me/2abcXYZ',
  source_id: '120219876543210',
  source_type: 'ad',
  headline: 'Raquetes Nox com 20% off',
  body: 'Só nesta semana, em Fortaleza',
  media_type: 'image',
  ctwa_clid: 'ARAaBBBcccDDD111',
};

/* -------------------------------------------------------------------------- */
async function enviar(corpo, { assinar = true } = {}) {
  // A assinatura é sobre os BYTES que vão no corpo. Serializar duas vezes
  // (uma para assinar, outra para enviar) pode gerar strings diferentes e um
  // HMAC que não bate — por isso a string é criada uma vez só.
  const texto = JSON.stringify(corpo);
  const hmac  = createHmac('sha256', SEGREDO).update(texto).digest('hex');

  const r = await fetch(URL_FN, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(assinar ? { 'x-hub-signature-256': `sha256=${hmac}` } : {}),
    },
    body: texto,
  });
  return r.status;
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
console.log(`\n  Disparando contra ${URL_FN}\n`);

console.log('-- a verificação da URL (o que a Meta faz ao colar o endereço) --');
{
  const q = new URLSearchParams({
    'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '31337',
  });
  const r = await fetch(`${URL_FN}?${q}`);
  ok(r.status === 200 && (await r.text()) === '31337',
     'token certo devolve o desafio de volta');

  const q2 = new URLSearchParams({
    'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '31337',
  });
  ok((await fetch(`${URL_FN}?${q2}`)).status === 403, 'token errado é recusado');
}

console.log('\n-- a assinatura --');
ok(await enviar(mensagem({ id: 'wamid.SEM_ASSINATURA', type: 'text',
                           text: { body: 'oi' } }), { assinar: false }) === 403,
   'evento sem assinatura é recusado com 403');

console.log('\n-- o cliente que veio do anúncio --');
ok(await enviar(mensagem({
  id: 'wamid.SIM_ANUNCIO_1', type: 'text',
  text: { body: 'Oi, vi o anúncio da raquete Nox. Ainda tem?' },
  referral: REFERRAL,
})) === 200, 'primeira mensagem com referral: aceita');

await pausa(400);

console.log('\n-- o reenvio (a Meta manda de novo quando demora a receber 200) --');
ok(await enviar(mensagem({
  id: 'wamid.SIM_ANUNCIO_1', type: 'text',
  text: { body: 'Oi, vi o anúncio da raquete Nox. Ainda tem?' },
  referral: REFERRAL,
})) === 200, 'o reenvio também responde 200 — e não deve duplicar no banco');

console.log('\n-- a conversa seguindo --');
ok(await enviar(mensagem({ id: 'wamid.SIM_2', type: 'text',
                           text: { body: 'Qual o preço?' } })) === 200,
   'segunda mensagem, agora sem referral');

ok(await enviar(mensagem({
  id: 'wamid.SIM_3', type: 'image',
  image: { id: '1234567890', mime_type: 'image/jpeg', sha256: 'abc',
           caption: 'é essa aqui?' },
})) === 200, 'imagem com legenda');

ok(await enviar(mensagem({
  id: 'wamid.SIM_4', type: 'audio',
  audio: { id: '9876543210', mime_type: 'audio/ogg; codecs=opus', voice: true },
})) === 200, 'áudio (o formato preferido de metade dos clientes)');

console.log('\n-- os casos que quebram parser --');
ok(await enviar(mensagem({
  id: 'wamid.SIM_5', type: 'reaction',
  reaction: { message_id: 'wamid.SIM_2', emoji: '👍' },
})) === 200, 'reação: tipo que não existia quando o código foi escrito');

ok(await enviar(mensagem({ id: 'wamid.SIM_6', type: 'enquete_do_futuro' })) === 200,
   'tipo desconhecido não derruba o webhook — vira "outro" e fica na thread');

ok(await enviar(mensagem({
  id: 'wamid.SIM_7', type: 'text', text: { body: 'sem nome no perfil' },
}, undefined)) === 200, 'contato sem nome no perfil');

console.log('\n-- outro número na MESMA conta da Meta --');
{
  const corpo = envelope({
    contacts: [{ profile: { name: 'X' }, wa_id: CLIENTE }],
    messages: [{ from: CLIENTE, id: 'wamid.OUTRO_NUM', type: 'text',
                 timestamp: String(Math.floor(Date.now() / 1000)),
                 text: { body: 'oi' } }],
  });
  corpo.entry[0].changes[0].value.metadata.phone_number_id = 'PNID_QUE_NAO_EXISTE';
  ok(await enviar(corpo) === 200,
     'número desconhecido responde 200 e registra o erro — não trava a fila');
}

console.log('\n-- recibos de entrega --');
ok(await enviar(envelope({
  statuses: [{
    id: 'wamid.SAIDA_1', status: 'delivered', timestamp: '1756000000',
    recipient_id: CLIENTE,
    conversation: { id: 'conv1', origin: { type: 'service' } },
  }],
})) === 200, 'recibo de entrega aceito');

/* -------------------------------------------------------------------------- */
console.log(`\n${'═'.repeat(66)}`);
if (falhas) {
  console.log(`\n  ${falhas} disparo(s) não responderam o esperado.\n`);
  process.exit(1);
}
console.log(`
  Todos os disparos responderam como deviam.

  Isto prova que a função ACEITA e RECUSA na hora certa. O que ela GRAVOU é
  outra pergunta — confira no banco:

    select ca.nome as canal, cl.nome, c.nao_lidas, c.ctwa_clid,
           camp.nome as campanha, m.conteudo
    from v_conversa c
    join canal ca    on ca.id = c.canal_id
    join cliente cl  on cl.id = c.cliente_id
    left join campanha camp on camp.id = c.campanha_id
    left join mensagem m on m.conversa_id = c.id
    order by m.enviada_em;

  O que tem que estar lá:
    - UMA conversa, com 7 mensagens (o reenvio não conta)
    - ctwa_clid = ARAaBBBcccDDD111
    - campanha  = "Raquetes Nox com 20% off"
    - a reação e o tipo desconhecido presentes, não engolidos

  E os erros, que é onde mora a verdade:

    select recebido_em, erro from evento_webhook
    where erro is not null order by recebido_em desc;
`);
