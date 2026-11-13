/* krt2.wicki.aero – Verbindung zum Funkgerät über Web Serial (ab 0.4.0; Erkenntnisse aus den Gerätetests 13.11.2026).
   - 9600 Bd 8N1. Das Funkgerät fragt alle 10 s mit «S»; die App antwortet sofort mit «x» (gemessen 1–4 ms), dann
     erscheint «r» im Display. Meldungen U, R, Z, C, A, 1–4 werden mit ACK quittiert.
   - Schreiben: «Z» je Platz, Quittung ACK nach 27–38 ms; ohne Quittung bis zu zwei Wiederholungen.
   - Auslesen über die Schnittstelle geht nicht («W» blättert, meldet aber nichts) – dafür src/readout.js.
   - Gesendet werden nur Antworten (x, ACK), «Z» und «R». Nie: aktive Frequenz, Lautstärke, Squelch, Sendetasten.
   Die Verbindung lebt unabhängig von der angezeigten Seite. Simulation: Link.connect({ sim: true }). */
(function (root) {
  'use strict';
  const K = root.KRT2, C = root.KRT2CODEC;
  const LINK_MS = 15000;     // «r» gilt als aktiv, solange die letzte Antwort auf «S» jünger ist
  const CMD_MS = 800;        // Wartezeit auf ACK/NAK je Befehl
  const SLOT_PAUSE = 40;     // Pause zwischen zwei Plätzen
  const BURST_MS = 600;      // R kurz nach U gehört zur Zustandsmeldung beim Verbindungsaufbau
  const LOG_MAX = 4000;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now()), wall0 = Date.now();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

  class Link {
    constructor() {
      this.port = null; this.reader = null; this.writer = null; this.reading = false; this.readP = null;
      this.dec = new K.KRT2Decoder(); this.subs = new Set(); this.log = [];
      this.pending = null; this.queue = Promise.resolve(); this.lastU = -1e9;
      this.st = { pings: 0, answered: 0, lastAnswer: null, active: null, standby: null, tx: false };
      this.tick = setInterval(() => { for (const e of this.dec.tick(now())) this._log(e, '←', 'unvollständig'); }, 100);
      if (root.navigator && root.navigator.serial) root.navigator.serial.addEventListener('disconnect', ev => { if (this.port && !this.port.sim && ev.target === this.port) this.disconnect('Adapter abgezogen'); });
    }
    get supported() { return !!(root.navigator && root.navigator.serial); }
    get connected() { return !!this.port; }
    get sim() { return !!(this.port && this.port.sim); }
    get linked() { return this.st.lastAnswer !== null && now() - this.st.lastAnswer < LINK_MS; }
    on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
    _emit(type, data) { for (const f of this.subs) { try { f(type, data || {}); } catch (e) { /* Anzeige darf die Verbindung nicht stören */ } } }
    _log(e, dir, note) {
      this.log.push({ t: e.t !== undefined ? e.t : now(), dir, hex: e.bytes ? K.hex(e.bytes) : '', text: (e.text || '') + (note ? ' – ' + note : '') });
      if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
    }
    logText() {
      const clock = t => { const d = new Date(wall0 + t); return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0'); };
      return ['Zeit\tRichtung\tBytes\tBedeutung'].concat(this.log.map(l => [clock(l.t), l.dir, l.hex, l.text].join('\t'))).join('\r\n');
    }

    async connect(opts) {
      if (this.port) return;
      if (opts && opts.sim) {
        this.writer = new SimRadio(this); this.port = { sim: true };
        this._log({ text: 'Simulation verbunden' }, '·'); this._emit('status'); return;
      }
      if (!this.supported) throw new Error('Dieser Browser kann nicht auf serielle Anschlüsse zugreifen (Chrome oder Edge am Laptop nötig).');
      const port = await root.navigator.serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
      this.port = port; this.writer = port.writable.getWriter();
      this._log({ text: 'Anschluss geöffnet (9600 Bd, 8N1)' }, '·');
      this.readP = this._readLoop(); this._emit('status');
    }
    async disconnect(why) {
      const p = this.port; if (!p) return;
      if (p.sim) { this.writer.close(); }
      else {
        this.reading = false;
        try { if (this.reader) await this.reader.cancel(); } catch (e) { /* schon zu */ }
        try { if (this.readP) await this.readP; } catch (e) { /* egal */ }
        try { if (this.writer) this.writer.releaseLock(); } catch (e) { /* egal */ }
        try { await p.close(); } catch (e) { /* egal */ }
      }
      this.port = null; this.writer = null; this.readP = null; this.st.lastAnswer = null;
      if (this.pending) this.pending.done('getrennt');
      this._log({ text: why || 'Anschluss geschlossen' }, '·'); this._emit('status');
    }
    async _readLoop() {
      this.reading = true;
      while (this.port && this.port.readable && this.reading) {
        this.reader = this.port.readable.getReader();
        try { for (;;) { const { value, done } = await this.reader.read(); if (done) break; if (value && value.length) this._bytes(value); } }
        catch (e) { this._log({ text: 'Lesefehler: ' + e.message }, '·'); }
        finally { try { this.reader.releaseLock(); } catch (e) { /* egal */ } this.reader = null; }
      }
    }
    _bytes(u8) { const t = now(); for (const e of this.dec.feed(u8, t)) this._event(e); }
    _event(e) {
      if (e.kind === 'ping') {
        this.st.pings++; this._log(e, '←');
        this._raw([0x78], 'Antwort «x» auf die Abfrage').then(ok => { if (ok) { this.st.answered++; const was = this.linked; this.st.lastAnswer = now(); if (!was) this._emit('status'); } });
        return;
      }
      if (e.kind === 'ack' || e.kind === 'nak') { this._log(e, '←'); if (this.pending) this.pending.done(e.kind === 'ack' ? 'ACK' : 'NAK'); return; }
      if (e.kind !== 'frame') { this._log(e, '←'); return; }
      this._log(e, '←');
      if (e.ok && e.freq && e.name === 'U') { this.st.active = { freq: e.freq.display, name: e.station.trimEnd() }; this.lastU = e.t; }
      if (e.ok && e.freq && e.name === 'R') {
        this.st.standby = { freq: e.freq.display, name: e.station.trimEnd() };
        this._emit('R', { t: e.t, freq: e.freq.display, name: e.station, burst: e.t - this.lastU < BURST_MS });
      }
      if (e.name === 'C') { const a = this.st.active; this.st.active = this.st.standby; this.st.standby = a; }
      if (e.name === 'K') this.st.tx = true;
      if (e.name === 'J' || e.name === 'Y' || e.name === 'V') this.st.tx = false;
      if (e.ok && 'URZCA1234'.includes(e.name)) this._raw([K.ACK], 'ACK auf Meldung ' + e.name);
      this._emit('frame', { name: e.name });
    }
    async _raw(bytes, why) {
      if (!this.writer) return false;
      const ev = { t: now(), bytes: Array.from(bytes), text: why };
      try { await this.writer.write(new Uint8Array(bytes)); this._log(ev, '→'); return true; }
      catch (e) { this._log(Object.assign(ev, { text: 'Fehler beim Senden: ' + e.message + ' (' + why + ')' }), '→'); return false; }
    }
    /** Einen Befehl senden und auf ACK/NAK warten; Befehle laufen nacheinander. Ergebnis { kind, ms, tries }. */
    command(bytes, why, retries) {
      const run = async () => {
        let r = { kind: 'keine Antwort', ms: CMD_MS, tries: 0 };
        for (let i = 0; i <= (retries == null ? 2 : retries); i++) {
          if (!this.writer) return { kind: 'nicht verbunden', ms: 0, tries: i };
          const ts = now();
          const p = new Promise(res => {
            const timer = setTimeout(() => { this.pending = null; res('keine Antwort'); }, CMD_MS);
            this.pending = { done: k => { clearTimeout(timer); this.pending = null; res(k); } };
          });
          if (!(await this._raw(bytes, why + (i ? ' (Wiederholung ' + i + ')' : '')))) { if (this.pending) this.pending.done('Sendefehler'); }
          const k = await p;
          r = { kind: k, ms: Math.round(now() - ts), tries: i + 1 };
          if (k === 'ACK' || k === 'getrennt') break;
        }
        return r;
      };
      const job = this.queue.then(run, run);
      this.queue = job.catch(() => {});
      return job;
    }
    writeSlot(p) {
      let bytes;
      try { bytes = C.buildZ(p.ch, p.name, p.nr); } catch (e) { return Promise.resolve({ kind: 'Eingabefehler: ' + e.message, ms: 0, tries: 0 }); }
      return this.command(bytes, 'Z: Platz ' + String(p.nr).padStart(2, '0') + ' ← ' + C.encodeFreq(p.ch).display + ' «' + C.normalizeName(p.name).trimmed + '»', 2);
    }
    /** Plätze nacheinander schreiben. Bricht nach drei Fehlschlägen in Folge ab oder wenn stop() true liefert. */
    async program(list, opt) {
      const o = opt || {}, res = [];
      let fails = 0;
      for (const p of list) {
        if (o.stop && o.stop()) break;
        const r = await this.writeSlot(p);
        res.push(Object.assign({ nr: p.nr }, r));
        if (o.onSlot) o.onSlot(p.nr, r);
        fails = r.kind === 'ACK' ? 0 : fails + 1;
        if (fails >= 3 || r.kind === 'getrennt' || r.kind === 'nicht verbunden') break;
        await sleep(SLOT_PAUSE);
      }
      return res;
    }
  }

  /* Nachgebildetes Funkgerät für die Simulation (wie am 13.11.2026 gemessen): fragt alle 3 s mit «S», meldet nach der
     ersten Antwort U und R, quittiert Z (28 ms) und R, «W» blättert ohne Meldung. MEM und Drehknopf: R bei jeder Raste,
     MEM allein und das Verlassen nach 3.5 s ohne Bedienung melden nichts. failNext(n): die nächsten n Befehle ohne ACK. */
  class SimRadio {
    constructor(link) {
      this.link = link; this.buf = []; this.linked = false; this.inMem = false; this.fail = 0;
      const named = [['121.500', 'EMERGENC'], ['118.000', 'MIN'], ['118.005', 'MIN-8'], ['124.700', 'ZURI I'], ['118.100', 'ZURI T'], ['127.205', 'ZURI VOL'], ['126.350', 'GENF I'], ['128.050', 'SWISS R']];
      this.mem = Array.from({ length: 100 }, (_, i) => (i < named.length ? named[i].slice() : ['136.975', '']));
      this.idx = 98; this.sel = 98; this.sb = ['136.975', ''];
      this.timer = setInterval(() => this._send([0x53], 0), 3000);
    }
    _send(bytes, delay) { setTimeout(() => this.link._bytes(Uint8Array.from(bytes)), delay); }
    _R(v, d) { this._send(C.buildR(v[0], v[1]), d == null ? 25 : d); }
    _arm() { clearTimeout(this.memT); this.memT = setTimeout(() => { this.inMem = false; this.idx = this.sel; this.sb = this.mem[this.sel]; this.link._emit('sim'); }, 3500); }
    get display() { return this.inMem ? 'SEL[' + String(this.sel).padStart(2, '0') + '] ' + this.mem[this.sel][0] + ' ' + this.mem[this.sel][1] : 'Standby ' + this.sb[0] + ' ' + this.sb[1]; }
    memKey() { if (this.inMem) { this.inMem = false; clearTimeout(this.memT); this.idx = this.sel; this.sb = this.mem[this.sel]; } else { this.inMem = true; this.sel = this.idx; this._arm(); } this.link._emit('sim'); }
    turn() { if (!this.inMem) return false; this.sel = (this.sel + 1) % 100; this._R(this.mem[this.sel]); this._arm(); this.link._emit('sim'); return true; }
    failNext(n) { this.fail = n; }
    write(u8) {
      for (const b of u8) {
        if (!this.buf.length) {
          if (b === 0x78) { if (!this.linked) { this.linked = true; this._send(C.buildU('122.255', 'BALLOON'), 20); this._R(this.sb, 45); } continue; }
          if (b !== K.STX) continue;
        }
        this.buf.push(b);
        const code = this.buf[1], want = code === 0x5A ? 14 : (code === 0x52 || code === 0x55) ? 13 : 2;
        if (this.buf.length < want) continue;
        const fr = this.buf; this.buf = [];
        if (this.fail > 0) { this.fail--; continue; }
        if (code === 0x5A) { const d = K.decodeFreq(fr[2], fr[3]); this.mem[fr[12]] = [d.display, String.fromCharCode(...fr.slice(4, 12)).trimEnd()]; this.idx = fr[12]; this._send([K.ACK], 28); }
        else if (code === 0x52) { const d = K.decodeFreq(fr[2], fr[3]); this.sb = [d.display, String.fromCharCode(...fr.slice(4, 12)).trimEnd()]; this._send([K.ACK], 30); }
        else if (code === 0x57 || code === 0x77) { /* blättert sichtbar, meldet nichts */ }
        else this._send([K.NAK], 15);
      }
      return Promise.resolve();
    }
    close() { clearInterval(this.timer); clearTimeout(this.memT); }
  }

  root.KRT2LINK = { Link, SimRadio, LINK_MS, link: null };
  root.KRT2LINK.link = new Link();
})(typeof window !== 'undefined' ? window : globalThis);
