// Prüft die Logik «Speicher von Hand auslesen» (src/readout.js) – u. a. mit der echten Meldefolge vom 13.11.2026.
'use strict';
const assert = require('assert');
const path = require('path');
const { Readout, parseBackup } = require('../src/readout.js');
const F = require('./fixtures/rundgang_20261113.json').meldungen;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// 1. Echte Folge: Anker nach der 8. Meldung (Platz 07), Runde schliesst bei der 101. Meldung
{
  const R = new Readout(); R.start();
  let res, closedAt = -1;
  F.forEach((m, i) => {
    res = R.onR({ t: m.t, freq: m.freq, name: m.name });
    if (i === 7) { const a = R.sel(7); ok(a.type === 'anchor' && a.back === 7, 'Anker rückwärts'); }
    if (res.type === 'closed' && closedAt < 0) closedAt = i;
  });
  ok(closedAt === 100, 'Runde bei der 101. Meldung geschlossen, war ' + closedAt);
  ok(!R.on && R.closed, 'Aufnahme beendet');
  ok(R.count === 100 && R.complete, '100 Plätze, vollständig');
  ok(R.slots.every(x => x.state === 'kontrolliert'), 'alle kontrolliert');
  for (let i = 0; i < 100; i++) ok(R.slots[i].freq === F[i].freq && R.slots[i].name === F[i].name.trimEnd(), 'Platz ' + i);
  ok(R.slots[89].name === '' && R.slots[96].name === '' && R.slots[97].name === 'TEST' && R.slots[99].name === '', 'leere Plätze gezählt');
  const p = R.plaetze(); ok(p[90].kind === 'leer' && p[1].kind === '', 'leer markiert');
  ok(R.stats.dup === 0, 'keine Doppelten');
}
// 2. Doppelte Meldung innert 0.3 s nur einmal
{
  const R = new Readout(); R.start();
  R.onR({ t: 0, freq: '118.000', name: 'A' }); R.sel(0);
  ok(R.onR({ t: 100, freq: '118.000', name: 'A' }).type === 'dup', 'dup');
  ok(R.onR({ t: 2000, freq: '118.000', name: 'A' }).type === 'put', 'gleich nach Pause = neuer Platz');
  ok(R.cursor === 1, 'Platz 01');
}
// 3. Kontrolle falsch: Plätze seit der letzten Kontrolle werden unsicher; Sprung ohne Zwischenplätze
{
  const R = new Readout(); R.start();
  R.onR({ t: 0, freq: '118.000', name: 'A' }); R.sel(10);
  for (let i = 1; i <= 5; i++) R.onR({ t: i * 2000, freq: '119.000', name: 'B' + i });
  const b = R.sel(16);
  ok(b.type === 'bad' && b.n === 4 && b.shaky === '11–14', 'unsicher 11–14');
  ok(R.slots[16].name === 'B5' && R.slots[15] === null, 'letzte Meldung verschoben');
  R.onR({ t: 20000, freq: '120.000', name: 'C' });
  const j = R.sel(40); ok(j.type === 'jump' && R.slots[40].name === 'C' && R.slots[17] === null, 'Sprung');
  ok(R.sel(40).type === 'ok', 'Kontrolle stimmt');
}
// 4. Zurücknehmen
{
  const R = new Readout(); R.start();
  R.onR({ t: 0, freq: '118.000', name: 'A' }); R.sel(0);
  R.onR({ t: 2000, freq: '118.005', name: 'B' });
  ok(R.undo() && R.cursor === 0 && R.slots[1] === null, 'undo');
}
// 5. Sicherungsdatei lesen (JSON und CSV)
{
  const json = JSON.stringify({ typ: 'krt2-sicherung', plaetze: F.slice(0, 100).map((m, i) => ({ platz: i, frequenz: m.freq, name: m.name })) });
  const a = parseBackup(json); ok(a.length === 100 && a.every(Boolean) && a[97].name === 'TEST' && a[90].kind === 'leer', 'JSON');
  const csv = '﻿Platz;Frequenz;Name;Status\r\n' + F.slice(0, 100).map((m, i) => String(i).padStart(2, '0') + ';' + m.freq + ';' + m.name + ';kontrolliert').join('\r\n');
  const c = parseBackup(csv); ok(c.every((x, i) => x.ch === a[i].ch && x.name === a[i].name), 'CSV = JSON');
  let err = ''; try { parseBackup('{"typ":"x"}'); } catch (e) { err = e.message; } ok(/keine KRT2-Sicherung/.test(err), 'falscher Typ');
}
console.log('readout: ' + n + ' Prüfungen bestanden');
