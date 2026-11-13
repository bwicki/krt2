/* krt2.wicki.aero – Gebiet und Vorschlag: Formen (Kreis, Rechteck, Vieleck, Korridor), Schnitt mit Lufträumen,
   Höhenband, Flugplätze mit Rand, Kurzname/Klartext, Entdoppeln. Reine Logik ohne DOM (Browser: window.KRT2AREA). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.KRT2AREA = factory(root.KRT2MODEL);
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  const KM_LAT = 110.574, KM_LON = 111.320;

  // ---------- Projektion (lokal, km) ----------
  function projector(lat0, lon0) {
    const c = Math.cos(lat0 * Math.PI / 180);
    return { to: (lat, lon) => [(lon - lon0) * KM_LON * c, (lat - lat0) * KM_LAT], from: (x, y) => [lat0 + y / KM_LAT, lon0 + x / (KM_LON * c)] };
  }
  const hyp = Math.hypot;
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return hyp(px - ax - t * dx, py - ay - t * dy);
  }
  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function ringDist(x, y, ring) { let d = Infinity; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) d = Math.min(d, segDist(x, y, ring[j][0], ring[j][1], ring[i][0], ring[i][1])); return d; }
  function segCross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }

  // ---------- Formen ----------
  /** Korridor: Punkte ab Startort; Breite links/rechts gehört zum Schenkel, der im Punkt endet. */
  function shape(area, P) {
    if (!area) return null;
    if (area.typ === 'kreis') {
      const [cx, cy] = P.to(area.lat, area.lon), r = Math.max(0.1, +area.r || 0);
      const ring = Array.from({ length: 72 }, (_, i) => [cx + r * Math.cos(i * Math.PI / 36), cy + r * Math.sin(i * Math.PI / 36)]);
      return { ring, samples: ring.concat([[cx, cy]]), inside: (x, y) => hyp(x - cx, y - cy) <= r, dist: (x, y) => Math.max(0, hyp(x - cx, y - cy) - r), along: () => null };
    }
    if (area.typ === 'rechteck' || area.typ === 'vieleck') {
      const pts = area.typ === 'rechteck' ? [[area.s, area.w], [area.s, area.e], [area.n, area.e], [area.n, area.w]] : (area.pts || []);
      if (pts.length < 3) return null;
      const ring = pts.map(([la, lo]) => P.to(la, lo));
      return { ring, samples: ring, inside: (x, y) => inRing(x, y, ring), dist: (x, y) => (inRing(x, y, ring) ? 0 : ringDist(x, y, ring)), along: () => null };
    }
    if (area.typ === 'korridor') {
      const pts = (area.pts || []).map(p => ({ xy: P.to(p.lat, p.lon), l: Math.max(0, +p.l || 0), r: Math.max(0, +p.r || 0) }));
      if (pts.length < 2) return null;
      const legs = [];
      let cum = 0;
      for (let i = 1; i < pts.length; i++) {
        const A = pts[i - 1].xy, B = pts[i].xy, L = hyp(B[0] - A[0], B[1] - A[1]) || 1e-6;
        const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], n = [-u[1], u[0]];
        const wl = pts[i].l, wr = pts[i].r;
        const corners = [[A[0] + n[0] * wl, A[1] + n[1] * wl], [B[0] + n[0] * wl, B[1] + n[1] * wl], [B[0] - n[0] * wr, B[1] - n[1] * wr], [A[0] - n[0] * wr, A[1] - n[1] * wr]];
        legs.push({ A, B, L, u, n, wl, wr, corners, cum }); cum += L;
      }
      const joints = [];
      for (let i = 0; i < legs.length - 1; i++) joints.push({ c: legs[i].B, r: Math.max(legs[i].wl, legs[i].wr, legs[i + 1].wl, legs[i + 1].wr) });
      const legFrame = (g, x, y) => { const px = x - g.A[0], py = y - g.A[1]; return [px * g.u[0] + py * g.u[1], px * g.n[0] + py * g.n[1]]; };
      const legDist = (g, x, y) => { const [t, s] = legFrame(g, x, y); return hyp(Math.max(0, -t, t - g.L), Math.max(0, -g.wr - s, s - g.wl)); };
      const dist = (x, y) => Math.max(0, Math.min(...legs.map(g => legDist(g, x, y)), ...joints.map(j => hyp(x - j.c[0], y - j.c[1]) - j.r)));
      const along = (x, y) => {
        let best = null, bd = Infinity;
        for (const g of legs) { const [t] = legFrame(g, x, y); const d = segDist(x, y, g.A[0], g.A[1], g.B[0], g.B[1]); if (d < bd) { bd = d; best = g.cum + Math.max(0, Math.min(g.L, t)); } }
        return best;
      };
      const samples = pts.map(p => p.xy).concat(...legs.map(g => g.corners));
      return { legs, joints, samples, edges: legs.flatMap(g => g.corners.map((c, i) => [c, g.corners[(i + 1) % 4]])), inside: (x, y) => dist(x, y) === 0, dist, along, length: cum };
    }
    return null;
  }
  function edgesOf(S) { return S.edges || S.ring.map((c, i) => [c, S.ring[(i + 1) % S.ring.length]]); }
  /** Begrenzungsrechteck des Gebiets in Grad (für Vorauswahl und Länderwahl), erweitert um marginKm. */
  function bboxOf(area, P, marginKm) {
    const S = shape(area, P); if (!S) return null;
    const pts = S.samples.concat(S.legs ? S.legs.flatMap(g => g.corners) : []);
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [x, y] of pts) { const [la, lo] = P.from(x, y); w = Math.min(w, lo); e = Math.max(e, lo); s = Math.min(s, la); n = Math.max(n, la); }
    const m = marginKm || 0, c = Math.cos((s + n) / 2 * Math.PI / 180);
    return [w - m / (KM_LON * c), s - m / KM_LAT, e + m / (KM_LON * c), n + m / KM_LAT];
  }
  const bbHit = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

  // ---------- Luftraum ----------
  function polysOf(g) { if (!g) return []; return g.t === 'M' ? g.c.map(p => p[0]) : [g.c[0]]; }
  function intersects(S, rings) {
    for (const ring of rings) {
      if (ring.some(([x, y]) => S.inside(x, y))) return true;
      if (S.samples.some(([x, y]) => inRing(x, y, ring))) return true;
      const ed = edgesOf(S);
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) for (const [a, b] of ed) if (segCross(ring[j], ring[i], a, b)) return true;
    }
    return false;
  }
  /** Grenze in ft (ungefähr): FL × 100, m × 3.28; GND = 0. */
  function altFt(lim) {
    if (!lim) return null;
    const v = Number(lim.v) || 0;
    return lim.u === 6 ? v * 100 : lim.u === 0 ? v * 3.2808 : v;
  }
  /** Eingabe des Höhenbands: GND, FL 195, 5000 ft, 1500 m, UNL. */
  function parseAlt(s) {
    const t = String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
    if (!t || t === 'GND' || t === 'SFC') return 0;
    if (t === 'UNL') return Infinity;
    let m;
    if ((m = /^FL(\d{1,3})$/.exec(t))) return +m[1] * 100;
    if ((m = /^(\d+)(FT)?(MSL|AMSL|AGL)?$/.exec(t))) return +m[1];
    if ((m = /^(\d+)M(MSL|AMSL|AGL)?$/.exec(t))) return Math.round(+m[1] * 3.2808);
    return NaN;
  }

  // ---------- Namen ----------
  const plainU = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const normPlace = s => plainU(s).replace(/AE/g, 'A').replace(/OE/g, 'O').replace(/UE/g, 'U').replace(/[^A-Z]/g, '');
  const title = s => String(s || '').toLowerCase().replace(/(^|[\s\-/(])([a-zäöüéèàç])/g, (m, a, b) => a + b.toUpperCase());
  const SVC_WORD = /^(RADAR|RDR|TERMINAL|APPROACH|APP|ARRIVAL|ARR|DEPARTURE|DEP|TOWER|TWR|GROUND|GND|DELIVERY|DEL|INFORMATION|INFO|FIS|CONTROL|CENTER|CENTRE|ACC|RADIO|RDO|ATIS|AFIS|VOLMET|GLIDER|GLIDING|GLD|APRON|APN)$/;
  const QUAL = { EAST: 'E', OST: 'E', WEST: 'W', NORTH: 'N', NORD: 'N', SOUTH: 'S', SUED: 'S', SUD: 'S', E: 'E', W: 'W', N: 'N', S: 'S' };
  const NAME_SVC = [[/^ATIS$/, 'ATIS'], [/^AFIS$/, 'AFIS'], [/^VOLMET$/, 'VOLMET'], [/^(RADAR|RDR)$/, 'RDR'], [/^(TERMINAL|APPROACH|APP)$/, 'APP'], [/^(ARRIVAL|ARR)$/, 'ARR'],
    [/^(DEPARTURE|DEP)$/, 'DEP'], [/^(TOWER|TWR)$/, 'TWR'], [/^(GROUND|GND)$/, 'GND'], [/^(DELIVERY|DEL)$/, 'DEL'], [/^(APRON|APN)$/, 'APN'], [/^(INFORMATION|INFO|FIS)$/, 'INFO'],
    [/^(CONTROL|CENTER|CENTRE|ACC)$/, 'ACC'], [/^(RADIO|RDO)$/, 'RDO'], [/^(GLIDER|GLIDING|GLD)$/, 'GLD']];
  function svcFromName(n) { for (const w of plainU(n).split(/[\s/\-()]+/)) for (const [re, s] of NAME_SVC) if (re.test(w)) return s; return null; }
  const REGIONAL = new Set(['FIS', 'INFO', 'RDR', 'ACC', 'VOLMET', 'APP', 'ARR', 'DEP']);
  // Namen säubern: «HAUSEN AM ALBIS "R"» → «HAUSEN AM ALBIS»; Luftraum-Kennung vorne weg: «LSR72T BOHLHOF» → «BOHLHOF»
  const cleanName = s => String(s || '').replace(/\s*"[^"]*"/g, '').replace(/\s*\((?:en|ge|fr|it|de)(?:,\s*\w+)*\)/gi, '').replace(/^[A-Z]{2}[RDP]\d+\w*\s+/i, '').trim();
  const SVC_MAP = { MCOM: 'OTH', AIRMET: 'OTH', LGT: 'OTH', AWOS: 'ATIS' };
  const AD_SVC = new Set(['AFIS', 'RDO', 'CTAF', 'UCOM', 'INFO']);
  const RADAR_SVC = new Set(['RDR', 'ACC', 'MIL']);
  function mapSvc(s, services) { const x = SVC_MAP[s] || s || 'OTH'; return services.includes(x) ? x : 'OTH'; }
  function svcLabel(s, atAd) { return atAd && AD_SVC.has(s) ? 'AD' : (M.svcShort(s) || s); }
  /** Rufname zerlegen: «ZUERICH RADAR EAST» → Ort ZUERICH, Zusatz E. */
  function splitCall(n) {
    const w = plainU(cleanName(n)).replace(/[()]/g, ' ').split(/[\s/\-]+/).filter(Boolean);
    const i = w.findIndex(x => SVC_WORD.test(x));
    const place = (i > 0 ? w.slice(0, i) : i === 0 ? [] : w).join(' ');
    const rest = i >= 0 ? w.slice(i + 1) : [];
    const qual = rest.map(x => QUAL[x] || ((/^M?(\d)$/.exec(x) || [])[1] || '')).join('').slice(0, 1);
    return { place, rest: rest.join(' '), words: i >= 0 ? w.slice(i) : [], qual };
  }
  /** Zusatz für den Klartext: Wörter nach dem Ort ohne das Wort des Dienstes selbst («DEP-ATIS» → «DEP», «Approach (Final)» → «Final»). */
  function extraText(call, dienst) {
    const same = s => s === dienst || (s === 'INFO' && dienst === 'FIS') || (s === 'FIS' && dienst === 'INFO');
    const w = (call.words || []).filter(x => { const s2 = svcFromName(x); return !(s2 && same(s2)); }).map(x => (svcFromName(x) ? (M.svcShort(svcFromName(x)) || x) : title(x)));
    return w.length && w.length <= 3 ? ' ' + w.join(' ') : '';
  }

  // ---------- Vorschlag ----------
  /**
   * data: [freq-<cc>.json …]; opt: { area, standort:{lat,lon}, bandLo, bandHi, radarNoLimit, marginKm, services }.
   * Ergebnis: { entries:[Teile für M.addEntry], stats, layers:{ airports, airspaces } }.
   */
  function propose(data, opt) {
    const st = opt.standort && opt.standort.lat != null ? opt.standort : null;
    const area = opt.area;
    const c0 = st || (area && area.typ === 'kreis' ? area : null) || (area && area.pts && area.pts[0]) || { lat: (area.s + area.n) / 2, lon: (area.w + area.e) / 2 };
    const P = projector(c0.lat, c0.lon);
    const S = shape(area, P);
    if (!S) throw new Error('Gebiet unvollständig');
    const margin = Math.max(0, +opt.marginKm || 0);
    const bb = bboxOf(area, P, margin);
    const services = opt.services || M.SERVICES;
    const bandLo = isNaN(opt.bandLo) ? 0 : opt.bandLo, bandHi = isNaN(opt.bandHi) ? Infinity : opt.bandHi;
    const sxy = st ? P.to(st.lat, st.lon) : null;
    const byPlace = new Map();
    for (const d of data) for (const a of d.airports || []) if (a.iata) { const k = normPlace(a.name.split(/[\s\-/]/)[0]); if (k && !byPlace.has(k)) byPlace.set(k, { iata: a.iata, name: a.name, cc: String(d.cc || '').toUpperCase() }); }
    const out = [], byCh = new Map();
    const stats = { airports: 0, airspaces: 0, freqs: 0, invalid: 0, outsideBand: 0 };
    const layers = { airports: [], airspaces: [] };
    const srcName = s => (s === 'oa' ? 'OurAirports' : 'openAIP');
    const seenAd = new Set();

    for (const d of data) for (const a of d.airports || []) {
      if (a.t === 8 || a.t === 4 || a.t === 7 || a.lat == null || seenAd.has(a.icao || a.id)) continue;   // geschlossen, Heliports
      if (a.lon < bb[0] || a.lon > bb[2] || a.lat < bb[1] || a.lat > bb[3]) continue;
      const [x, y] = P.to(a.lat, a.lon);
      const dd = S.dist(x, y);
      const valid = a.f.filter(f => f.ch);
      if (!a.f.length) continue;
      const inArea = dd <= margin;
      layers.airports.push({ lat: a.lat, lon: a.lon, name: title(a.name), icao: a.icao, in: inArea && valid.length > 0 });
      if (!inArea) continue;
      seenAd.add(a.icao || a.id);
      stats.airports++; stats.invalid += a.f.length - valid.length;
      const adName = title(cleanName(a.name)), adKey = normPlace(cleanName(a.name).split(/[\s\-/]/)[0]);
      for (const f of valid) {
        let dienst = mapSvc(f.s, services);
        if (dienst === 'OTH') { const s2 = svcFromName(f.n); if (s2) dienst = mapSvc(s2, services); }
        const call = splitCall(f.n);
        const pk = normPlace(call.place.split(' ')[0]);
        const foreign = REGIONAL.has(dienst) && pk && pk !== adKey;            // z. B. «Zurich Information» bei Birrfeld
        const hit = foreign ? byPlace.get(pk) : null;
        const CC = String(d.cc || '').toUpperCase();
        const ort = foreign ? { icao: '', iata: hit ? hit.iata : '', code: hit ? hit.iata : M.locCode(call.place), qual: call.qual, name: hit ? title(hit.name) : title(call.place), cc: hit ? hit.cc : CC }
          : { icao: a.icao || '', iata: a.iata || '', code: a.iata || M.locCode(cleanName(a.name)), qual: call.qual, name: adName, cc: CC };
        const key = REGIONAL.has(dienst) ? 'R|' + f.ch + '|' + dienst : 'L|' + f.ch + '|' + (a.icao || a.id);
        const notes = [];
        if (f.alt && f.alt.ch && f.alt.ch !== f.ch) notes.push('OurAirports: ' + f.alt.ch + ' (25-kHz-Angabe derselben Frequenz)');
        if (f.note) notes.push(f.note);
        if (byCh.has(key)) { const e0 = byCh.get(key); for (const q of f.src.map(srcName)) if (!e0.quellen.includes(q)) e0.quellen.push(q); if (e0.quellen.length > 1) e0.vertrauen = 'g'; continue; }
        const rest = extraText(call, dienst);
        const e = { ch: f.ch, dienst, klar: ort.name + ' ' + svcLabel(dienst, !foreign) + rest, ort, quellen: f.src.map(srcName), vertrauen: f.src.length > 1 ? 'g' : 'y', note: notes.join(' · '),
          dist: foreign ? 0 : sxy ? Math.round(hyp(x - sxy[0], y - sxy[1])) : null, along: foreign ? 0 : S.along(x, y), kurzModus: opt.adLoc === 'icao' && !foreign ? 'icao' : 'kurz' };
        byCh.set(key, e); (byCh.get(f.ch) || byCh.set(f.ch, []).get(f.ch)).push(e); out.push(e); stats.freqs++;
      }
    }

    for (const d of data) for (const s of d.airspaces || []) {
      if (!s.f || !s.f.length || !s.bb || !bbHit(s.bb, bb)) continue;
      const lo = altFt(s.lo), hi = altFt(s.hi);
      const rings = polysOf(s.g).map(r => r.map(([lon, lat]) => P.to(lat, lon)));
      if (!rings.length || !intersects(S, rings)) continue;
      let used = false;
      for (const f of s.f) {
        if (!f.ch) { stats.invalid++; continue; }
        const dienst = mapSvc(f.s, services);
        const radar = RADAR_SVC.has(dienst) && opt.radarNoLimit;
        if (!((lo == null || lo <= bandHi || radar) && (hi == null || hi >= bandLo))) { stats.outsideBand++; continue; }
        used = true;
        const same = (byCh.get(f.ch) || []);
        if (same.length) { for (const e of same) { if (!e.quellen.includes('Luftraum ' + s.name)) e.quellen.push('Luftraum ' + s.name); e.vertrauen = 'g'; } continue; }
        const aspPlace = cleanName(s.name.replace(/^(CTR|TMA|CTA|FIR|UIR|RMZ|TMZ|ATZ|TIZ|TIA|FIS|ACC|AWY)\s+/i, ''));
        let call = splitCall(f.n || aspPlace);
        if (!call.place) call = Object.assign({}, call, { place: plainU(aspPlace).split(/\s+/)[0] || '' });
        const placeKey = normPlace(call.place.split(' ')[0]);
        const hitAd = byPlace.get(placeKey);
        const code = hitAd ? hitAd.iata : M.locCode(call.place || s.name);
        const placeName = hitAd ? title(hitAd.name) : title(call.place || s.name);
        const inside = sxy && rings.some(r => inRing(sxy[0], sxy[1], r));
        const distKm = sxy ? (inside ? 0 : Math.round(Math.min(...rings.map(r => ringDist(sxy[0], sxy[1], r))))) : null;
        const alongs = rings.flatMap(r => r.filter(([x, y]) => S.inside(x, y)).map(([x, y]) => S.along(x, y))).filter(v => v != null);
        const e = { ch: f.ch, dienst, klar: (placeName + ' ' + svcLabel(dienst, false) + extraText(call, dienst)).trim(),
          ort: { icao: '', iata: hitAd ? hitAd.iata : '', code, qual: call.qual, name: placeName, cc: hitAd ? hitAd.cc : String(d.cc || '').toUpperCase() }, quellen: ['openAIP', 'Luftraum ' + s.name], vertrauen: 'y',
          note: [f.note, f.n ? '' : 'Rufname fehlt, Dienst aus dem Luftraumtyp'].filter(Boolean).join(' · '), dist: distKm, along: alongs.length ? Math.min(...alongs) : null, kurzModus: 'kurz' };
        byCh.set(f.ch, [e]); out.push(e); stats.freqs++;
      }
      if (used) { stats.airspaces++; layers.airspaces.push({ name: s.name, t: s.t, rings: polysOf(s.g).map(r => r.map(([lon, lat]) => [lat, lon])) }); }
    }
    return { entries: out, stats, layers, bbox: bb };
  }

  /** Vorschlag in die Konfiguration übernehmen: eigene Einträge bleiben, frühere Vorschläge werden ersetzt. */
  function applyProposal(cfg, entries) {
    cfg.eintraege = cfg.eintraege.filter(e => (e.quellen || []).includes('eigen'));
    for (const p of entries) M.addEntry(cfg, Object.assign({ aktiv: true }, p));
    for (const b of cfg.bloecke) M.sortBlock(cfg, b.id);
    return cfg;
  }

  /** Länder, deren Datenrechteck das Gebiet berührt (index.json der Frequenzdaten). */
  function countriesFor(index, bbox) {
    const want = [];
    for (let la = Math.floor(bbox[1]); la <= Math.floor(bbox[3]); la++) for (let lo = Math.floor(bbox[0]); lo <= Math.floor(bbox[2]); lo++) want.push(la + ',' + lo);
    return (index.countries || []).filter(c => c.bbox && bbHit(c.bbox, bbox) && (!c.cells || want.some(k => c.cells.includes(k)))).map(c => c.cc);
  }

  return { projector, shape, bboxOf, intersects, altFt, parseAlt, splitCall, propose, applyProposal, countriesFor, inRing, title, normPlace };
});
