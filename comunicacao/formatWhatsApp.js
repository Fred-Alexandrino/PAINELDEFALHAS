/* Central de Mensagens — formatWhatsApp()
 * Sanitização do texto para WhatsApp, conforme a seção 5 de
 * docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md:
 *  - **duplo** (Markdown) vira *simples*; __duplo__ vira _simples_
 *  - sem espaço entre o asterisco/underline e a palavra ("* texto*" → "*texto*")
 *  - sem cabeçalhos Markdown (#), tabelas ou links [x](y)
 *  - bullets só com "• " (U+2022 + espaço); "-", "*" e "+" no início da linha viram "• "
 *  - sem espaço no fim das linhas e no máximo uma linha em branco seguida
 * Funciona no navegador (window.GridCom.formatWhatsApp) e no Node (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.GridCom = Object.assign(root.GridCom || {}, api); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BULLET = '• ';

  // "* texto *" → "*texto*" (o mesmo para _ _). Só mexe quando o par abre e
  // fecha na mesma linha, para não estragar asteriscos soltos.
  function _apertarMarcador(linha, m) {
    const e = m === '*' ? '\\*' : '_';
    const re = new RegExp(e + '([^' + e + '\\n]+?)' + e, 'g');
    return linha.replace(re, (tudo, dentro, pos, str) => {
      // underline dentro de palavra (ex.: nome_de_arquivo) não é itálico
      if (m === '_') {
        const antes = str[pos - 1], depois = str[pos + tudo.length];
        if ((antes && /[\p{L}\p{N}]/u.test(antes)) || (depois && /[\p{L}\p{N}]/u.test(depois))) return tudo;
      }
      const limpo = dentro.trim();
      if (!limpo) return tudo;
      return m + limpo + m;
    });
  }

  function _linhaTabela(l) { return /^\s*\|.*\|\s*$/.test(l); }
  function _separadorTabela(l) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l); }

  function formatWhatsApp(texto) {
    if (texto == null) return '';
    let t = String(texto).replace(/\r\n?/g, '\n').replace(/ /g, ' ');

    // Markdown duplo → simples
    t = t.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');
    t = t.replace(/(^|[^\p{L}\p{N}_])__([^_\n]+?)__(?![\p{L}\p{N}_])/gu, '$1_$2_');
    t = t.replace(/\*{2,}/g, '*');

    // links Markdown [texto](url) → "texto (url)"; se texto == url, só a url
    t = t.replace(/\[([^\]\n]+)\]\((\S+?)\)/g, (m, txt, url) => (txt.trim() === url.trim() ? url : txt.trim() + ' (' + url + ')'));

    const saida = [];
    for (let linha of t.split('\n')) {
      // tabelas: linha separadora some; linhas de dados viram bullet "a — b — c"
      if (_linhaTabela(linha) || (_separadorTabela(linha) && linha.includes('|'))) {
        if (_separadorTabela(linha)) continue;
        const cels = linha.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()).filter(Boolean);
        if (!cels.length) continue;
        linha = BULLET + cels.join(' — ');
      }
      // cabeçalho Markdown "# Título" → "*Título*"
      const cab = linha.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/);
      if (cab) linha = '*' + cab[1].replace(/^\*+|\*+$/g, '').trim() + '*';
      // bullets: "-", "*", "+", "·", "◦", "▪" no início → "• "
      linha = linha.replace(/^(\s*)(?:[-*+·◦▪●]|•)\s+(?=\S)/, '$1' + BULLET);
      linha = linha.replace(/^(\s*)•(?=\S)/, '$1' + BULLET);
      // sem indentação antes do bullet (WhatsApp não respeita)
      linha = linha.replace(/^\s+(?=• )/, '');
      linha = _apertarMarcador(linha, '*');
      linha = _apertarMarcador(linha, '_');
      saida.push(linha.replace(/[ \t]+$/g, ''));
    }
    t = saida.join('\n');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  return { formatWhatsApp };
});
