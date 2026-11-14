// Prüft src/flug.js: Fahrtrichtung aus der GPS-Spur, Vorausschau-Sektor, Plan je Block (behalten, ersetzen, feste Plätze
// und Frequenzen ausserhalb des Blocks unberührt), neuer Gerätestand und Fluglog. Mit /tmp/freq-ch.json auch mit echten Daten.
'use strict';
const assert = require('assert');
const fs = require('fs');
const F = require('../src/flug.js'), M = require('../src/model.js'), A = require('../src/area.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// 1. Richtung aus der Spur: 6 km nach Osten in 12 min → Kurs ~090°, ~30 km/h
{
  const hist = [];
  for (let i = 0; i <= 12; i++) hist.push({ t: i * 60000, lat: 47.4, lon: 8.5 + i * 0.0066 });
  const tr = F.track(hist);
  ok(Math.abs(tr.bearing - 90) <= 1, 'Kurs Ost: ' + tr.bearing);
  ok(tr.kmh > 25 && tr.kmh < 35, 'Geschwindigkeit: ' + tr.kmh);
  ok(F.track([{ t: 0, lat: 47, lon: 8 }, { t: 60000, lat: 47.0001, lon: 8 }]).bearing === null, 'zu wenig Strecke → keine Richtung');
  ok(F.compass(75) === 'ONO' && F.compass(359) === 'N', 'Himmelsrichtung');
}
// 2. Sektor: Spitze an der Position, Bogen in 100 km, ±40°
{
  const pos = { lat: 47.4, lon: 8.5 };
  const s = F.sectorArea(pos, 90, 40, 100);
  ok(s.typ === 'vieleck' && s.pts.length >= 10, 'Sektor als Vieleck');
  const P = A.projector(pos.lat, pos.lon), S = A.shape(s, P);
  ok(S.inside(...P.to(47.4, 9.3)), '60 km östlich liegt im Sektor');
  ok(!S.inside(...P.to(47.4, 7.9)), 'westlich liegt nicht im Sektor');
  ok(!S.inside(...P.to(48.1, 8.6)), 'nördlich (ausserhalb ±40°) nicht im Sektor');
  ok(F.sectorArea(pos, null, 40, 100).typ === 'kreis', 'ohne Richtung ein Kreis');
}
// 3. Plan: behalten, was passt; frei werdende Plätze mit den nächsten neuen Stationen; ausserhalb und fest unberührt
{
  const cfg = M.defaultConfig();
  const info = cfg.bloecke.find(b => b.id === 'b-info');
  const dev = Array.from({ length: 100 }, (_, i) => ({ nr: i, ch: '118.000', name: 'FREE' }));
  dev[0] = { nr: 0, ch: '122.255', name: 'BALLOON', kind: 'fixed' };
  dev[99] = { nr: 99, ch: '121.500', name: 'EMERGENC', kind: 'fixed' };
  dev[1] = { nr: 1, ch: '124.700', name: 'ZURICH F', block: 'INFO' };
  dev[2] = { nr: 2, ch: '126.350', name: 'GENEVA I', block: 'INFO' };
  dev[3] = { nr: 3, ch: '123.555', name: 'BRFLD RD', block: 'INFO' };
  dev[10] = { nr: 10, ch: '120.355', name: 'SPECK RD', block: 'APP/TWR' };   // ausserhalb des Blocks
  const e = (ch, dienst, dist, name) => ({ ch, dienst, dist, klar: name, kurzModus: 'frei', kurz: name, ort: { cc: 'CH' } });
  const entries = [e('124.700', 'FIS', 0, 'ZURICH F'), e('120.355', 'RDO', 5, 'SPECK RD'), e('134.980', 'RDO', 8, 'WNTRT RD'), e('121.055', 'RDO', 20, 'SCHFH RD'),
    e('126.350', 'FIS', 150, 'GENEVA I'), e('118.100', 'TWR', 1, 'ZURICH T')];
  const plan = F.planBlock({ cfg, block: info, entries, device: dev });
  ok(plan.nrs.join() === '1,2,3', 'Plätze des Blocks aus dem Gerätestand: ' + plan.nrs);
  ok(plan.keep.join() === '1', '124.700 bleibt auf Platz 01');
  ok(plan.changes.length === 2 && plan.changes[0].nr === 2 && plan.changes[0].neu.ch === '134.980' && plan.changes[1].nr === 3 && plan.changes[1].neu.ch === '121.055',
    'Plätze 02/03 bekommen die nächsten neuen: ' + plan.changes.map(c => c.nr + '←' + c.neu.ch).join(', '));
  ok(!plan.changes.some(c => c.neu.ch === '120.355'), '120.355 steht schon ausserhalb des Blocks → nicht doppelt');
  ok(!plan.changes.some(c => c.neu.dienst === 'TWR'), 'nur Dienste des Blocks');
  ok(!plan.changes.some(c => c.nr === 0 || c.nr === 99), 'feste Plätze unberührt');
  const list = F.writeList(plan);
  ok(list[0].nr === 2 && list[0].name === 'WNTRT RD', 'Schreibliste');
  const res = { 2: { kind: 'ACK' }, 3: { kind: 'keine Antwort' } };
  const neu = F.applyPlan(dev, plan, info, res);
  ok(neu[2].ch === '134.980' && neu[2].block === 'INFO' && neu[3].ch === '123.555', 'nur Quittiertes übernommen');
  const rows = F.logRows(plan, info, res, { lat: 47.41234567, lon: 8.5 });
  ok(rows.length === 2 && rows[0].ok && !rows[1].ok && rows[0].lat === 47.41235, 'Fluglog');
  ok(/Platz/.test(F.logCsv(rows)) && F.logCsv(rows).split('\r\n').length === 3, 'Fluglog als CSV');
}
// 4. Echte Daten: Sektor ab Zürich nach Osten
const file = process.argv[2] || '/tmp/freq-ch.json';
if (fs.existsSync(file)) {
  const ch = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = M.defaultConfig(), pos = { lat: 47.458, lon: 8.548 };
  const area = F.sectorArea(pos, 80, 40, 100);
  const r = A.propose([ch], { area, standort: pos, bandLo: 0, bandHi: 19500, radarNoLimit: false, marginKm: 5, services: M.servicesOf(cfg), adLoc: 'icao' });
  const info = cfg.bloecke.find(b => b.id === 'b-info'), radar = cfg.bloecke.find(b => b.id === 'b-radar');
  const dev = Array.from({ length: 100 }, (_, i) => ({ nr: i, ch: '118.000', name: 'FREE', block: i >= 1 && i <= 10 ? 'INFO' : i >= 11 && i <= 16 ? 'RADAR' : undefined }));
  const pi = F.planBlock({ cfg, block: info, entries: r.entries, device: dev }), pr = F.planBlock({ cfg, block: radar, entries: r.entries, device: dev });
  ok(pi.changes.length > 0 && pi.changes.every(c => info.svc.includes(c.neu.dienst)), 'echte Daten: INFO-Vorschlag ' + pi.changes.map(c => c.name + ' ' + c.neu.ch).join(', '));
  ok(pr.changes.every(c => radar.svc.includes(c.neu.dienst)), 'echte Daten: RADAR-Vorschlag ' + pr.changes.map(c => c.name + ' ' + c.neu.ch).join(', '));
  ok(r.entries.every(e => e.quellen.includes('openAIP')), 'nur openAIP');
  console.log('  Sektor Zürich → 080°: ' + r.entries.length + ' Kandidaten; INFO ' + pi.changes.length + ', RADAR ' + pr.changes.length + ' Änderungen');
}
console.log('flug: ' + n + ' Prüfungen bestanden');
