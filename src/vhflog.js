/* krt2.wicki.aero – Funkprotokoll (0.7.0), ohne DOM.
   Aus den Meldungen des KRT2 (Link-Ereignis «vhf»: active / txon / txoff) entstehen Einträge «FRQ … active» und «Tx … sec»,
   die als Zeilen der Kategorie VHF in die Fahrtabelle von gb_flight_data geschrieben werden (dieselbe Tabelle wie die
   Reporting-App, reporting.wicki.aero). Konzept: docs/konzept/krt2_konzept_funkprotokoll_v1_20261116.docx. */
(function (root) {
  'use strict';
  const STABLE_MS = 3000, MIN_TX_MS = 300;

  // ---------- Ereignisse → Einträge ----------
  class VhfLogger {
    constructor(o) {
      o = o || {};
      this.stableMs = o.stableMs != null ? o.stableMs : STABLE_MS;
      this.minTxMs = o.minTxMs != null ? o.minTxMs : MIN_TX_MS;
      this.cur = null;        // zuletzt gemeldete aktive Frequenz { ch, name }
      this.pending = null;    // noch nicht stabile aktive Frequenz { ch, name, wall }
      this.lastCh = null;     // zuletzt protokollierte Frequenz
      this.tx = null;         // laufende Aussendung { t, wall, ch, name }
      this.out = [];
    }
    /** Ein Ereignis vom Link: { kind: 'active'|'txon'|'txoff', t (ms, Link-Zeit), wall (ms seit 1970), ch, name }. */
    feed(ev) {
      if (!ev) return;
      if (ev.kind === 'active' && ev.ch) {
        this.cur = { ch: ev.ch, name: String(ev.name || '').trim() };
        if (ev.ch === this.lastCh) this.pending = null;   // zurück auf die protokollierte Frequenz: nichts Neues
        else this.pending = { ch: ev.ch, name: this.cur.name, wall: ev.wall };
      } else if (ev.kind === 'txon') {
        if (this.tx) this._txOpen();                       // «Ende» verpasst
        const c = this.cur || {};
        this.tx = { t: ev.t, wall: ev.wall, ch: c.ch || '', name: c.name || '' };
      } else if (ev.kind === 'txoff') {
        if (!this.tx) return;
        const ms = ev.t - this.tx.t;
        if (ms >= this.minTxMs) this.out.push({ kind: 'tx', wall: this.tx.wall, ch: this.tx.ch, name: this.tx.name, ms });
        this.tx = null;
      }
    }
    /** Verbindung zum Funkgerät weg: eine offene Aussendung wird ohne Dauer abgeschlossen. */
    linkDown() { if (this.tx) this._txOpen(); }
    _txOpen() { this.out.push({ kind: 'tx', wall: this.tx.wall, ch: this.tx.ch, name: this.tx.name, ms: null }); this.tx = null; }
    /** Regelmässig aufrufen (1 s): stabile Frequenz protokollieren. */
    tick(wall) {
      const p = this.pending;
      if (p && wall - p.wall >= this.stableMs) {
        if (p.ch !== this.lastCh) { this.out.push({ kind: 'frq', wall: p.wall, ch: p.ch, name: p.name }); this.lastCh = p.ch; }
        this.pending = null;
      }
    }
    /** Neue Einträge abholen. */
    drain() { const o = this.out; this.out = []; return o; }
  }

  // ---------- Einträge → Zeilen der Fahrtabelle ----------
  const pad = n => String(n).padStart(2, '0');
  function localIso(ms) {
    const d = new Date(ms), off = -d.getTimezoneOffset(), sg = off >= 0 ? '+' : '-', a = Math.abs(off);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + sg + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
  }
  const uuid = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  function noteOf(e) {
    if (e.kind === 'frq') return 'FRQ ' + e.ch + (e.name ? ' ' + e.name : '') + ' active';
    return e.ms == null ? 'Tx ? sec (Ende nicht empfangen)' : 'Tx ' + (Math.round(e.ms / 100) / 10).toFixed(1) + ' sec';
  }
  /** Zeile im Schema der Reporting-App (Spalten wie dort, nur die belegten). pos = { lat, lon, alt } oder null. */
  function rowOf(e, o) {
    o = o || {};
    const r = { id: e.id || uuid(), flight_id: o.flight || '', callsign: o.call || '', device: o.device || 'KRT2', device_mode: 'personal',
      reporter: o.reporter || 'KRT2', source: 'krt2', ts_utc: new Date(e.wall).toISOString(), ts_local: localIso(e.wall), type: 'VHF',
      note: noteOf(e), atc_freq: e.ch || '', atc_station: e.name || '' };
    if (e.kind === 'tx') r.atc_dir = 'TX';
    if (e.pos && isFinite(e.pos.lat) && isFinite(e.pos.lon)) {
      r.lat = Math.round(e.pos.lat * 1e6) / 1e6; r.lon = Math.round(e.pos.lon * 1e6) / 1e6; r.pos_source = 'gps';
      if (isFinite(e.pos.alt)) r.alt_gps_m = Math.round(e.pos.alt);
    }
    return r;
  }

  // ---------- GitHub (Contents API) ----------
  const API = 'https://api.github.com';
  const safeName = f => String(f || 'flight').replace(/[^A-Za-z0-9_-]/g, '-');
  const b64e = t => { const u = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const b64d = b => new TextDecoder().decode(Uint8Array.from(atob(String(b).replace(/\s/g, '')), c => c.charCodeAt(0)));
  const parseArr = t => { try { const v = JSON.parse(t); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  function hdr(cfg, accept) { return { Authorization: 'Bearer ' + cfg.token, Accept: accept || 'application/vnd.github.object', 'X-GitHub-Api-Version': '2022-11-28' }; }
  const dirOf = cfg => String(cfg.dir || 'data').replace(/^\/|\/$/g, '');
  const url = (cfg, p, ref) => API + '/repos/' + cfg.repo + '/contents/' + encodeURI(p) + (ref ? '?ref=' + encodeURIComponent(cfg.branch || 'main') : '');

  /** Datei lesen: { sha, text, size } oder { sha: null, text: '' } (404). Dateien über 1 MB holt es roh nach. */
  async function ghGet(cfg, p, fetchFn) {
    const f = fetchFn || root.fetch.bind(root);
    const r = await f(url(cfg, p, true), { headers: hdr(cfg), cache: 'no-store' });
    if (r.status === 404) return { sha: null, text: '', size: 0 };
    if (r.status === 401) throw Object.assign(new Error('Zugang abgelehnt (401) – Token prüfen'), { auth: true });
    if (r.status === 403 || r.status === 429) throw Object.assign(new Error('GitHub bremst (' + r.status + ')'), { hold: true, retry: Number(r.headers && r.headers.get && r.headers.get('retry-after')) || 60 });
    if (!r.ok) throw new Error('GET ' + p + ': ' + r.status);
    const j = await r.json();
    if (j.content && j.encoding !== 'none') return { sha: j.sha, text: b64d(j.content), size: j.size || 0 };
    if (!j.size) return { sha: j.sha, text: '', size: 0 };
    const raw = await f(url(cfg, p, true), { headers: hdr(cfg, 'application/vnd.github.raw'), cache: 'no-store' });
    if (!raw.ok) throw new Error('GET roh ' + p + ': ' + raw.status);
    return { sha: j.sha, text: await raw.text(), size: j.size };
  }
  async function ghPut(cfg, p, text, sha, msg, fetchFn) {
    const f = fetchFn || root.fetch.bind(root);
    const r = await f(url(cfg, p, false), { method: 'PUT', headers: Object.assign(hdr(cfg, 'application/vnd.github+json'), { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message: msg, content: b64e(text), sha: sha || undefined, branch: cfg.branch || 'main' }) });
    if (r.status === 409 || r.status === 422) throw Object.assign(new Error('Konflikt'), { conflict: true });
    if (r.status === 401) throw Object.assign(new Error('Zugang abgelehnt (401) – Token prüfen'), { auth: true });
    if (r.status === 403 || r.status === 429) throw Object.assign(new Error('GitHub bremst (' + r.status + ')'), { hold: true, retry: Number(r.headers && r.headers.get && r.headers.get('retry-after')) || 60 });
    if (!r.ok) throw new Error('PUT ' + p + ': ' + r.status);
    return true;
  }
  /** Aktuelle Fahrt und Rufzeichen aus <dir>/_setup.json (wie die Reporting-App). */
  async function readSetup(cfg, fetchFn) {
    const g = await ghGet(cfg, dirOf(cfg) + '/_setup.json', fetchFn);
    let s = {}; try { s = g.text ? JSON.parse(g.text) : {}; } catch (e) { s = {}; }
    return { flight: s.flight || cfg.flight || '', call: s.call || cfg.call || '' };
  }
  /**
   * Inhalt der Fahrtabelle als Liste. Gibt es die Datei, ergibt das Lesen aber keine Liste (kaputtes JSON, leere Antwort
   * trotz Grösse), wird abgebrochen statt mit [] weitergearbeitet – sonst würde das Zurückschreiben alle anderen Zeilen
   * löschen (gleiche Sperre wie in der Reporting-App ab v261116-01).
   */
  function tableOf(g, p) {
    if (!g.sha) return [];                                   // Datei gibt es (noch) nicht
    const t = String(g.text || '');
    let v = null;
    try { v = t.trim() ? JSON.parse(t) : ((g.size || 0) > 2 ? null : []); } catch (e) { v = null; }
    if (Array.isArray(v)) return v;
    throw Object.assign(new Error('Fahrtabelle ' + p + ' nicht lesbar (' + (g.size || t.length) + ' B) – nichts geschrieben'), { unread: true, hold: true, retry: 60 });
  }
  /** Ganze Fahrtabelle lesen (für das Protokoll). */
  async function readTable(cfg, flight, fetchFn) {
    const p = dirOf(cfg) + '/' + safeName(flight) + '.json';
    return tableOf(await ghGet(cfg, p, fetchFn), p);
  }

  /**
   * Neue Zeilen in die Fahrtabelle schreiben: lesen (mit sha), anhängen, zurückschreiben; bei Konflikt neu lesen und
   * wiederholen (die Reporting-App schreibt in dieselbe Datei und führt ihrerseits nach id zusammen).
   * queue: Einträge { id, kind, wall, ch, name, ms, pos }; sent: früher geschriebene Zeilen dieser App (zum Nachtragen,
   * falls sie in der Datei fehlen und nicht gelöscht wurden).
   * Ergebnis { flight, added, healed, size, rows } – rows = geschriebene Zeilen.
   */
  async function flush(o) {
    const cfg = o.cfg, f = o.fetch;
    const st = o.setup || await readSetup(cfg, f);
    if (!st.flight) throw new Error('Keine aktuelle Fahrt in _setup.json');
    const base = dirOf(cfg) + '/' + safeName(st.flight);
    for (let attempt = 0; ; attempt++) {
      const g = await ghGet(cfg, base + '.json', f);
      const rows = tableOf(g, base + '.json');
      let tomb = new Set();
      try { const d = await ghGet(cfg, base + '.deleted.json', f); tomb = new Set(parseArr(d.text).map(x => x && x.id).filter(Boolean)); } catch (e) { if (e.auth || e.hold) throw e; }
      const have = new Set(rows.map(r => r && r.id));
      const fresh = (o.queue || []).map(e => rowOf(e, { flight: st.flight, call: st.call, device: cfg.device, reporter: cfg.reporter }))
        .filter(r => !have.has(r.id) && !tomb.has(r.id));
      const heal = (o.sent || []).filter(r => r && r.flight_id === st.flight && !have.has(r.id) && !tomb.has(r.id) && !fresh.some(x => x.id === r.id));
      const add = fresh.concat(heal);
      if (!add.length) return { flight: st.flight, added: 0, healed: 0, size: g.size || (g.text || '').length, rows: [] };
      const all = rows.concat(add).sort((a, b) => String(a.ts_utc || '').localeCompare(String(b.ts_utc || '')));
      const text = JSON.stringify(all, null, 1);
      try {
        await ghPut(cfg, base + '.json', text, g.sha, st.flight + ' · ' + add.length + ' VHF · KRT2', f);
        return { flight: st.flight, added: fresh.length, healed: heal.length, size: new TextEncoder().encode(text).length, rows: fresh };
      } catch (e) {
        if (e.conflict && attempt < 3) continue;
        throw e;
      }
    }
  }

  // ---------- Protokoll ----------
  /** Zeilen für das Funkprotokoll: VHF (automatisch) und, wenn gewünscht, ATC (von Hand), nach Zeit. */
  function protocolRows(rows, withAtc) {
    return rows.filter(r => r && (r.type === 'VHF' || (withAtc && r.type === 'ATC'))).sort((a, b) => String(a.ts_utc).localeCompare(String(b.ts_utc)));
  }
  const textOf = r => r.type === 'VHF' ? r.note : [r.atc_dir, r.atc_msg].filter(Boolean).join(' · ');   // Station steht in eigener Spalte
  function protocolCsv(rows) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['UTC', 'Lokal', 'Kategorie', 'Frequenz', 'Station', 'Eintrag', 'Lat', 'Lon', 'Hoehe_m', 'Quelle'];
    return [head.join(';')].concat(rows.map(r => [r.ts_utc, r.ts_local, r.type, r.atc_freq, r.atc_station, textOf(r), r.lat, r.lon, r.alt_gps_m != null ? r.alt_gps_m : '', r.source || r.reporter].map(q).join(';'))).join('\r\n') + '\r\n';
  }

  root.KRT2VHF = { VhfLogger, rowOf, noteOf, localIso, safeName, ghGet, ghPut, readSetup, readTable, flush, protocolRows, protocolCsv, textOf, STABLE_MS, MIN_TX_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KRT2VHF;
})(typeof window !== 'undefined' ? window : globalThis);
