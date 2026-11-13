// krt2.wicki.aero – geführter Machbarkeitstest (Schritte 0–8).
// Baut auf der Seite «KRT2 mitlesen» aus Projekt 024 auf. Befehle (W, Z, R) gehen nur hinaus, wenn
// «Senden freigeben» und «Befehle freigeben» gesetzt sind. Nie gesendet: U (aktive Frequenz),
// Lautstärke, Squelch, Kanalraster, Sendetasten.
(function () {
  'use strict';
  const VERSION = 'test 0.2.0';
  const $ = id => document.getElementById(id);
  const K = window.KRT2, C = window.KRT2CODEC;
  const SIM = new URLSearchParams(location.search).has('sim');
  $('ver').textContent = VERSION + (SIM ? ' · SIMULATION' : '');
  if (SIM) { $('simnote').hidden = false; $('btnSim99').hidden = false; }
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
  let mem = [];

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
      3: badge(3, st.s3 && st.s3.ok, st.s3 && st.s3.done && !st.s3.ok),
      4: badge(4, st.s4 === 'ACK', st.s4 && st.s4 !== 'ACK'),
      5: badge(5, st.s5 === 'ACK', st.s5 && st.s5 !== 'ACK'),
      6: badge(6, st.s6.r833 === 'ACK' && st.s6.r25 === 'ACK', (st.s6.r833 && st.s6.r833 !== 'ACK') || (st.s6.r25 && st.s6.r25 !== 'ACK')),
      7: badge(7, st.s7 === 'ACK', st.s7 && st.s7 !== 'ACK')
    };
    $('summary').textContent = summaryText(r);
  }
  const LABEL = { 1: 'Verbindung «r»', 2: 'Blättern mit W', 3: 'Speicher auslesen', 4: 'Platz 98 schreiben', 5: 'Ziffern im Namen', 6: 'Kanalraster', 7: 'Zurückstellen' };
  const WORD = { ok: 'bestanden', bad: 'NICHT bestanden', open: 'offen' };
  function summaryText(r) {
    const lines = [];
    for (let n = 1; n <= 7; n++) {
      const m = manual(n), nt = noteOf(n);
      lines.push('Schritt ' + n + ' ' + LABEL[n] + ': ' + WORD[r[n]] + (m ? ' (Gerät: ' + m + ')' : '') + (nt ? ' – ' + nt : ''));
    }
    if (st.s2) lines.push('', 'W einmal: ' + st.s2.text);
    if (st.s3) lines.push('Auslesen: ' + st.s3.text);
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
  function guard() {
    if (busy) { note('Bitte warten, ein Vorgang läuft noch.', 'bad'); return false; }
    if (!port) { note('Zuerst den Adapter verbinden (Schritt 0).', 'bad'); return false; }
    if (!$('optSend').checked || !$('optCmd').checked) { note('Für diesen Schritt «Senden freigeben» und «Befehle freigeben» setzen.', 'bad'); return false; }
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
      if (e.ok && e.freq && e.name === 'U') { st.active = { freq: e.freq.display, name: e.station.trim() }; st.statusSeen = true; }
      if (e.ok && e.freq && e.name === 'R') { st.standby = { freq: e.freq.display, name: e.station.trim() }; if (stbyWait) stbyWait.resolve(e); }
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

  // ---------- Simulation (?sim=1) ----------
  // Nachgebildetes Funkgerät: fragt alle 3 s mit «S», meldet nach der Antwort seinen Zustand, blättert mit W
  // (Annahme: meldet danach die Standby-Frequenz mit «R», wie beim Abruf am Gerät beobachtet), quittiert Z und R.
  function makeSim() {
    const names = ['', 'ZRH INFO', 'GVA INFO', 'BIR AFIS', 'SPE AFIS', 'WIN AFIS', 'ZRH APP', 'ZRH TWR', 'BASL T', 'BRN APP', 'BERL N', 'ZRH ATIS', 'BERL SCF', 'BERL TGL', 'CENTRE', 'MIN-8'];
    const freqs = ['121.500', '124.700', '126.350', '123.550', '120.350', '134.975', '125.325', '118.100', '118.300', '127.325', '125.800', '125.725', '135.900', '136.025', '127.000', '118.005'];
    const mem = Array.from({ length: 100 }, (_, i) => i < 16 ? [freqs[i], names[i]] : (i === 99 ? ['121.500', 'EMERGENC'] : ['118.000', 'FREE']));
    let idx = 99, sb = ['121.500', 'EMERGENC'], buf = [], linked = false;
    const reply = (bytes, delay = 15) => setTimeout(() => handleBytes(Uint8Array.from(bytes)), delay);
    const timer = setInterval(() => reply([0x53], 0), 3000);
    return {
      close() { clearInterval(timer); },
      recall(n) { idx = n; sb = mem[n]; reply(C.buildR(sb[0], sb[1]), 10); },
      write(u8) {
        for (const b of u8) {
          if (!buf.length) {
            if (b === 0x78) { if (!linked) { linked = true; reply(C.buildU('122.255', 'BALLOON'), 20); reply(C.buildR(sb[0], sb[1]), 40); } continue; }
            if (b === 0x53 || b === K.ACK || b !== K.STX) continue;
          }
          buf.push(b);
          const code = buf[1], want = code === 0x5A ? 14 : (code === 0x52 || code === 0x55) ? 13 : 2;
          if (buf.length < want) continue;
          const fr = buf; buf = [];
          if (code === 0x5A) { const d = K.decodeFreq(fr[2], fr[3]); mem[fr[12]] = [d.display, String.fromCharCode(...fr.slice(4, 12)).trim()]; reply([K.ACK], 60); }
          else if (code === 0x52) { const d = K.decodeFreq(fr[2], fr[3]); sb = [d.display, String.fromCharCode(...fr.slice(4, 12)).trim()]; reply([K.ACK]); }
          else if (code === 0x57 || code === 0x77) { idx = (idx + (code === 0x57 ? 1 : 99)) % 100; sb = mem[idx]; reply([K.ACK]); reply(C.buildR(sb[0], sb[1]), 40); }
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
    if (!guard()) return;
    busy = true; await setStandby(st.saved.freq, st.saved.name, 'Standby zurücksetzen'); busy = false;
  });

  // ---------- Schritt 2: W einmal ----------
  $('btnW1').onclick = async () => {
    if (!guard()) return;
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

  // ---------- Schritt 3: alles auslesen ----------
  function renderMem() {
    const tb = $('memBody'); tb.innerHTML = '';
    for (const m of mem) {
      const tr = document.createElement('tr');
      if (!m.ok) tr.className = 'gap';
      [two(m.slot), m.freq || '–', m.name || (m.ok ? '(ohne Namen)' : '–'), m.reply].forEach(c => { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); });
      tb.appendChild(tr);
    }
  }
  function period(sigs) {
    for (let p = 1; p <= sigs.length / 2; p++) {
      let rep = true;
      for (let k = 0; k + p < sigs.length; k++) if (sigs[k] !== sigs[k + p]) { rep = false; break; }
      if (rep) return p;
    }
    return 0;
  }
  $('btnStop').onclick = () => { abortRead = true; };
  $('btnSim99').onclick = () => { if (port && port.sim) { writer.recall(99); note('Simulation: Platz 99 am Gerät in den Standby geholt'); } };
  $('btnRead').onclick = async () => {
    if (!guard()) return;
    const start = Math.min(99, Math.max(0, Number($('startSlot').value) || 0));
    const ref = st.standby ? Object.assign({}, st.standby) : null;
    busy = true; abortRead = false; rememberStandby(); mem = []; renderMem();
    $('btnRead').disabled = true; $('btnStop').disabled = false; $('btnCsv').disabled = true; $('btnJson').disabled = true;
    note('Schritt 3: Auslesen gestartet, erster Platz ' + two(start));
    let misses = 0;
    for (let i = 0; i < 100 && !abortRead; i++) {
      const w = waitStandby(1500);
      const r = await command(C.buildW(), 'W ' + (i + 1) + '/100', 1);
      const s = await w;
      const slot = (start + i) % 100;
      mem.push(s ? { slot, freq: s.fr.freq.display, name: s.fr.station.trim(), ok: true, reply: r.kind + ' · ' + fmtMs(s.ms) } : { slot, ok: false, reply: r.kind + ' · keine Meldung' });
      renderMem(); setStatus('readProg', (i + 1) + '/100');
      misses = s ? 0 : misses + 1;
      if (misses >= 3) { note('Drei W ohne Standby-Meldung – Auslesen abgebrochen.', 'bad'); break; }
      await sleep(150);
    }
    busy = false; $('btnRead').disabled = false; $('btnStop').disabled = true;
    const got = mem.filter(m => m.ok).length;
    const sigs = mem.filter(m => m.ok).map(m => m.freq + '|' + m.name);
    const p = got === 100 ? period(sigs) : 0;
    const last = mem[mem.length - 1];
    const endsAtStart = ref && last && last.ok && last.freq === ref.freq && last.name === ref.name;
    const lines = [got + ' von ' + mem.length + ' W mit Standby-Meldung.'];
    let ok = got === 100 && !abortRead;
    if (p && p < 100) { lines.push('Die Folge wiederholt sich nach ' + p + ' Schritten: Das Gerät überspringt vermutlich leere Plätze. Die Nummerierung ab Platz ' + two(start) + ' ist dann nicht verlässlich.'); ok = false; }
    if (got === 100) lines.push(endsAtStart ? 'Kontrolle: Der 100. Schritt trifft wieder die Standby-Frequenz vom Start (' + fq(ref) + ') – Nummerierung stimmig.' : 'Kontrolle: Der 100. Schritt trifft nicht die Standby-Frequenz vom Start (' + fq(ref) + '). Wurde unmittelbar vor dem Start Platz 99 am Gerät geholt? Sonst stimmt die Nummerierung nicht.');
    if (got === 100 && !endsAtStart) ok = false;
    if (abortRead) lines.push('Von Hand angehalten.');
    st.s3 = { ok, done: true, text: lines.join(' ') };
    setAuto('a3', lines.join('\n'), ok ? 'ok' : (got ? '' : 'bad'));
    $('btnCsv').disabled = !got; $('btnJson').disabled = !got;
    note('Schritt 3: ' + lines.join(' '), ok ? 'note' : 'bad'); refresh();
  };
  function stamp() { const d = new Date(); return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '_' + two(d.getHours()) + two(d.getMinutes()); }
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })); a.download = name; a.click();
    setStatus('saveStatus', 'gespeichert als ' + name + ' (Ordner Downloads)', 'ok'); note('Datei gespeichert: ' + name);
  }
  $('btnCsv').onclick = () => download('krt2_sicherung_' + stamp() + '.csv', '﻿Platz;Frequenz;Name\r\n' + mem.map(m => two(m.slot) + ';' + (m.freq || '') + ';' + (m.name || '')).join('\r\n'), 'text/csv');
  $('btnJson').onclick = () => download('krt2_sicherung_' + stamp() + '.json', JSON.stringify({
    typ: 'krt2-sicherung', version: 1, erstellt: new Date().toISOString(), werkzeug: VERSION, ersterPlatz: mem.length ? mem[0].slot : null,
    pruefung: st.s3 ? st.s3.text : '', plaetze: mem.map(m => ({ platz: m.slot, frequenz: m.freq || null, name: m.name || '', gemeldet: m.ok }))
  }, null, 2), 'application/json');

  // ---------- Schritte 4–6 ----------
  async function writeSlot(slot, freq, name, statusEl, key) {
    if (!guard()) return;
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
    if (!guard()) return;
    busy = true; rememberStandby();
    const k = await setStandby(freq, name, 'Schritt 6');
    busy = false; st.s6[key] = k;
    setStatus(el, k === 'ACK' ? 'ACK – Anzeige prüfen' : k, k === 'ACK' ? 'ok' : 'warn'); refresh();
  }
  $('btnR833').onclick = () => rTest('132.505', 'T6 833', 'r833', 'r833');
  $('btnR25').onclick = () => rTest('123.450', 'T6 25', 'r25', 'r25');

  // ---------- Schritt 7: zurückstellen ----------
  $('btnFill').onclick = () => {
    const f = s => mem.find(m => m.slot === s && m.ok);
    const a = f(97), b = f(98);
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
      '== Zusammenfassung ==', $('summary').textContent, '', '== Sicherung (Schritt 3) ==', 'Platz;Frequenz;Name;Antwort'];
    for (const m of mem) lines.push([two(m.slot), m.freq || '', m.name || '', m.reply].join(';'));
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
