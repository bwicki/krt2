// Prüft src/link.js mit dem simulierten Funkgerät: Pause während «Senden», Verbindungsverlust mit Wiederaufnahme
// und Fortsetzen beim selben Platz (Gerätetests 14.11.2026). Laufzeit rund 25 s.
'use strict';
const assert = require('assert');
globalThis.KRT2 = require('../src/krt2decoder.js');
globalThis.KRT2CODEC = require('../src/krt2codec.js');
require('../src/link.js');
const { Link } = globalThis.KRT2LINK;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

(async () => {
  const L = new Link();
  await L.connect({ sim: true });
  ok(L.connected && L.state === 'connected', 'Simulation verbunden');
  ok(await L.waitLinked(8000), 'nach der ersten Abfrage aktiv');

  // 1. Während einer Aussendung wird nicht geschrieben: der Befehl geht erst nach «Ende» (Y) hinaus
  L.simRadio.tx(1500); await sleep(100);
  ok(L.st.tx, 'Gerät meldet Senden');
  const t0 = Date.now();
  const r1 = await L.writeSlot({ nr: 98, ch: '121.500', name: 'Test ab' });
  ok(r1.kind === 'ACK', 'nach der Aussendung quittiert');
  ok(Date.now() - t0 >= 1300, 'erst nach dem Ende geschrieben (' + (Date.now() - t0) + ' ms)');
  ok(L.simRadio.mem[98][1] === 'Test ab', 'Kleinbuchstaben unverändert gespeichert');
  const iWait = L.log.findIndex(l => /Schreiben wartet/.test(l.text));
  const iZ = L.log.findIndex(l => /^Z: Platz 98/.test(l.text));
  ok(iWait >= 0 && iZ > iWait, 'Protokoll: erst warten, dann schreiben');

  // 2. Verbindung bricht beim Programmieren ab → Pause, Wiederaufnahme, weiter beim selben Platz
  const list = Array.from({ length: 12 }, (_, i) => ({ nr: 10 + i, ch: '118.' + String(100 + i * 25).padStart(3, '0'), name: 'P' + (10 + i) }));
  const pauses = [];
  setTimeout(() => L.simRadio.drop(4000), 250);
  const res = await L.program(list, { onPause: w => pauses.push(w) });
  ok(res.length === 12 && res.every(r => r.kind === 'ACK'), 'alle 12 Plätze quittiert: ' + res.map(r => r.kind).join(','));
  ok(pauses.includes('link') && pauses[pauses.length - 1] === null, 'Pause gemeldet und beendet');
  ok(L.log.some(l => /Verbindung verloren/.test(l.text)) && L.log.some(l => /wieder aufgenommen/.test(l.text)), 'Verlust und Wiederaufnahme im Protokoll');
  const resume = L.log.find(l => /geht bei Platz \d+ weiter/.test(l.text));
  ok(!!resume, 'Fortsetzen beim selben Platz: ' + (resume && resume.text));
  ok(list.every(p => L.simRadio.mem[p.nr][1] === p.name), 'Gerätespeicher stimmt');

  // 3. Von Hand trennen: keine Wiederaufnahme
  await L.disconnect();
  ok(L.state === 'off' && !L.recovering, 'getrennt ohne Wiederaufnahme');
  clearInterval(L.tick);
  console.log('link: ' + n + ' Prüfungen bestanden');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
