/* Central de Mensagens — tela (Fase 1 do módulo de comunicação)
 * Padrão: docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md (seções 2–7, 10, 11).
 * Depende de: comunicacao/formatWhatsApp.js, roteamento.js, validators.js
 * (carregados antes) e, do index.html, de switchNav/NAV_TITLES/_mapUfvsCarregar.
 * A IA roda no backend (POST /comunicacao/gerar) — nenhuma chave aqui.
 *
 * Camadas da saída (seção 1/2): introdução (fora da caixa) → uma CopyBox por
 * mensagem (Copiar = texto cru) → avisos/erros dos validadores → observações.
 * Ajustar e Dividir geram uma versão NOVA e COMPLETA; as anteriores ficam no
 * histórico (seletor de versões).
 */
(function () {
  'use strict';
  const G = window.GridCom || {};
  const API = 'https://api.168.138.232.237.sslip.io';
  const NAV = 'central-mensagens';
  const LS_KEY = 'cmEstado_v1';
  const TIPOS = [
    ['cliente', 'Cliente'], ['tecnico', 'Campo'], ['email', 'E-mail'], ['envio_relatorio', 'Envio de relatório'],
  ];
  // O que cada tipo muda na tela (lista, textos, destinatário e botão)
  const INFO = {
    cliente: {
      desc: 'Mensagem de WhatsApp para o cliente: diagnóstico, risco, o que a Grid fez e o que precisa dele.',
      dest: 'Escolha o cliente. Se quiser, diga para quem é no campo "Para quem".',
      rotulo: 'Rascunho / relato',
      ph: 'Ex.: o que foi encontrado em campo, o risco, o que a equipe já fez, as opções e o que você precisa que o cliente decida.',
      botao: 'Gerar mensagem ao cliente', lista: 'cliente',
    },
    tecnico: {
      desc: 'Mensagem no grupo da equipe, dirigida ao supervisor de campo (Responsável O&M). Sai UMA mensagem por equipe, juntando as usinas dela.',
      dest: 'Para o supervisor de campo de cada usina, no grupo da equipe. A lista abaixo está agrupada por técnico (equipe).',
      rotulo: 'O que cobrar ou orientar',
      ph: 'Ex.: pendências por usina com datas (de onde veio a informação: PCM, painel de atividades) e o que você precisa que ele responda, com prazo.',
      botao: 'Gerar mensagem ao campo', lista: 'tecnico',
    },
    email: {
      desc: 'E-mail formal para o cliente: sai com Assunto + texto + sua assinatura (sem endereços).',
      dest: 'Escolha o cliente. Os endereços você coloca no e-mail.',
      rotulo: 'Conteúdo do e-mail',
      ph: 'Ex.: o assunto, os fatos e datas, os anexos que vão junto e o que você pede ao cliente.',
      botao: 'Gerar e-mail', lista: 'cliente',
    },
    envio_relatorio: {
      desc: 'Texto que acompanha um relatório enviado ao cliente: explica o que está no anexo e o que se pede.',
      dest: 'Escolha o cliente. Se quiser, diga para quem é no campo "Para quem".',
      rotulo: 'Sobre o relatório anexado',
      ph: 'Ex.: Relatório de Ocorrência da via de acesso, vistoria de 16/11, com cronologia, riscos, fotos e recomendações; pedir posicionamento sobre a recuperação.',
      botao: 'Gerar texto de envio', lista: 'cliente',
    },
  };

  const MAX_PRINTS = 4;
  // Usinas juntas (mesmo local): vêm do mapeamento (campo "conjunto" de /mapeamento-ufvs,
  // USINAS_JUNTAS no app.py). Esta lista só vale se o backend ainda não mandar o campo.
  const JUNTAS_PADRAO = [['Canarana I', 'Canarana II'], ['União I', 'União II'], ['Nova Londrina I', 'Nova Londrina II'],
    ['Pharmas II', 'Pharmas III', 'Pharmas IV'], ['Coração I', 'Coração II'],
    ['Guatambu I', 'Guatambu II', 'Guatambu III', 'Guatambu IV'], ['Aparecida do Taboado I', 'Aparecida do Taboado II']];
  function juntas(mapa) {
    const por = {};
    (mapa || []).forEach(u => { if (u.conjunto) (por[u.conjunto] = por[u.conjunto] || []).push(u.usina); });
    const l = Object.values(por).filter(g => g.length > 1);
    return l.length ? l : JUNTAS_PADRAO;
  }
  // "UFV União I · UFV União II" → "UFV União I e II"
  function rotuloUfvs(lista) {
    const nomes = lista.map(u => u.usina || u);
    const out = [], usadas = new Set();
    nomes.forEach(n => {
      if (usadas.has(n)) return;
      const g = juntas(st.mapa).find(j => j.includes(n));
      const sel = g ? g.filter(x => nomes.includes(x)) : [n];
      sel.forEach(x => usadas.add(x));
      out.push('UFV ' + (sel.length > 1 ? nomeConjunto(sel) : n));
    });
    return out.join(' · ');
  }
  function nomeConjunto(usinas) {
    const base = usinas[0].split(' ').slice(0, -1).join(' ');
    const r = usinas.map(n => n.split(' ').pop());
    return base + ' ' + (r.length > 1 ? r.slice(0, -1).join(', ') + ' e ' + r[r.length - 1] : r[0]);
  }
  const st = {
    tipo: 'cliente', cliente: '', para: '', filtroCliente: '', ufvs: [], filtro: '', rascunho: '', envio: '', mapa: null, carregandoMapa: false,
    prints: [], // [{base64, mimeType, url}] — só na memória (não vai para o localStorage)
    resultados: [], // [{grupo, versoes:[{n, saida, ajuste}], atual, gerando, erro, ajusteAberto}]
  };

  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, ok) => { try { if (typeof showToast === 'function') return showToast(m, ok); } catch (e) {} };
  const root = () => document.getElementById('cmRoot');

  // ── data/hora de envio (padrão: agora em America/Sao_Paulo) ──
  function agoraSP() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  }
  const envioBR = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : ''; };
  const envioISO = v => (v ? v + ':00-03:00' : undefined);

  function salvar() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ tipo: st.tipo, cliente: st.cliente, ufvs: st.ufvs, rascunho: st.rascunho,
        resultados: st.resultados.map(r => ({ grupo: r.grupo, versoes: r.versoes, atual: r.atual })) }));
    } catch (e) {}
  }
  function restaurar() {
    try {
      const d = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (!d) return;
      if (TIPOS.some(t => t[0] === d.tipo)) st.tipo = d.tipo;
      st.ufvs = Array.isArray(d.ufvs) ? d.ufvs : [];
      st.cliente = typeof d.cliente === 'string' ? d.cliente : '';
      st.rascunho = d.rascunho || '';
      st.resultados = Array.isArray(d.resultados) ? d.resultados.map(r => Object.assign({ gerando: false, erro: '', ajusteAberto: false }, r)) : [];
    } catch (e) {}
  }

  async function carregarMapa() {
    if (st.mapa || st.carregandoMapa) return;
    st.carregandoMapa = true;
    try {
      let itens = null;
      if (typeof _mapUfvsCarregar === 'function') itens = await _mapUfvsCarregar();
      if (!itens || !itens.length) {
        const r = await fetch(API + '/mapeamento-ufvs');
        itens = (await r.json()).itens || [];
      }
      st.mapa = itens;
      st.ufvs = st.ufvs.filter(n => G.buscarUfv(itens, n));
    } catch (e) { st.mapa = []; toast('Não consegui carregar o mapeamento de UFVs.', false); }
    st.carregandoMapa = false;
    render();
  }

  const porCliente = () => INFO[st.tipo].lista !== 'tecnico';
  function rotas() {
    if (!st.mapa) return { grupos: [], avisos: [] };
    if (!porCliente()) return G.resolver({ tipo: st.tipo, ufvs: st.ufvs, mapeamento: st.mapa });
    if (!st.cliente) return { grupos: [], avisos: [] };
    const doCliente = st.ufvs.filter(n => { const u = G.buscarUfv(st.mapa, n); return u && u.cliente === st.cliente; });
    if (doCliente.length) return G.resolver({ tipo: st.tipo, ufvs: doCliente, mapeamento: st.mapa, para: st.para });
    return { grupos: [{ chave: 'cli:' + st.cliente, tipo: st.tipo, cliente: st.cliente, destinatarios: st.para.trim() ? [st.para.trim()] : [], ufvs: [] }], avisos: [] };
  }

  // ── saída: sanitiza (WhatsApp) e valida ──
  function preparar(saida, tipo) {
    const canalWpp = tipo !== 'email';
    const mensagens = (saida.mensagens || []).map(m => Object.assign({}, m, {
      texto: canalWpp ? G.formatWhatsApp(m.texto) : String(m.texto || '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(),
    }));
    return Object.assign({}, saida, { mensagens });
  }
  function validar(saida, tipo) {
    return G.validarSaida(saida, { tipo, mapeamento: st.mapa || [], dataHoraEnvio: envioISO(st.envio) });
  }

  // ── chamadas ao backend ──
  async function chamar(grupo, extra) {
    const body = Object.assign({
      tipo: grupo.tipo,
      destinatarios: grupo.destinatarios,
      ufvs: grupo.ufvs.map(u => ({ ufv: u.ufv, cidadeUf: u.cidadeUf, cliente: u.cliente, tecnico: u.tecnico, funcao: u.funcao })),
      cliente: grupo.cliente || '',
      dataHoraEnvio: envioBR(st.envio),
      rascunho: st.rascunho,
      prints: st.prints.map(p => ({ base64: p.base64, mimeType: p.mimeType })),
    }, extra || {});
    const r = await fetch(API + '/comunicacao/gerar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(100000),
    });
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok || !d.ok) throw new Error(d.error || ('HTTP ' + r.status));
    return preparar(d, grupo.tipo);
  }

  async function gerar() {
    if (!st.rascunho.trim() && !st.prints.length) return toast('Escreva o rascunho ou anexe um print antes de gerar.', false);
    const { grupos } = rotas();
    if (!grupos.length) return toast(porCliente() ? 'Escolha o cliente.' : 'Selecione ao menos uma UFV do mapeamento.', false);
    if (grupos.length > 1 && !confirm(`Vão sair ${grupos.length} mensagens separadas (uma por ${st.tipo === 'tecnico' ? 'técnico' : 'cliente'}). Gerar todas?`)) return;
    st.resultados = grupos.map(g => ({ grupo: g, versoes: [], atual: -1, gerando: true, erro: '', ajusteAberto: false }));
    render();
    for (const res of st.resultados) {
      try {
        const saida = await chamar(res.grupo);
        res.versoes.push({ n: 1, saida, ajuste: '' });
        res.atual = 0;
      } catch (e) { res.erro = e.message; }
      res.gerando = false;
      salvar();
      render();
    }
  }

  async function novaVersao(i, ajuste, dividir) {
    const res = st.resultados[i];
    const atual = res && res.versoes[res.atual];
    if (!atual) return;
    if (!dividir && !String(ajuste || '').trim()) return toast('Descreva o ajuste.', false);
    res.gerando = true; res.erro = ''; render();
    try {
      const saida = await chamar(res.grupo, { ajuste: dividir ? '' : ajuste, dividir: !!dividir, versaoAtual: { mensagens: atual.saida.mensagens } });
      res.versoes.push({ n: res.versoes.length + 1, saida, ajuste: dividir ? 'Dividir em 2 mensagens' : ajuste });
      res.atual = res.versoes.length - 1;
      res.ajusteAberto = false;
    } catch (e) { res.erro = e.message; }
    res.gerando = false;
    salvar();
    render();
  }

  // ── prints: reduz para no máx. 1600 px (JPEG) antes de enviar ──
  function lerPrint(file) {
    return new Promise((ok, falha) => {
      if (!file || !/^image\//.test(file.type)) return falha(new Error('não é imagem'));
      const fr = new FileReader();
      fr.onerror = () => falha(new Error('não consegui ler o arquivo'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => falha(new Error('imagem inválida'));
        img.onload = () => {
          const k = Math.min(1, 1600 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/jpeg', 0.85);
          ok({ base64: url.split(',')[1], mimeType: 'image/jpeg', url });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  async function adicionarPrints(files) {
    const lista = [...(files || [])].filter(f => /^image\//.test(f.type));
    if (!lista.length) return;
    for (const f of lista) {
      if (st.prints.length >= MAX_PRINTS) { toast(`No máximo ${MAX_PRINTS} prints por mensagem.`, false); break; }
      try { st.prints.push(await lerPrint(f)); } catch (e) { toast('Print ignorado: ' + e.message, false); }
    }
    render();
  }

  async function copiar(texto, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(texto); ok = true; } catch (e) {
      try {
        const t = document.createElement('textarea'); t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove();
      } catch (e2) {}
    }
    if (btn) { const o = btn.textContent; btn.textContent = ok ? 'Copiado ✓' : 'Falhou'; setTimeout(() => { btn.textContent = o; }, 1600); }
    if (!ok) toast('Não consegui copiar — selecione o texto e use Ctrl+C.', false);
  }

  // ── render ──
  function renderForm() {
    const mapa = st.mapa || [];
    const f = G.normalizar(st.filtro);
    const info = INFO[st.tipo];
    const porTec = info.lista === 'tecnico';
    const cliMode = !porTec;
    const chave = u => (porTec ? (u.responsavel || 'Sem responsável') : (u.cliente || '—'));
    const grupos = {};
    const itens = [];
    const usadas = new Set();
    const JUNTAS = juntas(mapa);
    mapa.forEach(u => {
      if (usadas.has(u.usina)) return;
      const par = JUNTAS.find(j => j.includes(u.usina));
      const membros = par ? par.map(n => mapa.find(x => x.usina === n)).filter(Boolean) : [u];
      membros.forEach(m => usadas.add(m.usina));
      const nome = par && membros.length > 1 ? nomeConjunto(membros.map(m => m.usina)) : u.usina;
      itens.push(Object.assign({}, u, { nomeLista: nome, usinas: membros.map(m => m.usina) }));
    });
    itens.forEach(u => {
      if (cliMode && u.cliente !== st.cliente) return;
      if (!cliMode && st.filtroCliente && u.cliente !== st.filtroCliente) return;
      if (f && !G.normalizar(u.nomeLista + ' ' + u.cliente + ' ' + u.responsavel + ' ' + u.cluster).includes(f)) return;
      (grupos[chave(u)] = grupos[chave(u)] || []).push(u);
    });
    const sel = new Set(st.ufvs);
    const marcado = u => u.usinas.every(n => sel.has(n));
    const lista = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(k => `
      <div class="cm-cli">
        <div class="cm-cli-h"><span>${porTec ? '👷 ' : ''}${h(k)}${porTec ? ` <em>${h(grupos[k][0].funcao || '')} · ${h([...new Set(grupos[k].map(u => u.cluster))].join(', '))}</em>` : ''}</span><button type="button" class="cm-link" data-acao="todas" data-grupo="${h(k)}">marcar todas</button></div>
        ${grupos[k].map(u => `<label class="cm-ufv${marcado(u) ? ' on' : ''}">
          <input type="checkbox" data-acao="ufv" value="${h(u.usinas.join('|'))}" ${marcado(u) ? 'checked' : ''}>
          <span><b>UFV ${h(u.nomeLista)}</b><small>${porTec ? h(u.cliente || '') + ' · ' + h(u.cidade_uf || '') : h(u.cidade_uf || '')}</small></span></label>`).join('')}
      </div>`).join('') || `<div class="cm-vazio">${!st.mapa ? 'Carregando o mapeamento…' : cliMode && !st.cliente ? 'Escolha o cliente acima.' : 'Nenhuma UFV encontrada.'}</div>`;
    const listaClientes = [...new Set(mapa.map(u => u.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const clientes = listaClientes.map(c => `<button type="button" class="cm-tipo cm-cli-btn${st.cliente === c ? ' on' : ''}" data-acao="cliente" data-cliente="${h(c)}">${h(c)}</button>`).join('');
    const prints = st.prints.map((p, k) => `<div class="cm-print"><img src="${p.url}" alt="print ${k + 1}"><button type="button" data-acao="rm-print" data-k="${k}" title="Remover">×</button></div>`).join('');

    const r = rotas();
    const rotaHtml = r.grupos.length ? r.grupos.map(g => `
      <div class="cm-rota">
        <div>${porTec ? `<span class="cm-rot">Para</span> <b>${h(g.destinatarios.join(' + ') || 'supervisor de campo não cadastrado')}</b> <small class="cm-sub2">supervisor de campo</small>` : `<span class="cm-tag">${h(g.cliente)}</span>`}</div>
        ${porTec ? `<div class="cm-rota-obs">${g.grupoNome ? 'No grupo <b>' + h(g.grupoNome) + '</b> · técnico ' : 'No grupo da equipe do técnico '}${h(g.tecnico)}${g.funcao ? ' (' + h(g.funcao) + ')' : ''}</div>` : ''}
        <div class="cm-rota-ufvs">${h(rotuloUfvs(g.ufvs)) || 'UFVs não selecionadas (opcional)'}</div>
        ${st.tipo === 'tecnico' && g.ufvs.some(u => u.membros && u.membros.length) ? `<div class="cm-rota-obs">Equipe: ${h([...new Set(g.ufvs.flatMap(u => u.membros || []))].join(', '))}</div>` : ''}
      </div>`).join('') : `<div class="cm-vazio">${h(info.dest)}</div>`;
    const rotaAvisos = r.avisos.map(a => `<div class="cm-aviso">⚠️ ${h(a)}</div>`).join('');

    return `
      <div class="cm-bloco">
        <div class="cm-tipos" role="tablist">${TIPOS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${st.tipo === k}" class="cm-tipo${st.tipo === k ? ' on' : ''}" data-acao="tipo" data-tipo="${k}">${l}</button>`).join('')}</div>
        <p class="cm-desc">${h(info.desc)}</p>
        <div class="cm-grade">
          <div>
            ${cliMode ? `<div class="cm-rot">Cliente</div><div class="cm-clientes">${clientes}</div>` : ''}
            ${porTec ? `<div class="cm-rot">Cliente</div><div class="cm-clientes">${['', ...listaClientes].map(c => `<button type="button" class="cm-tipo cm-cli-btn${st.filtroCliente === c ? ' on' : ''}" data-acao="filtro-cliente" data-cliente="${h(c)}">${h(c || 'Todos')}</button>`).join('')}</div>` : ''}
            <div class="cm-rot">UFV(s) · ${st.ufvs.length} selecionada(s)${porTec ? ' · por técnico' : ' · opcional'}</div>
            <input class="cm-input" type="search" placeholder="Buscar usina, cliente, técnico ou cluster" value="${h(st.filtro)}" data-acao="filtro">
            <div class="cm-lista">${lista}</div>
            ${st.ufvs.length ? `<button type="button" class="cm-link" data-acao="limpar-ufvs">limpar seleção</button>` : ''}
          </div>
          <div>
            <div class="cm-rot">${porTec ? 'Destinatário(s)' : 'Resumo'}</div>
            <div class="cm-rotas">${rotaHtml}${rotaAvisos}</div>
            ${cliMode ? `<label class="cm-rot" for="cmPara">Para quem (opcional)</label>
            <input id="cmPara" class="cm-input cm-para" type="text" placeholder="Ex.: Iago, Gabriel (coordenador), Paula… Deixe vazio se não importar." value="${h(st.para)}" data-acao="para">` : ''}
            <label class="cm-rot" for="cmRascunho">${h(info.rotulo)}</label>
            <textarea id="cmRascunho" class="cm-input cm-ta" rows="9" placeholder="${h(info.ph)} A saudação é sua: o texto sai começando pelo corpo." data-acao="rascunho">${h(st.rascunho)}</textarea>
            <div class="cm-prints">
              <button type="button" class="cm-btn" data-acao="anexar-print" ${st.prints.length >= MAX_PRINTS ? 'disabled' : ''}>📎 Anexar print</button>
              <span class="cm-dica">ou cole com Ctrl+V · até ${MAX_PRINTS} · a IA lê o conteúdo</span>
              <input type="file" id="cmPrintInput" accept="image/*" multiple hidden data-acao="print-input">
              ${prints ? `<div class="cm-print-lista">${prints}</div>` : ''}
            </div>
            <div class="cm-linha">
              <label><span class="cm-rot">Data/hora de envio</span><input class="cm-input" type="datetime-local" value="${h(st.envio)}" data-acao="envio"></label>
              <button type="button" class="cm-btn pri" data-acao="gerar" ${st.resultados.some(x => x.gerando) ? 'disabled' : ''}>${h(info.botao)}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderResultado(res, i) {
    const g = res.grupo;
    const cab = `<div class="cm-res-h"><div>${g.destinatarios.length ? `<span class="cm-rot">Para</span> <b>${h(g.destinatarios.join(' + '))}</b>${g.tipo === 'tecnico' ? ` <small class="cm-sub2" style="display:inline">no grupo da equipe de ${h(g.tecnico)}</small>` : ''}` : `<b>${h(g.cliente || g.tecnico || '')}</b>`}
      <small>${h(rotuloUfvs(g.ufvs))}</small></div>
      ${res.versoes.length > 1 ? `<select class="cm-input cm-ver" data-acao="versao" data-i="${i}">${res.versoes.map((v, k) => `<option value="${k}" ${k === res.atual ? 'selected' : ''}>Versão ${v.n}${v.ajuste ? ' — ' + h(v.ajuste.slice(0, 40)) : ''}</option>`).join('')}</select>` : ''}</div>`;
    if (res.gerando && !res.versoes.length) return `<div class="cm-bloco">${cab}<div class="cm-vazio">Gerando…</div></div>`;
    if (!res.versoes.length) return `<div class="cm-bloco">${cab}<div class="cm-erro">Não consegui gerar: ${h(res.erro)}</div></div>`;

    const v = res.versoes[res.atual];
    const saida = v.saida;
    const val = validar(saida, g.tipo);
    const errosConj = val.erros.filter(e => e.caixa == null);
    const caixas = saida.mensagens.map((m, k) => {
      const errosCx = val.erros.filter(e => e.caixa === k);
      const bloqueado = errosCx.length || errosConj.length;
      return `
        ${m.titulo ? `<div class="cm-rot cm-titulo">${h(m.titulo)}</div>` : ''}
        ${g.tipo === 'email' && m.assunto ? `<div class="cm-assunto"><span class="cm-rot">Assunto</span><span class="cm-assunto-t">${h(m.assunto)}</span>
          <button type="button" class="cm-btn" data-acao="copiar" data-i="${i}" data-k="${k}" data-campo="assunto">Copiar</button></div>` : ''}
        <div class="cm-copybox${bloqueado ? ' bloq' : ''}">
          <div class="cm-copybox-bar"><span class="cm-rot">Mensagem ${k + 1}${saida.mensagens.length > 1 ? ' de ' + saida.mensagens.length : ''}</span>
            <button type="button" class="cm-btn pri" data-acao="copiar" data-i="${i}" data-k="${k}" ${bloqueado ? 'disabled title="Corrija os erros abaixo antes de copiar"' : ''}>Copiar</button></div>
          <pre class="cm-texto">${h(m.texto)}</pre>
        </div>
        ${errosCx.map(e => `<div class="cm-erro">⛔ ${h(e.msg)}</div>`).join('')}`;
    }).join('');
    const avisos = val.avisos.map(a => `<div class="cm-aviso">⚠️ ${a.caixa != null && saida.mensagens.length > 1 ? `Mensagem ${a.caixa + 1}: ` : ''}${h(a.msg)}</div>`).join('');
    const obs = (saida.observacoes || []).map(o => `<li>${h(o)}</li>`).join('');
    const podeDividir = g.tipo !== 'tecnico' && saida.mensagens.length === 1;

    return `
      <div class="cm-bloco">
        ${cab}
        ${saida.introducao ? `<p class="cm-intro">${h(saida.introducao)}</p>` : ''}
        ${caixas}
        ${errosConj.map(e => `<div class="cm-erro">⛔ ${h(e.msg)}</div>`).join('')}
        ${avisos}
        ${obs ? `<div class="cm-obs"><div class="cm-rot">⚠️ Observações</div><ul>${obs}</ul></div>` : ''}
        ${res.erro ? `<div class="cm-erro">Não consegui gerar a nova versão: ${h(res.erro)}</div>` : ''}
        <div class="cm-acoes">
          <button type="button" class="cm-btn" data-acao="abrir-ajuste" data-i="${i}" ${res.gerando ? 'disabled' : ''}>Ajustar</button>
          ${podeDividir ? `<button type="button" class="cm-btn" data-acao="dividir" data-i="${i}" ${res.gerando ? 'disabled' : ''}>Dividir em 2 mensagens</button>` : ''}
          ${res.gerando ? '<span class="cm-gerando">Gerando nova versão…</span>' : ''}
        </div>
        ${res.ajusteAberto ? `<div class="cm-ajuste">
          <textarea class="cm-input cm-ta" rows="3" id="cmAjuste${i}" placeholder="O que mudar? Ex.: mais curto; tirar a opção B; reforçar o risco. A nova versão vem completa."></textarea>
          <button type="button" class="cm-btn pri" data-acao="ajustar" data-i="${i}">Gerar nova versão</button></div>` : ''}
      </div>`;
  }

  function render() {
    const el = root();
    if (!el) return;
    const foco = document.activeElement && el.contains(document.activeElement) ? { acao: document.activeElement.dataset.acao, id: document.activeElement.id, s: document.activeElement.selectionStart } : null;
    el.innerHTML = `
      <div class="cm-topo"><div><div class="cm-olho">Comunicação</div><h1 class="cm-h1">Central de Mensagens</h1>
        <p class="cm-sub">Texto no padrão Grid para cliente, técnico ou e-mail. A saudação fica com você.</p></div></div>
      ${renderForm()}
      ${st.resultados.length ? `<div class="cm-resultados">${st.resultados.map(renderResultado).join('')}</div>` : ''}`;
    if (foco) {
      const alvo = foco.id ? document.getElementById(foco.id) : el.querySelector(`[data-acao="${foco.acao}"]`);
      if (alvo) { alvo.focus(); try { if (foco.s != null) alvo.setSelectionRange(foco.s, foco.s); } catch (e) {} }
    }
  }

  // ── eventos (delegação no root) ──
  function bind() {
    const el = root();
    if (!el || el.dataset.cmBind) return;
    el.dataset.cmBind = '1';
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-acao]');
      if (!b || b.disabled) return;
      const a = b.dataset.acao, i = +b.dataset.i;
      if (a === 'tipo') { st.tipo = b.dataset.tipo; st.resultados = []; salvar(); render(); }
      else if (a === 'cliente') {
        st.cliente = b.dataset.cliente; st.resultados = [];
        st.ufvs = st.ufvs.filter(n => { const u = G.buscarUfv(st.mapa || [], n); return u && u.cliente === st.cliente; });
        salvar(); render();
      }
      else if (a === 'filtro-cliente') { st.filtroCliente = b.dataset.cliente; render(); }
      else if (a === 'anexar-print') { const inp = document.getElementById('cmPrintInput'); if (inp) inp.click(); }
      else if (a === 'rm-print') { st.prints.splice(+b.dataset.k, 1); render(); }
      else if (a === 'todas') {
        const k = b.dataset.grupo, porTec = INFO[st.tipo].lista === 'tecnico';
        (st.mapa || []).filter(u => (porTec ? (u.responsavel || 'Sem responsável') : (u.cliente || '—')) === k)
          .filter(u => !porTec || !st.filtroCliente || u.cliente === st.filtroCliente).forEach(u => { if (!st.ufvs.includes(u.usina)) st.ufvs.push(u.usina); });
        salvar(); render();
      }
      else if (a === 'limpar-ufvs') { st.ufvs = []; salvar(); render(); }
      else if (a === 'gerar') gerar();
      else if (a === 'abrir-ajuste') { st.resultados[i].ajusteAberto = !st.resultados[i].ajusteAberto; render(); const t = document.getElementById('cmAjuste' + i); if (t) t.focus(); }
      else if (a === 'ajustar') novaVersao(i, (document.getElementById('cmAjuste' + i) || {}).value, false);
      else if (a === 'dividir') novaVersao(i, '', true);
      else if (a === 'copiar') {
        const res = st.resultados[i]; const m = res.versoes[res.atual].saida.mensagens[+b.dataset.k];
        copiar(b.dataset.campo === 'assunto' ? m.assunto : m.texto, b);
      }
    });
    el.addEventListener('change', ev => {
      const t = ev.target, a = t.dataset.acao;
      if (a === 'ufv') {
        const ns = t.value.split('|');
        if (t.checked) ns.forEach(n => { if (!st.ufvs.includes(n)) st.ufvs.push(n); }); else st.ufvs = st.ufvs.filter(x => !ns.includes(x));
        salvar(); render();
      } else if (a === 'versao') { st.resultados[+t.dataset.i].atual = +t.value; salvar(); render(); }
      else if (a === 'envio') { st.envio = t.value || agoraSP(); render(); }
      else if (a === 'print-input') { adicionarPrints(t.files); t.value = ''; }
    });
    // Ctrl+V de imagem em qualquer lugar da Central
    document.addEventListener('paste', ev => {
      if (window._activeNav !== NAV && (typeof _activeNav === 'undefined' || _activeNav !== NAV)) return;
      const imgs = [...((ev.clipboardData && ev.clipboardData.items) || [])].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile());
      if (!imgs.length) return;
      ev.preventDefault();
      adicionarPrints(imgs);
    });
    el.addEventListener('input', ev => {
      const t = ev.target, a = t.dataset.acao;
      if (a === 'rascunho') { st.rascunho = t.value; salvar(); }
      else if (a === 'para') { st.para = t.value; }
      else if (a === 'filtro') { st.filtro = t.value; render(); }
    });
  }

  // ── acesso: só manager/admin (igual à Visão geral) ──
  function permitido() { try { return !!_currentSession && ['manager', 'admin'].includes(_currentSession.role); } catch (e) { return false; } }
  function aplicarAcesso() {
    const item = document.querySelector(`#sbNav .sb-nav-item[data-nav="${NAV}"]`);
    if (item) item.classList.toggle('cm-liberado', permitido());
  }

  function entrar() {
    if (!permitido()) return false;
    if (!st.envio) st.envio = agoraSP();
    bind();
    render();
    carregarMapa();
    return true;
  }

  // integra com o menu: NAV_TITLES + wrapper do switchNav (o do index.html já é
  // envolvido pelo LAYOUT v5; este envolve o resultado final)
  try { NAV_TITLES[NAV] = 'Central de Mensagens'; } catch (e) {}
  const base = window.switchNav;
  if (typeof base === 'function') {
    window.switchNav = function (nav) {
      if (nav === NAV && !permitido()) nav = 'atividades';
      const r = base.apply(this, [nav].concat([].slice.call(arguments, 1)));
      if (nav === NAV) { entrar(); st.envio = agoraSP(); render(); }
      aplicarAcesso();
      return r;
    };
  }
  // 17/11/2026 (Fred): o comunicado livre com IA saiu; "Elaborar Comunicado" abre a Central de Mensagens
  window._openElaborarComunicado = function () { window.switchNav(NAV); };
  restaurar();
  // a sessão é criada depois do login: confere o acesso até ela existir
  let tentativas = 0;
  const t = setInterval(() => { aplicarAcesso(); if (permitido() || ++tentativas > 120) clearInterval(t); }, 1000);
  aplicarAcesso();
  window.CentralMensagens = { entrar, render, estado: st };
})();
