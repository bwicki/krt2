/* krt2.wicki.aero – Verbindung zum Funkgerät über Web Serial (ab 0.4.0; Erkenntnisse aus den Gerätetests 13.11.2026).
   - 9600 Bd 8N1. Das Funkgerät fragt alle 10 s mit «S»; die App antwortet sofort mit «x» (gemessen 1–4 ms), dann
     erscheint «r» im Display. Meldungen U, R, Z, C, A, 1–4 werden mit ACK quittiert.
   - Schreiben: «Z» je Platz, Quittung ACK nach 27–38 ms; ohne Quittung bis zu zwei Wiederholungen.
   - Auslesen über die Schnittstelle geht nicht («W» blättert, meldet aber nichts) – dafür src/readout.js.
   - Gesendet werden nur Antworten (x, ACK), «Z» und «R». Nie: aktive Frequenz, Lautstärke, Squelch, Sendetasten.
   Die Verbindung lebt unabhängig von der angezeigten Seite. Simulation: Link.connect({ sim: true }).
   0.5.0 (Tests 14.11.2026): nie während «Senden» (K … Y) schreiben; Funkstille-Wächter (25 s ohne «S»); verlorene
   Verbindung selbst wieder aufnehmen (getPorts, USB und Bluetooth) und das Schreiben beim selben Platz fortsetzen;
   Bildschirm wach halten, solange verbunden. Auf Android läuft die Verbindung über ein gekoppeltes Bluetooth-Modul (SPP). */
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

  const SILENCE_MS = 25000;  // ohne Abfrage «S» so lange → Funkstille (das Gerät fragt alle 10 s)
  const RECOVER_MS = 120000; // so lange versucht die App, eine verlorene Verbindung selbst wieder aufzunehmen
  const RECOVER_STEP = 3000;
  const TX_WAIT_MS = 60000;  // längstens so lange auf das Ende einer Aussendung warten
  const AFTER_TX_MS = 300;   // nach «Ende» (Y) kurz warten, bevor geschrieben wird
  const lostErr = e => !!e && (e.name === 'NetworkError' || /lost/i.test(e.message || ''));

  class Link {
    constructor() {
      this.port = null; this.reader = null; this.writer = null; this.reading = false; this.readP = null;
      this.dec = new K.KRT2Decoder(); this.subs = new Set(); this.log = [];
      this.pending = null; this.queue = Promise.resolve(); this.lastU = -1e9;
      this.st = { pings: 0, answered: 0, lastAnswer: null, lastPing: null, active: null, standby: null, tx: false, txSince: null, silent: false };
      this.recovering = false; this.lastPort = null; this.lastInfo = null; this.wake = null;
      this.tick = setInterval(() => { for (const e of this.dec.tick(now())) this._log(e, '←', 'unvollständig'); this._watch(); }, 100);
      if (root.navigator && root.navigator.serial) root.navigator.serial.addEventListener('disconnect', ev => { if (this.port && !this.port.sim && ev.target === this.port) this._lost('Adapter vom Gerät getrennt'); });
      if (root.document) root.document.addEventListener('visibilitychange', () => { if (root.document.visibilityState === 'visible' && this.port) this._wakeOn(); });
    }
    get supported() { return !!(root.navigator && root.navigator.serial); }
    get connected() { return !!this.port; }
    get sim() { return !!(this.port && this.port.sim) || !!(this.recovering && this.lastPort && this.lastPort.sim); }
    get linked() { return !!this.port && this.st.lastAnswer !== null && now() - this.st.lastAnswer < LINK_MS; }
    /** 'off' | 'connected' | 'recovering' */
    get state() { return this.port ? 'connected' : this.recovering ? 'recovering' : 'off'; }
    get simRadio() { return this.lastPort && this.lastPort.sim ? this.lastPort.radio : null; }
    on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
    _emit(type, data) { for (const f of this.subs) { try { f(type, data || {}); } catch (e) { /* Anzeige darf die Verbindung nicht stören */ } } }
    _log(e, dir, note) {
      this.log.push({ t: e.t !== undefined ? e.t : now(), dir, hex: e.bytes ? K.hex(e.bytes) : '', text: (e.text || '') + (note ? ' – ' + note : '') });
      if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
    }
    _note(text) { this._log({ text }, '·'); }
    clock(t) { const d = new Date(wall0 + t); return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0'); }
    logText() {
      return ['Zeit\tRichtung\tBytes\tBedeutung'].concat(this.log.map(l => [this.clock(l.t), l.dir, l.hex, l.text].join('\t'))).join('\r\n');
    }

    // ---------- Anschluss ----------
    async connect(opts) {
      if (this.port) return;
      this.recovering = false;
      if (opts && opts.sim) {
        this.writer = new SimRadio(this); this.port = { sim: true, radio: this.writer }; this.lastPort = this.port;
        this._note('Simulation verbunden'); this._fresh(); this._wakeOn(); this._emit('status'); return;
      }
      if (!this.supported) throw new Error('Dieser Browser kann nicht auf serielle Anschlüsse zugreifen (Chrome oder Edge am Laptop, Chrome auf Android).');
      const port = await root.navigator.serial.requestPort();
      await this._open(port);
      this._note('Anschluss geöffnet (9600 Bd, 8N1)' + this._kind(port));
      this._emit('status');
    }
    _kind(port) {
      try { const i = port.getInfo(); if (i.bluetoothServiceClassId) return ' – Bluetooth'; if (i.usbVendorId) return ' – USB'; } catch (e) { /* egal */ }
      return '';
    }
    async _open(port) {
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
      this.port = port; this.lastPort = port; this.writer = port.writable.getWriter();
      try { this.lastInfo = port.getInfo(); } catch (e) { this.lastInfo = null; }
      this._fresh(); this.readP = this._readLoop(); this._wakeOn();
    }
    _fresh() { this.st.lastPing = now(); this.st.silent = false; this.st.tx = false; this.st.txSince = null; }
    async _close() {
      const p = this.port; if (!p) return;
      if (p.sim) { if (!this.recovering) this.writer.close(); }
      else {
        this.reading = false;
        try { if (this.reader) await this.reader.cancel(); } catch (e) { /* schon zu */ }
        try { if (this.readP) await this.readP; } catch (e) { /* egal */ }
        try { if (this.writer) this.writer.releaseLock(); } catch (e) { /* egal */ }
        try { await p.close(); } catch (e) { /* egal */ }
      }
      this.port = null; this.writer = null; this.readP = null; this.st.lastAnswer = null; this.st.tx = false;
      if (this.pending) this.pending.done('getrennt');
    }
    /** Von Hand trennen: keine Wiederaufnahme. */
    async disconnect(why) {
      this.recovering = false;
      if (!this.port) { this._emit('status'); return; }
      await this._close(); this._wakeOff();
      this._note(why || 'Anschluss geschlossen'); this._emit('status');
    }
    /** Verbindung verloren (Test 14.11.: USB-Adapter fiel bei einer Aussendung aus): schliessen und selbst wieder aufnehmen. */
    async _lost(why) {
      if (!this.port || this.recovering) return;
      const wasTx = this.st.txSince !== null && now() - this.st.txSince < 3000;
      this.recovering = true;
      await this._close();
      this._note('Verbindung verloren: ' + String(why).replace(/\.+$/, '') + (wasTx ? ' – kurz nach «Sender ein»' : '') + '. Die App versucht während ' + Math.round(RECOVER_MS / 1000) + ' s, sie selbst wieder aufzunehmen.');
      this._emit('status');
      this._recover();
    }
    async _recover() {
      const until = now() + RECOVER_MS;
      while (this.recovering && now() < until) {
        await sleep(RECOVER_STEP);
        if (!this.recovering) return;
        try {
          if (this.lastPort && this.lastPort.sim) {
            const sim = this.lastPort.radio;
            if (sim && !sim.dead) { this.writer = sim; this.port = this.lastPort; this._fresh(); }
          } else if (this.supported) {
            const ports = await root.navigator.serial.getPorts();
            const same = (a, b) => !!a && !!b && ((a.usbVendorId && a.usbVendorId === b.usbVendorId && a.usbProductId === b.usbProductId) || (a.bluetoothServiceClassId && a.bluetoothServiceClassId === b.bluetoothServiceClassId));
            const cand = ports.filter(p => p === this.lastPort).concat(ports.filter(p => { try { return p !== this.lastPort && same(p.getInfo(), this.lastInfo); } catch (e) { return false; } }));
            for (const p of cand) { try { await this._open(p); break; } catch (e) { /* noch nicht da */ } }
          }
        } catch (e) { /* nächster Versuch */ }
        if (this.port) {
          this.recovering = false;
          this._note('Verbindung wieder aufgenommen – warte auf die Abfrage des Funkgeräts');
          this._emit('status'); return;
        }
      }
      if (this.recovering) { this.recovering = false; this._wakeOff(); this._note('Verbindung nicht wieder aufgenommen – bitte neu verbinden'); this._emit('status'); }
    }
    /** Wartet, bis die Verbindung steht und das Funkgerät abgefragt hat («r»). */
    waitLinked(ms) {
      return new Promise(res => {
        const t1 = now() + (ms || RECOVER_MS);
        const iv = setInterval(() => {
          if (this.linked) { clearInterval(iv); res(true); }
          else if (now() > t1 || (!this.port && !this.recovering)) { clearInterval(iv); res(false); }
        }, 200);
      });
    }
    // Funkstille-Wächter und Sende-Sicherung (läuft im 100-ms-Takt)
    _watch() {
      if (!this.port) return;
      const t = now();
      if (!this.st.silent && this.st.lastPing !== null && t - this.st.lastPing > SILENCE_MS) {
        this.st.silent = true;
        this._note('Seit ' + Math.round((t - this.st.lastPing) / 1000) + ' s keine Abfrage «S» vom Funkgerät' + (this.st.tx ? ' (zuletzt «Sender ein»)' : ''));
        this._emit('status');
        // Unter Android meldet Bluetooth das Trennen nicht zuverlässig: einmal neu öffnen; bleibt es still (Funkgerät aus), nicht immer wieder
        if (!this.port.sim && !this.st.silenceTried) { this.st.silenceTried = true; this._lost('Funkstille'); }
      }
      if (this.st.tx && this.st.txSince !== null && t - this.st.txSince > 90000) { this.st.tx = false; this._note('Kein «Ende» nach «Sender ein» – Sendezustand zurückgesetzt'); this._emit('status'); }
    }
    // Bildschirm wach halten, solange verbunden (im Hintergrund antwortet die Seite nicht auf «S»)
    async _wakeOn() {
      if (!root.navigator || !root.navigator.wakeLock || this.wake || root.document && root.document.visibilityState !== 'visible') return;
      try { this.wake = await root.navigator.wakeLock.request('screen'); this.wake.addEventListener('release', () => { this.wake = null; }); } catch (e) { this.wake = null; }
    }
    _wakeOff() { if (this.wake) { try { this.wake.release(); } catch (e) { /* egal */ } this.wake = null; } }

    async _readLoop() {
      this.reading = true;
      while (this.port && this.port.readable && this.reading) {
        this.reader = this.port.readable.getReader();
        try { for (;;) { const { value, done } = await this.reader.read(); if (done) break; if (value && value.length) this._bytes(value); } }
        catch (e) { this._log({ text: 'Lesefehler: ' + e.message }, '·'); if (lostErr(e)) { this.reading = false; setTimeout(() => this._lost(e.message), 0); } }
        finally { try { this.reader.releaseLock(); } catch (e) { /* egal */ } this.reader = null; }
      }
    }
    _bytes(u8) { const t = now(); for (const e of this.dec.feed(u8, t)) this._event(e); }
    _event(e) {
      if (e.kind === 'ping') {
        this.st.pings++; this._log(e, '←'); this.st.lastPing = e.t; this.st.silenceTried = false;
        if (this.st.silent) { this.st.silent = false; this._note('Funkgerät fragt wieder ab'); this._emit('status'); }
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
      if (e.name === 'K') { this.st.tx = true; this.st.txSince = e.t; this._emit('status'); }
      if (e.name === 'Y') { const was = this.st.tx; this.st.tx = false; this.st.txSince = null; this.st.txEnd = e.t; if (was) this._emit('status'); }
      if (e.ok && 'URZCA1234'.includes(e.name)) this._raw([K.ACK], 'ACK auf Meldung ' + e.name);
      this._emit('frame', { name: e.name });
    }
    async _raw(bytes, why) {
      if (!this.writer) return false;
      const ev = { t: now(), bytes: Array.from(bytes), text: why };
      try { await this.writer.write(new Uint8Array(bytes)); this._log(ev, '→'); return true; }
      catch (e) {
        this._log(Object.assign(ev, { text: 'Fehler beim Senden: ' + e.message + ' (' + why + ')' }), '→');
        if (lostErr(e)) setTimeout(() => this._lost(e.message), 0);
        return false;
      }
    }
    /** Nie während einer Aussendung schreiben (Test 14.11.: Befehle während «Senden» riskieren die Verbindung): bis «Ende» (Y) warten.
        Nach dem letzten «Ende» immer AFTER_TX_MS abwarten, auch wenn die Aussendung schon vorbei ist (st.txEnd); beginnt in dieser
        Zeit eine neue Aussendung, auf deren Ende warten und die Frist neu beginnen (Schnittstelle Abstimmgerät–App v0.1, Projekt 024, A6). */
    async _txClear() {
      let waited = false;
      for (;;) {
        if (!this.port) return false;
        if (this.st.tx) {
          if (!waited) { this._note('Gerät sendet – Schreiben wartet auf das Ende der Aussendung'); this._emit('wait', { why: 'tx' }); waited = true; }
          const t1 = now() + TX_WAIT_MS;
          while (this.st.tx && this.port && now() < t1) await sleep(100);
          if (this.st.tx) { this._note('Aussendung dauert länger als ' + Math.round(TX_WAIT_MS / 1000) + ' s – Schreiben abgebrochen'); return false; }
          continue;
        }
        const rest = this.st.txEnd == null ? 0 : this.st.txEnd + AFTER_TX_MS - now();
        if (rest <= 0) break;
        await sleep(Math.ceil(rest));
      }
      if (waited) this._emit('wait', { why: null });
      return true;
    }
    /** Einen Befehl senden und auf ACK/NAK warten; Befehle laufen nacheinander. Ergebnis { kind, ms, tries }. */
    command(bytes, why, retries) {
      const run = async () => {
        let r = { kind: 'keine Antwort', ms: CMD_MS, tries: 0 }, extra = 0;
        for (let i = 0; i <= (retries == null ? 2 : retries); i++) {
          if (!this.writer) return { kind: 'nicht verbunden', ms: 0, tries: i };
          if (!(await this._txClear())) return { kind: this.port ? 'Gerät sendet' : 'nicht verbunden', ms: 0, tries: i };
          const ts = now();
          const p = new Promise(res => {
            const timer = setTimeout(() => { this.pending = null; res('keine Antwort'); }, CMD_MS);
            this.pending = { done: k => { clearTimeout(timer); this.pending = null; res(k); } };
          });
          if (!(await this._raw(bytes, why + (i ? ' (Wiederholung ' + i + ')' : '')))) { if (this.pending) this.pending.done('Sendefehler'); }
          const k = await p;
          r = { kind: k, ms: Math.round(now() - ts), tries: i + 1 };
          if (k === 'ACK' || k === 'getrennt' || k === 'Sendefehler') break;
          if (k === 'keine Antwort' && this.st.tx && extra < 3) { extra++; i--; }   // während des Wartens begann eine Aussendung: zählt nicht
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
    /**
     * Plätze nacheinander schreiben. Geht die Verbindung verloren, wartet das Schreiben auf die Wiederaufnahme
     * und setzt beim selben Platz fort (opt.onPause(why|null)). Bricht nach drei Fehlschlägen in Folge ab oder wenn stop() true liefert.
     */
    async program(list, opt) {
      const o = opt || {}, res = [];
      let fails = 0, pauses = 0;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (o.stop && o.stop()) break;
        const r = await this.writeSlot(p);
        const gone = ['getrennt', 'nicht verbunden', 'Sendefehler'].includes(r.kind) || (r.kind === 'keine Antwort' && this.recovering);
        if (gone && pauses < 5) {
          pauses++;
          if (o.onPause) o.onPause('link');
          this._note('Schreiben pausiert bei Platz ' + String(p.nr).padStart(2, '0') + ' – wartet auf die Verbindung');
          const ok = await this.waitLinked(RECOVER_MS);
          if (o.onPause) o.onPause(null);
          if (ok && !(o.stop && o.stop())) { this._note('Schreiben geht bei Platz ' + String(p.nr).padStart(2, '0') + ' weiter'); i--; continue; }
        }
        res.push(Object.assign({ nr: p.nr }, r));
        if (o.onSlot) o.onSlot(p.nr, r);
        fails = r.kind === 'ACK' ? 0 : fails + 1;
        if (fails >= 3 || gone) break;
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
      this.link = link; this.buf = []; this.linked = false; this.inMem = false; this.fail = 0; this.dead = false;
      const named = [['121.500', 'EMERGENC'], ['118.000', 'MIN'], ['118.005', 'MIN-8'], ['124.700', 'ZURI I'], ['118.100', 'ZURI T'], ['127.205', 'ZURI VOL'], ['126.350', 'GENF I'], ['128.050', 'SWISS R']];
      this.mem = Array.from({ length: 100 }, (_, i) => (i < named.length ? named[i].slice() : ['136.975', '']));
      this.idx = 98; this.sel = 98; this.sb = ['136.975', ''];
      this.timer = setInterval(() => this._send([0x53], 0), 3000);
    }
    _send(bytes, delay) { setTimeout(() => { if (!this.dead) this.link._bytes(Uint8Array.from(bytes)); }, delay); }
    /** Aussendung von ms Dauer (K … Y). */
    tx(ms) { this._send([K.STX, 0x4B], 0); this._send([K.STX, 0x59], ms || 5000); }
    /** Verbindung für ms weg (wie der USB-Adapter beim Test 14.11.): keine Meldungen, Schreiben scheitert. */
    drop(ms) { this.dead = true; setTimeout(() => { this.dead = false; }, ms || 10000); }
    _R(v, d) { this._send(C.buildR(v[0], v[1]), d == null ? 25 : d); }
    _arm() { clearTimeout(this.memT); this.memT = setTimeout(() => { this.inMem = false; this.idx = this.sel; this.sb = this.mem[this.sel]; this.link._emit('sim'); }, 3500); }
    get display() { return this.inMem ? 'SEL[' + String(this.sel).padStart(2, '0') + '] ' + this.mem[this.sel][0] + ' ' + this.mem[this.sel][1] : 'Standby ' + this.sb[0] + ' ' + this.sb[1]; }
    memKey() { if (this.inMem) { this.inMem = false; clearTimeout(this.memT); this.idx = this.sel; this.sb = this.mem[this.sel]; } else { this.inMem = true; this.sel = this.idx; this._arm(); } this.link._emit('sim'); }
    turn() { if (!this.inMem) return false; this.sel = (this.sel + 1) % 100; this._R(this.mem[this.sel]); this._arm(); this.link._emit('sim'); return true; }
    failNext(n) { this.fail = n; }
    write(u8) {
      if (this.dead) return Promise.reject(new DOMException('The device has been lost.', 'NetworkError'));
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
