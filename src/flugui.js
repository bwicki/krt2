/* krt2.wicki.aero – Seite «Im Flug» (0.6.0): Funkgerät, GPS, Vorausschau-Sektor, Vorschlag und Schreiben je Block,
   Fluglog, Vorbereitung für den Flug ohne Netz. Logik in src/flug.js, Verbindung in src/link.js, Gerätestand über
   src/geraet.js. Für das Handy gebaut (Seite hochkant, grosse Knöpfe). */
(function (root) {
  'use strict';
  const DATA = 'https://raw.githubusercontent.com/bwicki/krt2/data/';
  const LS_LOG = 'krt2.fluglog', LS_OFF = 'krt2.offline', LOG_MAX = 1000, HIST_MS = 20 * 60000;
  const F = root.KRT2FLUG, A = root.KRT2AREA, M = root.KRT2MODEL, L = root.KRT2LINK.link;
  const S = { gps: { on: false, id: null, hist: [], err: '', acc: null, at: null }, manual: '', index: null, files: {}, plans: {}, write: {}, busy: {}, prep: false };
  let ctx = null;
  const t = (k, o) => ctx.t(k, o), esc = s => ctx.esc(s), $ = s => document.querySelector(s);
  const here = () => ctx && ctx.route() === 'flug';
  const cfg = () => ctx.cfg;
  const pad2 = n => String(n).padStart(2, '0');
  const fst = () => M.flugOf(cfg());
  const SIM = /[?&]sim\b/.test(root.location ? root.location.search : '');
  const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };

  // ---------- GPS ----------
  function gpsStart() {
    if (!root.navigator || !root.navigator.geolocation) { ctx.msg(t('fl_gps_none'), 'err'); return; }
    S.gps.on = true; S.gps.err = '';
    S.gps.id = root.navigator.geolocation.watchPosition(p => {
      const c = p.coords, now = p.timestamp || Date.now(), h = S.gps.hist, last = h[h.length - 1];
      const alt = c.altitude == null ? null : c.altitude;
      if (!last || now - last.t >= 4000) h.push({ t: now, lat: c.latitude, lon: c.longitude, alt }); else Object.assign(last, { t: now, lat: c.latitude, lon: c.longitude, alt });
      while (h.length && now - h[0].t > HIST_MS) h.shift();
      S.gps.acc = Math.round(c.accuracy); S.gps.at = Date.now(); S.gps.err = '';
      if (here()) paintStatus();
    }, e => { S.gps.err = e.message; if (here()) paintStatus(); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    wakeOn(); paintStatus();
  }
  function gpsStop() { if (S.gps.id !== null && root.navigator.geolocation) root.navigator.geolocation.clearWatch(S.gps.id); S.gps.on = false; S.gps.id = null; wakeOff(); paintStatus(); }
  // Bildschirm wach halten, solange GPS läuft: ohne Bildschirm liefert Chrome auf Android keine Positionen
  let wake = null;
  async function wakeOn() {
    if (wake || !root.navigator.wakeLock || document.visibilityState !== 'visible') return;
    try { wake = await root.navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch (e) { wake = null; }
  }
  function wakeOff() { if (wake) { try { wake.release(); } catch (e) { /* egal */ } wake = null; } }
  const pos = () => S.gps.hist[S.gps.hist.length - 1] || null;
  function direction() {
    const m = String(S.manual).trim();
    if (m !== '' && !isNaN(+m)) return { bearing: ((Math.round(+m) % 360) + 360) % 360, hand: true };
    const tr = F.track(S.gps.hist);
    return tr ? { bearing: tr.bearing, kmh: tr.kmh, hand: false } : { bearing: null };
  }

  // ---------- Daten (über den Service Worker auch ohne Netz) ----------
  async function index() {
    if (S.index) return S.index;
    const r = await fetch(DATA + 'index.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('index: HTTP ' + r.status);
    S.index = await r.json(); return S.index;
  }
  async function file(cc) {
    if (S.files[cc]) return S.files[cc];
    const r = await fetch(DATA + 'freq-' + cc + '.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('freq-' + cc + ': HTTP ' + r.status);
    S.files[cc] = await r.json(); return S.files[cc];
  }
  function bboxAround(p, km) {
    const c = Math.cos(p.lat * Math.PI / 180);
    return [p.lon - km / (111.32 * c), p.lat - km / 110.574, p.lon + km / (111.32 * c), p.lat + km / 110.574];
  }

  // ---------- Vorschlag und Schreiben ----------
  function flightBlocks() {
    const ids = fst().bloecke || [];
    return cfg().bloecke.filter(b => b.on && ids.includes(b.id));
  }
  async function plan(bid) {
    const c = cfg(), blk = c.bloecke.find(b => b.id === bid); if (!blk) return;
    const p = pos(); if (!p) { ctx.msg(t('fl_need_pos'), 'warn'); return; }
    await ctx.GR.ensure();
    const a = ctx.GR.aktuell(); if (!a || !Array.isArray(a.plaetze)) { ctx.msg(t('fl_need_state'), 'warn'); return; }
    const st = fst(), dir = direction();
    const area = F.sectorArea(p, dir.bearing, +st.winkel, +st.distKm);
    S.busy[bid] = true; paintBlock(bid);
    try {
      const ix = await index();
      const P = A.projector(p.lat, p.lon);
      const ccs = A.countriesFor(ix, A.bboxOf(area, P, (c.hoehe && c.hoehe.marginKm) || 0));
      const got = await Promise.allSettled(ccs.map(file));
      const data = got.filter(g => g.status === 'fulfilled').map(g => g.value);
      if (!data.length) throw new Error(got[0] && got[0].reason ? got[0].reason.message : t('fl_no_data'));
      const lo = A.parseAlt(c.hoehe.von), hi = A.parseAlt(c.hoehe.bis);
      const res = A.propose(data, { area, standort: { lat: p.lat, lon: p.lon }, bandLo: isNaN(lo) ? 0 : lo, bandHi: isNaN(hi) ? 19500 : hi, radarNoLimit: !!c.hoehe.radarOhneGrenze, marginKm: (c.hoehe && c.hoehe.marginKm) || 0, services: M.servicesOf(c), adLoc: c.settings.adLoc, svcOff: [], vfr: c.settings.vfr !== false });
      const pl = F.planBlock({ cfg: c, block: blk, entries: res.entries, device: a.plaetze });
      S.plans[bid] = { plan: pl, at: new Date(), pos: { lat: p.lat, lon: p.lon }, dir, n: res.entries.length };
      S.write[bid] = null;
    } catch (e) { ctx.msg(t('fl_data_err', { e: e.message }), 'err'); }
    S.busy[bid] = false; paintBlock(bid);
  }
  async function write(bid) {
    const c = cfg(), blk = c.bloecke.find(b => b.id === bid), P = S.plans[bid];
    if (!blk || !P || !P.plan.changes.length) return;
    if (!L.linked) { ctx.msg(t('fl_need_link'), 'warn'); return; }
    const list = F.writeList(P.plan);
    if (!(await ctx.ask(t('fl_write_q', { n: list.length, b: blk.name }), t('fl_write_b'), t('fl_write_go'), t('cancel'), 'primary'))) return;
    const W = S.write[bid] = { running: true, res: {}, done: 0, total: list.length, pause: null };
    paintBlock(bid);
    await L.program(list, {
      onSlot: (nr, r) => { W.res[nr] = r; W.done++; if (here()) paintBlock(bid); },
      onPause: w => { W.pause = w; if (here()) paintBlock(bid); }
    });
    W.running = false;
    const okN = list.filter(x => W.res[x.nr] && W.res[x.nr].kind === 'ACK').length;
    const failed = list.filter(x => !W.res[x.nr] || W.res[x.nr].kind !== 'ACK').map(x => pad2(x.nr));
    const rows = F.logRows(P.plan, blk, W.res, P.pos);
    const log = readJSON(LS_LOG, []).concat(rows).slice(-LOG_MAX);
    try { localStorage.setItem(LS_LOG, JSON.stringify(log)); } catch (e) { /* Speicher voll */ }
    if (okN) {
      const a = ctx.GR.aktuell();
      const plaetze = F.applyPlan(a.plaetze, P.plan, blk, W.res);
      try {
        const where = await ctx.GR.storeAktuell(Object.assign({}, a, { plaetze, herkunft: 'geschrieben', flug: new Date().toISOString() }));
        ctx.msg(t(where === 'server' ? 'gr_m_saved_srv' : where === 'offline' ? 'gr_m_saved_off' : 'gr_m_saved_loc', { d: ctx.GR.devLabel() }), 'ok');
      } catch (e) { ctx.msg(t('gr_m_store_err', { e: e.message }), 'err'); }
    }
    // Plätze anderer Blöcke können sich verschoben haben (Block weg oder wieder da): deren Vorschläge neu holen
    Object.keys(S.plans).forEach(k => { if (k !== bid && !(S.write[k] && S.write[k].running)) { S.plans[k] = null; S.write[k] = null; } });
    if (failed.length) ctx.msg(t('fl_w_fail', { b: blk.name, n: failed.length, s: failed.join(', ') }), 'err');
    else ctx.msg(t('fl_w_done', { b: blk.name, n: okN }), 'ok');
    if (here()) { flightBlocks().forEach(x => paintBlock(x.id)); paintLog(); paintStatus(); }
  }

  // ---------- Ohne Netz ----------
  async function prepare() {
    const c = cfg(), p = pos() || (c.standort && c.standort.lat != null ? c.standort : null);
    if (!p) { ctx.msg(t('fl_need_pos'), 'warn'); return; }
    const R = Math.max(300, 2 * (+fst().distKm || 100));
    S.prep = true; paintOff();
    try {
      S.index = null; const ix = await index();
      const ccs = A.countriesFor(ix, bboxAround(p, R));
      S.files = {};
      const got = await Promise.allSettled(ccs.map(file));
      const have = ccs.filter((_, i) => got[i].status === 'fulfilled');
      const sw = !!(root.navigator.serviceWorker && root.navigator.serviceWorker.controller);
      const off = { ccs: have, at: new Date().toISOString(), generated: ix.generated || null, sw };
      try { localStorage.setItem(LS_OFF, JSON.stringify(off)); } catch (e) { /* egal */ }
      ctx.msg(t(sw ? 'fl_off_done' : 'fl_off_loaded', { c: have.map(x => x.toUpperCase()).join(', ') }), sw ? 'ok' : 'warn');
    } catch (e) { ctx.msg(t('fl_data_err', { e: e.message }), 'err'); }
    S.prep = false; if (here()) paintOff();
  }

  // ---------- Darstellung ----------
  function render() {
    const page = $('#page'); if (!page) return;
    page.className = '';
    page.innerHTML = `
<div class="spread"><h1>${t('fl_title')}</h1></div>
<section class="card stack"><span class="label">${t('fl_status')}</span><div class="stack" id="fl-status"></div>
<div class="row fl-row"><label class="label" for="fl-dir">${t('fl_dir_in')}</label><input id="fl-dir" type="number" inputmode="numeric" min="0" max="359" step="1" data-fl-in="dir" value="${esc(S.manual)}" style="width:90px"></div>
<p class="note">${t('fl_note')}</p></section>
${flightBlocks().length ? flightBlocks().map(b => `<section class="card stack" id="fl-b-${esc(b.id)}"></section>`).join('') : `<section class="card stack"><span class="label">${t('fl_blocks')}</span><p class="note gr-warn">${t('fl_need_block')}</p></section>`}
<section class="card stack" id="fl-vhf"></section>
<section class="card stack" id="fl-log"></section>
<section class="card stack" id="fl-off"></section>
${ctx.footerNote()}`;
    paintStatus(); flightBlocks().forEach(b => paintBlock(b.id)); paintLog(); paintOff();
    if (root.KRT2VHFUI) root.KRT2VHFUI.paint();
  }
  function radioBadge() {
    if (L.state === 'recovering') return `<span class="badge y">${t('fl_st_recover')}</span>`;
    if (!L.connected) return `<span class="badge">${t('fl_st_off')}</span>`;
    return `<span class="badge ${L.linked ? 'g' : 'y'}">${t(L.linked ? 'fl_st_linked' : 'fl_st_wait')}${L.sim ? ' · ' + t('gr_st_sim') : ''}</span>${L.st.tx ? ` <span class="badge r">${t('fl_st_tx')}</span>` : ''}`;
  }
  function paintStatus() {
    const el = $('#fl-status'); if (!el) return;
    const p = pos(), d = direction(), st = fst(), a = ctx.GR.aktuell();
    const gps = !S.gps.on ? `<span class="badge">${t('fl_gps_off')}</span>` : S.gps.err ? `<span class="badge r">${esc(t('fl_gps_err', { e: S.gps.err }))}</span>`
      : p ? `<span class="badge g">${t('fl_gps_fix', { a: S.gps.acc, s: Math.round((Date.now() - S.gps.at) / 1000) })}</span>` : `<span class="badge y">${t('fl_gps_wait')}</span>`;
    const dirTxt = d.bearing == null ? t('fl_dir_none') : d.hand ? t('fl_dir_hand', { b: pad3(d.bearing), c: F.compass(d.bearing) }) : t('fl_dir_gps', { b: pad3(d.bearing), c: F.compass(d.bearing), v: d.kmh == null ? '–' : Math.round(d.kmh) });
    el.innerHTML = `
<div class="row fl-row"><span class="label">${t('fl_radio')}</span><span>${radioBadge()}</span>
  ${L.connected || L.state === 'recovering' ? `<button type="button" class="sec" data-fl="disconnect">${t(L.connected ? 'fl_disconnect' : 'gr_recover_stop')}</button>` : `<button type="button" data-fl="connect" ${L.supported ? '' : 'disabled'}>${t('fl_connect')}</button>${SIM ? `<button type="button" class="sec" data-fl="sim">${t('gr_sim')}</button>` : ''}`}</div>
<div class="row fl-row"><span class="label">${t('fl_dev')}</span><span>${a ? `<b>${esc(ctx.GR.devLabel())}</b> <span class="small muted">${esc(ctx.fmtDT(new Date(a.zeit || Date.now())))}</span>${a.pending ? ` <span class="badge y">${t('fl_dev_pending')}</span>` : ''}` : `<span class="badge y">${t('fl_dev_none')}</span>`}</span></div>
<div class="row fl-row"><span class="label">${t('fl_gps')}</span><span>${gps}</span><button type="button" class="sec" data-fl="gps">${t(S.gps.on ? 'fl_gps_stop' : 'fl_gps_start')}</button></div>
${p ? `<div class="row fl-row"><span class="label">${t('fl_pos')}</span><span class="mono">${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</span></div>` : ''}
<div class="row fl-row"><span class="label">${t('fl_dir')}</span><span>${esc(dirTxt)}</span></div>
<div class="row fl-row"><span class="label">${t('fl_ahead')}</span><span>${d.bearing == null ? t('fl_ahead_circle', { d: st.distKm }) : t('fl_ahead_val', { w: st.winkel, d: st.distKm })} · <a href="#einstellungen">${t('fl_ahead_set')}</a></span></div>`;
  }
  const pad3 = n => String(n).padStart(3, '0');
  const hhmm = iso => { const d = new Date(iso); return isNaN(d) ? '' : pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  function slotsTxt(nrs) {
    if (!nrs || !nrs.length) return '–';
    const out = []; let a = nrs[0], b = nrs[0];
    for (const n of nrs.slice(1).concat([null])) { if (n === b + 1) { b = n; continue; } out.push(a === b ? pad2(a) : pad2(a) + '–' + pad2(b)); a = b = n; }
    return out.join(', ');
  }
  function paintBlock(bid) {
    const el = $('#fl-b-' + bid); if (!el) return;
    const blk = cfg().bloecke.find(b => b.id === bid); if (!blk) return;
    const P = S.plans[bid], W = S.write[bid], a = ctx.GR.aktuell();
    const devNrs = a && a.plaetze ? F.slotsOf(a.plaetze, blk).map(p => p.nr) : [];
    const nrs = P ? P.plan.nrs : devNrs;
    const res = nr => (W && W.res[nr]) || null;
    const ch = P ? P.plan.changes : [];
    let body = '';
    if (P) {
      body = `<p class="small muted" style="margin:0">${t('fl_plan_info', { z: P.at.toTimeString().slice(0, 5), n: P.n, k: P.plan.keep.length, c: ch.length })}</p>`;
      if (P.plan.mode === 'drop') body += `<p class="note gr-warn">${t('fl_plan_drop', { b: esc(blk.name) })}</p>`;
      if (P.plan.mode === 'insert') body += `<p class="note">${t('fl_plan_insert', { b: esc(blk.name), n: P.plan.nrs.length })}</p>`;
      if (P.plan.mode === 'resize') body += `<p class="note">${t('fl_plan_resize', { b: esc(blk.name), n: P.plan.nrs.length, m: P.plan.before })}</p>`;
      if (P.plan.dropped && P.plan.dropped.length) body += `<p class="note gr-warn">${t('fl_plan_lost', { s: esc(P.plan.dropped.map(x => x.name).join(', ')) })}</p>`;
      if (!ch.length) body += `<p class="note">${t(P.plan.chosen ? 'fl_plan_none' : 'fl_plan_empty')}</p>`;
      else body += `<div class="card flush"><table class="grid fl-plan"><thead><tr><th style="width:56px">${t('col_nr')}</th><th>${t('gr_col_old')}</th><th>${t('gr_col_new')}</th><th style="width:110px">${t('gr_col_state')}</th></tr></thead><tbody>
${ch.map(c => { const r = res(c.nr), info = c.neu.moved ? t('fl_moved', { b: c.neu.block || '–' }) : [c.neu.klar, c.neu.dist == null ? '' : c.neu.dist + ' km'].filter(Boolean).join(' · ');
  return `<tr><td class="nr">${pad2(c.nr)}</td><td class="mono small">${c.old ? esc(c.old.ch + ' ' + (c.old.name || '')) : '–'}</td><td><span class="mono">${esc(c.neu.ch + ' ' + c.name)}</span>${info ? ` <span class="small muted">${esc(info)}</span>` : ''}</td>
<td>${r ? `<span class="badge ${r.kind === 'ACK' ? 'g' : 'r'}">${r.kind === 'ACK' ? t('gr_w_ok', { ms: r.ms }) : esc(r.kind)}</span>` : `<span class="badge y">${t('gr_st_changed')}</span>`}</td></tr>`; }).join('')}
</tbody></table></div>`;
      if (W) {
        const pct = Math.round(100 * W.done / Math.max(1, W.total));
        body += `<div class="gr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><span class="small muted">${t('fl_w_state', { d: W.done, n: W.total })}</span>${W.running && W.pause ? ` <span class="badge y">${t('gr_wait_link')}</span>` : W.running && L.st.tx ? ` <span class="badge y">${t('gr_wait_tx')}</span>` : ''}`;
      }
    }
    const done = W && !W.running;
    el.innerHTML = `<div class="spread"><div class="stack" style="gap:2px"><span class="label">${t('fl_block', { b: esc(blk.name) })}</span><span class="small muted">${t('fl_block_slots', { a: slotsTxt(nrs) })}</span></div>
  <button type="button" class="sec" data-fl="plan" data-b="${esc(bid)}" ${S.busy[bid] || (W && W.running) ? 'disabled' : ''}>${S.busy[bid] ? t('fl_loading') : t(P ? 'fl_plan_again' : 'fl_plan')}</button></div>
${body}
${P && ch.length && !done ? `<div class="row"><button type="button" class="fl-big" data-fl="write" data-b="${esc(bid)}" ${W && W.running ? 'disabled' : ''}>${t('fl_write', { n: ch.length })}</button></div>` : ''}`;
  }
  function paintLog() {
    const el = $('#fl-log'); if (!el) return;
    const log = readJSON(LS_LOG, []);
    el.innerHTML = `<div class="spread"><span class="label">${t('fl_log')}</span><div class="row"><button type="button" class="sec" data-fl="logsave" ${log.length ? '' : 'disabled'}>${t('fl_log_save')}</button><button type="button" class="ghost" data-fl="logclear" ${log.length ? '' : 'disabled'}>${t('fl_log_clear')}</button></div></div>
<p class="note">${t('fl_log_note')}</p>
${log.length ? `<div class="stack" style="gap:2px">${log.slice(-8).reverse().map(r => `<span class="small"><span class="mono">${esc(hhmm(r.zeit))}</span> ${esc(r.block)} ${pad2(r.nr)}: <span class="mono">${esc(r.alt ? r.alt.ch + ' ' + r.alt.name : '–')} → ${esc(r.neu.ch + ' ' + r.neu.name)}</span> <span class="badge ${r.ok ? 'g' : 'r'}">${t(r.ok ? 'fl_log_ok' : 'fl_log_bad')}</span></span>`).join('')}</div>` : `<p class="small muted" style="margin:0">${t('fl_log_empty')}</p>`}`;
  }
  function paintOff() {
    const el = $('#fl-off'); if (!el) return;
    const o = readJSON(LS_OFF, null), R = Math.max(300, 2 * (+fst().distKm || 100));
    const sw = !!(root.navigator && root.navigator.serviceWorker);
    el.innerHTML = `<span class="label">${t('fl_off')}</span><p class="note">${t('fl_off_note', { r: R })}</p>
<div class="row"><button type="button" class="sec" data-fl="prepare" ${sw && !S.prep ? '' : 'disabled'}>${t(S.prep ? 'fl_loading' : 'fl_off_btn')}</button></div>
<p class="small ${o ? '' : 'muted'}" style="margin:0">${!sw ? t('fl_off_nosw') : o ? t('fl_off_ok', { c: o.ccs.map(x => x.toUpperCase()).join(', ') || '–', d: o.generated ? ctx.fmtDT(new Date(o.generated)) : '–', z: ctx.fmtDT(new Date(o.at)) }) : t('fl_off_none')}</p>`;
  }

  // ---------- Ereignisse ----------
  async function onClick(ev) {
    const b = ev.target.closest('[data-fl]'); if (!b) return;
    const a = b.dataset.fl, bid = b.dataset.b;
    if (a === 'connect' || a === 'sim') { try { await L.connect({ sim: a === 'sim' }); ctx.msg(t(a === 'sim' ? 'gr_m_sim' : 'gr_m_conn'), 'ok'); } catch (e) { if (!e || e.name !== 'NotFoundError') ctx.msg(t('gr_m_conn_err', { e: e.message }), 'err'); } paintStatus(); return; }
    if (a === 'disconnect') { if (Object.values(S.write).some(w => w && w.running)) { ctx.msg(t('gr_busy'), 'warn'); return; } await L.disconnect(); ctx.msg(t('gr_m_disc'), 'info'); paintStatus(); return; }
    if (a === 'gps') { if (S.gps.on) gpsStop(); else gpsStart(); return; }
    if (a === 'plan') { plan(bid); return; }
    if (a === 'write') { write(bid); return; }
    if (a === 'logsave') { ctx.download('krt2_fluglog_' + ctx.stamp() + '.csv', '﻿' + F.logCsv(readJSON(LS_LOG, [])), 'text/csv'); return; }
    if (a === 'logclear') { if (await ctx.ask(t('fl_log_clear_q'), t('fl_log_clear_b'), t('fl_log_clear'), t('cancel'))) { localStorage.removeItem(LS_LOG); paintLog(); } return; }
    if (a === 'prepare') { if (!S.prep) prepare(); return; }
  }
  function onChange(ev) {
    const el = ev.target;
    if (el.dataset.flIn === 'dir') {
      S.manual = el.value; paintStatus();
      Object.keys(S.plans).forEach(k => { if (!(S.write[k] && S.write[k].running)) { S.plans[k] = null; S.write[k] = null; paintBlock(k); } });
    }
  }

  root.KRT2FLUGUI = {
    init(c) {
      ctx = c;
      L.on(type => { if (!here()) return; if (type === 'status' || type === 'wait') { paintStatus(); Object.keys(S.write).forEach(paintBlock); } });
      setInterval(() => { if (here() && S.gps.on) paintStatus(); }, 5000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.gps.on) wakeOn(); });
    },
    async render() { render(); await ctx.GR.ensure(); if (here()) render(); },
    onClick, onChange,
    _state: S   // für Tests
  };
})(typeof window !== 'undefined' ? window : globalThis);
