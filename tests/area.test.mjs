// node tests/area.test.mjs [freq-ch.json] – Formen, Höhenband, Rufnamen; mit Datendatei zusätzlich Vorschlag um Zürich
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('../src/area.js'), M = require('../src/model.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

const ZRH = { lat: 47.458, lon: 8.548 };
const P = A.projector(ZRH.lat, ZRH.lon);
// Kreis 20 km
const K = A.shape({ typ: 'kreis', lat: ZRH.lat, lon: ZRH.lon, r: 20 }, P);
ok(K.inside(0, 0) && K.inside(19.9, 0) && !K.inside(20.1, 0)); ok(Math.abs(K.dist(30, 0) - 10) < 1e-9);
// Rechteck, Vieleck
const R = A.shape({ typ: 'rechteck', s: 47.3, w: 8.3, n: 47.6, e: 8.8 }, P);
ok(R.inside(...P.to(47.45, 8.5)) && !R.inside(...P.to(47.7, 8.5)));
const V = A.shape({ typ: 'vieleck', pts: [[47.3, 8.3], [47.3, 8.8], [47.6, 8.55]] }, P);
ok(V.inside(...P.to(47.4, 8.55)) && !V.inside(...P.to(47.58, 8.35)));
// Korridor: Start Zürich, nach Osten 50 km, dann nach Norden 40 km; links 5 / rechts 15 km
const pE = P.from(50, 0), pN = P.from(50, 40);
const Kor = A.shape({ typ: 'korridor', pts: [{ lat: ZRH.lat, lon: ZRH.lon }, { lat: pE[0], lon: pE[1], l: 5, r: 15 }, { lat: pN[0], lon: pN[1], l: 10, r: 10 }] }, P);
ok(Kor.inside(25, 4.9) && !Kor.inside(25, 5.2), 'links 5 km'); ok(Kor.inside(25, -14.9) && !Kor.inside(25, -15.2), 'rechts 15 km');
ok(Kor.inside(59, 20) && !Kor.inside(61, 20), 'zweiter Schenkel 10 km'); ok(Kor.inside(52, 2), 'Knick');
ok(Math.abs(Kor.along(25, 1) - 25) < 1e-6 && Math.abs(Kor.along(50, 20) - 70) < 1e-6, 'along');
ok(Math.abs(Kor.dist(25, 10) - 5) < 1e-6, 'Abstand ausserhalb');
// Schnitt: Luftraum ganz im Gebiet, Gebiet ganz im Luftraum, Kanten kreuzen sich, getrennt
const sq = (cx, cy, h) => [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]];
ok(A.intersects(K, [sq(0, 0, 2)])); ok(A.intersects(K, [sq(0, 0, 100)])); ok(A.intersects(K, [sq(22, 0, 3)])); ok(!A.intersects(K, [sq(40, 0, 3)]));
ok(A.intersects(Kor, [sq(25, 0, 1)])); ok(!A.intersects(Kor, [sq(25, 30, 3)]));
// Höhen
eq([A.parseAlt('GND'), A.parseAlt('FL 195'), A.parseAlt('fl95'), A.parseAlt('5000 ft'), A.parseAlt('1500 m'), A.parseAlt('UNL')], [0, 19500, 9500, 5000, 4921, Infinity]);
ok(isNaN(A.parseAlt('hoch')));
eq([A.altFt({ v: 0, u: 1, r: 0 }), A.altFt({ v: 4500, u: 1, r: 1 }), A.altFt({ v: 195, u: 6, r: 2 })], [0, 4500, 19500]);
// Rufnamen
const sc = s => { const r = A.splitCall(s); return [r.place, r.qual]; };
eq(sc('ZUERICH RADAR EAST'), ['ZUERICH', 'E']); eq(sc('BALE INFORMATION'), ['BALE', '']); eq(sc('Radar M3'), ['', '3']); eq(sc('HAUSEN AM ALBIS "R"'), ['HAUSEN AM ALBIS', '']);
eq(A.normPlace('Zürich'), A.normPlace('ZUERICH'));

