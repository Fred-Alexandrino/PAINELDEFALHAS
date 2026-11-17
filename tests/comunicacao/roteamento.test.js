const test = require('node:test');
const assert = require('node:assert/strict');
const { resolver, nomeFormal, CONTATOS_CLIENTE } = require('../../comunicacao/roteamento.js');
const mapa = require('./mapeamento.snapshot.json');

test('contatos são exatamente os da seção 10', () => {
  assert.deepEqual(CONTATOS_CLIENTE.map(c => [c.cliente, c.nome, !!c.incluirTecnico]),
    [['2C Energia', 'Carol', false], ['Thopen', 'Iago', false], ['Renogrid', 'Vitor', true]]);
});

test('técnico: várias UFVs do mesmo técnico viram UMA mensagem', () => {
  const r = resolver({ tipo: 'tecnico', ufvs: ['Colorado I', 'Sarandi', 'Mandaguaçu'], mapeamento: mapa });
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].tecnico, 'Marcos Camargo');
  assert.deepEqual(r.grupos[0].destinatarios, ['Marcos Camargo']);
  assert.deepEqual(r.grupos[0].ufvs.map(u => u.ufv), ['UFV Colorado I', 'UFV Sarandi', 'UFV Mandaguaçu']);
});

test('técnico: técnicos diferentes viram mensagens separadas', () => {
  const r = resolver({ tipo: 'tecnico', ufvs: ['Colíder I', 'Colíder II', 'Crateús'], mapeamento: mapa });
  assert.deepEqual(r.grupos.map(g => [g.tecnico, g.ufvs.length]), [['Deivity Saugo', 2], ['Railson Gomes', 1]]);
});

test('cliente 2C Energia → Carol', () => {
  const r = resolver({ tipo: 'cliente', ufvs: ['Tupi Paulista I'], mapeamento: mapa });
  assert.deepEqual(r.grupos[0].destinatarios, ['Carol']);
  assert.equal(r.grupos[0].cliente, '2C Energia');
});

test('cliente Thopen → Iago', () => {
  const r = resolver({ tipo: 'cliente', ufvs: ['Nova Londrina II'], mapeamento: mapa });
  assert.deepEqual(r.grupos[0].destinatarios, ['Iago']);
});

test('cliente Renogrid → Vitor + técnico da usina', () => {
  const r = resolver({ tipo: 'cliente', ufvs: ['Colíder I', 'Nobres'], mapeamento: mapa });
  assert.equal(r.grupos.length, 1);
  assert.deepEqual(r.grupos[0].destinatarios, ['Vitor', 'Deivity Saugo', 'Valmir Júnior']);
});

test('e-mail e envio de relatório usam o mesmo roteamento do cliente', () => {
  for (const tipo of ['email', 'envio_relatorio']) {
    const r = resolver({ tipo, ufvs: ['Sete Lagoas'], mapeamento: mapa });
    assert.deepEqual(r.grupos[0].destinatarios, ['Carol'], tipo);
  }
});

test('UFVs de clientes diferentes → uma saída por cliente', () => {
  const r = resolver({ tipo: 'cliente', ufvs: ['Sete Lagoas', 'Sarandi', 'Araputanga'], mapeamento: mapa });
  assert.deepEqual(r.grupos.map(g => [g.cliente, g.ufvs.length, g.destinatarios.join('+')]), [['2C Energia', 2, 'Carol'], ['Thopen', 1, 'Iago']]);
});

test('usina fora do mapeamento é ignorada com aviso (Sal Energia não existe mais)', () => {
  const r = resolver({ tipo: 'cliente', ufvs: ['Vitesse', 'Sete Lagoas'], mapeamento: mapa });
  assert.deepEqual(r.naoEncontradas, ['Vitesse']);
  assert.equal(r.grupos.length, 1);
  assert.match(r.avisos[0], /Vitesse/);
});

test('nome da usina normalizado para "UFV <Nome>", sem acento importar na busca', () => {
  assert.equal(nomeFormal('Sarandi'), 'UFV Sarandi');
  assert.equal(nomeFormal('UFV Sarandi'), 'UFV Sarandi');
  const r = resolver({ tipo: 'tecnico', ufvs: ['ufv cratEus'], mapeamento: mapa });
  assert.equal(r.grupos[0].ufvs[0].ufv, 'UFV Crateús');
});

test('UFV repetida entra uma vez só', () => {
  const r = resolver({ tipo: 'tecnico', ufvs: ['Sarandi', 'Sarandi'], mapeamento: mapa });
  assert.equal(r.grupos[0].ufvs.length, 1);
});

test('tipo inválido dá erro', () => {
  assert.throws(() => resolver({ tipo: 'sms', ufvs: [], mapeamento: mapa }));
});
