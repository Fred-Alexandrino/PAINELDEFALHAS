/* Central de Mensagens — roteamento (seção 10 do padrão)
 * usina → cliente → destinatário(s). Fonte das usinas/técnicos: o mapeamento
 * oficial (/mapeamento-ufvs), passado como parâmetro — nada é inventado aqui.
 * Contatos de cliente: só os definidos na seção 10.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.GridCom = Object.assign(root.GridCom || {}, api); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CONTATOS_CLIENTE = [
    { cliente: '2C Energia', nome: 'Carol' },
    { cliente: 'Thopen', nome: 'Iago' },
    { cliente: 'Renogrid', nome: 'Vitor', incluirTecnico: true },
  ];

  const TIPOS = {
    cliente: { canal: 'whatsapp', publico: 'cliente', rotulo: 'Cliente' },
    tecnico: { canal: 'whatsapp', publico: 'tecnico', rotulo: 'Técnico' },
    email: { canal: 'email', publico: 'cliente', rotulo: 'E-mail' },
    envio_relatorio: { canal: 'whatsapp', publico: 'cliente', rotulo: 'Texto de envio de relatório' },
  };

  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function nomeFormal(usina) {
    const n = String(usina || '').trim().replace(/^ufv\s+/i, '');
    return n ? 'UFV ' + n : '';
  }

  function buscarUfv(mapeamento, nome) {
    const alvo = normalizar(String(nome || '').replace(/^ufv\s+/i, ''));
    return (mapeamento || []).find(u => normalizar(u.usina) === alvo) || null;
  }

  function contatoDoCliente(cliente) {
    const c = normalizar(cliente);
    return CONTATOS_CLIENTE.find(x => normalizar(x.cliente) === c) || null;
  }

  function _ufvResumo(u) {
    return {
      usina: u.usina,
      ufv: nomeFormal(u.usina),
      cliente: u.cliente || '',
      cluster: u.cluster || '',
      cidadeUf: u.cidade_uf || u.cidadeUf || '',
      tecnico: u.responsavel || '',
      funcao: u.funcao || '',
      membros: Array.isArray(u.membros) ? u.membros.slice() : [],
    };
  }

  /* resolver({tipo, ufvs:[nomes], mapeamento}) →
   *   { grupos: [{chave, tipo, destinatarios:[], cliente?, tecnico?, ufvs:[resumo]}],
   *     avisos: [texto], naoEncontradas: [nome] }
   * Técnico: um grupo por técnico responsável (agrupa todas as usinas dele).
   * Cliente/E-mail/Envio de relatório: um grupo por cliente; Renogrid soma o
   * técnico da usina aos destinatários. */
  function resolver(opts) {
    const tipo = opts && opts.tipo;
    if (!TIPOS[tipo]) throw new Error('tipo inválido: ' + tipo);
    const mapa = (opts && opts.mapeamento) || [];
    const avisos = [];
    const naoEncontradas = [];
    const itens = [];
    const vistos = new Set();
    for (const nome of (opts.ufvs || [])) {
      const u = buscarUfv(mapa, nome);
      if (!u) { naoEncontradas.push(String(nome)); continue; }
      if (vistos.has(u.usina)) continue;
      vistos.add(u.usina);
      itens.push(_ufvResumo(u));
    }
    if (naoEncontradas.length) avisos.push('Fora do mapeamento (ignorada): ' + naoEncontradas.join(', '));

    const grupos = [];
    const porChave = new Map();
    const pegar = (chave, base) => {
      if (!porChave.has(chave)) { const g = Object.assign({ chave, tipo, destinatarios: [], ufvs: [] }, base); porChave.set(chave, g); grupos.push(g); }
      return porChave.get(chave);
    };

    if (TIPOS[tipo].publico === 'tecnico') {
      for (const it of itens) {
        if (!it.tecnico) { avisos.push(`${it.ufv}: sem responsável no mapeamento`); continue; }
        const g = pegar('tec:' + normalizar(it.tecnico), { tecnico: it.tecnico, funcao: it.funcao });
        g.ufvs.push(it);
        if (!g.destinatarios.length) g.destinatarios.push(it.tecnico);
      }
    } else {
      for (const it of itens) {
        const g = pegar('cli:' + normalizar(it.cliente), { cliente: it.cliente });
        g.ufvs.push(it);
        const contato = contatoDoCliente(it.cliente);
        if (!contato) {
          if (!g._semContato) { avisos.push(`Cliente "${it.cliente || '—'}" sem contato definido no padrão (seção 10)`); g._semContato = true; }
          continue;
        }
        if (!g.destinatarios.includes(contato.nome)) g.destinatarios.unshift(contato.nome);
        if (contato.incluirTecnico && it.tecnico && !g.destinatarios.includes(it.tecnico)) g.destinatarios.push(it.tecnico);
      }
      grupos.forEach(g => { delete g._semContato; });
    }
    return { grupos, avisos, naoEncontradas };
  }

  return { CONTATOS_CLIENTE, TIPOS, resolver, nomeFormal, buscarUfv, contatoDoCliente, normalizar };
});