const file = process.argv[2] || '/tmp/freq-ch.json';
if (existsSync(file)) {
  const ch = JSON.parse(readFileSync(file, 'utf8'));
  const cfg = M.defaultConfig();
  const r = A.propose([ch], { area: { typ: 'kreis', lat: ZRH.lat, lon: ZRH.lon, r: 25 }, standort: ZRH, bandLo: 0, bandHi: 19500, radarNoLimit: false, marginKm: 5, services: M.servicesOf(cfg) });
  const by = (ch, s) => r.entries.find(e => e.ch === ch && (!s || e.dienst === s));
  const twr = by('118.100', 'TWR');
  ok(twr, 'Zürich TWR'); eq(M.entryShort(Object.assign({ kurzModus: 'kurz' }, twr)), 'ZRH TWR'); ok(twr.vertrauen === 'g' && twr.dist === 0);
  ok(by('123.555'), 'Birrfeld (8.33-Kanalname)'); ok(!r.entries.some(e => e.ort.icao === 'LSZB'), 'Bern liegt ausserhalb von 25 km + 5 km');
  ok(r.entries.every(e => /^1[1-3]\d\.\d{3}$/.test(e.ch)), 'nur gültige Kanäle');
  const keys = r.entries.map(e => e.ch + '|' + e.ort.code + '|' + e.dienst); eq(keys.length, new Set(keys).size, 'keine Doppel');
  ok(r.stats.airspaces > 0 && r.layers.airspaces.length === r.stats.airspaces);
  const klar = r.entries.map(e => e.klar);
  ok(klar.includes('Zuerich ATIS DEP') && klar.includes('Zuerich ATIS ARR'), 'ATIS ARR/DEP unterscheidbar');
  eq(r.entries.filter(e => e.ch === '124.700').length, 1, 'FIS 124.700 nur einmal'); eq(M.entryShort(Object.assign({ kurzModus: 'kurz' }, by('124.700'))), 'ZRH INFO');
  ok(!r.entries.some(e => e.ort.icao === 'LSHZ'), 'Heliport ausgelassen'); ok(r.entries.every(e => /^[A-Z]{2}$/.test(e.ort.cc)), 'Land je Station'); eq(twr.ort.cc, 'CH'); ok(by('133.900').ort.qual === 'E');
  M.SERVICES.forEach(() => 0);
  A.applyProposal(cfg, r.entries);
  const L = M.layout(cfg);
  ok(L.slots[0].kurz === 'BALLOON' && L.slots[99].kurz === 'EMERGENC'); ok(L.used > 5, 'Plätze belegt: ' + L.used);
  const R2 = M.check(cfg); console.log('  Zürich 25 km: ' + r.entries.length + ' Frequenzen, ' + L.used + ' Plätze, ' + R2.count.r + ' rot, ' + R2.count.y + ' gelb, Stat ' + JSON.stringify(r.stats));
  console.log('  ' + L.slots.slice(0, L.freeFrom).map(s => String(s.nr).padStart(2, '0') + ' ' + s.kurz + ' ' + s.ch).join(' | '));
  // Höhenband tief: TMA-Teile oberhalb fallen weg
  const low = A.propose([ch], { area: { typ: 'kreis', lat: ZRH.lat, lon: ZRH.lon, r: 25 }, standort: ZRH, bandLo: 0, bandHi: 1000, marginKm: 5, services: M.SERVICES });
  ok(low.stats.outsideBand > 0, 'Höhenband filtert');
}
console.log(n + ' Gebietsprüfungen bestanden');
// Länderwahl über Gitterzellen
const idx = { countries: [{ cc: 'ch', bbox: [5.9, 45.8, 10.5, 47.8], cells: ['47,8', '46,7'] }, { cc: 'fr', bbox: [-61, -21, 55, 51], cells: ['48,7', '43,5'] }, { cc: 'it', bbox: [6.6, 35, 18.5, 47.1], cells: ['46,8'] }] };
eq(A.countriesFor(idx, [8.2, 47.2, 8.9, 47.7]), ['ch']); eq(A.countriesFor(idx, [7.5, 47.5, 8.5, 48.5]), ['ch', 'fr']);
console.log('Länderwahl geprüft');
