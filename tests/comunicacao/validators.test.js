const test = require('node:test');
const assert = require('node:assert/strict');
const { validarSaida, usinasCitadas, diaNaoUtil } = require('../../comunicacao/validators.js');
const mapa = require('./mapeamento.snapshot.json');
const ex = require('./exemplos.js');

const ctx = (tipo, extra) => Object.assign({ tipo, mapeamento: mapa, dataHoraEnvio: ex.ENVIO_DIA_UTIL_MANHA }, extra || {});
const msgs = (...t) => ({ mensagens: t.map(x => (typeof x === 'string' ? { texto: x } : x)) });
const codigos = l => l.map(x => x.codigo);
const limpo = (r, nome) => {
  assert.deepEqual(r.erros, [], nome + ' — erros: ' + JSON.stringify(r.erros));
  assert.deepEqual(r.avisos, [], nome + ' — avisos: ' + JSON.stringify(r.avisos));
};

// ── exemplos do padrão: DEVEM passar sem erro e sem aviso ──
test('3.8 Exemplo 1 (cliente) passa', () => limpo(validarSaida(msgs(ex.ex1), ctx('cliente')), 'ex1'));
test('3.8 Exemplo 2 dividido em 2 caixas passa', () => limpo(validarSaida(msgs(ex.ex2a, ex.ex2b), ctx('cliente')), 'ex2'));
test('3.8 Exemplo 3 (cliente) passa', () => limpo(validarSaida(msgs(ex.ex3), ctx('cliente')), 'ex3'));
test('3.8 Exemplo 4 (cliente) passa', () => limpo(validarSaida(msgs(ex.ex4), ctx('cliente')), 'ex4'));
test('4.6 Exemplo técnico passa', () => limpo(validarSaida(msgs(ex.ex46), ctx('tecnico')), 'ex46'));
test('8.7 Texto de envio de relatório passa', () => limpo(validarSaida(msgs(ex.exEnvio), ctx('envio_relatorio')), 'envio'));
test('6 E-mail com assunto e assinatura passa', () => limpo(validarSaida(msgs(ex.exEmail), ctx('email')), 'email'));

// ── regras: cada uma dispara quando deve ──
test('metalinguagem é erro', () => {
  const r = validarSaida(msgs('Aqui está o texto:\n\nFalha na *UFV Sarandi*.\n\nSeguimos à disposição.'), ctx('cliente'));
  assert.ok(codigos(r.erros).includes('metalinguagem'));
});

test('saudação escrita pela IA gera aviso (a saudação é do Fred)', () => {
  const r = validarSaida(msgs('Olá, Iago. Tudo bem?\n\n' + ex.ex3), ctx('cliente'));
  assert.deepEqual(codigos(r.avisos), ['saudacao']);
  assert.deepEqual(r.erros, []);
});

test('usina fora do mapeamento é erro (ex.: Sal Energia)', () => {
  const r = validarSaida(msgs(ex.ex1.replace('UFV Sete Lagoas', 'UFV Vitesse')), ctx('cliente'));
  assert.deepEqual(codigos(r.erros), ['usina_fora_mapeamento']);
});

test('numeral romano conta: "UFV Colíder III" não existe', () => {
  const r = validarSaida(msgs('Falha na *UFV Colíder III*.\n\nSeguimos à disposição.'), ctx('cliente'));
  assert.ok(codigos(r.erros).includes('usina_fora_mapeamento'));
});

test('usina sem negrito no WhatsApp é aviso; no e-mail não', () => {
  const t = 'Falha no inversor da UFV Sarandi.\n\nSeguimos à disposição.';
  assert.deepEqual(codigos(validarSaida(msgs(t), ctx('cliente')).avisos), ['usina_sem_negrito']);
  const e = validarSaida(msgs({ assunto: 'UFV Sarandi — Falha', texto: t + '\n\nAtenciosamente,\n\nFred Alexandrino\nSupervisor de O&M\nGrid Co.' }), ctx('email'));
  assert.deepEqual(e.avisos, []);
});

test('bullet "-" é aviso', () => {
  const r = validarSaida(msgs('Itens:\n- *UFV Sarandi* pendente\n\nAguardo retorno.'), ctx('tecnico'));
  assert.ok(codigos(r.avisos).includes('bullet'));
});

test('Markdown (**, #, tabela, link) é erro no WhatsApp', () => {
  const r = validarSaida(msgs('# Título\n**UFV Sarandi**\n| a | b |\n[x](https://y.z)\n\nSeguimos à disposição.'), ctx('cliente'));
  assert.equal(codigos(r.erros).filter(c => c === 'markdown').length, 4);
});

test('data fechada dependendo de fabricante é aviso; com "a confirmar" não', () => {
  const t = 'O fabricante enviará a peça até 25/11 para a *UFV Sarandi*.\n\nSeguimos à disposição.';
  assert.ok(codigos(validarSaida(msgs(t), ctx('cliente')).avisos).includes('prazo_terceiro'));
  const t2 = 'O fabricante enviará a peça, com previsão a confirmar (estimativa 25/11), para a *UFV Sarandi*.\n\nSeguimos à disposição.';
  assert.ok(!codigos(validarSaida(msgs(t2), ctx('cliente')).avisos).includes('prazo_terceiro'));
});

