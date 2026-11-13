/* krt2.wicki.aero – App-Oberfläche 0.1.0: Aktuell, Editor, Einstellungen, A6-Karte. Entwurf lokal im Browser. */
(function () {
  'use strict';
  const M = window.KRT2MODEL, C = window.KRT2CODEC, I = window.KRT2I18N, S = window.KRT2SAMPLE;
  const t = I.t;
  const VERSION = '0.1.0';
  const LS = 'krt2.draft';

  const ui = { filter: 'all', q: '', curQ: '', storageWarned: false };
  const msgs = [];
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

  function saveDraft() {
    cfg.updated = new Date().toISOString();
    try { localStorage.setItem(LS, M.toJSON(cfg)); }
    catch (e) { if (!ui.storageWarned) { ui.storageWarned = true; msg(t('m_storage'), 'warn'); } }
  }
  function loadDraft() { try { const s = localStorage.getItem(LS); return s ? M.fromJSON(s) : null; } catch (e) { return null; } }

  /** Meldungen bleiben stehen, bis man sie schliesst; Text ist markier- und kopierbar. */
  function msg(text, kind) {
    msgs.unshift({ id: M.uid('m'), text, kind: kind || 'info', time: new Date() });
    msgs.length = Math.min(msgs.length, 6);
    renderMsgs();
  }
  function renderMsgs() {
    const box = $('#msgs'); if (!box) return;
    box.innerHTML = msgs.map(m => `<div class="msg ${m.kind}" role="status" data-mid="${m.id}"><time>${esc(m.time.toLocaleTimeString(I.lang === 'de' ? 'de-CH' : 'en-GB'))}</time><span class="txt">${esc(m.text)}</span>` +
      `<button type="button" class="ghost" data-act="mcopy">${t('m_copy')}</button><button type="button" class="ghost" data-act="mclose" aria-label="${t('m_close')}">×</button></div>`).join('');
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    msg(t('m_saved_file', { f: name }), 'ok');
  }

  function ask(title, body, yes) {
    return new Promise(res => {
      const d = $('#dlg');
      d.innerHTML = `<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="row"><button type="button" class="sec" value="no">${t('cancel')}</button><button type="button" class="danger" value="yes">${esc(yes)}</button></div>`;
      const done = v => { d.close(); res(v); };
      d.querySelectorAll('button').forEach(b => b.addEventListener('click', () => done(b.value === 'yes')));
      d.addEventListener('cancel', () => res(false), { once: true });
      d.showModal(); d.querySelector('button.sec').focus();
    });
  }

  // ---------- Gerüst ----------
  const ROUTES = ['aktuell', 'gebiet', 'editor', 'geraet', 'konfigurationen', 'einstellungen', 'karte'];
  const NAV = [['aktuell', 'nav_aktuell'], ['gebiet', 'nav_gebiet', '0.3.0'], ['editor', 'nav_editor'], ['geraet', 'nav_geraet', '0.4.0'], ['konfigurationen', 'nav_konfig', '0.2.0'], ['einstellungen', 'nav_einst']];
  function route() { const r = location.hash.replace(/^#\/?/, '').split('?')[0]; return ROUTES.includes(r) ? r : 'aktuell'; }

  function shell(r) {
    document.title = t('title') + ' · krt2.wicki.aero';
    $('#app').innerHTML = `
<header class="top">
  <div class="brand"><strong>${t('title')}</strong>
    <nav class="main" aria-label="Navigation">${NAV.map(([k, l, v]) => `<a href="#${k}"${k === r || (r === 'karte' && k === 'aktuell') ? ' aria-current="page"' : ''}${v ? ' class="later" title="' + esc(t('later_title', { v })) + '"' : ''}>${t(l)}</a>`).join('')}</nav>
  </div>
  <div class="top-right">
    <div class="seg" role="group" aria-label="Sprache / language"><button type="button" data-act="lang" data-v="de" aria-pressed="${I.lang === 'de'}">DE</button><button type="button" data-act="lang" data-v="en" aria-pressed="${I.lang === 'en'}">EN</button></div>
    <button type="button" class="sec" disabled title="${esc(t('login_later'))}">${t('login')}</button>
    <div class="logo"><img src="./img/logo.png" alt="Wicki Partners Ballonteam"><span class="ver">${VERSION}</span></div>
  </div>
</header>
<div class="msgwrap"><div id="msgs" aria-live="polite"></div></div>
<main id="page"></main>
<div id="bar"></div>
<dialog id="dlg"></dialog>
<input type="file" id="file" accept=".json,application/json" hidden>`;
    renderMsgs();
  }

  function render() {
    const r = route();
    shell(r);
    ({ aktuell: pageAktuell, editor: pageEditor, einstellungen: pageEinst, karte: pageKarte, gebiet: () => pageLater('0.3.0', 'later_gebiet'), geraet: () => pageLater('0.4.0', 'later_geraet'), konfigurationen: () => pageLater('0.2.0', 'later_konfig') })[r]();
  }

  function footerNote() {
    return `<p class="note">${t('disclaimer')} · <a href="./LICENSE">${t('legal')}</a> · <a href="./test.html">${t('testlink')}</a></p>`;
  }

  // ---------- Aktuell ----------
  function pageAktuell() {
    const L = M.layout(cfg);
    $('#page').innerHTML = `
<section class="card spread">
  <div class="stack"><span class="label">${t('cur_config')}</span>
    <div class="row"><strong style="font-size:20px">«${esc(cfg.name || '–')}»</strong><span class="badge y">${t('cur_draft')}</span></div>
    <span class="small muted">${t('cur_draft_note')}</span></div>
  <div class="stack"><span class="label">${t('cur_data')}</span><span>${esc(fmtDate(cfg.datenStand))}${cfg.standort && cfg.standort.name ? ' · ' + esc(cfg.standort.name) : ''}</span></div>
  <div class="row"><a class="btn" href="#karte">${t('cur_print')}</a><button type="button" class="sec" disabled title="${esc(t('cur_read_later'))}">${t('cur_read')}</button></div>
</section>
<div class="row"><label for="q" class="muted">${t('cur_search')}</label><input id="q" type="search" class="search" placeholder="${esc(t('cur_search_ph'))}" value="${esc(ui.curQ)}">${cfg.beispiel ? `<span class="small muted">${t('sample_note')}</span>` : ''}</div>
<section class="card flush"><table class="grid cur-table"><thead><tr><th style="width:64px">${t('col_nr')}</th><th style="width:130px">${t('col_k')}</th><th style="width:110px">${t('col_f')}</th><th>${t('col_t')}</th><th style="width:110px">${t('col_d')}</th></tr></thead><tbody id="curbody"></tbody></table></section>
${footerNote()}`;
    const fill = () => { $('#curbody').innerHTML = curRows(L, ui.curQ); };
    fill();
    $('#q').addEventListener('input', e => { ui.curQ = e.target.value; fill(); });
  }

  function curRows(L, q) {
    const s = q.trim().toUpperCase().replace(',', '.');
    const hit = x => !s || [x.kurz, x.ch, x.klar, x.dienst].some(v => String(v || '').toUpperCase().includes(s));
    const row = x => `<tr><td class="nr">${pad2(x.nr)}</td><td class="k">${esc(x.kurz)}</td><td class="f">${esc(x.ch)}</td><td>${esc(x.klar)}</td><td class="small muted">${esc(x.dienst || (x.kind === 'fixed' ? t('fest') : '–'))}</td></tr>`;
    const head = (name, rg) => `<tr class="head"><td colspan="5"><b>${esc(name)}</b> <span class="small muted">${rg}</span></td></tr>`;
    let h = '', n = 0;
    const grp = (name, rg, list) => { const v = list.filter(hit); if (v.length) { h += head(name, rg) + v.map(row).join(''); n += v.length; } };
    if (L.slots[0].kind === 'fixed') grp(t('blk_fixed'), '00', [L.slots[0]]);
    for (const r of L.ranges) grp(r.name, range(r.from, r.to), L.slots.slice(r.from, r.to + 1));
    const frees = L.slots.filter(x => x.kind === 'free');
    if (frees.length && (!s || hit(frees[0]))) {
      h += head(t('blk_free'), range(frees[0].nr, frees[frees.length - 1].nr)) + `<tr><td class="nr">${range(frees[0].nr, frees[frees.length - 1].nr)}</td><td class="k">${esc(frees[0].kurz)}</td><td class="f">${esc(frees[0].ch)}</td><td class="muted" colspan="2">${t('cur_free_rows', { n: frees.length, ch: frees[0].ch, k: frees[0].kurz })}</td></tr>`; n++;
    }
    if (L.slots[99].kind === 'fixed') grp(t('blk_emerg'), '99', [L.slots[99]]);
    return n ? h : `<tr><td colspan="5" class="muted">${t('cur_none')}</td></tr>`;
  }

  // ---------- Editor ----------
  function pageEditor() {
    const on = cfg.bloecke.filter(b => b.on);
    const chip = (v, label) => `<button type="button" class="chip" data-act="filter" data-v="${esc(v)}" aria-pressed="${ui.filter === v}">${esc(label)}</button>`;
    const area = [cfg.standort && cfg.standort.name, cfg.hoehe ? cfg.hoehe.von + '–' + cfg.hoehe.bis.replace('FL', 'FL ') : '', cfg.datenStand ? t('cur_data') + ' ' + fmtDate(cfg.datenStand) : ''].filter(Boolean).join(' · ');
    $('#page').className = 'wide';
    $('#page').innerHTML = `
<div class="spread">
  <div class="stack"><div class="row"><label class="sr" for="cname">${t('ed_name_ph')}</label><input id="cname" type="text" data-act="cname" value="${esc(cfg.name)}" placeholder="${esc(t('ed_name_ph'))}" style="font-size:20px;font-weight:600;min-width:280px"><span class="badge">${t('ed_unsaved')}</span></div>
    <span class="small muted">${esc(area)}</span></div>
  <div class="row"><button type="button" class="sec" data-act="new">${t('ed_new')}</button><button type="button" class="sec" data-act="sample">${t('ed_sample')}</button></div>
</div>
${cfg.beispiel ? `<p class="note">${t('sample_note')}</p>` : ''}
<div class="row">
  ${chip('all', t('ed_all'))}${on.map(b => chip(b.id, b.name)).join('')}${chip('active', t('ed_active'))}${chip('check', t('ed_check'))}
  <label class="sr" for="qe">${t('cur_search')}</label><input id="qe" type="search" placeholder="${esc(t('cur_search'))}" value="${esc(ui.q)}" style="width:180px">
  <button type="button" class="sec" data-act="own">${t('ed_own')}</button>
  <span class="small muted">${t('ed_ad')}</span><div class="seg"><button type="button" data-act="allmode" data-v="icao" aria-pressed="false">${t('ed_all_icao')}</button><button type="button" data-act="allmode" data-v="kurz" aria-pressed="false">${t('ed_all_short')}</button></div>
</div>
<div class="ed-layout">
  <section class="card flush"><table class="grid" id="edt"><thead><tr>
    <th><span class="sr">${t('col_move')}</span></th><th>${t('col_nr')}</th><th>${t('col_on')}</th><th>${t('col_k')}</th><th>${t('col_f')}</th><th>${t('col_t')}</th><th>${t('col_d')}</th><th>${t('col_km')}</th><th>${t('col_q')}</th>
  </tr></thead><tbody id="edbody"></tbody></table></section>
  <aside><section class="card" id="issues"></section><section class="card" id="left"></section></aside>
</div>`;
    $('#bar').innerHTML = `<div class="bar-actions"><span class="status" id="edstatus"></span>
  <button type="button" class="sec" disabled title="${esc(t('ed_later04'))}">${t('ed_compare')}</button>
  <button type="button" class="sec" data-act="load">${t('ed_load')}</button>
  <button type="button" class="sec" data-act="csv">${t('ed_csv')}</button>
  <button type="button" data-act="saveas">${t('ed_saveas')}</button>
  <button type="button" disabled title="${esc(t('ed_later04'))}">${t('ed_program')}</button></div>`;
    $('#qe').addEventListener('input', e => { ui.q = e.target.value; edRefresh(); });
    edRefresh();
  }

  function svcOptions(sel) { return M.SERVICES.map(s => `<option${s === sel ? ' selected' : ''}>${s}</option>`).join(''); }

  function edRefresh() {
    const R = M.check(cfg), L = R.layout;
    const q = ui.q.trim().toUpperCase().replace(',', '.');
    const match = e => {
      if (ui.filter === 'active' && !e.aktiv) return false;
      if (ui.filter === 'check' && !(R.byEntry[e.id] || []).length) return false;
      if (ui.filter !== 'all' && ui.filter !== 'active' && ui.filter !== 'check' && e.block !== ui.filter) return false;
      return !q || [M.entryShort(e), e.ch, e.klar, e.dienst, e.ort && e.ort.name, e.ort && e.ort.icao].some(v => String(v || '').toUpperCase().includes(q));
    };
    const showFixed = ui.filter === 'all' && !q;
    let h = '';
    const fixedRow = (key, nr) => {  // 00 und 99: fest, nur 99 abwählbar
      const p = cfg.fixed[key];
      const is99 = key === 'p99';
      const box = is99 ? `<input type="checkbox" data-act="e99" ${p.on ? 'checked' : ''} aria-label="${t('col_on')} 99">` : `<span class="fixtag">${t('fest')}</span>`;
      return `<tr class="fixed${p.on ? '' : ' off'}"><td class="mv"></td><td class="nr">${pad2(nr)}</td><td>${box}</td><td class="k">${esc(p.kurz)}</td><td class="f">${esc(p.ch)}</td><td>${esc(p.klar)}</td><td class="small muted">${t('fest')}</td><td class="small muted">–</td><td><span class="badge">${t('fest')}</span></td></tr>`;
    };
    if (showFixed && cfg.fixed.p00.on) h += `<tr class="head"><td colspan="9"><b>${t('blk_fixed')}</b> <span class="small muted">00</span></td></tr>` + fixedRow('p00', 0);
    for (const b of cfg.bloecke.filter(x => x.on)) {
      const list = M.entriesOf(cfg, b.id);
      const rg = L.ranges.find(r => r.block === b.id);
      const vis = list.filter(match);
      if (!vis.length && (q || (ui.filter !== 'all' && ui.filter !== b.id))) continue;
      h += `<tr class="head" data-block="${b.id}"><td colspan="9"><div class="row" style="gap:8px"><b>${esc(b.name)}</b><span class="small muted">${rg ? range(rg.from, rg.to) : '–'} · ${t('ord_' + b.order)}</span>` +
        `<button type="button" class="ghost small" data-act="sort" data-b="${b.id}">${t('ed_sort')}</button></div></td></tr>`;
      for (const e of vis) h += entryRow(e, L, R);
    }
    if (showFixed) {
      if (L.freeTo != null) h += `<tr class="head" data-block="__free"><td colspan="9"><b>${t('blk_free')}</b> <span class="small muted">${range(L.freeFrom, L.freeTo)}: ${esc(cfg.settings.free.ch)} ${esc(cfg.settings.free.kurz)}</span></td></tr>`;
      h += `<tr class="head"><td colspan="9"><b>${t('blk_emerg')}</b> <span class="small muted">99</span></td></tr>` + fixedRow('p99', 99);
    }
    $('#edbody').innerHTML = h || `<tr><td colspan="9" class="muted">${t('cur_none')}</td></tr>`;
    // Prüfliste
    const codes = Object.entries(R.count.codes);
    const lvlOf = c => (['freq', 'nameLeer', 'nameLang', 'nameZeichen'].includes(c) || (c === 'widerspruch' && cfg.eintraege.some(e => e.vertrauen === 'r' && !e.bestaetigt && L.slotOf[e.id] != null))) ? 'r' : 'y';
    $('#issues').innerHTML = `<div class="label" style="margin-bottom:8px">${t('ed_issues')}</div>` +
      (codes.length ? `<ul class="issues">${codes.map(([c, n]) => `<li><span class="badge ${lvlOf(c)}">${esc(t('sum_' + c, { n }))}</span></li>`).join('')}</ul>` : `<p class="note">${t('ed_ok')}</p>`) +
      (R.count.r ? `<p class="note" style="margin-top:8px">${t('ed_block_note')}</p>` : '');
    $('#left').innerHTML = `<div class="label" style="margin-bottom:6px">${t('ed_left')}</div>` + (L.notPlaced.length ? L.notPlaced.map(x =>
      `<div class="left-item"><span><span class="mono" style="font-weight:600">${esc(x.e.ch)}</span> ${esc(x.e.klar || M.entryShort(x.e))}<br><span class="small muted">${t('why_' + x.why)}</span></span>` +
      (x.why === 'blockAus' || x.why === 'ohneBlock' ? `<button type="button" class="sec" data-act="bring" data-id="${x.e.id}">${t('ed_bring')}</button>` : '') + `</div>`).join('') : `<p class="note">${t('ed_left_none')}</p>`);
    $('#edstatus').textContent = t('ed_status', { used: L.used + (cfg.fixed.p99.on ? 1 : 0), r: R.count.r, y: R.count.y });
  }

  function entryRow(e, L, R) {
    const nr = L.slotOf[e.id];
    const iss = R.byEntry[e.id] || [];
    const has = c => iss.find(i => i.code === c);
    const k = M.entryShort(e);
    const kBad = has('nameLang') || has('nameZeichen') || has('nameLeer');
    const fBad = has('freq');
    const np = L.notPlaced.find(x => x.e.id === e.id);
    const ad = M.hasIcao(e);
    const seg = ad ? `<div class="seg small" role="group" aria-label="${esc(t('st_adloc'))}"><button type="button" data-act="kmode" data-v="icao" aria-pressed="${e.kurzModus === 'icao'}" title="${esc(t('ed_icao_btn'))}">${esc(e.ort.icao)}</button><button type="button" data-act="kmode" data-v="kurz" aria-pressed="${e.kurzModus === 'kurz'}" title="${esc(t('ed_short_btn'))}">${esc(e.ort.code || e.ort.iata || M.locCode(e.ort.name))}</button></div>` : '';
    const qcls = { g: 'g', y: 'y', r: e.bestaetigt ? 'y' : 'r', s: '' }[e.vertrauen] || '';
    const qtxt = e.vertrauen === 'g' ? t('q_g', { n: (e.quellen || []).length }) : e.vertrauen === 'y' ? t('q_y') : e.vertrauen === 'r' ? t('q_r') : t('q_s');
    const qtitle = [(e.quellen || []).join(', '), e.note].filter(Boolean).join(' – ');
    const extra = iss.filter(i => !['eineQuelle', 'widerspruch'].includes(i.code)).map(i => `<div class="small" style="color:${i.lvl === 'r' ? 'var(--red)' : 'var(--warn-fg)'}">${esc(t('iss_' + i.code, { a: i.arg }))}</div>`).join('');
    const conf = e.vertrauen === 'r' ? (e.bestaetigt
      ? ` <button type="button" class="ghost small" data-act="unconfirm" title="${esc(t('ed_unconfirm'))}">✓ ${t('ed_confirmed')}</button>`
      : ` <button type="button" class="sec small" data-act="confirm" style="min-height:26px;padding:2px 8px">${t('ed_confirm')}</button>`) : '';
    const dist = e.dist != null ? e.dist + ' km' : e.lage ? t('lage_' + e.lage) : '–';
    return `<tr data-id="${e.id}" class="${e.aktiv ? '' : 'off'}">
<td class="mv"><span class="handle" data-drag draggable="true" title="${esc(t('col_move'))}"><span aria-hidden="true">⋮⋮</span></span><button type="button" class="ghost" data-act="up" aria-label="${esc(t('ed_up'))}">▲</button><button type="button" class="ghost" data-act="down" aria-label="${esc(t('ed_down'))}">▼</button></td>
<td class="nr">${nr != null ? pad2(nr) : '–'}${np && np.why !== 'blockAus' ? `<div class="small" style="color:var(--warn-fg)">${esc(t('why_' + np.why))}</div>` : ''}</td>
<td><input type="checkbox" data-f="aktiv" ${e.aktiv ? 'checked' : ''} aria-label="${esc(t('col_on'))} ${esc(k)}"></td>
<td><div class="kcell"><input type="text" data-f="kurz" value="${esc(k)}" maxlength="12" spellcheck="false" autocomplete="off" class="${kBad ? 'bad' : ''}" aria-label="${esc(t('col_k'))}" title="${e.kurzModus === 'frei' ? esc(t('ed_free_name')) : ''}"><span class="kcount${k.length > 8 ? ' bad' : ''}">${k.length}/8</span>${seg}</div></td>
<td><input type="text" class="freq${fBad ? ' bad' : ''}" data-f="ch" value="${esc(e.ch)}" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="${esc(t('col_f'))}"></td>
<td><input type="text" class="klar" data-f="klar" value="${esc(e.klar)}" aria-label="${esc(t('col_t'))}"></td>
<td><select class="svc" data-f="dienst" aria-label="${esc(t('col_d'))}">${svcOptions(e.dienst)}</select></td>
<td class="small muted" style="white-space:nowrap">${esc(dist)}</td>
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
    for (const k of ['f', 'fx', 'st', 'b']) if (a.dataset[k]) return scope + `[data-${k}="${a.dataset[k]}"]` + (a.type === 'radio' ? `[value="${a.value}"]` : '');
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
    if (act === 'own') {
      const blk = (ui.filter && M.blockById(cfg, ui.filter)) || cfg.bloecke.find(y => y.on) || cfg.bloecke[0];
      const ne = M.addEntry(cfg, { ch: '', dienst: blk.svc[0] || 'OTH', block: blk.id, kurz: '', kurzModus: 'frei' });
      saveDraft(); edRefresh();
      const inp = document.querySelector(`tr[data-id="${ne.id}"] [data-f="kurz"]`); if (inp) { inp.scrollIntoView({ block: 'center' }); inp.focus(); }
      return;
    }
    if (act === 'allmode') {
      let n = 0; for (const x of cfg.eintraege) if (M.hasIcao(x)) { x.kurzModus = b.dataset.v; x.kurz = M.entryShort(x); n++; }
      msg(t('st_applied', { n, m: b.dataset.v === 'icao' ? t('st_adloc_icao') : t('st_adloc_short') }), 'ok'); afterChange(edRefresh); return;
    }
    if (act === 'e99') { ev.preventDefault(); await toggle99(); edRefresh(); return; }
    if (act === 'new') { if (await ask(t('m_ask_new'), '', t('yes'))) { cfg = M.defaultConfig(); saveDraft(); msg(t('m_new'), 'ok'); render(); } return; }
    if (act === 'sample') { if (await ask(t('m_ask_new'), '', t('yes'))) { cfg = S.sampleConfig(); saveDraft(); msg(t('m_sample'), 'ok'); render(); } return; }
    if (act === 'saveas') { download(`krt2_${slug(cfg.name)}_${stamp()}.json`, M.toJSON(cfg)); return; }
    if (act === 'csv') { download(`krt2_${slug(cfg.name)}_${stamp()}.csv`, '﻿' + M.toCSV(cfg), 'text/csv;charset=utf-8'); return; }
    if (act === 'load') { $('#file').click(); return; }
  }

  function onEditorChange(ev) {
    const el = ev.target;
    if (el.id === 'cname') { cfg.name = el.value.trim(); saveDraft(); return; }
    if (el.id === 'file') return;
    const f = el.dataset.f; if (!f) return;
    const e = entryOf(el); if (!e) return;
    if (f === 'aktiv') e.aktiv = el.checked;
    else if (f === 'kurz') { e.kurzModus = 'frei'; e.kurz = el.value.toUpperCase().replace(/\s+$/, ''); }
    else if (f === 'ch') { const r = C.encodeFreq(el.value); e.ch = r.ok ? r.display : el.value.trim(); }
    else if (f === 'klar') e.klar = el.value;
    else if (f === 'dienst') { e.dienst = el.value; if (e.kurzModus !== 'frei') e.kurz = M.entryShort(e); }
    afterChange(edRefresh);
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
    const segs = [];
    if (L.slots[0].kind === 'fixed') segs.push({ label: '00', n: 1, bg: '#14202e', fg: '#fff', tip: t('blk_fixed') + ': ' + cfg.fixed.p00.kurz });
    const shades = ['#1f5fbf', '#174a95', '#3b4a5c', '#2f6f8f', '#5b6b7f', '#255a3c'];
    L.ranges.forEach((r, i) => segs.push({ label: r.name + ' ' + range(r.from, r.to), n: r.to - r.from + 1, bg: shades[i % shades.length], fg: '#fff', tip: r.name + ' ' + range(r.from, r.to) }));
    if (L.freeTo != null) segs.push({ label: t('blk_free').toLowerCase() + ' ' + range(L.freeFrom, L.freeTo), n: L.freeTo - L.freeFrom + 1, cls: 'gap', tip: cfg.settings.free.ch + ' ' + cfg.settings.free.kurz });
    segs.push(cfg.fixed.p99.on ? { label: '99', n: 1, bg: '#c0392b', fg: '#fff', tip: 'EMERGENC 121.500' } : { label: '99', n: 1, cls: 'gap', tip: t('st_off99') });
    const blockRow = (b, i) => {
      const rest = M.SERVICES.filter(s => !b.svc.includes(s));
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
    <input type="text" class="mono" data-fx="p00.kurz" value="${esc(p0.kurz)}" maxlength="8" aria-label="${esc(t('col_k'))} 00" ${p0.on ? '' : 'disabled'}>
    <input type="text" data-fx="p00.klar" value="${esc(p0.klar)}" aria-label="${esc(t('col_t'))} 00" ${p0.on ? '' : 'disabled'}>
    <button type="button" class="sec" data-act="p00">${p0.on ? t('st_release') : t('st_take')}</button>
    <span class="mono muted">99</span><span class="mono" style="font-weight:600">${esc(p9.ch)}</span><span class="mono" style="font-weight:600">${esc(p9.kurz)}</span><span>${esc(p9.klar)} <span class="small muted">· ${p9.on ? t('st_always') : t('st_off99')}</span></span>
    <button type="button" class="${p9.on ? 'danger' : 'sec'}" data-act="p99">${p9.on ? t('e99_yes') : t('st_take')}</button>
  </div></section>
<section class="card stack"><div class="spread"><span class="label">${t('st_blocks')}</span><button type="button" class="sec" data-act="badd">${t('st_add_block')}</button></div>
  <div style="overflow-x:auto"><table class="grid"><thead><tr><th><span class="sr">${t('col_move')}</span></th><th>${t('col_on')}</th><th>${t('st_block')}</th><th>${t('st_svc')}</th><th>${t('st_max')}</th><th>${t('st_order')}</th><th></th></tr></thead>
  <tbody>${cfg.bloecke.map(blockRow).join('')}</tbody></table></div></section>
<div class="settings-3">
  <section class="card stack"><span class="label">${t('st_freeslots')}</span>
    <div class="row"><input type="text" class="mono" data-st="free.ch" value="${esc(st.free.ch)}" aria-label="${esc(t('col_f'))} ${esc(t('fixed_free'))}" style="width:100px"><input type="text" class="mono" data-st="free.kurz" value="${esc(st.free.kurz)}" maxlength="8" aria-label="${esc(t('col_k'))} ${esc(t('fixed_free'))}" style="width:110px"></div>
    <p class="note">${t('st_free_note')}</p></section>
  <section class="card stack"><span class="label">${t('st_names')}</span>
    <span>${t('st_names_rule')}</span><span class="mono small" style="font-weight:600">BIR AFIS · ZRH TWR · ZRH ATIS · ZRH INFO · ZRHE RDR</span>
    <span class="small">${t('st_adloc')}</span>
    <label><input type="radio" name="adloc" data-st="adLoc" value="kurz" ${st.adLoc !== 'icao' ? 'checked' : ''}> ${t('st_adloc_short')} <span class="mono small muted">ZRH TWR · BIR AFIS</span></label>
    <label><input type="radio" name="adloc" data-st="adLoc" value="icao" ${st.adLoc === 'icao' ? 'checked' : ''}> ${t('st_adloc_icao')} <span class="mono small muted">LSZH TWR · LSZFAFIS</span></label>
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
    else if (act === 'p99') { await toggle99(); }
    else if (act === 'bup' || act === 'bdown') { const i = cfg.bloecke.indexOf(blk), j = i + (act === 'bup' ? -1 : 1); if (j < 0 || j >= cfg.bloecke.length) return; [cfg.bloecke[i], cfg.bloecke[j]] = [cfg.bloecke[j], cfg.bloecke[i]]; }
    else if (act === 'svcdel') { blk.svc = blk.svc.filter(s => s !== b.dataset.svc); }
    else if (act === 'badd') { cfg.bloecke.push({ id: M.uid('b'), name: 'BLOCK', on: true, svc: [], max: null, order: 'dist' }); }
    else if (act === 'bdel') { const n = cfg.eintraege.filter(e => e.block === blk.id).length; if (n) { msg(t('st_block_notempty', { b: blk.name, n }), 'warn'); return; } cfg.bloecke = cfg.bloecke.filter(x => x !== blk); }
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
  function pageKarte() {
    const L = M.layout(cfg);
    const D = M.deviceSlots(cfg, L);
    const starts = new Set([1, L.freeFrom, 99]); L.ranges.forEach(r => starts.add(r.from));
    const rows = D.map((d, i) => `<div class="r${L.slots[i].kind === 'free' ? ' free' : ''}${starts.has(i) && i > 0 ? ' start' : ''}${i === 99 && L.slots[99].kind === 'fixed' ? ' emerg' : ''}"><span>${pad2(d.nr)} ${esc(d.name)}</span><b>${esc(d.ch)}</b></div>`);
    const cols = [0, 1, 2, 3].map(c => `<div>${rows.slice(c * 25, c * 25 + 25).join('')}</div>`).join('');
    $('#page').innerHTML = `
<div class="spread"><h1>${t('a6_title')}</h1><div class="row"><a class="btn sec" href="#aktuell">← ${t('nav_aktuell')}</a><button type="button" data-act="print">${t('a6_print')}</button></div></div>
<p class="note">${t('a6_note')}</p>
<div class="a6wrap"><div class="a6" role="img" aria-label="${esc(t('a6_title'))}">
  <div class="hd"><div><strong>«${esc(cfg.name || '–')}»</strong><span>${t('a6_draft')} · ${esc(fmtDT(new Date()))} · krt2.wicki.aero · ${t('a6_nosort')}</span></div><img src="./img/logo.png" alt="Wicki Partners Ballonteam"></div>
  <div class="cols">${cols}</div>
</div></div>`;
    $('#page').addEventListener('click', ev => { if (ev.target.closest('[data-act=print]')) window.print(); });
  }

  // ---------- Platzhalterseiten ----------
  function pageLater(v, key) {
    $('#page').innerHTML = `<section class="card stack"><h1>${t('later_title', { v })}</h1><p style="margin:0">${t(key)}</p>
<p class="note">${t('later_test')}: <a href="./test.html">test.html</a> · <a href="./test.html?sim=1">${t('later_sim')}</a></p></section>${footerNote()}`;
  }

  // ---------- Ereignisse ----------
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'lang') { I.setLang(b.dataset.v); render(); return; }
    if (b.dataset.act === 'mclose') { const id = b.closest('[data-mid]').dataset.mid; const i = msgs.findIndex(m => m.id === id); if (i >= 0) msgs.splice(i, 1); renderMsgs(); return; }
    if (b.dataset.act === 'mcopy') { const m = msgs.find(x => x.id === b.closest('[data-mid]').dataset.mid); if (m && navigator.clipboard) navigator.clipboard.writeText(m.text).catch(() => {}); return; }
    const r = route();
    if (r === 'editor' || (b.dataset.act === 'load' || b.dataset.act === 'saveas' || b.dataset.act === 'csv')) onEditorClick(ev);
    else if (r === 'einstellungen') onEinstClick(ev);
  });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'file') { onFile(ev.target); return; }
    const r = route();
    if (r === 'editor') onEditorChange(ev);
    else if (r === 'einstellungen') onEinstChange(ev);
  });
  document.addEventListener('input', ev => { if (route() === 'editor') onKurzInput(ev); });

  function onFile(inp) {
    const f = inp.files && inp.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try { cfg = M.fromJSON(String(rd.result)); saveDraft(); msg(t('m_loaded', { n: cfg.name || f.name }), 'ok'); render(); }
      catch (e) { msg(t('m_load_err', { e: e.message }), 'err'); }
    };
    rd.readAsText(f);
  }

  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  I.setLang(I.lang);
  render();
  window.KRT2APP = { get cfg() { return cfg; }, version: VERSION };
})();
