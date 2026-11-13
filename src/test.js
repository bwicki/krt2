// krt2.wicki.aero – geführter Machbarkeitstest (Schritte 0–8). Schritt 3: Speicher von Hand auslesen.
// Baut auf der Seite «KRT2 mitlesen» aus Projekt 024 auf. Befehle (W, Z, R) gehen nur hinaus, wenn
// «Senden freigeben» und «Befehle freigeben» gesetzt sind. Nie gesendet: U (aktive Frequenz),
// Lautstärke, Squelch, Kanalraster, Sendetasten.
(function () {
  'use strict';
  const VERSION = 'test 0.3.1';
  const $ = id => document.getElementById(id);
  const K = window.KRT2, C = window.KRT2CODEC;
  const SIM = new URLSearchParams(location.search).has('sim');
  $('ver').textContent = VERSION + (SIM ? ' · SIMULATION' : '');
  if (SIM) { $('simnote').hidden = false; $('simHand').hidden = false; }
  else if (!('serial' in navigator)) { $('unsupported').hidden = false; $('btnConnect').disabled = true; }

  const dec = new K.KRT2Decoder();
  const t0 = performance.now(), wall0 = Date.now();
  const now = () => performance.now() - t0;
  const clock = t => { const d = new Date(wall0 + t); return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0'); };
  const fmtMs = ms => (ms < 10000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const two = n => String(n).padStart(2, '0');

  let port = null, reader = null, writer = null, reading = false, readPromise = null;
  let events = [], lastT = null;
  const st = {
    pings: 0, answered: 0, lastAnswerT: null, lastAnswerMs: null, statusSeen: false,
    active: null, standby: null, saved: null,
    s2: null, s3: null, s4: null, s5: null, s6: { r833: null, r25: null }, s7: null
  };
  let pending = null, stbyWait = null, busy = false, abortRead = false;
  let hm = new Array(100).fill(null);   // Schritt 3: Platz → { freq, name, dt, state, seen, prev }

  // ---------- Protokoll ----------
  function addRow(ev, cls) {
    const tb = $('log'), tr = document.createElement('tr');
    if (cls) tr.className = cls;
    const dt = lastT === null ? '' : '+' + Math.round(ev.t - lastT); lastT = ev.t;
    [clock(ev.t), dt, ev.dir || '←', ev.bytes ? K.hex(ev.bytes) : '', ev.text].forEach((c, i) => {
      const td = document.createElement('td'); td.textContent = c; if (i === 3) td.className = 'hex'; tr.appendChild(td);
    });
    tb.appendChild(tr);
    while (tb.rows.length > 5000) tb.deleteRow(0);
    $('logbox').scrollTop = $('logbox').scrollHeight;
  }
  function record(ev, cls) { events.push(Object.assign({ cls }, ev)); addRow(ev, cls); }
  const note = (text, cls = 'note') => record({ t: now(), dir: '·', bytes: [], text }, cls);
  function setStatus(el, txt, cls) { const s = $(el); s.textContent = txt; s.className = 'status ' + (cls || ''); }
  function setAuto(el, txt, cls) { const s = $(el); s.textContent = txt; s.className = 'auto ' + (cls || ''); }
  const fq = x => x ? x.freq + ' «' + x.name + '»' : '–';

  // ---------- Statusleiste, Abzeichen, Zusammenfassung ----------
  const linkActive = () => st.lastAnswerT !== null && now() - st.lastAnswerT < 15000;
  function manual(n) { const r = document.querySelector('input[name="m' + n + '"]:checked'); return r ? r.value : ''; }
  function noteOf(n) { const i = document.querySelector('[data-note="' + n + '"]'); return i ? i.value.trim() : ''; }
  function badge(n, autoOk, autoBad) {
    const m = manual(n), b = $('b' + n);
    let cls = 'open', txt = 'offen';
    if (m === 'nein' || autoBad) { cls = 'bad'; txt = autoBad && m !== 'nein' ? 'Problem' : 'nicht bestanden'; }
    else if (autoOk && m === 'ja') { cls = 'ok'; txt = 'bestanden'; }
    else if (autoOk) { txt = 'Gerät prüfen'; }
    b.className = 'badge ' + cls; b.textContent = txt;
    return cls;
  }
  function refresh() {
    $('sbPort').textContent = port ? (port.sim ? 'Simulation' : 'verbunden') : 'nicht verbunden';
    $('sbLink').textContent = linkActive() ? 'aktiv' : (st.answered ? 'abgelaufen' : '–');
    $('sbLink').className = linkActive() ? 'ok' : (st.answered ? 'bad' : '');
    $('sbActive').textContent = fq(st.active);
    $('sbStandby').textContent = fq(st.standby);
    const prep = [...document.querySelectorAll('[data-prep]')];
    const b0 = $('b0'), allPrep = prep.every(c => c.checked) && !!port;
    b0.className = 'badge ' + (allPrep ? 'ok' : 'open'); b0.textContent = allPrep ? 'bereit' : 'offen';
    const s1ok = st.answered > 0 && st.statusSeen;
    setAuto('a1', st.pings === 0 ? 'Noch keine Abfrage «S» gesehen.' :
      'Abfragen «S»: ' + st.pings + ' gesehen, ' + st.answered + ' beantwortet' + (st.lastAnswerMs !== null ? ' (Antwort nach ' + st.lastAnswerMs + ' ms)' : '') +
      '.\nZustandsmeldung des Geräts: ' + (st.statusSeen ? 'erhalten – aktiv ' + fq(st.active) + ', Standby ' + fq(st.standby) : 'noch nicht') +
      (st.answered === 0 ? '\n«Senden freigeben» setzen, damit die Seite antwortet.' : ''), s1ok ? 'ok' : '');
    const r = {
      1: badge(1, s1ok, false),
      2: badge(2, st.s2 && st.s2.ok, st.s2 && !st.s2.ok),
      3: badge(3, st.s3 && st.s3.ok, st.s3 && st.s3.bad),
      4: badge(4, st.s4 === 'ACK', st.s4 && st.s4 !== 'ACK'),
      5: badge(5, st.s5 === 'ACK', st.s5 && st.s5 !== 'ACK'),
      6: badge(6, st.s6.r833 === 'ACK' && st.s6.r25 === 'ACK', (st.s6.r833 && st.s6.r833 !== 'ACK') || (st.s6.r25 && st.s6.r25 !== 'ACK')),
      7: badge(7, st.s7 === 'ACK', st.s7 && st.s7 !== 'ACK')
    };
    $('summary').textContent = summaryText(r);
  }
  const LABEL = { 1: 'Verbindung «r»', 2: 'Blättern mit W', 3: 'Speicher von Hand auslesen', 4: 'Platz 98 schreiben', 5: 'Ziffern im Namen', 6: 'Kanalraster', 7: 'Zurückstellen' };
  const WORD = { ok: 'bestanden', bad: 'NICHT bestanden', open: 'offen' };
  function summaryText(r) {
    const lines = [];
    for (let n = 1; n <= 7; n++) {
      const m = manual(n), nt = noteOf(n);
      lines.push('Schritt ' + n + ' ' + LABEL[n] + ': ' + WORD[r[n]] + (m ? ' (Gerät: ' + m + ')' : '') + (nt ? ' – ' + nt : ''));
    }
    if (st.s2) lines.push('', 'W einmal: ' + st.s2.text);
    if (st.trialText) lines.push('Versuche (Schritt 3 A): ' + st.trialText);
    if (st.s3) lines.push('Auslesen von Hand: ' + st.s3.text);
    lines.push('Platz 98: ' + (st.s4 || '–') + ' · Platz 97: ' + (st.s5 || '–') + ' · Standby 132.505: ' + (st.s6.r833 || '–') + ' · 123.450: ' + (st.s6.r25 || '–') + ' · Zurückstellen: ' + (st.s7 || '–'));
    return lines.join('\n');
  }
  setInterval(() => { for (const e of dec.tick(now())) record(e, 'bad'); }, 50);
  setInterval(refresh, 1000);
  document.addEventListener('change', e => { if (e.target.matches('[data-prep],input[type=radio]')) refresh(); });
  document.addEventListener('input', e => { if (e.target.matches('[data-note]')) refresh(); });

  // ---------- Senden ----------
  async function sendRaw(bytes, why, isCommand) {
    const ev = { t: now(), dir: '→', bytes: Array.from(bytes), text: why };
    if (!$('optSend').checked) { ev.text = 'NICHT gesendet (Senden nicht freigegeben): ' + why; record(ev, 'bad'); return false; }
    if (isCommand && !$('optCmd').checked) { ev.text = 'NICHT gesendet (Befehle nicht freigegeben): ' + why; record(ev, 'bad'); return false; }
    if (!isCommand && bytes.includes(K.STX)) { ev.text = 'VERWEIGERT (STX nur bei Befehlen): ' + why; record(ev, 'bad'); return false; }
    if (!writer) { ev.text = 'NICHT gesendet (kein Anschluss): ' + why; record(ev, 'bad'); return false; }
    try { await writer.write(new Uint8Array(bytes)); record(ev, 'out'); return true; }
    catch (e) { ev.text = 'Fehler beim Senden: ' + e.message; record(ev, 'bad'); return false; }
  }
  function waitReply(ms) {
    return new Promise(resolve => {
      const tStart = now();
      const timer = setTimeout(() => { pending = null; resolve({ kind: 'keine Antwort', ms: now() - tStart }); }, ms);
      pending = { resolve: kind => { clearTimeout(timer); pending = null; resolve({ kind, ms: now() - tStart }); } };
    });
  }
  // Wartet auf die Standby-Meldung «R» nach einem Befehl. Kommen mehrere «R» kurz hintereinander
  // (z. B. Zustandsmeldung nach einer Abfrage «S»), gilt die letzte innerhalb von 120 ms.
  function waitStandby(ms) {
    return new Promise(resolve => {
      const tStart = now();
      let last = null, settle = null;
      const done = () => { clearTimeout(timer); clearTimeout(settle); stbyWait = null; resolve(last); };
      const timer = setTimeout(done, ms);
      stbyWait = { resolve: fr => { last = { fr, ms: now() - tStart }; clearTimeout(settle); settle = setTimeout(done, 120); } };
    });
  }
  async function command(bytes, why, retries) {
    for (let i = 0; i <= retries; i++) {
      const p = waitReply(800);
      const ok = await sendRaw(bytes, why + (i ? ' (Wiederholung ' + i + ')' : ''), true);
      if (!ok) { if (pending) pending.resolve('nicht gesendet'); return { kind: 'nicht gesendet', ms: 0 }; }
      const r = await p;
      if (r.kind !== 'keine Antwort') return r;
    }
    return { kind: 'keine Antwort', ms: 800 };
  }
  // Sperrgrund ins Protokoll und sichtbar an den Schritt (Test 13.11.: Meldung nur im Protokoll wurde übersehen).
  function guard(at) {
    const stop = msg => {
      note(msg, 'bad');
      const e = at && $(at);
      if (e) { if (e.classList.contains('auto')) setAuto(at, 'Nicht gesendet: ' + msg, 'bad'); else setStatus(at, 'Nicht gesendet: ' + msg, 'warn'); }
      return false;
    };
    if (busy) return stop('Bitte warten, ein Vorgang läuft noch.');
    if (hand.on) return stop('Zuerst die Aufnahme in Schritt 3 beenden.');
    if (!port) return stop('Zuerst den Adapter verbinden (Schritt 0).');
    if (!$('optSend').checked || !$('optCmd').checked) return stop('Für diesen Schritt «Senden freigeben» und «Befehle freigeben» setzen.');
    if (!linkActive()) note('Warnung: Verbindung «r» nicht bestätigt – das Gerät nimmt Befehle möglicherweise nicht an.', 'bad');
    return true;
  }
  function rememberStandby() {
    if (!st.saved && st.standby) { st.saved = Object.assign({}, st.standby); note('Ausgangs-Standby gemerkt: ' + fq(st.saved)); }
  }

  // ---------- Empfang ----------
  function handleEvent(e) {
    if (e.kind === 'ping') {
      st.pings++; record(e, 'ping');
      if ($('optSend').checked) {
        const tq = now();
        sendRaw([0x78], 'Antwort «x» auf die Abfrage', false).then(ok => { if (ok) { st.answered++; st.lastAnswerT = now(); st.lastAnswerMs = Math.round(now() - tq + (tq - e.t)); refresh(); } });
      }
      return;
    }
    if (e.kind === 'ack' || e.kind === 'nak') { record(e, e.kind === 'nak' ? 'bad' : ''); if (pending) pending.resolve(e.kind === 'ack' ? 'ACK' : 'NAK'); return; }
    if (e.kind === 'frame') {
      record(e, e.ok ? '' : 'bad');
      if (e.ok && e.freq && e.name === 'U') { st.active = { freq: e.freq.display, name: e.station.trim() }; st.statusSeen = true; hand.lastUT = e.t; }
      if (e.ok && e.freq && e.name === 'R') { st.standby = { freq: e.freq.display, name: e.station.trim() }; if (stbyWait) stbyWait.resolve(e); handR(e); }
      if (e.name === 'C') { const a = st.active; st.active = st.standby; st.standby = a; }
      if (e.name === 'K') { $('sbTx').textContent = 'SENDET'; if (busy) note('ACHTUNG: Funkgerät sendet während eines Tests', 'bad'); }
      if (e.name === 'J') $('sbTx').textContent = 'Empfang';
      if (e.name === 'Y' || e.name === 'V') $('sbTx').textContent = '';
      if ('URZCA1234'.includes(e.name) && e.ok && $('optSend').checked) sendRaw([K.ACK], 'ACK auf Meldung ' + e.name, false);
      refresh(); return;
    }
    record(e, e.kind === 'incomplete' ? 'bad' : '');
  }
  function handleBytes(u8) { const t = now(); for (const e of dec.feed(u8, t)) handleEvent(e); }

  async function readLoop() {
    reading = true;
    while (port && port.readable && reading) {
      reader = port.readable.getReader();
      try { for (;;) { const { value, done } = await reader.read(); if (done) break; if (value && value.length) handleBytes(value); } }
      catch (e) { note('Lesefehler: ' + e.message, 'bad'); }
      finally { reader.releaseLock(); reader = null; }
    }
  }

  // ---------- Simulation (?sim=1, ?sim=verlassen) ----------
  // Nachgebildetes Funkgerät: fragt alle 3 s mit «S», meldet nach der Antwort seinen Zustand, quittiert Z und R,
  // blättert mit W ohne Meldung. MEM und Drehknopf wie am 13.11. gemessen (?sim=1): Meldung bei jeder Raste,
  // MEM allein und das Verlassen des Speichermodus melden nichts. ?sim=verlassen: Meldung erst beim Verlassen.
  function makeSim() {
    const per = new URLSearchParams(location.search).get('sim') !== 'verlassen';
    const names = ['', 'ZRH INFO', 'GVA INFO', 'BIR AFIS', 'SPE AFIS', 'WIN AFIS', 'ZRH APP', 'ZRH TWR', 'BASL T', 'BRN APP', 'BERL N', 'ZRH ATIS', 'BERL SCF', 'BERL TGL', 'CENTRE', 'MIN-8'];
    const freqs = ['121.500', '124.700', '126.350', '123.550', '120.350', '134.975', '125.325', '118.100', '118.300', '127.325', '125.800', '125.725', '135.900', '136.025', '127.000', '118.005'];
    const mem = Array.from({ length: 100 }, (_, i) => i < 16 ? [freqs[i], names[i]] : (i === 99 ? ['121.500', 'EMERGENC'] : ['118.000', 'FREE']));
    let idx = 98, sel = 98, inMem = false, memTimer = null, sb = ['136.975', ''], buf = [], linked = false;
    const reply = (bytes, delay = 15) => setTimeout(() => handleBytes(Uint8Array.from(bytes)), delay);
    const sendR = (v, delay = 30) => reply(C.buildR(v[0], v[1]), delay);
    const timer = setInterval(() => { if (!inMem) reply([0x53], 0); }, 3000);
    const disp = () => { const d = $('simDisp'); if (d) d.textContent = inMem ? 'Anzeige: SEL[' + two(sel) + '] ' + mem[sel][0] + ' ' + (mem[sel][1] || '') : 'Anzeige: Normalbetrieb · Standby ' + sb[0] + ' ' + sb[1]; };
    const leave = () => { clearTimeout(memTimer); inMem = false; idx = sel; sb = mem[sel]; if (!per) sendR(sb); disp(); };
    const arm = () => { clearTimeout(memTimer); memTimer = setTimeout(leave, 3500); };
    disp();
    return {
      close() { clearInterval(timer); clearTimeout(memTimer); },
      memKey() { if (inMem) { leave(); return; } inMem = true; sel = idx; arm(); disp(); },
      turn() {
        if (!inMem) { note('Simulation: Knopf ausserhalb des Speichermodus – verstellt die Lautstärke, keine Meldung'); return; }
        sel = (sel + 1) % 100; if (per) sendR(mem[sel]); arm(); disp();
      },
      write(u8) {
        for (const b of u8) {
          if (!buf.length) {
            if (b === 0x78) { if (!linked) { linked = true; reply(C.buildU('122.255', 'BALLOON'), 20); sendR(sb, 40); } continue; }
            if (b === 0x53 || b === K.ACK || b !== K.STX) continue;
          }
          buf.push(b);
          const code = buf[1], want = code === 0x5A ? 14 : (code === 0x52 || code === 0x55) ? 13 : 2;
          if (buf.length < want) continue;
          const fr = buf; buf = [];
          if (code === 0x5A) { const d = K.decodeFreq(fr[2], fr[3]); mem[fr[12]] = [d.display, String.fromCharCode(...fr.slice(4, 12)).trim()]; idx = fr[12]; reply([K.ACK], 27); }
          else if (code === 0x52) { const d = K.decodeFreq(fr[2], fr[3]); sb = [d.display, String.fromCharCode(...fr.slice(4, 12)).trim()]; reply([K.ACK], 30); disp(); }
          else if (code === 0x57 || code === 0x77) { /* blättert sichtbar, meldet nichts */ }
          else reply([K.NAK]);
        }
        return Promise.resolve();
      },
      releaseLock() {}
    };
  }

  // ---------- Schritt 0: Anschluss ----------
  $('btnConnect').onclick = async () => {
    if (SIM) {
      writer = makeSim(); port = { sim: true };
      $('btnConnect').disabled = true; $('btnDisconnect').disabled = false;
      note('Simulation gestartet'); refresh(); return;
    }
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
      writer = port.writable.getWriter();
      $('btnConnect').disabled = true; $('btnDisconnect').disabled = false;
      note('Anschluss geöffnet (9600 Bd, 8N1)');
      readPromise = readLoop(); refresh();
    } catch (e) { port = null; note('Anschluss nicht geöffnet: ' + e.message, 'bad'); }
  };
  async function closePort(why) {
    if (port && port.sim) { writer.close(); writer = null; port = null; }
    else {
      reading = false;
      try { if (reader) await reader.cancel(); } catch (e) { /* schon zu */ }
      try { if (readPromise) await readPromise; } catch (e) { /* egal */ }
      try { if (writer) writer.releaseLock(); } catch (e) { /* egal */ }
      writer = null;
      try { if (port) await port.close(); } catch (e) { /* egal */ }
      port = null; readPromise = null;
    }
    $('btnConnect').disabled = false; $('btnDisconnect').disabled = true;
    note(why); refresh();
  }
  $('btnDisconnect').onclick = () => closePort('Anschluss geschlossen');
  if (navigator.serial) navigator.serial.addEventListener('disconnect', () => { if (port && !port.sim) closePort('Adapter abgezogen'); });
  $('optSend').onchange = () => { note('Senden ' + ($('optSend').checked ? 'freigegeben' : 'gesperrt')); refresh(); };
  $('optCmd').onchange = () => { note('Befehle an das Funkgerät ' + ($('optCmd').checked ? 'freigegeben' : 'gesperrt')); refresh(); };
  $('btnQuery').onclick = () => sendRaw([0x53], 'eigene Verbindungsabfrage «S» (Diagnose; stellt keine Verbindung her)', false);

  // ---------- Standby zurücksetzen ----------
  async function setStandby(freq, name, why) {
    let bytes; try { bytes = C.buildR(freq, name); } catch (e) { note(e.message, 'bad'); return 'Eingabefehler'; }
    const r = await command(bytes, why + ': Standby ← ' + C.encodeFreq(freq).display + ' «' + C.normalizeName(name).trimmed + '»', 2);
    if (r.kind === 'ACK') st.standby = { freq: C.encodeFreq(freq).display, name: C.normalizeName(name).trimmed };
    note(why + ': ' + r.kind + (r.kind === 'ACK' ? ' nach ' + fmtMs(r.ms) : ''), r.kind === 'ACK' ? 'note' : 'bad');
    refresh(); return r.kind;
  }
  document.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
    if (!st.saved) { note('Kein Ausgangs-Standby gemerkt (er wird beim ersten W oder R übernommen).', 'bad'); return; }
    const near = b.closest('section').querySelector('.status, .auto');
    if (!guard(near && near.id)) return;
    busy = true; await setStandby(st.saved.freq, st.saved.name, 'Standby zurücksetzen'); busy = false;
  });

  // ---------- Schritt 2: W einmal ----------
  $('btnW1').onclick = async () => {
    if (!guard('a2')) return;
    busy = true; rememberStandby();
    const w = waitStandby(1500);
    const r = await command(C.buildW(), 'W: nächster Speicherplatz → Standby', 0);
    const s = await w;
    busy = false;
    const ok = r.kind === 'ACK' && !!s;
    const text = 'Antwort ' + r.kind + (r.kind === 'ACK' ? ' nach ' + fmtMs(r.ms) : '') + ' · ' + (s ? 'Meldung ' + s.fr.freq.display + ' «' + s.fr.station.trim() + '» nach ' + fmtMs(s.ms) : 'keine Standby-Meldung innert 1.5 s');
    st.s2 = { ok, text };
    setAuto('a2', text + (ok ? '' : '\nOhne Meldung ist Auslesen über W nicht möglich – Schritt 3 trotzdem einmal versuchen.'), ok ? 'ok' : 'bad');
    note('Schritt 2: ' + text, ok ? 'note' : 'bad'); refresh();
  };

  // ---------- Schritt 3: Speicher von Hand auslesen ----------
  // Holt man am Gerät einen Platz mit MEM und Drehknopf, meldet das Gerät ihn mit «R» (Frequenz und Name,
  // ohne Platznummer). Ob bei jeder Raste oder erst beim Verlassen des Speichermodus, klären die Versuche A.
  // Jede gezählte Meldung gilt als nächster Platz; die Nummer aus SEL[..] verankert und prüft die Zählung.
  const same = (a, b) => !!a && !!b && a.freq === b.freq && a.name === b.name;
  const hmode = () => (document.querySelector('input[name="hmode"]:checked') || {}).value || 'verlassen';
  const STATE = { gelesen: 'gelesen', kontrolliert: 'Kontrolle ✓', unsicher: 'unsicher – nochmals holen', widerspruch: 'Widerspruch' };
  const newStats = () => ({ got: 0, dup: 0, burst: 0, chkOk: 0, chkBad: 0, jump: 0, dts: [] });
  const hand = { on: false, cursor: null, pend: [], hist: [], lastR: null, lastUT: -1e9, base: null, sinceChk: [], covered: new Set(), stats: newStats() };
  st.trials = {}; st.memExit = null; st.trialText = '';
  let trial = null;

  // A · Versuche
  const TRIAL_TXT = {
    1: 'Jetzt MEM drücken, nicht drehen, warten.',
    2: 'Jetzt MEM drücken und im Sekundentakt 3 Rasten im Uhrzeigersinn drehen, dann warten.',
    3: 'Jetzt MEM drücken, 1 Raste drehen, sofort nochmals MEM drücken.'
  };
  const secs = ms => (ms / 1000).toFixed(1) + ' s';
  const trialLine = rs => rs.length ? rs.length + ' Meldung(en): ' + rs.map(r => '+' + secs(r.dt) + ' ' + fq(r)).join(', ') : 'keine Meldung';
  function startTrial(n) {
    if (!port) { note('Zuerst den Adapter verbinden (Schritt 0).', 'bad'); return; }
    if (!$('optSend').checked) { note('Für die Versuche «Senden freigeben» setzen.', 'bad'); return; }
    if (hand.on) { note('Während der Aufnahme keine Versuche.', 'bad'); return; }
    if (trial) endTrial();
    const t = trial = { n, t0: now(), rs: [] };
    note('Versuch ' + n + ' gestartet: ' + TRIAL_TXT[n]);
    t.tick = setInterval(() => setStatus('trialProg', 'Versuch ' + n + ': noch ' + Math.max(0, Math.ceil((12000 - (now() - t.t0)) / 1000)) + ' s · ' + t.rs.length + ' Meldung(en)'), 250);
    t.timer = setTimeout(endTrial, 12000);
    setAuto('a3a', 'Versuch ' + n + ' läuft. ' + TRIAL_TXT[n], 'warn');
  }
  function endTrial() {
    const t = trial; if (!t) return; trial = null;
    clearInterval(t.tick); clearTimeout(t.timer);
    st.trials[t.n] = t.rs;
    setStatus('trialProg', 'Versuch ' + t.n + ' fertig: ' + t.rs.length + ' Meldung(en)', t.rs.length ? 'ok' : 'warn');
    note('Versuch ' + t.n + ': ' + trialLine(t.rs));
    analyzeTrials(); refresh();
  }
  function analyzeTrials() {
    const T = st.trials, lines = [], facts = [];
    for (const n of [1, 2, 3]) if (T[n]) lines.push('Versuch ' + n + ': ' + trialLine(T[n]));
    if (T[2]) {
      const mode = T[2].length >= 3 ? 'raste' : T[2].length ? 'verlassen' : null;
      if (mode) document.querySelector('input[name="hmode"][value="' + mode + '"]').checked = true;
      facts.push(mode === 'raste' ? 'Das Gerät meldet bei jeder Raste.' : mode ? 'Das Gerät meldet erst beim Verlassen des Speichermodus, nicht bei jeder Raste.' : 'Versuch 2 ohne Meldung – Verbindung «r» prüfen und wiederholen.');
    }
    if (T[1]) facts.push(T[1].length ? 'Nur MEM: letzte Meldung nach ' + secs(T[1][T[1].length - 1].dt) + ' (ab Klick, mit der Zeit bis zum Drücken).' : 'Nur MEM: keine Meldung innert 12 s.');
    if (T[3] && T[3].length && hmode() === 'verlassen') {
      st.memExit = T[3][T[3].length - 1].dt < 3500;
      facts.push(st.memExit ? 'Das zweite MEM beendet den Speichermodus sofort (Meldung nach ' + secs(T[3][T[3].length - 1].dt) + ') – Auslesen mit MEM, Raste, MEM.'
        : 'Das zweite MEM beendet den Speichermodus vermutlich nicht sofort (Meldung erst nach ' + secs(T[3][T[3].length - 1].dt) + ') – nach jeder Raste die Meldung abwarten.');
    }
    st.trialText = facts.join(' ');
    setAuto('a3a', lines.concat(facts.length ? [''].concat(facts) : []).join('\n'), T[2] && T[2].length ? 'ok' : '');
    renderSteps();
  }
  [1, 2, 3].forEach(n => { $('btnT' + n).onclick = () => startTrial(n); });

  // B · Aufnahme
  function renderSteps() {
    const ol = $('handSteps'), exit = st.memExit ? 'sofort nochmals <b>MEM</b> drücken' : 'warten, bis die Meldung in der Tabelle steht (einige Sekunden)';
    const li = hmode() === 'raste' ? [
      '«Aufnahme starten». Am Gerät <b>MEM</b> drücken (meldet noch nichts) und <b>1 Raste im Uhrzeigersinn</b> drehen.',
      'Die Nummer aus <span class="mono">SEL[..]</span> eintragen und «Nummer übernehmen» (Enter).',
      'Langsam weiterdrehen, etwa 1 Raste in 2 s, bis die Seite «Runde geschlossen» meldet: gut 100 Rasten, rund 5 Minuten. Die Aufnahme endet dann von selbst. Leere Plätze melden sich auch – einfach weiterdrehen.',
      'Zwischendurch darfst Du zur Kontrolle die Nummer aus <span class="mono">SEL[..]</span> eintragen; nötig ist es nicht, die geschlossene Runde prüft die ganze Zählung.'
    ] : [
      '«Aufnahme starten». Am Gerät <b>MEM</b> drücken, <span class="mono">SEL[00]</span> wählen, dann ' + exit + '.',
      '<b>00</b> eintragen und «Nummer übernehmen» (Enter).',
      'Für jeden weiteren Platz: <b>MEM</b>, den Platz wählen, den die Seite als «nächster» anzeigt (meist 1 Raste im Uhrzeigersinn), dann ' + exit + '. Jede Meldung zählt als nächster Platz.',
      'Etwa alle 10 Plätze zur Kontrolle die Nummer eintragen, die zuletzt bei <span class="mono">SEL[..]</span> stand.'
    ];
    li.push('Unsichere oder fehlende Plätze nachholen: am Gerät den Platz holen, danach seine Nummer eintragen. Die Seite zählt von dort aus weiter.');
    li.push('Nach Platz 99: «Aufnahme beenden», Sicherung als CSV und JSON speichern, beide Dateien nach <span class="mono">046 WebAPP krt2\\02_Machbarkeitstest</span>.');
    ol.innerHTML = li.map(x => '<li>' + x + '</li>').join('');
  }
  document.querySelectorAll('input[name="hmode"]').forEach(r => r.onchange = () => { note('Schritt 3: Modus «' + (hmode() === 'raste' ? 'bei jeder Raste' : 'beim Verlassen') + '» gewählt'); renderSteps(); renderHand(); });

  function handR(fr) {
    const r = { t: fr.t, freq: fr.freq.display, name: fr.station.trim() };
    if (r.t - hand.lastUT < 600) {   // gehört zur Zustandsmeldung nach dem Verbindungsaufbau (U … R)
      if (hand.on || trial) { hand.stats.burst++; note('Meldung ' + fq(r) + ' gehört zur Zustandsmeldung nach «U» – nicht gezählt'); }
      return;
    }
    if (trial) trial.rs.push(Object.assign({ dt: r.t - trial.t0 }, r));
    const prev = hand.lastR, dt = prev ? r.t - prev.t : null;
    hand.lastR = r;
    if (!hand.on) return;
    if (prev && $('optDup').checked && dt < 300 && same(prev, r)) { hand.stats.dup++; note('Schritt 3: gleiche Meldung nach ' + fmtMs(dt) + ' – nur einmal gezählt'); return; }
    // Test 13.11. (test 0.3.0): Das Gerät meldet bei jeder Raste, MEM allein und das Verlassen des Speichermodus
    // melden nichts. Gleiche Meldungen nach einer Pause sind deshalb echte Plätze (z. B. mehrere leere Plätze).
    count(r, dt);
  }
  function count(r, dt) {
    hand.stats.got++;
    if (dt !== null) hand.stats.dts.push(dt);
    if (hand.cursor === null) { hand.pend.push({ r, dt }); hand.hist.push({ kind: 'pend' }); renderHand(); return; }
    const slot = (hand.cursor + 1) % 100, again = hand.covered.has(slot) && hand.covered.size === 100;
    put(slot, r, dt);
    if (again) closeRound(slot);
    renderHand();
  }
  // Nach 100 gezählten Plätzen dieser Aufnahme: Stimmt die nächste Meldung mit dem schon gelesenen Platz überein,
  // ist die Runde geschlossen und die ganze Zählung bestätigt. Die Aufnahme endet dann von selbst.
  function closeRound(slot) {
    const e = hm[slot];
    if (e.state === 'widerspruch') {
      note('Schritt 3: Runde NICHT geschlossen – Platz ' + two(slot) + ' meldet ' + fq(e) + ', beim ersten Mal ' + e.prev + '. Nummer aus SEL[..] eintragen.', 'bad');
      return;
    }
    hand.stats.chkOk++;
    hm.forEach(x => { if (x && x.state === 'gelesen') x.state = 'kontrolliert'; });
    note('Schritt 3: Runde geschlossen – Platz ' + two(slot) + ' ' + fq(e) + ' stimmt beim zweiten Durchgang. Alle 100 Plätze bestätigt, Aufnahme beendet.');
    stopHand();
  }
  function put(slot, r, dt) {
    const old = hm[slot];
    const e = { freq: r.freq, name: r.name, dt, state: 'gelesen', seen: 1, prev: null };
    if (old && old.state !== 'unsicher') {
      if (same(old, e)) { e.seen = old.seen + 1; e.state = old.state === 'kontrolliert' ? 'kontrolliert' : 'gelesen'; e.prev = old.prev; }
      else { e.state = 'widerspruch'; e.prev = fq(old); }
    }
    hand.hist.push({ kind: 'put', slot, old, cursor: hand.cursor, sinceChk: hand.sinceChk.slice() });
    hm[slot] = e; hand.cursor = slot; hand.sinceChk.push(slot); hand.covered.add(slot);
  }
  function applySel() {
    const v = $('selNr').value.trim(), nr = Number(v);
    if (v === '' || !Number.isInteger(nr) || nr < 0 || nr > 99) { setStatus('handProg', 'Nummer 00–99 eingeben', 'warn'); return; }
    $('selNr').value = '';
    if (hand.cursor === null) {
      if (!hand.pend.length) { setStatus('handProg', 'Noch keine Meldung – zuerst am Gerät einen Platz holen', 'warn'); return; }
      const list = hand.pend; hand.pend = []; hand.hist = hand.hist.filter(h => h.kind !== 'pend');
      hand.cursor = ((nr - list.length) % 100 + 100) % 100;
      for (const p of list) put((hand.cursor + 1) % 100, p.r, p.dt);
      mark(hand.sinceChk); hand.stats.chkOk++;
      note('Schritt 3: Zählung verankert – letzte Meldung ' + fq(hm[nr]) + ' = Platz ' + two(nr) + (list.length > 1 ? ' (die ' + (list.length - 1) + ' davor rückwärts nummeriert)' : ''));
    } else if (nr === hand.cursor) {
      mark(hand.sinceChk); hand.stats.chkOk++;
      note('Schritt 3: Kontrolle Platz ' + two(nr) + ' stimmt');
    } else {
      const was = hand.cursor, e = hm[was], h = hand.hist[hand.hist.length - 1];
      const shaky = hand.sinceChk.filter(s => s !== was);
      if (!shaky.length) hand.stats.jump++; else hand.stats.chkBad++;
      hm[was] = h && h.kind === 'put' && h.slot === was ? h.old : null;
      for (const s of shaky) if (hm[s]) hm[s].state = 'unsicher';
      hm[nr] = Object.assign({}, e, { state: 'kontrolliert', prev: null });
      hand.cursor = nr; hand.sinceChk = []; hand.hist = [];
      if (!shaky.length) note('Schritt 3: ' + fq(hm[nr]) + ' als Platz ' + two(nr) + ' übernommen (Sprung, die Seite hätte ' + two(was) + ' erwartet)');
      else note('Schritt 3: Kontrolle – Seite zählte Platz ' + two(was) + ', Gerät zeigte ' + two(nr) + '. Letzte Meldung auf ' + two(nr) + ' gesetzt; ' + shaky.length + ' Platz/Plätze seit der letzten Kontrolle unsicher (' + ranges(shaky) + ') – nochmals holen', 'bad');
    }
    renderHand();
  }
  function mark(slots) { for (const s of slots) if (hm[s] && hm[s].state === 'gelesen') hm[s].state = 'kontrolliert'; hand.sinceChk = []; }
  function ranges(list) {
    const a = [...new Set(list)].sort((x, y) => x - y), out = [];
    for (let i = 0; i < a.length; i++) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(j > i ? two(a[i]) + '–' + two(a[j]) : two(a[i])); i = j; }
    return out.join(', ');
  }
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  function handSummary() {
    const n = hm.filter(Boolean).length, by = k => hm.filter(e => e && e.state === k).length;
    const miss = []; hm.forEach((e, i) => { if (!e) miss.push(i); });
    const s = hand.stats, med = median(s.dts);
    const parts = [n + '/100 Plätze gelesen, ' + by('kontrolliert') + ' durch Kontrolle bestätigt'];
    const at = k => ranges(hm.map((e, i) => e && e.state === k ? i : -1).filter(i => i >= 0));
    if (by('unsicher')) parts.push(by('unsicher') + ' unsicher (' + at('unsicher') + ')');
    if (by('widerspruch')) parts.push(by('widerspruch') + ' mit Widerspruch (' + at('widerspruch') + ')');
    if (miss.length && miss.length < 100) parts.push('fehlt: ' + ranges(miss));
    const facts = 'Meldungen: ' + s.got + ' gezählt, ' + s.dup + ' doppelt, ' + s.burst + ' Zustandsmeldung · Kontrollen: ' + s.chkOk + ' stimmten, ' + s.chkBad + ' nicht, ' + s.jump + ' Sprünge' +
      (med !== null ? ' · Abstand zwischen Meldungen (Median) ' + fmtMs(med) : '') + ' · Modus: ' + (hmode() === 'raste' ? 'bei jeder Raste' : 'beim Verlassen');
    return { n, unsure: by('unsicher'), conflict: by('widerspruch'), text: parts.join(', ') + '. ' + facts };
  }
  function renderHand() {
    const tb = $('memBody'), box = $('memBox'); tb.innerHTML = '';
    const row = (cells, cls) => { const tr = document.createElement('tr'); if (cls) tr.className = cls; cells.forEach(c => { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); }); tb.appendChild(tr); return tr; };
    hand.pend.forEach((p, i) => row(['?', p.r.freq, p.r.name || '(ohne Namen)', p.dt === null ? '' : fmtMs(p.dt), 'Nummer fehlt (' + (i + 1) + '/' + hand.pend.length + ')'], 'rel cur'));
    let cur = null;
    hm.forEach((e, i) => {
      const cls = !e ? 'gap' : (e.state === 'widerspruch' ? 'conflict' : e.state === 'unsicher' ? 'unsure' : e.state === 'kontrolliert' ? 'chk' : '') + (i === hand.cursor ? ' cur' : '');
      const hint = e ? STATE[e.state] + (e.seen > 1 ? ' · ' + e.seen + '× gleich' : '') + (e.prev ? ' · vorher ' + e.prev : '') : '';
      const tr = row([two(i), e ? e.freq : '–', e ? (e.name || '(ohne Namen)') : '', e && e.dt !== null ? fmtMs(e.dt) : '', hint], cls.trim());
      if (i === hand.cursor) cur = tr;
    });
    const focus = hand.pend.length ? tb.firstChild : cur;
    if (focus) box.scrollTop = Math.max(0, focus.offsetTop - box.clientHeight / 2);
    const sum = handSummary();
    $('btnUndo').disabled = !hand.on || !hand.hist.length;
    $('btnHandClear').disabled = hand.on;
    $('selNr').disabled = $('btnSel').disabled = !hand.on;
    $('btnCsv').disabled = $('btnJson').disabled = !sum.n;
    let msg, cls = '';
    if (!hand.on) { msg = sum.n ? sum.text : '–'; cls = sum.n === 100 && !sum.unsure && !sum.conflict && hand.stats.chkOk ? 'ok' : (sum.conflict ? 'bad' : ''); }
    else if (hand.cursor === null) {
      msg = hand.pend.length ? 'Nummer eintragen: Welche SEL-Nummer gehört zur letzten Meldung ' + fq(hand.pend[hand.pend.length - 1].r) + '?'
        : hmode() === 'raste' ? 'Am Gerät MEM drücken, dann die Nummer aus SEL[..] eintragen.' : 'Am Gerät MEM drücken, SEL[00] wählen, ' + (st.memExit ? 'nochmals MEM drücken.' : 'Meldung abwarten.');
      cls = 'warn';
      setStatus('handProg', hand.pend.length ? 'Nummer fehlt' : 'warte auf die erste Meldung', 'warn');
    } else {
      const nx = two((hand.cursor + 1) % 100), e = hm[hand.cursor];
      msg = 'Zuletzt Platz ' + two(hand.cursor) + ' ' + fq(e) + ' · ' + (hmode() === 'raste' ? 'weiterdrehen' : 'nächster Platz: MEM, SEL[' + nx + '] wählen, ' + (st.memExit ? 'MEM' : 'Meldung abwarten')) + '\n' + sum.text;
      setStatus('handProg', 'nächster Platz ' + nx + ' · ' + sum.n + '/100', 'ok');
    }
    setAuto('a3', msg, cls);
    st.s3 = sum.n ? { ok: sum.n === 100 && !sum.unsure && !sum.conflict && hand.stats.chkOk > 0, bad: !!(sum.conflict || sum.unsure), done: !hand.on, text: sum.text } : null;
  }
  $('btnSel').onclick = applySel;
  $('selNr').addEventListener('keydown', e => { if (e.key === 'Enter') applySel(); });
  $('btnUndo').onclick = () => {
    const h = hand.hist.pop(); if (!h) return;
    if (h.kind === 'pend') hand.pend.pop();
    else { hm[h.slot] = h.old; hand.cursor = h.cursor; hand.sinceChk = h.sinceChk; }
    hand.stats.got--; note('Schritt 3: letzte Meldung zurückgenommen'); renderHand(); refresh();
  };
  $('btnHand').onclick = () => {
    if (busy) { note('Bitte warten, ein Vorgang läuft noch.', 'bad'); return; }
    if (!port) { note('Zuerst den Adapter verbinden (Schritt 0).', 'bad'); return; }
    if (!$('optSend').checked) { note('Für das Auslesen «Senden freigeben» setzen.', 'bad'); return; }
    if (!linkActive()) note('Warnung: Verbindung «r» nicht bestätigt – das Gerät meldet möglicherweise nichts.', 'bad');
    if (trial) endTrial();
    hand.on = true; hand.cursor = null; hand.pend = []; hand.hist = []; hand.sinceChk = []; hand.covered = new Set();
    hand.base = st.standby ? Object.assign({}, st.standby) : null; hand.lastR = null;
    rememberStandby();
    $('btnHand').disabled = true; $('btnHandStop').disabled = false;
    note('Schritt 3: Aufnahme ' + (hm.some(Boolean) ? 'fortgesetzt' : 'gestartet') + ' (Modus ' + (hmode() === 'raste' ? 'bei jeder Raste' : 'beim Verlassen') + ', Standby beim Start ' + fq(hand.base) + ')');
    renderHand(); refresh(); setTimeout(() => $('selNr').focus(), 0);
  };
  $('btnHandStop').onclick = () => stopHand();
  function stopHand() {
    hand.on = false; $('btnHand').disabled = false; $('btnHandStop').disabled = true;
    if (hand.pend.length) note('Schritt 3: ' + hand.pend.length + ' Meldung(en) ohne Nummer verworfen', 'bad');
    hand.pend = [];
    $('btnHand').textContent = hm.some(Boolean) ? 'Aufnahme fortsetzen' : 'Aufnahme starten';
    renderHand();
    note('Schritt 3: Aufnahme beendet – ' + (st.s3 ? st.s3.text : 'nichts gelesen'), st.s3 && st.s3.ok ? 'note' : 'bad'); refresh();
  }
  $('btnHandClear').onclick = () => {
    if (hand.on) { note('Zuerst die Aufnahme beenden.', 'bad'); return; }
    hm = new Array(100).fill(null); hand.stats = newStats(); hand.cursor = null; hand.hist = [];
    $('btnHand').textContent = 'Aufnahme starten'; note('Schritt 3: Tabelle geleert'); renderHand(); refresh();
  };
  $('simMem').onclick = () => { if (port && port.sim) writer.memKey(); };
  $('simTurn').onclick = () => { if (port && port.sim) writer.turn(); };
  renderSteps(); renderHand();

  function stamp() { const d = new Date(); return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '_' + two(d.getHours()) + two(d.getMinutes()); }
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })); a.download = name; a.click();
    setStatus('saveStatus', 'gespeichert als ' + name + ' (Ordner Downloads)', 'ok'); note('Datei gespeichert: ' + name);
  }
  const stateOf = e => e ? e.state : 'fehlt';
  $('btnCsv').onclick = () => download('krt2_sicherung_hand_' + stamp() + '.csv', '﻿Platz;Frequenz;Name;Status\r\n' + hm.map((e, i) => two(i) + ';' + (e ? e.freq : '') + ';' + (e ? e.name : '') + ';' + stateOf(e)).join('\r\n'), 'text/csv');
  $('btnJson').onclick = () => download('krt2_sicherung_hand_' + stamp() + '.json', JSON.stringify({
    typ: 'krt2-sicherung', version: 1, methode: 'von Hand (MEM und Drehknopf, Meldung «R»)', erstellt: new Date().toISOString(), werkzeug: VERSION,
    pruefung: st.s3 ? st.s3.text : '', versuche: st.trialText,
    plaetze: hm.map((e, i) => ({ platz: i, frequenz: e ? e.freq : null, name: e ? e.name : '', status: stateOf(e) }))
  }, null, 2), 'application/json');

  // ---------- Schritte 4–6 ----------
  async function writeSlot(slot, freq, name, statusEl, key) {
    if (!guard(statusEl)) return;
    busy = true; setStatus(statusEl, 'sende …');
    const r = await command(C.buildZ(freq, name, slot), 'Z: Platz ' + two(slot) + ' ← ' + C.encodeFreq(freq).display + ' «' + C.normalizeName(name).trimmed + '»', 2);
    busy = false;
    const txt = r.kind === 'ACK' ? 'ACK nach ' + fmtMs(r.ms) + ' – jetzt am Gerät Platz ' + two(slot) + ' ansehen' : r.kind === 'NAK' ? 'NAK – Gerät lehnt ab; Fehlerzeile am Gerät notieren' : r.kind;
    setStatus(statusEl, txt, r.kind === 'ACK' ? 'ok' : 'warn');
    if (key) st[key] = r.kind;
    note('Platz ' + two(slot) + ': ' + txt, r.kind === 'ACK' ? 'note' : 'bad'); refresh();
    return r.kind;
  }
  $('btnZ98').onclick = () => writeSlot(98, '121.500', 'TEST', 'z98', 's4');
  $('btnZ97').onclick = () => writeSlot(97, '121.500', 'TEST 12', 'z97', 's5');
  async function rTest(freq, name, el, key) {
    if (!guard(el)) return;
    busy = true; rememberStandby();
    const k = await setStandby(freq, name, 'Schritt 6');
    busy = false; st.s6[key] = k;
    setStatus(el, k === 'ACK' ? 'ACK – Anzeige prüfen' : k, k === 'ACK' ? 'ok' : 'warn'); refresh();
  }
  $('btnR833').onclick = () => rTest('132.505', 'T6 833', 'r833', 'r833');
  $('btnR25').onclick = () => rTest('123.450', 'T6 25', 'r25', 'r25');

  // ---------- Schritt 7: zurückstellen ----------
  $('btnFill').onclick = () => {
    const a = hm[97], b = hm[98];
    if (!a || !b) { setStatus('back', 'Keine Sicherung für 97/98 – Werte von Hand eintragen', 'warn'); return; }
    $('r97f').value = a.freq; $('r97n').value = a.name; $('r98f').value = b.freq; $('r98n').value = b.name;
    setStatus('back', 'aus der Sicherung übernommen', 'ok');
  };
  $('btnBack').onclick = async () => {
    const vals = [[97, $('r97f').value, $('r97n').value], [98, $('r98f').value, $('r98n').value]];
    for (const [, f] of vals) if (!C.encodeFreq(f).ok) { setStatus('back', 'Frequenz «' + f + '»: ' + C.encodeFreq(f).error, 'warn'); return; }
    const k1 = await writeSlot(97, vals[0][1], vals[0][2], 'back');
    const k2 = k1 === 'ACK' ? await writeSlot(98, vals[1][1], vals[1][2], 'back') : k1;
    st.s7 = k1 === 'ACK' && k2 === 'ACK' ? 'ACK' : (k2 || k1);
    setStatus('back', st.s7 === 'ACK' ? 'beide quittiert – jetzt noch Standby zurücksetzen und am Gerät prüfen' : 'Fehler: ' + st.s7, st.s7 === 'ACK' ? 'ok' : 'warn');
    refresh();
  };

  // ---------- Notiz, Export ----------
  function addNote() { const v = $('note').value.trim(); if (!v) return; note('NOTIZ: ' + v); $('note').value = ''; }
  $('btnNote').onclick = addNote;
  $('note').addEventListener('keydown', e => { if (e.key === 'Enter') addNote(); });
  $('btnClear').onclick = () => { events = []; lastT = null; $('log').innerHTML = ''; note('Protokoll geleert'); };
  function exportText() {
    refresh();
    const lines = ['krt2.wicki.aero – Machbarkeitstest ' + VERSION + (SIM ? ' (SIMULATION)' : ''), 'Datei erstellt: ' + new Date().toString(), 'Browser: ' + navigator.userAgent,
      'Vorbereitung: ' + [...document.querySelectorAll('[data-prep]')].map(c => c.checked ? 'x' : '-').join(''), '',
      '== Zusammenfassung ==', $('summary').textContent, '', '== Sicherung von Hand (Schritt 3) ==', 'Versuche: ' + (st.trialText || '–'), 'Platz;Frequenz;Name;Abstand ms;Status;Hinweis'];
    hm.forEach((e, i) => { if (e) lines.push([two(i), e.freq, e.name, e.dt === null ? '' : Math.round(e.dt), e.state, (e.seen > 1 ? e.seen + 'x gleich ' : '') + (e.prev ? 'vorher ' + e.prev : '')].join(';')); });
    lines.push('', '== Protokoll ==', 'Zeit\tDelta\tRichtung\tBytes\tBedeutung');
    let lt = null;
    for (const e of events) { lines.push([clock(e.t), lt === null ? '' : '+' + Math.round(e.t - lt), e.dir || '←', e.bytes ? K.hex(e.bytes) : '', e.text].join('\t')); lt = e.t; }
    return lines.join('\r\n');
  }
  $('btnSave').onclick = () => download('krt2_test_' + stamp() + '.txt', exportText(), 'text/plain');
  $('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText(exportText()); setStatus('saveStatus', 'kopiert', 'ok'); } catch (e) { setStatus('saveStatus', 'Kopieren nicht möglich: ' + e.message, 'warn'); } };

  window.KRT2TEST = { feed: arr => handleBytes(Uint8Array.from(arr)), state: st };
  refresh();
  note('Seite geladen, ' + VERSION + (SIM ? ' (Simulation)' : ('serial' in navigator) ? '' : ' – Web Serial fehlt in diesem Browser'));
})();
