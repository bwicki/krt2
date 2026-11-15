/* krt2.wicki.aero – Im Flug (0.6.0, Konzept Bluetooth-Brücke, Phase 3).
   Fahrtrichtung aus der GPS-Spur, Vorausschau-Sektor (Vorgabe ±40°, 100 km), Vorschlag je Block (INFO, RADAR) und
   Plan der zu schreibenden Plätze: was im Block schon passt, bleibt auf seinem Platz; frei werdende Plätze bekommen die
   nächstgelegenen neuen Stationen. Feste Plätze und Frequenzen, die ausserhalb des Blocks schon im Gerät stehen, bleiben
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

  /**
   * Plan für einen Block. device = Gerätestand (100 Plätze, mit .block beim Programmieren aus der App), entries = Vorschlag
   * aus A.propose (mit .dist ab der Position). Ergebnis { nrs, keep, changes:[{ nr, old, neu, name }], cand, chosen }.
   */
  function planBlock(o) {
    const { cfg, block, entries } = o;
    const dev = o.device || [];
    const L = o.layout || M.layout(cfg);
    const fixed = new Set(L.slots.filter(s => s && s.kind === 'fixed').map(s => s.nr));
    let nrs = dev.filter(p => p && p.block === block.name && p.kind !== 'fixed' && !fixed.has(p.nr)).map(p => p.nr);
    if (!nrs.length) nrs = L.slots.filter(s => s && s.block === block.id && s.kind !== 'fixed').map(s => s.nr);
    const key = ch => M.freqKey(ch);
    const inBlock = new Set(nrs);
    const outside = new Set(dev.filter(p => p && !inBlock.has(p.nr)).map(p => key(p.ch)).filter(Boolean));
    const svc = new Set(block.svc || []);
    const cand = entries.filter(e => svc.has(e.dienst)).sort((a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist));
    const chosen = [], seen = new Set();
    for (const e of cand) {
      const k = key(e.ch);
      if (!k || outside.has(k) || seen.has(k)) continue;
      seen.add(k); chosen.push(e);
      if (chosen.length >= nrs.length) break;
    }
    const want = new Map(chosen.map(e => [key(e.ch), e]));
    const keep = [], placed = new Set();
    for (const nr of nrs) {
      const p = dev[nr], k = p && key(p.ch);
      if (k && want.has(k) && !placed.has(k)) { keep.push(nr); placed.add(k); }
    }
    const todo = chosen.filter(e => !placed.has(key(e.ch)));
    const free = nrs.filter(nr => !keep.includes(nr));
    const changes = todo.slice(0, free.length).map((e, i) => ({ nr: free[i], old: dev[free[i]] || null, neu: e, name: nameOf(cfg, e) }));
    // 0.6.2: Plätze ohne Ersatz werden FREE (Entscheid Benutzer) – sofern nicht schon FREE
    const fr = Object.assign({ ch: '118.000', kurz: 'FREE' }, (cfg.settings && cfg.settings.free) || {});
    for (const nr of free.slice(todo.length)) {
      const p = dev[nr];
      if (p && key(p.ch) === key(fr.ch) && String(p.name || '').trim() === fr.kurz) continue;
      changes.push({ nr, old: p || null, neu: { ch: fr.ch, dienst: '', klar: '', dist: null, ort: {}, frei: true }, name: fr.kurz });
    }
    return { nrs, keep, changes, cand: cand.length, chosen: chosen.length };
  }

  /** Schreibliste für Link.program. */
  const writeList = plan => plan.changes.map(c => ({ nr: c.nr, ch: c.neu.ch, name: c.name }));

  /** Neuer Gerätestand: quittierte Änderungen übernehmen. res = { nr: { kind } }. */
  function applyPlan(plaetze, plan, block, res) {
    const out = plaetze.map(p => (p ? Object.assign({}, p) : p));
    for (const c of plan.changes) {
      if (!res[c.nr] || res[c.nr].kind !== 'ACK') continue;
      if (c.neu.frei) { out[c.nr] = { nr: c.nr, ch: c.neu.ch, name: c.name, klar: '', dienst: '', block: block.name, kind: 'free' }; continue; }
      out[c.nr] = { nr: c.nr, ch: c.neu.ch, name: c.name, klar: c.neu.klar || '', dienst: c.neu.dienst, block: block.name, kind: 'entry', cc: c.neu.ort && c.neu.ort.cc ? c.neu.ort.cc : '' };
    }
    return out;
  }

  /** Fluglog-Zeilen für eine geschriebene Änderung. */
  function logRows(plan, block, res, pos, when) {
    const z = (when || new Date()).toISOString();
    return plan.changes.map(c => ({
      zeit: z, lat: pos ? Math.round(pos.lat * 1e5) / 1e5 : null, lon: pos ? Math.round(pos.lon * 1e5) / 1e5 : null, block: block.name, nr: c.nr,
      alt: c.old ? { ch: c.old.ch, name: c.old.name || '' } : null, neu: { ch: c.neu.ch, name: c.name, klar: c.neu.klar || '' },
      ok: !!(res[c.nr] && res[c.nr].kind === 'ACK')
    }));
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

  return { distKm, bearing, track, sectorArea, planBlock, writeList, applyPlan, logRows, logCsv, compass };
});
