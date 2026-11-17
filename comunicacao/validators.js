/* Central de Mensagens — validadores (tabela 11.4 do padrão, regras de mensagem)
 *
 * validarSaida(saida, ctx) → { erros: [...], avisos: [...] }
 *   saida = { mensagens: [{ texto, assunto? }] }
 *   ctx   = { tipo: 'cliente'|'tecnico'|'email'|'envio_relatorio',
 *             mapeamento: [...itens de /mapeamento-ufvs],
 *             dataHoraEnvio?: Date|string }
 * Cada item: { codigo, msg, caixa } — caixa = índice da mensagem (0-based) ou null (conjunto).
 * Erros bloqueiam o Copiar; avisos aparecem em amarelo abaixo das caixas.
 *
 * Decisões do Fred (17/11/2026) que mudam a tabela 11.4:
 *  - A saudação é escrita por ele: as regras "começa com saudação padrão" e
 *    "período da saudação" saem; em vez disso, avisa se a IA escreveu uma.
 *  - O encerramento é conferido só na ÚLTIMA caixa (mensagem dividida em 2).
 *  - Frases que anunciam cordialidade ("de forma cordial"...) geram aviso.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.GridCom = Object.assign(root.GridCom || {}, api); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // ── listas de termos ───────────────────────────────────────────────────
  const METALINGUAGEM = ['aqui esta', 'aqui vai', 'segue a mensagem', 'segue o texto', 'segue abaixo a mensagem',
    'segue abaixo o texto', 'espero ter ajudado', 'espero que ajude', 'texto pronto para envio', 'mensagem pronta'];
  // seção 7 — vale para textos formais (e-mail e texto de envio de relatório)
  const TERMOS_PROIBIDOS = ['whatsapp', 'zap', 'grupo', 'audio', 'print', 'mensagem do', 'conforme conversa', 'mandou no', 'falou no'];
  const EXCECOES_PROIBIDOS = [/grupo[\s-]+(motor[\s-]+)?gerador/g, /grupo\s+de\s+geracao/g];
  const CULPA = ['culpa', 'culpado', 'negligencia', 'negligente', 'por erro de', 'por descuido', 'irresponsab'];
  const PUNITIVO = ['advertencia', 'punicao', 'punir', 'punido', 'ultimo aviso', 'medida disciplinar', 'sera descontad'];
  const CORDIAL_ANUNCIADA = ['de forma cordial', 'de maneira cordial', 'cordialmente solicit', 'solicitamos gentilmente',
    'gentilmente solicit', 'gentilmente inform', 'informamos gentilmente'];
  const TERCEIROS = /fabricante|concession[aá]ria|distribuidora|homologa[çc]|solis|carmehil|transfortech|solaredge|huawei|sungrow|growatt|\benel\b|energisa|copel|cemig|equatorial|cpfl|neoenergia/i;
  const HEDGE = /a confirmar|previs[aã]o (a|de) confirma|assim que houver retorno|sujeit[oa] (a|à)|depende(ndo)? d[oa]|estimad/i;
  const RESSALVA_HH = /homem[\s-]hora|\bhh\b|hora[s]? extra/i;
  const FORA_HORARIO = /noturn|madrugada|s[aá]bado|domingo|feriado|fim de semana|fins de semana|fora do hor[aá]rio/i;
  const SAUDACAO = /^\s*(ol[aá]|oi|bom dia|boa tarde|boa noite|prezad[oa]s?|caro|cara)(?=[\s,.!;:]|$)/i;
  const ENCERRAMENTO_CLIENTE = ['a disposicao'];
  const ENCERRAMENTO_TECNICO = ['aguardo retorno'];

  // ── feriados nacionais (mesma regra de _feriados_nacionais_brasil no app.py) ──
  function _pascoa(a) {
    const g = a % 19, c = Math.floor(a / 100), h = (c - Math.floor(c / 4) - Math.floor((8 * c + 13) / 25) + 19 * g + 15) % 30;
    const i = h - Math.floor(h / 28) * (1 - Math.floor(h / 28) * Math.floor(29 / (h + 1)) * Math.floor((21 - g) / 11));
    const j = (a + Math.floor(a / 4) + i + 2 - c + Math.floor(c / 4)) % 7;
    const l = i - j, mes = 3 + Math.floor((l + 40) / 44), dia = l + 28 - 31 * Math.floor(mes / 4);
    return new Date(Date.UTC(a, mes - 1, dia));
  }
  const _chave = d => d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  const _cacheFer = {};
  function feriadosNacionais(ano) {
    if (_cacheFer[ano]) return _cacheFer[ano];
    const fixos = [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [12, 25]];
    if (ano >= 2024) fixos.push([11, 20]);
    const s = new Set(fixos.map(([m, d]) => _chave(new Date(Date.UTC(ano, m - 1, d)))));
    const p = _pascoa(ano);
    [-47, -46, -2, 60].forEach(off => s.add(_chave(new Date(p.getTime() + off * 86400000))));
    return (_cacheFer[ano] = s);
  }
  function diaNaoUtil(ano, mes, dia) {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCMonth() !== mes - 1) return false;
    const sem = d.getUTCDay();
    return sem === 0 || sem === 6 || feriadosNacionais(ano).has(_chave(d));
  }

  function _anoEnvio(ctx) {
    const d = ctx && ctx.dataHoraEnvio ? new Date(ctx.dataHoraEnvio) : new Date();
    return isNaN(d) ? new Date().getFullYear() : d.getFullYear();
  }

  // ── usinas citadas no formato "UFV <Nome>" ─────────────────────────────
  const CONECTORES = new Set(['da', 'de', 'do', 'das', 'dos']);
  function usinasCitadas(texto) {
    const out = [];
    const re = /\bUFV\s+([^\n*_.,;:()!?\/|—–\-]+)/g;
    let m;
    while ((m = re.exec(texto))) {
      const toks = m[1].trim().split(/\s+/);
      const nome = [];
      for (const t of toks) {
        if (!t) break;
        const ehRomano = /^(I{1,3}|IV|V|VI{0,3}|IX|X)$/.test(t);
        if (/^[\p{Lu}\d]/u.test(t) || ehRomano) { nome.push(t); continue; }
        if (CONECTORES.has(t.toLowerCase()) && nome.length) { nome.push(t); continue; }
        break;
      }
      while (nome.length && CONECTORES.has(nome[nome.length - 1].toLowerCase())) nome.pop();
      if (nome.length) out.push({ nome: nome.join(' '), indice: m.index, bruto: 'UFV ' + nome.join(' ') });
    }
    return out;
  }
  function casarUsina(nome, mapeamento) {
    const n = norm(nome).replace(/\s+/g, ' ').trim();
    let melhor = null;
    for (const u of (mapeamento || [])) {
      const k = norm(u.usina).replace(/\s+/g, ' ').trim();
      if (n === k || n.startsWith(k + ' ')) { if (!melhor || k.length > norm(melhor.usina).length) melhor = u; }
    }
    return melhor;
  }

  function _dentroDeNegrito(texto, idx) {
    const re = /\*[^*\n]+\*/g;
    let m;
    while ((m = re.exec(texto))) { if (idx > m.index && idx < m.index + m[0].length) return true; }
    return false;
  }

  function _contem(normTexto, lista) { return lista.filter(t => normTexto.includes(t)); }
  function _contemPalavra(normTexto, lista) {
    return lista.filter(t => new RegExp('(^|[^a-z0-9])' + t.replace(/\s+/g, '\\s+') + '($|[^a-z0-9])').test(normTexto));
  }

  function _corpoSemAssinatura(texto) {
    const i = texto.search(/\n\s*atenciosamente\b/i);
    return i >= 0 ? texto.slice(0, i) : texto;
  }
  function _ultimasLinhas(texto, n) {
    return texto.split('\n').map(l => l.trim()).filter(Boolean).slice(-n).join(' ');
  }

  function validarSaida(saida, ctx) {
    ctx = ctx || {};
    const tipo = ctx.tipo;
    const canal = tipo === 'email' ? 'email' : 'whatsapp';
    const publicoCliente = tipo === 'cliente' || tipo === 'email' || tipo === 'envio_relatorio';
    const formal = tipo === 'email' || tipo === 'envio_relatorio';
    const mapa = ctx.mapeamento || [];
    const msgs = (saida && Array.isArray(saida.mensagens)) ? saida.mensagens : [];
    const erros = [], avisos = [];
    const E = (codigo, msg, caixa) => erros.push({ codigo, msg, caixa: caixa == null ? null : caixa });
    const A = (codigo, msg, caixa) => avisos.push({ codigo, msg, caixa: caixa == null ? null : caixa });

    if (!msgs.length) { E('vazio', 'Nenhuma mensagem gerada.', null); return { erros, avisos }; }
    const ano = _anoEnvio(ctx);
    const tecnicoPorCaixa = new Map();

    msgs.forEach((m, i) => {
      const texto = String((m && m.texto) || '');
      const nt = norm(texto);
      if (!texto.trim()) { E('vazio', 'Mensagem vazia.', i); return; }

      // saudação: é do Fred
      if (i === 0 && SAUDACAO.test(texto)) A('saudacao', 'A saudação é sua: a mensagem não deveria começar com uma. Apague a primeira linha antes de enviar ou peça um ajuste.', i);

      const meta = _contem(nt, METALINGUAGEM);
      if (meta.length) E('metalinguagem', 'Metalinguagem dentro do texto: "' + meta.join('", "') + '".', i);

      if (formal) {
        let semExcecoes = nt;
        EXCECOES_PROIBIDOS.forEach(re => { semExcecoes = semExcecoes.replace(re, ' '); });
        const proib = _contemPalavra(semExcecoes, TERMOS_PROIBIDOS);
        if (proib.length) E('termo_proibido', 'Termo proibido em texto formal (seção 7): "' + proib.join('", "') + '".', i);
      }

      const cordial = _contem(nt, CORDIAL_ANUNCIADA);
      if (cordial.length) A('cordialidade_anunciada', 'Não anuncie a cordialidade ("' + cordial.join('", "') + '"): ela vem do tom.', i);

      // usinas
      const citadas = usinasCitadas(texto);
      const tecnicos = new Set();
      citadas.forEach(c => {
        const u = casarUsina(c.nome, mapa);
        if (!u) { E('usina_fora_mapeamento', `"${c.bruto}" não existe no mapeamento de UFVs.`, i); return; }
        if (u.responsavel) tecnicos.add(norm(u.responsavel));
        if (canal === 'whatsapp' && !_dentroDeNegrito(texto, c.indice)) A('usina_sem_negrito', `"${c.bruto}" deveria estar em *negrito*.`, i);
      });
      if (tipo === 'tecnico') tecnicoPorCaixa.set(i, tecnicos);

      if (canal === 'whatsapp') {
        const linhas = texto.split('\n');
        if (linhas.some(l => /^\s*[-*+·◦▪●]\s+\S/.test(l) && !/^\s*\*[^*\n]+\*/.test(l))) A('bullet', 'Use só "•" como marcador de lista.', i);
        if (/\*\*/.test(texto)) E('markdown', 'Markdown "**" não funciona no WhatsApp.', i);
        if (linhas.some(l => /^\s*#{1,6}\s/.test(l))) E('markdown', 'Cabeçalho Markdown (#) não funciona no WhatsApp.', i);
        if (linhas.some(l => /^\s*\|.*\|\s*$/.test(l))) E('markdown', 'Tabela Markdown não funciona no WhatsApp.', i);
        if (/\[[^\]\n]+\]\([^)\s]+\)/.test(texto)) E('markdown', 'Link Markdown [texto](url) não funciona no WhatsApp.', i);
        if (/(^|\n)\s*atenciosamente\b|\n\s*fred alexandrino\s*\n\s*supervisor/i.test(texto)) A('assinatura_whatsapp', 'Sem assinatura no WhatsApp (a assinatura é só do e-mail). Apague o bloco "Atenciosamente…" antes de enviar.', i);
      }

      if (publicoCliente) {
        // data fechada + dependência de terceiro (por parágrafo)
        texto.split(/\n\s*\n/).forEach(par => {
          if (/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b|\bdia \d{1,2}\b|\baté \d{1,2}\b/i.test(par) && TERCEIROS.test(par) && !HEDGE.test(par))
            A('prazo_terceiro', 'Data fechada em trecho que depende de terceiro (fabricante/concessionária/homologação). Prefira "previsão a confirmar".', i);
        });
        // atividade fora da janela 07h–17h de dias úteis sem ressalva de HH
        if (!RESSALVA_HH.test(texto)) {
          let fora = FORA_HORARIO.test(texto);
          const reH = /\b(\d{1,2})(?:h(\d{2})?|:(\d{2}))\b/g; let h;
          while (!fora && (h = reH.exec(texto))) { const hh = +h[1], mm = +(h[2] || h[3] || 0); if (hh <= 23 && (hh > 17 || (hh === 17 && mm > 0) || hh < 7)) fora = true; }
          const reD = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g; let d;
          while (!fora && (d = reD.exec(texto))) { let a = d[3] ? +d[3] : ano; if (a < 100) a += 2000; if (diaNaoUtil(a, +d[2], +d[1])) fora = true; }
          if (fora) A('hh_extra', 'Atividade fora de dias úteis 07h–17h sem a ressalva de Homem-Hora Extra/Noturno.', i);
        }
      }

      if (tipo !== 'envio_relatorio') {
        const culpa = _contemPalavra(nt, CULPA);
        if (culpa.length) A('culpa', 'Afirmação de culpa/causa sem confirmação ("' + culpa.join('", "') + '"). Pergunte o motivo em vez de afirmar.', i);
      }
      if (tipo === 'tecnico') {
        const pun = _contemPalavra(nt, PUNITIVO);
        if (pun.length) E('tom_punitivo', 'Tom punitivo com técnico ("' + pun.join('", "') + '").', i);
      }

      if (tipo === 'email') {
        const assunto = String((m && m.assunto) || '').trim();
        if (i === 0 && !assunto) A('email_assunto', 'E-mail sem assunto.', i);
        else if (i === 0 && !/\bUFV\b/.test(assunto) && citadas.length) A('email_assunto', 'O assunto deveria trazer a usina (ex.: "UFV Tupi Paulista I — ...").', i);
        if (i === msgs.length - 1 && !/fred alexandrino/i.test(texto)) A('email_assinatura', 'E-mail sem a assinatura completa (Atenciosamente, Fred Alexandrino, Supervisor de O&M, Grid Co.).', i);
      }
    });

    // encerramento — só na última caixa
    const ultima = String(msgs[msgs.length - 1].texto || '');
    const fim = norm(_ultimasLinhas(_corpoSemAssinatura(ultima), 2));
    const esperado = tipo === 'tecnico' ? ENCERRAMENTO_TECNICO : ENCERRAMENTO_CLIENTE;
    if (ultima.trim() && !esperado.some(e => fim.includes(e)))
      A('encerramento', tipo === 'tecnico' ? 'Termine com "Aguardo retorno."' : 'Termine com um encerramento padrão ("Seguimos à disposição." / "Qualquer dúvida, sigo à disposição!").', msgs.length - 1);

    // técnico: mesma pessoa em caixas separadas
    if (tipo === 'tecnico' && msgs.length > 1) {
      const vistas = new Map();
      tecnicoPorCaixa.forEach((set, i) => set.forEach(t => { if (!vistas.has(t)) vistas.set(t, new Set()); vistas.get(t).add(i); }));
      vistas.forEach((caixas, t) => {
        if (caixas.size > 1) E('tecnico_separado', 'Usinas do mesmo técnico em mensagens separadas — agrupe numa só (caixas ' + [...caixas].map(x => x + 1).join(', ') + ').', null);
      });
    }

    return { erros, avisos };
  }

  return { validarSaida, usinasCitadas, casarUsina, feriadosNacionais, diaNaoUtil };
});
