/* Central de Mensagens — roteamento (seção 10 do padrão)
 * Técnico (campo): uma mensagem por equipe/técnico, postada no grupo da equipe e
 * DIRIGIDA AO SUPERVISOR DE CAMPO da usina (campo supervisor_campo de /mapeamento-ufvs =
 * "Responsável O&M" do Nexus — Fred, 17/11/2026). Sem supervisor cadastrado: avisa. Cliente/E-mail/Envio de relatório: agrupa por cliente,
 * SEM contato fixo (Fred, 17/11/2026: com quem falar muda conforme o assunto — o
 * nome, se houver, é digitado por ele no campo "Para quem").
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.GridCom = Object.assign(root.GridCom || {}, api); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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

  function _ufvResumo(u) {
    return {
      usina: u.usina,
      ufv: nomeFormal(u.usina),
      cliente: u.cliente || '',
      cluster: u.cluster || '',
      cidadeUf: u.cidade_uf || u.cidadeUf || '',
      tecnico: u.responsavel || '',
      supervisorCampo: u.supervisor_campo || '',
      grupoNome: u.grupo_nome || '',
      funcao: u.funcao || '',
      membros: Array.isArray(u.membros) ? u.membros.slice() : [],
    };
  }

  /* resolver({tipo, ufvs:[nomes], mapeamento}) →
   *   { grupos: [{chave, tipo, destinatarios:[], cliente?, tecnico?, ufvs:[resumo]}],
   *     avisos: [texto], naoEncontradas: [nome] }
   * Técnico: um grupo por técnico responsável (agrupa todas as usinas dele).
   * Cliente/E-mail/Envio de relatório: um grupo por cliente, sem destinatário fixo
   * (opts.para, se vier, vira o destinatário). */
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
        const g = pegar('tec:' + normalizar(it.tecnico), { tecnico: it.tecnico, funcao: it.funcao, grupoNome: it.grupoNome });
        g.ufvs.push(it);
        if (it.supervisorCampo) { if (!g.destinatarios.includes(it.supervisorCampo)) g.destinatarios.push(it.supervisorCampo); }
        else avisos.push(`${it.ufv}: sem supervisor de campo no mapeamento (Responsável O&M do Nexus)`);
      }
    } else {
      const para = String((opts && opts.para) || '').trim();
      for (const it of itens) {
        const g = pegar('cli:' + normalizar(it.cliente), { cliente: it.cliente });
        g.ufvs.push(it);
        if (para && !g.destinatarios.length) g.destinatarios.push(para);
      }
    }
    return { grupos, avisos, naoEncontradas };
  }

  return { TIPOS, resolver, nomeFormal, buscarUfv, normalizar };
});
