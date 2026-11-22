// Prüft src/link.js mit dem simulierten Funkgerät: Pause während «Senden», Verbindungsverlust mit Wiederaufnahme
// und Fortsetzen beim selben Platz (Gerätetests 14.11.2026); Lesefehler, Wiederöffnen über getPorts und Trennen während Fehlern (0.8.9). Laufzeit rund 30 s.
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
  ok(L.simRadio.turn() === false, 'Simulation: Raste ohne MEM ist kein Speicherschritt');
  for (let i = 0; i < 20 && L.st.vol === 12; i++) await sleep(20);
  ok(L.st.vol === 11 && L.st.sq === 5, 'Simulation: Raste ohne MEM meldet Lautstärke 11 mit «A»');

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

  // 4. Lesefehler beim Bluetooth-Abbruch (22.11.2026: «An unknown system error has occurred.» pausenlos, 3963 Zeilen
  //    in 5 s): nach dem ersten Fehler schliessen, einmal protokollieren, ohne neue Auswahl über getPorts wieder öffnen (0.8.9)
  const stillStream = () => new ReadableStream({ pull() { return new Promise(() => {}); } });
  const errStream = () => new ReadableStream({ pull(c) { c.error(new DOMException('An unknown system error has occurred.', 'UnknownError')); } });
  const port = {
    opened: 0, closed: 0, fail: true, readable: null, writable: null,
    async open() { this.opened++; this.readable = this.fail ? errStream() : stillStream(); this.writable = new WritableStream({ write() {} }); },
    async close() { this.closed++; this.readable = null; this.writable = null; },
    getInfo() { return { bluetoothServiceClassId: 0x1101 }; },
  };
  let asked = 0;
  const fakeSerial = { requestPort: async () => { asked++; return port; }, getPorts: async () => [port], addEventListener() {} };
  Object.defineProperty(globalThis.navigator, 'serial', { value: fakeSerial, configurable: true });
  const L2 = new Link();
  await L2.connect();
  port.fail = false;                                                  // beim Wiederöffnen läuft der Anschluss wieder
  for (let i = 0; i < 50 && port.closed === 0; i++) await sleep(20);
  ok(port.closed === 1, 'nach dem ersten Lesefehler sofort geschlossen');
  ok(L2.log.filter(l => /Lesefehler/.test(l.text)).length === 1 && L2.log.length < 10, 'Lesefehler genau einmal im Protokoll (' + L2.log.length + ' Zeilen)');
  ok(L2.state === 'recovering', 'Wiederaufnahme läuft');
  for (let i = 0; i < 60 && L2.state !== 'connected'; i++) await sleep(100);
  ok(L2.state === 'connected' && port.opened === 2 && asked === 1, 'über getPorts wieder geöffnet, ohne neue Geräteauswahl');
  ok(L2.log.some(l => /wieder aufgenommen/.test(l.text)), 'Wiederaufnahme im Protokoll');
  const frist = L2.recoverUntil;
  port.fail = true; await L2._lost('Lesefehler: erneut');               // bricht vor der ersten Abfrage wieder ab
  ok(frist !== null && L2.recoverUntil === frist && L2.state === 'recovering', 'erneuter Abbruch vor der ersten Abfrage: alte Frist läuft weiter');
  port.fail = false;
  for (let i = 0; i < 60 && L2.state !== 'connected'; i++) await sleep(100);
  ok(L2.state === 'connected', 'danach wieder geöffnet');
  L2._note('gleiche Meldung'); L2._note('gleiche Meldung'); L2._note('gleiche Meldung');
  ok(L2.log.filter(l => l.text === 'gleiche Meldung').length === 1 && /3×, zuletzt/.test(L2.logText()), 'gleiche Meldungen hintereinander werden gezählt, nicht wiederholt');
  // abgelaufene Frist beginnt neu: «während 120 s», nicht «während 0 s»
  L2.recoverUntil = 1; L2.reopenedAt = 0;
  await L2._lost('Lesefehler: viel später');
  ok(/während 1[12]\d s/.test(L2.log[L2.log.length - 1].text), 'abgelaufene Frist: neue Frist von 2 Minuten');
  await L2.disconnect();
  clearInterval(L2.tick);

  // 5. Review 0.8.9: «Trennen» bleibt getrennt, Schreibfehler, Stopp während des Öffnens, Leitungsfehler
  const p3 = {
    opened: 0, closed: 0, slowOpen: 0, slowClose: 0, plan: [], failWrite: false, readable: null, writable: null, opening: false,
    async open() { this.opening = true; if (this.slowOpen) await sleep(this.slowOpen); this.opening = false; this.opened++; this._cur = null;
      const self = this; this.writable = new WritableStream({ write() { if (self.failWrite) throw new DOMException('write failed', 'UnknownError'); } }); },
    get readable() {                                                   // wie Web Serial: nach einem Leitungsfehler ein neuer Datenstrom
      if (!this.writable) return null;
      if (!this._cur) { const k = this.plan.shift(), self = this; this._cur = k ? new ReadableStream({ pull(c) { self._cur = null; c.error(new DOMException('line', k)); } }) : stillStream(); }
      return this._cur;
    },
    set readable(v) {},
    async close() { if (this.slowClose) await sleep(this.slowClose); this.closed++; this.writable = null; this._cur = null; },
    getInfo() { return { usbVendorId: 0x0403, usbProductId: 0x6001 }; },
  };
  Object.defineProperty(globalThis.navigator, 'serial', { value: { requestPort: async () => p3, getPorts: async () => [p3], addEventListener() {} }, configurable: true });
  const L3 = new Link();
  // a) Leitungsfehler: weiterlesen, Anschluss bleibt offen
  p3.plan = ['FramingError'];
  await L3.connect();
  await sleep(100);
  ok(L3.state === 'connected' && p3.closed === 0 && L3.log.some(l => /Leitungsfehler, lese weiter/.test(l.text)), 'Leitungsfehler: Anschluss bleibt offen, liest weiter');
  // b) Fehler aus einer schon geschlossenen Verbindung macht «Trennen» nicht rückgängig
  const gAlt = L3.gen;
  p3.slowClose = 200;                                                 // Lücke bis p.close(), in der ein Schreibfehler eintreffen kann
  const d = L3.disconnect();
  await sleep(50);
  await L3._lost('Fehler beim Senden: alt', gAlt);                    // so meldete sich der Schreibfehler vor 0.8.9
  await d; p3.slowClose = 0;
  await sleep(50);
  ok(L3.state === 'off' && !L3.recovering && !L3.log.some(l => /verloren: Fehler beim Senden: alt/.test(l.text)), '«Trennen» bleibt getrennt trotz verspätetem Fehler');
  // c) Schreibfehler → Verbindung verloren, Wiederaufnahme
  await L3.connect();
  p3.failWrite = true;
  ok(await L3._raw([0x78], 'Test') === false, 'Schreibfehler gemeldet');
  for (let i = 0; i < 20 && L3.state !== 'recovering'; i++) await sleep(20);
  ok(L3.state === 'recovering' && L3.log.some(l => /Verbindung verloren: Fehler beim Senden: write failed/.test(l.text)), 'Schreibfehler: Verbindung verloren, Wiederaufnahme läuft');
  // d) Stopp während des Öffnens: der Anschluss wird wieder geschlossen, keine neue Frist
  p3.failWrite = false; p3.slowOpen = 600;
  for (let i = 0; i < 50 && !p3.opening; i++) await sleep(100);
  ok(p3.opening, 'Wiederaufnahme öffnet gerade');
  await L3.disconnect();
  const c0 = p3.closed;
  await sleep(900);
  ok(L3.state === 'off' && !L3.recovering && p3.closed === c0 + 1 && !L3.log.some(l => /wieder aufgenommen/.test(l.text)), 'Stopp während des Öffnens: wieder geschlossen, bleibt getrennt');
  clearInterval(L3.tick);
  console.log('link: ' + n + ' Prüfungen bestanden');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
