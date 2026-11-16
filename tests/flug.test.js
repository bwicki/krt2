// Prüft src/flug.js: Fahrtrichtung aus der GPS-Spur, Vorausschau-Sektor, rollender Bereich (Plätze, Vorschlagsliste,
// Zielplätze), neuer Gerätestand und Fluglog. Mit /tmp/freq-ch.json auch mit echten Daten.
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
// 3. Rollender Bereich (0.8.0): Plätze von–bis ohne feste; Vorschlagsliste INFO/FIS zuerst, nach Distanz, ohne Frequenzen
//    im Gerät; Zielplätze frei → nicht mehr in der Vorausschau → noch gültig, je ältester zuerst; Gerätestand und Fluglog
const E = (ch, dienst, dist, name) => ({ ch, dienst, dist, klar: name + ' klar', kurzModus: 'frei', kurz: name, ort: { cc: 'CH' } });
const FREE = nr => ({ nr, ch: '118.000', name: 'FREE' });
const devOf = () => { const d = Array.from({ length: 100 }, (_, i) => FREE(i)); d[0] = { nr: 0, ch: '122.255', name: 'BALLOON', kind: 'fixed' }; d[99] = { nr: 99, ch: '121.500', name: 'EMERGENC', kind: 'fixed' }; return d; };
{
  const cfg = M.defaultConfig();
  ok(JSON.stringify(F.rollSlots(cfg, devOf())) === JSON.stringify(Array.from({ length: 21 }, (_, i) => 75 + i)), 'Vorgabe 75–95: 21 Plätze');
  cfg.fixed.extra.push({ id: 'x1', nr: 80, ch: '123.455', kurz: 'CREW', klar: 'Crew' });
  const d0 = devOf(); d0[90] = { nr: 90, ch: '123.500', name: 'FEST', kind: 'fixed' };
  const ns = F.rollSlots(cfg, d0);
  ok(ns.length === 19 && !ns.includes(80) && !ns.includes(90), 'feste Plätze (Konfiguration und Gerät) bleiben ausgenommen');
  cfg.fixed.extra = [];
  cfg.settings.flug = { winkel: 40, distKm: 100, von: 97, bis: 90 };
  ok(JSON.stringify(F.rollSlots(cfg, devOf())) === JSON.stringify([90, 91, 92, 93, 94, 95, 96, 97]), 'von/bis vertauscht → 90–97');
  cfg.settings.flug = { winkel: 40, distKm: 100, von: 0, bis: 120 };
  const all = F.rollSlots(cfg, devOf());
  ok(all[0] === 1 && all[all.length - 1] === 98, 'Grenzen 01–98 (00 und 99 nie)');
}
{
  const cfg = M.defaultConfig(), d = devOf();
  d[12] = { nr: 12, ch: '124.700', name: 'GENEVA F', block: 'INFO' };            // steht schon im Gerät
  const entries = [
    E('132.350', 'TWR', 8, 'LSZR T'), E('124.700', 'FIS', 20, 'GENEVA F'), E('125.950', 'FIS', 60, 'MUNCHEN I'),
    E('128.050', 'INFO', 35, 'ZURICH I'), E('128.050', 'INFO', 90, 'ZURICH I2'), E('120.505', 'AD', 4, 'LSZK AD'), E('133.255', 'RDR', 50, 'ZRCH R'), E('999.000', 'AD', 1, 'KAPUTT')
  ];
  const c = F.rollCands(cfg, entries, d);
  ok(c.prio.map(x => x.ch).join(',') === '128.050,125.950', 'INFO/FIS zuerst nach Distanz, ohne die schon gespeicherte: ' + c.prio.map(x => x.ch).join(','));
  ok(c.rest.map(x => x.ch).join(',') === '120.505,132.350,133.255', 'übrige nach Distanz: ' + c.rest.map(x => x.ch).join(','));
  ok(c.prio[0].dist === 35 && c.prio[0].name === 'ZURICH I', 'je Frequenz die nächstgelegene Station');
  ok(c.inDevice === 1 && c.relevant.has(M.freqKey('124.700')) && c.relevant.size === 6, 'zählt Frequenzen im Gerät; relevant = alle gültigen der Vorausschau');
  ok(!c.prio.concat(c.rest).some(x => x.ch === '999.000'), 'ungültige Frequenz fällt weg');
  // Zielplätze
  const nrs = F.rollSlots(cfg, d);
  const d2 = devOf();
  d2[75] = { nr: 75, ch: '124.700', name: 'GENEVA F', block: 'ROLL' };      // noch in der Vorausschau
  d2[76] = { nr: 76, ch: '119.175', name: 'ALT I', block: 'ROLL' };         // nicht mehr
  d2[77] = { nr: 77, ch: '119.900', name: 'ALT2 I', block: 'ROLL' };        // nicht mehr, aber jünger
  for (let n = 78; n <= 95; n++) d2[n] = { nr: n, ch: (118 + n / 100).toFixed(3).replace(/\d$/, '5'), name: 'X' + n, block: 'ROLL' };
  d2[81] = FREE(81); d2[88] = FREE(88);
  const ages = { 76: 2000, 77: 3000 };
  const tg = F.rollTargets(cfg, nrs, d2, 5, c.relevant, ages);
  ok(tg[0] === 81 && tg[1] === 88, 'zuerst freie Plätze: ' + tg.join(','));
  ok(tg[2] !== 75 && !tg.includes(75), 'Platz mit noch gültiger Frequenz wird nicht überschrieben');
  ok(tg.indexOf(76) > tg.indexOf(78) || !tg.includes(76), 'nie beschriebene (Alter 0) vor älter beschriebenen: ' + tg.join(','));
  const tgAll = F.rollTargets(cfg, nrs, d2, 21, c.relevant, ages);
  ok(tgAll.length === 21 && tgAll[tgAll.length - 1] === 75 && tgAll.indexOf(76) < tgAll.indexOf(77), 'noch gültige zuletzt; älter vor jünger: …' + tgAll.slice(-4).join(','));
  ok(F.rollTargets(cfg, nrs, d2, 0, c.relevant, ages).length === 0, 'ohne Auswahl keine Zielplätze');
  // Schreibliste, neuer Gerätestand, Fluglog
  const picks = c.prio.slice(0, 2);
  const list = F.rollWriteList(picks, tg);
  ok(list.length === 2 && list[0].nr === 81 && list[0].ch === '128.050' && list[0].name === 'ZURICH I', 'Schreibliste: Auswahl in Reihenfolge auf die Zielplätze');
  const res = { 81: { kind: 'ACK', ms: 30 }, 88: { kind: 'TIMEOUT' } };
  const after = F.rollApply(d2, list, res);
  ok(after[81].ch === '128.050' && after[81].block === M.ROLL_BLOCK && after[81].klar === 'ZURICH I klar' && after[88].name === 'FREE', 'nur quittierte Plätze übernommen, Blockname ROLL');
  ok(after[75].ch === '124.700' && after[12].name === 'FREE' && after[90].name === 'X90', 'übrige Plätze unverändert');
  const rows = F.logRows(list, d2, res, { lat: 47.123456, lon: 8.5 });
  ok(rows.length === 2 && rows[0].ok && !rows[1].ok && rows[0].alt.name === 'FREE' && rows[0].block === 'ROLL' && rows[0].lat === 47.12346, 'Fluglog: alt, neu, quittiert, Position');
  ok(F.logCsv(rows).split('\r\n').length === 3, 'Fluglog als CSV');
}

