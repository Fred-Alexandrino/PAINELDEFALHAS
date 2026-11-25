/* ============================================================================
   BOLETINS DE MEDIÇÃO — módulo do Omni (24/11/2026)
   Substitui "Boletins de Medicao - Plataforma.html" (pasta Boletins_Medicao).
   - Dados no backend (rotas /bm/*, SQLite na VM1), acesso com a chave do BM.
   - Custos/descontos presos à competência (AAAA-MM): não vazam para o mês seguinte.
   - Cada BM gerado vira uma emissão congelada (snapshot + hash + revisão R00/R01)
     com status gerado → enviado → aprovado → NF, e o PDF fica guardado.
   - Motor de render do boletim = cópia do HTML original (mesmo visual), com:
     rodapé configurável por cliente (o texto fixo da Thopen saiu), feriados
     móveis (Carnaval, Sexta-feira Santa, Corpus Christi) e acréscimo por item
     (encargos 20% ou BDI 50%).
   Entrada: BM.entrar() (chamado pelo switchNav('boletins')).
   ========================================================================== */
(function () {
  'use strict';
  const API = 'https://api.168.138.232.237.sslip.io';
  const LS_CHAVE = 'bmChave_v1';
  const S = { clientes: [], lancamentos: [], anexos: [], emissoes: [], curId: null, tab: 'usinas', carregado: false, carregando: false };
  const ASSETS = () => window.BM_ASSETS || { logo: '', marca: '' };

  /* ───────────────────────── utilidades ───────────────────────── */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const F = n => (n < 0 ? '-' : '') + 'R$ ' + Math.abs(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const ML = iso => { if (!iso) return '—'; const [y, m] = iso.split('-'); return MESES[+m - 1] + '/' + y; };
  const MLcurto = iso => { if (!iso) return '—'; const [y, m] = iso.split('-'); return MESES[+m - 1].slice(0, 3) + '/' + y.slice(2); };
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const dt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
  const dtHora = s => s ? dt(s) + (String(s).length > 10 ? ' ' + String(s).slice(11, 16) : '') : '—';
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const hojeIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const agoraLocalIso = () => { const d = new Date(); return hojeIso() + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const toast = (m, ok = true) => { try { if (typeof showToast === 'function') return showToast(m, ok); } catch (e) {} console.log('[BM]', m); };
  const mesIdx = s => { const [y, m] = s.split('-').map(Number); return y * 12 + (m - 1); };
  const idxMes = t => Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0');
  const somaMes = (s, n) => idxMes(mesIdx(s) + n);

  async function api(path, { method = 'GET', body, form, blob } = {}) {
    const h = { 'X-BM-Chave': localStorage.getItem(LS_CHAVE) || '' };
    const op = { method, headers: h };
    if (form) op.body = form;
    else if (body !== undefined) { h['Content-Type'] = 'application/json'; op.body = JSON.stringify(body); }
    const r = await fetch(API + path, op);
    if (blob) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }
    let j = {};
    try { j = await r.json(); } catch (e) { throw new Error('Resposta inválida do servidor (HTTP ' + r.status + ')'); }
    if (r.status === 403 && j.precisaChave) { const e = new Error(j.error || 'Chave inválida'); e.precisaChave = true; throw e; }
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  /* ─────────────── calendário: dia útil com feriados móveis ─────────────── */
  const _ferCache = {};
  function feriados(ano) {
    if (_ferCache[ano]) return _ferCache[ano];
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    const pascoa = Date.UTC(ano, mes - 1, dia), D = 86400000;
    const s = new Set([[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25]].map(([mm, dd]) => Date.UTC(ano, mm - 1, dd)));
    [-48, -47, -2, 60].forEach(o => s.add(pascoa + o * D)); // Carnaval (seg/ter), Sexta-feira Santa, Corpus Christi
    return (_ferCache[ano] = s);
  }
  const ehUtil = d => { const w = d.getUTCDay(); return w !== 0 && w !== 6 && !feriados(d.getUTCFullYear()).has(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
  const proxUtil = d => { d = new Date(d); while (!ehUtil(d)) d.setUTCDate(d.getUTCDate() + 1); return d; };
  const antUtil = d => { d = new Date(d); while (!ehUtil(d)) d.setUTCDate(d.getUTCDate() - 1); return d; };
  function nUtil(ano, m0, n) { let d = new Date(Date.UTC(ano, m0, 1)), k = 0; while (d.getUTCMonth() === m0 || k === 0) { if (ehUtil(d) && ++k === n) return d; d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCMonth() !== m0) break; } return new Date(Date.UTC(ano, m0 + 1, 0)); }
  const ultimoUtil = (ano, m0) => antUtil(new Date(Date.UTC(ano, m0 + 1, 0)));
  const fmtD = d => d ? String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear() : '—';
  const isoD = d => d ? d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') : '';

  /* Prazos da competência (mês de referência do BM). */
  function dataNf(c, comp) {
    const nf = c.nf || {}; if (!comp || !nf.tipo) return null;
    const [y, m] = comp.split('-').map(Number);
    if (nf.tipo === 'dia_util') return nUtil(y, m - 1, +nf.valor || 1);
    if (nf.tipo === 'ultimo_dia_util') return ultimoUtil(y, m - 1);
    if (nf.tipo === 'dia_fixo' && nf.valor) { let d = new Date(Date.UTC(y, m - 1, Math.min(+nf.valor, 28))); if (nf.ajusteDiaUtil) d = proxUtil(d); return d; }
    return null;
  }
  function dataEnvio(c, comp) {
    const ev = c.envio || {}; if (!comp || !ev.tipo) return null;
    const [y, m] = comp.split('-').map(Number);
    if (ev.tipo === 'dia_fixo' && ev.valor) { let d = new Date(Date.UTC(y, m - 1, Math.min(+ev.valor, 28))); if (ev.ajusteDiaUtil) d = antUtil(d); return d; }
    if (ev.tipo === 'dia_util') return nUtil(y, m - 1, +ev.valor || 1);
    if (ev.tipo === 'ultimo_dia_mes_anterior') return antUtil(new Date(Date.UTC(y, m - 1, 0)));
    if (ev.tipo === 'antes_nf') { const nf = dataNf(c, comp); if (!nf) return null; const d = new Date(nf); d.setUTCDate(d.getUTCDate() - (+ev.valor || 5)); return antUtil(d); }
    return null;
  }
  const descNf = nf => !nf || !nf.tipo ? 'não definida' : nf.tipo === 'dia_util' ? `${nf.valor}º dia útil do mês` : nf.tipo === 'ultimo_dia_util' ? 'último dia útil do mês' : `dia ${nf.valor}${nf.ajusteDiaUtil ? ' (próximo dia útil se não for útil)' : ''}`;
  const descEnvio = ev => !ev || !ev.tipo ? 'não definido' : ev.tipo === 'dia_fixo' ? `até o dia ${ev.valor}${ev.ajusteDiaUtil ? ' (antecipa se não for útil)' : ''}` : ev.tipo === 'dia_util' ? `${ev.valor}º dia útil do mês` : ev.tipo === 'ultimo_dia_mes_anterior' ? 'último dia útil do mês anterior' : `${ev.valor} dias corridos antes da NF`;

  /* ─────────────── período de medição (cópia do HTML original) ─────────────── */
  const diaDoMesUtc = (ano, m0, dia) => !dia ? new Date(Date.UTC(ano, m0 + 1, 0)) : new Date(Date.UTC(ano, m0, dia));
  function periodoMedicao(mob, diaIni, diaFim, offI, offF) {
    if (!mob) return null;
    if (diaIni == null) diaIni = 26; if (diaFim == null) diaFim = 25; if (offI == null) offI = -1; if (offF == null) offF = 0;
    const [y, m] = mob.split('-').map(Number);
    return fmtD(diaDoMesUtc(y, (m - 1) + offI, diaIni)) + ' a ' + fmtD(diaDoMesUtc(y, (m - 1) + offF, diaFim));
  }
  const periodoParaUsina = (u, dI, dF, oI, oF) => u && u.periodoCustom ? periodoMedicao(u.mob, u.diaIni, u.diaFim, u.offsetIniMeses, u.offsetFimMeses) : periodoMedicao(u.mob, dI, dF, oI, oF);
  const periodoCli = (c, u) => periodoParaUsina(u, c.diaIni != null ? c.diaIni : 26, c.diaFim != null ? c.diaFim : 25, c.offsetIniMeses != null ? c.offsetIniMeses : -1, c.offsetFimMeses != null ? c.offsetFimMeses : 0);
  const descDia = v => v == 0 ? 'último dia' : 'dia ' + v;
  const descOff = o => o === 0 ? 'do mesmo mês da' : o === -1 ? 'do mês anterior à' : o === 1 ? 'do mês seguinte à' : o < 0 ? `de ${-o} meses antes da` : `de ${o} meses depois da`;
  const hintPeriodo = (dI, dF, oI, oF) => `O período vai do ${descDia(dI)} ${descOff(oI)} data de medição até o ${descDia(dF)} ${descOff(oF)} data de medição.`;

  /* ─────────────── acréscimo (encargos/BDI) por lançamento ─────────────── */
  function pctDe(x) { if (x.pct != null && x.pct !== '') return +x.pct || 0; return x.imp ? 20 : 0; }
  function totalDe(x) { const base = +x.unit || 0; return r2(base * (1 + pctDe(x) / 100)); }

  /* ─────────────── motor de render (cópia do HTML original + ajustes) ─────────────── */
  function renderBoletim(D, titulo) {
    D = D || {};
    const ufvs = D.ufvs || [], custos = D.custos || [], cos = D.cos || [], reaj = D.reaj || null;
    const sM = ufvs.reduce((s, u) => s + (u.men || 0), 0);
    const custosAdd = custos.filter(c => !c.cond && c.tipo !== 'desconto');
    const descontos = custos.filter(c => !c.cond && c.tipo === 'desconto');
    const sC = custosAdd.reduce((s, c) => s + (c.total || 0), 0);
    const sD = descontos.reduce((s, c) => s + (c.total || 0), 0);
    const sCond = custos.filter(c => c.cond).reduce((s, c) => s + (c.total || 0), 0);
    const sK = cos.reduce((s, c) => s + (c.v || 0), 0);
    const sub = 'Mês de referência: ' + ML(D.ref) + ' · ' + ufvs.length + ' usina' + (ufvs.length === 1 ? '' : 's') + ' faturada' + (ufvs.length === 1 ? '' : 's') + (D.revisao ? ' · Revisão R' + String(D.revisao).padStart(2, '0') : '');
    const kpis = `<div class="bmx-kpi"><div class="bmx-l">Mensalidades Full O&amp;M</div><div class="bmx-v">${F(sM)}</div></div>`
      + `<div class="bmx-kpi"><div class="bmx-l">Custos adicionais</div><div class="bmx-v">${F(sC)}</div></div>`
      + (sD ? `<div class="bmx-kpi"><div class="bmx-l">Descontos</div><div class="bmx-v" style="color:var(--er)">${F(sD)}</div></div>` : '')
      + (sK ? `<div class="bmx-kpi"><div class="bmx-l">Monitoramento Remoto</div><div class="bmx-v">${F(sK)}</div></div>` : '')
      + `<div class="bmx-kpi bmx-big"><div class="bmx-l">Total do BM</div><div class="bmx-v">${F(sM + sC + sD + sK)}</div></div>`
      + (sCond ? `<div class="bmx-kpi"><div class="bmx-l">Sujeito a aprovação (fora do total)</div><div class="bmx-v">${F(sCond)}</div></div>` : '');
    const dI = D.diaIni != null ? D.diaIni : 26, dF = D.diaFim != null ? D.diaFim : 25, oI = D.offsetIniMeses != null ? D.offsetIniMeses : -1, oF = D.offsetFimMeses != null ? D.offsetFimMeses : 0;
    let h = '';
    if (ufvs.length) {
      h += '<h2>Mensalidades — Full O&M</h2><table><thead><tr><th>UFV</th><th>UF</th><th class="bmx-num">MWp</th>'
        + '<th>Data da Medição</th><th>Período de Medição</th><th class="bmx-num">Valor do contrato</th><th class="bmx-num">Dias faturados</th><th class="bmx-num">Mensalidade</th></tr></thead><tbody>';
      ufvs.forEach(u => {
        const per = periodoParaUsina(u, dI, dF, oI, oF);
        const pc = u.parcial;
        h += `<tr><td>${esc(u.nome)}${pc ? `<div class="bmx-mut" style="font-size:10.5px">Faturamento parcial — ${esc(pc.motivo || '')}${pc.desc ? ': ' + esc(pc.desc) : ''}</div>` : ''}</td><td>${esc(u.uf)}</td><td class="bmx-num">${(u.mwp || 0).toFixed(3)}</td>
     <td>${dt(u.mob)}</td><td class="bmx-mut">${pc && pc.tipo === 'dias' && pc.ini && pc.fim ? dt(pc.ini) + ' a ' + dt(pc.fim) : (per || '—')}</td><td class="bmx-num bmx-mut">${F(u.valor)}</td>
     <td class="bmx-num">${pc && pc.tipo === 'percentual' ? String(pc.pct).replace('.', ',') + '%' : pc && pc.tipo === 'valor' ? 'acordo' : (u.dias || u.dm || 30) + '/' + (u.dm || 30)}</td><td class="bmx-num"><b>${F(u.men)}</b></td></tr>`;
      });
      h += `<tr class="bmx-tot"><td colspan="7">Total mensalidades — ${ufvs.length} usina${ufvs.length === 1 ? '' : 's'}</td><td class="bmx-num">${F(sM)}</td></tr></tbody></table>`;
      const parc = ufvs.filter(u => u.parcial);
      if (parc.length) h += `<div class="bmx-note"><b>Faturamento parcial neste mês:</b> ` + parc.map(u => `${esc(u.nome)} — ${esc(u.parcial.motivo || '')}${u.parcial.desc ? ' (' + esc(u.parcial.desc) + ')' : ''}: ${esc(descParcial(u.parcial))} do valor de ${F(u.valor)} = ${F(u.men)}.`).join(' ') + `</div>`;
    }
    h += '<h2>Custos adicionais</h2>';
    if (custosAdd.length) {
      const pcts = [...new Set(custosAdd.map(pctDe))];
      const legado = pcts.length === 1 && (pcts[0] === 20 || pcts[0] === 0);
      const colAcr = legado ? 'Imposto 20%' : 'Acréscimo';
      const uni = !!D.custoUnico; // cliente pediu um valor só por item, sem abrir base/encargos/BDI
      h += '<table><thead><tr><th>UFV</th><th>SPE / CNPJ</th><th>Categoria</th><th>Descrição</th><th>Data</th><th>OS</th>'
        + (uni ? '<th class="bmx-num">Valor</th></tr></thead><tbody>' : `<th class="bmx-num">Valor base</th><th class="bmx-num">${colAcr}</th><th class="bmx-num">Total</th></tr></thead><tbody>`);
      custosAdd.slice().sort((a, b) => (a.ufv || '').localeCompare(b.ufv || '', 'pt-BR', { numeric: true, sensitivity: 'base' }) || String(a.data || '').localeCompare(String(b.data || ''))).forEach(c => {
        const p = pctDe(c), acr = (c.total || 0) - (c.unit || 0);
        h += `<tr><td>${esc(c.ufv)}</td><td class="bmx-mut" style="font-size:11px">${c.cnpj ? (c.spe ? esc(c.spe) + '<br>' : '') + esc(c.cnpj) : '—'}</td><td>${esc(c.cat)}</td>
    <td>${esc(c.desc)}</td><td>${dt(c.data)}</td><td>${esc(c.os || '—')}</td>${uni ? '' : `<td class="bmx-num ${c.unit < 0 ? 'bmx-neg' : ''}">${F(c.unit)}</td>
    <td class="bmx-num">${p ? F(acr) + (legado ? '' : `<div class="bmx-mut" style="font-size:10px">${esc(c.rotuloAcr || 'Encargos')} ${p}%</div>`) : '<span class="bmx-mut">—</span>'}</td>`}
    <td class="bmx-num ${c.total < 0 ? 'bmx-neg' : ''}"><b>${F(c.total)}</b></td></tr>`;
      });
      h += `<tr class="bmx-tot"><td colspan="${uni ? 6 : 8}">Total custos adicionais</td><td class="bmx-num">${F(sC)}</td></tr></tbody></table>`;
    } else h += '<div class="bmx-note">Nenhum custo adicional lançado neste mês. O valor do BM corresponde às mensalidades contratuais.</div>';
    if (descontos.length) {
      h += '<h2>Descontos</h2><div class="bmx-note">Descontos por descumprimento de obrigação contratual, abatimento acordado com o cliente ou reembolso de custo da Grid Co. pago pelo cliente. Os valores abaixo são <b>subtraídos</b> do total deste Boletim.</div>';
      h += '<table><thead><tr><th>UFV</th><th>SPE / CNPJ</th><th>Motivo</th><th>A que se refere</th><th>Cláusula / obrigação</th><th>Data</th><th>OS / ref.</th><th class="bmx-num">Valor do desconto</th></tr></thead><tbody>';
      descontos.forEach(c => {
        h += `<tr><td>${esc(c.ufv)}</td><td class="bmx-mut" style="font-size:11px">${c.cnpj ? (c.spe ? esc(c.spe) + '<br>' : '') + esc(c.cnpj) : '—'}</td><td>${esc(c.cat)}</td>
    <td>${esc(c.desc)}</td><td>${esc(c.clausula || '—')}</td><td>${dt(c.data)}</td><td>${esc(c.os || '—')}</td><td class="bmx-num bmx-neg"><b>${F(c.total)}</b></td></tr>`;
      });
      h += `<tr class="bmx-tot"><td colspan="7">Total descontos</td><td class="bmx-num bmx-neg">${F(sD)}</td></tr></tbody></table>`;
    }
    if (cos.length) {
      h += '<h2>Monitoramento Remoto</h2>';
      if (reaj && reaj.pct) h += `<div class="bmx-note">Contratos reajustados em ${((reaj.pct || 0) * 100).toFixed(2).replace('.', ',')}% — ${esc(reaj.desc || '')}.</div>`;
      h += '<table><thead><tr><th>UFV</th><th>UF</th><th class="bmx-num">MWp</th><th>SPE / CNPJ</th><th>Modalidade</th><th class="bmx-num">Valor do contrato</th><th class="bmx-num">Dias monitorados</th><th class="bmx-num">Mensalidade</th></tr></thead><tbody>';
      const pm = {};
      cos.forEach(c => {
        pm[c.status] = (pm[c.status] || 0) + (c.v || 0);
        h += `<tr><td>${esc(c.nome)}${c.obs ? `<div class="bmx-mut" style="font-size:10.5px">${esc(c.obs)}</div>` : ''}</td><td>${esc(c.uf)}</td><td class="bmx-num">${(c.mwp || 0).toFixed(3)}</td>
    <td class="bmx-mut" style="font-size:11px">${c.cnpj ? (c.spe ? esc(c.spe) + '<br>' : '') + esc(c.cnpj) : '—'}</td><td class="bmx-mut">${esc(c.status)}</td><td class="bmx-num bmx-mut">${F(c.valor)}</td>
    <td class="bmx-num ${c.cred ? 'bmx-neg' : ''}">${c.d ?? '—'}</td><td class="bmx-num ${c.v < 0 ? 'bmx-neg' : ''}"><b>${F(c.v)}</b></td></tr>`;
      });
      h += Object.entries(pm).map(([m, v]) => `<tr><td colspan="7" class="bmx-mut" style="padding-left:18px">subtotal — ${esc(m)}</td><td class="bmx-num">${F(v)}</td></tr>`).join('')
        + `<tr class="bmx-tot"><td colspan="7">Total Monitoramento Remoto</td><td class="bmx-num">${F(sK)}</td></tr></tbody></table>`;
    }
    { // faturamento por SPE/CNPJ
      const porU = {};
      custos.forEach(x => { if (!x.cond) porU[x.ufv] = (porU[x.ufv] || 0) + (x.total || 0); });
      const g = {}, sem = [];
      ufvs.forEach(u => {
        const add = porU[u.nome] || 0;
        if (!u.cnpj) { sem.push({ nome: u.nome, v: (u.men || 0) + add }); return; }
        (g[u.cnpj] = g[u.cnpj] || { spe: u.spe, ufvs: [], men: 0, add: 0 }).ufvs.push(u.nome);
        g[u.cnpj].men += (u.men || 0); g[u.cnpj].add += add;
      });
      const ks = Object.keys(g).sort((a, b) => (g[a].spe || '').localeCompare(g[b].spe || ''));
      if (ks.length > 1 || (ks.length === 1 && sem.length)) {
        h += `<h2>Faturamento por SPE e CNPJ — ${ks.length} nota(s) fiscal(is)</h2><table><thead><tr><th>SPE</th><th>CNPJ</th><th>UFVs</th><th class="bmx-num">Mensalidades</th><th class="bmx-num">Custos adicionais / descontos</th><th class="bmx-num">Valor da NF</th></tr></thead><tbody>`;
        let tm = 0, ta = 0;
        ks.forEach(cn => { const x = g[cn]; tm += x.men; ta += x.add; h += `<tr><td>${esc(x.spe || '—')}</td><td class="bmx-mut">${esc(cn)}</td><td style="font-size:11.5px">${esc(x.ufvs.join(', '))}</td><td class="bmx-num">${F(x.men)}</td><td class="bmx-num ${x.add < 0 ? 'bmx-neg' : ''}">${x.add ? F(x.add) : '—'}</td><td class="bmx-num"><b>${F(x.men + x.add)}</b></td></tr>`; });
        h += `<tr class="bmx-tot"><td colspan="3">TOTAL — ${ks.length} NFs</td><td class="bmx-num">${F(tm)}</td><td class="bmx-num ${ta < 0 ? 'bmx-neg' : ''}">${F(ta)}</td><td class="bmx-num">${F(tm + ta)}</td></tr></tbody></table>`;
        if (sem.length) h += `<div class="bmx-note"><b>Sem CNPJ cadastrado:</b> ` + sem.map(x => `${esc(x.nome)} (${F(x.v)})`).join(' · ') + `.</div>`;
      }
    }
    { const cs = custos.filter(c => c.cond); if (cs.length) {
      const t = cs.reduce((s, c) => s + (c.total || 0), 0);
      h += `<h2>Sujeito a aprovação — fora do total deste BM</h2><div class="bmx-note">Os itens abaixo <b>não estão somados</b> no total do Boletim. Dependem de confirmação do cliente quanto à forma de faturamento. Aprovados, entram no BM seguinte.</div>
     <table><thead><tr><th>UFV</th><th>SPE / CNPJ</th><th>Descrição</th><th>Período</th><th class="bmx-num">Valor</th></tr></thead><tbody>`
        + cs.map(c => `<tr><td>${esc(c.ufv)}</td><td class="bmx-mut" style="font-size:11px">${c.cnpj ? (c.spe ? esc(c.spe) + '<br>' : '') + esc(c.cnpj) : '—'}</td><td>${c.tipo === 'desconto' ? '<b>[Desconto]</b> ' : ''}${esc(c.desc)}</td><td>${dt(c.data)}</td><td class="bmx-num"><b>${F(c.total)}</b></td></tr>`).join('')
        + `<tr class="bmx-tot"><td colspan="4">Total sujeito a aprovação</td><td class="bmx-num">${F(t)}</td></tr></tbody></table>`;
    } }
    h += `<h2>Resumo</h2><table><tbody><tr><td>Mensalidades Full O&amp;M</td><td class="bmx-num">${F(sM)}</td></tr><tr><td>Custos adicionais</td><td class="bmx-num ${sC < 0 ? 'bmx-neg' : ''}">${F(sC)}</td></tr>`
      + (sD ? `<tr><td>Descontos</td><td class="bmx-num bmx-neg">${F(sD)}</td></tr>` : '') + (sK ? `<tr><td>Monitoramento Remoto</td><td class="bmx-num">${F(sK)}</td></tr>` : '')
      + `<tr class="bmx-tot"><td>TOTAL DO BM — ${ML(D.ref)}</td><td class="bmx-num">${F(sM + sC + sD + sK)}</td></tr>`
      + (sCond ? `<tr><td class="bmx-mut">Sujeito a aprovação, fora do total</td><td class="bmx-num bmx-mut">${F(sCond)}</td></tr>` : '') + `</tbody></table>`;
    return { sub, kpis, body: h, titulo: 'Boletim de Medição — ' + (titulo || ''), total: r2(sM + sC + sD + sK), sM, sC, sD, sK, sCond };
  }
  const RODAPE_PADRAO = 'Grid Co. — Operação & Manutenção · documento gerado para validação do Boletim de Medição. Valores em reais.';

  /* CSS do boletim na tela (mesmo do HTML original, escopo #bmPreview). */
  const CSS_PREVIEW = `
#bmPreview{all:initial;display:block;background:#fff;color:#000;font:11pt/1.45 Calibri,"Segoe UI",Arial,sans-serif;position:relative;
  --navy:#191528;--sec:#504C63;--lime:#A9DB21;--bd:#D9D9E0;--zebra:#F0F1F4;--er:#B3261E}
#bmPreview *{box-sizing:border-box}
#bmPreview .bmx-wrap{max-width:1060px;margin:0 auto;padding:24px;position:relative;z-index:1}
#bmPreview .bmx-cab{border-bottom:1px solid var(--bd);padding-bottom:14px;margin-bottom:6px}
#bmPreview .bmx-marca{font-size:12pt;font-weight:700;color:var(--navy);letter-spacing:.14em;text-transform:uppercase}
#bmPreview h1{font-size:19pt;margin:6px 0 2px;color:var(--navy);font-weight:700}
#bmPreview .bmx-faixa{height:4px;background:var(--lime);width:120px;margin:8px 0 10px;border-radius:2px}
#bmPreview .bmx-sub{color:var(--sec);font-size:10.5pt;margin-bottom:20px}
#bmPreview .bmx-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
#bmPreview .bmx-kpi,#pdfRoot .bmx-kpi{background:var(--zebra);border:1px solid var(--bd);border-left:3px solid var(--lime);border-radius:4px;padding:10px 15px;min-width:172px}
#bmPreview .bmx-kpi .bmx-l,#pdfRoot .bmx-kpi .bmx-l{font-size:8.5pt;text-transform:uppercase;color:var(--sec);letter-spacing:.06em}
#bmPreview .bmx-kpi .bmx-v,#pdfRoot .bmx-kpi .bmx-v{font-size:15pt;font-weight:700;color:var(--navy)}
#bmPreview .bmx-kpi.bmx-big,#pdfRoot .bmx-kpi.bmx-big{background:var(--navy);border-color:var(--navy);border-left-color:var(--lime)}
#bmPreview .bmx-kpi.bmx-big .bmx-l,#pdfRoot .bmx-kpi.bmx-big .bmx-l{color:#C9C6D4}#bmPreview .bmx-kpi.bmx-big .bmx-v,#pdfRoot .bmx-kpi.bmx-big .bmx-v{color:#fff}
#bmPreview h2,#pdfRoot h2{font-size:10.5pt;margin:24px 0 4px;color:var(--navy);text-transform:uppercase;letter-spacing:.06em;font-weight:700;display:block}
#bmPreview h2::after,#pdfRoot h2::after{content:"";display:block;height:3px;width:54px;background:var(--lime);margin-top:5px;border-radius:2px}
#bmPreview table,#pdfRoot table{width:100%;border-collapse:collapse;font-size:9.5pt;margin-top:8px;display:table}
#bmPreview th,#pdfRoot th{background:var(--navy);color:#fff;text-align:left;padding:7px 9px;font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em;font-weight:700;border:1px solid var(--navy)}
#bmPreview td{padding:6px 9px;border:1px solid var(--bd);vertical-align:top}
#pdfRoot td{padding:6px 9px;border-bottom:.5pt solid var(--bd);vertical-align:top}
#bmPreview tbody tr:nth-child(even) td{background:var(--zebra)}
#bmPreview .bmx-num,#pdfRoot .bmx-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
#bmPreview .bmx-mut,#pdfRoot .bmx-mut{color:var(--sec)}#bmPreview .bmx-neg,#pdfRoot .bmx-neg{color:var(--er)}
#bmPreview .bmx-tot td,#pdfRoot .bmx-tot td{font-weight:700;background:#E4E6EC;border-top:2px solid var(--navy);color:var(--navy)}
#bmPreview .bmx-note,#pdfRoot .bmx-note{background:#FBFCF5;border:1px solid var(--bd);border-left:3px solid var(--lime);border-radius:3px;padding:9px 13px;font-size:9.5pt;margin:10px 0;color:var(--sec)}
#bmPreview .bmx-foot{margin-top:30px;padding-top:10px;border-top:1px solid var(--bd);color:var(--sec);font-size:8.5pt;font-style:italic}
#bmPreview .bmx-cabPag{text-align:right;padding:24px 24px 0}#bmPreview .bmx-cabPag img{width:150px;display:inline-block}
#bmPreview #bmMarcaAgua{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:340px;z-index:0;pointer-events:none}
#pdfRoot tr{break-inside:avoid}`;

  function htmlBoletim(D, titulo, rodape) {
    const b = renderBoletim(D, titulo);
    return { b, html: `<div id="bmPreview"><img id="bmMarcaAgua" alt="" src="${ASSETS().marca}"><div class="bmx-cabPag"><img alt="Grid Co." src="${ASSETS().logo}"></div>
      <div class="bmx-wrap"><div class="bmx-cab"><div class="bmx-marca">Operação &amp; Manutenção</div><h1>${esc(b.titulo)}</h1><div class="bmx-faixa"></div></div>
      <div class="bmx-sub">${b.sub}</div><div class="bmx-kpis">${b.kpis}</div><div>${b.body}</div><div class="bmx-foot">${esc(rodape || RODAPE_PADRAO)}</div></div></div>` };
  }

  function htmlCompleto(D, titulo, rodape) {
    const { html } = htmlBoletim(D, titulo, rodape);
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc('Boletim de Medição — ' + titulo)}</title><style>body{margin:0;background:#fff}${CSS_PREVIEW}
@page{size:297mm 210mm;margin:10mm}@media print{#bmPreview tbody tr:nth-child(even) td{background:transparent!important}#bmPreview *{-webkit-print-color-adjust:exact;print-color-adjust:exact}#bmPreview tr{page-break-inside:avoid}}</style></head><body>${html}</body></html>`;
  }

  /* PDF: mesmo método do HTML original (html2canvas + jsPDF, A4 paisagem). */
  let _libsPromise = null;
  function carregarLibs() {
    if (window.html2canvas && window.jspdf) return Promise.resolve();
    if (_libsPromise) return _libsPromise;
    const add = src => new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('não carregou ' + src)); document.head.appendChild(s); });
    _libsPromise = Promise.all([add('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'), add('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')]).catch(e => { _libsPromise = null; throw e; });
    return _libsPromise;
  }
  async function pdfBlob(D, titulo, rodape) {
    await carregarLibs();
    const b = renderBoletim(D, titulo);
    const W = 1123, WMM = 297, HMM = 210;
    // Renderiza num iframe isolado: o html2canvas clona o documento inteiro do elemento,
    // e clonar o Omni (index.html enorme) a cada PDF travava a página ("página não responde").
    const ifr = document.createElement('iframe');
    ifr.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:800px;border:0;background:#fff;`;
    ifr.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"><style>${CSS_PREVIEW}</style><div id="pdfRoot" style="position:relative;width:${W}px;background:#fff;font:11pt/1.45 Calibri,'Segoe UI',Arial,sans-serif;color:#000;--navy:#191528;--sec:#504C63;--lime:#A9DB21;--bd:#D9D9E0;--zebra:#F0F1F4;--er:#B3261E;">
      <img alt="" src="${ASSETS().marca}" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:340px;z-index:0;pointer-events:none">
      <div style="position:relative;z-index:1;padding:24px 32px">
        <div style="text-align:right;margin-bottom:6px"><img alt="Grid Co." src="${ASSETS().logo}" style="width:150px"></div>
        <div style="border-bottom:1px solid var(--bd);padding-bottom:14px;margin-bottom:6px">
          <div style="font-size:12pt;font-weight:700;color:var(--navy);letter-spacing:.14em;text-transform:uppercase">Operação &amp; Manutenção</div>
          <h1 style="font-size:19pt;margin:6px 0 2px;color:var(--navy);font-weight:700">${esc(b.titulo)}</h1>
          <div style="height:4px;background:var(--lime);width:120px;margin:8px 0 10px;border-radius:2px"></div></div>
        <div style="color:var(--sec);font-size:10.5pt;margin-bottom:20px">${b.sub}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">${b.kpis}</div>
        <div>${b.body}</div>
        <div style="margin-top:30px;padding-top:10px;border-top:1px solid var(--bd);color:var(--sec);font-size:8.5pt;font-style:italic">${esc(rodape || RODAPE_PADRAO)}</div>
      </div></div></body></html>`;
    const carregou = new Promise(r => { ifr.onload = r; });
    document.body.appendChild(ifr);
    try {
      await carregou;
      const doc = ifr.contentDocument, root = doc.querySelector('#pdfRoot');
      await Promise.all([...doc.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      ifr.style.height = (root.scrollHeight + 20) + 'px';
      await new Promise(r => setTimeout(r, 30));
      const canvas = await window.html2canvas(root, { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: W, windowHeight: root.scrollHeight + 20 });
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pxMm = canvas.width / WMM, pagPx = Math.floor(HMM * pxMm), n = Math.max(1, Math.ceil(canvas.height / pagPx));
      for (let i = 0; i < n; i++) {
        const sc = document.createElement('canvas'); sc.width = canvas.width; sc.height = Math.min(pagPx, canvas.height - i * pagPx);
        const ctx = sc.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sc.width, sc.height);
        ctx.drawImage(canvas, 0, i * pagPx, canvas.width, sc.height, 0, 0, canvas.width, sc.height);
        if (i) pdf.addPage();
        pdf.addImage(sc.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, WMM, sc.height / pxMm);
      }
      return pdf.output('blob');
    } finally { ifr.remove(); }
  }
  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  /* ZIP: com 2+ PDFs, baixa tudo num arquivo só (evita salvar um por um). */
  let _zipPromise = null;
  function carregarZip() {
    if (window.JSZip) return Promise.resolve();
    if (_zipPromise) return _zipPromise;
    _zipPromise = new Promise((ok, err) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = () => { _zipPromise = null; err(new Error('não carregou o JSZip')); }; document.head.appendChild(s); });
    return _zipPromise;
  }
  async function baixarVarios(arqs, nomeZip) {
    if (arqs.length === 1) { baixar(arqs[0].blob, arqs[0].nome); return 'pdf'; }
    try {
      await carregarZip();
      const z = new window.JSZip(); arqs.forEach(a => z.file(a.nome, a.blob));
      baixar(await z.generateAsync({ type: 'blob' }), nomeZip); return 'zip';
    } catch (e) { arqs.forEach(a => baixar(a.blob, a.nome)); return 'soltos'; }
  }
  const slug = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');

  /* ─────────────── dados derivados ─────────────── */
  const cli = id => S.clientes.find(c => c.id === id);
  const cur = () => cli(S.curId);
  const lancsTodos = (c, comp) => S.lancamentos.filter(l => l.clienteId === c.id && (!comp || l.competencia === comp));
  const lancsDe = (c, comp) => lancsTodos(c, comp).filter(l => l.tipo !== 'parcial');
  const parcialDe = (c, comp, ufv) => lancsTodos(c, comp).find(l => l.tipo === 'parcial' && l.ufv === ufv) || null;
  const MOTIVOS_PARCIAL = ['Mobilização', 'Desmobilização / fim de contrato', 'Suspensão ou parada da usina', 'Escopo parcial no mês', 'Acordo comercial', 'Outro'];
  /* Faturamento parcial do mês: vale só para a competência lançada (não mexe no cadastro). */
  function aplicarParcial(u, p) {
    if (!p) return u;
    const base = +u.valor || 0, x = { ...u, parcial: { tipo: p.pTipo, motivo: p.cat, desc: p.desc, pct: p.pct, dias: p.dias, dm: p.dm, ini: p.ini, fim: p.fim } };
    if (p.pTipo === 'dias') { x.dias = +p.dias || 0; x.dm = +p.dm || 30; x.men = r2(base * x.dias / x.dm); }
    else if (p.pTipo === 'percentual') { x.men = r2(base * (+p.pct || 0) / 100); x.dias = x.dm = 30; }
    else if (p.pTipo === 'valor') { x.men = r2(+p.valorFixo || 0); x.dias = x.dm = 30; }
    return x;
  }
  const descParcial = pc => !pc ? '' : pc.tipo === 'dias' ? `${pc.dias} de ${pc.dm} dias${pc.ini && pc.fim ? ` (${dt(pc.ini)} a ${dt(pc.fim)})` : ''}` : pc.tipo === 'percentual' ? `${String(pc.pct).replace('.', ',')}% da mensalidade` : 'valor acordado';
  const anexosDe = dono => S.anexos.filter(a => a.dono === dono);
  const emissoesDe = (c, comp) => S.emissoes.filter(e => e.clienteId === c.id && (!comp || e.competencia === comp));
  const FASE = { gerado: 1, enviado: 2, aprovado: 3, nf: 4 };
  const FASE_TXT = ['Não gerado', 'Gerado (não enviado)', 'Enviado', 'Aprovado', 'NF emitida'];

  function lancComTotais(c, l) {
    const u = (c.ufvs || []).find(u => u.nome === l.ufv) || {};
    const unit = l.tipo === 'desconto' ? -Math.abs(+l.unit || 0) : (+l.unit || 0);
    const x = { ...l, unit, cnpj: u.cnpj || l.cnpj || '', spe: u.spe || l.spe || '' };
    x.total = totalDe(x);
    return x;
  }

  function situacao(c, comp) {
    const us = (c.ufvs || []).map(u => u.nome);
    const ems = emissoesDe(c, comp).filter(e => e.status !== 'cancelado');
    if (!us.length && !ems.length) return { fase: -1, ems };
    const alvo = us.length ? us : [...new Set(ems.flatMap(e => e.usinas))];
    let min = 9;
    const porUsina = {};
    alvo.forEach(n => {
      const f = Math.max(0, ...ems.filter(e => e.usinas.includes(n)).map(e => FASE[e.status] || 0));
      porUsina[n] = f; min = Math.min(min, f);
    });
    const envios = ems.filter(e => e.enviadoEm).map(e => e.enviadoEm).sort();
    return { fase: min === 9 ? 0 : min, porUsina, ems, enviadoEm: envios[envios.length - 1] || null };
  }

  function alerta(c, comp) {
    const sit = situacao(c, comp);
    const env = dataEnvio(c, comp), nf = dataNf(c, comp);
    const hoje = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const dias = d => d ? Math.round((d.getTime() - hoje) / 86400000) : null;
    let nivel = 'ok', txt = '';
    if (sit.fase >= 2) { nivel = 'ok'; txt = FASE_TXT[sit.fase] + (sit.enviadoEm ? ' · enviado ' + dt(sit.enviadoEm) : ''); }
    else if (sit.fase === -1) { nivel = 'neutro'; txt = 'Sem usinas cadastradas'; }
    else if (env) {
      const d = dias(env);
      txt = (sit.fase === 1 ? 'Gerado, falta enviar · ' : 'Não enviado · ') + (d < 0 ? `prazo de envio venceu em ${fmtD(env)} (${-d} dia${d === -1 ? '' : 's'})` : d === 0 ? 'envio vence HOJE' : `enviar até ${fmtD(env)} (${d} dia${d === 1 ? '' : 's'})`);
      nivel = d < 0 ? 'atraso' : d <= 2 ? 'atencao' : 'pendente';
    } else { nivel = 'pendente'; txt = (sit.fase === 1 ? 'Gerado, falta enviar' : 'Não enviado') + ' · prazo de envio não configurado'; }
    return { ...sit, nivel, txt, env, nf, diasEnvio: dias(env), diasNf: dias(nf) };
  }

  /* ─────────────── montagem do D (igual ao buildDFromCliente original) ─────────────── */
  function montarD(c, usinas, comp) {
    const sel = new Set(usinas);
    const ufvs = (c.ufvs || []).filter(u => sel.has(u.nome)).map(u => aplicarParcial({ ...u }, parcialDe(c, comp, u.nome)));
    const custos = lancsDe(c, comp).filter(l => sel.has(l.ufv)).map(l => lancComTotais(c, l));
    const todas = (c.ufvs || []).length === ufvs.length;
    return {
      ref: comp, diaIni: c.diaIni != null ? c.diaIni : 26, diaFim: c.diaFim != null ? c.diaFim : 25,
      offsetIniMeses: c.offsetIniMeses != null ? c.offsetIniMeses : -1, offsetFimMeses: c.offsetFimMeses != null ? c.offsetFimMeses : 0,
      ufvs, custos, cos: (c.modo === 'multi' || todas) && (c.modo === 'multi') ? (c.cos || []).map(m => ({ ...m })) : [], reaj: c.reaj || null,
      ...(c.custoValorUnico ? { custoUnico: true } : {})
    };
  }
  /* Um lote = o que vai num e-mail. Multi-usina: 1 documento com todas. Usina única: 1 documento por usina. */
  function montarLote(c, usinas, comp) {
    const docs = c.modo === 'multi'
      ? [{ usina: '*', titulo: c.nome, D: montarD(c, usinas, comp) }]
      : usinas.map(n => ({ usina: n, titulo: c.nome + ' — ' + n, D: montarD(c, [n], comp) }));
    return { versao: 1, cliente: { id: c.id, nome: c.nome, modo: c.modo, email: c.email || {}, rodape: c.rodape || '' }, competencia: comp, usinas, docs };
  }

  /* ─────────────── texto do e-mail (padrão dos e-mails de BM do Fred) ─────────────── */
  function nomeCurtoUfv(u) { return String(u.nome || '').replace(/^UFVs?\s+/i, '') + (u.uf ? '/' + u.uf : ''); }
  function periodoCurto(txt) {
    const m = /(\d{2})\/(\d{2})\/(\d{4}) a (\d{2})\/(\d{2})\/(\d{4})/.exec(txt || ''); if (!m) return txt || '—';
    if (m[2] === m[5] && m[3] === m[6]) return `${m[1]} a ${m[4]}/${m[5]}/${m[6]}`;
    if (m[3] === m[6]) return `${m[1]}/${m[2]} a ${m[4]}/${m[5]}/${m[6]}`;
    return txt;
  }
  function mesFimPeriodo(txt) { const m = /a \d{2}\/(\d{2})\/(\d{4})/.exec(txt || ''); return m ? MESES[+m[1] - 1] + '/' + m[2] : ''; }
  function listaPt(arr) { return arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1]; }

  /* Texto curto para o canal do Teams com o Financeiro ("Acompanhamento Medições e Faturamento"). */
  function montarTeams(snap, emissao) {
    const c = snap.cliente, docs = snap.docs || [];
    let men = 0, add = 0, desc = 0, nU = 0; const comCusto = [];
    docs.forEach(doc => doc.D.ufvs.forEach(u => {
      nU++; men += u.men || 0;
      const cs = doc.D.custos.filter(x => x.ufv === u.nome && !x.cond);
      const a = cs.filter(x => x.tipo !== 'desconto').reduce((s, x) => s + x.total, 0), d = cs.filter(x => x.tipo === 'desconto').reduce((s, x) => s + x.total, 0);
      add += a; desc += d; if (a || d) comCusto.push(nomeCurtoUfv(u).replace(/\/[A-Z]{2}$/, ''));
    }));
    const total = men + add + desc, mes = ML(snap.competencia);
    const rev = emissao && emissao.revisao ? emissao.revisao : 0, R = n => 'R' + String(n).padStart(2, '0');
    const nf = dataNf(c, snap.competencia), nfTxt = nf ? ` (NF até ${fmtD(nf)})` : '';
    const h = new Date().getHours(), saud = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ', pessoal.';
    const st = emissao ? emissao.status : 'gerado';
    const doc = nU > 1 ? 'BMs' : 'BM';
    const revTxt = rev ? ` — revisão ${R(rev)}, que substitui a ${R(rev - 1)}${c.reaj && c.reaj.pct ? ` (já com o reajuste contratual de ${String(r2(c.reaj.pct * 100)).replace('.', ',')}%)` : ''}` : '';
    const linhas = [saud, ''];
    if (st === 'aprovado') {
      linhas.push(`${doc} da ${c.nome} (competência ${mes}${rev ? ', ' + R(rev) : ''}) aprovado${nU > 1 ? 's' : ''} pelo cliente${emissao.aprovadoEm ? ' em ' + dtHora(emissao.aprovadoEm).slice(0, 5) : ''}.`, '');
      linhas.push(`• ${nU} UFV${nU > 1 ? 's' : ''}`, `• Total: ${F(total)}`, '');
      linhas.push(`Financeiro, está autorizada a emissão da${nU > 1 ? 's' : ''} Nota${nU > 1 ? 's' : ''} Fiscal${nU > 1 ? 'is' : ''}${nfTxt}. A aprovação está na cadeia de e-mail do BM.`);
    } else if (st === 'nf') {
      linhas.push(`NF${nU > 1 ? 's' : ''} da ${c.nome} (competência ${mes}) emitida${nU > 1 ? 's' : ''}${emissao.nfNumero ? ' — nº ' + emissao.nfNumero : ''}. Obrigado!`);
    } else {
      linhas.push(`${doc} da ${c.nome} (competência ${mes})${revTxt} enviado${nU > 1 ? 's' : ''} para aprovação, com o Financeiro em cópia.`, '');
      linhas.push(`• ${nU} UFV${nU > 1 ? 's' : ''}`);
      linhas.push(`• Total: ${F(total)}` + (add || desc ? `, já com ${[add ? 'custos adicionais' : '', desc ? 'descontos' : ''].filter(Boolean).join(' e ')} de ${listaPt(comCusto)}` : ''), '');
      linhas.push(`Já pedi ao cliente aprovação com urgência, para conseguirmos emitir as Notas Fiscais dentro do prazo contratual${nfTxt}. Assim que a aprovação chegar, sinalizo aqui para seguirmos com as emissões.`);
    }
    return linhas.join('\n');
  }

  function montarEmail(snap, emissao) {
    const em = snap.cliente.email || {};
    const linhas = [], notas = [], cond = [], notasParcial = [];
    let marca = 0;
    snap.docs.forEach(doc => {
      const D = doc.D;
      D.ufvs.forEach(u => {
        const cs = D.custos.filter(x => x.ufv === u.nome);
        const adds = cs.filter(x => !x.cond && x.tipo !== 'desconto'), descs = cs.filter(x => !x.cond && x.tipo === 'desconto');
        cs.filter(x => x.cond).forEach(x => cond.push(x));
        const sC = adds.reduce((s, x) => s + x.total, 0), sD = descs.reduce((s, x) => s + x.total, 0);
        let mk = '';
        if (adds.length || descs.length) {
          marca++; mk = '*'.repeat(marca);
          // Padrão do Fred (24/11/2026): nota só com o valor por usina, sem descrever item nem BDI/encargos;
          // a descrição dos custos fica no boletim anexado.
          const partes = [];
          if (sC) partes.push(`${F(sC)} de custos adicionais`);
          if (sD) partes.push(`${F(Math.abs(sD))} de desconto`);
          notas.push(`• ${nomeCurtoUfv(u)}: ${partes.join(' e ')}`);
        }
        let perU = periodoCurto(periodoParaUsina(u, D.diaIni, D.diaFim, D.offsetIniMeses, D.offsetFimMeses));
        if (u.parcial) {
          if (u.parcial.tipo === 'dias' && u.parcial.ini && u.parcial.fim) perU = periodoCurto(dt(u.parcial.ini) + ' a ' + dt(u.parcial.fim));
          notasParcial.push(`${nomeCurtoUfv(u)}: faturamento parcial — ${u.parcial.motivo || ''}${u.parcial.desc ? ' (' + u.parcial.desc + ')' : ''}: ${descParcial(u.parcial)} do valor mensal de ${F(u.valor)}, total de ${F(u.men)}.`);
        }
        linhas.push({ ufv: nomeCurtoUfv(u), periodo: perU, men: u.men || 0, custos: sC, desc: sD, total: (u.men || 0) + sC + sD, mk });
      });
      (D.cos || []).forEach(m => linhas.push({ ufv: m.nome + ' (monitoramento remoto)', periodo: '—', men: m.v || 0, custos: 0, desc: 0, total: m.v || 0, mk: '' }));
    });
    const n = snap.docs.reduce((s, d) => s + d.D.ufvs.length, 0);
    const plural = snap.cliente.modo === 'multi' ? false : n > 1;
    const D0 = snap.docs[0].D, u0 = D0.ufvs[0] || {};
    const per0 = periodoParaUsina(u0, D0.diaIni, D0.diaFim, D0.offsetIniMeses, D0.offsetFimMeses);
    const mesPer = mesFimPeriodo(per0), mesRef = ML(snap.competencia);
    const periodos = [...new Set(linhas.filter(l => l.periodo !== '—').map(l => l.periodo))];
    const ufvsTxt = listaPt(linhas.filter(l => !/monitoramento remoto/.test(l.ufv)).map(l => l.ufv));
    const rotulo = em.rotuloMes === 'referencia' ? `de referência <b>${mesRef}</b>` : `referente${plural ? 's' : ''} ao mês de <b>${mesPer || mesRef}</b>`;
    const perTxt = periodos.length === 1 ? ` (período de <b>${periodos[0]}</b>)` : '';
    const h = new Date().getHours();
    const saud = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + (em.contato ? ', ' + em.contato : '') + '.';
    const rev = emissao && emissao.revisao ? ` — revisão R${String(emissao.revisao).padStart(2, '0')}` : '';
    const intro = plural
      ? `Seguem, em anexo, os Boletins de Medição ${rotulo}${perTxt} das UFVs ${esc(ufvsTxt)}${rev}, para sua aprovação:`
      : `Segue, em anexo, o Boletim de Medição ${rotulo}${perTxt} ${snap.cliente.modo === 'multi' ? 'das UFVs' : 'da UFV'} ${esc(ufvsTxt)}${rev}, para sua aprovação:`;
    const temDesc = linhas.some(l => l.desc);
    const th = 'background:#191528;color:#ffffff;padding:5px 10px;font-weight:bold;';
    const td = 'border-bottom:1px solid #D9D7E0;padding:4px 10px;';
    const tot = linhas.reduce((a, l) => ({ men: a.men + l.men, custos: a.custos + l.custos, desc: a.desc + l.desc, total: a.total + l.total }), { men: 0, custos: 0, desc: 0, total: 0 });
    const tabela = `<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt"><tr>`
      + `<td style="${th}">UFV</td><td style="${th}">Período</td><td style="${th}text-align:right">Mensalidade Full O&amp;M</td><td style="${th}text-align:right">Custos adicionais</td>${temDesc ? `<td style="${th}text-align:right">Descontos</td>` : ''}<td style="${th}text-align:right">Total do BM</td></tr>`
      + linhas.map(l => `<tr><td style="${td}">${esc(l.ufv)}</td><td style="${td}">${esc(l.periodo)}</td><td style="${td}text-align:right">${F(l.men)}</td><td style="${td}text-align:right">${F(l.custos)}${l.mk && l.custos ? l.mk : ''}</td>${temDesc ? `<td style="${td}text-align:right">${F(l.desc)}${l.mk && l.desc && !l.custos ? l.mk : ''}</td>` : ''}<td style="${td}text-align:right">${F(l.total)}</td></tr>`).join('')
      + `<tr><td style="background:#F2F2F4;padding:4px 10px"><b>Total</b></td><td style="background:#F2F2F4"></td><td style="background:#F2F2F4;padding:4px 10px;text-align:right"><b>${F(tot.men)}</b></td><td style="background:#F2F2F4;padding:4px 10px;text-align:right"><b>${F(tot.custos)}</b></td>${temDesc ? `<td style="background:#F2F2F4;padding:4px 10px;text-align:right"><b>${F(tot.desc)}</b></td>` : ''}<td style="background:#F2F2F4;padding:4px 10px;text-align:right"><b>${F(tot.total)}</b></td></tr></table>`;
    const nArq = snap.docs.length;
    const temC = linhas.some(l => l.custos), temD = linhas.some(l => l.desc);
    const fraseAnexo = `A descrição ${temC && temD ? 'dos custos adicionais e dos descontos' : temD ? 'dos descontos' : 'dos custos adicionais'} está ${nArq > 1 ? 'nos arquivos anexados' : 'no arquivo anexado'}.`;
    const condTxt = cond.length ? `Fora do total, aguardando a sua aprovação: ${cond.map(x => `${nomeCurtoUfv({ nome: x.ufv })} — ${x.desc}: ${F(x.total)}`).join('; ')}.` : '';
    const fecho = em.fechamento || (plural ? 'Assim que possível, peço a validação dos boletins, para que possamos seguir com o trâmite e emissão das Notas Fiscais Grid.' : 'Assim que possível, peço a validação do boletim, para que possamos seguir com o trâmite e emissão da Nota Fiscal Grid.');
    const p = t => `<p style="margin:0 0 10px 0">${t}</p>`;
    const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${p(esc(saud) + '<br>Tudo bem?')}${p(intro)}${tabela}`
      + (notas.length || notasParcial.length ? `<p style="margin:8px 0 10px 0">${[...notasParcial, ...notas].map(esc).join('<br>')}</p>` : '<p style="margin:0 0 10px 0"></p>')
      + (notas.length ? p(esc(fraseAnexo)) : '')
      + (condTxt ? p(esc(condTxt)) : '') + p(esc(fecho)) + p('Atenciosamente,') + '</div>';
    const plain = [saud, 'Tudo bem?', '', intro.replace(/<[^>]+>/g, ''), '',
      ...linhas.map(l => {
        const per = periodos.length > 1 && l.periodo !== '—' ? ` (${l.periodo})` : '';
        const partes = [];
        if (l.custos) partes.push(`${F(l.custos)} de custos adicionais`);
        if (l.desc) partes.push(`${F(Math.abs(l.desc))} de desconto`);
        return partes.length
          ? `• ${l.ufv}${per}: mensalidade de ${F(l.men)} ${l.custos ? '+' : '−'} ${partes.join(' − ')} = ${F(l.total)}`
          : `• ${l.ufv}${per}: ${F(l.total)}`;
      }),
      '', `Total dos boletins: ${F(tot.total)}`, '', ...notasParcial, ...(notas.length ? [fraseAnexo] : []), ...(condTxt ? ['', condTxt] : []), '', fecho, '', 'Atenciosamente,'].join('\n');
    const ufvsAssunto = linhas.filter(l => !/monitoramento remoto/.test(l.ufv)).map(l => l.ufv.replace(/\/[A-Z]{2}$/, '')).join(' / ');
    const subst = s => String(s || '').replace(/\{CLIENTE\}/g, snap.cliente.nome.toUpperCase()).replace(/\{MES_PERIODO\}/g, cap(mesPer || mesRef))
      .replace(/\{MES_REF\}/g, cap(mesRef)).replace(/\{MES_REF_CURTO\}/g, cap(MLcurto(snap.competencia))).replace(/\{UFVS\}/g, ufvsAssunto)
      .replace(/\{REV\}/g, emissao && emissao.revisao ? ' - R' + String(emissao.revisao).padStart(2, '0') : '');
    const assunto = subst(em.assunto || '[{CLIENTE}] Boletins de Medição - {MES_PERIODO}{REV}') + (emissao && emissao.revisao && !/\{REV\}/.test(em.assunto || '{REV}') ? ' - R' + String(emissao.revisao).padStart(2, '0') : '');
    return { assunto, html, plain, para: em.para || '', cc: em.cc || '', total: tot.total };
  }

  async function copiarRico(html, plain) {
    // 1º: copia o e-mail renderizado como seleção (igual a Ctrl+C na tela) — é o que o Outlook cola com a tabela
    try {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff;color:#000';
      box.innerHTML = html; document.body.appendChild(box);
      const sel = window.getSelection(), rg = document.createRange(); rg.selectNodeContents(box); sel.removeAllRanges(); sel.addRange(rg);
      const ok = document.execCommand('copy'); sel.removeAllRanges(); box.remove();
      if (ok) { toast('E-mail copiado com a tabela. Cole no corpo do Outlook (Ctrl+V).'); return; }
    } catch (e) {}
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
      toast('E-mail copiado. Cole no Outlook (Ctrl+V).');
    } catch (e) {
      try { await navigator.clipboard.writeText(plain); toast('Copiado como texto simples (o navegador bloqueou a cópia formatada).'); }
      catch (e2) { toast('Não foi possível copiar: ' + e2.message, false); }
    }
  }
  async function copiar(t, rot) { try { await navigator.clipboard.writeText(t); toast((rot || 'Texto') + ' copiado.'); } catch (e) { toast('Não foi possível copiar.', false); } }

  /* ─────────────── estilos do painel ─────────────── */
  function injetarCss() {
    if (document.getElementById('bmCss')) return;
    const st = document.createElement('style'); st.id = 'bmCss';
    st.textContent = CSS_PREVIEW + `
#bmRoot{font-size:13px;color:var(--text)}
#bmRoot .bm-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
#bmRoot .bm-h{font-size:16px;font-weight:700;margin-right:auto}
#bmRoot .bm-btn,.bm-modal .bm-btn,#bmOverlay .bm-btn{background:var(--panel-alt);border:1px solid var(--border-strong);color:var(--text);border-radius:8px;padding:7px 12px;font-size:12.5px;cursor:pointer;font-weight:600;white-space:nowrap}
#bmRoot .bm-btn:hover,.bm-modal .bm-btn:hover{border-color:var(--teal)}
.bm-btn.pri{background:var(--acao)!important;border-color:var(--acao)!important;color:#fff!important}
.bm-btn.sm{padding:4px 9px!important;font-size:11.5px!important}
.bm-btn.ghost{background:transparent!important;border-color:transparent!important;color:var(--text-dim)!important}
.bm-btn:disabled{opacity:.45;cursor:not-allowed}
#bmRoot .bm-prazos{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-bottom:16px}
#bmRoot .bm-pz{background:var(--panel);border:1px solid var(--border);border-left:4px solid var(--border-strong);border-radius:10px;padding:10px 12px;cursor:pointer}
#bmRoot .bm-pz.on{outline:2px solid var(--teal)}
#bmRoot .bm-pz.ok{border-left-color:var(--sla-ok)}#bmRoot .bm-pz.atencao{border-left-color:var(--sla-warn)}#bmRoot .bm-pz.atraso{border-left-color:var(--sla-breach)}#bmRoot .bm-pz.pendente{border-left-color:var(--blue)}
#bmRoot .bm-pz .n{font-weight:700;font-size:14px}#bmRoot .bm-pz .c{color:var(--text-faint);font-size:11.5px;margin:2px 0 6px}#bmRoot .bm-pz .t{font-size:12px;color:var(--text-dim)}
#bmRoot .bm-pz .x{font-size:11px;color:var(--sla-warn);margin-top:4px}
#bmRoot .bm-card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px}
#bmRoot .bm-card h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-dim)}
#bmRoot .bm-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:10px 0 14px;border-bottom:1px solid var(--border)}
#bmRoot .bm-tab{padding:8px 12px;cursor:pointer;color:var(--text-dim);font-weight:600;border-bottom:2px solid transparent;margin-bottom:-1px}
#bmRoot .bm-tab.on{color:var(--text);border-bottom-color:var(--teal)}
#bmRoot table.bm-t{width:100%;border-collapse:collapse;font-size:12.5px}
#bmRoot table.bm-t th{text-align:left;padding:7px 8px;color:var(--text-faint);font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid var(--border-strong);white-space:nowrap}
#bmRoot table.bm-t td{padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:top}
#bmRoot .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
#bmRoot .mut{color:var(--text-faint)}
#bmRoot .bm-note,.bm-modal .bm-note{background:var(--panel-alt);border-left:3px solid var(--teal);border-radius:6px;padding:8px 11px;font-size:12px;color:var(--text-dim);margin:8px 0}
#bmRoot .bm-warn{background:rgba(233,180,76,.12);border-left:3px solid var(--sla-warn);border-radius:6px;padding:8px 11px;font-size:12px;margin:8px 0}
.bm-pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;background:var(--panel-alt);color:var(--text-dim);white-space:nowrap}
.bm-pill.s1{background:rgba(96,165,250,.16);color:var(--blue)}.bm-pill.s2{background:rgba(233,180,76,.18);color:var(--amber)}.bm-pill.s3,.bm-pill.s4{background:rgba(79,179,143,.18);color:var(--sla-ok)}.bm-pill.sx{background:rgba(239,68,68,.14);color:var(--red)}
#bmRoot .bm-kpis{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
#bmRoot .bm-kpi{flex:1;min-width:150px;background:var(--panel-alt);border-radius:8px;padding:9px 12px}
#bmRoot .bm-kpi .l{font-size:10.5px;color:var(--text-faint);text-transform:uppercase;font-weight:700}#bmRoot .bm-kpi .v{font-size:17px;font-weight:700;margin-top:2px}
.bm-modal-ov{position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}
.bm-modal{background:var(--panel);color:var(--text);border:1px solid var(--border-strong);border-radius:14px;width:min(640px,96vw);max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.bm-modal .hd{padding:14px 18px;border-bottom:1px solid var(--border);font-weight:700;font-size:15px}
.bm-modal .bd{padding:14px 18px}.bm-modal .ft{padding:12px 18px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.bm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px 12px}
.bm-f{display:flex;flex-direction:column;gap:4px}.bm-f.w{grid-column:1/-1}.bm-f.chk{flex-direction:row;align-items:center;gap:8px}
.bm-f label{font-size:11.5px;color:var(--text-dim);font-weight:600}
.bm-f input,.bm-f select,.bm-f textarea{background:var(--panel-alt);border:1px solid var(--border-strong);color:var(--text);border-radius:7px;padding:7px 9px;font:inherit;font-size:13px}
.bm-f textarea{min-height:64px;resize:vertical}
.bm-sec{grid-column:1/-1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--teal);margin-top:6px}
#bmOverlay{position:fixed;inset:0;z-index:3500;background:#EAEAEF;display:flex;flex-direction:column}
#bmOverlay .ov-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 16px;background:#191528;color:#fff}
#bmOverlay .ov-bar .bm-btn{background:#2B2750;border-color:#3A356B;color:#fff}
#bmOverlay .ov-body{flex:1;display:flex;overflow:hidden}
#bmOverlay .ov-docs{flex:1;overflow:auto;padding:16px}
#bmOverlay .ov-doc{background:#fff;max-width:1296px;margin:0 auto 20px;box-shadow:0 2px 18px rgba(20,15,40,.12)}
#bmOverlay .ov-side{width:440px;max-width:44vw;background:var(--panel);color:var(--text);overflow:auto;padding:14px 16px;border-left:1px solid var(--border)}
#bmOverlay .ov-side h4{margin:14px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-dim)}
#bmOverlay .ov-mail{background:#fff;color:#000;border-radius:8px;padding:12px;font-size:12px;overflow:auto;max-height:340px}
#bmOverlay .ov-row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
#bmOverlay .ov-tabs{display:flex;gap:6px;flex-wrap:wrap;max-width:1296px;margin:0 auto 10px}
#bmOverlay .ov-tab{background:#fff;border:1px solid #D9D9E0;border-radius:16px;padding:4px 11px;font-size:12px;cursor:pointer;color:#191528}
#bmOverlay .ov-tab.on{background:#191528;color:#fff}
@media (max-width:900px){#bmOverlay .ov-body{flex-direction:column}#bmOverlay .ov-side{width:auto;max-width:none;border-left:0;border-top:1px solid var(--border)}}`;
    document.head.appendChild(st);
  }

  /* ─────────────── modal genérico ─────────────── */
  function modal(titulo, corpoHtml, botoes) {
    const ov = document.createElement('div'); ov.className = 'bm-modal-ov';
    ov.innerHTML = `<div class="bm-modal"><div class="hd">${esc(titulo)}</div><div class="bd">${corpoHtml}</div><div class="ft"></div></div>`;
    const ft = ov.querySelector('.ft');
    const fechar = () => ov.remove();
    (botoes || [{ t: 'Fechar' }]).forEach(b => {
      const el = document.createElement('button'); el.className = 'bm-btn ' + (b.cls || ''); el.textContent = b.t;
      el.onclick = async () => { if (!b.fn) return fechar(); el.disabled = true; try { const r = await b.fn(ov); if (r !== false) fechar(); } catch (e) { toast(e.message, false); } finally { el.disabled = false; } };
      ft.appendChild(el);
    });
    ov.addEventListener('mousedown', e => { if (e.target === ov) fechar(); });
    document.body.appendChild(ov);
    return ov;
  }
  const val = (ov, id) => { const el = ov.querySelector('#' + id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
  const opts = (arr, sel) => arr.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const diasOpts = (sel, comUltimo = true) => opts([...(comUltimo ? [[0, 'Último dia do mês']] : []), ...Array.from({ length: 31 }, (_, i) => [i + 1, 'Dia ' + (i + 1)])], sel);
  const offOpts = sel => opts([[-2, '2 meses antes'], [-1, '1 mês antes'], [0, 'Mesmo mês da medição'], [1, '1 mês depois'], [2, '2 meses depois']], sel);

  /* ─────────────── carregar / salvar ─────────────── */
  async function carregar() {
    S.carregando = true;
    try {
      const j = await api('/bm/estado');
      S.clientes = j.clientes || []; S.lancamentos = j.lancamentos || []; S.anexos = j.anexos || []; S.emissoes = j.emissoes || [];
      S.carregado = true;
      const ativos = S.clientes.filter(c => c._ativo !== false);
      if (!S.curId || !cli(S.curId)) S.curId = (ativos[0] || {}).id || null;
    } finally { S.carregando = false; }
  }
  async function salvarCliente(c) {
    const j = await api('/bm/cliente', { method: 'POST', body: { cliente: c } });
    const i = S.clientes.findIndex(x => x.id === j.cliente.id);
    const novo = { ...j.cliente, _ativo: true };
    if (i >= 0) S.clientes[i] = novo; else S.clientes.push(novo);
    return novo;
  }

  /* ─────────────── render principal ─────────────── */
  function root() { return document.getElementById('bmRoot'); }

  function telaChave(msg) {
    const el = root(); if (!el) return;
    el.innerHTML = `<div class="bm-card" style="max-width:520px"><h3>Boletins de Medição</h3>
      <div class="bm-note">${esc(msg || 'Informe a chave do módulo de BM (fica salva só neste navegador).')}</div>
      <div class="bm-f"><label>Chave do BM</label><input type="password" id="bmChaveIn" autocomplete="off"></div>
      <div style="margin-top:10px"><button class="bm-btn pri" id="bmChaveOk">Entrar</button></div></div>`;
    el.querySelector('#bmChaveOk').onclick = async () => {
      localStorage.setItem(LS_CHAVE, el.querySelector('#bmChaveIn').value.trim());
      entrar(true);
    };
  }

  async function entrar(forcar) {
    const el = root(); if (!el) return;
    injetarCss();
    // _currentSession é "let" global do index.html (não fica em window)
    const sess = (typeof _currentSession !== 'undefined' && _currentSession) || {};
    if (!['manager', 'admin'].includes(sess.role)) { el.innerHTML = '<div class="bm-note">Boletins de Medição: acesso restrito ao supervisor de contrato.</div>'; return; }
    if (!localStorage.getItem(LS_CHAVE)) return telaChave();
    if (S.carregado && !forcar) { render(); carregar().then(render).catch(() => {}); return; }
    el.innerHTML = '<div class="bm-note">Carregando Boletins de Medição…</div>';
    try { await carregar(); render(); }
    catch (e) { if (e.precisaChave) { localStorage.removeItem(LS_CHAVE); telaChave(e.message); } else el.innerHTML = `<div class="bm-warn">Erro ao carregar os BMs: ${esc(e.message)} <button class="bm-btn sm" id="bmRetry">Tentar de novo</button></div>`, el.querySelector('#bmRetry').onclick = () => entrar(true); }
  }

  function render() {
    const el = root(); if (!el) return;
    const ativos = S.clientes.filter(c => c._ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const arquivados = S.clientes.filter(c => c._ativo === false);
    const c = cur();
    el.innerHTML = `
      <div class="bm-bar"><div class="bm-h">Boletins de Medição</div>
        <button class="bm-btn" id="bmNovoCli">+ Cliente</button>
        <button class="bm-btn" id="bmRecarregar">↻ Atualizar</button>
        <button class="bm-btn" id="bmBackup">⭳ Backup (JSON)</button></div>
      <div class="bm-prazos">${ativos.map(cardPrazo).join('') || '<div class="bm-note">Nenhum cliente cadastrado.</div>'}</div>
      ${arquivados.length ? `<div class="mut" style="font-size:11.5px;margin:-8px 0 12px">Arquivados: ${arquivados.map(a => `<a href="#" data-reativar="${esc(a.id)}" style="color:var(--text-dim)">${esc(a.nome)}</a>`).join(' · ')}</div>` : ''}
      <div id="bmCli">${c ? telaCliente(c) : ''}</div>`;
    el.querySelector('#bmNovoCli').onclick = () => dlgCliente(null);
    el.querySelector('#bmRecarregar').onclick = () => entrar(true);
    el.querySelector('#bmBackup').onclick = async () => { try { const b = await api('/bm/exportar', { blob: true }); baixar(b, 'BM_backup_' + hojeIso() + '.json'); } catch (e) { toast(e.message, false); } };
    el.querySelectorAll('[data-cli]').forEach(b => b.onclick = () => { S.curId = b.dataset.cli; render(); });
    el.querySelectorAll('[data-reativar]').forEach(a => a.onclick = async ev => { ev.preventDefault(); if (!confirm('Reativar este cliente?')) return; await api('/bm/cliente/arquivar', { method: 'POST', body: { id: a.dataset.reativar, ativo: true } }); entrar(true); });
    if (c) ligarCliente(c);
  }

  function cardPrazo(c) {
    const a = alerta(c, c.ref);
    const ant = c.ref ? somaMes(c.ref, -1) : null;
    const sAnt = ant ? situacao(c, ant) : null;
    const avisoAnt = sAnt && sAnt.fase >= 0 && sAnt.fase < 2 && (c.ufvs || []).length && emissoesDe(c).length ? `⚠ ${MLcurto(ant)} sem registro de envio` : '';
    return `<div class="bm-pz ${a.nivel} ${c.id === S.curId ? 'on' : ''}" data-cli="${esc(c.id)}">
      <div class="n">${esc(c.nome)}</div>
      <div class="c">BM ${ML(c.ref)} · ${(c.ufvs || []).length} usina(s) · NF ${a.nf ? fmtD(a.nf) : '—'}</div>
      <div class="t">${esc(a.txt)}</div>${avisoAnt ? `<div class="x">${esc(avisoAnt)}</div>` : ''}</div>`;
  }

  function telaCliente(c) {
    const tabs = [['usinas', 'Usinas'], ['custos', 'Custos e descontos'], ['monit', 'Monitoramento remoto'], ['historico', 'Histórico e envios'], ['config', 'Configurações']];
    return `<div class="bm-card">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="font-size:16px;font-weight:700;margin-right:6px">${esc(c.nome)}</div>
        <span class="bm-pill">${c.modo === 'multi' ? 'Multi-usina (1 BM)' : 'Um BM por usina'}</span>
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="mut" style="font-size:12px">Mês de referência</span>
          <button class="bm-btn sm" id="bmRefAnt">◂</button>
          <input type="month" id="bmRef" value="${esc(c.ref || '')}" style="background:var(--panel-alt);border:1px solid var(--border-strong);color:var(--text);border-radius:7px;padding:5px 8px">
          <button class="bm-btn sm" id="bmRefProx">▸</button>
          <button class="bm-btn pri" id="bmGerar">Gerar BM ▸</button>
        </div></div>
      <div class="bm-tabs">${tabs.map(([k, t]) => `<div class="bm-tab ${S.tab === k ? 'on' : ''}" data-tab="${k}">${t}</div>`).join('')}</div>
      <div id="bmTab">${S.tab === 'usinas' ? tabUsinas(c) : S.tab === 'custos' ? tabCustos(c) : S.tab === 'monit' ? tabMonit(c) : S.tab === 'historico' ? tabHistorico(c) : tabConfig(c)}</div></div>`;
  }

  function ligarCliente(c) {
    const el = root();
    el.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => { S.tab = t.dataset.tab; render(); });
    el.querySelector('#bmRef').onchange = e => trocarRef(c, e.target.value);
    el.querySelector('#bmRefAnt').onclick = () => trocarRef(c, somaMes(c.ref || hojeIso().slice(0, 7), -1));
    el.querySelector('#bmRefProx').onclick = () => trocarRef(c, somaMes(c.ref || hojeIso().slice(0, 7), 1));
    el.querySelector('#bmGerar').onclick = () => escolherUsinasEGerar(c);
    const T = el.querySelector('#bmTab');
    T.querySelectorAll('[data-acao]').forEach(b => b.onclick = ev => { ev.preventDefault(); acao(c, b.dataset.acao, b.dataset.arg, b); });
    if (S.tab === 'config') ligarConfig(c, T);
  }

  /* ─────────────── troca do mês de referência ─────────────── */
  async function trocarRef(c, novo) {
    if (!/^\d{4}-\d{2}$/.test(novo || '')) return render();
    const antigo = c.ref || novo, delta = mesIdx(novo) - mesIdx(antigo);
    if (!delta) return render();
    const sit = situacao(c, antigo);
    let msg = `Mudar o mês de referência para ${ML(novo)}?\n\nAs datas de medição e os períodos das ${(c.ufvs || []).length} usina(s) acompanham o mês. Custos e descontos ficam presos ao mês em que foram lançados.`;
    if (delta > 0 && sit.fase >= 0 && sit.fase < 2) msg += `\n\nAtenção: o BM de ${ML(antigo)} ainda não está registrado como enviado.`;
    const prorata = (c.ufvs || []).filter(u => u.dm && u.dias && u.dias < u.dm);
    if (!confirm(msg)) return render();
    let reset = false;
    if (prorata.length) reset = confirm(`Estas usinas estão com pro rata (${prorata.map(u => `${u.nome}: ${u.dias}/${u.dm} dias`).join('; ')}).\n\nOK = voltar para o mês cheio (mensalidade = valor do contrato).\nCancelar = manter o pro rata.`);
    const novaMob = mob => { if (!mob) return mob; const [y, m, d] = mob.split('-').map(Number); const t = y * 12 + (m - 1) + delta, ny = Math.floor(t / 12), nm = t % 12; return ny + '-' + String(nm + 1).padStart(2, '0') + '-' + String(Math.min(d, new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate())).padStart(2, '0'); };
    const c2 = JSON.parse(JSON.stringify(c));
    c2.ref = novo;
    (c2.ufvs || []).forEach(u => { u.mob = novaMob(u.mob); if (reset && u.dm && u.dias < u.dm) { u.dias = 30; u.dm = 30; u.men = u.valor; } });
    try { await salvarCliente(c2); toast('Mês de referência: ' + ML(novo) + '.'); } catch (e) { toast(e.message, false); }
    render();
  }

  /* ─────────────── abas ─────────────── */
  function tabUsinas(c) {
    const comp = c.ref, ls = lancsDe(c, comp).map(l => lancComTotais(c, l)).filter(x => !x.cond);
    const porU = n => ls.filter(x => x.ufv === n);
    const tot = { men: 0, c: 0, d: 0 };
    const a = alerta(c, comp);
    const rows = (c.ufvs || []).map((u, i) => {
      const cs = porU(u.nome), sc = cs.filter(x => x.tipo !== 'desconto').reduce((s, x) => s + x.total, 0), sd = cs.filter(x => x.tipo === 'desconto').reduce((s, x) => s + x.total, 0);
      const pl = parcialDe(c, comp, u.nome), uu = aplicarParcial({ ...u }, pl);
      const men = uu.men != null ? uu.men : uu.valor; tot.men += +men || 0; tot.c += sc; tot.d += sd;
      const f = a.porUsina ? a.porUsina[u.nome] : 0;
      return `<tr><td>${esc(u.nome)}</td><td>${esc(u.uf)}</td><td class="num">${(+u.mwp || 0).toFixed(3)}</td><td>${dt(u.mob)}</td>
        <td class="mut">${esc(periodoCli(c, u) || '—')}${u.periodoCustom ? ' <span class="bm-pill">próprio</span>' : ''}</td>
        <td class="num">${F(u.valor)}</td><td class="num"><b>${F(men)}</b>${pl ? `<div style="font-size:10.5px;color:var(--amber)">parcial: ${esc(descParcial(uu.parcial))}</div>` : u.dm && u.dias < u.dm ? `<div class="mut" style="font-size:10.5px">${u.dias}/${u.dm} dias (cadastro)</div>` : ''}</td>
        <td class="num">${sc ? F(sc) : '—'}</td><td class="num" style="color:var(--red)">${sd ? F(sd) : '—'}</td><td class="num"><b>${F((+men || 0) + sc + sd)}</b></td>
        <td><span class="bm-pill s${f || 0}">${FASE_TXT[f || 0]}</span></td>
        <td class="num"><button class="bm-btn sm" data-acao="parcial" data-arg="${i}">${pl ? 'Parcial ✎' : 'Parcial'}</button> <button class="bm-btn sm" data-acao="usina" data-arg="${i}">Editar</button> <button class="bm-btn sm ghost" data-acao="usinaDel" data-arg="${i}">Excluir</button></td></tr>`;
    }).join('');
    return `<div class="bm-note">${esc(hintPeriodo(c.diaIni ?? 26, c.diaFim ?? 25, c.offsetIniMeses ?? -1, c.offsetFimMeses ?? 0))} NF: ${esc(descNf(c.nf))}${a.nf ? ' → <b>' + fmtD(a.nf) + '</b>' : ''}. Envio do BM: ${esc(descEnvio(c.envio))}${a.env ? ' → <b>' + fmtD(a.env) + '</b>' : ''}.</div>
      <div style="display:flex;justify-content:flex-end;margin:6px 0"><button class="bm-btn" data-acao="usina">+ Usina</button></div>
      ${(c.ufvs || []).length ? `<div style="overflow-x:auto"><table class="bm-t"><thead><tr><th>UFV</th><th>UF</th><th class="num">MWp</th><th>Data da medição</th><th>Período</th><th class="num">Contrato</th><th class="num">Mensalidade</th><th class="num">Custos</th><th class="num">Descontos</th><th class="num">Total</th><th>Status ${MLcurto(comp)}</th><th></th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr style="font-weight:700"><td colspan="6">Total — ${(c.ufvs || []).length} usina(s)</td><td class="num">${F(tot.men)}</td><td class="num">${F(tot.c)}</td><td class="num" style="color:var(--red)">${tot.d ? F(tot.d) : '—'}</td><td class="num">${F(tot.men + tot.c + tot.d)}</td><td colspan="2"></td></tr></tfoot></table></div>` : '<div class="bm-note">Cadastre a primeira usina deste cliente.</div>'}`;
  }

  function tabCustos(c) {
    const comp = c.ref;
    const todos = lancsDe(c, comp).map(l => lancComTotais(c, l));
    const outros = lancsDe(c).filter(l => l.competencia !== comp);
    const futuros = outros.filter(l => l.competencia > comp), passados = outros.filter(l => l.competencia < comp);
    const linha = x => {
      const ax = anexosDe(x.id);
      return `<tr><td>${esc(x.ufv)}</td><td>${esc(x.cat)}</td><td style="max-width:340px">${esc(x.desc)}${x.clausula ? `<div class="mut" style="font-size:11px">${esc(x.clausula)}</div>` : ''}${ax.length ? `<div style="font-size:11px">📎 ${ax.map(a => `<a href="#" data-acao="anexo" data-arg="${esc(a.id)}" style="color:var(--teal)">${esc(a.nome)}</a>`).join(', ')}</div>` : ''}</td>
      <td>${dt(x.data)}</td><td style="white-space:nowrap">${x.os || x.nf ? `${x.os ? 'OS ' + esc(x.os) : ''}${x.os && x.nf ? '<br>' : ''}${x.nf ? 'NF ' + esc(x.nf) : ''}` : '<span class="mut">—</span>'}</td><td class="num">${F(x.unit)}</td><td class="num">${pctDe(x) ? esc((x.rotuloAcr || 'Encargos') + ' ' + pctDe(x) + '%') : '—'}</td>
      <td class="num" style="${x.total < 0 ? 'color:var(--red)' : ''}"><b>${F(x.total)}</b></td>
      <td class="num"><button class="bm-btn sm" data-acao="lanc" data-arg="${esc(x.id)}">Editar</button> <button class="bm-btn sm ghost" data-acao="lancDel" data-arg="${esc(x.id)}">Excluir</button></td></tr>`;
    };
    const tab = (arr, vazio) => arr.length ? `<div style="overflow-x:auto"><table class="bm-t"><thead><tr><th>UFV</th><th>Categoria / motivo</th><th>Descrição</th><th>Data</th><th>OS / NF</th><th class="num">Valor base</th><th class="num">Acréscimo</th><th class="num">Total</th><th></th></tr></thead><tbody>${arr.map(linha).join('')}
      <tr style="font-weight:700"><td colspan="7">Total</td><td class="num">${F(arr.reduce((s, x) => s + x.total, 0))}</td><td></td></tr></tbody></table></div>` : `<div class="mut" style="padding:8px 0">${vazio}</div>`;
    const resumoOutros = arr => { const g = {}; arr.forEach(l => (g[l.competencia] = g[l.competencia] || []).push(l)); return Object.keys(g).sort().map(k => `<a href="#" data-acao="irRef" data-arg="${k}" style="color:var(--teal)">${MLcurto(k)} (${g[k].length})</a>`).join(' · '); };
    return `<div class="bm-note">Custos e descontos de <b>${ML(comp)}</b>. Cada lançamento fica preso ao mês em que foi lançado: não entra sozinho no BM do mês seguinte.${futuros.length ? ' Lançados para meses futuros: ' + resumoOutros(futuros) + '.' : ''}${passados.length ? ' Meses anteriores: ' + resumoOutros(passados) + '.' : ''}</div>
      <div style="display:flex;justify-content:flex-end;gap:6px;margin:6px 0"><button class="bm-btn" data-acao="lanc" data-arg="" ${(c.ufvs || []).length ? '' : 'disabled'}>+ Custo adicional</button><button class="bm-btn" data-acao="desc" ${(c.ufvs || []).length ? '' : 'disabled'}>+ Desconto</button></div>
      <h3 style="margin-top:6px">Custos adicionais</h3>${tab(todos.filter(x => x.tipo !== 'desconto' && !x.cond), 'Nenhum custo adicional neste mês.')}
      <h3 style="margin-top:14px">Descontos</h3>${tab(todos.filter(x => x.tipo === 'desconto' && !x.cond), 'Nenhum desconto neste mês.')}
      <h3 style="margin-top:14px">Sujeito a aprovação (fora do total)</h3>${tab(todos.filter(x => x.cond), 'Nada aguardando aprovação neste mês.')}`;
  }

  function tabMonit(c) {
    const rows = (c.cos || []).map((m, i) => `<tr><td>${esc(m.nome)}</td><td>${esc(m.status)}</td><td class="num">${F(m.v)}</td><td class="num"><button class="bm-btn sm" data-acao="mon" data-arg="${i}">Editar</button> <button class="bm-btn sm ghost" data-acao="monDel" data-arg="${i}">Excluir</button></td></tr>`).join('');
    return `<div class="bm-note">Usinas fora do escopo Full O&amp;M cobradas por monitoramento remoto. Entram no BM só no modelo multi-usina.</div>
      <div style="display:flex;justify-content:flex-end;margin:6px 0"><button class="bm-btn" data-acao="mon">+ Usina</button></div>
      ${rows ? `<table class="bm-t"><thead><tr><th>UFV</th><th>Modalidade</th><th class="num">Mensalidade</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="mut">Nenhuma usina em monitoramento remoto.</div>'}`;
  }

  function tabHistorico(c) {
    const ems = emissoesDe(c).slice().sort((a, b) => (b.competencia + String(b.revisao).padStart(3, '0') + (b.criado || '')).localeCompare(a.competencia + String(a.revisao).padStart(3, '0') + (a.criado || '')));
    const pdfs = e => S.anexos.filter(a => a.dono === e.id && a.tipo === 'pdf_emissao');
    const rows = ems.map(e => {
      const f = FASE[e.status] || 0, rev = 'R' + String(e.revisao || 0).padStart(2, '0');
      return `<tr><td><b>${ML(e.competencia)}</b><div class="mut" style="font-size:11px">${rev}${e.origem === 'historico' ? ' · registro do Outlook' : ''}</div></td>
        <td style="max-width:260px;font-size:12px">${esc(e.usinas.join(', '))}</td><td class="num">${e.total != null ? F(e.total) : '—'}</td>
        <td><span class="bm-pill ${e.status === 'cancelado' ? 'sx' : 's' + f}">${e.status === 'cancelado' ? 'Cancelado' : FASE_TXT[f]}</span></td>
        <td style="font-size:11.5px;white-space:nowrap">${e.criado && e.origem !== 'historico' ? 'Gerado ' + dtHora(e.criado) + '<br>' : ''}${e.enviadoEm ? 'Enviado ' + dtHora(e.enviadoEm) + '<br>' : ''}${e.aprovadoEm ? 'Aprovado ' + dtHora(e.aprovadoEm) + '<br>' : ''}${e.nfEm ? 'NF ' + dtHora(e.nfEm) + (e.info && e.info.nfNumero ? ' nº ' + esc(e.info.nfNumero) : '') : ''}${e.info && e.info.obs ? `<div class="mut">${esc(e.info.obs)}</div>` : ''}</td>
        <td class="num" style="white-space:normal">
          ${e.origem !== 'historico' ? `<button class="bm-btn sm" data-acao="emAbrir" data-arg="${e.id}">Abrir</button>` : ''}
          ${pdfs(e).map(a => `<button class="bm-btn sm" data-acao="anexo" data-arg="${a.id}" title="${esc(a.nome)}">PDF${pdfs(e).length > 1 ? ' ' + esc((a.rotulo || '').replace(/^UFV\s+/i, '')) : ''}</button>`).join(' ')}
          ${e.status !== 'cancelado' ? `<button class="bm-btn sm" data-acao="emStatus" data-arg="${e.id}">Status…</button>` : ''}</td></tr>`;
    }).join('');
    return `<div class="bm-note">Cada BM gerado fica congelado aqui (dados + PDF). Mudou algo depois de enviado? Gere de novo: abre a revisão seguinte (R01, R02…) e a anterior continua guardada.</div>
      <div style="display:flex;justify-content:flex-end;margin:6px 0"><button class="bm-btn" data-acao="emManual">+ Registrar envio feito fora do Omni</button></div>
      ${rows ? `<div style="overflow-x:auto"><table class="bm-t"><thead><tr><th>Competência</th><th>Usinas</th><th class="num">Total</th><th>Status</th><th>Datas</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="mut">Nenhum BM registrado ainda.</div>'}`;
  }

  function tabConfig(c) {
    const em = c.email || {}, nf = c.nf || {}, ev = c.envio || {};
    return `<div class="bm-grid">
      <div class="bm-sec">Cliente</div>
      <div class="bm-f"><label>Nome</label><input id="cfNome" value="${esc(c.nome)}"></div>
      <div class="bm-f"><label>Modelo do boletim</label><select id="cfModo">${opts([['single', 'Um BM por usina'], ['multi', 'Multi-usina (um BM com todas)']], c.modo || 'single')}</select></div>
      <div class="bm-f"><label>Card de prazos (Compromissos)</label><input id="cfComp" value="${esc(c.compromissoCliente || '')}" placeholder="Ex.: Renogrid, 2C Energia"></div>
      <div class="bm-sec">Período de medição (padrão do cliente)</div>
      <div class="bm-f"><label>Início — mês</label><select id="cfOffI">${offOpts(c.offsetIniMeses ?? -1)}</select></div>
      <div class="bm-f"><label>Início — dia</label><select id="cfDiaI">${diasOpts(c.diaIni ?? 26)}</select></div>
      <div class="bm-f"><label>Fim — mês</label><select id="cfOffF">${offOpts(c.offsetFimMeses ?? 0)}</select></div>
      <div class="bm-f"><label>Fim — dia</label><select id="cfDiaF">${diasOpts(c.diaFim ?? 25)}</select></div>
      <div class="bm-sec">Prazos (mês de referência do BM)</div>
      <div class="bm-f"><label>Emissão da NF</label><select id="cfNfTipo">${opts([['', 'Não definido'], ['dia_fixo', 'Dia fixo do mês'], ['dia_util', 'N-ésimo dia útil'], ['ultimo_dia_util', 'Último dia útil do mês']], nf.tipo || '')}</select></div>
      <div class="bm-f"><label>Dia / N</label><input id="cfNfVal" type="number" min="1" max="31" value="${esc(nf.valor || '')}"></div>
      <div class="bm-f chk"><input type="checkbox" id="cfNfAj" ${nf.ajusteDiaUtil ? 'checked' : ''}><label for="cfNfAj">Dia fixo: empurrar p/ próximo dia útil</label></div>
      <div class="bm-f"><label>Envio do BM ao cliente</label><select id="cfEvTipo">${opts([['', 'Não definido'], ['dia_fixo', 'Até um dia fixo do mês'], ['dia_util', 'N-ésimo dia útil do mês'], ['antes_nf', 'N dias corridos antes da NF'], ['ultimo_dia_mes_anterior', 'Último dia útil do mês anterior']], ev.tipo || '')}</select></div>
      <div class="bm-f"><label>Dia / N</label><input id="cfEvVal" type="number" min="1" max="31" value="${esc(ev.valor || '')}"></div>
      <div class="bm-f chk"><input type="checkbox" id="cfEvAj" ${ev.ajusteDiaUtil ? 'checked' : ''}><label for="cfEvAj">Dia fixo: antecipar se não for útil</label></div>
      <div class="bm-f w"><label>Base contratual dos prazos (para consulta)</label><input id="cfBase" value="${esc(c.basePrazos || '')}"></div>
      <div class="bm-sec">Custos adicionais</div>
      <div class="bm-f"><label>Acréscimo padrão (%)</label><input id="cfPct" type="number" step="0.01" value="${esc(c.pctPadrao ?? 20)}"></div>
      <div class="bm-f"><label>Rótulo do acréscimo</label><input id="cfRot" value="${esc(c.rotuloAcrPadrao || 'Encargos')}"></div>
      <div class="bm-f chk w"><input type="checkbox" id="cfUni" ${c.custoValorUnico ? 'checked' : ''}><label for="cfUni">No boletim, mostrar cada custo adicional num valor só (sem abrir valor base, encargos e BDI)</label></div>
      <div class="bm-f"><label>Reajuste (%) — monitoramento</label><input id="cfReaj" type="number" step="0.01" value="${c.reaj && c.reaj.pct ? r2(c.reaj.pct * 100) : ''}"></div>
      <div class="bm-f w"><label>Descrição do reajuste</label><input id="cfReajD" value="${esc((c.reaj && c.reaj.desc) || '')}"></div>
      <div class="bm-f w"><label>Rodapé do boletim</label><textarea id="cfRodape">${esc(c.rodape || RODAPE_PADRAO)}</textarea></div>
      <div class="bm-sec">E-mail de envio</div>
      <div class="bm-f w"><label>Assunto — use {CLIENTE} {MES_PERIODO} {MES_REF} {MES_REF_CURTO} {UFVS} {REV}</label><input id="cfAss" value="${esc(em.assunto || '[{CLIENTE}] Boletins de Medição - {MES_PERIODO}{REV}')}"></div>
      <div class="bm-f"><label>Saudação para (nome)</label><input id="cfCont" value="${esc(em.contato || '')}"></div>
      <div class="bm-f"><label>Mês citado no texto</label><select id="cfRotMes">${opts([['periodo', 'Mês do período ("referentes ao mês de outubro")'], ['referencia', 'Mês de referência ("de referência novembro")']], em.rotuloMes || 'periodo')}</select></div>
      <div class="bm-f w"><label>Para (opcional — só para copiar)</label><input id="cfPara" value="${esc(em.para || '')}"></div>
      <div class="bm-f w"><label>Cc (opcional — só para copiar)</label><textarea id="cfCc">${esc(em.cc || '')}</textarea></div>
      <div class="bm-f w"><label>Frase de fechamento (vazio = padrão)</label><input id="cfFecho" value="${esc(em.fechamento || '')}"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="bm-btn pri" id="cfSalvar">Salvar configurações</button><button class="bm-btn ghost" id="cfArquivar">Arquivar cliente</button></div>`;
  }

  function ligarConfig(c, T) {
    T.querySelector('#cfSalvar').onclick = async () => {
      const v = id => T.querySelector('#' + id).value, ck = id => T.querySelector('#' + id).checked;
      const c2 = JSON.parse(JSON.stringify(c));
      Object.assign(c2, {
        nome: v('cfNome').trim() || c.nome, modo: v('cfModo'), compromissoCliente: v('cfComp').trim(),
        offsetIniMeses: +v('cfOffI'), diaIni: +v('cfDiaI'), offsetFimMeses: +v('cfOffF'), diaFim: +v('cfDiaF'),
        nf: { tipo: v('cfNfTipo'), valor: +v('cfNfVal') || null, ajusteDiaUtil: ck('cfNfAj') },
        envio: { tipo: v('cfEvTipo'), valor: +v('cfEvVal') || null, ajusteDiaUtil: ck('cfEvAj') },
        basePrazos: v('cfBase').trim(), pctPadrao: v('cfPct') === '' ? 0 : +v('cfPct'), rotuloAcrPadrao: v('cfRot').trim() || 'Encargos', custoValorUnico: ck('cfUni'),
        reaj: v('cfReaj') ? { pct: (+v('cfReaj')) / 100, desc: v('cfReajD').trim() } : null,
        rodape: v('cfRodape').trim(),
        email: { assunto: v('cfAss').trim(), contato: v('cfCont').trim(), rotuloMes: v('cfRotMes'), para: v('cfPara').trim(), cc: v('cfCc').trim(), fechamento: v('cfFecho').trim() }
      });
      try { await salvarCliente(c2); toast('Configurações salvas.'); render(); } catch (e) { toast(e.message, false); }
    };
    T.querySelector('#cfArquivar').onclick = async () => {
      if (!confirm(`Arquivar ${c.nome}? Some dos prazos, mas o histórico fica guardado e dá para reativar.`)) return;
      await api('/bm/cliente/arquivar', { method: 'POST', body: { id: c.id, ativo: false } }); S.curId = null; entrar(true);
    };
  }

  /* ─────────────── ações ─────────────── */
  async function acao(c, a, arg) {
    try {
      if (a === 'usina') return dlgUsina(c, arg === undefined || arg === '' ? null : +arg);
      if (a === 'parcial') return dlgParcial(c, c.ufvs[+arg]);
      if (a === 'usinaDel') { const u = c.ufvs[+arg]; if (!confirm(`Excluir ${u.nome} do cadastro? (BMs já emitidos continuam no histórico)`)) return; const c2 = JSON.parse(JSON.stringify(c)); c2.ufvs.splice(+arg, 1); await salvarCliente(c2); return render(); }
      if (a === 'lanc') return dlgLanc(c, arg ? S.lancamentos.find(l => l.id === arg) : null, null);
      if (a === 'desc') return dlgLanc(c, null, 'desconto');
      if (a === 'lancDel') { if (!confirm('Excluir este lançamento?')) return; await api('/bm/lancamento/excluir', { method: 'POST', body: { id: arg } }); S.lancamentos = S.lancamentos.filter(l => l.id !== arg); toast('Excluído.'); return render(); }
      if (a === 'anexo') { const an = S.anexos.find(x => x.id === arg); const b = await api('/bm/arquivo/' + arg, { blob: true }); const url = URL.createObjectURL(b); if (/pdf|image/.test(an && an.mime || '')) window.open(url, '_blank'); else baixar(b, an ? an.nome : 'arquivo'); return; }
      if (a === 'irRef') return trocarRef(c, arg);
      if (a === 'mon') return dlgMon(c, arg === undefined || arg === '' ? null : +arg);
      if (a === 'monDel') { if (!confirm('Excluir do monitoramento remoto?')) return; const c2 = JSON.parse(JSON.stringify(c)); c2.cos.splice(+arg, 1); await salvarCliente(c2); return render(); }
      if (a === 'emAbrir') { const j = await api('/bm/emissao/' + arg); return abrirOverlay(c, j.emissao.snapshot, j.emissao); }
      if (a === 'emStatus') return dlgStatus(c, S.emissoes.find(e => e.id === arg));
      if (a === 'emManual') return dlgManual(c);
    } catch (e) { toast(e.message, false); }
  }

  function dlgCliente() {
    const ov = modal('Novo cliente', `<div class="bm-grid"><div class="bm-f w"><label>Nome</label><input id="ncNome" placeholder="Ex.: Faro Energy"></div>
      <div class="bm-f"><label>Modelo</label><select id="ncModo">${opts([['single', 'Um BM por usina'], ['multi', 'Multi-usina']], 'single')}</select></div>
      <div class="bm-f"><label>Mês de referência</label><input id="ncRef" type="month" value="${hojeIso().slice(0, 7)}"></div></div>
      <div class="bm-note">Depois de salvar, ajuste período, prazos e e-mail na aba Configurações.</div>`,
      [{ t: 'Cancelar', cls: 'ghost' }, { t: 'Salvar', cls: 'pri', fn: async ov => {
        const nome = val(ov, 'ncNome').trim(); if (!nome) { toast('Informe o nome.', false); return false; }
        const n = await salvarCliente({ id: 'c' + uid(), nome, modo: val(ov, 'ncModo'), ref: val(ov, 'ncRef'), diaIni: 1, diaFim: 0, offsetIniMeses: -1, offsetFimMeses: -1, ufvs: [], cos: [], pctPadrao: 20, rotuloAcrPadrao: 'Encargos', rodape: RODAPE_PADRAO, email: { assunto: '[{CLIENTE}] Boletins de Medição - {MES_PERIODO}{REV}', rotuloMes: 'periodo' } });
        S.curId = n.id; S.tab = 'config'; render();
      } }]);
    ov.querySelector('#ncNome').focus();
  }

  function dlgUsina(c, idx) {
    const u = idx != null ? c.ufvs[idx] : { mob: (c.ufvs && c.ufvs[0] && c.ufvs[0].mob) || '' };
    const pr = u.dias && u.dm && u.dias < u.dm;
    modal(idx != null ? 'Editar usina' : 'Nova usina', `<div class="bm-grid">
      <div class="bm-f w"><label>Nome da UFV</label><input id="uNome" value="${esc(u.nome || '')}"></div>
      <div class="bm-f"><label>UF</label><input id="uUf" value="${esc(u.uf || '')}"></div>
      <div class="bm-f"><label>MWp</label><input id="uMwp" type="number" step="0.001" value="${esc(u.mwp || '')}"></div>
      <div class="bm-f"><label>Data da medição</label><input id="uMob" type="date" value="${esc(u.mob || '')}"></div>
      <div class="bm-f"><label>Valor do contrato (mensal)</label><input id="uVal" type="number" step="0.01" value="${esc(u.valor || '')}"></div>
      <div class="bm-f"><label>Dias faturados (pro rata)</label><input id="uDias" type="number" min="1" value="${pr ? u.dias : ''}" placeholder="vazio = mês cheio"></div>
      <div class="bm-f"><label>Dias do mês (base)</label><input id="uDm" type="number" min="28" max="31" value="${pr ? u.dm : ''}"></div>
      <div class="bm-f"><label>CNPJ</label><input id="uCnpj" value="${esc(u.cnpj || '')}"></div>
      <div class="bm-f w"><label>Razão social / SPE</label><input id="uSpe" value="${esc(u.spe || '')}"></div>
      <div class="bm-f chk w"><input type="checkbox" id="uCustom" ${u.periodoCustom ? 'checked' : ''}><label for="uCustom">Período de medição próprio (diferente do padrão do cliente)</label></div>
      <div class="bm-f"><label>Início — mês</label><select id="uOffI">${offOpts(u.offsetIniMeses ?? c.offsetIniMeses ?? -1)}</select></div>
      <div class="bm-f"><label>Início — dia</label><select id="uDiaI">${diasOpts(u.diaIni ?? c.diaIni ?? 26)}</select></div>
      <div class="bm-f"><label>Fim — mês</label><select id="uOffF">${offOpts(u.offsetFimMeses ?? c.offsetFimMeses ?? 0)}</select></div>
      <div class="bm-f"><label>Fim — dia</label><select id="uDiaF">${diasOpts(u.diaFim ?? c.diaFim ?? 25)}</select></div></div>`,
      [{ t: 'Cancelar', cls: 'ghost' }, { t: 'Salvar', cls: 'pri', fn: async ov => {
        const nome = val(ov, 'uNome').trim(); if (!nome) { toast('Informe o nome da UFV.', false); return false; }
        const valor = +val(ov, 'uVal') || 0, dias = +val(ov, 'uDias') || 0, dm = +val(ov, 'uDm') || 0, prr = dias > 0 && dm > 0 && dias < dm, cu = val(ov, 'uCustom');
        const novo = { ...u, nome, uf: val(ov, 'uUf').trim(), mwp: +val(ov, 'uMwp') || 0, mob: val(ov, 'uMob'), valor, men: prr ? r2(valor * dias / dm) : valor, dias: prr ? dias : 30, dm: prr ? dm : 30, res: 0, int: 0,
          cnpj: val(ov, 'uCnpj').trim(), spe: val(ov, 'uSpe').trim(), periodoCustom: cu,
          diaIni: cu ? +val(ov, 'uDiaI') : null, diaFim: cu ? +val(ov, 'uDiaF') : null, offsetIniMeses: cu ? +val(ov, 'uOffI') : null, offsetFimMeses: cu ? +val(ov, 'uOffF') : null };
        if (idx == null && (c.ufvs || []).some(x => x.nome === nome)) { toast('Já existe usina com esse nome.', false); return false; }
        const c2 = JSON.parse(JSON.stringify(c)); c2.ufvs = c2.ufvs || [];
        if (idx != null) {
          const antigo = c2.ufvs[idx].nome; c2.ufvs[idx] = novo;
          if (antigo !== nome) for (const l of lancsTodos(c).filter(l => l.ufv === antigo)) { await api('/bm/lancamento', { method: 'POST', body: { lancamento: { ...l, ufv: nome } } }); l.ufv = nome; }
        } else { novo._id = uid(); c2.ufvs.push(novo); }
        await salvarCliente(c2); toast('Usina salva.'); render();
      } }]);
  }

  function dlgParcial(c, u) {
    const comp = c.ref, ex = parcialDe(c, comp, u.nome) || {};
    const per = periodoCli(c, u) || '';
    const m = /(\d{2})\/(\d{2})\/(\d{4}) a (\d{2})\/(\d{2})\/(\d{4})/.exec(per);
    const pIni = m ? `${m[3]}-${m[2]}-${m[1]}` : '', pFim = m ? `${m[6]}-${m[5]}-${m[4]}` : '';
    const diasPer = m ? Math.round((Date.UTC(+m[6], +m[5] - 1, +m[4]) - Date.UTC(+m[3], +m[2] - 1, +m[1])) / 86400000) + 1 : 30;
    const ov = modal(`Faturamento parcial — ${u.nome} — ${ML(comp)}`, `<div class="bm-note">Vale só para o BM de <b>${ML(comp)}</b>; o cadastro da usina não muda. Período normal: ${esc(per || '—')}. Valor mensal: ${F(u.valor)}.</div><div class="bm-grid">
      <div class="bm-f"><label>Como calcular</label><select id="pTipo">${opts([['dias', 'Dias faturados (pro rata)'], ['percentual', 'Percentual da mensalidade'], ['valor', 'Valor acordado']], ex.pTipo || 'dias')}</select></div>
      <div class="bm-f"><label>Motivo</label><select id="pMot">${opts([...MOTIVOS_PARCIAL, ...(ex.cat && !MOTIVOS_PARCIAL.includes(ex.cat) ? [ex.cat] : [])].map(t => [t, t]), ex.cat || MOTIVOS_PARCIAL[0])}</select></div>
      <div class="bm-f pd"><label>Faturar de</label><input id="pIni" type="date" value="${esc(ex.ini || pIni)}"></div>
      <div class="bm-f pd"><label>até</label><input id="pFim" type="date" value="${esc(ex.fim || pFim)}"></div>
      <div class="bm-f pd"><label>Dias faturados</label><input id="pDias" type="number" min="0" value="${esc(ex.dias ?? diasPer)}"></div>
      <div class="bm-f pd"><label>Dias do período (base)</label><input id="pDm" type="number" min="1" value="${esc(ex.dm ?? diasPer)}"></div>
      <div class="bm-f pp"><label>Percentual (%)</label><input id="pPct" type="number" step="0.01" min="0" value="${esc(ex.pct ?? 100)}"></div>
      <div class="bm-f pv"><label>Valor a faturar</label><input id="pVal" type="number" step="0.01" min="0" value="${esc(ex.valorFixo ?? '')}"></div>
      <div class="bm-f w"><label>Descrição (sai no BM e no e-mail)</label><input id="pDesc" value="${esc(ex.desc || '')}" placeholder="Ex.: início das atividades em 16/11/2026"></div>
      <div class="bm-f w"><label>Mensalidade deste mês</label><div id="pTot" style="font-weight:700;font-size:15px"></div></div></div>`,
      [...(ex.id ? [{ t: 'Remover parcial', cls: 'ghost', fn: async () => { await api('/bm/lancamento/excluir', { method: 'POST', body: { id: ex.id } }); S.lancamentos = S.lancamentos.filter(l => l.id !== ex.id); toast('Parcial removido: volta o mês cheio.'); render(); } }] : []),
       { t: 'Cancelar', cls: 'ghost' }, { t: 'Salvar', cls: 'pri', fn: async ov => {
        const tipo = val(ov, 'pTipo');
        const doc = { id: ex.id, clienteId: c.id, competencia: comp, tipo: 'parcial', ufv: u.nome, pTipo: tipo, cat: val(ov, 'pMot'), desc: val(ov, 'pDesc').trim(),
          dias: tipo === 'dias' ? +val(ov, 'pDias') || 0 : null, dm: tipo === 'dias' ? +val(ov, 'pDm') || 30 : null, ini: tipo === 'dias' ? val(ov, 'pIni') : '', fim: tipo === 'dias' ? val(ov, 'pFim') : '',
          pct: tipo === 'percentual' ? +val(ov, 'pPct') || 0 : null, valorFixo: tipo === 'valor' ? +val(ov, 'pVal') || 0 : null };
        if (tipo === 'dias' && (!doc.dias || doc.dias > doc.dm)) { toast('Dias faturados inválidos.', false); return false; }
        const j = await api('/bm/lancamento', { method: 'POST', body: { lancamento: doc } });
        doc.id = j.id; S.lancamentos = S.lancamentos.filter(l => l.id !== j.id).concat([doc]);
        toast(j.aviso || 'Faturamento parcial salvo.', !j.aviso); render();
      } }]);
    const atual = () => {
      const t = val(ov, 'pTipo');
      ov.querySelectorAll('.pd').forEach(e => e.style.display = t === 'dias' ? '' : 'none');
      ov.querySelectorAll('.pp').forEach(e => e.style.display = t === 'percentual' ? '' : 'none');
      ov.querySelectorAll('.pv').forEach(e => e.style.display = t === 'valor' ? '' : 'none');
      const x = aplicarParcial({ ...u }, { pTipo: t, dias: val(ov, 'pDias'), dm: val(ov, 'pDm'), pct: val(ov, 'pPct'), valorFixo: val(ov, 'pVal') });
      ov.querySelector('#pTot').textContent = F(x.men);
    };
    const recDias = () => { const a = val(ov, 'pIni'), b = val(ov, 'pFim'); if (a && b && b >= a) { ov.querySelector('#pDias').value = Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1; } atual(); };
    ['pTipo', 'pDias', 'pDm', 'pPct', 'pVal'].forEach(id => ov.querySelector('#' + id).addEventListener('input', atual));
    ['pIni', 'pFim'].forEach(id => ov.querySelector('#' + id).addEventListener('input', recDias));
    atual();
  }

  const CATS_CUSTO = ['Materiais e Insumos', 'Hora Extra', 'Horas extras (HH)', 'Religamento', 'Deslocamento/Viagem', 'Serviço de terceiro', 'Infraestrutura AWS', 'Outro'];
  const CATS_DESC = ['Custo da Grid pago pelo cliente (reembolso)', 'Descumprimento de obrigação contratual', 'Descumprimento de SLA / disponibilidade', 'Atraso na execução ou entrega', 'Indisponibilidade de usina / equipamento', 'Falha de monitoramento', 'Glosa de serviço', 'Abatimento comercial', 'Outro'];

  function dlgLanc(c, l, tipoNovo) {
    const ehDesc = l ? l.tipo === 'desconto' : tipoNovo === 'desconto';
    const x = l || { competencia: c.ref, ufv: (c.ufvs[0] || {}).nome, cat: ehDesc ? CATS_DESC[0] : CATS_CUSTO[0], pct: ehDesc ? 0 : (c.pctPadrao ?? 20), rotuloAcr: c.rotuloAcrPadrao || 'Encargos' };
    const cats = ehDesc ? CATS_DESC : CATS_CUSTO;
    const ax = l ? anexosDe(l.id) : [];
    const ov = modal(ehDesc ? (l ? 'Editar desconto' : 'Novo desconto') : (l ? 'Editar custo adicional' : 'Novo custo adicional'), `<div class="bm-grid">
      <div class="bm-f"><label>Usina</label><select id="lUfv">${opts((c.ufvs || []).map(u => [u.nome, u.nome]), x.ufv)}</select></div>
      <div class="bm-f"><label>Entra no BM de</label><input id="lComp" type="month" value="${esc(x.competencia || c.ref)}"></div>
      <div class="bm-f"><label>${ehDesc ? 'Motivo' : 'Categoria'}</label><select id="lCat">${opts([...cats, ...(x.cat && !cats.includes(x.cat) ? [x.cat] : [])].map(t => [t, t]), x.cat)}</select></div>
      <div class="bm-f"><label>Data</label><input id="lData" type="date" value="${esc(x.data || '')}"></div>
      <div class="bm-f w"><label>${ehDesc ? 'A que se refere' : 'Descrição'} (sai no BM e no e-mail)</label><input id="lDesc" value="${esc(x.desc || '')}"></div>
      ${ehDesc ? `<div class="bm-f w"><label>Cláusula / obrigação (opcional)</label><input id="lClaus" value="${esc(x.clausula || '')}"></div>
      <div class="bm-note w" style="grid-column:1/-1">Cliente pagou algo que era custo da Grid (peça, serviço, deslocamento)? Use o motivo <b>Custo da Grid pago pelo cliente (reembolso)</b>, informe o valor que ele pagou e anexe a NF ou o comprovante dele. O valor sai como desconto no total do BM.</div>` : ''}
      <div class="bm-f"><label>${ehDesc ? 'Valor do desconto (positivo)' : 'Valor base (custo bruto)'}</label><input id="lUnit" type="number" step="0.01" min="0" value="${x.unit != null && x.unit !== '' ? Math.abs(x.unit) : ''}"></div>
      <div class="bm-f"><label>Acréscimo (%)</label><input id="lPct" type="number" step="0.01" min="0" value="${esc(pctDe(x))}"></div>
      <div class="bm-f"><label>Rótulo do acréscimo</label><select id="lRot">${opts([['Encargos', 'Encargos'], ['BDI', 'BDI'], ['Impostos', 'Impostos']], x.rotuloAcr || c.rotuloAcrPadrao || 'Encargos')}</select></div>
      <div class="bm-f"><label>${ehDesc ? 'OS / chamado' : 'OS'}</label><input id="lOs" value="${esc(x.os || '')}"></div>
      ${ehDesc ? '' : `<div class="bm-f"><label>NF do fornecedor</label><input id="lNf" value="${esc(x.nf || '')}"></div>`}
      <div class="bm-f chk w"><input type="checkbox" id="lCond" ${x.cond ? 'checked' : ''}><label for="lCond">Sujeito a aprovação do cliente (fica fora do total)</label></div>
      <div class="bm-f w"><label>Total no BM</label><div id="lTot" style="font-weight:700;font-size:15px"></div></div>
      <div class="bm-f w"><label>Anexos (NF, recibo, comprovante, aprovação)</label><div id="lAx">${ax.map(a => `<div style="font-size:12px">📎 ${esc(a.nome)}</div>`).join('') || '<span class="mut" style="font-size:12px">Nenhum</span>'}</div><input type="file" id="lFile" multiple style="font-size:12px"></div></div>`,
      [{ t: 'Cancelar', cls: 'ghost' }, { t: 'Salvar', cls: 'pri', fn: async ov => {
        const unit = Math.abs(+val(ov, 'lUnit') || 0), desc = val(ov, 'lDesc').trim(), comp = val(ov, 'lComp');
        if (!unit) { toast('Informe o valor.', false); return false; }
        if (!desc) { toast('Descreva o item.', false); return false; }
        if (!/^\d{4}-\d{2}$/.test(comp)) { toast('Informe o mês do BM.', false); return false; }
        const doc = { ...(l || {}), id: l ? l.id : undefined, clienteId: c.id, competencia: comp, tipo: ehDesc ? 'desconto' : 'custo', ufv: val(ov, 'lUfv'), cat: val(ov, 'lCat'),
          data: val(ov, 'lData'), desc, unit, pct: +val(ov, 'lPct') || 0, rotuloAcr: val(ov, 'lRot'), os: val(ov, 'lOs').trim(), nf: ehDesc ? '' : val(ov, 'lNf').trim(), cond: val(ov, 'lCond') };
        if (ehDesc) doc.clausula = val(ov, 'lClaus').trim();
        // NF em branco: tenta ler o número do nome do arquivo anexado (ex.: "NF 9216.pdf")
        if (!doc.nf && !ehDesc) {
          const nomes = [...ov.querySelector('#lFile').files].map(f => f.name).concat(ax.map(a => a.nome));
          for (const n of nomes) { const m = /\bNF[\s._-]*(?:n[ºo°.]?\s*)?(\d{2,})/i.exec(n); if (m) { doc.nf = m[1]; break; } }
        }
        delete doc.imp; delete doc.total; delete doc.cnpj; delete doc.spe;
        const j = await api('/bm/lancamento', { method: 'POST', body: { lancamento: doc } });
        doc.id = j.id;
        const files = ov.querySelector('#lFile').files;
        for (const f of files) { const fd = new FormData(); fd.append('lancamentoId', j.id); fd.append('arquivo', f); const r = await api('/bm/anexo', { method: 'POST', form: fd }); S.anexos.push(r.anexo); }
        S.lancamentos = S.lancamentos.filter(x => x.id !== j.id).concat([doc]);
        toast(j.aviso || (ehDesc ? 'Desconto salvo.' : 'Custo salvo.'), !j.aviso);
        if (comp !== c.ref) toast(`Lançado no BM de ${ML(comp)}.`);
        render();
      } }]);
    const atual = () => { const u = Math.abs(+val(ov, 'lUnit') || 0), p = +val(ov, 'lPct') || 0; ov.querySelector('#lTot').textContent = (ehDesc ? '− ' : '') + F(r2(u * (1 + p / 100))) + (p ? ` (base ${F(u)} + ${val(ov, 'lRot')} ${p}%)` : ''); };
    ['lUnit', 'lPct', 'lRot'].forEach(id => ov.querySelector('#' + id).addEventListener('input', atual)); atual();
  }

  function dlgMon(c, idx) {
    const m = idx != null ? c.cos[idx] : {};
    modal(idx != null ? 'Editar — monitoramento remoto' : 'Nova usina — monitoramento remoto', `<div class="bm-grid">
      <div class="bm-f w"><label>Nome da UFV</label><input id="mNome" value="${esc(m.nome || '')}"></div>
      <div class="bm-f"><label>UF</label><input id="mUf" value="${esc(m.uf || '')}"></div><div class="bm-f"><label>MWp</label><input id="mMwp" type="number" step="0.001" value="${esc(m.mwp || '')}"></div>
      <div class="bm-f w"><label>Modalidade</label><select id="mSt">${opts([['Em monitoramento O&M', 'Em monitoramento O&M'], ['Em monitoramento Implantação', 'Em monitoramento Implantação'], ['Crédito de migração', 'Crédito de migração']], m.status || 'Em monitoramento O&M')}</select></div>
      <div class="bm-f"><label>Valor do contrato</label><input id="mVal" type="number" step="0.01" value="${esc(m.valor || '')}"></div><div class="bm-f"><label>Dias monitorados</label><input id="mD" type="number" value="${esc(m.d ?? '')}"></div>
      <div class="bm-f"><label>Mensalidade (valor final)</label><input id="mV" type="number" step="0.01" value="${esc(m.v ?? '')}"></div><div class="bm-f"><label>CNPJ</label><input id="mCnpj" value="${esc(m.cnpj || '')}"></div>
      <div class="bm-f w"><label>Razão social / SPE</label><input id="mSpe" value="${esc(m.spe || '')}"></div><div class="bm-f w"><label>Observação</label><input id="mObs" value="${esc(m.obs || '')}"></div></div>`,
      [{ t: 'Cancelar', cls: 'ghost' }, { t: 'Salvar', cls: 'pri', fn: async ov => {
        const nome = val(ov, 'mNome').trim(); if (!nome) { toast('Informe o nome.', false); return false; }
        const novo = { ...m, nome, uf: val(ov, 'mUf').trim(), mwp: +val(ov, 'mMwp') || 0, status: val(ov, 'mSt'), valor: +val(ov, 'mVal') || 0, d: val(ov, 'mD') ? +val(ov, 'mD') : 30, v: +val(ov, 'mV') || 0, cred: val(ov, 'mSt') === 'Crédito de migração', cnpj: val(ov, 'mCnpj').trim(), spe: val(ov, 'mSpe').trim(), obs: val(ov, 'mObs').trim() };
        const c2 = JSON.parse(JSON.stringify(c)); c2.cos = c2.cos || []; if (idx != null) c2.cos[idx] = novo; else c2.cos.push(novo);
        await salvarCliente(c2); render();
      } }]);
  }

  function dlgStatus(c, e) {
    const rev = 'R' + String(e.revisao || 0).padStart(2, '0');
    modal(`${c.nome} — ${ML(e.competencia)} ${rev}`, `<div class="bm-grid">
      <div class="bm-f w"><label>Novo status</label><select id="sSt">${opts([['enviado', 'Enviado ao cliente'], ['aprovado', 'Aprovado pelo cliente'], ['nf', 'NF emitida'], ['gerado', 'Voltar para "gerado" (não enviado)'], ['cancelado', 'Cancelar este BM']], e.status === 'gerado' ? 'enviado' : e.status === 'enviado' ? 'aprovado' : 'nf')}</select></div>
      <div class="bm-f"><label>Data e hora</label><input id="sData" type="datetime-local" value="${agoraLocalIso()}"></div>
      <div class="bm-f"><label>Nº da NF (se houver)</label><input id="sNf" value="${esc((e.info && e.info.nfNumero) || '')}"></div>
      <div class="bm-f w"><label>Observação</label><input id="sObs" placeholder="Ex.: aprovado por Carolina no e-mail de 06/11"></div></div>`,
      [{ t: 'Cancelar', cls: 'ghost' }, { t: 'Salvar', cls: 'pri', fn: async ov => {
        const st = val(ov, 'sSt');
        if (st === 'cancelado' && !confirm('Cancelar este BM? Ele continua no histórico, marcado como cancelado.')) return false;
        await mudarStatus(e.id, st, val(ov, 'sData'), { nfNumero: val(ov, 'sNf').trim(), obs: val(ov, 'sObs').trim() });
        render();
      } }]);
  }

  async function mudarStatus(id, st, data, info) {
    const j = await api('/bm/emissao/status', { method: 'POST', body: { id, status: st, data: data ? data + (data.length === 16 ? ':00' : '') : '', info } });
    S.emissoes = S.emissoes.map(x => x.id === id ? j.emissao : x);
    toast({ enviado: 'BM marcado como enviado.', aprovado: 'BM marcado como aprovado.', nf: 'NF registrada.', gerado: 'BM voltou para "gerado".', cancelado: 'BM cancelado.' }[st] || 'Status salvo.');
    if (j.avisoCompromisso) toast(j.avisoCompromisso, false);
    return j.emissao;
  }

  function dlgManual(c) {
    modal('Registrar BM enviado fora do Omni', `<div class="bm-note">Para manter a trilha completa quando o BM saiu por outro caminho (ex.: enviado por outra pessoa). Não gera PDF.</div><div class="bm-grid">
      <div class="bm-f"><label>Mês de referência</label><input id="mmComp" type="month" value="${esc(c.ref)}"></div>
      <div class="bm-f"><label>Enviado em</label><input id="mmData" type="datetime-local" value="${agoraLocalIso()}"></div>
      <div class="bm-f w"><label>Usinas</label><div>${(c.ufvs || []).map(u => `<label style="display:inline-flex;gap:5px;margin:0 10px 4px 0;font-size:12.5px"><input type="checkbox" class="mmU" value="${esc(u.nome)}" checked>${esc(u.nome)}</label>`).join('')}</div></div>
      <div class="bm-f"><label>Total (opcional)</label><input id="mmTot" type="number" step="0.01"></div>
      <div class="bm-f w"><label>Observação</label><input id="mmObs" placeholder="Ex.: enviado pelo Figueiró em 04/11"></div></div>`,
      [{ t: 'Cancelar', cls: 'ghost' }, { t: 'Registrar', cls: 'pri', fn: async ov => {
        const us = [...ov.querySelectorAll('.mmU:checked')].map(i => i.value); if (!us.length) { toast('Marque ao menos uma usina.', false); return false; }
        const snap = { versao: 1, manual: true, cliente: { id: c.id, nome: c.nome, modo: c.modo }, competencia: val(ov, 'mmComp'), usinas: us, docs: [], total: +val(ov, 'mmTot') || null };
        const j = await api('/bm/emissao/gerar', { method: 'POST', body: { clienteId: c.id, competencia: val(ov, 'mmComp'), usinas: us, snapshot: snap, total: +val(ov, 'mmTot') || null, titulo: c.nome + ' (registro manual)' } });
        S.emissoes.unshift(j.emissao);
        await mudarStatus(j.emissao.id, 'enviado', val(ov, 'mmData'), { obs: val(ov, 'mmObs').trim(), manual: true });
        render();
      } }]);
  }

  /* ─────────────── gerar BM: escolher usinas → overlay ─────────────── */
  async function abrirEmissao(c, id) {
    const j = await api('/bm/emissao/' + id);
    abrirOverlay(c, j.emissao.snapshot, j.emissao);
  }
  const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => v[k] !== undefined && k[0] !== '_').sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
  const docsCanon = sn => canon((sn.docs || []).map(d => d.D));
  function escolherUsinasEGerar(c, forcarNovo) {
    if (!(c.ufvs || []).length) return toast('Cadastre as usinas primeiro.', false);
    // Já existe BM congelado e ainda não enviado deste mês? Abre ele (marcar enviado / baixar PDFs de novo).
    const pend = forcarNovo ? [] : emissoesDe(c, c.ref).filter(e => e.status === 'gerado' && e.origem !== 'historico');
    if (pend.length) {
      const e = pend.sort((a, b) => String(b.criado).localeCompare(String(a.criado)))[0];
      return modal(`${c.nome} — ${ML(c.ref)}`, `<div class="bm-note">Já existe um BM congelado deste mês, ainda não marcado como enviado: <b>R${String(e.revisao || 0).padStart(2, '0')}</b>, ${e.usinas.length} usina(s), ${e.total != null ? F(e.total) : ''}, congelado em ${dtHora(e.criado)}.</div>
        <div style="font-size:12.5px;color:var(--text-dim)">Abra esse BM para marcar como enviado, copiar o e-mail ou baixar os PDFs de novo, sem criar revisão. Use "Gerar com os dados atuais" só se mudou algo (custo, valor, usina).</div>`,
        [{ t: 'Gerar com os dados atuais', cls: 'ghost', fn: async () => { escolherUsinasEGerar(c, true); } },
         { t: 'Abrir o BM congelado ▸', cls: 'pri', fn: async () => { await abrirEmissao(c, e.id); } }]);
    }
    const sit = situacao(c, c.ref);
    if (c.modo === 'multi') return abrirOverlay(c, montarLote(c, c.ufvs.map(u => u.nome), c.ref), null);
    modal(`Gerar BM — ${c.nome} — ${ML(c.ref)}`, `<div class="bm-note">Marque as usinas que vão neste e-mail. Cada uma gera o seu PDF.</div>
      ${(c.ufvs || []).map(u => { const f = sit.porUsina ? sit.porUsina[u.nome] : 0; return `<label style="display:flex;gap:8px;align-items:center;padding:5px 0;font-size:13px"><input type="checkbox" class="gU" value="${esc(u.nome)}" ${f >= 2 ? '' : 'checked'}>${esc(u.nome)} <span class="bm-pill s${f || 0}">${FASE_TXT[f || 0]}</span></label>`; }).join('')}`,
      [{ t: 'Cancelar', cls: 'ghost' }, { t: 'Pré-visualizar ▸', cls: 'pri', fn: async ov => {
        const us = [...ov.querySelectorAll('.gU:checked')].map(i => i.value); if (!us.length) { toast('Marque ao menos uma usina.', false); return false; }
        abrirOverlay(c, montarLote(c, us, c.ref), null);
      } }]);
  }

  function abrirOverlay(c, snap, emissao) {
    document.getElementById('bmOverlay')?.remove();
    const ov = document.createElement('div'); ov.id = 'bmOverlay';
    let idxDoc = 0, em = emissao;
    const leitura = () => em && em.status !== 'gerado';
    const docsComRev = () => snap.docs.map(d => ({ ...d, D: { ...d.D, revisao: em ? em.revisao : 0 } }));
    const tituloDoc = d => d.titulo + (em && em.revisao ? ' — R' + String(em.revisao).padStart(2, '0') : '');
    const nomeArq = d => `BM_GridCo_${slug(d.titulo)}_${snap.competencia}${em && em.revisao ? '_R' + String(em.revisao).padStart(2, '0') : ''}.pdf`;
    const pdfsEm = () => em ? S.anexos.filter(a => a.dono === em.id && a.tipo === 'pdf_emissao') : [];
    let mudou = false;
    try { if (em && em.status === 'gerado' && snap.docs && snap.docs.length && c.ref === snap.competencia) mudou = docsCanon(montarLote(c, snap.usinas, snap.competencia)) !== docsCanon(snap); } catch (e) {}

    function desenhar() {
      const docs = docsComRev(), d = docs[idxDoc] || docs[0];
      const mail = docs.length ? montarEmail({ ...snap, docs }, em) : null;
      const totalLote = docs.reduce((s, x) => s + renderBoletim(x.D, '').total, 0);
      const st = em ? (em.status === 'cancelado' ? 'Cancelado' : FASE_TXT[FASE[em.status] || 0]) : 'Rascunho (ainda não congelado)';
      ov.innerHTML = `<div class="ov-bar"><button class="bm-btn" id="ovVoltar">◂ Voltar</button>
        <div style="flex:1;font-size:13px"><b>${esc(snap.cliente.nome)}</b> · BM ${ML(snap.competencia)}${em ? ' · R' + String(em.revisao || 0).padStart(2, '0') : ''} · ${docs.length} documento(s) · ${F(totalLote)} · <span style="color:#A9DB21">${esc(st)}</span></div>
        ${docs.length ? `<button class="bm-btn" id="ovHtml">Baixar HTML</button><button class="bm-btn pri" id="ovPdf">${em ? 'Baixar PDF(s)' : 'Congelar e baixar PDF(s)'}</button>` : ''}</div>
        <div class="ov-body"><div class="ov-docs">
          ${docs.length > 1 ? `<div class="ov-tabs">${docs.map((x, i) => `<span class="ov-tab ${i === idxDoc ? 'on' : ''}" data-doc="${i}">${esc(x.usina === '*' ? 'Todas' : x.usina)}</span>`).join('')}</div>` : ''}
          ${d ? `<div class="ov-doc">${htmlBoletim(d.D, tituloDoc(d), snap.cliente.rodape).html}</div>` : '<div class="bm-note">Registro manual, sem documento.</div>'}
        </div>
        <div class="ov-side">
          ${!em ? `<div class="bm-note">Confira o boletim. <b>Congelar e baixar PDF(s)</b> grava esta versão no histórico (com o PDF) e libera o registro de envio.</div>` : ''}
          ${em && em.status === 'gerado' && mudou ? `<div class="bm-warn">Os dados deste mês mudaram depois do congelamento (custo, valor ou usina). Este BM mostra a versão congelada. Para mandar os dados novos, volte e use "Gerar com os dados atuais".</div>` : ''}
          ${em && em.status === 'gerado' ? `<div class="bm-note">Versão congelada em ${dtHora(em.criado)}. Depois de enviar o e-mail no Outlook, clique em <b>Marcar como enviado</b>.</div>` : ''}
          ${mail ? `<h4>E-mail</h4>
          <div class="bm-f"><label>Assunto</label><input id="ovAss" value="${esc(mail.assunto)}" style="background:var(--panel-alt);border:1px solid var(--border-strong);color:var(--text);border-radius:7px;padding:6px 8px"></div>
          <div class="ov-row"><button class="bm-btn sm" id="ovCpAss">Copiar assunto</button>${mail.para ? '<button class="bm-btn sm" id="ovCpPara">Copiar Para</button>' : ''}${mail.cc ? '<button class="bm-btn sm" id="ovCpCc">Copiar Cc</button>' : ''}<button class="bm-btn sm pri" id="ovCpMail">Copiar e-mail (com tabela)</button><button class="bm-btn sm" id="ovCpTxt">Copiar texto simples</button><button class="bm-btn sm" id="ovMailto">Abrir no Outlook</button></div>
          <div class="ov-mail" id="ovMail">${mail.html}</div>
          <div class="mut" style="font-size:11px;margin-top:4px">"Copiar e-mail" leva a tabela formatada; cole no corpo do Outlook. Os PDFs vão anexos à mão. A assinatura é a do Outlook.</div>` : ''}
          ${mail && em ? `<h4>Teams — Financeiro</h4>
          <textarea id="ovTeams" rows="9" style="width:100%;box-sizing:border-box;background:var(--panel-alt);border:1px solid var(--border-strong);color:var(--text);border-radius:7px;padding:8px;font:12.5px/1.45 inherit;resize:vertical">${esc(montarTeams({ ...snap, docs }, em))}</textarea>
          <div class="ov-row"><button class="bm-btn sm pri" id="ovCpTeams">Copiar texto do Teams</button></div>
          <div class="mut" style="font-size:11px;margin-top:4px">O texto muda com a situação: enviado → pede aprovação; aprovado → libera a NF. Dá para editar antes de copiar.</div>` : ''}
          ${em ? `<h4>Situação</h4><div style="font-size:12.5px">${esc(st)}${em.enviadoEm ? ' · enviado ' + dtHora(em.enviadoEm) : ''}${em.aprovadoEm ? ' · aprovado ' + dtHora(em.aprovadoEm) : ''}${em.nfEm ? ' · NF ' + dtHora(em.nfEm) : ''}</div>
            <div class="ov-row">${em.status === 'gerado' ? '<button class="bm-btn pri" id="ovEnviado">Marcar como enviado</button>' : ''}${em.status === 'enviado' ? '<button class="bm-btn" id="ovAprovado">Marcar aprovado</button>' : ''}${['enviado', 'aprovado'].includes(em.status) ? '<button class="bm-btn" id="ovNf">Registrar NF</button>' : ''}</div>
            ${pdfsEm().length ? `<h4>PDFs guardados</h4>${pdfsEm().map(a => `<div style="font-size:12px"><a href="#" data-pdf="${a.id}" style="color:var(--teal)">${esc(a.nome)}</a></div>`).join('')}` : ''}
            ${leitura() ? '<div class="bm-note">Esta versão já saiu. Para corrigir algo, feche, ajuste os dados e gere de novo: abre a revisão seguinte.</div>' : ''}` : ''}
        </div></div>`;
      ov.querySelector('#ovVoltar').onclick = () => { ov.remove(); render(); };
      ov.querySelectorAll('[data-doc]').forEach(t => t.onclick = () => { idxDoc = +t.dataset.doc; desenhar(); });
      ov.querySelectorAll('[data-pdf]').forEach(a => a.onclick = async ev => { ev.preventDefault(); const b = await api('/bm/arquivo/' + a.dataset.pdf, { blob: true }); window.open(URL.createObjectURL(b), '_blank'); });
      const q = id => ov.querySelector('#' + id);
      if (q('ovHtml')) q('ovHtml').onclick = () => { const x = docs[idxDoc]; baixar(new Blob([htmlCompleto(x.D, tituloDoc(x), snap.cliente.rodape)], { type: 'text/html' }), nomeArq(x).replace(/\.pdf$/, '.html')); };
      if (q('ovPdf')) q('ovPdf').onclick = () => congelarEBaixar(q('ovPdf'));
      if (mail) {
        q('ovCpAss').onclick = () => copiar(q('ovAss').value, 'Assunto');
        if (q('ovCpPara')) q('ovCpPara').onclick = () => copiar(mail.para, 'Para');
        if (q('ovCpCc')) q('ovCpCc').onclick = () => copiar(mail.cc, 'Cc');
        q('ovCpMail').onclick = () => copiarRico(mail.html, mail.plain);
        q('ovCpTxt').onclick = () => copiar(mail.plain, 'Texto simples');
        if (q('ovCpTeams')) q('ovCpTeams').onclick = () => copiar(q('ovTeams').value, 'Texto do Teams');
        q('ovMailto').onclick = () => { const p = new URLSearchParams(); if (mail.cc) p.set('cc', mail.cc.replace(/[;\n]+/g, ',')); p.set('subject', q('ovAss').value); p.set('body', mail.plain); location.href = 'mailto:' + encodeURIComponent(mail.para.replace(/[;\n]+/g, ',')).replace(/%2C/g, ',').replace(/%40/g, '@') + '?' + p.toString().replace(/\+/g, '%20'); };
      }
      if (q('ovEnviado')) q('ovEnviado').onclick = () => modalData('Marcar como enviado', 'Enviado em', async (data, obs) => { em = await mudarStatus(em.id, 'enviado', data, { assunto: q('ovAss') ? q('ovAss').value : '', para: mail ? mail.para : '', cc: mail ? mail.cc : '', obs }); desenhar(); });
      if (q('ovAprovado')) q('ovAprovado').onclick = () => modalData('Aprovação do cliente', 'Aprovado em', async (data, obs) => { em = await mudarStatus(em.id, 'aprovado', data, { obs }); desenhar(); });
      if (q('ovNf')) q('ovNf').onclick = () => modalData('NF emitida', 'Emitida em', async (data, obs, nf) => { em = await mudarStatus(em.id, 'nf', data, { obs, nfNumero: nf }); desenhar(); }, true);
    }

    async function congelarEBaixar(btn) {
      btn.disabled = true; const txt = btn.textContent; btn.textContent = 'Gerando…';
      try {
        if (!em) {
          const docs0 = snap.docs.map(d => ({ ...d, D: { ...d.D } }));
          const total = r2(docs0.reduce((s, x) => s + renderBoletim(x.D, '').total, 0));
          const j = await api('/bm/emissao/gerar', { method: 'POST', body: { clienteId: snap.cliente.id, competencia: snap.competencia, usinas: snap.usinas, snapshot: snap, total, titulo: snap.cliente.nome } });
          em = j.emissao; S.emissoes = [em, ...S.emissoes.filter(x => x.id !== em.id)];
          S.anexos = S.anexos.filter(a => !(a.dono === em.id && a.tipo === 'pdf_emissao'));
        }
        const docs = docsComRev(), arqs = [];
        for (const [i, d] of docs.entries()) {
          btn.textContent = `Gerando ${i + 1}/${docs.length}…`;
          await new Promise(r => setTimeout(r, 30)); // devolve o controle ao navegador entre um PDF e outro
          const blob = await pdfBlob(d.D, tituloDoc(d), snap.cliente.rodape);
          arqs.push({ blob, nome: nomeArq(d) });
          if (em.status === 'gerado' || !pdfsEm().some(a => a.rotulo === d.usina)) {
            const fd = new FormData(); fd.append('usina', d.usina); fd.append('arquivo', new File([blob], nomeArq(d), { type: 'application/pdf' }));
            const r = await api('/bm/emissao/' + em.id + '/pdf', { method: 'POST', form: fd }); S.anexos.push(r.anexo);
          }
        }
        const nomeZip = `BM_GridCo_${slug(snap.cliente.nome)}_${snap.competencia}_R${String(em.revisao || 0).padStart(2, '0')}.zip`;
        const modo = await baixarVarios(arqs, nomeZip);
        if (modo === 'soltos') toast('Não consegui montar o ZIP; baixei os PDFs separados.', false);
        toast(`${docs.length} PDF(s) gerado(s) e guardado(s)${modo === 'zip' ? ' num ZIP' : ''} — R${String(em.revisao || 0).padStart(2, '0')}.`);
      } catch (e) { toast('Falha ao gerar: ' + e.message, false); }
      finally { btn.disabled = false; btn.textContent = txt; desenhar(); }
    }

    document.body.appendChild(ov);
    desenhar();
  }

  function modalData(titulo, rot, fn, comNf) {
    modal(titulo, `<div class="bm-grid"><div class="bm-f"><label>${esc(rot)}</label><input id="mdData" type="datetime-local" value="${agoraLocalIso()}"></div>
      ${comNf ? '<div class="bm-f"><label>Nº da NF</label><input id="mdNf"></div>' : ''}<div class="bm-f w"><label>Observação (opcional)</label><input id="mdObs"></div></div>`,
      [{ t: 'Cancelar', cls: 'ghost' }, { t: 'Salvar', cls: 'pri', fn: async ov => { await fn(val(ov, 'mdData'), val(ov, 'mdObs').trim(), comNf ? val(ov, 'mdNf').trim() : ''); } }]);
  }

  window.BM = { entrar, _S: S, _pdfBlob: pdfBlob, _montarEmail: montarEmail, _montarLote: montarLote, _dataEnvio: dataEnvio, _dataNf: dataNf, _renderBoletim: renderBoletim, _feriados: feriados, _montarTeams: montarTeams };
})();
