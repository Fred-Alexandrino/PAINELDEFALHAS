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
    ['cliente', 'Cliente'], ['tecnico', 'Técnico'], ['email', 'E-mail'], ['envio_relatorio', 'Envio de relatório'],
  ];
  // O que cada tipo muda na tela (lista, textos, destinatário e botão)
  const INFO = {
    cliente: {
      desc: 'Mensagem de WhatsApp para o cliente: diagnóstico, risco, o que a Grid fez e o que precisa dele.',
      dest: 'Vai para o contato do cliente: 2C Energia → Carol · Thopen → Iago · Renogrid → Vitor + técnico da usina.',
      rotulo: 'Rascunho / relato',
      ph: 'Ex.: o que foi encontrado em campo, o risco, o que a equipe já fez, as opções e o que você precisa que o cliente decida.',
      botao: 'Gerar mensagem ao cliente', lista: 'cliente',
    },
    tecnico: {
      desc: 'Mensagem de WhatsApp para o técnico. Sai UMA mensagem por técnico, juntando todas as usinas dele.',
      dest: 'Vai para o responsável de cada UFV no mapeamento. A lista abaixo está agrupada por técnico.',
      rotulo: 'O que cobrar ou orientar',
      ph: 'Ex.: pendências por usina com datas (de onde veio a informação: PCM, painel de atividades) e o que você precisa que ele responda, com prazo.',
      botao: 'Gerar mensagem ao técnico', lista: 'tecnico',
    },
    email: {
      desc: 'E-mail formal para o cliente: sai com Assunto + texto + sua assinatura (sem endereços).',
      dest: 'Destinatário pelo contato do cliente (só para a saudação e o texto; os endereços você coloca no e-mail).',
      rotulo: 'Conteúdo do e-mail',
      ph: 'Ex.: o assunto, os fatos e datas, os anexos que vão junto e o que você pede ao cliente.',
      botao: 'Gerar e-mail', lista: 'cliente',
    },
    envio_relatorio: {
      desc: 'Texto que acompanha um relatório enviado ao cliente: explica o que está no anexo e o que se pede.',
      dest: 'Vai para o contato do cliente, como em "Cliente".',
      rotulo: 'Sobre o relatório anexado',
      ph: 'Ex.: Relatório de Ocorrência da via de acesso, vistoria de 16/11, com cronologia, riscos, fotos e recomendações; pedir posicionamento sobre a recuperação.',
      botao: 'Gerar texto de envio', lista: 'cliente',
    },
  };

  const st = {
    tipo: 'cliente', ufvs: [], filtro: '', rascunho: '', envio: '', mapa: null, carregandoMapa: false,
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
      localStorage.setItem(LS_KEY, JSON.stringify({ tipo: st.tipo, ufvs: st.ufvs, rascunho: st.rascunho,
        resultados: st.resultados.map(r => ({ grupo: r.grupo, versoes: r.versoes, atual: r.atual })) }));
    } catch (e) {}
  }
  function restaurar() {
    try {
      const d = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (!d) return;
      if (TIPOS.some(t => t[0] === d.tipo)) st.tipo = d.tipo;
      st.ufvs = Array.isArray(d.ufvs) ? d.ufvs : [];
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

  const rotas = () => (st.mapa ? G.resolver({ tipo: st.tipo, ufvs: st.ufvs, mapeamento: st.mapa }) : { grupos: [], avisos: [] });

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
      dataHoraEnvio: envioBR(st.envio),
      rascunho: st.rascunho,
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
    if (!st.rascunho.trim()) return toast('Cole o rascunho/relato antes de gerar.', false);
    const { grupos } = rotas();
    if (!grupos.length) return toast('Selecione ao menos uma UFV do mapeamento.', false);
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
    const chave = u => (porTec ? (u.responsavel || 'Sem responsável') : (u.cliente || '—'));
    const grupos = {};
    mapa.forEach(u => {
      if (f && !G.normalizar(u.usina + ' ' + u.cliente + ' ' + u.responsavel + ' ' + u.cluster).includes(f)) return;
      (grupos[chave(u)] = grupos[chave(u)] || []).push(u);
    });
    const sel = new Set(st.ufvs);
    const lista = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(k => `
      <div class="cm-cli">
        <div class="cm-cli-h"><span>${porTec ? '👷 ' : ''}${h(k)}${porTec ? ` <em>${h(grupos[k][0].funcao || '')} · ${h([...new Set(grupos[k].map(u => u.cluster))].join(', '))}</em>` : ''}</span><button type="button" class="cm-link" data-acao="todas" data-grupo="${h(k)}">marcar todas</button></div>
        ${grupos[k].map(u => `<label class="cm-ufv${sel.has(u.usina) ? ' on' : ''}">
          <input type="checkbox" data-acao="ufv" value="${h(u.usina)}" ${sel.has(u.usina) ? 'checked' : ''}>
          <span><b>UFV ${h(u.usina)}</b><small>${porTec ? h(u.cliente || '') + ' · ' + h(u.cidade_uf || '') : h(u.responsavel || 'sem responsável') + ' · ' + h(u.cluster || '')}</small></span></label>`).join('')}
      </div>`).join('') || `<div class="cm-vazio">${st.mapa ? 'Nenhuma UFV encontrada.' : 'Carregando o mapeamento…'}</div>`;

    const r = rotas();
    const rotaHtml = r.grupos.length ? r.grupos.map(g => `
      <div class="cm-rota">
        <div><span class="cm-rot">Para</span> <b>${h(g.destinatarios.join(' + ') || 'contato a definir')}</b>${g.cliente ? ` <span class="cm-tag">${h(g.cliente)}</span>` : ''}</div>
        <div class="cm-rota-ufvs">${g.ufvs.map(u => h(u.ufv)).join(' · ')}</div>
        ${st.tipo === 'tecnico' && g.ufvs.some(u => u.membros && u.membros.length) ? `<div class="cm-rota-obs">Equipe: ${h([...new Set(g.ufvs.flatMap(u => u.membros || []))].join(', '))}</div>` : ''}
      </div>`).join('') : `<div class="cm-vazio">${h(info.dest)}</div>`;
    const rotaAvisos = r.avisos.map(a => `<div class="cm-aviso">⚠️ ${h(a)}</div>`).join('');

    return `
      <div class="cm-bloco">
        <div class="cm-tipos" role="tablist">${TIPOS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${st.tipo === k}" class="cm-tipo${st.tipo === k ? ' on' : ''}" data-acao="tipo" data-tipo="${k}">${l}</button>`).join('')}</div>
        <p class="cm-desc">${h(info.desc)}</p>
        <div class="cm-grade">
          <div>
            <div class="cm-rot">UFV(s) · ${st.ufvs.length} selecionada(s)${porTec ? ' · por técnico' : ' · por cliente'}</div>
            <input class="cm-input" type="search" placeholder="Buscar usina, cliente, técnico ou cluster" value="${h(st.filtro)}" data-acao="filtro">
            <div class="cm-lista">${lista}</div>
            ${st.ufvs.length ? `<button type="button" class="cm-link" data-acao="limpar-ufvs">limpar seleção</button>` : ''}
          </div>
          <div>
            <div class="cm-rot">Destinatário(s)</div>
            <div class="cm-rotas">${rotaHtml}${rotaAvisos}</div>
            <label class="cm-rot" for="cmRascunho">${h(info.rotulo)}</label>
            <textarea id="cmRascunho" class="cm-input cm-ta" rows="9" placeholder="${h(info.ph)} A saudação é sua: o texto sai começando pelo corpo." data-acao="rascunho">${h(st.rascunho)}</textarea>
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
    const cab = `<div class="cm-res-h"><div><span class="cm-rot">Para</span> <b>${h(g.destinatarios.join(' + ') || 'contato a definir')}</b>
      <small>${h(g.ufvs.map(u => u.ufv).join(' · '))}</small></div>
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
      else if (a === 'todas') {
        const k = b.dataset.grupo, porTec = INFO[st.tipo].lista === 'tecnico';
        (st.mapa || []).filter(u => (porTec ? (u.responsavel || 'Sem responsável') : (u.cliente || '—')) === k).forEach(u => { if (!st.ufvs.includes(u.usina)) st.ufvs.push(u.usina); });
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
        if (t.checked) { if (!st.ufvs.includes(t.value)) st.ufvs.push(t.value); } else st.ufvs = st.ufvs.filter(x => x !== t.value);
        salvar(); render();
      } else if (a === 'versao') { st.resultados[+t.dataset.i].atual = +t.value; salvar(); render(); }
      else if (a === 'envio') { st.envio = t.value || agoraSP(); render(); }
    });
    el.addEventListener('input', ev => {
      const t = ev.target, a = t.dataset.acao;
      if (a === 'rascunho') { st.rascunho = t.value; salvar(); }
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
