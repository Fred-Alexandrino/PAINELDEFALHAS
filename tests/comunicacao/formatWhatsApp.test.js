const test = require('node:test');
const assert = require('node:assert/strict');
const { formatWhatsApp } = require('../../comunicacao/formatWhatsApp.js');
const ex = require('./exemplos.js');

test('exemplos do padrão passam sem alteração (idempotente)', () => {
  for (const k of ['ex1', 'ex2a', 'ex2b', 'ex3', 'ex4', 'ex46', 'exEnvio']) {
    assert.equal(formatWhatsApp(ex[k]), ex[k], k);
  }
});

test('**duplo** vira *simples*', () => {
  assert.equal(formatWhatsApp('Falha na **UFV Sarandi** hoje'), 'Falha na *UFV Sarandi* hoje');
});

test('sem espaço entre o asterisco e a palavra', () => {
  assert.equal(formatWhatsApp('Status: * UFV Sarandi *'), 'Status: *UFV Sarandi*');
  assert.equal(formatWhatsApp('situação _ pendente _'), 'situação _pendente_');
});

test('underline dentro de palavra não vira itálico', () => {
  assert.equal(formatWhatsApp('arquivo relatorio_final_v2.pdf'), 'arquivo relatorio_final_v2.pdf');
});

test('cabeçalho Markdown vira negrito', () => {
  assert.equal(formatWhatsApp('## Diagnóstico Técnico\nTexto'), '*Diagnóstico Técnico*\nTexto');
});

test('bullets "-", "*" e "+" viram "•"', () => {
  assert.equal(formatWhatsApp('- item 1\n* item 2\n+ item 3\n  •item 4'), '• item 1\n• item 2\n• item 3\n• item 4');
});

test('linha começando com *negrito* não vira bullet', () => {
  assert.equal(formatWhatsApp('*Atuação da Grid:*\n- a'), '*Atuação da Grid:*\n• a');
});

test('tabela Markdown vira lista', () => {
  const t = '| Usina | Status |\n|---|---|\n| UFV Sarandi | Pendente |';
  assert.equal(formatWhatsApp(t), '• Usina — Status\n• UFV Sarandi — Pendente');
});

test('link Markdown vira texto + url', () => {
  assert.equal(formatWhatsApp('Veja [o painel](https://x.com/a)'), 'Veja o painel (https://x.com/a)');
  assert.equal(formatWhatsApp('[https://x.com](https://x.com)'), 'https://x.com');
});

test('espaços no fim da linha e linhas em branco repetidas', () => {
  assert.equal(formatWhatsApp('a   \n\n\n\nb\t\n'), 'a\n\nb');
});

test('CRLF e espaço não separável', () => {
  assert.equal(formatWhatsApp('a\r\nb c'), 'a\nb c');
});

test('null/undefined viram string vazia', () => {
  assert.equal(formatWhatsApp(null), '');
  assert.equal(formatWhatsApp(undefined), '');
});
