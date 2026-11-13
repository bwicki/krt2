// krt2.wicki.aero – Machbarkeitstest (T1–T6). Baut auf der Seite «KRT2 mitlesen» aus Projekt 024 auf.
// Sendet Befehle (Z, R, W) nur, wenn beide Freigaben gesetzt sind. Nie gesendet: U (aktive Frequenz),
// Lautstärke, Squelch, Kanalraster, Sendetasten.
(function () {
  'use strict';
  const VERSION = 'test 0.1.1';
  const $ = id => document.getElementById(id);
  const K = window.KRT2, C = window.KRT2CODEC;
  $('ver').textContent = VERSION;
  if (!('serial' in navigator)) { $('unsupported').hidden = false; $('btnConnect').disabled = true; }

  const dec = new K.KRT2Decoder();
  const t0 = performance.now(), wall0 = Date.now();
  const now = () => performance.now() - t0;
  const clock = t => { const d = new Date(wall0 + t); return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0'); };
  const fmtMs = ms => (ms < 10000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s');

  let port = null, reader = null, writer = null, reading = false, readPromise = null;
  let events = [], lastT = null, pings = [], answered = 0, linkAnswered = false;
  let standby = null, saved = null;          // { freq, name }
  let pending = null;                        // wartet auf ACK/NAK
  let browseWait = null;                     // wartet nach W auf eine Standby-Meldung R
  let browseNo = 0;
  const results = [];                        // Zusammenfassung für den Export

  // ---------- Protokollanzeige ----------
  function addRow(ev, cls) {
    const tb = $('log'), tr = document.createElement('tr');
    if (cls) tr.className = cls;
    const dt = lastT === null ? '' : '+' + Math.round(ev.t - lastT); lastT = ev.t;
    const cells = [clock(ev.t), dt, ev.dir || '←', ev.bytes ? K.hex(ev.bytes) : '', ev.text];
    cells.forEach((c, i) => { const td = document.createElement('td'); td.textContent = c; if (i === 3) td.className = 'hex'; tr.appendChild(td); });
    tb.appendChild(tr);
    while (tb.rows.length > 4000) tb.deleteRow(0);
    $('logbox').scrollTop = $('logbox').scrollHeight;
  }
  function record(ev, cls) { events.push(Object.assign({ cls }, ev)); addRow(ev, cls); }
  const note = (text, cls = 'note') => record({ t: now(), dir: '·', bytes: [], text }, cls);
  function setStatus(el, txt, cls) { const s = $(el); s.textContent = txt; s.className = 'status ' + (cls || ''); }

  function updateStand() {
    let s = String(pings.length);
    if (pings.length > 1) { const iv = []; for (let i = 1; i < pings.length; i++) iv.push(pings[i] - pings[i - 1]); s += ' · Abstand zuletzt ' + fmtMs(iv[iv.length - 1]); }
    $('pingStats').textContent = s;
    $('linkState').textContent = linkAnswered ? 'Abfrage beantwortet (' + answered + '×) – «r» am Funkgerät prüfen' : (pings.length ? 'Abfrage gesehen, nicht beantwortet' : 'noch keine Abfrage «S» gesehen');
    $('fStandby').textContent = standby ? standby.freq : '–'; $('fStandbyName').textContent = standby ? standby.name : '';
    $('savedStandby').textContent = 'Gemerkter Standby: ' + (saved ? saved.freq + ' «' + saved.name + '»' : '– (wird beim ersten Befehl R/W aus dem aktuellen Standby übernommen)');
  }
  setInterval(() => { for (const e of dec.tick(now())) record(e, 'bad'); }, 50);

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
      const timer = setTimeout(() => { pending = null; resolve({ kind: 'timeout', ms: now() - tStart }); }, ms);
      pending = { tStart, resolve: kind => { clearTimeout(timer); pending = null; resolve({ kind, ms: now() - tStart }); } };
    });
  }
  function waitStandby(ms) {
    return new Promise(resolve => {
      const tStart = now();
      const timer = setTimeout(() => { browseWait = null; resolve(null); }, ms);
      browseWait = { tStart, resolve: fr => { clearTimeout(timer); browseWait = null; resolve({ fr, ms: now() - tStart }); } };
    });
  }
  // Befehl senden und auf ACK/NAK warten (bis zu zwei Wiederholungen bei Zeitüberschreitung).
  async function command(bytes, why, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      const p = waitReply(800);
      const ok = await sendRaw(bytes, why + (i ? ' (Wiederholung ' + i + ')' : ''), true);
      if (!ok) { if (pending) pending.resolve('nicht gesendet'); return { kind: 'nicht gesendet', ms: 0 }; }
      const r = await p;
      if (r.kind !== 'timeout') return r;
    }
    return { kind: 'timeout', ms: 800 };
  }
  function rememberStandby() { if (!saved && standby) { saved = Object.assign({}, standby); note('Standby gemerkt: ' + saved.freq + ' «' + saved.name + '»'); updateStand(); } }

  // ---------- Empfang ----------
  function handleEvent(e) {
    if (e.kind === 'ping') {
      pings.push(e.t); record(e, 'ping');
      if ($('optAnswer').checked && $('optSend').checked) {
        sendRaw([0x78], 'Antwort «x» auf die Abfrage', false).then(ok => { if (ok) { answered++; linkAnswered = true; updateStand(); } });
      }
      updateStand(); return;
    }
    if (e.kind === 'ack' || e.kind === 'nak') { record(e, e.kind === 'nak' ? 'bad' : ''); if (pending) pending.resolve(e.kind === 'ack' ? 'ACK' : 'NAK'); return; }
    if (e.kind === 'frame') {
      record(e, e.ok ? '' : 'bad');
      if (e.ok && e.freq && e.name === 'U') { $('fActive').textContent = e.freq.display; $('fActiveName').textContent = e.station.trim(); }
      if (e.ok && e.freq && e.name === 'R') { standby = { freq: e.freq.display, name: e.station.trim() }; if (browseWait) browseWait.resolve(e); }
      if (e.name === 'C') { const a = $('fActive').textContent, an = $('fActiveName').textContent; $('fActive').textContent = standby ? standby.freq : '–'; $('fActiveName').textContent = standby ? standby.name : ''; standby = a !== '–' ? { freq: a, name: an } : standby; }
      if (e.name === 'K') { $('txrx').textContent = 'SENDET (K) ' + clock(e.t); if (pending || browseWait) note('ACHTUNG: Funkgerät sendet während eines Tests', 'bad'); }
      if (e.name === 'J') $('txrx').textContent = 'Empfang (J) ' + clock(e.t);
      if (e.name === 'Y' || e.name === 'V') $('txrx').textContent = 'Ruhe (' + e.name + ') ' + clock(e.t);
      if (/^[a-h]$/.test(e.name)) $('lastErr').textContent = e.text + ' ' + clock(e.t);
      if (e.name === 'F') $('lastErr').textContent = 'gelöscht ' + clock(e.t);
      if ('URZCA1234'.includes(e.name) && e.ok && $('optAck').checked && $('optSend').checked) sendRaw([K.ACK], 'ACK auf Meldung ' + e.name, false);
      updateStand(); return;
    }
    record(e, e.kind === 'incomplete' ? 'bad' : '');
  }
  function handleBytes(u8) { const t = now(); for (const e of dec.feed(u8, t)) handleEvent(e); }
  // Prüfhaken ohne Adapter (Konsole): KRT2TEST.feed([0x53]) speist Bytes ein, als kämen sie vom Funkgerät.
  window.KRT2TEST = { feed: arr => handleBytes(Uint8Array.from(arr)) };

  async function readLoop() {
    reading = true;
    while (port && port.readable && reading) {
      reader = port.readable.getReader();
      try { for (;;) { const { value, done } = await reader.read(); if (done) break; if (value && value.length) handleBytes(value); } }
      catch (e) { note('Lesefehler: ' + e.message, 'bad'); }
      finally { reader.releaseLock(); reader = null; }
    }
  }

  // ---------- Simulation (?sim=1): ein nachgebildetes Funkgerät, verhält sich so, wie es Rev. 003 beschreibt ----------
  // Nimmt an, dass das Gerät nach «W» die neue Standby-Frequenz mit «R» meldet – genau das prüft Test T4 am echten Gerät.
  const SIM = new URLSearchParams(location.search).has('sim');
  function makeSim() {
    const mem = Array.from({ length: 100 }, (_, i) => i < 6 ? [['122.255', 'BALLOON'], ['124.700', 'ZRH INFO'], ['118.100', 'LSZH TWR'], ['125.725', 'LSZHATIS'], ['123.550', 'BIRRFELD'], ['132.505', 'TEST']][i] : (i === 99 ? ['121.500', 'EMERGENC'] : null));
    let sb = ['127.000', 'SIM SB'], idx = -1, buf = [];
    const reply = (bytes, delay = 15) => setTimeout(() => handleBytes(Uint8Array.from(bytes)), delay);
    const frameR = ([f, n]) => C.buildR(f, n);
    const timer = setInterval(() => reply([0x53], 0), 4000);
    return {
      close() { clearInterval(timer); },
      write(u8) {
        for (const b of u8) {
          if (!buf.length) {
            if (b === 0x78) { reply(C.buildU('118.100', 'LSZH TWR'), 20); reply(frameR(sb), 40); continue; }
            if (b === 0x53) { reply([0x78]); continue; }
            if (b === K.ACK) continue;
            if (b !== K.STX) continue;
          }
          buf.push(b);
          const code = buf[1], want = code === 0x5A ? 14 : (code === 0x52 || code === 0x55) ? 13 : 2;
          if (buf.length < want) continue;
          const fr = buf; buf = [];
          if (code === 0x5A) { const d = K.decodeFreq(fr[2], fr[3]); mem[fr[12]] = [d.display, String.fromCharCode(...fr.slice(4, 12)).trim()]; reply([K.ACK], 60); }
          else if (code === 0x52) { const d = K.decodeFreq(fr[2], fr[3]); sb = [d.display, String.fromCharCode(...fr.slice(4, 12)).trim()]; idx = -1; reply([K.ACK]); }
          else if (code === 0x57 || code === 0x77) {
            const step = code === 0x57 ? 1 : -1;
            if (idx < 0) idx = 0; else { do { idx = (idx + step + 100) % 100; } while (!mem[idx]); }
            if (!mem[idx]) { do { idx = (idx + 1) % 100; } while (!mem[idx]); }
            sb = mem[idx]; reply([K.ACK]); reply(frameR(sb), 40);
          } else reply([K.NAK]);
        }
        return Promise.resolve();
      },
      releaseLock() {}
    };
  }
  if (SIM) { $('ver').textContent = VERSION + ' · SIMULATION'; $('unsupported').hidden = true; $('btnConnect').disabled = false; }

  // ---------- Bedienung ----------
  $('btnConnect').onclick = async () => {
    if (SIM) {
      writer = makeSim(); port = { sim: true };
      setStatus('connStatus', 'SIMULATION – kein echtes Funkgerät', 'warn');
      $('btnConnect').disabled = true; $('btnDisconnect').disabled = false;
      note('Simulation gestartet: nachgebildetes Funkgerät nach Protokoll Rev. 003 (Annahme: meldet nach W die Standby-Frequenz)');
      return;
    }
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
      writer = port.writable.getWriter();
      setStatus('connStatus', 'verbunden, 9600 Bd 8N1', 'ok');
      $('btnConnect').disabled = true; $('btnDisconnect').disabled = false;
      note('Anschluss geöffnet (9600 Bd, 8N1)');
      readPromise = readLoop();
    } catch (e) { setStatus('connStatus', 'Fehler: ' + e.message, 'warn'); }
  };
  async function closePort(why) {
    if (port && port.sim) { writer.close(); writer = null; port = null; $('btnConnect').disabled = false; $('btnDisconnect').disabled = true; note(why); return; }
    reading = false;
    try { if (reader) await reader.cancel(); } catch (e) { /* schon zu */ }
    try { if (readPromise) await readPromise; } catch (e) { /* egal */ }
    try { if (writer) writer.releaseLock(); } catch (e) { /* egal */ }
    writer = null;
    try { if (port) await port.close(); } catch (e) { /* egal */ }
    port = null; readPromise = null;
    $('btnConnect').disabled = false; $('btnDisconnect').disabled = true;
    note(why);
  }
  $('btnDisconnect').onclick = async () => { await closePort('Anschluss geschlossen'); setStatus('connStatus', 'getrennt'); };
  if (navigator.serial) navigator.serial.addEventListener('disconnect', async () => { if (port) { setStatus('connStatus', 'Adapter abgezogen', 'warn'); await closePort('Adapter abgezogen'); } });
  $('optSend').onchange = () => note('Senden ' + ($('optSend').checked ? 'freigegeben' : 'gesperrt'));
  $('optCmd').onchange = () => note('Befehle an das Funkgerät ' + ($('optCmd').checked ? 'freigegeben' : 'gesperrt'));
  $('btnQuery').onclick = () => sendRaw([0x53], 'eigene Verbindungsabfrage «S»', false);

  // Platz schreiben
  function checkZ() {
    const f = C.encodeFreq($('zFreq').value), n = C.normalizeName($('zName').value), slot = Number($('zSlot').value);
    const msgs = [];
    msgs.push(f.ok ? 'Frequenz ' + f.display + ' (' + f.spacing + ', MHz-Byte ' + f.mhz + ', Kanal ' + f.ch + ')' : 'Frequenz: ' + f.error);
    msgs.push('Name «' + n.name + '»' + (n.ok ? '' : ' – unzulässige Zeichen weggelassen oder zu lang') + (/\d/.test(n.name) ? ' – enthält Ziffern (Test T3)' : ''));
    if (!(Number.isInteger(slot) && slot >= 0 && slot <= 99)) msgs.push('Platz muss 0–99 sein');
    $('zCheck').textContent = msgs.join(' · ');
    return f.ok && Number.isInteger(slot) && slot >= 0 && slot <= 99;
  }
  ['zSlot', 'zFreq', 'zName'].forEach(id => $(id).addEventListener('input', checkZ)); checkZ();
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { const [s, f, n] = b.dataset.preset.split('|'); $('zSlot').value = s; $('zFreq').value = f; $('zName').value = n; checkZ(); });
  $('btnZ').onclick = async () => {
    if (!checkZ()) { setStatus('zResult', 'Eingabe prüfen', 'warn'); return; }
    const slot = Number($('zSlot').value), freq = $('zFreq').value, name = $('zName').value;
    let bytes; try { bytes = C.buildZ(freq, name, slot); } catch (e) { setStatus('zResult', e.message, 'warn'); return; }
    $('btnZ').disabled = true; setStatus('zResult', 'sende …');
    const r = await command(bytes, 'Z: Platz ' + slot + ' ← ' + C.encodeFreq(freq).display + ' «' + C.normalizeName(name).trimmed + '»');
    $('btnZ').disabled = false;
    const txt = r.kind === 'ACK' ? 'ACK nach ' + fmtMs(r.ms) + ' – jetzt am Funkgerät Platz ' + slot + ' ansehen' : r.kind === 'NAK' ? 'NAK – Funkgerät lehnt ab' : r.kind === 'timeout' ? 'keine Antwort (3 Versuche)' : r.kind;
    setStatus('zResult', txt, r.kind === 'ACK' ? 'ok' : 'warn');
    results.push('Z Platz ' + slot + ' ' + C.encodeFreq(freq).display + ' «' + C.normalizeName(name).trimmed + '»: ' + txt);
    note('Ergebnis: ' + txt, r.kind === 'ACK' ? 'note' : 'bad');
  };

  // Standby setzen / zurücksetzen
  document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { const [f, n] = b.dataset.r.split('|'); $('rFreq').value = f; $('rName').value = n; });
  async function setStandby(freq, name, why) {
    let bytes; try { bytes = C.buildR(freq, name); } catch (e) { setStatus('wResult', e.message, 'warn'); return; }
    const r = await command(bytes, why + ': Standby ← ' + C.encodeFreq(freq).display + ' «' + C.normalizeName(name).trimmed + '»');
    const txt = r.kind === 'ACK' ? 'ACK nach ' + fmtMs(r.ms) + ' – Anzeige am Funkgerät prüfen' : r.kind === 'NAK' ? 'NAK' : r.kind === 'timeout' ? 'keine Antwort' : r.kind;
    setStatus('wResult', txt, r.kind === 'ACK' ? 'ok' : 'warn');
    if (r.kind === 'ACK') { standby = { freq: C.encodeFreq(freq).display, name: C.normalizeName(name).trimmed }; updateStand(); }
    results.push(why + ' ' + C.encodeFreq(freq).display + ': ' + txt);
  }
  $('btnR').onclick = () => { rememberStandby(); setStandby($('rFreq').value, $('rName').value, 'R'); };
  $('btnRestore').onclick = () => { if (!saved) { setStatus('wResult', 'kein gemerkter Standby – von Hand eintragen und «Standby setzen»', 'warn'); return; } setStandby(saved.freq, saved.name, 'R zurück'); };

  // Blättern
  async function browse(times, prev) {
    rememberStandby();
    for (let i = 0; i < times; i++) {
      const w = waitStandby(1500);
      const r = await command(prev ? C.buildWPrev() : C.buildW(), (prev ? 'w' : 'W') + ': ' + (prev ? 'voriger' : 'nächster') + ' Speicherplatz → Standby', 0);
      const s = await w;
      browseNo++;
      const tr = document.createElement('tr');
      const reply = r.kind === 'ACK' || r.kind === 'NAK' ? r.kind + ' ' + fmtMs(r.ms) : r.kind;
      const cells = [browseNo, prev ? 'w' : 'W', reply, s ? s.fr.freq.display + ' «' + s.fr.station.trim() + '» nach ' + fmtMs(s.ms) : 'keine Standby-Meldung innert 1.5 s'];
      cells.forEach(c => { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); });
      $('browse').appendChild(tr);
      results.push('Blättern #' + browseNo + ' ' + cells.slice(1).join(' | '));
      if (r.kind === 'nicht gesendet') break;
      await new Promise(res => setTimeout(res, 300));
    }
    setStatus('wResult', 'fertig – Tabelle ansehen, danach Standby zurücksetzen');
  }
  $('btnW1').onclick = () => browse(1, false);
  $('btnW5').onclick = () => browse(5, false);
  $('btnWprev').onclick = () => browse(1, true);

  // Notiz, Export
  function addNote() { const v = $('note').value.trim(); if (!v) return; note('NOTIZ: ' + v); results.push('Notiz: ' + v); $('note').value = ''; }
  $('btnNote').onclick = addNote;
  $('note').addEventListener('keydown', e => { if (e.key === 'Enter') addNote(); });
  function exportText() {
    const lines = ['krt2.wicki.aero – Machbarkeitstest ' + VERSION, 'Datei erstellt: ' + new Date().toString(), 'Browser: ' + navigator.userAgent, '',
      '== Zusammenfassung ==', ...results, '', '== Protokoll ==', 'Zeit\tDelta\tRichtung\tBytes\tBedeutung'];
    let lt = null;
    for (const e of events) { lines.push([clock(e.t), lt === null ? '' : '+' + Math.round(e.t - lt), e.dir || '←', e.bytes ? K.hex(e.bytes) : '', e.text].join('\t')); lt = e.t; }
    return lines.join('\r\n');
  }
  $('btnSave').onclick = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const fn = 'krt2_test_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.txt';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportText()], { type: 'text/plain;charset=utf-8' })); a.download = fn; a.click();
    setStatus('saveStatus', 'gespeichert als ' + fn + ' (Ordner Downloads)', 'ok');
  };
  $('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText(exportText()); setStatus('saveStatus', 'kopiert', 'ok'); } catch (e) { setStatus('saveStatus', 'Kopieren nicht möglich: ' + e.message, 'warn'); } };
  $('btnClear').onclick = () => { events = []; lastT = null; $('log').innerHTML = ''; note('Protokoll geleert'); };
  updateStand();
  note('Seite geladen, ' + VERSION + (('serial' in navigator) ? '' : ' – Web Serial fehlt in diesem Browser'));
})();
