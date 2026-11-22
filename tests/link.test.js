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

  // 0. Zustand fürs Gerät: aktive und Standby-Frequenz aus der Meldung nach dem Verbindungsaufbau, Lautstärke und
  //    Squelch aus «A», sobald das Gerät sie meldet; «A» mit falscher Prüfsumme ändert nichts (0.8.5)
  for (let i = 0; i < 20 && !L.st.standby; i++) await sleep(20);
  ok(L.st.active && L.st.active.freq === '122.255' && L.st.active.name === 'BALLOON', 'aktive Frequenz bekannt');
  ok(L.st.standby && L.st.standby.freq === '136.975', 'Standby bekannt');
  ok(L.st.vol === null && L.st.sq === null, 'Lautstärke und Squelch unbekannt, bis «A» kommt');
  L._bytes(Uint8Array.from([0x02, 0x41, 12, 5, 3, 8]));
  ok(L.st.vol === 12 && L.st.sq === 5, '«A» setzt Lautstärke 12 und Squelch 5');
  L._bytes(Uint8Array.from([0x02, 0x41, 15, 7, 3, 99]));
  ok(L.st.vol === 12 && L.st.sq === 5, '«A» mit falscher Prüfsumme ändert nichts');

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

  // 1b. Nach dem letzten «Ende» (Y) immer 300 ms Abstand, auch wenn die Aussendung schon vorbei ist (Projekt 024, A6)
  const yT = () => { const l = L.log.filter(x => x.dir === '←' && /^02 59/.test(x.hex)).pop(); return l ? l.t : null; };
  const zT = nr => { const l = L.log.filter(x => x.dir === '→' && new RegExp('^Z: Platz ' + nr + '\\b').test(x.text)).pop(); return l ? l.t : null; };
  const y0 = yT();
  L.simRadio.tx(200);
  for (let i = 0; i < 40 && yT() === y0; i++) await sleep(10);      // Y ist da, das Gerät sendet nicht mehr
  ok(!L.st.tx && yT() !== y0, 'kurze Aussendung (200 ms) beendet');
  const r2 = await L.writeSlot({ nr: 97, ch: '122.255', name: 'NACH Y' });
  const gap = zT(97) - yT();
  ok(r2.kind === 'ACK' && gap >= 300, 'Befehl frühestens 300 ms nach Y: ' + Math.round(gap) + ' ms');
  // Beginnt in der Wartezeit eine neue Aussendung, zählt deren Ende
  const y1 = yT();
  L.simRadio.tx(200);
  for (let i = 0; i < 40 && yT() === y1; i++) await sleep(10);
  const w3 = L.writeSlot({ nr: 96, ch: '122.255', name: 'NEU TX' });
  await sleep(100); L.simRadio.tx(250);                                // neue Aussendung 100 ms nach dem ersten Y
  const r3 = await w3;
  const gap3 = zT(96) - yT();
  ok(r3.kind === 'ACK' && yT() !== y1 && gap3 >= 300, 'neue Aussendung in der Wartezeit: 300 ms nach deren Y (' + Math.round(gap3) + ' ms)');

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
