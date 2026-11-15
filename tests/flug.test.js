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
//    (0.6.4: Flugplätze und Türme im Block AD/TWR)
const E = (ch, dienst, dist, name) => ({ ch, dienst, dist, klar: name, kurzModus: 'frei', kurz: name, ort: { cc: 'CH' } });
const FREE = nr => ({ nr, ch: '118.000', name: 'FREE' });
{
  const cfg = M.defaultConfig();
  const ad = cfg.bloecke.find(b => b.id === 'b-apptwr');
  const dev = Array.from({ length: 100 }, (_, i) => FREE(i));
  dev[0] = { nr: 0, ch: '122.255', name: 'BALLOON', kind: 'fixed' };
  dev[99] = { nr: 99, ch: '121.500', name: 'EMERGENC', kind: 'fixed' };
  dev[1] = { nr: 1, ch: '134.980', name: 'WNTRT AD', block: 'AD/TWR' };
  dev[2] = { nr: 2, ch: '122.155', name: 'GRNCH AD', block: 'AD/TWR' };
  dev[3] = { nr: 3, ch: '123.555', name: 'BRFLD AD', block: 'AD/TWR' };
  dev[4] = { nr: 4, ch: '120.355', name: 'SPECK AD', block: 'RADAR' };   // ausserhalb des Blocks
  const entries = [E('124.700', 'FIS', 0, 'ZURICH F'), E('120.355', 'AD', 5, 'SPECK AD'), E('134.980', 'AD', 8, 'WNTRT AD'), E('121.055', 'AD', 20, 'SCHFH AD'),
    E('130.755', 'AD', 25, 'HASNA AD'), E('118.100', 'TWR', 30, 'ZURICH T')];
  const plan = F.planBlock({ cfg, block: ad, entries, device: dev });
  ok(plan.mode === 'block' && plan.nrs.join() === '1,2,3', 'Plätze des Blocks aus dem Gerätestand: ' + plan.nrs);
  ok(plan.keep.join() === '1', '134.980 bleibt auf Platz 01');
  ok(plan.changes.length === 2 && plan.changes[0].nr === 2 && plan.changes[0].neu.ch === '121.055' && plan.changes[1].nr === 3 && plan.changes[1].neu.ch === '130.755',
    'Plätze 02/03 bekommen die nächsten neuen: ' + plan.changes.map(c => c.nr + '←' + c.neu.ch).join(', '));
  ok(!plan.changes.some(c => c.neu.ch === '120.355'), '120.355 steht schon ausserhalb des Blocks → nicht doppelt');
  ok(!plan.changes.some(c => c.neu.dienst === 'FIS' || c.neu.ch === '118.100'), 'nur Dienste des Blocks, nur die nächsten');
  ok(!plan.changes.some(c => c.nr === 0 || c.nr === 99 || c.nr === 4), 'feste Plätze und andere Blöcke unberührt');
  const list = F.writeList(plan);
  ok(list[0].nr === 2 && list[0].name === 'SCHFH AD', 'Schreibliste');
  const res = { 2: { kind: 'ACK' }, 3: { kind: 'keine Antwort' } };
  const neu = F.applyPlan(dev, plan, ad, res);
  ok(neu[2].ch === '121.055' && neu[2].block === 'AD/TWR' && neu[3].ch === '123.555', 'nur Quittiertes übernommen');
  const rows = F.logRows(plan, ad, res, { lat: 47.41234567, lon: 8.5 });
  ok(rows.length === 2 && rows[0].ok && !rows[1].ok && rows[0].lat === 47.41235, 'Fluglog');
  ok(/Platz/.test(F.logCsv(rows)) && F.logCsv(rows).split('\r\n').length === 3, 'Fluglog als CSV');
  // Gerätestand mit den alten Blocknamen (vor 0.6.4: «AD» und «APP/TWR») passt über den Alias
  const old = dev.map(p => (p.block === 'AD/TWR' ? Object.assign({}, p, { block: p.nr < 3 ? 'AD' : 'APP/TWR' }) : p));
  const adA = Object.assign({}, ad, { alias: ['APP/TWR', 'AD'] });
  const pOld = F.planBlock({ cfg, block: adA, entries, device: old });
  ok(pOld.nrs.join() === '1,2,3' && pOld.changes.length === 2 && F.applyPlan(old, pOld, adA, { 2: { kind: 'ACK' }, 3: { kind: 'ACK' } }).slice(1, 4).every(p => p.block === 'AD/TWR'), 'alte Blocknamen über den Alias, danach «AD/TWR»');
}
// 3b. 0.6.2: Plätze ohne Ersatz werden FREE; schon freie bleiben unberührt
{
  const cfg = M.defaultConfig(), ad = cfg.bloecke.find(b => b.id === 'b-apptwr');
  const dev = Array.from({ length: 100 }, (_, i) => FREE(i));
  dev[1] = { nr: 1, ch: '134.980', name: 'WNTRT AD', block: 'AD/TWR' };
  dev[2] = { nr: 2, ch: '122.155', name: 'GRNCH AD', block: 'AD/TWR' };
  dev[3] = { nr: 3, ch: '118.000', name: 'FREE', block: 'AD/TWR', kind: 'free' };
  const plan = F.planBlock({ cfg, block: ad, entries: [E('134.980', 'AD', 8, 'WNTRT AD')], device: dev });
  ok(plan.keep.join() === '1' && plan.changes.length === 1 && plan.changes[0].nr === 2 && plan.changes[0].neu.frei && plan.changes[0].name === 'FREE' && plan.changes[0].neu.ch === '118.000',
    'Platz 02 ohne Ersatz → FREE, Platz 03 schon frei: ' + plan.changes.map(c => c.nr + '←' + c.name).join(', '));
  const neu = F.applyPlan(dev, plan, ad, { 2: { kind: 'ACK' } });
  ok(neu[2].name === 'FREE' && neu[2].block === 'AD/TWR' && neu[2].kind === 'free', 'FREE bleibt im Block');
  const again = F.planBlock({ cfg, block: ad, entries: [E('134.980', 'AD', 8, 'WNTRT AD')], device: neu });
  ok(again.nrs.join() === '1,2,3' && again.changes.length === 0, 'danach nichts mehr zu tun');
}
// 3c. 0.6.4: Block ohne Frequenz fällt weg, der nächste Block beginnt dort; mit Frequenzen kommt er an seiner Stelle wieder
{
  const cfg = M.defaultConfig(), ad = cfg.bloecke.find(b => b.id === 'b-apptwr'), info = cfg.bloecke.find(b => b.id === 'b-info');
  const dev = Array.from({ length: 100 }, (_, i) => FREE(i));
  dev[0] = { nr: 0, ch: '122.255', name: 'BALLOON', kind: 'fixed' };
  dev[99] = { nr: 99, ch: '121.500', name: 'EMERGENC', kind: 'fixed' };
  dev[1] = { nr: 1, ch: '124.700', name: 'ZURICH F', block: 'INFO' };
  dev[2] = { nr: 2, ch: '128.950', name: 'LANGEN F', block: 'INFO' };
  dev[3] = { nr: 3, ch: '134.980', name: 'LSPH AD', block: 'AD/TWR' };
  dev[4] = { nr: 4, ch: '120.355', name: 'LSZK AD', block: 'AD/TWR' };
  dev[5] = { nr: 5, ch: '118.000', name: 'FREE', block: 'AD/TWR', kind: 'free' };
  dev[6] = { nr: 6, ch: '119.225', name: 'ALPS R', block: 'RADAR' };
  dev[7] = { nr: 7, ch: '135.480', name: 'MIL R', block: 'RADAR' };
  const drop = F.planBlock({ cfg, block: ad, entries: [E('124.700', 'FIS', 3, 'ZURICH F')], device: dev });
  ok(drop.mode === 'drop' && drop.nrs.length === 0, 'keine Frequenz für AD/TWR → Block fällt weg');
  ok(drop.after[3].block === 'RADAR' && drop.after[3].ch === '119.225' && drop.after[4].ch === '135.480' && drop.after[5].name === 'FREE' && drop.after[5].block === null,
    'RADAR beginnt auf Platz 03: ' + [3, 4, 5].map(n => drop.after[n].ch + ' ' + drop.after[n].name).join(', '));
  ok(drop.changes.map(c => c.nr).join() === '3,4,6,7' && drop.changes[0].neu.moved && drop.changes[0].neu.from === 6 && drop.changes[2].neu.frei,
    'geschrieben werden 03, 04 (RADAR nachgerückt) und 06, 07 (FREE): ' + drop.changes.map(c => c.nr + '←' + c.name).join(', '));
  ok(!drop.changes.some(c => c.nr < 3 || c.nr === 99), 'INFO und feste Plätze unberührt');
  const res = {}; drop.changes.forEach(c => { res[c.nr] = { kind: 'ACK' }; });
  const d2 = F.applyPlan(dev, drop, ad, res);
  ok(F.slotsOf(d2, ad).length === 0 && F.slotsOf(d2, cfg.bloecke.find(b => b.id === 'b-radar')).map(p => p.nr).join() === '3,4', 'Gerätestand: RADAR auf 03–04');
  ok(F.planBlock({ cfg, block: info, entries: [E('124.700', 'FIS', 3, 'ZURICH F'), E('128.950', 'FIS', 9, 'LANGEN F')], device: d2 }).changes.length === 0, 'INFO bleibt, wie es ist');
  const back = F.planBlock({ cfg, block: ad, entries: [E('122.155', 'AD', 4, 'LSZG AD'), E('118.100', 'TWR', 12, 'ZURICH T')], device: d2 });
  ok(back.mode === 'insert' && back.nrs.join() === '3,4', 'AD/TWR kommt wieder, an seiner Stelle vor RADAR: ' + back.nrs);
  ok(back.after[3].ch === '122.155' && back.after[4].ch === '118.100' && back.after[5].ch === '119.225' && back.after[5].block === 'RADAR' && back.after[6].ch === '135.480',
    'RADAR rückt nach hinten: ' + [3, 4, 5, 6].map(n => back.after[n].name).join(', '));
  ok(back.changes.map(c => c.nr).join() === '3,4,5,6', 'geschrieben werden 03–06');
  const rows = F.logRows(back, ad, Object.fromEntries(back.changes.map(c => [c.nr, { kind: 'ACK' }])), null);
  ok(rows.find(r => r.nr === 5).block === 'RADAR' && rows.find(r => r.nr === 3).block === 'AD/TWR', 'Fluglog nennt den Block jedes Platzes');
  // Grösse beim Wiedereinfügen aus der Konfiguration (Plätze des Blocks im Entwurf), Rest FREE
  const cfg2 = M.defaultConfig();
  for (const [ch, k] of [['134.980', 'LSPH AD'], ['120.355', 'LSZK AD'], ['122.155', 'LSZG AD'], ['123.555', 'LSZF AD']]) M.addEntry(cfg2, { ch, kurz: k, klar: k, dienst: 'AD', aktiv: true, block: 'b-apptwr' });
  const ad2 = cfg2.bloecke.find(b => b.id === 'b-apptwr'), planned = M.layout(cfg2).ranges.find(r => r.block === 'b-apptwr').nrs.length;
  const back2 = F.planBlock({ cfg: cfg2, block: ad2, entries: [E('130.755', 'AD', 4, 'HASNA AD')], device: d2 });
  ok(planned === 4 && back2.nrs.length === 4 && back2.after[back2.nrs[1]].name === 'FREE', 'Grösse aus dem Entwurf (' + planned + ' Plätze), Rest FREE');
}