test('atividade às 19h, no sábado ou em feriado sem ressalva de HH é aviso', () => {
  const casos = [
    'A manobra na *UFV Sarandi* será às 19h.',
    'A manobra na *UFV Sarandi* será no sábado.',
    'A manobra na *UFV Sarandi* será em 25/12.',
    'A manobra na *UFV Sarandi* será em 21/11/2026.', // sábado
  ];
  for (const c of casos) assert.ok(codigos(validarSaida(msgs(c + '\n\nSeguimos à disposição.'), ctx('cliente')).avisos).includes('hh_extra'), c);
  const ok = 'A manobra na *UFV Sarandi* será em 18/11 às 09h.\n\nSeguimos à disposição.';
  assert.ok(!codigos(validarSaida(msgs(ok), ctx('cliente')).avisos).includes('hh_extra'));
});

test('feriados nacionais (inclui Consciência Negra e móveis)', () => {
  assert.equal(diaNaoUtil(2026, 11, 20), true);
  assert.equal(diaNaoUtil(2026, 4, 3), true); // Sexta-feira Santa 2026
  assert.equal(diaNaoUtil(2026, 11, 18), false);
});

test('afirmação de culpa é aviso (técnico e cliente)', () => {
  const r = validarSaida(msgs('A falha na *UFV Sarandi* foi por erro de operação.\n\nAguardo retorno.'), ctx('tecnico'));
  assert.ok(codigos(r.avisos).includes('culpa'));
});

test('tom punitivo com técnico é erro', () => {
  const r = validarSaida(msgs('Este é o último aviso sobre a *UFV Sarandi*.\n\nAguardo retorno.'), ctx('tecnico'));
  assert.ok(codigos(r.erros).includes('tom_punitivo'));
});

test('mesmo técnico em caixas separadas é erro', () => {
  const r = validarSaida(msgs('Pendência na *UFV Colorado I*.\n\nAguardo retorno.', 'Pendência na *UFV Sarandi*.\n\nAguardo retorno.'), ctx('tecnico'));
  assert.ok(codigos(r.erros).includes('tecnico_separado'));
});

test('técnicos diferentes em caixas separadas não é erro', () => {
  const r = validarSaida(msgs('Pendência na *UFV Colíder I*.\n\nAguardo retorno.', 'Pendência na *UFV Crateús*.\n\nAguardo retorno.'), ctx('tecnico'));
  assert.ok(!codigos(r.erros).includes('tecnico_separado'));
});

test('termos proibidos (seção 7) são erro em texto formal, não em WhatsApp de cliente', () => {
  const t = 'Conforme conversa no grupo do WhatsApp, a *UFV Sarandi* segue parada.\n\nSeguimos à disposição.';
  assert.ok(codigos(validarSaida(msgs(t), ctx('envio_relatorio')).erros).includes('termo_proibido'));
  assert.ok(!codigos(validarSaida(msgs(t), ctx('cliente')).erros).includes('termo_proibido'));
});

test('"grupo gerador" não é termo proibido', () => {
  const t = 'Encaminhamos em anexo o relatório do grupo gerador da *UFV Sarandi*.\n\nSeguimos à disposição.';
  assert.deepEqual(validarSaida(msgs(t), ctx('envio_relatorio')).erros, []);
});

test('cordialidade anunciada é aviso', () => {
  const r = validarSaida(msgs('Solicitamos, de forma cordial, o posicionamento sobre a *UFV Sarandi*.\n\nSeguimos à disposição.'), ctx('cliente'));
  assert.ok(codigos(r.avisos).includes('cordialidade_anunciada'));
});

test('encerramento conferido só na última caixa', () => {
  const r = validarSaida(msgs(ex.ex2a, 'Ficamos no aguardo da sua decisão sobre a *UFV Nova Londrina II*.'), ctx('cliente'));
  assert.deepEqual(r.avisos.map(a => [a.codigo, a.caixa]), [['encerramento', 1]]);
});

test('técnico precisa terminar com "Aguardo retorno."', () => {
  const r = validarSaida(msgs('Pendência na *UFV Sarandi*.\n\nSeguimos à disposição.'), ctx('tecnico'));
  assert.ok(codigos(r.avisos).includes('encerramento'));
});

test('e-mail sem assunto e sem assinatura gera avisos', () => {
  const r = validarSaida(msgs({ texto: 'Falha na UFV Sarandi.\n\nSeguimos à disposição.' }), ctx('email'));
  assert.deepEqual(codigos(r.avisos).sort(), ['email_assinatura', 'email_assunto']);
});

test('saída vazia é erro', () => {
  assert.deepEqual(codigos(validarSaida({ mensagens: [] }, ctx('cliente')).erros), ['vazio']);
});

test('extração de usinas com conectores e romanos', () => {
  const c = usinasCitadas('na *UFV Santo Antonio da Platina* e na UFV Coração I e II, e UFV Nova Londrina II.');
  assert.deepEqual(c.map(x => x.nome), ['Santo Antonio da Platina', 'Coração I', 'Nova Londrina II']);
});

test('assinatura de e-mail em mensagem de WhatsApp é aviso', () => {
  const r = validarSaida(msgs(ex.ex3 + '\n\nAtenciosamente,\n\nFred Alexandrino\nSupervisor de O&M\nGrid Co.'), ctx('cliente'));
  assert.ok(codigos(r.avisos).includes('assinatura_whatsapp'));
});

test('e-mail pode terminar com "Ficamos no aguardo..." antes da assinatura', () => {
  const texto = 'Solicitamos a autorização para o deslocamento do Supervisor de Campo Vitor Valadares até a *UFV Colíder I*.\n\nFicamos no aguardo da aprovação para o agendamento da logística.\n\nAtenciosamente,\n\nFred Alexandrino\nSupervisor de O&M\nGrid Co.';
  const r = validarSaida(msgs({ assunto: 'Solicitação de deslocamento — UFV Colíder I', texto }), ctx('email'));
  assert.ok(!codigos(r.avisos).includes('encerramento'));
});
