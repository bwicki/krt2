/* krt2.wicki.aero – Seite «Gerät» (ab 0.4.0): Funkgerät verbinden, Ausgangsstand sichern (von Hand auslesen oder aus
   Datei), alt mit neu vergleichen, alle 100 Plätze schreiben, Gerätestand festhalten, Stichprobe am Gerät.
   Ab 0.4.1: die gespeicherte Sicherung ins Gerät zurückschreiben (Server-Verlauf, dazu eine Kopie in diesem Browser).
   Die Verbindung (src/link.js) und eine laufende Aufnahme (src/readout.js) bleiben bestehen, wenn man die Seite wechselt. */
(function (root) {
  'use strict';
  const L = root.KRT2LINK.link, RO = root.KRT2READOUT, C = root.KRT2CODEC;
  const LS_DEV = 'krt2.progdev', LS_LOCAL = 'krt2.lokal.aktuell', LS_BAK = 'krt2.sicherung.';
  const pad2 = n => String(n).padStart(2, '0');
  const nm = s => String(s || '').trimEnd();
  const sameSlot = (a, b) => !!a && !!b && a.ch === b.ch && nm(a.name) === nm(b.name);
  const SIM = /[?&]sim\b/.test(root.location ? root.location.search : '');

  const S = {
    devId: null, dev: null, devErr: '', ro: new RO.Readout(), roOn: false, roSaved: false, imp: null, impName: '',
    prog: null, showAll: false, check: { on: false, list: [] }, asked: {}, backup: null
  };
  try { S.devId = localStorage.getItem(LS_DEV); S.devPicked = !!S.devId; } catch (e) { /* egal */ }
  let ctx = null;
  const t = (k, o) => ctx.t(k, o), esc = s => ctx.esc(s);
  const $ = s => document.querySelector(s);
  const here = () => ctx && ctx.route() === 'geraet';

  // ---------- Gerät und Gerätestand ----------
  const me = () => ctx.API.user;
  const ownDevs = () => (me() && Array.isArray(ctx.ui.devices) ? ctx.ui.devices.filter(d => d.owner.id === me().id) : []);
  function localAktuell() { try { return JSON.parse(localStorage.getItem(LS_LOCAL) || 'null'); } catch (e) { return null; } }
  /** Gerätestand des gewählten Geräts: { plaetze[100], herkunft, zeit, configName, version, quittiert } oder null. */
  function aktuell() {
    if (S.devId === 'lokal' || !S.devId) return localAktuell();
    return S.dev && S.dev.id === S.devId ? S.dev.aktuell : null;
  }
  function devLabel() { return S.devId && S.devId !== 'lokal' && S.dev ? S.dev.bezeichnung : t('gr_local'); }
  /** Gerät wählen; nur eine ausdrückliche Wahl (Auswahlfeld) wird für den nächsten Besuch gemerkt. */
  async function chooseDevice(id, explicit) {
    S.devId = id || 'lokal'; S.dev = null; S.devErr = '';
    if (explicit) { S.devPicked = true; try { localStorage.setItem(LS_DEV, S.devId); } catch (e) { /* egal */ } }
    if (S.devId !== 'lokal') {
      try { S.dev = await ctx.API.device(S.devId); ctx.setDeviceSel(S.devId); }
      catch (e) { S.devErr = e.message; ctx.msg(t('m_api_err', { e: e.message }), 'err'); }
    }
    S.backup = null; await loadBackup();
    if (here()) render();
  }
  async function initDevice() {
    if (ctx.API.enabled && me() && ctx.ui.devices == null) { try { ctx.ui.devices = await ctx.API.devices(); } catch (e) { ctx.ui.devices = false; } }
    const own = ownDevs();
    if (S.devId && S.devId !== 'lokal' && !own.find(d => d.id === S.devId)) S.devId = null;
    if (S.devId === 'lokal' && !S.devPicked && own.length) S.devId = null;   // nach dem Anmelden das eigene Gerät vorschlagen
    if (!S.devId) S.devId = (ctx.ui.deviceSel && own.find(d => d.id === ctx.ui.deviceSel) ? ctx.ui.deviceSel : own[0] ? own[0].id : 'lokal');
    if (S.devId !== 'lokal' && (!S.dev || S.dev.id !== S.devId)) await chooseDevice(S.devId);
    else if (!S.backup) await loadBackup();
  }
  /** Gespeicherte Sicherung des gewählten Geräts: jüngster Stand «ausgelesen» vom Server, sonst die Kopie in diesem Browser. */
  async function loadBackup() {
    const key = S.devId || 'lokal';
    let b = null;
    try { b = JSON.parse(localStorage.getItem(LS_BAK + key) || 'null'); } catch (e) { b = null; }
    if (key !== 'lokal' && ctx.API.enabled) {
      try { const sv = await ctx.API.sicherung(key); if (sv && (!b || sv.zeit >= b.zeit)) b = sv; } catch (e) { /* ältere API ohne Sicherung: Kopie im Browser genügt */ }
    }
    if ((S.devId || 'lokal') === key) S.backup = b && Array.isArray(b.plaetze) && b.plaetze.length === 100 ? b : null;
  }
  function keepBackup(a) { try { localStorage.setItem(LS_BAK + (S.devId || 'lokal'), JSON.stringify(a)); } catch (e) { /* Speicher voll: Server genügt */ } }

  /** Gerätestand speichern: beim eigenen Gerät auf dem Server (mit Verlauf), sonst nur in diesem Browser. */
  async function storeAktuell(a) {
    const plaetze = a.plaetze.map((p, i) => {
      const n = C.normalizeName(p.name);
      const o = { nr: i, ch: p.ch, name: n.trimmed };
      for (const k of ['klar', 'dienst', 'block', 'kind', 'cc']) if (p[k]) o[k] = p[k];
      return o;
    });
    if (a.herkunft === 'ausgelesen') keepBackup(Object.assign({}, a, { plaetze, zeit: new Date().toISOString() }));
    if (S.devId && S.devId !== 'lokal') {
      S.dev = await ctx.API.setAktuell(S.devId, Object.assign({}, a, { plaetze }));
      ctx.refreshDevices(S.devId);
      return 'server';
    }
    localStorage.setItem(LS_LOCAL, JSON.stringify(Object.assign({}, a, { plaetze, zeit: new Date().toISOString() })));
    return 'lokal';
  }

  // ---------- Soll aus dem Entwurf ----------
  function target() {
    const cfg = ctx.cfg, R = ctx.M.check(cfg), slots = ctx.M.deviceSlots(cfg, R.layout);
    const red = Object.values(R.byEntry).reduce((n, l) => n + l.filter(x => x.lvl === 'r').length, 0);
    return { slots, red, bad: slots.filter(s => !s.ok).map(s => s.nr) };
  }
  function diff(a, tg) {
    let same = 0, changed = 0, unknown = 0;
    const rows = tg.slots.map((s, i) => {
      const old = a && a.plaetze ? a.plaetze[i] : null;
      const st = !old ? 'unknown' : sameSlot(old, s) ? 'same' : 'changed';
      if (st === 'same') same++; else if (st === 'changed') changed++; else unknown++;
      return { nr: i, old, neu: s, st };
    });
    return { rows, same, changed, unknown };
  }

  // ---------- Verbindung ----------
  async function connect(sim) {
    try { await L.connect({ sim }); ctx.msg(t(sim ? 'gr_m_sim' : 'gr_m_conn'), 'ok'); }
    catch (e) { if (e && e.name === 'NotFoundError') return; ctx.msg(t('gr_m_conn_err', { e: e.message }), 'err'); }
    if (here()) render();
  }
  function onLink(type, d) {
    if (type === 'status') {
      const a = document.querySelector('nav.main a[href="#geraet"]'); if (a) a.classList.toggle('live', L.connected);
      if (L.linked) maybeAskBackup();
      if (here()) { paintStatus(); paintProg(); paintRestore(); }
      return;
    }
    if (type === 'sim') { if (here()) paintSim(); return; }
    if (type !== 'R' || d.burst) { if (here()) paintStatus(); return; }
    const r = { t: d.t, freq: d.freq, name: d.name };
    if (S.roOn) onReadoutR(r);
    else if (S.check.on) onCheckR(r);
    if (here()) { paintStatus(); paintSim(); }
  }
  async function maybeAskBackup() {
    const key = S.devId || 'lokal';
    if (S.devId && S.devId !== 'lokal' && (!S.dev || S.dev.id !== S.devId)) return;   // Gerät noch nicht geladen
    if (S.asked[key] || aktuell() || S.roOn || (S.prog && S.prog.running)) return;
    S.asked[key] = true;
    const v = await ctx.choose(t('gr_ask_title', { d: devLabel() }), t('gr_ask_body'),
      [['read', t('gr_ask_read')], ['file', t('gr_ask_file')], ['no', t('gr_ask_no')]]);
    if (v === 'read') { if (ctx.route() !== 'geraet') location.hash = '#geraet'; startReadout(); }
    else if (v === 'file') { if (ctx.route() !== 'geraet') location.hash = '#geraet'; setTimeout(() => { const f = $('#gr-file'); if (f) f.click(); }, 50); }
  }

  // ---------- Sichern: von Hand auslesen ----------
  function startReadout(keep) {
    if (S.prog && S.prog.running) return;
    S.check.on = false; S.imp = null;
    S.ro.start(keep); S.roOn = true; S.roSaved = false;
    ctx.msg(t('gr_m_ro_start'), 'info');
    if (here()) render();
    setTimeout(() => { const i = $('#gr-sel'); if (i) i.focus(); }, 0);
  }
  function onReadoutR(r) {
    const res = S.ro.onR(r);
    if (res.type === 'closed') { S.roOn = false; ctx.msg(t('gr_m_ro_closed', { p: pad2(res.slot) }), 'ok'); if (here()) render(); return; }
    if (res.type === 'mismatch') ctx.msg(t('gr_m_ro_mismatch', { p: pad2(res.slot) }), 'warn');
    if (here()) paintRo();
  }
  function applySel() {
    const inp = $('#gr-sel'); if (!inp) return;
    const v = inp.value.trim(), nr = Number(v);
    if (v === '' || !Number.isInteger(nr) || nr < 0 || nr > 99) { ctx.msg(t('gr_sel_bad'), 'warn'); return; }
    inp.value = '';
    const res = S.ro.sel(nr);
    if (res.type === 'none') ctx.msg(t('gr_sel_none'), 'warn');
    else if (res.type === 'anchor') ctx.msg(t('gr_m_anchor', { p: pad2(nr), n: res.back }), 'info');
    else if (res.type === 'ok') ctx.msg(t('gr_m_chk_ok', { p: pad2(nr) }), 'info');
    else if (res.type === 'jump') ctx.msg(t('gr_m_jump', { p: pad2(nr), w: pad2(res.was) }), 'info');
    else if (res.type === 'bad') ctx.msg(t('gr_m_chk_bad', { p: pad2(nr), w: pad2(res.was), s: res.shaky }), 'warn');
    paintRo(); inp.focus();
  }
  function roPlaetze() { return S.ro.plaetze(); }
  async function saveReadout(plaetze, quelle) {
    if (plaetze.some(p => !p)) { ctx.msg(t('gr_m_incomplete'), 'warn'); return; }
    try {
      const where = await storeAktuell({ plaetze, herkunft: 'ausgelesen', configId: null, configName: quelle || '', version: null, quittiert: null });
      ctx.msg(t(where === 'server' ? 'gr_m_saved_srv' : 'gr_m_saved_loc', { d: devLabel() }), 'ok');
      if (S.imp) S.imp = null; else S.roSaved = true;
      await loadBackup(); render();
    } catch (e) { ctx.msg(t('m_api_err', { e: e.message }), 'err'); }
  }
  function backupFile(plaetze, ext) {
    const name = 'krt2_sicherung_' + ctx.slug(devLabel()) + '_' + ctx.stamp() + '.' + ext;
    if (ext === 'csv') ctx.download(name, '﻿Platz;Frequenz;Name;Status\r\n' + plaetze.map((p, i) => pad2(i) + ';' + (p ? p.ch : '') + ';' + (p ? nm(p.name) : '') + ';' + (S.ro.slots[i] ? S.ro.slots[i].state : 'fehlt')).join('\r\n'), 'text/csv;charset=utf-8');
    else ctx.download(name, JSON.stringify({ typ: 'krt2-sicherung', version: 1, methode: 'von Hand (MEM und Drehknopf, Meldung «R»)', erstellt: new Date().toISOString(), werkzeug: 'krt2.wicki.aero ' + ctx.version,
      geraet: devLabel(), pruefung: roSummaryText(), plaetze: plaetze.map((p, i) => ({ platz: i, frequenz: p ? p.ch : null, name: p ? nm(p.name) : '', status: S.ro.slots[i] ? S.ro.slots[i].state : 'fehlt' })) }, null, 2));
  }
  function roSummaryText() {
    const s = S.ro.summary();
    const parts = [t('gr_ro_n', { n: s.n, k: s.kontrolliert })];
    if (s.unsicher) parts.push(t('gr_ro_unsure', { s: s.unsicher }));
    if (s.widerspruch) parts.push(t('gr_ro_conflict', { s: s.widerspruch }));
    if (s.fehlt) parts.push(t('gr_ro_missing', { s: s.fehlt }));
    if (s.closed) parts.push(t('gr_ro_closed'));
    return parts.join(' · ');
  }
  function onFile(inp) {
    const f = inp.files && inp.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try { S.imp = RO.parseBackup(String(rd.result)); S.impName = f.name; S.roOn = false; ctx.msg(t('gr_m_imp', { f: f.name, n: S.imp.filter(Boolean).length }), 'info'); }
      catch (e) { S.imp = null; ctx.msg(t('gr_m_imp_err', { e: e.message }), 'err'); }
      inp.value = ''; render();
    };
    rd.readAsText(f);
  }

  // ---------- Programmieren und Zurückschreiben ----------
  function ready() {
    if (!L.connected) return t('gr_need_conn');
    if (!L.linked) return t('gr_need_link');
    if (S.roOn) return t('gr_need_ro_off');
    if (S.prog && S.prog.running) return t('gr_busy');
    return '';
  }
  /** Neuen Entwurf schreiben (only: nur diese Plätze, z. B. fehlgeschlagene). */
  async function program(only) {
    const tg = target(), a = aktuell(), why = ready();
    if (why) { ctx.msg(why, 'warn'); return; }
    if (tg.red) { ctx.msg(t('gr_need_red', { n: tg.red }), 'warn'); return; }
    if (tg.bad.length) { ctx.msg(t('gr_need_bad', { s: tg.bad.map(pad2).join(', ') }), 'warn'); return; }
    const D = diff(a, tg), s99 = tg.slots[99];
    if (!only) {
      const body = t('gr_prog_q_body', { c: ctx.cfg.name || '–', d: devLabel(), n: a ? D.changed : 100, s: nm(s99.name) + ' ' + s99.ch }) + (a || S.backup ? '' : ' ' + t('gr_prog_q_nobak'));
      if (!(await ctx.ask(t('gr_prog_q', { d: devLabel() }), body, t('gr_prog_go'), t('cancel'), 'primary'))) return;
    }
    const sv = ctx.cfg.server;
    await writeAll(tg.slots, { kind: 'draft', configId: sv ? sv.id : null, configName: ctx.cfg.name || '', version: sv ? sv.version : null, unsaved: ctx.cfg.dirty || !sv }, only);
  }
  /** Gespeicherte Sicherung ins Gerät zurückschreiben. */
  async function restore(only) {
    const B = S.backup, why = ready();
    if (why) { ctx.msg(why, 'warn'); return; }
    if (!B) { ctx.msg(t('gr_rs_none'), 'warn'); return; }
    const slots = B.plaetze.map((p, i) => ({ nr: i, ch: p.ch, name: nm(p.name), klar: p.klar || '', dienst: p.dienst || '', block: p.block || '', cc: p.cc || '', kind: p.kind || '' }));
    const bad = slots.filter(p => !C.encodeFreq(p.ch).ok || !C.normalizeName(p.name).ok).map(p => p.nr);
    if (bad.length) { ctx.msg(t('gr_need_bad', { s: bad.map(pad2).join(', ') }), 'warn'); return; }
    if (!only) {
      const a = aktuell(), n = a && a.plaetze ? slots.filter((p, i) => !sameSlot(a.plaetze[i], p)).length : 100;
      if (!(await ctx.ask(t('gr_rs_q', { d: devLabel() }), t('gr_rs_q_body', { z: ctx.fmtDT(new Date(B.zeit)), d: devLabel(), n }), t('gr_rs_go'), t('cancel'), 'primary'))) return;
    }
    await writeAll(slots, { kind: 'restore', configId: null, configName: t('gr_rs_name', { z: ctx.fmtDT(new Date(B.zeit)) }), version: null }, only);
  }
  async function writeAll(slots, meta, only) {
    const list = only ? slots.filter(s => only.includes(s.nr)) : slots;
    S.check.on = false;
    const keep = only && S.prog && S.prog.meta.kind === meta.kind ? S.prog.res : {};
    S.prog = { running: true, stop: false, res: Object.assign({}, keep), total: list.length, done: 0, meta, slots };
    ctx.msg(t('gr_m_prog_start', { n: list.length, d: devLabel() }), 'info');
    render();
    await L.program(list, { onSlot: (nr, r) => { S.prog.res[nr] = r; S.prog.done++; if (here()) { paintProg(); paintRestore(); } }, stop: () => S.prog.stop });
    S.prog.running = false;
    const failed = slots.map(s => s.nr).filter(nr => !S.prog.res[nr] || S.prog.res[nr].kind !== 'ACK');
    S.prog.failed = failed;
    if (!failed.length) {
      const ms = Object.values(S.prog.res).map(r => r.ms).sort((x, y) => x - y);
      ctx.msg(t(meta.kind === 'restore' ? 'gr_m_rs_ok' : 'gr_m_prog_ok', { d: devLabel(), ms: ms[Math.floor(ms.length / 2)] }), 'ok');
      try {
        const where = await storeAktuell({ plaetze: slots, herkunft: 'geschrieben', configId: meta.configId, configName: meta.configName, version: meta.version, quittiert: 100 });
        ctx.msg(t(where === 'server' ? 'gr_m_saved_srv' : 'gr_m_saved_loc', { d: devLabel() }), 'ok');
        if (meta.unsaved) ctx.msg(t('gr_m_prog_unsaved'), 'info');
      } catch (e) { ctx.msg(t('gr_m_store_err', { e: e.message }), 'err'); }
    } else ctx.msg(t('gr_m_prog_fail', { n: failed.length, s: failed.map(pad2).join(', ') }), 'err');
    if (here()) render();
  }

  // ---------- Stichprobe ----------
  function onCheckR(r) {
    const a = aktuell();
    const ref = a && a.plaetze ? a.plaetze : null;
    const hits = ref ? ref.map((p, i) => (p && p.ch === r.freq && nm(p.name) === nm(r.name) ? i : -1)).filter(i => i >= 0) : [];
    S.check.list.unshift({ freq: r.freq, name: nm(r.name), hits, ref: !!ref, time: new Date() });
    S.check.list.length = Math.min(S.check.list.length, 12);
    if (here()) paintCheck();
  }

  // ---------- Darstellung ----------
  function render() {
    const page = $('#page'); if (!page) return;
    page.className = '';
    const own = ownDevs();
    const devSel = ctx.API.enabled && me()
      ? `<label class="row" for="gr-dev"><span class="muted">${t('gr_dev_pick')}</span><select id="gr-dev" data-gr="dev">${own.map(d => `<option value="${esc(d.id)}"${d.id === S.devId ? ' selected' : ''}>${esc(d.bezeichnung)}</option>`).join('')}<option value="lokal"${S.devId === 'lokal' ? ' selected' : ''}>${esc(t('gr_local'))}</option></select></label>
         ${own.length ? '' : `<a class="btn sec" href="#konfigurationen">${t('gr_dev_add')}</a>`}`
      : `<span class="small muted">${t(ctx.API.enabled ? 'gr_dev_login' : 'gr_dev_noapi')}</span>`;
    const a = aktuell();
    page.innerHTML = `
<div class="spread"><h1>${t('nav_geraet')}</h1><div class="row"><button type="button" class="sec" data-gr="logsave" ${L.log.length ? '' : 'disabled'}>${t('gr_log_save')}</button><a class="btn sec" href="./test.html">${t('testlink')}</a></div></div>

<section class="card stack" aria-labelledby="gr-l1"><span class="label" id="gr-l1">${t('gr_conn')}</span>
  <div class="row" id="gr-status"></div>
  <div class="row">${L.connected ? `<button type="button" class="sec" data-gr="disconnect">${t('gr_disconnect')}</button>`
    : `<button type="button" data-gr="connect" ${L.supported ? '' : 'disabled'}>${t('gr_connect')}</button>${SIM ? `<button type="button" class="sec" data-gr="sim">${t('gr_sim')}</button>` : ''}`}</div>
  ${L.supported || L.sim ? '' : `<p class="note gr-warn">${t('gr_unsupported')}</p>`}
  <p class="note">${t('gr_conn_note')}</p>
  <div class="row" id="gr-sim"></div>
</section>

<section class="card stack" aria-labelledby="gr-l2"><span class="label" id="gr-l2">${t('gr_dev')}</span>
  <div class="row">${devSel}</div>
  <div class="stack" style="gap:2px">${a ? `<span><b>${esc(devLabel())}</b> <span class="badge g">${t(a.herkunft === 'ausgelesen' ? 'cur_read_from' : 'cur_programmed')}</span></span>
    <span class="small muted">${a.configName ? '«' + esc(a.configName) + '»' + (a.version ? ' v' + a.version : '') + ' · ' : ''}${esc(ctx.fmtDT(new Date(a.zeit)))}${a.quittiert ? ' · ' + t('gr_acked', { n: a.quittiert }) : ''}</span>`
    : `<span><b>${esc(devLabel())}</b> <span class="badge y">${t('gr_no_state')}</span></span><span class="small muted">${t('gr_no_state_note')}</span>`}</div>
  ${S.devErr ? `<p class="note gr-warn">${esc(S.devErr)}</p>` : ''}
</section>

<section class="card stack" aria-labelledby="gr-l3" id="sichern"><span class="label" id="gr-l3">${t('gr_save')}</span>
  <p class="note">${t('gr_save_note')}</p>
  <div class="row"><button type="button" ${S.roOn ? 'disabled' : ''} data-gr="rostart">${t(S.ro.count && !S.ro.closed ? 'gr_ro_continue' : 'gr_ro_start')}</button>
    <button type="button" class="sec" data-gr="file">${t('gr_file')}</button><input type="file" id="gr-file" accept=".json,.csv,application/json,text/csv" hidden></div>
  <div id="gr-ro"></div>
  ${S.imp ? impHtml() : ''}
  <div id="gr-restore"></div>
</section>

<section class="card stack" aria-labelledby="gr-l4" id="programmieren"><span class="label" id="gr-l4">${t('gr_prog')}</span>
  <div id="gr-progbox"></div>
</section>

<section class="card stack" aria-labelledby="gr-l5"><span class="label" id="gr-l5">${t('gr_check')}</span>
  <p class="note">${t('gr_check_note')}</p>
  <div class="row"><button type="button" class="sec" data-gr="check" ${S.roOn ? 'disabled' : ''} aria-pressed="${S.check.on}">${t(S.check.on ? 'gr_check_stop' : 'gr_check_start')}</button></div>
  <div id="gr-checklist"></div>
</section>
${ctx.footerNote()}`;
    paintStatus(); paintSim(); paintRo(); paintRestore(); paintProg(); paintCheck();
  }
  function paintStatus() {
    const el = $('#gr-status'); if (!el) return;
    const sb = L.st.standby;
    el.innerHTML = `<span>${t('gr_adapter')}: <span class="badge ${L.connected ? 'g' : ''}">${t(L.sim ? 'gr_st_sim' : L.connected ? 'gr_st_conn' : 'gr_st_off')}</span></span>
<span>${t('gr_link')}: <span class="badge ${L.linked ? 'g' : L.connected ? 'y' : ''}">${t(L.linked ? 'gr_st_linked' : L.connected ? 'gr_st_wait' : 'gr_st_dash')}</span></span>
<span>${t('gr_standby')}: <span class="mono">${sb ? esc(sb.freq + ' «' + sb.name + '»') : '–'}</span></span>`;
  }
  function paintSim() {
    const el = $('#gr-sim'); if (!el) return;
    el.innerHTML = L.sim ? `<span class="small muted">${t('gr_sim_lbl')}</span><button type="button" class="sec" data-gr="simmem">MEM</button><button type="button" class="sec" data-gr="simturn">${t('gr_sim_turn')}</button><span class="mono small" id="gr-simdisp">${esc(L.writer.display)}</span>` : '';
  }
  function cell(i) {
    const e = S.ro.slots[i];
    const cls = !e ? '' : e.state === 'kontrolliert' ? 'ok' : e.state === 'unsicher' ? 'warn' : e.state === 'widerspruch' ? 'bad' : 'read';
    const tip = e ? pad2(i) + ' ' + e.freq + ' «' + e.name + '» – ' + t('gr_state_' + e.state) : pad2(i) + ' –';
    return `<span class="gr-cell ${cls}${i === S.ro.cursor ? ' cur' : ''}" title="${esc(tip)}"><b>${pad2(i)}</b>${e ? esc(e.name || '·') : ''}</span>`;
  }
  function paintRo() {
    const el = $('#gr-ro'); if (!el) return;
    const ro = S.ro;
    if (!S.roOn && !ro.count) { el.innerHTML = ''; return; }
    let prompt = '';
    if (S.roOn) {
      if (ro.cursor === null) prompt = ro.pend.length ? t('gr_ro_need_nr', { r: ro.pend[ro.pend.length - 1].r.freq + ' «' + nm(ro.pend[ro.pend.length - 1].r.name) + '»' }) : t('gr_ro_first');
      else { const e = ro.slots[ro.cursor]; prompt = t('gr_ro_last', { p: pad2(ro.cursor), r: e.freq + ' «' + e.name + '»' }); }
    }
    el.innerHTML = `${S.roOn ? `<ol class="small gr-steps"><li>${t('gr_ro_s1')}</li><li>${t('gr_ro_s2')}</li><li>${t('gr_ro_s3')}</li></ol>
<div class="row"><label for="gr-sel">${t('gr_sel_lbl')}</label><input id="gr-sel" type="number" min="0" max="99" class="mono" style="width:72px"><button type="button" data-gr="sel">${t('gr_sel_btn')}</button>
<button type="button" class="sec" data-gr="undo" ${ro.hist.length ? '' : 'disabled'}>${t('gr_undo')}</button><button type="button" class="sec" data-gr="rostop">${t('gr_ro_stop')}</button></div>
<p class="gr-prompt ${ro.cursor === null ? 'warn' : ''}">${esc(prompt)}</p>` : ''}
<p class="small"><b>${esc(roSummaryText())}</b></p>
${S.roSaved ? `<p class="note">${t('gr_ro_saved_note', { d: devLabel() })}</p>` : `<div class="gr-grid" aria-label="${esc(t('gr_grid'))}">${Array.from({ length: 100 }, (_, i) => cell(i)).join('')}</div>`}
${!S.roOn && ro.count ? `<div class="row">${S.roSaved ? '' : `<button type="button" data-gr="rosave" ${ro.count === 100 ? '' : 'disabled'}>${t('gr_ro_save', { d: devLabel() })}</button>`}<button type="button" class="sec" data-gr="rocsv">CSV</button><button type="button" class="sec" data-gr="rojson">JSON</button><button type="button" class="ghost" data-gr="rodrop">${t('gr_ro_drop')}</button></div>
${ro.complete || S.roSaved ? '' : `<p class="note">${t('gr_ro_partial')}</p>`}` : ''}`;
  }
  function impHtml() {
    const n = S.imp.filter(Boolean).length;
    return `<div class="stack"><span><b>${esc(S.impName)}</b> · ${t('gr_imp_n', { n })}</span>
<div class="gr-grid">${S.imp.map((p, i) => `<span class="gr-cell ${p ? 'read' : ''}" title="${esc(pad2(i) + (p ? ' ' + p.ch + ' «' + p.name + '»' : ' –'))}"><b>${pad2(i)}</b>${p ? esc(p.name || '·') : ''}</span>`).join('')}</div>
<div class="row"><button type="button" data-gr="impsave" ${n === 100 ? '' : 'disabled'}>${t('gr_ro_save', { d: devLabel() })}</button><button type="button" class="ghost" data-gr="impdrop">${t('gr_ro_drop')}</button></div></div>`;
  }
  function paintProg() {
    const el = $('#gr-progbox'); if (!el) return;
    const tg = target(), a = aktuell(), D = diff(a, tg), cfg = ctx.cfg;
    const P = S.prog && S.prog.meta.kind === 'draft' ? S.prog : null, busyRs = S.prog && S.prog.running && !P;
    const src = `«${esc(cfg.name || '–')}»${cfg.server ? ' v' + cfg.server.version : ''} <span class="badge${cfg.server && !cfg.dirty ? ' g' : ' y'}">${t(cfg.server && !cfg.dirty ? 'ed_saved' : cfg.server ? 'ed_changed' : 'gr_src_draft')}</span>`;
    const block = busyRs ? t('gr_busy') : !L.connected ? t('gr_need_conn') : !L.linked ? t('gr_need_link') : S.roOn ? t('gr_need_ro_off') : tg.red ? t('gr_need_red', { n: tg.red }) : tg.bad.length ? t('gr_need_bad', { s: tg.bad.map(pad2).join(', ') }) : '';
    const sum = a ? t('gr_diff', { c: D.changed, s: D.same }) : t('gr_diff_unknown');
    const res = nr => (P && P.res[nr] ? P.res[nr] : null);
    const rows0 = D.rows.filter(r => S.showAll || r.st !== 'same' || (P && res(r.nr) && res(r.nr).kind !== 'ACK'));
    // Gleiche Nachbarn (z. B. viele Platzhalter) zu einer Zeile «15–98» zusammenfassen, ausser «alle 100 zeigen»
    const key = r => [r.st, r.old ? r.old.ch + nm(r.old.name) : '', r.neu.ch + nm(r.neu.name), r.neu.klar || '', res(r.nr) ? res(r.nr).kind : ''].join('|');
    const rows = [];
    for (const r of rows0) {
      const last = rows[rows.length - 1];
      if (!S.showAll && last && last.to === r.nr - 1 && key(last) === key(r)) { last.to = r.nr; last.n++; } else rows.push(Object.assign({}, r, { to: r.nr, n: 1 }));
    }
    const pct = P ? Math.round(100 * P.done / P.total) : 0;
    el.innerHTML = `<div class="spread"><div class="stack" style="gap:2px"><span>${t('gr_src')}: ${src}</span><span class="small muted">${esc(sum)} · ${t('gr_target_dev')}: <b>${esc(devLabel())}</b></span></div>
<div class="row">${P && P.running ? `<button type="button" class="danger" data-gr="progstop">${t('gr_prog_stop')}</button>`
  : `<button type="button" data-gr="prog" ${block ? 'disabled' : ''}>${t('gr_prog_btn')}</button>${P && P.failed && P.failed.length ? `<button type="button" class="sec" data-gr="progfail" ${block ? 'disabled' : ''}>${t('gr_prog_retry', { n: P.failed.length })}</button>` : ''}`}
<a class="btn sec" href="#editor">${t('nav_editor')}</a></div></div>
${block && !(P && P.running) ? `<p class="note">${esc(block)}</p>` : ''}
${P ? `<div class="gr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><span class="small muted">${t('gr_prog_state', { d: P.done, n: P.total })}</span>` : ''}
<div class="row"><label class="small"><input type="checkbox" data-gr="showall" ${S.showAll ? 'checked' : ''}> ${t('gr_show_all')}</label></div>
<div class="card flush"><table class="grid"><thead><tr><th style="width:110px">${t('col_nr')}</th><th>${t('gr_col_old')}</th><th>${t('gr_col_new')}</th><th style="width:150px">${t('gr_col_state')}</th></tr></thead><tbody>
${rows.length ? rows.map(r => { const w = res(r.nr);
    return `<tr><td class="nr">${r.n > 1 ? pad2(r.nr) + '–' + pad2(r.to) + ` <span class="small muted">${r.n}×</span>` : pad2(r.nr)}</td><td class="mono small">${r.old ? esc(r.old.ch + ' ' + nm(r.old.name)) : '–'}</td><td><span class="mono">${esc(r.neu.ch + ' ' + nm(r.neu.name))}</span>${r.neu.klar ? ` <span class="small muted">${esc(r.neu.klar)}</span>` : ''}</td>
<td>${w ? `<span class="badge ${w.kind === 'ACK' ? 'g' : 'r'}">${w.kind === 'ACK' ? t('gr_w_ok', { ms: w.ms }) : esc(w.kind)}</span>` : `<span class="badge ${r.st === 'same' ? '' : r.st === 'changed' ? 'y' : ''}">${t('gr_st_' + r.st)}</span>`}</td></tr>`; }).join('')
  : `<tr><td colspan="4" class="muted">${t('gr_nodiff')}</td></tr>`}
</tbody></table></div>`;
  }
  function paintRestore() {
    const el = $('#gr-restore'); if (!el) return;
    const B = S.backup, a = aktuell(), P = S.prog && S.prog.meta.kind === 'restore' ? S.prog : null, why = ready();
    if (!B) { el.innerHTML = `<p class="note">${t('gr_rs_none_note')}</p>`; return; }
    const same = a && a.plaetze ? B.plaetze.filter((p, i) => sameSlot(a.plaetze[i], p)).length : 0;
    const pct = P ? Math.round(100 * P.done / P.total) : 0;
    el.innerHTML = `<div class="spread"><div class="stack" style="gap:2px"><span>${t('gr_rs_have', { z: ctx.fmtDT(new Date(B.zeit)) })}${B.configName ? ` <span class="small muted">«${esc(B.configName)}»</span>` : ''}</span>
<span class="small muted">${a && a.plaetze ? t('gr_rs_diff', { c: 100 - same }) : t('gr_diff_unknown')}</span></div>
<div class="row">${P && P.running ? `<button type="button" class="danger" data-gr="progstop">${t('gr_prog_stop')}</button>`
  : `<button type="button" class="sec" data-gr="restore" ${why ? 'disabled' : ''} title="${esc(why)}">${t('gr_rs_btn')}</button>${P && P.failed && P.failed.length ? `<button type="button" class="sec" data-gr="progfail" ${why ? 'disabled' : ''}>${t('gr_prog_retry', { n: P.failed.length })}</button>` : ''}`}</div></div>
${P ? `<div class="gr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div><span class="small muted">${t('gr_prog_state', { d: P.done, n: P.total })}</span>` : ''}`;
  }
  function paintCheck() {
    const el = $('#gr-checklist'); if (!el) return;
    if (!S.check.on && !S.check.list.length) { el.innerHTML = ''; return; }
    el.innerHTML = (S.check.on ? `<p class="gr-prompt">${t('gr_check_prompt')}</p>` : '') + S.check.list.map(c => `<div class="row" style="gap:8px"><span class="mono">${esc(c.freq + ' «' + c.name + '»')}</span>
${!c.ref ? `<span class="badge">${t('gr_check_noref')}</span>` : c.hits.length ? `<span class="badge g">${t('gr_check_hit', { p: c.hits.map(pad2).join(', ') })}</span>` : `<span class="badge r">${t('gr_check_miss')}</span>`}</div>`).join('');
  }

  // ---------- Ereignisse ----------
  async function onClick(ev) {
    const b = ev.target.closest('[data-gr]'); if (!b) return;
    const a = b.dataset.gr;
    if (a === 'connect') return connect(false);
    if (a === 'sim') return connect(true);
    if (a === 'disconnect') { if (S.prog && S.prog.running) { ctx.msg(t('gr_busy'), 'warn'); return; } await L.disconnect(); ctx.msg(t('gr_m_disc'), 'info'); render(); return; }
    if (a === 'simmem') { L.writer.memKey(); return; }
    if (a === 'simturn') { if (!L.writer.turn()) ctx.msg(t('gr_sim_vol'), 'info'); return; }
    if (a === 'logsave') { ctx.download('krt2_verbindung_' + ctx.stamp() + '.txt', L.logText(), 'text/plain;charset=utf-8'); return; }
    if (a === 'rostart') { if (!L.connected) { ctx.msg(t('gr_need_conn'), 'warn'); return; } startReadout(S.ro.count > 0 && !S.ro.closed); return; }
    if (a === 'rostop') { const n = S.ro.stop(); S.roOn = false; if (n) ctx.msg(t('gr_m_ro_dropped', { n }), 'warn'); ctx.msg(t('gr_m_ro_stop', { s: roSummaryText() }), 'info'); render(); return; }
    if (a === 'sel') { applySel(); return; }
    if (a === 'undo') { if (S.ro.undo()) { ctx.msg(t('gr_m_undo'), 'info'); paintRo(); } return; }
    if (a === 'rosave') { await saveReadout(roPlaetze(), t('gr_src_read')); return; }
    if (a === 'rocsv' || a === 'rojson') { backupFile(roPlaetze(), a === 'rocsv' ? 'csv' : 'json'); return; }
    if (a === 'rodrop') { if (S.roSaved || await ctx.ask(t('gr_drop_q'), t('gr_drop_b'), t('gr_ro_drop'))) { S.ro = new RO.Readout(); S.roSaved = false; render(); } return; }
    if (a === 'file') { $('#gr-file').click(); return; }
    if (a === 'impsave') { await saveReadout(S.imp, S.impName); return; }
    if (a === 'impdrop') { S.imp = null; render(); return; }
    if (a === 'prog') { program(null); return; }
    if (a === 'progfail') { if (S.prog.meta.kind === 'restore') restore(S.prog.failed.slice()); else program(S.prog.failed.slice()); return; }
    if (a === 'restore') { restore(null); return; }
    if (a === 'progstop') { if (S.prog) S.prog.stop = true; return; }
    if (a === 'check') { S.check.on = !S.check.on; if (S.check.on) S.check.list = []; render(); return; }
  }
  function onChange(ev) {
    const el = ev.target;
    if (el.id === 'gr-file') { onFile(el); return; }
    if (el.dataset.gr === 'dev') { chooseDevice(el.value, true); return; }
    if (el.dataset.gr === 'showall') { S.showAll = el.checked; paintProg(); }
  }
  function onKey(ev) { if (ev.target && ev.target.id === 'gr-sel' && ev.key === 'Enter') { ev.preventDefault(); applySel(); } }

  root.KRT2GERAET = {
    init(c) { ctx = c; L.on(onLink); },
    async render() {
      render();
      // Sprungziel (#geraet?sichern, #geraet?programmieren) erst nach dem Neuzeichnen der App anfahren
      const jump = () => { const id = (location.hash.split('?')[1] || ''); const el = id && document.getElementById(id); if (el) el.scrollIntoView({ block: 'start' }); };
      setTimeout(jump, 0);
      await initDevice(); if (here()) { render(); setTimeout(jump, 0); }
    },
    onClick, onChange, onKey,
    get busy() { return !!(S.prog && S.prog.running); },
    _state: S   // für Tests
  };
})(typeof window !== 'undefined' ? window : globalThis);