// 4. Echte Daten: Sektor ab Zürich nach Osten
const file = process.argv[2] || '/tmp/freq-ch.json';
if (fs.existsSync(file)) {
  const ch = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = M.defaultConfig(), pos = { lat: 47.458, lon: 8.548 };
  const area = F.sectorArea(pos, 80, 40, 100);
  const r = A.propose([ch], { area, standort: pos, bandLo: 0, bandHi: 19500, radarNoLimit: false, marginKm: 5, services: M.servicesOf(cfg), adLoc: 'icao' });
  const info = cfg.bloecke.find(b => b.id === 'b-info'), ad = cfg.bloecke.find(b => b.id === 'b-apptwr'), radar = cfg.bloecke.find(b => b.id === 'b-radar');
  const dev = Array.from({ length: 100 }, (_, i) => ({ nr: i, ch: '118.000', name: 'FREE', block: i >= 1 && i <= 3 ? 'INFO' : i >= 4 && i <= 10 ? 'AD/TWR' : i >= 11 && i <= 16 ? 'RADAR' : undefined }));
  const pi = F.planBlock({ cfg, block: info, entries: r.entries, device: dev }), pa = F.planBlock({ cfg, block: ad, entries: r.entries, device: dev }), pr = F.planBlock({ cfg, block: radar, entries: r.entries, device: dev });
  ok(pi.changes.every(c => info.svc.includes(c.neu.dienst)), 'echte Daten: INFO-Vorschlag ' + pi.changes.map(c => c.name + ' ' + c.neu.ch).join(', '));
  ok(pa.changes.length > 0 && pa.changes.every(c => (ad.svc.includes(c.neu.dienst) && / (AD|T|AT)$/.test(c.name)) || c.neu.frei), 'echte Daten: AD/TWR-Vorschlag ' + pa.changes.map(c => c.name + ' ' + c.neu.ch).join(', '));
  ok(!r.entries.some(e => M.IFR_SVC.includes(e.dienst)), 'keine IFR-Frequenzen');
  ok(pr.changes.every(c => radar.svc.includes(c.neu.dienst)), 'echte Daten: RADAR-Vorschlag ' + pr.changes.map(c => c.name + ' ' + c.neu.ch).join(', '));
  ok(r.entries.every(e => e.quellen.includes('openAIP')), 'nur openAIP');
  console.log('  Sektor Zürich → 080°: ' + r.entries.length + ' Kandidaten; INFO ' + pi.changes.length + ', AD ' + pa.changes.length + ', RADAR ' + pr.changes.length + ' Änderungen: ' + pi.changes.concat(pa.changes, pr.changes).map(c => c.name).join(', '));
}
console.log('flug: ' + n + ' Prüfungen bestanden');
