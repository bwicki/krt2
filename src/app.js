/* krt2.wicki.aero – App-Oberfläche: Aktuell, Gebiet, Editor, Gerät (ab 0.4.0), Konfigurationen, Einstellungen, A6-Karte. */
(function () {
  'use strict';
  const M = window.KRT2MODEL, C = window.KRT2CODEC, I = window.KRT2I18N, S = window.KRT2SAMPLE, API = window.KRT2API, LINK = window.KRT2LINK.link, GR = window.KRT2GERAET;
  const t = I.t;
  const VERSION = '0.4.4';
  const LS = 'krt2.draft';

  const ui = { filter: 'all', q: '', curQ: '', storageWarned: false, devices: null, device: null, deviceSel: null, colF: { k: '', dx: [], ccx: [] }, sort: { by: 'nr', dir: 1 } };
  try { ui.deviceSel = localStorage.getItem('krt2.device'); } catch (e) { /* egal */ }
  let cfg = loadDraft() || S.sampleConfig();

  // ---------- Hilfen ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');
  const range = (a, b) => (a === b ? pad2(a) : pad2(a) + '–' + pad2(b));
  const fmtDate = iso => { if (!iso) return '–'; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString(I.lang === 'de' ? 'de-CH' : 'en-GB'); };
  const fmtDT = d => d.toLocaleString(I.lang === 'de' ? 'de-CH' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const stamp = () => { const d = new Date(); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()); };
  const slug = s => (String(s || 'krt2').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'krt2');

  function saveDraft(clean) {
    cfg.updated = new Date().toISOString();
    cfg.dirty = !clean;
    try { localStorage.setItem(LS, M.toJSON(cfg)); }
    catch (e) { if (!ui.storageWarned) { ui.storageWarned = true; msg(t('m_storage'), 'warn'); } }
  }
  function loadDraft() { try { const s = localStorage.getItem(LS); return s ? M.fromJSON(s) : null; } catch (e) { return null; } }

  /** Meldungen gehen ins Protokoll (Reiter mit Symbolknopf); Warnungen und Fehler erscheinen zusätzlich unten rechts,
      bis man sie schliesst. Alles bleibt markier- und kopierbar und schiebt die Seite nicht nach unten. */
  const LOG = 'krt2.log';
  const msgs = (() => { try { return JSON.parse(localStorage.getItem(LOG) || '[]'); } catch (e) { return []; } })();
  function saveLog() { try { localStorage.setItem(LOG, JSON.stringify(msgs.slice(0, 300))); } catch (e) { /* egal */ } }
  function msg(text, kind) {
    msgs.unshift({ id: M.uid('m'), text, kind: kind || 'info', time: new Date().toISOString(), seen: route() === 'protokoll', toast: kind === 'warn' || kind === 'err' });
    msgs.length = Math.min(msgs.length, 300);
    saveLog(); renderMsgs();
    if (route() === 'protokoll') pageProtokoll();
  }
  const tm = iso => new Date(iso).toLocaleTimeString(I.lang === 'de' ? 'de-CH' : 'en-GB');
  function renderMsgs() {
    const n = msgs.filter(m => !m.seen).length;
    const b = $('#logbadge'); if (b) { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n; }
    const lb = $('#logbtn'); if (lb) lb.setAttribute('aria-label', t('log_title') + (n ? ' (' + t('log_new', { n }) + ')' : ''));
    const box = $('#toasts'); if (!box) return;
    box.innerHTML = msgs.filter(m => m.toast).slice(0, 3).map(m => `<div class="msg ${m.kind}" role="alert" data-mid="${m.id}"><time>${esc(tm(m.time))}</time><span class="txt">${esc(m.text)}</span>` +
      `<button type="button" class="ghost" data-act="mcopy">${t('m_copy')}</button><button type="button" class="ghost" data-act="mclose" aria-label="${t('m_close')}">×</button></div>`).join('');
  }
  function pageProtokoll() {
    msgs.forEach(m => { m.seen = true; }); saveLog(); renderMsgs();
    const lbl = { ok: 'g', info: '', warn: 'y', err: 'r' };
    $('#page').innerHTML = `<div class="spread"><h1>${t('log_title')}</h1><div class="row"><button type="button" class="sec" data-act="logcopy" ${msgs.length ? '' : 'disabled'}>${t('log_copy_all')}</button><button type="button" class="sec" data-act="logclear" ${msgs.length ? '' : 'disabled'}>${t('log_clear')}</button></div></div>
<section class="card flush"><table class="grid"><thead><tr><th style="width:150px">${t('log_time')}</th><th style="width:90px">${t('log_kind')}</th><th>${t('log_text')}</th><th style="width:90px"></th></tr></thead><tbody>
${msgs.length ? msgs.map(m => `<tr data-mid="${m.id}"><td class="small mono">${esc(fmtDT(new Date(m.time)))}</td><td><span class="badge ${lbl[m.kind] || ''}">${esc(t('log_k_' + m.kind))}</span></td><td style="white-space:pre-wrap;user-select:text">${esc(m.text)}</td><td><button type="button" class="ghost" data-act="mcopy">${t('m_copy')}</button></td></tr>`).join('') : `<tr><td colspan="4" class="muted">${t('log_none')}</td></tr>`}
</tbody></table></section>${footerNote()}`;
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    msg(t('m_saved_file', { f: name }), 'ok');
  }

  function ask(title, body, yes, no, yesCls) {
    return new Promise(res => {
      const d = $('#dlg');
      d.innerHTML = `<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="row"><button type="button" class="sec" value="no">${esc(no || t('cancel'))}</button><button type="button" class="${yesCls === 'primary' ? '' : (yesCls || 'danger')}" value="yes">${esc(yes)}</button></div>`;
      const done = v => { d.close(); res(v); };
      d.querySelectorAll('button').forEach(b => b.addEventListener('click', () => done(b.value === 'yes')));
      d.addEventListener('cancel', () => res(false), { once: true });
      d.showModal(); d.querySelector('button.sec').focus();
    });
  }

  /** Auswahl mit mehreren Knöpfen: options = [[wert, text], …]; der erste ist der Vorschlag. Gibt den Wert zurück (Esc: null). */
  function choose(title, body, options) {
    return new Promise(res => {
      const d = $('#dlg');
      d.innerHTML = `<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="row">${options.map(([v, l], i) => `<button type="button" class="${i ? 'sec' : ''}" value="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
      d.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { d.close(); res(b.value); }));
      d.addEventListener('cancel', () => res(null), { once: true });
      d.showModal(); d.querySelector('button').focus();
    });
  }

  // ---------- Gerüst ----------
  const ROUTES = ['aktuell', 'gebiet', 'editor', 'geraet', 'konfigurationen', 'einstellungen', 'karte', 'konten', 'protokoll'];
  const isSuper = () => !!(API.user && API.user.role === 'super');
  function nav() {
    const n = [['aktuell', 'nav_aktuell'], ['gebiet', 'nav_gebiet'], ['editor', 'nav_editor'], ['geraet', 'nav_geraet'], ['konfigurationen', 'nav_konfig', API.enabled ? null : '0.2.0'], ['einstellungen', 'nav_einst']];
    if (isSuper()) n.push(['konten', 'nav_konten']);
    return n;
  }
  function route() { const r = location.hash.replace(/^#\/?/, '').split('?')[0]; return ROUTES.includes(r) ? r : 'aktuell'; }

  function shell(r) {
    document.title = t('title') + ' · krt2.wicki.aero';
    $('#app').innerHTML = `
<header class="top">
  <div class="brand"><strong>${t('title')}</strong>
    <nav class="main" aria-label="Navigation">${nav().map(([k, l, v]) => `<a href="#${k}"${k === r || (r === 'karte' && k === 'aktuell') ? ' aria-current="page"' : ''}${v ? ' class="later" title="' + esc(t('later_title', { v })) + '"' : k === 'geraet' && LINK.connected ? ' class="live"' : ''}>${t(l)}</a>`).join('')}</nav>
  </div>
  <div class="top-right">
    <a class="btn sec iconbtn" id="logbtn" href="#protokoll" title="${esc(t('log_title'))}"${r === 'protokoll' ? ' aria-current="page"' : ''}><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg><span class="lbadge" id="logbadge" hidden></span></a>
    <a class="btn sec iconbtn" href="#karte" data-act="printcard" title="${esc(t('print_card'))}" aria-label="${esc(t('print_card'))}"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><path d="M6 14h12v7H6z"/></svg></a>
    <div class="seg" role="group" aria-label="Sprache / language"><button type="button" data-act="lang" data-v="de" aria-pressed="${I.lang === 'de'}">DE</button><button type="button" data-act="lang" data-v="en" aria-pressed="${I.lang === 'en'}">EN</button></div>
    ${!API.enabled ? `<button type="button" class="sec" disabled title="${esc(t('login_off'))}">${t('login')}</button>`
      : API.user ? `<button type="button" class="sec" data-act="account" title="${esc(API.user.name || '')}">${esc(API.user.login)} ▾</button>`
      : `<button type="button" class="sec" data-act="login">${t('login')}</button>`}
    <div class="logo"><img src="./img/logo.png" alt="Wicki Partners Ballonteam"><span class="ver">${VERSION}</span></div>
  </div>
</header>
<main id="page"></main>
<div id="toasts" class="toasts" aria-live="polite"></div>
<div id="bar"></div>
<dialog id="dlg"></dialog>
<input type="file" id="file" accept=".json,application/json" hidden>`;
    renderMsgs();
  }

  function render() {
    const r = route();
    if (window.KRT2GEBIET) window.KRT2GEBIET.leave();
    shell(r);
    ({ aktuell: pageAktuell, editor: pageEditor, einstellungen: pageEinst, karte: pageKarte, gebiet: () => window.KRT2GEBIET.render(gctx), geraet: () => GR.render(), konfigurationen: pageKonfig, konten: pageKonten, protokoll: pageProtokoll })[r]();
  }

  function footerNote() {
    return `<p class="note">${t('disclaimer')} · <a href="./LICENSE">Legal Mambojumbo</a> · <a href="./test.html">${t('testlink')}</a></p>`;
  }

  // ---------- Aktuell ----------
  /** Gruppen für die Anzeige: [{ name, rg, rows:[{nr,kurz,ch,klar,dienst}], free }] – aus dem Entwurf oder aus dem Gerät. */
  function groupsFromLayout(L) {
    const g = [];
    const fx = L.slots.filter(x => x.kind === 'fixed' && x.nr !== 99);   // 00 und weitere feste Plätze
    if (fx.length) g.push({ name: t('blk_fixed'), rg: fx.map(x => pad2(x.nr)).join(', '), rows: fx });
    for (const r of L.ranges) g.push({ name: r.name, rg: range(r.from, r.to), rows: (r.nrs || []).map(n => L.slots[n]) });
    const frees = L.slots.filter(x => x.kind === 'free' && x.nr < 99);
    if (frees.length) g.push({ name: t('blk_free'), rg: range(frees[0].nr, frees[frees.length - 1].nr), rows: frees, free: true });
    if (L.slots[99].kind === 'fixed') g.push({ name: t('blk_emerg'), rg: '99', rows: [L.slots[99]] });
    else g.push({ name: t('blk_free'), rg: '99', rows: [L.slots[99]], free: true });
    return g;
  }
  function groupsFromDevice(pl) {
    const g = [];
    const rows = pl.map(p => ({ nr: p.nr, kurz: (p.name || '').trimEnd(), ch: p.ch, klar: p.klar || '', dienst: p.dienst || '', block: p.block || '', kind: p.kind || '' }));
    const freeOf = r => r.kind === 'free' || r.kind === 'leer' || (!r.kind && (r.kurz === 'FREE' || !r.kurz));
    const isFixed = r => r.nr !== 99 && (r.kind === 'fixed' || (r.nr === 0 && r.kind !== 'entry' && !r.block && !freeOf(r)));
    const fx = rows.filter(isFixed);
    if (fx.length) g.push({ name: t('blk_fixed'), rows: fx, rg: fx.map(x => pad2(x.nr)).join(', ') });
    for (const r of rows.filter(x => !isFixed(x))) {
      const name = r.nr === 99 && r.ch === '121.500' ? t('blk_emerg') : freeOf(r) ? t('blk_free') : (r.block || '–');
      const last = g[g.length - 1];
      if (last && last.name === name && !last.rg) last.rows.push(r); else g.push({ name, rows: [r], free: freeOf(r) });
    }
    g.forEach(x => { if (!x.rg) x.rg = range(x.rows[0].nr, x.rows[x.rows.length - 1].nr); });
    return g;
  }

  function pageAktuell() {
    const dev = ui.device && ui.device.id === ui.deviceSel ? ui.device : null;
    const prog = dev && dev.aktuell && dev.aktuell.plaetze ? dev.aktuell : null;
    const groups = prog ? groupsFromDevice(prog.plaetze) : groupsFromLayout(M.layout(cfg));
    const head = prog
      ? `<div class="stack"><span class="label">${t('cur_device')}</span><div class="row"><strong style="font-size:20px">${esc(dev.bezeichnung)}</strong><span class="badge g">${t(prog.herkunft === 'ausgelesen' ? 'cur_read_from' : 'cur_programmed')}</span></div>
          <span class="small muted">${prog.configName ? '«' + esc(prog.configName) + '»' + (prog.version ? ' v' + prog.version : '') + ' · ' : ''}${esc(fmtDT(new Date(prog.zeit)))} · ${esc(dev.owner.name || dev.owner.login)}</span></div>`
      : `<div class="stack"><span class="label">${t('cur_config')}</span><div class="row"><strong style="font-size:20px">«${esc(cfg.name || '–')}»</strong><span class="badge y">${t('cur_draft')}</span></div>
          <span class="small muted">${dev ? esc(t('cur_dev_none', { d: dev.bezeichnung })) : t('cur_draft_note')}</span></div>`;
    const devList = API.enabled ? `<section class="card stack" aria-label="${esc(t('cur_devices'))}"><span class="label">${t('cur_devices')}</span><div id="devlist" class="row" style="gap:8px">${devChips()}</div></section>` : '';
    $('#page').innerHTML = `${devList}
<section class="card spread">
  ${head}
  ${!prog ? `<div class="stack"><span class="label">${t('cur_data')}</span><span>${esc(fmtDate(cfg.datenStand))}${cfg.standort && cfg.standort.name ? ' · ' + esc(cfg.standort.name) : ''}</span></div>` : ''}
  <div class="row"><a class="btn" href="#karte">${t('cur_print')}</a><a class="btn sec" href="#geraet?sichern">${t('cur_read')}</a></div>
</section>
<div class="row"><label for="q" class="muted">${t('cur_search')}</label><input id="q" type="search" class="search" placeholder="${esc(t('cur_search_ph'))}" value="${esc(ui.curQ)}">${!prog && cfg.beispiel ? `<span class="small muted">${t('sample_note')}</span>` : ''}</div>
<section class="card flush"><table class="grid cur-table"><thead><tr><th style="width:64px">${t('col_nr')}</th><th style="width:130px">${t('col_k')}</th><th style="width:110px">${t('col_f')}</th><th>${t('col_t')}</th><th style="width:110px">${t('col_d')}</th></tr></thead><tbody id="curbody"></tbody></table></section>
${footerNote()}`;
    const fill = () => { $('#curbody').innerHTML = curRows(groups, ui.curQ); };
    fill();
    $('#q').addEventListener('input', e => { ui.curQ = e.target.value; fill(); });
    if (API.enabled && ui.devices === null) loadDevices();
  }

  function devChips() {
    if (ui.devices === null) return `<span class="small muted">…</span>`;
    if (ui.devices === false) return `<span class="small muted">${t('cur_dev_err')}</span>`;
    const chip = (id, label, sub) => `<button type="button" class="chip" data-act="devsel" data-v="${esc(id)}" aria-pressed="${(ui.deviceSel || '') === id}" style="text-align:left">${label}${sub ? `<br><span class="small" style="opacity:.8">${sub}</span>` : ''}</button>`;
    return chip('', `<b>${t('cur_draft')}</b>`, esc(cfg.name || '–')) + ui.devices.map(d => chip(d.id, `<b>${esc(d.bezeichnung)}</b> · ${esc(d.owner.name || d.owner.login)}`,
      d.aktuell ? esc((d.aktuell.configName ? '«' + d.aktuell.configName + '»' + (d.aktuell.version ? ' v' + d.aktuell.version : '') + ' · ' : '') + fmtDate(d.aktuell.zeit)) : esc(t('cur_dev_noprog')))).join('');
  }
  async function loadDevices() {
    try { ui.devices = await API.devices(); } catch (e) { ui.devices = false; msg(t('m_api_err', { e: e.message }), 'err'); }
    if (ui.deviceSel && ui.devices && !ui.devices.find(d => d.id === ui.deviceSel)) ui.deviceSel = null;
    if (ui.deviceSel) await loadDevice(ui.deviceSel); else if (route() === 'aktuell') pageAktuell();
  }
  async function loadDevice(id) {
    try { ui.device = await API.device(id); } catch (e) { ui.device = null; msg(t('m_api_err', { e: e.message }), 'err'); }
    if (route() === 'aktuell' || route() === 'karte') render();
  }

  function curRows(groups, q) {
    const s = q.trim().toUpperCase().replace(',', '.');
    const hit = x => !s || [x.kurz, x.ch, x.klar, x.dienst].some(v => String(v || '').toUpperCase().includes(s));
    const row = x => `<tr><td class="nr">${pad2(x.nr)}</td><td class="k">${esc(x.kurz)}</td><td class="f">${esc(x.ch)}</td><td>${esc(x.klar)}</td><td class="small muted">${esc(x.dienst || (x.kind === 'fixed' ? t('fest') : '–'))}</td></tr>`;
    const head = (name, rg) => `<tr class="head"><td colspan="5"><b>${esc(name)}</b> <span class="small muted">${rg}</span></td></tr>`;
    let h = '', n = 0;
    for (const g of groups) {
      if (g.free && g.rows.length > 1) {
        const f = g.rows[0];
        if (s && !hit(f)) continue;
        h += head(g.name, g.rg) + `<tr><td class="nr">${g.rg}</td><td class="k">${esc(f.kurz)}</td><td class="f">${esc(f.ch)}</td><td class="muted" colspan="2">${t('cur_free_rows', { n: g.rows.length, ch: f.ch, k: f.kurz })}</td></tr>`; n++;
        continue;
      }
      const v = g.rows.filter(hit);
      if (v.length) { h += head(g.name, g.rg) + v.map(row).join(''); n += v.length; }
    }
    return n ? h : `<tr><td colspan="5" class="muted">${t('cur_none')}</td></tr>`;
  }

  // ---------- Editor ----------
  const ownCfg = () => !!(cfg.server && API.user && cfg.server.owner && cfg.server.owner.id === API.user.id);
  function saveState() {
    if (!cfg.server) return t('ed_unsaved');
    const who = cfg.server.owner && !ownCfg() ? ' · ' + (cfg.server.owner.name || cfg.server.owner.login) : '';
    return `v${cfg.server.version}${who} · ` + (cfg.dirty ? t('ed_changed') : t('ed_saved'));
  }
  function saveLabel() { return !API.user ? t('ed_srv_login') : ownCfg() ? t('ed_srv_save', { v: cfg.server.version + 1 }) : cfg.server ? t('ed_srv_copy') : t('ed_srv_new'); }
  /** Konfiguration aus dem Server in den Entwurf übernehmen. */
  function adopt(c) {
    cfg = M.fromJSON(c.data);
    cfg.name = c.name; cfg.server = { id: c.id, version: c.version, owner: c.owner }; delete cfg.beispiel;
    saveDraft(true);
  }
  function cfgData() { const d = JSON.parse(M.toJSON(cfg)); delete d.server; delete d.dirty; return d; }
  async function srvSave() {
    if (!API.user) { await loginDialog(); if (!API.user) return; }
    const name = (cfg.name || '').trim();
    if (!name) { msg(t('m_need_name'), 'warn'); const el = $('#cname'); if (el) el.focus(); return; }
    try {
      const c = ownCfg() ? await API.saveConfig(cfg.server.id, name, cfgData(), cfg.server.version) : await API.createConfig(name, cfgData());
      adopt(c); msg(t('m_srv_saved', { n: c.name, v: c.version }), 'ok');
    } catch (e) { msg(t('m_api_err', { e: e.message }), 'err'); }
    if (route() === 'editor') pageEditor(); else render();
  }

  function pageEditor() {
    const on = cfg.bloecke.filter(b => b.on);
    const chip = (v, label) => `<button type="button" class="chip" data-act="filter" data-v="${esc(v)}" aria-pressed="${ui.filter === v}">${esc(label)}</button>`;
    const area = [cfg.standort && cfg.standort.name, cfg.hoehe ? cfg.hoehe.von + '–' + cfg.hoehe.bis.replace('FL', 'FL ') : '', cfg.datenStand ? t('cur_data') + ' ' + fmtDate(cfg.datenStand) : ''].filter(Boolean).join(' · ');
    $('#page').className = 'wide';
    $('#page').innerHTML = `
<div class="spread">
  <div class="stack"><div class="row"><label class="sr" for="cname">${t('ed_name_ph')}</label><input id="cname" type="text" data-act="cname" value="${esc(cfg.name)}" placeholder="${esc(t('ed_name_ph'))}" style="font-size:20px;font-weight:600;min-width:280px"><span class="badge${cfg.server && !cfg.dirty ? ' g' : cfg.server ? ' y' : ''}" id="savestate">${esc(saveState())}</span><span class="badge o" id="priobadge" hidden></span></div>
    <span class="small muted">${esc(area)}</span></div>
  <div class="row"><button type="button" class="sec" data-act="new">${t('ed_new')}</button><button type="button" class="sec" data-act="sample">${t('ed_sample')}</button></div>
</div>
${cfg.beispiel ? `<p class="note">${t('sample_note')}</p>` : ''}
<div class="row">
  ${chip('all', t('ed_all'))}${on.map(b => chip(b.id, b.name)).join('')}${chip('active', t('ed_active'))}${chip('check', t('ed_check'))}
  <label class="sr" for="qe">${t('cur_search')}</label><input id="qe" type="search" placeholder="${esc(t('cur_search'))}" value="${esc(ui.q)}" style="width:180px">
  <button type="button" class="sec" data-act="own">${t('ed_own')}</button>
  <button type="button" class="sec" data-act="dups" id="dupbtn">${t('ed_dup_btn')}</button>
  <span class="row nowrap" style="gap:6px"><span class="small muted">${t('ed_ad')}</span><div class="seg"><button type="button" data-act="allmode" data-v="icao" aria-pressed="false">${t('ed_all_icao')}</button><button type="button" data-act="allmode" data-v="kurz" aria-pressed="false">${t('ed_all_short')}</button></div></span>
</div>
<div class="ed-layout">
  <div class="ed-main"><div class="ed-actions"><span class="status" id="edstatus"></span>
    <div class="row" style="gap:8px">
    <a class="btn sec" href="#geraet?programmieren">${t('ed_compare')}</a>
    <button type="button" class="sec" data-act="load">${t('ed_load')}</button>
    <button type="button" class="sec" data-act="csv">${t('ed_csv')}</button>
    <button type="button" class="${API.enabled ? 'sec' : ''}" data-act="saveas">${t('ed_saveas')}</button>
    ${API.enabled ? `<button type="button" data-act="srvsave">${esc(saveLabel())}</button>` : ''}
    <a class="btn" href="#geraet?programmieren">${t('ed_program')}</a></div></div>
  <section class="card flush"><table class="grid" id="edt"><thead id="edhead">${edHead()}</thead><tbody id="edbody"></tbody></table></section></div>
  <aside><section class="card" id="issues"></section><section class="card" id="left"></section></aside>
</div>`;
    $('#qe').addEventListener('input', e => { ui.q = e.target.value; edRefresh(); });
    edRefresh();
  }

  /** Tabellenkopf: Sortieren (Platz = Blockansicht); Filter-Symbol hinter Kurzname, Dienst und Land öffnet eine kleine Auswahl. */
  const FUNNEL = '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/></svg>';
  const fActive = c => (c === 'k' ? !!ui.colF.k.trim() : (ui.colF[c + 'x'] || []).length > 0);
  const anyFilter = () => fActive('k') || fActive('d') || fActive('cc');
  function edHead() {
    const sb = (by, label) => { const on = ui.sort.by === by; return `<button type="button" class="sort${on ? ' on' : ''}" data-act="colsort" data-v="${by}" aria-pressed="${on}" title="${esc(t('ed_sort_by', { c: label }))}">${esc(label)}${on && by !== 'nr' ? (ui.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`; };
    const fb = (c, label) => `<button type="button" class="ficon${fActive(c) ? ' on' : ''}" data-act="fopen" data-v="${c}" aria-haspopup="true" aria-label="${esc(t('ed_f_' + c))}" title="${esc(t('ed_f_' + c))}">${FUNNEL}</button>`;
    return `<tr><th><span class="sr">${t('col_move')}</span></th><th>${sb('nr', t('col_nr'))}</th><th>${t('col_on')}</th><th>${sb('k', t('col_k'))}${fb('k')}</th><th>${t('col_f')}</th><th>${t('col_t')}</th><th>${sb('d', t('col_d'))}${fb('d')}</th><th>${sb('dist', t('col_km'))}</th><th>${sb('cc', t('col_cc'))}${fb('cc')}</th>
<th>${t('col_q')}${anyFilter() || ui.sort.by !== 'nr' ? ` <button type="button" class="ghost small" data-act="colreset" title="${esc(t('ed_f_reset'))}">✕ ${t('ed_f_reset_s')}</button>` : ''}</th></tr>`;
  }
  /** Auswahl unter dem Filter-Symbol: Text für Kurzname, Häkchen je Wert für Dienst und Land (ein- und ausblenden). */
  function openFilter(btn) {
    closeFilter();
    const c = btn.dataset.v, r = btn.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.id = 'fpop'; pop.className = 'fpop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', t('ed_f_' + c));
    if (c === 'k') pop.innerHTML = `<label class="stack" style="gap:4px"><span class="small muted">${t('ed_f_k_hint')}</span><input id="fk" type="search" class="mono" value="${esc(ui.colF.k)}" placeholder="${esc(t('ed_f_ph'))}" style="width:160px"></label>`;
    else {
      const val = e => (c === 'd' ? e.dienst : M.ccOf(e) || '–');
      const counts = {}; cfg.eintraege.forEach(e => { const v = val(e); counts[v] = (counts[v] || 0) + 1; });
      const x = ui.colF[c + 'x'] || [];
      pop.innerHTML = `<div class="row nowrap" style="gap:6px;margin-bottom:6px"><button type="button" class="ghost small" data-act="fall" data-v="${c}">${t('ed_f_all')}</button><button type="button" class="ghost small" data-act="fnone" data-v="${c}">${t('ed_f_none')}</button></div>
<div class="fpop-list">${Object.keys(counts).sort().map(v => `<label><input type="checkbox" data-fchk="${c}" value="${esc(v)}" ${x.includes(v) ? '' : 'checked'}> <span class="mono">${esc(v)}</span> <span class="small muted">${counts[v]}</span></label>`).join('')}</div>`;
    }
    document.body.appendChild(pop);
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    const f = pop.querySelector('input'); if (f) f.focus();
  }
  function closeFilter() { const p = $('#fpop'); if (p) p.remove(); }
  function applyFilter() { $('#edhead').innerHTML = edHead(); edRefresh(); }

  function svcOptions(sel) { const l = M.servicesOf(cfg).slice(); if (sel && !l.includes(sel)) l.push(sel); return l.map(s => `<option${s === sel ? ' selected' : ''}>${esc(s)}</option>`).join(''); }

  function edRefresh() {
    const R = M.check(cfg), L = R.layout;
    const q = ui.q.trim().toUpperCase().replace(',', '.');
    const match = e => {
      if (ui.filter === 'active' && !e.aktiv) return false;
      if (ui.filter === 'check' && !(R.byEntry[e.id] || []).length) return false;
      if (ui.filter !== 'all' && ui.filter !== 'active' && ui.filter !== 'check' && e.block !== ui.filter) return false;
      if (ui.colF.k.trim() && !M.entryShort(e).toUpperCase().includes(ui.colF.k.trim().toUpperCase())) return false;
      if (ui.colF.dx.includes(e.dienst)) return false;
      if (ui.colF.ccx.includes(M.ccOf(e) || '–')) return false;
      return !q || [M.entryShort(e), e.ch, e.klar, e.dienst, e.ort && e.ort.name, e.ort && e.ort.icao].some(v => String(v || '').toUpperCase().includes(q));
    };
    const colOn = anyFilter();
    const showFixed = ui.filter === 'all' && !q && !colOn && ui.sort.by === 'nr';
    let h = '';
    const fixedRow = (key, nr) => {  // 00 und 99: fest, nur 99 abwählbar; weitere feste Plätze aus den Einstellungen
      const p = key === 'p00' || key === 'p99' ? cfg.fixed[key] : Object.assign({ on: true }, cfg.fixed.extra.find(x => x.id === key));
      const is99 = key === 'p99';
      const box = is99 ? `<input type="checkbox" data-act="e99" ${p.on ? 'checked' : ''} aria-label="${t('col_on')} 99">` : `<span class="fixtag">${t('fest')}</span>`;
      return `<tr class="fixed${p.on ? '' : ' off'}"><td class="mv"></td><td class="nr">${pad2(nr)}</td><td>${box}</td><td class="k">${esc(p.kurz)}</td><td class="f">${esc(p.ch)}</td><td>${esc(p.klar)}</td><td class="small muted">${t('fest')}</td><td class="small muted">–</td><td class="small muted">–</td><td><span class="badge">${t('fest')}</span></td></tr>`;
    };
    if (ui.sort.by !== 'nr') {
      // Sortierte Ansicht: flache Liste, Plätze bleiben wie sie sind; Verschieben nur in der Blockansicht
      const num = v => (v == null || v === '' ? Infinity : Number(v));
      const key = { k: e => M.entryShort(e), d: e => e.dienst, dist: e => num(e.dist), cc: e => (M.ccOf(e) || '~') }[ui.sort.by];
      const cmp = (a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * ui.sort.dir || num(a.dist) - num(b.dist) || (L.slotOf[a.id] ?? 999) - (L.slotOf[b.id] ?? 999); };
      const on = new Set(cfg.bloecke.filter(b => b.on).map(b => b.id));
      const list = cfg.eintraege.filter(e => on.has(e.block) && match(e)).sort(cmp);
      h = `<tr class="head"><td colspan="10"><span class="small muted">${esc(t('ed_sorted_view', { c: t({ k: 'col_k', d: 'col_d', dist: 'col_km', cc: 'col_cc' }[ui.sort.by]) }))}</span></td></tr>` + list.map(e => entryRow(e, L, R, true)).join('');
    }
    const fxRows = (cfg.fixed.p00.on ? [['p00', 0]] : []).concat(Object.entries(M.fixedExtra(cfg)).map(([n, x]) => [x.id, Number(n)])).sort((a, b) => a[1] - b[1]);
    if (showFixed && fxRows.length) h += `<tr class="head"><td colspan="10"><div class="row" style="gap:8px"><b>${t('blk_fixed')}</b><span class="small muted">${fxRows.map(x => pad2(x[1])).join(', ')}</span><a class="small" href="#einstellungen">${t('ed_fixed_edit')}</a></div></td></tr>` + fxRows.map(x => fixedRow(x[0], x[1])).join('');
    const prioSet = new Set(L.prio);
    if (ui.sort.by === 'nr') for (const b of cfg.bloecke.filter(x => x.on)) {
      const list = M.entriesOf(cfg, b.id);
      const rg = L.ranges.find(r => r.block === b.id);
      const vis = list.filter(e => match(e) && !prioSet.has(e.id));
      if (!vis.length && (q || colOn || (ui.filter !== 'all' && ui.filter !== b.id))) continue;
      h += `<tr class="head" data-block="${b.id}"><td colspan="10"><div class="row" style="gap:8px"><b>${esc(b.name)}</b><span class="small muted">${rg ? range(rg.from, rg.to) : '–'} · ${t('ord_' + b.order)}</span>` +
        `<button type="button" class="ghost small" data-act="sort" data-b="${b.id}">${t('ed_sort')}</button></div></td></tr>`;
      for (const e of vis) h += entryRow(e, L, R);
    }
    if (showFixed) {
      if (L.freeTo != null) h += `<tr class="head" data-block="__free"><td colspan="10"><b>${t('blk_free')}</b> <span class="small muted">${range(L.freeFrom, L.freeTo)}: ${esc(cfg.settings.free.ch)} ${esc(cfg.settings.free.kurz)}</span></td></tr>`;
      h += `<tr class="head"><td colspan="10"><b>${t('blk_emerg')}</b> <span class="small muted">99</span></td></tr>` + fixedRow('p99', 99);
    }
    // Prio-Liste: gewählt, aber im Block kein Platz mehr – rückt als erste nach, wenn vorne abgewählt wird
    if (ui.sort.by === 'nr' && L.prio.length) {
      const pr = L.prio.map(id => cfg.eintraege.find(e => e.id === id)).filter(e => e && match(e));
      if (pr.length) {
        h += `<tr class="head prio" data-block="__prio"><td colspan="10"><div class="row" style="gap:8px"><b>${t('ed_prio')}</b><span class="small">${esc(t('ed_prio_head', { n: L.prio.length }))}</span></div></td></tr>`;
        let lastB = null;
        for (const e of pr) {
          if (e.block !== lastB) { lastB = e.block; const bb = M.blockById(cfg, e.block); h += `<tr class="sub"><td colspan="10"><span class="small muted">${esc(bb ? bb.name : '–')}</span></td></tr>`; }
          h += entryRow(e, L, R, true);
        }
      }
    }
    $('#edbody').innerHTML = h || `<tr><td colspan="10" class="muted">${t('cur_none')}</td></tr>`;
    // Prüfliste
    const codes = Object.entries(R.count.codes);
    const lvlOf = c => (['freq', 'nameLeer', 'nameLang', 'nameZeichen'].includes(c) || (c === 'widerspruch' && cfg.eintraege.some(e => e.vertrauen === 'r' && !e.bestaetigt && L.slotOf[e.id] != null))) ? 'r' : 'y';
    $('#issues').innerHTML = `<div class="label" style="margin-bottom:8px">${t('ed_issues')}</div>` +
      (codes.length ? `<ul class="issues">${codes.map(([c, n]) => `<li><span class="badge ${lvlOf(c)}">${esc(t('sum_' + c, { n }))}</span></li>`).join('')}</ul>` : `<p class="note">${t('ed_ok')}</p>`) +
      (R.count.r ? `<p class="note" style="margin-top:8px">${t('ed_block_note')}</p>` : '');
    $('#left').innerHTML = `<div class="label" style="margin-bottom:6px">${t('ed_left')}</div>` + (L.notPlaced.length ? L.notPlaced.map(x =>
      `<div class="left-item"><span><span class="mono" style="font-weight:600">${esc(x.e.ch)}</span> ${esc(x.e.klar || M.entryShort(x.e))}<br><span class="small muted">${t('why_' + x.why)}</span></span>` +
      (x.why === 'blockAus' || x.why === 'ohneBlock' ? `<button type="button" class="sec" data-act="bring" data-id="${x.e.id}">${t('ed_bring')}</button>` : '') + `</div>`).join('') : `<p class="note">${t('ed_left_none')}</p>`);
    const sb = $('#savestate'); if (sb) { sb.textContent = saveState(); sb.className = 'badge' + (cfg.server && !cfg.dirty ? ' g' : cfg.server ? ' y' : ''); }
    $('#edstatus').textContent = t('ed_status', { used: L.used + (cfg.fixed.p99.on ? 1 : 0), r: R.count.r, y: R.count.y });
    const pb = $('#priobadge'); if (pb) { pb.hidden = !L.prio.length; pb.textContent = t('ed_prio_badge', { n: L.prio.length }); }
    const db = $('#dupbtn'); if (db) { const n = M.dupGroups(cfg, L).length; db.textContent = n ? t('ed_dup_btn_n', { n }) : t('ed_dup_btn'); }
  }

  /** Doppelte Frequenzen in einer eigenen Übersicht: je Platz abwählen oder stehen lassen. */
  function dupDialog() {
    const G = M.dupGroups(cfg);
    if (!G.length) { msg(t('ed_dup_none'), 'ok'); return; }
    const d = $('#dlg');
    const nr = x => (x.nr != null ? pad2(x.nr) : `<span class="ptag">P${x.prio}</span>`);
    const blk = x => (x.fixed ? t('ed_dup_fixed') : ((M.blockById(cfg, x.e.block) || {}).name || ''));
    const body = G.map(g => `<tr class="head"><td colspan="6"><b class="mono">${esc(g.chs.join(' = '))}</b> <span class="small muted">· ${esc(t('ed_dup_n', { n: g.list.length }))}</span></td></tr>` +
      g.list.map(x => `<tr${x.fixed ? ' class="fixed"' : ''}><td>${x.fixed ? '' : `<input type="checkbox" data-dup="${esc(x.e.id)}" checked aria-label="${esc(t('ed_dup_keep', { k: x.kurz || x.ch }))}">`}</td>` +
        `<td class="nr">${nr(x)}</td><td class="k">${esc(x.kurz)}</td><td class="f">${esc(x.ch)}</td><td>${esc(x.klar || '')}</td><td class="small muted">${esc(blk(x))}</td></tr>`).join('')).join('');
    d.classList.add('wide');
    d.innerHTML = `<div class="stack" style="gap:10px"><h2>${esc(t('ed_dup_title'))}</h2><p class="note" style="margin:0">${t('ed_dup_note')}</p>
<div class="dupbox"><table class="grid"><thead><tr><th>${t('ed_dup_col_keep')}</th><th>${t('col_nr')}</th><th>${t('col_k')}</th><th>${t('col_f')}</th><th>${t('col_t')}</th><th>${t('ed_dup_col_blk')}</th></tr></thead><tbody>${body}</tbody></table></div>
<div class="row" style="justify-content:flex-start;margin-top:0"><button type="button" class="ghost" data-dupact="first">${t('ed_dup_first')}</button><button type="button" class="ghost" data-dupact="all">${t('ed_dup_all')}</button></div>
<div class="row"><button type="button" class="sec" data-dupact="cancel">${t('cancel')}</button><button type="button" data-dupact="ok" id="dupok"></button></div></div>`;
    const boxes = () => [...d.querySelectorAll('[data-dup]')];
    const upd = () => { const n = boxes().filter(x => !x.checked).length; const ok = $('#dupok'); ok.disabled = !n; ok.textContent = n ? t('ed_dup_apply', { n }) : t('ed_dup_apply0'); };
    const sug = new Set(M.dupSuggest(G));
    const ac = new AbortController();                                   // der Dialog wird von ask/choose wiederverwendet
    d.addEventListener('change', upd, { signal: ac.signal });
    d.addEventListener('click', ev => {
      const a = ev.target.closest('[data-dupact]'); if (!a) return;
      const v = a.dataset.dupact;
      if (v === 'first') { boxes().forEach(x => { x.checked = !sug.has(x.dataset.dup); }); upd(); return; }
      if (v === 'all') { boxes().forEach(x => { x.checked = true; }); upd(); return; }
      if (v === 'ok') {
        const off = new Set(boxes().filter(x => !x.checked).map(x => x.dataset.dup));
        for (const e of cfg.eintraege) if (off.has(e.id)) e.aktiv = false;
        d.close(); msg(t('m_dup_done', { n: off.size }), 'ok'); afterChange(edRefresh); return;
      }
      d.close();
    }, { signal: ac.signal });
    d.addEventListener('close', () => { ac.abort(); d.classList.remove('wide'); }, { once: true });
    upd(); d.showModal(); d.querySelector('[data-dupact=first]').focus();
  }

  function entryRow(e, L, R, noMove) {
    const nr = L.slotOf[e.id];
    const iss = R.byEntry[e.id] || [];
    const has = c => iss.find(i => i.code === c);
    const k = M.entryShort(e);
    const kBad = has('nameLang') || has('nameZeichen') || has('nameLeer');
    const fBad = has('freq');
    const np = L.notPlaced.find(x => x.e.id === e.id);
    const prioRank = np && (np.why === 'voll' || np.why === 'max') ? L.prio.filter(id => { const x = cfg.eintraege.find(y => y.id === id); return x && x.block === e.block; }).indexOf(e.id) + 1 : 0;
    const ad = M.hasIcao(e);
    const seg = ad ? `<div class="seg small" role="group" aria-label="${esc(t('st_adloc'))}"><button type="button" data-act="kmode" data-v="icao" aria-pressed="${e.kurzModus === 'icao'}" title="${esc(t('ed_icao_btn'))}">${esc(e.ort.icao)}</button><button type="button" data-act="kmode" data-v="kurz" aria-pressed="${e.kurzModus === 'kurz'}" title="${esc(t('ed_short_btn'))}">${esc(M.kurzLoc(e))}</button></div>` : '';
    const qcls = { g: 'g', y: 'y', r: e.bestaetigt ? 'y' : 'r', s: '' }[e.vertrauen] || '';
    const qtxt = e.vertrauen === 'g' ? t('q_g', { n: (e.quellen || []).length }) : e.vertrauen === 'y' ? t('q_y') : e.vertrauen === 'r' ? t('q_r') : t('q_s');
    const qtitle = [(e.quellen || []).join(', '), e.note].filter(Boolean).join(' – ');
    const extra = iss.filter(i => !['eineQuelle', 'widerspruch'].includes(i.code)).map(i => `<div class="small" style="color:${i.lvl === 'r' ? 'var(--red)' : 'var(--warn-fg)'}">${esc(t('iss_' + i.code, { a: i.arg }))}</div>`).join('');
    const conf = e.vertrauen === 'r' ? (e.bestaetigt
      ? ` <button type="button" class="ghost small" data-act="unconfirm" title="${esc(t('ed_unconfirm'))}">✓ ${t('ed_confirmed')}</button>`
      : ` <button type="button" class="sec small" data-act="confirm" style="min-height:26px;padding:2px 8px">${t('ed_confirm')}</button>`) : '';
    const dist = e.dist != null ? e.dist + ' km' : e.lage ? t('lage_' + e.lage) : '–';
    return `<tr data-id="${e.id}" class="${e.aktiv ? '' : 'off'}">
<td class="mv">${noMove ? '' : `<span class="handle" data-drag draggable="true" title="${esc(t('col_move'))}"><span aria-hidden="true">⋮⋮</span></span><button type="button" class="ghost" data-act="up" aria-label="${esc(t('ed_up'))}">▲</button><button type="button" class="ghost" data-act="down" aria-label="${esc(t('ed_down'))}">▼</button>`}</td>
<td class="nr">${nr != null ? pad2(nr) : prioRank ? `<span class="ptag" title="${esc(t('ed_prio_tip'))}">P${prioRank}</span>` : '–'}${np && np.why === 'ohneBlock' ? `<span class="ptag warn" title="${esc(t('why_ohneBlock'))}">!</span>` : ''}</td>
<td><input type="checkbox" data-f="aktiv" class="${prioRank ? 'prio' : ''}" ${e.aktiv ? 'checked' : ''} aria-label="${esc(t('col_on'))} ${esc(k)}${prioRank ? ' – ' + esc(t('ed_prio')) : ''}" title="${prioRank ? esc(t('ed_prio_tip')) : ''}"></td>
<td><div class="kcell"><input type="text" data-f="kurz" value="${esc(k)}" maxlength="8" spellcheck="false" autocomplete="off" autocapitalize="characters" data-kname class="${kBad ? 'bad' : ''}" aria-label="${esc(t('col_k'))}" title="${e.kurzModus === 'frei' ? esc(t('ed_free_name')) : ''}"><span class="kcount${k.length > 8 ? ' bad' : ''}">${k.length}/8</span>${seg}</div></td>
<td><input type="text" class="freq${fBad ? ' bad' : ''}" data-f="ch" value="${esc(e.ch)}" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="${esc(t('col_f'))}"></td>
<td><input type="text" class="klar" data-f="klar" value="${esc(e.klar)}" aria-label="${esc(t('col_t'))}"></td>
<td><select class="svc" data-f="dienst" aria-label="${esc(t('col_d'))}">${svcOptions(e.dienst)}</select></td>
<td class="small muted" style="white-space:nowrap">${esc(dist)}</td>
<td class="small">${(e.quellen || []).includes('eigen') ? `<input type="text" class="mono" data-f="cc" value="${esc(M.ccOf(e))}" maxlength="2" style="width:42px;text-transform:uppercase" aria-label="${esc(t('col_cc'))}">` : `<span class="mono">${esc(M.ccOf(e) || '–')}</span>`}</td>
<td class="q"><div class="qrow"><span class="badge ${qcls}" title="${esc(qtitle)}">${esc(qtxt)}</span>${conf}<button type="button" class="ghost" data-act="del" aria-label="${esc(t('ed_del'))}" title="${esc(t('ed_del'))}">×</button></div>${extra}</td>
</tr>`;
  }

  function entryOf(el) { const tr = el.closest('tr[data-id]'); return tr ? cfg.eintraege.find(e => e.id === tr.dataset.id) : null; }

  /** Selektor, der ein Bedienelement nach dem Neuzeichnen wiederfindet. */
  function selectorOf(a) {
    if (!a || !a.closest || a === document.body) return null;
    if (a.id) return '#' + a.id;
    const row = a.closest('tr[data-id], tr[data-bid]');
    const scope = row ? (row.dataset.id ? `tr[data-id="${row.dataset.id}"] ` : `tr[data-bid="${row.dataset.bid}"] `) : '';
    for (const k of ['f', 'fx', 'fxe', 'st', 'b']) if (a.dataset[k]) return scope + `[data-${k}="${a.dataset[k]}"]` + (a.type === 'radio' ? `[value="${a.value}"]` : '');
    if (a.dataset.act) return scope + `[data-act="${a.dataset.act}"]` + (a.dataset.v ? `[data-v="${a.dataset.v}"]` : '') + (a.dataset.svc ? `[data-svc="${a.dataset.svc}"]` : '');
    return null;
  }
  /** Nach einer Änderung neu zeichnen und den Fokus dorthin zurücksetzen, wo er hinwanderte. */
  function afterChange(fn) {
    saveDraft();
    setTimeout(() => {
      const sel = selectorOf(document.activeElement);
      fn();
      const el = sel && document.querySelector(sel);
      if (el) el.focus();
    }, 0);
  }

  async function onEditorClick(ev) {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, e = entryOf(b);
    if (act === 'filter') { ui.filter = b.dataset.v; pageEditor(); return; }
    if (act === 'colsort') { const by = b.dataset.v; ui.sort = { by, dir: ui.sort.by === by ? -ui.sort.dir : 1 }; if (by === 'nr') ui.sort.dir = 1; $('#edhead').innerHTML = edHead(); edRefresh(); return; }
    if (act === 'colreset') { ui.colF = { k: '', dx: [], ccx: [] }; ui.sort = { by: 'nr', dir: 1 }; closeFilter(); applyFilter(); return; }
    if (act === 'fopen') { if ($('#fpop') && $('#fpop').getAttribute('aria-label') === t('ed_f_' + b.dataset.v)) closeFilter(); else openFilter(b); return; }
    if (act === 'fall' || act === 'fnone') {
      const c = b.dataset.v, all = [...document.querySelectorAll(`#fpop [data-fchk="${c}"]`)];
      all.forEach(x => { x.checked = act === 'fall'; }); ui.colF[c + 'x'] = act === 'fall' ? [] : all.map(x => x.value); applyFilter(); return;
    }
    if (act === 'up' || act === 'down') { if (M.moveEntry(cfg, e.id, act === 'up' ? -1 : 1)) afterChange(edRefresh); return; }
    if (act === 'kmode') { e.kurzModus = b.dataset.v; e.kurz = M.entryShort(e); afterChange(edRefresh); return; }
    if (act === 'confirm' || act === 'unconfirm') { e.bestaetigt = act === 'confirm'; afterChange(edRefresh); return; }
    if (act === 'del') { const k = M.entryShort(e) || e.ch; cfg.eintraege = cfg.eintraege.filter(x => x !== e); M.renumber(cfg, e.block); msg(t('m_removed', { k }), 'info'); afterChange(edRefresh); return; }
    if (act === 'sort') { const blk = M.blockById(cfg, b.dataset.b); M.sortBlock(cfg, blk.id); msg(t('ed_sorted', { b: blk.name, r: t('ord_' + blk.order) }), 'info'); afterChange(edRefresh); return; }
    if (act === 'bring') {
      const x = cfg.eintraege.find(y => y.id === b.dataset.id);
      const target = cfg.bloecke.find(y => y.on && y.svc.includes(x.dienst)) || cfg.bloecke.find(y => y.on);
      if (target) { M.moveTo(cfg, x.id, target.id, Infinity); x.aktiv = true; msg(t('m_brought', { k: M.entryShort(x) || x.ch, b: target.name }), 'ok'); afterChange(edRefresh); }
      return;
    }
    if (act === 'dups') { dupDialog(); return; }
    if (act === 'own') {
      // nach der Zeile, in der der Cursor zuletzt stand; sonst am Ende des gefilterten oder ersten Blocks
      const cur = ui.lastRow && cfg.eintraege.find(x => x.id === ui.lastRow);
      const curBlk = cur && M.blockById(cfg, cur.block);
      const blk = (curBlk && curBlk.on ? curBlk : null) || (ui.filter && M.blockById(cfg, ui.filter)) || cfg.bloecke.find(y => y.on) || cfg.bloecke[0];
      const ne = M.addEntry(cfg, { ch: '', dienst: blk.svc[0] || 'OTH', block: blk.id, kurz: '', kurzModus: 'frei' }, cur && cur.block === blk.id ? cur.id : null);
      ui.lastRow = ne.id;
      saveDraft(); edRefresh();
      const inp = document.querySelector(`tr[data-id="${ne.id}"] [data-f="kurz"]`); if (inp) { inp.scrollIntoView({ block: 'center' }); inp.focus(); }
      return;
    }
    if (act === 'allmode') {
      let n = 0; for (const x of cfg.eintraege) if (M.hasIcao(x)) { x.kurzModus = b.dataset.v; x.kurz = M.entryShort(x); n++; }
      msg(t('st_applied', { n, m: b.dataset.v === 'icao' ? t('st_adloc_icao') : t('st_adloc_short') }), 'ok'); afterChange(edRefresh); return;
    }
    if (act === 'e99') { ev.preventDefault(); await toggle99(); edRefresh(); return; }
    if (act === 'new') { if (await ask(t('m_ask_new'), '', t('yes'))) { cfg = M.defaultConfig(); saveDraft(true); msg(t('m_new'), 'ok'); render(); } return; }
    if (act === 'sample') { if (await ask(t('m_ask_new'), '', t('yes'))) { cfg = S.sampleConfig(); saveDraft(true); msg(t('m_sample'), 'ok'); render(); } return; }
    if (act === 'srvsave') { srvSave(); return; }
    if (act === 'saveas') { download(`krt2_${slug(cfg.name)}_${stamp()}.json`, M.toJSON(cfg)); return; }
    if (act === 'csv') { download(`krt2_${slug(cfg.name)}_${stamp()}.csv`, '﻿' + M.toCSV(cfg), 'text/csv;charset=utf-8'); return; }
    if (act === 'load') { $('#file').click(); return; }
  }

  function onEditorChange(ev) {
    const el = ev.target;
    if (el.dataset.fchk) { const c = el.dataset.fchk; ui.colF[c + 'x'] = [...document.querySelectorAll(`#fpop [data-fchk="${c}"]`)].filter(x => !x.checked).map(x => x.value); applyFilter(); return; }
    if (el.id === 'cname') { cfg.name = el.value.trim(); saveDraft(); const b = $('#savestate'); if (b) { b.textContent = saveState(); b.className = 'badge' + (cfg.server ? ' y' : ''); } return; }
    if (el.id === 'file') return;
    const f = el.dataset.f; if (!f) return;
    const e = entryOf(el); if (!e) return;
    if (f === 'aktiv') e.aktiv = el.checked;
    else if (f === 'kurz') { e.kurzModus = 'frei'; e.kurz = el.value.toUpperCase().replace(/\s+$/, ''); }
    else if (f === 'ch') { const r = C.encodeFreq(el.value); e.ch = r.ok ? r.display : el.value.trim(); }
    else if (f === 'klar') e.klar = el.value;
    else if (f === 'cc') e.ort = Object.assign({}, e.ort, { cc: el.value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) });
    else if (f === 'dienst') { e.dienst = el.value; if (e.kurzModus !== 'frei') e.kurz = M.entryShort(e); saveDraft(); checkBlockFit(e); return; }
    afterChange(edRefresh);
  }

  /** Passt der Dienst nicht in den Block, fragen: belassen oder in den passenden Block verschieben. */
  async function checkBlockFit(e) {
    const blk = M.blockById(cfg, e.block);
    if (!blk || blk.svc.includes(e.dienst)) { afterChange(edRefresh); return; }
    const target = cfg.bloecke.find(b => b.on && b.svc.includes(e.dienst)) || cfg.bloecke.find(b => b.svc.includes(e.dienst));
    const k = M.entryShort(e) || e.ch || '–';
    if (target) {
      if (await ask(t('bf_title', { s: e.dienst }), t('bf_body', { k, s: e.dienst, b: blk.name, z: target.name }) + (target.on ? '' : ' ' + t('bf_off', { z: target.name })), t('bf_move', { z: target.name }), t('bf_keep', { b: blk.name }), 'go')) {
        M.moveTo(cfg, e.id, target.id, Infinity); msg(t('m_brought', { k, b: target.name }), 'ok');
      }
    } else if (await ask(t('bf_title', { s: e.dienst }), t('bf_none', { k, s: e.dienst, b: blk.name }), t('bf_add', { s: e.dienst, b: blk.name }), t('bf_keep', { b: blk.name }), 'go')) {
      blk.svc.push(e.dienst); msg(t('m_svc_added', { s: e.dienst, b: blk.name }), 'ok');
    }
    saveDraft(); edRefresh();
  }

  function onKurzInput(ev) {
    const el = ev.target; if (el.dataset.f !== 'kurz') return;
    const c = el.parentNode.querySelector('.kcount'); const n = el.value.length;
    c.textContent = n + '/8'; c.classList.toggle('bad', n > 8);
  }

  // Ziehen und Ablegen an der Griffleiste (einmal am Dokument, wirkt in der Editortabelle)
  let dragId = null;
  const inEd = ev => ev.target.closest && ev.target.closest('#edt');
  function clearDrag() { document.querySelectorAll('.drop-before,.dragging').forEach(x => x.classList.remove('drop-before', 'dragging')); }
  document.addEventListener('dragstart', ev => {
    const h = inEd(ev) && ev.target.closest('[data-drag]'); if (!h) return;
    const tr = h.closest('tr[data-id]'); dragId = tr.dataset.id; tr.classList.add('dragging');
    ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', dragId);
    try { ev.dataTransfer.setDragImage(tr, 20, 20); } catch (e) { /* Vorschau egal */ }
  });
  document.addEventListener('dragover', ev => {
    if (!dragId || !inEd(ev)) return; const tr = ev.target.closest('tr[data-id], tr[data-block]'); if (!tr) return;
    ev.preventDefault(); document.querySelectorAll('.drop-before').forEach(x => x.classList.remove('drop-before')); tr.classList.add('drop-before');
  });
  document.addEventListener('drop', ev => {
    if (!dragId || !inEd(ev)) return; ev.preventDefault();
    const tr = ev.target.closest('tr[data-id], tr[data-block]');
    if (tr && tr.dataset.id !== dragId) {
      if (tr.dataset.id) { const tgt = cfg.eintraege.find(x => x.id === tr.dataset.id); const idx = M.entriesOf(cfg, tgt.block).filter(x => x.id !== dragId).indexOf(tgt); M.moveTo(cfg, dragId, tgt.block, idx); }
      else if (tr.dataset.block === '__free') { const last = cfg.bloecke.filter(b => b.on).slice(-1)[0]; if (last) M.moveTo(cfg, dragId, last.id, Infinity); }
      else M.moveTo(cfg, dragId, tr.dataset.block, 0);
      saveDraft();
    }
    dragId = null; clearDrag(); edRefresh();
  });
  document.addEventListener('dragend', () => { dragId = null; clearDrag(); });

  async function toggle99() {
    const p = cfg.fixed.p99;
    if (!p.on) { p.on = true; saveDraft(); msg(t('e99_on'), 'ok'); return; }
    if (!(await ask(t('e99_t1'), t('e99_b1'), t('e99_yes')))) return;
    if (!(await ask(t('e99_t2'), t('e99_b2'), t('e99_yes2')))) return;
    p.on = false; saveDraft(); msg(t('e99_off'), 'warn');
  }

  // ---------- Einstellungen ----------
  function pageEinst() {
    const L = M.layout(cfg);
    const st = cfg.settings;
    st.area = Object.assign({ von: 'GND', bis: 'FL195', radar: false, marginKm: 10 }, st.area || {});
    // Belegungsstreifen: Platz für Platz, gleiche Nachbarn zusammengefasst (feste Plätze können mitten in einem Block liegen)
    const segs = [], shades = ['#1f5fbf', '#174a95', '#3b4a5c', '#2f6f8f', '#5b6b7f', '#255a3c'];
    const kindAt = n => { const x = L.slots[n]; if (x.kind === 'fixed') return n === 99 ? 'e' : 'f:' + n; if (x.kind === 'free') return 'free'; return 'b:' + x.block; };
    for (let n = 0; n <= 99; n++) {
      const k = kindAt(n), last = segs[segs.length - 1];
      if (last && last.k === k && !k.startsWith('f:')) { last.n++; last.to = n; continue; }
      const x = L.slots[n], bi = cfg.bloecke.findIndex(b => 'b:' + b.id === k);
      segs.push(k === 'e' ? { k, n: 1, from: n, to: n, label: '99', bg: '#c0392b', fg: '#fff', tip: 'EMERGENC 121.500' }
        : k.startsWith('f:') ? { k, n: 1, from: n, to: n, label: pad2(n), bg: '#14202e', fg: '#fff', tip: t('blk_fixed') + ': ' + x.kurz + ' ' + x.ch }
        : k === 'free' ? { k, n: 1, from: n, to: n, cls: 'gap', name: t('blk_free').toLowerCase(), tip: cfg.settings.free.ch + ' ' + cfg.settings.free.kurz }
        : { k, n: 1, from: n, to: n, bg: shades[bi % shades.length], fg: '#fff', name: (cfg.bloecke[bi] || {}).name || '–' });
    }
    segs.forEach(sg => { if (sg.name) { sg.label = sg.name + ' ' + range(sg.from, sg.to); sg.tip = sg.tip || sg.label; } });
    if (!cfg.fixed.p99.on) segs[segs.length - 1].tip = t('st_off99');
    const blockRow = (b, i) => {
      const rest = M.servicesOf(cfg).filter(s => !b.svc.includes(s));
      return `<tr data-bid="${b.id}" class="${b.on ? '' : 'off'}">
<td class="mv"><button type="button" class="ghost" data-act="bup" aria-label="${esc(t('ed_up'))}" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" class="ghost" data-act="bdown" aria-label="${esc(t('ed_down'))}" ${i === cfg.bloecke.length - 1 ? 'disabled' : ''}>▼</button></td>
<td><input type="checkbox" data-b="on" ${b.on ? 'checked' : ''} aria-label="${esc(t('col_on'))} ${esc(b.name)}"></td>
<td><input type="text" data-b="name" value="${esc(b.name)}" aria-label="${esc(t('st_block'))}" style="width:130px;font-weight:600"></td>
<td><div class="row" style="gap:6px">${b.svc.map(s => `<span class="tag">${s}<button type="button" data-act="svcdel" data-svc="${s}" aria-label="${s} ×">×</button></span>`).join('')}
  <select data-b="svcadd" aria-label="${esc(t('st_svc'))} +" style="min-height:28px;padding:2px 6px"><option value="">+</option>${rest.map(s => `<option>${s}</option>`).join('')}</select></div></td>
<td><div class="row nowrap" style="gap:6px"><input type="number" min="1" max="98" data-b="max" value="${b.max == null ? '' : b.max}" placeholder="${esc(t('st_all'))}" aria-label="${esc(t('st_max'))}" style="width:70px"><span class="small muted">${t('st_places')}</span></div></td>
<td><select data-b="order" aria-label="${esc(t('st_order'))}">${M.ORDERS.map(o => `<option value="${o}"${o === b.order ? ' selected' : ''}>${t('ord_' + o)}</option>`).join('')}</select></td>
<td><button type="button" class="ghost" data-act="bdel" aria-label="${esc(t('st_del_block'))}" title="${esc(t('st_del_block'))}">×</button></td></tr>`;
    };
    const p0 = cfg.fixed.p00, p9 = cfg.fixed.p99;
    $('#page').innerHTML = `
<h1>${t('st_title')}</h1>
<section class="card stack"><span class="label">${t('st_alloc')}</span>
  <div class="alloc">${segs.map(s => `<div class="${s.cls || ''}" title="${esc(s.tip)}" style="flex:${s.n} 1 0;${s.bg ? `background:${s.bg};color:${s.fg}` : ''}">${esc(s.label)}</div>`).join('')}</div>
  <p class="note">${t('st_alloc_note')}</p></section>
<section class="card stack"><span class="label">${t('st_fixed')}</span>
  <div class="fixedgrid">
    <span class="mono muted">00</span>
    <input type="text" class="mono" data-fx="p00.ch" value="${esc(p0.ch)}" aria-label="${esc(t('col_f'))} 00" ${p0.on ? '' : 'disabled'}>
    <input type="text" class="mono" data-fx="p00.kurz" value="${esc(p0.kurz)}" maxlength="8" spellcheck="false" autocomplete="off" autocapitalize="characters" data-kname aria-label="${esc(t('col_k'))} 00" ${p0.on ? '' : 'disabled'}>
    <input type="text" data-fx="p00.klar" value="${esc(p0.klar)}" aria-label="${esc(t('col_t'))} 00" ${p0.on ? '' : 'disabled'}>
    <button type="button" class="sec" data-act="p00">${p0.on ? t('st_release') : t('st_take')}</button>
    <span class="mono muted">99</span><span class="mono" style="font-weight:600">${esc(p9.ch)}</span><span class="mono" style="font-weight:600">${esc(p9.kurz)}</span><span>${esc(p9.klar)} <span class="small muted">· ${p9.on ? t('st_always') : t('st_off99')}</span></span>
    <button type="button" class="${p9.on ? 'danger' : 'sec'}" data-act="p99">${p9.on ? t('e99_yes') : t('st_take')}</button>
    ${cfg.fixed.extra.map(x => `<input type="number" min="1" max="98" class="mono" data-fxe="${esc(x.id)}.nr" value="${esc(String(x.nr).padStart(2, '0'))}" aria-label="${esc(t('st_fx_nr'))}" style="width:64px">
    <input type="text" class="mono" data-fxe="${esc(x.id)}.ch" value="${esc(x.ch)}" placeholder="123.455" aria-label="${esc(t('col_f'))} ${pad2(x.nr)}">
    <input type="text" class="mono" data-fxe="${esc(x.id)}.kurz" value="${esc(x.kurz)}" maxlength="8" spellcheck="false" autocomplete="off" autocapitalize="characters" data-kname placeholder="CREW" aria-label="${esc(t('col_k'))} ${pad2(x.nr)}">
    <input type="text" data-fxe="${esc(x.id)}.klar" value="${esc(x.klar)}" placeholder="${esc(t('st_fx_klar_ph'))}" aria-label="${esc(t('col_t'))} ${pad2(x.nr)}">
    <button type="button" class="ghost" data-act="fxdel" data-id="${esc(x.id)}" aria-label="${esc(t('st_fx_del'))} ${pad2(x.nr)}" title="${esc(t('st_fx_del'))}">×</button>`).join('')}
  </div>
  <div class="row"><button type="button" class="sec" data-act="fxadd">${t('st_fx_add')}</button></div>
  <p class="note">${t('st_fx_note')}</p></section>
<section class="card stack"><div class="spread"><span class="label">${t('st_blocks')}</span><button type="button" class="sec" data-act="badd">${t('st_add_block')}</button></div>
  <div style="overflow-x:auto"><table class="grid"><thead><tr><th><span class="sr">${t('col_move')}</span></th><th>${t('col_on')}</th><th>${t('st_block')}</th><th>${t('st_svc')}</th><th>${t('st_max')}</th><th>${t('st_order')}</th><th></th></tr></thead>
  <tbody>${cfg.bloecke.map(blockRow).join('')}</tbody></table></div></section>
<section class="card stack"><div class="spread"><span class="label">${t('sv_title')}</span>
  <div class="row"><button type="button" class="sec" data-act="svc-sort">${t('sv_sort')}</button><button type="button" class="sec" data-act="svc-reset">${t('sv_reset')}</button>
  <form class="row" data-form="svcadd"><label class="sr" for="svcnew">${t('sv_new')}</label><input id="svcnew" type="text" maxlength="6" placeholder="${esc(t('sv_new_ph'))}" style="width:110px;text-transform:uppercase" class="mono" required><button type="submit" class="sec">${t('sv_add')}</button></form></div></div>
  <div class="row" style="gap:6px">${M.servicesOf(cfg).map((s, i, a) => `<span class="tag" data-svc="${esc(s)}"><button type="button" data-act="svc-up" aria-label="${esc(s)} ${esc(t('ed_up'))}" ${i === 0 ? 'disabled' : ''}>‹</button><b class="mono">${esc(s)}</b><button type="button" data-act="svc-down" aria-label="${esc(s)} ${esc(t('ed_down'))}" ${i === a.length - 1 ? 'disabled' : ''}>›</button><button type="button" data-act="svc-del" aria-label="${esc(s)} ×">×</button></span>`).join('')}</div>
  <p class="note">${t('sv_note')}</p></section>
<div class="settings-3">
  <section class="card stack"><span class="label">${t('st_freeslots')}</span>
    <div class="row"><input type="text" class="mono" data-st="free.ch" value="${esc(st.free.ch)}" aria-label="${esc(t('col_f'))} ${esc(t('fixed_free'))}" style="width:100px"><input type="text" class="mono" data-st="free.kurz" value="${esc(st.free.kurz)}" maxlength="8" spellcheck="false" autocomplete="off" autocapitalize="characters" data-kname aria-label="${esc(t('col_k'))} ${esc(t('fixed_free'))}" style="width:110px"></div>
    <p class="note">${t('st_free_note')}</p></section>
  <section class="card stack"><span class="label">${t('st_names')}</span>
    <span>${t('st_names_rule')}</span><span class="mono small" style="font-weight:600">LSZF AF · LSZH T · LSZH AT · ZURICH I · ZRCH E R</span>
    <span class="small">${t('st_adloc')}</span>
    <label><input type="radio" name="adloc" data-st="adLoc" value="kurz" ${st.adLoc !== 'icao' ? 'checked' : ''}> ${t('st_adloc_short')} <span class="mono small muted">ZURICH T · BRFLD AF</span></label>
    <label><input type="radio" name="adloc" data-st="adLoc" value="icao" ${st.adLoc === 'icao' ? 'checked' : ''}> ${t('st_adloc_icao')} <span class="mono small muted">LSZH T · LSZF AF</span></label>
    <div><button type="button" class="sec" data-act="applyall">${t('st_apply_all')}</button></div>
    <p class="note">${t('st_names_note')}</p>
    <label><input type="checkbox" data-st="allowDigits" ${st.allowDigits ? 'checked' : ''}> ${t('st_digits')} <span class="small muted">${t('st_digits_note')}</span></label></section>
  <section class="card stack"><span class="label">${t('st_area')}</span>
    <div class="row"><span>${t('st_band')}</span><input type="text" class="mono" data-st="area.von" value="${esc(st.area.von)}" style="width:80px" aria-label="${esc(t('st_band'))} von"><span>–</span><input type="text" class="mono" data-st="area.bis" value="${esc(st.area.bis)}" style="width:90px" aria-label="${esc(t('st_band'))} bis"></div>
    <label><input type="checkbox" data-st="area.radar" ${st.area.radar ? 'checked' : ''}> ${t('st_radar')}</label>
    <div class="row"><label for="margin">${t('st_margin')}</label><input id="margin" type="number" min="0" max="100" data-st="area.marginKm" value="${esc(st.area.marginKm)}" style="width:80px"></div></section>
</div>
${footerNote()}`;
  }

  async function onEinstClick(ev) {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    const tr = b.closest('tr[data-bid]'); const blk = tr && M.blockById(cfg, tr.dataset.bid);
    if (act === 'p00') { cfg.fixed.p00.on = !cfg.fixed.p00.on; }
    else if (act === 'fxadd') {
      const used = new Set(cfg.fixed.extra.map(x => Number(x.nr)));
      let nr = 1; while (nr <= 98 && used.has(nr)) nr++;
      if (nr > 98) { msg(t('st_fx_full'), 'warn'); return; }
      cfg.fixed.extra.push({ id: M.uid('fx'), nr, ch: '', kurz: '', klar: '' });
      cfg.fixed.extra.sort((a, c) => a.nr - c.nr);
      msg(t('st_fx_added', { n: pad2(nr) }), 'info');
    }
    else if (act === 'fxdel') { const x = cfg.fixed.extra.find(y => y.id === b.dataset.id); cfg.fixed.extra = cfg.fixed.extra.filter(y => y.id !== b.dataset.id); if (x) msg(t('st_fx_deleted', { n: pad2(x.nr) }), 'info'); }
    else if (act === 'p99') { await toggle99(); }
    else if (act === 'bup' || act === 'bdown') { const i = cfg.bloecke.indexOf(blk), j = i + (act === 'bup' ? -1 : 1); if (j < 0 || j >= cfg.bloecke.length) return; [cfg.bloecke[i], cfg.bloecke[j]] = [cfg.bloecke[j], cfg.bloecke[i]]; }
    else if (act === 'svcdel') { blk.svc = blk.svc.filter(s => s !== b.dataset.svc); }
    else if (act === 'badd') { cfg.bloecke.push({ id: M.uid('b'), name: 'BLOCK', on: true, svc: [], max: null, order: 'dist' }); }
    else if (act === 'bdel') { const n = cfg.eintraege.filter(e => e.block === blk.id).length; if (n) { msg(t('st_block_notempty', { b: blk.name, n }), 'warn'); return; } cfg.bloecke = cfg.bloecke.filter(x => x !== blk); }
    else if (act === 'svc-up' || act === 'svc-down' || act === 'svc-del' || act === 'svc-sort' || act === 'svc-reset') {
      const st = cfg.settings; st.services = M.servicesOf(cfg).slice();
      const code = (b.closest('[data-svc]') || { dataset: {} }).dataset.svc;
      const i = st.services.indexOf(code);
      if (act === 'svc-sort') st.services.sort();
      else if (act === 'svc-reset') { st.services = M.SERVICES.slice(); cfg.eintraege.forEach(e => { if (!st.services.includes(e.dienst)) st.services.push(e.dienst); }); }
      else if (act === 'svc-del') {
        const n = cfg.eintraege.filter(e => e.dienst === code).length;
        if (n) { msg(t('sv_in_use', { s: code, n }), 'warn'); return; }
        st.services.splice(i, 1); cfg.bloecke.forEach(bl => { bl.svc = bl.svc.filter(x => x !== code); });
      } else { const j = i + (act === 'svc-up' ? -1 : 1); if (j < 0 || j >= st.services.length) return; [st.services[i], st.services[j]] = [st.services[j], st.services[i]]; }
    }
    else if (act === 'applyall') { let n = 0; for (const x of cfg.eintraege) if (M.hasIcao(x)) { x.kurzModus = cfg.settings.adLoc; x.kurz = M.entryShort(x); n++; } msg(t('st_applied', { n, m: cfg.settings.adLoc === 'icao' ? t('st_adloc_icao') : t('st_adloc_short') }), 'ok'); }
    else return;
    afterChange(pageEinst);
  }

  function onEinstChange(ev) {
    const el = ev.target;
    const set = (obj, path, v) => { const p = path.split('.'); let o = obj; while (p.length > 1) o = o[p.shift()]; o[p[0]] = v; };
    if (el.dataset.fx) {
      let v = el.value;
      if (el.dataset.fx.endsWith('.ch')) { const r = C.encodeFreq(v); v = r.ok ? r.display : v.trim(); }
      if (el.dataset.fx.endsWith('.kurz')) v = v.toUpperCase();
      set(cfg.fixed, el.dataset.fx, v);
    } else if (el.dataset.fxe) {
      const [id, k] = el.dataset.fxe.split('.'), x = cfg.fixed.extra.find(y => y.id === id); if (!x) return;
      let v = el.value;
      if (k === 'nr') {
        const n = parseInt(v, 10);
        if (!(n >= 1 && n <= 98) || cfg.fixed.extra.some(y => y !== x && Number(y.nr) === n)) { msg(t('st_fx_nr_bad', { n: v }), 'warn'); el.value = pad2(x.nr); return; }
        x.nr = n; cfg.fixed.extra.sort((a, c) => a.nr - c.nr);
      } else {
        if (k === 'ch') { const r = C.encodeFreq(v); v = r.ok ? r.display : v.trim(); }
        if (k === 'kurz') v = v.toUpperCase();
        x[k] = v;
      }
    } else if (el.dataset.st) {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.st === 'free.ch') { const r = C.encodeFreq(v); v = r.ok ? r.display : String(v).trim(); }
      if (el.dataset.st === 'free.kurz') v = String(v).toUpperCase();
      if (el.dataset.st === 'area.marginKm') v = Math.max(0, Number(v) || 0);
      set(cfg.settings, el.dataset.st, v);
    } else if (el.dataset.b) {
      const blk = M.blockById(cfg, el.closest('tr[data-bid]').dataset.bid);
      const k = el.dataset.b;
      if (k === 'on') blk.on = el.checked;
      else if (k === 'name') blk.name = el.value.trim().toUpperCase() || 'BLOCK';
      else if (k === 'max') { const n = parseInt(el.value, 10); blk.max = n > 0 ? n : null; }
      else if (k === 'order') blk.order = el.value;
      else if (k === 'svcadd' && el.value) { if (!blk.svc.includes(el.value)) blk.svc.push(el.value); }
    } else return;
    afterChange(pageEinst);
  }

  // ---------- A6-Karte ----------
  /** Ausdruck auf 2 × A6 quer (Vorder- und Rückseite zum Laminieren): Seite 1 Plätze 00–49, Seite 2 Plätze 50–99,
      je zwei Spalten à 25 Zeilen mit Platz, Kurzname, Frequenz, Klartext und Land. */
  const CROP = ['tl', 'tr', 'bl', 'br'].map(c => `<i class="cm h ${c}"></i><i class="cm v ${c}"></i>`).join('');
  function pageKarte() {
    const dev = ui.device && ui.device.id === ui.deviceSel && ui.device.aktuell && ui.device.aktuell.plaetze ? ui.device : null;
    let D, starts = new Set(), freeSet = new Set(), title, sub;
    if (dev) {
      const a = dev.aktuell;
      D = a.plaetze.map(p => ({ nr: p.nr, ch: p.ch, name: String(p.name || ''), klar: p.klar || '', cc: p.cc || '' }));
      groupsFromDevice(a.plaetze).forEach(g => { starts.add(g.rows[0].nr); if (g.free) g.rows.forEach(r => freeSet.add(r.nr)); });
      title = dev.bezeichnung + (a.configName ? ' · «' + a.configName + '»' + (a.version ? ' v' + a.version : '') : '');
      sub = t(a.herkunft === 'ausgelesen' ? 'cur_read_from' : 'a6_programmed') + ' ' + fmtDT(new Date(a.zeit));
    } else {
      const L = M.layout(cfg);
      D = M.deviceSlots(cfg, L);
      groupsFromLayout(L).forEach(g => starts.add(g.rows[0].nr));
      L.slots.forEach(x => { if (x.kind === 'free') freeSet.add(x.nr); });
      title = '«' + (cfg.name || '–') + '»' + (cfg.server ? ' v' + cfg.server.version : '');
      sub = t('a6_draft') + ' · ' + fmtDT(new Date());
    }
    // Blockname je Platz; erscheint klein auf der Trennlinie, wo ein Block beginnt, und oben in jeder Spalte
    const blockAt = {};
    if (dev) groupsFromDevice(dev.aktuell.plaetze).forEach(g => g.rows.forEach(r => { blockAt[r.nr] = g.name; }));
    else groupsFromLayout(M.layout(cfg)).forEach(g => g.rows.forEach(r => { blockAt[r.nr] = g.name; }));
    // Blockname auf der Höhe des ersten Eintrags (dunkelgrau); oben in einer Spalte als Fortsetzung («RADAR …», hellgrau)
    const label = d => (d.nr % 25 === 0 || blockAt[d.nr] !== blockAt[d.nr - 1]) ? `<span class="bl${d.nr % 25 === 0 && blockAt[d.nr] === blockAt[d.nr - 1] ? ' cont' : ''}">${esc(blockAt[d.nr] || '')}${d.nr % 25 === 0 && blockAt[d.nr] === blockAt[d.nr - 1] ? ' …' : ''}</span>` : '<span></span>';
    const row = d => `<div class="r${freeSet.has(d.nr) ? ' free' : ''}${blockAt[d.nr] !== blockAt[d.nr - 1] && d.nr % 25 ? ' start' : ''}${d.nr === 99 && d.ch === '121.500' ? ' emerg' : ''}"><span class="n">${pad2(d.nr)}</span><span class="k">${freeSet.has(d.nr) ? '' : esc(String(d.name).trimEnd())}</span><b>${freeSet.has(d.nr) ? '' : esc(d.ch)}</b><span class="t">${freeSet.has(d.nr) ? '' : esc(d.klar)}</span>${label(d)}<span class="c">${freeSet.has(d.nr) ? '' : esc(d.cc)}</span></div>`;
    const page = (p) => `<div class="a6" role="img" aria-label="${esc(t('a6_title'))} ${p + 1}/2">
  <div class="hd"><div><strong>${esc(title)}</strong><span>${esc(sub)} · ${t('a6_slots', { a: pad2(p * 50), b: pad2(p * 50 + 49) })} · ${p + 1}/2 · krt2.wicki.aero · ${t('a6_nosort')}</span></div><img src="./img/logo.png" alt="Wicki Partners Ballonteam"></div>
  <div class="cols">${[0, 1].map(c => `<div>${D.slice(p * 50 + c * 25, p * 50 + c * 25 + 25).map(row).join('')}</div>`).join('')}</div>
</div>`;
    $('#page').innerHTML = `
<div class="spread"><h1>${t('a6_title')}</h1><div class="row"><a class="btn sec" href="#aktuell">← ${t('nav_aktuell')}</a><button type="button" data-act="print">${t('a6_print')}</button></div></div>
<p class="note">${t('a6_note')}</p>
<div class="a6wrap">${[0, 1].map(p => `<div class="a6cut">${CROP}${page(p)}</div>`).join('')}</div>`;
    $('#page').addEventListener('click', ev => { if (ev.target.closest('[data-act=print]')) window.print(); });
  }

  // ---------- Anmelden, Konto ----------
  /** Formular im Dialog; submit(form) wirft bei Fehler – die Meldung erscheint im Dialog. */
  function formDialog(title, inner, submitLabel, submit) {
    return new Promise(res => {
      const d = $('#dlg');
      d.innerHTML = `<form method="dialog" class="stack" style="gap:10px;min-width:min(420px,80vw)"><h2>${esc(title)}</h2>${inner}<p class="small" id="dlgerr" style="color:var(--red);margin:0" role="alert"></p>
<div class="row"><button type="button" class="sec" value="cancel">${t('cancel')}</button><button type="submit">${esc(submitLabel)}</button></div></form>`;
      const f = d.querySelector('form');
      d.querySelector('button[value=cancel]').addEventListener('click', () => { d.close(); res(false); });
      d.addEventListener('cancel', () => res(false), { once: true });
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
        try { await submit(f); d.close(); res(true); }
        catch (e) { $('#dlgerr').textContent = e.message; btn.disabled = false; }
      });
      d.showModal();
      const first = f.querySelector('input'); if (first) first.focus();
    });
  }
  const field = (id, label, type, extra) => `<label class="stack" style="align-items:stretch;gap:4px" for="${id}"><span class="small muted">${esc(label)}</span><input id="${id}" name="${id}" type="${type || 'text'}" ${extra || ''}></label>`;

  async function loginDialog() {
    let needed = false;
    try { needed = await API.setupNeeded(); } catch (e) { msg(t('m_api_err', { e: e.message }), 'err'); return; }
    if (needed) {
      await formDialog(t('su_title'), `<p class="note" style="margin:0">${t('su_note')}</p>` + field('su_name', t('acc_name'), 'text', 'value="Balthasar Wicki" autocomplete="name"') +
        field('su_pw', t('acc_pw_new'), 'password', 'autocomplete="new-password" required minlength="4"') + field('su_pw2', t('acc_pw_again'), 'password', 'autocomplete="new-password" required minlength="4"'),
      t('su_go'), async f => {
        if (f.su_pw.value !== f.su_pw2.value) throw new Error(t('acc_pw_mismatch'));
        await API.setup(f.su_pw.value, f.su_name.value);
        msg(t('m_su_done'), 'ok');
      });
    } else {
      await formDialog(t('login'), field('li_login', t('acc_login'), 'text', 'autocomplete="username" required autocapitalize="none" spellcheck="false"') +
        field('li_pw', t('acc_pw'), 'password', 'autocomplete="current-password" required'), t('login'), async f => {
        const u = await API.login(f.li_login.value, f.li_pw.value);
        msg(t('m_login', { n: u.name || u.login }), 'ok');
      });
    }
    render();
  }

  async function accountDialog() {
    const u = API.user;
    const d = $('#dlg');
    d.innerHTML = `<h2>${esc(u.name || u.login)}</h2><p class="note">${esc(u.login)} · ${u.role === 'super' ? t('acc_super') : t('acc_user')}</p>
<div class="row"><button type="button" class="sec" value="pw">${t('acc_change_pw')}</button><button type="button" class="danger" value="out">${t('logout')}</button><button type="button" class="sec" value="x">${t('m_close')}</button></div>`;
    const v = await new Promise(res => { d.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { d.close(); res(b.value); })); d.addEventListener('cancel', () => res('x'), { once: true }); d.showModal(); });
    if (v === 'out') { await API.logout(); msg(t('m_logout'), 'info'); render(); }
    if (v === 'pw') {
      await formDialog(t('acc_change_pw'), field('pw_old', t('acc_pw_old'), 'password', 'autocomplete="current-password" required') +
        field('pw_new', t('acc_pw_new'), 'password', 'autocomplete="new-password" required minlength="4"') + field('pw_new2', t('acc_pw_again'), 'password', 'autocomplete="new-password" required minlength="4"'),
      t('acc_change_pw'), async f => {
        if (f.pw_new.value !== f.pw_new2.value) throw new Error(t('acc_pw_mismatch'));
        await API.changePw(f.pw_old.value, f.pw_new.value); msg(t('m_pw_changed'), 'ok');
      });
    }
  }
  function needLogin() {
    if (!API.enabled) { pageLater('0.2.0', 'later_konfig'); return true; }
    if (API.user) return false;
    $('#page').innerHTML = `<section class="card stack"><h1>${t('need_login')}</h1><p style="margin:0">${t('need_login_note')}</p><div><button type="button" data-act="login">${t('login')}</button></div></section>${footerNote()}`;
    return true;
  }
  function randomPw() { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; const r = new Uint32Array(12); crypto.getRandomValues(r); return [...r].map(x => a[x % a.length]).join('').replace(/(.{4})(?=.)/g, '$1-'); }

  // ---------- Konfigurationen und Geräte ----------
  async function pageKonfig() {
    if (needLogin()) return;
    $('#page').innerHTML = `<h1>${t('nav_konfig')}</h1><p class="note">…</p>`;
    let all, devs;
    try { [all, devs] = await Promise.all([API.configs(), API.devices()]); }
    catch (e) { msg(t('m_api_err', { e: e.message }), 'err'); $('#page').innerHTML = `<h1>${t('nav_konfig')}</h1>${footerNote()}`; return; }
    if (route() !== 'konfigurationen') return;
    ui.devices = devs;
    const me = API.user.id;
    const mine = all.filter(c => c.owner.id === me), others = all.filter(c => c.owner.id !== me);
    const myDevs = devs.filter(d => d.owner.id === me);
    const inDev = c => devs.filter(d => d.aktuell && d.aktuell.configId === c.id).map(d => esc(d.bezeichnung)).join(', ');
    const cur = cfg.server && cfg.server.id;
    $('#page').innerHTML = `
<div class="spread"><h1>${t('kf_mine')}${mine.length > 7 ? ` <span class="muted" style="font-weight:400">(${mine.length})</span>` : ''}</h1><div class="row"><button type="button" data-act="kf-savedraft">${t('kf_save_draft')}</button><a class="btn sec" href="#gebiet" title="${esc(t('later_title', { v: '0.3.0' }))}">${t('kf_from_area')}</a></div></div>
<section class="card flush"><div class="tscroll" id="kfbox"><table class="grid"><thead><tr><th>${t('kf_name')}</th><th>${t('kf_version')}</th><th>${t('kf_area')}</th><th>${t('kf_count')}</th><th>${t('kf_changed')}</th><th>${t('kf_in_dev')}</th><th>${t('kf_actions')}</th></tr></thead><tbody>
${mine.length ? mine.map(c => `<tr data-cid="${c.id}"><td><b>${esc(c.name)}</b>${c.id === cur ? ` <span class="badge">${t('kf_in_editor')}</span>` : ''}</td><td class="mono">v${c.version}</td><td>${esc(c.standort || '–')}</td><td class="mono">${c.anzahl}</td><td class="small">${esc(fmtDT(new Date(c.updated)))}</td><td class="small">${inDev(c) || '–'}</td>
<td><div class="row nowrap" style="gap:6px"><button type="button" class="sec" data-act="kf-open">${t('kf_open')}</button><button type="button" class="sec" data-act="kf-load" title="${esc(t('kf_load_tip'))}">${t('kf_load')}</button><button type="button" class="sec" data-act="kf-copy">${t('kf_dup')}</button><button type="button" class="ghost" data-act="kf-del" title="${esc(t('kf_del'))}" aria-label="${esc(t('kf_del'))}">×</button></div></td></tr>`).join('')
  : `<tr><td colspan="7" class="muted">${t('kf_none')}</td></tr>`}
</tbody></table></div></section>

<section class="card stack"><div class="spread"><span class="label">${t('kf_devices')}</span>
  <form class="row" data-form="devadd"><label class="sr" for="devname">${t('kf_dev_name')}</label><input id="devname" type="text" maxlength="60" placeholder="${esc(t('kf_dev_ph'))}" required style="width:240px"><button type="submit" class="sec">${t('kf_dev_add')}</button></form></div>
  ${myDevs.length ? myDevs.map(d => `<div class="left-item" data-did="${d.id}"><span class="row" style="gap:8px"><label class="sr" for="dn-${d.id}">${t('kf_dev_name')}</label><input id="dn-${d.id}" type="text" data-dev="name" value="${esc(d.bezeichnung)}" maxlength="60" style="width:240px;font-weight:600">
    <span class="small muted">${d.aktuell ? esc((d.aktuell.configName ? '«' + d.aktuell.configName + '» ' : '') + fmtDT(new Date(d.aktuell.zeit))) : t('cur_dev_noprog')}</span></span>
    <button type="button" class="ghost" data-act="dev-del" aria-label="${esc(t('kf_dev_del'))}" title="${esc(t('kf_dev_del'))}">×</button></div>`).join('') : `<p class="note">${t('kf_dev_none')}</p>`}
  <p class="note">${t('kf_dev_note')}</p></section>

<section class="card stack"><span class="label">${t('kf_others')}</span><p class="note">${t('kf_others_note')}</p>
  ${others.length ? others.map(c => `<div class="left-item" data-cid="${c.id}"><span><b>${esc(c.name)}</b> <span class="mono small">v${c.version}</span> · ${esc(c.owner.name || c.owner.login)} · ${esc(c.standort || '–')} <span class="small muted">· ${esc(fmtDate(c.updated))}</span></span>
    <button type="button" class="sec" data-act="kf-take">${t('kf_take')}</button></div>`).join('') : `<p class="note">${t('kf_others_none')}</p>`}</section>
${footerNote()}`;
    // höchstens 7 Konfigurationen sichtbar, der Rest mit Schieber
    const box = $('#kfbox'), rows = box ? box.querySelectorAll('tbody tr') : [];
    if (rows.length > 7) box.style.maxHeight = rows[7].offsetTop + 'px';
  }

  async function onKonfigClick(ev) {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    const cidEl = b.closest('[data-cid]'), didEl = b.closest('[data-did]');
    const cid = cidEl ? cidEl.dataset.cid : null, did = didEl ? didEl.dataset.did : null;
    try {
      if (act === 'kf-savedraft') {
        if (!(cfg.name || '').trim()) cfg.name = t('kf_unnamed');
        const c = await API.createConfig(cfg.name, cfgData()); adopt(c); msg(t('m_srv_saved', { n: c.name, v: c.version }), 'ok');
      } else if (act === 'kf-open' || act === 'kf-load') {
        if (cfg.dirty && !(await ask(t('m_ask_replace'), t('m_ask_replace_b'), t('yes')))) return;
        adopt(await API.config(cid)); msg(t('m_loaded', { n: cfg.name }), 'ok'); location.hash = act === 'kf-load' ? '#geraet?programmieren' : '#editor'; return;
      } else if (act === 'kf-copy' || act === 'kf-take') {
        const c = await API.copyConfig(cid);
        msg(t('m_copied', { n: c.name }), 'ok');
        if (act === 'kf-take' && (!cfg.dirty || await ask(t('m_ask_replace'), t('m_ask_replace_b'), t('yes')))) { adopt(c); location.hash = '#editor'; return; }
      } else if (act === 'kf-del') {
        const name = b.closest('tr').querySelector('b').textContent;
        if (!(await ask(t('kf_del_q', { n: name }), t('kf_del_b'), t('kf_del')))) return;
        await API.deleteConfig(cid);
        if (cfg.server && cfg.server.id === cid) { delete cfg.server; saveDraft(); }
        msg(t('m_deleted', { n: name }), 'info');
      } else if (act === 'dev-del') {
        const name = b.closest('[data-did]').querySelector('input').value;
        if (!(await ask(t('kf_dev_del_q', { n: name }), t('kf_dev_del_b'), t('kf_dev_del')))) return;
        await API.deleteDevice(did); if (ui.deviceSel === did) { ui.deviceSel = null; ui.device = null; }
        msg(t('m_deleted', { n: name }), 'info');
      } else return;
    } catch (e) { msg(t('m_api_err', { e: e.message }), 'err'); }
    ui.devices = null; pageKonfig();
  }
  async function onKonfigSubmit(ev) {
    const f = ev.target.closest('form[data-form=devadd]'); if (!f) return;
    ev.preventDefault();
    try { const d = await API.createDevice(f.devname.value); msg(t('m_dev_added', { n: d.bezeichnung }), 'ok'); } catch (e) { msg(t('m_api_err', { e: e.message }), 'err'); }
    ui.devices = null; pageKonfig();
  }
  async function onKonfigChange(ev) {
    const el = ev.target; if (el.dataset.dev !== 'name') return;
    const did = el.closest('[data-did]').dataset.did;
    try { const d = await API.renameDevice(did, el.value); msg(t('m_dev_renamed', { n: d.bezeichnung }), 'ok'); ui.devices = null; } catch (e) { msg(t('m_api_err', { e: e.message }), 'err'); }
  }

  // ---------- Konten (Supermaster) ----------
  async function pageKonten() {
    if (needLogin()) return;
    if (!isSuper()) { $('#page').innerHTML = `<section class="card"><p>${t('kt_only_super')}</p></section>`; return; }
    let users;
    try { users = await API.users(); } catch (e) { msg(t('m_api_err', { e: e.message }), 'err'); return; }
    if (route() !== 'konten') return;
    $('#page').innerHTML = `<h1>${t('nav_konten')}</h1>
<section class="card stack"><span class="label">${t('kt_new')}</span>
  <form class="row" data-form="useradd" style="align-items:flex-end">
    <label class="stack" style="gap:4px" for="nu_login"><span class="small muted">${t('acc_login')}</span><input id="nu_login" type="text" required pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{2,31}" autocapitalize="none" spellcheck="false" placeholder="amuster" style="width:160px"></label>
    <label class="stack" style="gap:4px" for="nu_name"><span class="small muted">${t('acc_name')}</span><input id="nu_name" type="text" maxlength="80" placeholder="Anna Muster" style="width:220px"></label>
    <label class="stack" style="gap:4px" for="nu_pw"><span class="small muted">${t('kt_initial_pw')}</span><input id="nu_pw" type="text" class="mono" required minlength="4" value="${randomPw()}" style="width:200px"></label>
    <button type="submit">${t('kt_create')}</button></form>
  <p class="note">${t('kt_new_note')}</p></section>
<section class="card flush"><table class="grid"><thead><tr><th>${t('acc_login')}</th><th>${t('acc_name')}</th><th>${t('kt_role')}</th><th>${t('nav_konfig')}</th><th>${t('kt_devices')}</th><th>${t('kt_last')}</th><th>${t('kf_actions')}</th></tr></thead><tbody>
${users.map(u => `<tr data-uid="${u.id}" class="${u.active ? '' : 'off'}"><td class="mono"><b>${esc(u.login)}</b></td><td>${esc(u.name)}</td><td>${u.role === 'super' ? t('acc_super') : t('acc_user')}${u.active ? '' : ' · ' + t('kt_locked')}</td><td class="mono">${u.configs}</td><td class="mono">${u.devices}</td><td class="small">${u.last_login ? esc(fmtDT(new Date(u.last_login))) : '–'}</td>
<td><div class="row nowrap" style="gap:6px"><button type="button" class="sec" data-act="kt-reset">${t('kt_reset')}</button>${u.role === 'super' ? '' : `<button type="button" class="${u.active ? 'danger' : 'sec'}" data-act="kt-lock" data-v="${u.active ? 0 : 1}">${u.active ? t('kt_lock') : t('kt_unlock')}</button>`}</div></td></tr>`).join('')}
</tbody></table></section>${footerNote()}`;
  }
  async function onKontenClick(ev) {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const tr = b.closest('tr[data-uid]'); if (!tr) return;
    const login = tr.querySelector('b').textContent;
    try {
      if (b.dataset.act === 'kt-reset') {
        if (!(await ask(t('kt_reset_q', { n: login }), t('kt_reset_b'), t('kt_reset')))) return;
        const pw = randomPw(); await API.patchUser(tr.dataset.uid, { password: pw });
        msg(t('m_pw_reset', { n: login, p: pw }), 'ok');
      } else if (b.dataset.act === 'kt-lock') {
        await API.patchUser(tr.dataset.uid, { active: b.dataset.v === '1' });
        msg(t(b.dataset.v === '1' ? 'm_unlocked' : 'm_locked', { n: login }), 'info');
      } else return;
    } catch (e) { msg(t('m_api_err', { e: e.message }), 'err'); }
    pageKonten();
  }
  async function onKontenSubmit(ev) {
    const f = ev.target.closest('form[data-form=useradd]'); if (!f) return;
    ev.preventDefault();
    try {
      const u = await API.createUser({ login: f.nu_login.value, name: f.nu_name.value, password: f.nu_pw.value });
      msg(t('m_user_created', { n: u.login, p: f.nu_pw.value }), 'ok');
    } catch (e) { msg(t('m_api_err', { e: e.message }), 'err'); return; }
    pageKonten();
  }

  // Kontext für die Seite «Gebiet» (src/gebiet.js)
  const gctx = { get cfg() { return cfg; }, t, esc, msg, saveDraft: () => saveDraft(), footerNote, fmtDate, ask, get lang() { return I.lang; } };

  // Kontext für die Seite «Gerät» (src/geraet.js)
  GR.init({ get cfg() { return cfg; }, t, esc, msg, ask, choose, download, stamp, slug, fmtDT, footerNote, route, M, C, API, ui, version: VERSION,
    setDeviceSel(id) { ui.deviceSel = id; try { localStorage.setItem('krt2.device', id); } catch (e) { /* egal */ } },
    async refreshDevices(id) { ui.devices = null; try { ui.devices = await API.devices(); } catch (e) { ui.devices = false; } if (id) { try { ui.device = await API.device(id); } catch (e) { /* egal */ } } } });

  // ---------- Platzhalterseiten ----------
  function pageLater(v, key) {
    $('#page').innerHTML = `<section class="card stack"><h1>${t('later_title', { v })}</h1><p style="margin:0">${t(key)}</p>
<p class="note">${t('later_test')}: <a href="./test.html">test.html</a> · <a href="./test.html?sim=1">${t('later_sim')}</a></p></section>${footerNote()}`;
  }

  // ---------- Ereignisse ----------
  document.addEventListener('click', ev => {
    if ($('#fpop') && !ev.target.closest('#fpop') && !ev.target.closest('[data-act=fopen]')) closeFilter();
    if (ev.target.closest('[data-act=printcard]')) { ev.preventDefault(); const go = () => setTimeout(() => window.print(), 350); if (route() === 'karte') go(); else { location.hash = '#karte'; go(); } return; }
    if (route() === 'gebiet' && ev.target.closest('[data-ge]')) { window.KRT2GEBIET.onClick(ev); return; }
    if (route() === 'geraet' && ev.target.closest('[data-gr]')) { GR.onClick(ev); return; }
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'lang') { I.setLang(b.dataset.v); render(); return; }
    if (b.dataset.act === 'mclose') { const m = msgs.find(x => x.id === b.closest('[data-mid]').dataset.mid); if (m) { m.toast = false; m.seen = true; saveLog(); } renderMsgs(); return; }
    if (b.dataset.act === 'logclear') { msgs.length = 0; saveLog(); renderMsgs(); pageProtokoll(); return; }
    if (b.dataset.act === 'logcopy') { const txt = msgs.map(m => fmtDT(new Date(m.time)) + '\t' + m.kind + '\t' + m.text).join('\n'); if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {}); return; }
    if (b.dataset.act === 'mcopy') { const m = msgs.find(x => x.id === b.closest('[data-mid]').dataset.mid); if (m && navigator.clipboard) navigator.clipboard.writeText(m.text).catch(() => {}); return; }
    if (b.dataset.act === 'login') { loginDialog(); return; }
    if (b.dataset.act === 'account') { accountDialog(); return; }
    if (b.dataset.act === 'devsel') {
      ui.deviceSel = b.dataset.v || null; try { if (ui.deviceSel) localStorage.setItem('krt2.device', ui.deviceSel); else localStorage.removeItem('krt2.device'); } catch (e) { /* egal */ }
      if (ui.deviceSel) loadDevice(ui.deviceSel); else { ui.device = null; render(); }
      return;
    }
    const r = route();
    if (r === 'editor' || (b.dataset.act === 'load' || b.dataset.act === 'saveas' || b.dataset.act === 'csv')) onEditorClick(ev);
    else if (r === 'einstellungen') onEinstClick(ev);
    else if (r === 'konfigurationen') onKonfigClick(ev);
    else if (r === 'konten') onKontenClick(ev);
  });
  document.addEventListener('submit', ev => {
    const r = route();
    if (r === 'gebiet') { window.KRT2GEBIET.onSubmit(ev); return; }
    if (r === 'einstellungen') { const f = ev.target.closest('form[data-form=svcadd]'); if (!f) return; ev.preventDefault();
      const code = f.svcnew.value.trim().toUpperCase(); const st = cfg.settings; st.services = M.servicesOf(cfg).slice();
      if (!M.SVC_RE.test(code)) { msg(t('sv_bad', { s: code }), 'warn'); return; }
      if (st.services.includes(code)) { msg(t('sv_exists', { s: code }), 'warn'); return; }
      st.services.push(code); saveDraft(); msg(t('sv_added', { s: code }), 'ok'); pageEinst(); const el = $('#svcnew'); if (el) el.focus(); return; }
    if (r === 'konfigurationen') onKonfigSubmit(ev);
    else if (r === 'konten') onKontenSubmit(ev);
  });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'file') { onFile(ev.target); return; }
    const r = route();
    if (r === 'gebiet') { window.KRT2GEBIET.onChange(ev); return; }
    if (r === 'geraet') { GR.onChange(ev); return; }
    if (r === 'editor') onEditorChange(ev);
    else if (r === 'einstellungen') onEinstChange(ev);
    else if (r === 'konfigurationen') onKonfigChange(ev);
  });
  // Kurznamen: nur Zeichen, die das Gerät speichert (Versalien A–Z, Leerzeichen; mit Einstellung 0–9 und Bindestrich), höchstens 8
  document.addEventListener('input', ev => {
    const el = ev.target;
    if (!el.hasAttribute || !el.hasAttribute('data-kname')) return;
    const dig = cfg.settings.allowDigits, v = C.cleanNameInput(el.value, dig);
    if (v === el.value) return;
    const pos = C.cleanNameInput(el.value.slice(0, el.selectionStart || 0), dig).length;
    el.value = v; try { el.setSelectionRange(pos, pos); } catch (e) { /* nicht jedes Feld kennt eine Auswahl */ }
  }, true);
  document.addEventListener('input', ev => {
    if (route() !== 'editor') return;
    if (ev.target.id === 'fk') { ui.colF.k = ev.target.value; applyFilter(); return; }
    onKurzInput(ev);
  });
  document.addEventListener('focusin', ev => { const tr = ev.target.closest && ev.target.closest('#edt tr[data-id]'); if (tr) ui.lastRow = tr.dataset.id; });

  function onFile(inp) {
    const f = inp.files && inp.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try { cfg = M.fromJSON(String(rd.result)); delete cfg.server; saveDraft(); msg(t('m_loaded', { n: cfg.name || f.name }), 'ok'); render(); }
      catch (e) { msg(t('m_load_err', { e: e.message }), 'err'); }
    };
    rd.readAsText(f);
  }

  window.addEventListener('hashchange', () => { closeFilter(); render(); window.scrollTo(0, 0); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && $('#fpop')) { closeFilter(); } if (route() === 'geraet') GR.onKey(ev); });
  window.addEventListener('beforeunload', ev => { if (GR.busy || GR._state.roOn) { ev.preventDefault(); ev.returnValue = ''; } });
  I.setLang(I.lang);
  API.onLogout = () => { msg(t('m_session_end'), 'warn'); render(); };
  render();
  if (API.enabled && API.user) { const before = JSON.stringify(API.user); API.me().then(u => { if (JSON.stringify(u) !== before) render(); }).catch(() => { /* onLogout zeigt es an */ }); }
  window.KRT2APP = { get cfg() { return cfg; }, version: VERSION };
})();
