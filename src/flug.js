/* krt2.wicki.aero – Im Flug (0.6.0, Konzept Bluetooth-Brücke, Phase 3; rollender Bereich ab 0.8.0).
   Fahrtrichtung aus der GPS-Spur, Vorausschau-Sektor (Vorgabe ±40°, 100 km), Vorschlagsliste (INFO und FIS zuerst, nach
   Distanz) und Zielplätze im rollenden Bereich (Vorgabe 75–95, ohne Blöcke, der Reihe nach). Plätze ausserhalb bleiben
   unberührt. Reine Logik ohne DOM (Browser: window.KRT2FLUG). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'), require('./area.js'), require('./krt2codec.js'));
  else root.KRT2FLUG = factory(root.KRT2MODEL, root.KRT2AREA, root.KRT2CODEC);
})(typeof self !== 'undefined' ? self : this, function (M, A, C) {
  'use strict';
  const R_EARTH = 6371;
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;

  function distKm(a, b) {
    const dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  /** Anfangskurs von a nach b in Grad (0 = Nord, 90 = Ost). */
  function bearing(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }

  /**
   * Fahrtrichtung und Geschwindigkeit aus der GPS-Spur [{ t (ms), lat, lon }]: vom jüngsten Punkt, der mindestens
   * minKm (300 m) zurückliegt und nicht älter als maxMin (10 min) ist, bis zur aktuellen Position. Ein Ballon ist langsam,
   * der Kurs des GPS-Empfängers bei wenig Fahrt unbrauchbar – darum die Strecke über einige Minuten.
   */
  function track(hist, opt) {
    const o = Object.assign({ minKm: 0.3, maxMin: 10 }, opt || {});
    const last = hist && hist[hist.length - 1];
    if (!last) return null;
    for (let i = hist.length - 2; i >= 0; i--) {
      const p = hist[i];
      if (last.t - p.t > o.maxMin * 60000) break;
      const d = distKm(p, last);
      if (d >= o.minKm) return { bearing: Math.round(bearing(p, last)), kmh: Math.round(d / ((last.t - p.t) / 3600000) * 10) / 10, km: d, from: p };
    }
    return { bearing: null, kmh: null, km: 0, from: null };
  }

  /** Vorausschau als Gebiet für A.propose: Sektor ab der Position (Spitze) oder – ohne Richtung – Kreis. */
  function sectorArea(pos, brg, half, km) {
    const r = Math.max(1, +km || 100);
    if (brg == null || isNaN(brg) || !(half > 0) || half >= 180) return { typ: 'kreis', lat: pos.lat, lon: pos.lon, r };
    const P = A.projector(pos.lat, pos.lon), pts = [[pos.lat, pos.lon]];
    const step = Math.min(5, (2 * half) / 8);
    for (let a = brg - half; a <= brg + half + 1e-9; a += step) {
      const [la, lo] = P.from(r * Math.sin(rad(a)), r * Math.cos(rad(a)));
      pts.push([la, lo]);
    }
    return { typ: 'vieleck', pts };
  }

  const nameOf = (cfg, e) => C.normalizeName(M.entryShort(e), cfg.settings.allowDigits, cfg.settings.allowLower !== false).trimmed;

  const PRIO = ['INFO', 'FIS'];
  const byDist = (a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist);
  const freeOf = cfg => { const fr = Object.assign({ ch: '118.000', kurz: 'FREE' }, (cfg.settings && cfg.settings.free) || {}); return p => !p || (M.freqKey(p.ch) === M.freqKey(fr.ch) && String(p.name || '').trim() === fr.kurz); };

  /**
   * Rollender Bereich (0.8.0): Plätze von–bis aus den Einstellungen (Vorgabe 75–95), ohne feste Plätze (weitere feste
   * Plätze der Konfiguration oder im Gerät als fest markierte). Im Flug wird nur hier geschrieben, ohne Blöcke.
   */
  function rollSlots(cfg, device) {
    const devFixed = new Set((device || []).filter(p => p && p.kind === 'fixed').map(p => p.nr));
    return M.rollRange(cfg).filter(n => !devFixed.has(n));
  }

  /**
   * Vorschlagsliste aus A.propose (Einträge mit .dist ab der Position): je Frequenz die nächstgelegene Station, ohne
   * Frequenzen, die schon irgendwo im Gerät stehen; INFO und FIS zuerst, dann alle übrigen, beide nach zunehmender Distanz.
   * Ergebnis { prio:[item], rest:[item], inDevice }; item = { k, ch, name, klar, dienst, dist, cc }.
   */
  function rollCands(cfg, entries, device) {
    const key = M.freqKey, best = new Map();
    for (const e of entries || []) { const k = key(e.ch); if (!k) continue; const b = best.get(k); if (!b || byDist(e, b) < 0) best.set(k, e); }
    const all = Array.from(best.values()).sort(byDist);
    const inDev = new Set((device || []).filter(Boolean).map(p => key(p.ch)).filter(Boolean));
    const items = all.filter(e => !inDev.has(key(e.ch))).map(e => ({ k: key(e.ch), ch: e.ch, name: nameOf(cfg, e), klar: e.klar || '', dienst: e.dienst || '', dist: e.dist == null ? null : e.dist, cc: e.ort && e.ort.cc ? e.ort.cc : '' }));
    return { prio: items.filter(x => PRIO.includes(x.dienst)), rest: items.filter(x => !PRIO.includes(x.dienst)), inDevice: all.length - items.length };
  }

  /**
   * Nächster Platz im rollenden Bereich (Entscheid 16.11.2026: der Reihe nach). next = gespeicherter Zeiger; fehlt er oder
   * liegt er nicht mehr im Bereich, der erste freie Platz, sonst der erste Platz des Bereichs.
   */
  function rollStart(cfg, nrs, device, next) {
    if (!nrs.length) return null;
    if (next != null && nrs.includes(next)) return next;
    if (next != null) { const later = nrs.find(n => n > next); if (later != null) return later; }
    const isFree = freeOf(cfg), f = nrs.find(n => isFree((device || [])[n]));
    return f != null ? f : nrs[0];
  }
  /** Zielplätze für n neue Frequenzen: der Reihe nach ab dem Startplatz, nach dem letzten Platz wieder vorne. */
  function rollTargets(nrs, start, n) {
    if (!nrs.length || !(n > 0)) return [];
    const i0 = Math.max(0, nrs.indexOf(start));
    return nrs.slice(i0).concat(nrs.slice(0, i0)).slice(0, n);
  }
  /** Platz nach nr im Bereich (rundherum). */
  const rollAfter = (nrs, nr) => { if (!nrs.length) return null; const i = nrs.indexOf(nr); return nrs[(i + 1) % nrs.length]; };

  /** Schreibliste: Auswahl in Reihenfolge auf die Zielplätze. */
  const rollWriteList = (picks, targets) => picks.slice(0, targets.length).map((p, i) => ({ nr: targets[i], ch: p.ch, name: p.name, pick: p }));

  /** Neuer Gerätestand: quittierte Plätze übernehmen (Blockname ROLL). res = { nr: { kind } }. */
  function rollApply(plaetze, list, res) {
    const out = plaetze.map(p => (p ? Object.assign({}, p) : p));
    for (const w of list) {
      if (!(res[w.nr] && res[w.nr].kind === 'ACK')) continue;
      const p = w.pick || {};
      out[w.nr] = { nr: w.nr, ch: w.ch, name: w.name, klar: p.klar || '', dienst: p.dienst || '', cc: p.cc || '', block: M.ROLL_BLOCK, kind: 'entry' };
    }
    return out;
  }

  /** Fluglog-Zeilen für geschriebene Plätze. */
  function logRows(list, device, res, pos, when) {
    const z = (when || new Date()).toISOString();
    return list.map(w => {
      const d = (device || [])[w.nr];
      return { zeit: z, lat: pos ? Math.round(pos.lat * 1e5) / 1e5 : null, lon: pos ? Math.round(pos.lon * 1e5) / 1e5 : null, block: M.ROLL_BLOCK, nr: w.nr,
        alt: d ? { ch: d.ch, name: d.name || '' } : null, neu: { ch: w.ch, name: w.name, klar: (w.pick && w.pick.klar) || '' }, ok: !!(res[w.nr] && res[w.nr].kind === 'ACK') };
    });
  }
  function logCsv(rows) {
    const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    return ['Zeit;Lat;Lon;Block;Platz;Alt;Neu;Klartext;Quittiert'].concat(rows.map(r => [r.zeit, r.lat, r.lon, r.block, String(r.nr).padStart(2, '0'),
      r.alt ? r.alt.ch + ' ' + r.alt.name : '', r.neu.ch + ' ' + r.neu.name, r.neu.klar, r.ok ? 'ja' : 'nein'].map(q).join(';'))).join('\r\n');
  }

  /** Himmelsrichtung für die Anzeige (N, NNO, …). */
  function compass(b) {
    if (b == null) return '';
    const n = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return n[Math.round(((b % 360) + 360) % 360 / 22.5) % 16];
  }

  return { distKm, bearing, track, sectorArea, rollSlots, rollCands, rollStart, rollTargets, rollAfter, rollWriteList, rollApply, logRows, logCsv, compass, PRIO };
});