// 4. Echte Daten: Sektor ab Zürich nach Osten
const file = process.argv[2] || '/tmp/freq-ch.json';
if (fs.existsSync(file)) {
  const ch = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = M.defaultConfig(), pos = { lat: 47.458, lon: 8.548 };
  const area = F.sectorArea(pos, 80, 40, 100);
  const r = A.propose([ch], { area, standort: pos, bandLo: 0, bandHi: 19500, radarNoLimit: false, marginKm: 5, services: M.servicesOf(cfg), adLoc: 'icao', vfr: true });
  const c = F.rollCands(cfg, r.entries, devOf());
  const ds = c.prio.map(x => x.dist);
  ok(c.prio.every(x => F.PRIO.includes(x.dienst)) && ds.every((v, i) => i === 0 || v >= ds[i - 1]), 'echte Daten: INFO/FIS nach Distanz ' + c.prio.map(x => x.name + ' ' + x.ch + ' ' + x.dist + ' km').join(', '));
  ok(!r.entries.some(e => M.IFR_SVC.includes(e.dienst)), 'keine IFR-Frequenzen');
  ok(r.entries.every(e => e.quellen.includes('openAIP')), 'nur openAIP');
  const keys = c.prio.concat(c.rest).map(x => x.k);
  ok(new Set(keys).size === keys.length, 'jede Frequenz nur einmal');
  console.log('  Sektor Zürich → 080°: ' + r.entries.length + ' Einträge; INFO/FIS ' + c.prio.length + ', weitere ' + c.rest.length + ': ' + c.rest.slice(0, 8).map(x => x.name).join(', '));
}
console.log('flug: ' + n + ' Prüfungen bestanden');
