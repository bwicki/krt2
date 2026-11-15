/* krt2.wicki.aero – Im Flug (0.6.0, Konzept Bluetooth-Brücke, Phase 3).
   Fahrtrichtung aus der GPS-Spur, Vorausschau-Sektor (Vorgabe ±40°, 100 km), Vorschlag je Block (INFO, AD/TWR, RADAR) und
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

  /** Namen, unter denen ein Block im Gerätestand stehen kann (aktueller Name und frühere, z. B. «APP/TWR» → «AD/TWR»). */
  const blockNames = b => new Set([b.name].concat(b.alias || []));
  /** Plätze eines Blocks im Gerätestand, aufsteigend. */
  const slotsOf = (device, b) => { const n = blockNames(b); return (device || []).filter(p => p && p.kind !== 'fixed' && n.has(p.block)).sort((x, y) => x.nr - y.nr); };

  /**
   * Plan für einen Block. device = Gerätestand (100 Plätze, mit .block beim Programmieren aus der App), entries = Vorschlag
   * aus A.propose (mit .dist ab der Position).
   * - Der Block behält seine Grösse: was schon passt, bleibt auf seinem Platz; frei werdende Plätze bekommen die
   *   nächstgelegenen neuen Stationen; Plätze ohne Ersatz werden FREE (0.6.2).
   * - Findet sich keine Frequenz für den Block, fällt er weg und die folgenden Plätze rücken nach (0.6.4).
   * - Steht der Block nicht (mehr) im Gerät und gibt es wieder Frequenzen, wird er an seiner Stelle wieder eingefügt –
   *   mit der Grösse aus der Konfiguration – und die folgenden Plätze rücken nach hinten.
   * Feste Plätze und Frequenzen, die ausserhalb des Blocks schon im Gerät stehen, bleiben unberührt.
   * Ergebnis { nrs, keep, changes:[{ nr, old, neu, name }], after, seq, cand, chosen, mode, dropped }.
   */
  function planBlock(o) {
    const { cfg, block, entries } = o;
    const L = o.layout || M.layout(cfg);
    const LAST = M.LAST_SLOT || 98;
    const key = ch => M.freqKey(ch);
    const fr = Object.assign({ ch: '118.000', kurz: 'FREE' }, (cfg.settings && cfg.settings.free) || {});
    const isFree = p => !p || (key(p.ch) === key(fr.ch) && String(p.name || '').trim() === fr.kurz);
    const nameById = id => { const b = cfg.bloecke.find(x => x.id === id); return b ? b.name : ''; };
    let dev = (o.device || []).slice();
    // Gerätestand ohne Blocknamen (z. B. ausgelesen): Blöcke aus der Konfiguration übernehmen, wo der Inhalt passt
    if (!dev.some(p => p && p.block)) dev = dev.map(p => { const s = p && L.slots[p.nr]; return s && s.block && key(s.ch) === key(p.ch) ? Object.assign({}, p, { block: nameById(s.block) }) : p; });
    const fixed = new Set(dev.filter(p => p && p.kind === 'fixed').map(p => p.nr).concat(L.slots.filter(x => x && x.kind === 'fixed').map(x => x.nr)));
    const seq = []; for (let n = 0; n <= LAST; n++) if (!fixed.has(n)) seq.push(n);
    const cur = slotsOf(dev, block).filter(p => p.nr <= LAST);
    const curNr = new Set(cur.map(p => p.nr));
    const outside = new Set(dev.filter(p => p && !curNr.has(p.nr)).map(p => key(p.ch)).filter(Boolean));
    const svc = new Set(block.svc || []);
    const cand = entries.filter(e => svc.has(e.dienst)).sort((a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist));
    const planned = ((L.ranges || []).find(r => r.block === block.id) || { nrs: [] }).nrs.length;
    const size = cur.length || planned || block.max || Math.min(10, cand.length);
    const chosen = [], seen = new Set();
    for (const e of cand) {
      const k = key(e.ch);
      if (!k || outside.has(k) || seen.has(k)) continue;
      seen.add(k); chosen.push(e);
      if (chosen.length >= size) break;
    }
    const slotOf = (e) => ({ ch: e.ch, name: nameOf(cfg, e), klar: e.klar || '', dienst: e.dienst, block: block.name, kind: 'entry', cc: e.ort && e.ort.cc ? e.ort.cc : '', _e: e });
    const freeSlot = (blk) => ({ ch: fr.ch, name: fr.kurz, klar: '', dienst: '', block: blk || null, kind: 'free', _free: true });
    // neuer Inhalt des Blocks (Länge = Blockgrösse; leer, wenn nichts gefunden)
    let content = [];
    if (chosen.length) {
      const want = new Map(chosen.map(e => [key(e.ch), e]));
      const placed = new Set();
      content = new Array(size).fill(null);
      if (cur.length) cur.forEach((p, i) => { const k = key(p.ch); if (k && want.has(k) && !placed.has(k)) { content[i] = { keep: p }; placed.add(k); } });
      const todo = chosen.filter(e => !placed.has(key(e.ch)));
      for (let i = 0; i < size; i++) if (!content[i]) content[i] = todo.length ? slotOf(todo.shift()) : freeSlot(block.name);
    }
    const after = dev.map(p => (p ? Object.assign({}, p) : p));
    let mode = 'block', dropped = [];
    if (cur.length && content.length === cur.length) {
      cur.forEach((p, i) => { const c = content[i]; after[p.nr] = c.keep ? Object.assign({}, p, { block: block.name }) : Object.assign({ nr: p.nr }, c); });
    } else if (cur.length || content.length) {
      // Block fällt weg oder kommt wieder: ab seiner Stelle rücken die folgenden Plätze nach vorne bzw. nach hinten
      mode = content.length ? 'insert' : 'drop';
      let p0;
      if (cur.length) p0 = seq.indexOf(cur[0].nr);
      else {
        const later = new Set(); let past = false;
        for (const b of cfg.bloecke) { if (b.id === block.id) { past = true; continue; } if (past && b.on) blockNames(b).forEach(n => later.add(n)); }
        p0 = seq.findIndex(n => dev[n] && later.has(dev[n].block));
        if (p0 < 0) { let lastUsed = -1; seq.forEach((n, i) => { if (dev[n] && (dev[n].block || !isFree(dev[n]))) lastUsed = i; }); p0 = lastUsed + 1; }
      }
      let tail = seq.slice(p0).map(n => dev[n]).filter(p => p && !curNr.has(p.nr));
      while (tail.length && !tail[tail.length - 1].block && isFree(tail[tail.length - 1])) tail.pop();   // Füller am Ende
      const items = content.map(c => (c.keep ? Object.assign({}, c.keep, { block: block.name }) : c)).concat(tail.map(p => Object.assign({}, p, { _from: p.nr })));
      const room = seq.length - p0;
      dropped = items.slice(room).filter(x => !x._free);
      for (let i = 0; i < room; i++) { const n = seq[p0 + i], it = items[i]; after[n] = Object.assign({}, it || freeSlot(null), { nr: n }); }
    }
    const changes = [];
    for (const n of seq) {
      const a = after[n], d = dev[n];
      if (!a) continue;
      if (d && key(d.ch) === key(a.ch) && String(d.name || '').trim() === String(a.name || '').trim()) continue;
      const neu = a._e ? a._e : a._free ? { ch: a.ch, dienst: '', klar: '', dist: null, ort: {}, frei: true }
        : { ch: a.ch, dienst: a.dienst || '', klar: a.klar || '', dist: null, ort: { cc: a.cc || '' }, moved: true, from: a._from, block: a.block || '' };
      changes.push({ nr: n, old: d || null, neu, name: String(a.name || '').trim(), block: a.block || '' });
    }
    for (const n of seq) if (after[n]) { delete after[n]._e; delete after[n]._free; delete after[n]._from; }
    const nrs = seq.filter(n => after[n] && after[n].block === block.name);
    const keep = nrs.filter(n => !changes.some(c => c.nr === n) && !isFree(after[n]));   // Frequenzen, die auf ihrem Platz bleiben
    return { nrs, keep, changes, after, seq, cand: cand.length, chosen: chosen.length, mode, dropped };
  }

  /** Schreibliste für Link.program. */
  const writeList = plan => plan.changes.map(c => ({ nr: c.nr, ch: c.neu.ch, name: c.name }));

  /** Neuer Gerätestand: quittierte Änderungen übernehmen, Blocknamen nachführen. res = { nr: { kind } }. */
  function applyPlan(plaetze, plan, block, res) {
    const out = plaetze.map(p => (p ? Object.assign({}, p) : p));
    const changed = new Map(plan.changes.map(c => [c.nr, c]));
    for (const n of plan.seq || []) {
      const a = plan.after && plan.after[n];
      if (!a) continue;
      if (changed.has(n)) { if (res[n] && res[n].kind === 'ACK') out[n] = Object.assign({}, a, { nr: n }); }
      else if (out[n]) out[n].block = a.block === undefined ? out[n].block : a.block;
    }
    return out;
  }

  /** Fluglog-Zeilen für eine geschriebene Änderung. */
  function logRows(plan, block, res, pos, when) {
    const z = (when || new Date()).toISOString();
    return plan.changes.map(c => ({
      zeit: z, lat: pos ? Math.round(pos.lat * 1e5) / 1e5 : null, lon: pos ? Math.round(pos.lon * 1e5) / 1e5 : null, block: c.block || block.name, nr: c.nr,
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

  return { distKm, bearing, track, sectorArea, planBlock, writeList, applyPlan, logRows, logCsv, compass, blockNames, slotsOf };
});
