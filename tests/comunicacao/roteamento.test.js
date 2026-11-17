const test = require('node:test');
const assert = require('node:assert/strict');
const { resolver, nomeFormal } = require('../../comunicacao/roteamento.js');
const mapa = require('./mapeamento.snapshot.json');

test('técnico: várias UFVs do mesmo técnico viram UMA mensagem', () => {
  const r = resolver({ tipo: 'tecnico', ufvs: ['Colorado I', 'Sarandi', 'Mandaguaçu'], mapeamento: mapa });
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].tecnico, 'Marcos Camargo');
  assert.deepEqual(r.grupos[0].destinatarios, ['Pedro Candido']); // supervisor de campo (Nexus)
  assert.deepEqual(r.grupos[0].ufvs.map(u => u.ufv), ['UFV Colorado I', 'UFV Sarandi', 'UFV Mandaguaçu']);
});

test('técnico: técnicos diferentes viram mensagens separadas', () => {
  const r = resolver({ tipo: 'tecnico', ufvs: ['Colíder I', 'Colíder II', 'Crateús'], mapeamento: mapa });
  assert.deepEqual(r.grupos.map(g => [g.tecnico, g.ufvs.length]), [['Deivity Saugo', 2], ['Railson Gomes', 1]]);
});

test('cliente: sem contato fixo — destinatário só se o Fred digitar', () => {
  for (const tipo of ['cliente', 'email', 'envio_relatorio']) {
    const r = resolver({ tipo, ufvs: ['Nova Londrina II'], mapeamento: mapa });
    assert.deepEqual(r.grupos[0].destinatarios, [], tipo);
    assert.equal(r.grupos[0].cliente, 'Thopen');
  }
  const r = resolver({ tipo: 'cliente', ufvs: ['Colíder I'], mapeamento: mapa, para: 'Gabriel' });
  assert.deepEqual(r.grupos[0].destinatarios, ['Gabriel']);
});

test('UFVs de clientes diferentes → uma saída por cliente', () => {
  const r = resolver({ tipo: 'cliente', ufvs: ['Sete Lagoas', 'Sarandi', 'Araputanga'], mapeamento: mapa });
  assert.deepEqual(r.grupos.map(g => [g.cliente, g.ufvs.length]), [['2C Energia', 2], ['Thopen', 1]]);
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

test('técnico: mensagem dirigida ao supervisor de campo; sem cadastro gera aviso', () => {
  const r = resolver({ tipo: 'tecnico', ufvs: ['Colíder I', 'Nova Ipixuna I'], mapeamento: mapa });
  assert.deepEqual(r.grupos.map(g => [g.tecnico, g.destinatarios.join('+')]), [['Deivity Saugo', 'Vitor Valadares'], ['Heitor Vidal Silva', '']]);
  assert.ok(r.avisos.some(a => /Nova Ipixuna I: sem supervisor de campo/.test(a)));
});
