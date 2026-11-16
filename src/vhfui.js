/* krt2.wicki.aero – Funkprotokoll, Bedienung (0.7.0): Schalter, Übertragung jede Minute, Anzeige auf «Im Flug», Protokoll
   als CSV und A4-Seite. Zugang zu gb_flight_data (Beitrittscode der Reporting-App oder Token) ab 0.8.0 in den Einstellungen;
   nach dem Beitrittscode verschwindet die Eingabe. Logik in src/vhflog.js. */
(function (root) {
  'use strict';
  const V = root.KRT2VHF, L = root.KRT2LINK.link;
  const LS = { on: 'krt2.vhf.on', cfg: 'krt2.vhf.cfg', queue: 'krt2.vhf.queue', sent: 'krt2.vhf.sent', last: 'krt2.vhf.last' };
  const FLUSH_MS = 60000, SENT_MAX = 4000, JOIN_URL = 'https://basket-join.balthasar.workers.dev';
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* Speicher voll */ } };
  let ctx = null, logger = new V.VhfLogger(), busy = false, holdUntil = 0, joinBusy = false, protoBusy = false, setupTried = 0;
  const S = { on: read(LS.on, false), cfg: read(LS.cfg, null), queue: read(LS.queue, []), sent: read(LS.sent, []), last: read(LS.last, null), setup: null };
  const t = (k, o) => ctx.t(k, o), esc = s => ctx.esc(s), $ = s => document.querySelector(s);
  const here = () => ctx && (ctx.route() === 'flug' || ctx.route() === 'einstellungen');
  const configured = () => !!(S.cfg && S.cfg.repo && S.cfg.token);
  const pad2 = n => String(n).padStart(2, '0');
  const hhmmss = ms => { const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); };
  const uid = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  function deviceId() {
    if (S.cfg && S.cfg.device) return S.cfg.device;
    const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = 'KRT2-'; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }
  function saveCfg(c) { S.cfg = c; write(LS.cfg, c); }

  // ---------- Ereignisse vom Funkgerät ----------
  function seed() {   // beim Einschalten: aktuelle aktive Frequenz als Ausgangspunkt
    const a = L.st && L.st.active;
    if (a && a.freq) logger.feed({ kind: 'active', t: 0, wall: Date.now(), ch: a.freq, name: a.name });
  }
  function collect() {
    logger.tick(Date.now());
    const e = logger.drain();
    if (!e.length) return;
    const pos = ctx.pos ? ctx.pos() : null;
    for (const x of e) S.queue.push(Object.assign({ id: uid(), pos }, x));
    write(LS.queue, S.queue);
    if (here()) paint();
  }

  // ---------- Übertragung ----------
  async function flushNow(manual) {
    if (busy || !S.on || !configured()) return;
    if (!manual && Date.now() < holdUntil) return;
    busy = true; if (here()) paint();
    const snap = S.queue.slice(), ids = new Set(snap.map(e => e.id));
    try {
      const r = await V.flush({ cfg: S.cfg, queue: snap, sent: S.sent });
      S.queue = S.queue.filter(e => !ids.has(e.id)); write(LS.queue, S.queue);
      if (r.rows.length) { S.sent = S.sent.concat(r.rows).slice(-SENT_MAX); write(LS.sent, S.sent); }
      S.last = { at: Date.now(), flight: r.flight, size: r.size, added: r.added, healed: r.healed, err: '' };
      S.setup = Object.assign({}, S.setup || {}, { flight: r.flight });
      if (r.healed) ctx.msg(t('vh_m_healed', { n: r.healed, f: r.flight }), 'warn');
      if (r.size > 900000 && !(S.lastWarn && Date.now() - S.lastWarn < 3600000)) { S.lastWarn = Date.now(); ctx.msg(t('vh_m_big', { k: Math.round(r.size / 1024) }), 'warn'); }
    } catch (e) {
      if (e.hold) holdUntil = Date.now() + (e.retry || 60) * 1000;
      const first = !(S.last && S.last.err === e.message);   // unlesbare Tabelle: einmal melden, nicht jede Minute
      S.last = Object.assign({}, S.last || {}, { err: e.message, errAt: Date.now() });
      if (manual || e.auth || (e.unread && first)) ctx.msg(t('vh_m_err', { e: e.message }), 'err');
    }
    write(LS.last, S.last);
    busy = false; if (here()) paint();
  }

  // ---------- Zugang ----------
  const JOIN_A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  async function codeId(code) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('basket-join:' + code));
    return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  async function openSetup(code, b64) {   // wie die Reporting-App: PBKDF2 (200 000, SHA-256) → AES-GCM 256
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: raw.slice(0, 16), iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(16, 28) }, key, raw.slice(28));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function useCode(input) {
    const code = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (code.length !== 6 || [...code].some(c => !JOIN_A.includes(c))) { ctx.msg(t('vh_m_badcode'), 'warn'); return; }
    joinBusy = true; paint();
    try {
      const r = await fetch(JOIN_URL + '/join?id=' + encodeURIComponent(await codeId(code)), { cache: 'no-store' });
      if (r.status === 404) throw new Error(t('vh_m_nocode'));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const o = await openSetup(code, (await r.json()).payload);
      if (o.role === 'viewer' || !o.token) throw new Error(t('vh_m_viewer'));
      await takeAccess({ repo: o.repo || 'bwicki/gb_flight_data', branch: o.branch || 'main', dir: o.dir || 'data', token: o.token, via: 'code' });
    } catch (e) {
      ctx.msg(t('vh_m_join_err', { e: /decrypt|operation/i.test(e.message || '') ? t('vh_m_badcode') : e.message }), 'err');
    }
    joinBusy = false; paint();
  }
  async function takeAccess(c) {
    const cfg = Object.assign({ device: deviceId(), reporter: 'KRT2' }, c);
    const st = await V.readSetup(cfg);          // prüft Zugang und liest die aktuelle Fahrt
    saveCfg(cfg); S.setup = st;
    ctx.msg(t('vh_m_access', { r: cfg.repo, f: st.flight || '–', c: st.call || '–' }), 'ok');
  }
  async function useToken() {
    const tok = ($('#vh-token') || {}).value || '', repo = (($('#vh-repo') || {}).value || 'bwicki/gb_flight_data').trim();
    if (!tok.trim()) { ctx.msg(t('vh_m_notoken'), 'warn'); return; }
    joinBusy = true; paint();
    try { await takeAccess({ repo, branch: 'main', dir: 'data', token: tok.trim(), via: 'token' }); }
    catch (e) { ctx.msg(t('vh_m_join_err', { e: e.message }), 'err'); }
    joinBusy = false; paint();
  }
  async function refreshSetup() { if (!configured()) return; try { S.setup = await V.readSetup(S.cfg); } catch (e) { /* später */ } if (here()) paint(); }

  // ---------- Protokoll ----------
  async function protocol() {
    if (!configured()) return;
    protoBusy = true; paint();
    try {
      const st = S.setup || await V.readSetup(S.cfg);
      const flight = ((($('#vh-flight') || {}).value) || st.flight || '').trim();
      if (!flight) throw new Error(t('vh_m_noflight'));
      const withAtc = !!(($('#vh-atc') || {}).checked);
      const rows = V.protocolRows(await V.readTable(S.cfg, flight), withAtc);
      if (!rows.length) { ctx.msg(t('vh_m_empty', { f: flight }), 'info'); }
      else {
        const name = 'funkprotokoll_' + V.safeName(flight) + '_' + ctx.stamp();
        ctx.download(name + '.csv', '﻿' + V.protocolCsv(rows), 'text/csv');
        const html = printPage(flight, st.call, rows, withAtc);
        const w = root.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
        if (!w) ctx.download(name + '.html', html, 'text/html');
        ctx.msg(t('vh_m_proto', { n: rows.length, f: flight }), 'ok');
      }
    } catch (e) { ctx.msg(t('vh_m_err', { e: e.message }), 'err'); }
    protoBusy = false; paint();
  }
  function printPage(flight, call, rows, withAtc) {
    const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const tx = rows.filter(r => r.type === 'VHF' && /^Tx /.test(r.note || ''));
    const sum = tx.reduce((a, r) => a + (parseFloat((r.note || '').slice(3)) || 0), 0);
    const dm = iso => { const s = String(iso || ''); return s.slice(8, 10) + '.' + s.slice(5, 7) + '. ' + s.slice(11, 19); };
    const body = rows.map(r => `<tr><td>${e(dm(r.ts_utc))}</td><td>${e(String(r.ts_local || '').slice(11, 19))}</td><td>${e(r.type)}</td><td>${e(r.atc_freq)}</td><td>${e(r.atc_station)}</td><td>${e(V.textOf(r))}</td><td>${r.lat != null ? e(r.lat.toFixed ? r.lat.toFixed(4) : r.lat) + ', ' + e(r.lon != null && r.lon.toFixed ? r.lon.toFixed(4) : r.lon) : ''}</td></tr>`).join('');
    const days = Array.from(new Set(rows.map(r => String(r.ts_utc || '').slice(0, 10)))).join(', ');
    return `<!DOCTYPE html><html lang="${t('vh_lang')}"><head><meta charset="utf-8"><title>${e(t('vh_p_title'))} ${e(flight)}</title><style>
@page{size:A4;margin:12mm}body{font:10pt/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1d2733;margin:0}
h1{font-size:15pt;margin:0 0 2mm}p{margin:0 0 3mm;color:#5a6672}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:1.2mm 1.6mm;border-bottom:.2mm solid #cfd6dd;vertical-align:top}
th{font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em;color:#5a6672}td:nth-child(-n+4){white-space:nowrap;font-variant-numeric:tabular-nums}
.bar{margin:0 0 4mm}@media print{.bar{display:none}}button{font:inherit;padding:2mm 4mm}</style></head><body>
<div class="bar"><button onclick="print()">${e(t('vh_p_print'))}</button></div>
<h1>${e(t('vh_p_title'))} ${e(flight)}${call ? ' · ' + e(call) : ''}</h1>
<p>${e(t('vh_p_info', { d: days, n: rows.length, x: tx.length, s: sum.toFixed(1) }))}${withAtc ? ' · ' + e(t('vh_p_atc')) : ''} · krt2.wicki.aero</p>
<table><thead><tr><th>UTC</th><th>${e(t('vh_p_local'))}</th><th>${e(t('vh_p_cat'))}</th><th>${e(t('vh_p_freq'))}</th><th>${e(t('vh_p_station'))}</th><th>${e(t('vh_p_entry'))}</th><th>${e(t('vh_p_pos'))}</th></tr></thead><tbody>${body}</tbody></table>
</body></html>`;
  }

  // ---------- Anzeige ----------
  function paint() { paintFlight(); paintAccess(); }
  /** Karte auf «Im Flug»: Schalter, Zustand, letzte Einträge, Protokoll. Ohne Zugang nur der Hinweis auf die Einstellungen. */
  function paintFlight() {
    const el = $('#fl-vhf'); if (!el || !ctx) return;
    const last = S.last, st = S.setup, rec = S.sent.slice(-8).map(r => ({ sent: true, row: r })).concat(S.queue).slice(-8).reverse();
    const status = !S.on ? `<span class="badge">${t('vh_off')}</span>`
      : !configured() ? `<span class="badge y">${t('vh_noaccess')}</span>`
      : last && last.err && (!last.at || last.errAt > last.at) ? `<span class="badge r">${esc(t('vh_err', { e: last.err }))}</span>`
      : `<span class="badge g">${t('vh_on')}</span>`;
    const line = S.on && configured() ? `<span class="small muted">${t('vh_state', { q: S.queue.length, z: last && last.at ? hhmmss(last.at) : '–', f: esc((st && st.flight) || (last && last.flight) || '–') })}${busy ? ' · ' + t('vh_busy') : ''}</span>` : '';
    const recList = rec.length ? `<div class="stack" style="gap:2px">${rec.map(x => {
      if (x.sent) return `<span class="small"><span class="mono">${esc(String(x.row.ts_local || '').slice(11, 19))}</span> ${esc(x.row.note)} <span class="badge g">${t('vh_sent')}</span></span>`;
      return `<span class="small"><span class="mono">${hhmmss(x.wall)}</span> ${esc(V.noteOf(x))} <span class="badge y">${t('vh_pending')}</span></span>`;
    }).join('')}</div>` : `<p class="small muted" style="margin:0">${t('vh_none')}</p>`;
    el.innerHTML = `<span class="label">${t('vh_title')}</span>
<div class="row fl-row"><span class="label">${t('vh_status')}</span><span>${status}</span><button type="button" class="sec" data-vh="toggle" aria-pressed="${S.on ? 'true' : 'false'}">${t(S.on ? 'vh_stop' : 'vh_start')}</button>${line}${S.on && configured() ? `<button type="button" class="sec" data-vh="flush" ${busy ? 'disabled' : ''}>${t('vh_flush')}</button>` : ''}</div>
${configured() ? '' : `<p class="note gr-warn">${t('vh_noaccess_set')} <a href="#einstellungen">${t('nav_einst')}</a></p>`}
${recList}
${configured() ? `<span class="small">${t('vh_proto')}</span>
<div class="row"><label for="vh-flight">${t('vh_flight')}</label><input id="vh-flight" type="text" value="${esc((st && st.flight) || '')}" style="width:140px"><label><input type="checkbox" id="vh-atc" checked> ${t('vh_with_atc')}</label><button type="button" class="sec" data-vh="proto" ${protoBusy ? 'disabled' : ''}>${t(protoBusy ? 'fl_loading' : 'vh_proto_go')}</button></div>` : ''}
<p class="note">${t('vh_note')}</p>`;
  }
  /** Karte in den Einstellungen: Zugang. Ist er eingerichtet (Beitrittscode oder Token), verschwinden die Eingaben. */
  function paintAccess() {
    const el = $('#st-vhf'); if (!el || !ctx) return;
    const st = S.setup;
    el.innerHTML = `<span class="label">${t('vh_set_title')}</span>
${configured()
  ? `<div class="row"><span>${t('vh_access_ok', { r: esc(S.cfg.repo), v: t(S.cfg.via === 'token' ? 'vh_via_token' : 'vh_via_code') })} · ${t('vh_flight')} <b>${esc((st && st.flight) || '–')}</b>${st && st.call ? ' · ' + esc(st.call) : ''}</span><button type="button" class="ghost" data-vh="forget">${t('vh_forget')}</button></div>`
  : `<div class="row"><label for="vh-code">${t('vh_code')}</label><input id="vh-code" class="mono" type="text" inputmode="text" autocomplete="off" maxlength="8" placeholder="XXXXXX" style="width:110px;text-transform:uppercase"><button type="button" data-vh="code" ${joinBusy ? 'disabled' : ''}>${t(joinBusy ? 'fl_loading' : 'vh_code_go')}</button></div>
<span class="small">${t('vh_token_alt')}</span>
<div class="row"><label for="vh-repo">${t('vh_repo')}</label><input id="vh-repo" type="text" value="bwicki/gb_flight_data" style="width:200px"></div>
<div class="row"><label for="vh-token">${t('vh_token')}</label><input id="vh-token" type="password" autocomplete="off" style="width:200px"><button type="button" class="sec" data-vh="token" ${joinBusy ? 'disabled' : ''}>${t('vh_token_go')}</button></div>`}
<p class="note">${t('vh_set_note')}</p>`;
    if (configured() && !st && Date.now() - setupTried > 60000) { setupTried = Date.now(); refreshSetup(); }   // Fahrt nachlesen, höchstens einmal je Minute
  }

  // ---------- Ereignisse der Seite ----------
  async function onClick(ev) {
    const b = ev.target.closest('[data-vh]'); if (!b) return;
    const a = b.dataset.vh;
    if (a === 'toggle') { setOn(!S.on); return; }
    if (a === 'flush') { flushNow(true); return; }
    if (a === 'code') { useCode(($('#vh-code') || {}).value); return; }
    if (a === 'token') { useToken(); return; }
    if (a === 'proto') { protocol(); return; }
    if (a === 'forget') {
      if (!(await ctx.ask(t('vh_forget_q'), t('vh_forget_b', { n: S.queue.length }), t('vh_forget'), t('cancel')))) return;
      saveCfg(null); S.setup = null; paint(); return;
    }
  }
  function setOn(on) {
    S.on = !!on; write(LS.on, S.on);
    if (S.on) { logger = new V.VhfLogger(); seed(); refreshSetup(); }
    paint();
  }
  function onChange() { /* keine Eingabefelder mit Sofortwirkung */ }

  root.KRT2VHFUI = {
    init(c) {
      ctx = c;
      L.on((type, d) => {
        if (!S.on) return;
        if (type === 'vhf') logger.feed(d);
        else if (type === 'status' && !L.connected) logger.linkDown();
      });
      setInterval(() => { if (S.on) collect(); }, 1000);
      setInterval(() => { if (S.on) flushNow(false); }, FLUSH_MS);
      if (S.on) { seed(); refreshSetup(); }
    },
    paint, onClick, onChange, flushNow,
    _state: S, _logger: () => logger   // für Tests
  };
})(typeof window !== 'undefined' ? window : globalThis);
