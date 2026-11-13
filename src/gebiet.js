/* krt2.wicki.aero – Seite «Gebiet»: Startort (Ortssuche mit Auswahlliste), Gebiet auf der OSM-Karte (Kreis, Rechteck,
   Vieleck, Korridor), Höhenband, Länder, Vorschlag aus den Frequenzdaten. Board «Gebiet». Leaflet liegt in lib/leaflet. */
(function (root) {
  'use strict';
  const DATA = 'https://raw.githubusercontent.com/bwicki/krt2/data/';
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&q=';
  const st = { map: null, lyArea: null, lyEdit: null, lyData: null, index: null, files: {}, hits: null, rectA: null, last: null };
  let X = null;   // Kontext aus app.js

  const t = (k, a) => X.t(k, a), esc = s => X.esc(s);
  const A = () => root.KRT2AREA, M = () => root.KRT2MODEL;
  const cfg = () => X.cfg;
  const fmt = (v, d = 3) => Number(v).toFixed(d);
  const cc2 = s => String(s || '').toUpperCase();

  function ensure() {
    const c = cfg();
    const a = c.settings.area || {};
    c.hoehe = Object.assign({ von: a.von || 'GND', bis: a.bis || 'FL195', radarOhneGrenze: !!a.radar }, c.hoehe || {});
    if (c.hoehe.marginKm == null) c.hoehe.marginKm = a.marginKm != null ? a.marginKm : 10;
    if (!c.gebiet) c.gebiet = { typ: 'kreis', r: 25, defL: 15, defR: 15, pts: [], poly: [] };
    if (!Array.isArray(c.gebiet.svcOff)) c.gebiet.svcOff = ['RDO'];   // Vorgabe: alle Dienste der Blöcke ausser RDO
    if (!c.gebiet) c.gebiet = { typ: 'kreis', r: 25, defL: 15, defR: 15, pts: [], poly: [] };
    const g = c.gebiet;
    if (g.defL == null) g.defL = 15; if (g.defR == null) g.defR = 15; if (!g.pts) g.pts = []; if (!g.poly) g.poly = [];
    return c;
  }
  const hasStart = () => cfg().standort && cfg().standort.lat != null;

  /** Gebiet für die Geometrie (area.js) aus dem gespeicherten Zustand. */
  function areaOf() {
    const c = cfg(), g = c.gebiet, s = c.standort;
    if (g.typ === 'kreis') return hasStart() ? { typ: 'kreis', lat: s.lat, lon: s.lon, r: +g.r || 25 } : null;
    if (g.typ === 'rechteck') return g.rect ? Object.assign({ typ: 'rechteck' }, g.rect) : null;
    if (g.typ === 'vieleck') return g.poly.length >= 3 ? { typ: 'vieleck', pts: g.poly.map(p => [p.lat, p.lon]) } : null;
    if (g.typ === 'korridor') return hasStart() && g.pts.length ? { typ: 'korridor', pts: [{ lat: s.lat, lon: s.lon }].concat(g.pts) } : null;
    return null;
  }

  // ---------- Seite ----------
  function render(ctx) {
    X = ctx; ensure();
    const page = document.getElementById('page');
    page.className = 'wide';
    page.innerHTML = `<div class="ge-layout"><aside class="card stack ge-aside" id="geaside"></aside>
<section class="ge-mapwrap"><div id="gemap" class="ge-map" role="application" aria-label="${esc(t('ge_map'))}"></div>
<div class="ge-legend small"><span><i class="lg ad"></i>${t('ge_lg_ad')}</span><span><i class="lg out"></i>${t('ge_lg_out')}</span><span><i class="lg asp"></i>${t('ge_lg_asp')}</span><span><i class="lg area"></i>${t('ge_lg_area')}</span></div>
<p class="note" id="gehint"></p></section></div>${X.footerNote()}`;
    aside();
    initMap();
    loadIndex();
  }

  function aside() {
    const c = cfg(), g = c.gebiet, h = c.hoehe, s = c.standort || {};
    const tool = (v, l) => `<button type="button" class="chip" data-ge="typ" data-v="${v}" aria-pressed="${g.typ === v}">${l}</button>`;
    const legs = g.typ === 'korridor' ? g.pts.map((p, i) => `<div class="ge-leg" data-i="${i}"><div class="row nowrap" style="gap:6px"><b class="mono">P${i + 1}</b><span class="small muted">${t('ge_leg', { a: i ? 'P' + i : 'S', b: 'P' + (i + 1) })}</span><span class="small mono muted">${fmt(p.lat)}, ${fmt(p.lon)}</span><button type="button" class="ghost" data-ge="ptdel" aria-label="P${i + 1} ×">✕</button></div>
  <div class="row nowrap" style="gap:6px"><span class="small">${t('ge_width')}</span><label class="small">${t('ge_left')} <input type="number" min="0" max="200" step="1" data-gf="l" value="${esc(p.l)}" style="width:64px"></label><label class="small">${t('ge_right')} <input type="number" min="0" max="200" step="1" data-gf="r" value="${esc(p.r)}" style="width:64px"></label><span class="small">km</span></div></div>`).join('') : '';
    const pts = g.typ === 'vieleck' ? `<p class="small muted" style="margin:0">${t('ge_poly_n', { n: g.poly.length })}</p>` : '';
    const ccs = st.index && areaOf() ? A().countriesFor(st.index, A().bboxOf(areaOf(), projector(), c.hoehe.marginKm)) : [];
    document.getElementById('geaside').innerHTML = `
<div class="label">1 · ${t('ge_start')}</div>
<form class="row nowrap" data-ge-form="search" style="gap:6px"><label class="sr" for="geq">${t('ge_search')}</label><input id="geq" type="search" placeholder="${esc(t('ge_search_ph'))}" value="${esc(st.q || '')}" style="flex:1;min-width:0"><button type="submit" class="sec">${t('ge_search')}</button></form>
<div id="gehits">${hitsHtml()}</div>
${hasStart() ? `<div class="row" style="gap:6px"><span class="badge g">S</span><b>${esc(s.name || '–')}</b><span class="small mono muted">${fmt(s.lat)}, ${fmt(s.lon)}</span></div>` : `<p class="note">${t('ge_start_none')}</p>`}
<p class="note" style="margin:0">${t('ge_same_names')}</p>
<div class="label" style="margin-top:8px">2 · ${t('ge_area')}</div>
<div class="row" style="gap:6px">${tool('kreis', t('ge_t_kreis'))}${tool('rechteck', t('ge_t_rechteck'))}${tool('vieleck', t('ge_t_vieleck'))}${tool('korridor', t('ge_t_korridor'))}</div>
${g.typ === 'kreis' ? `<label class="row nowrap">${t('ge_radius')} <input type="number" min="1" max="500" data-gg="r" value="${esc(g.r)}" style="width:80px"> km</label><p class="note" style="margin:0">${t('ge_kreis_note')}</p>` : ''}
${g.typ === 'rechteck' ? `<p class="note" style="margin:0">${t('ge_rect_note')}</p>${g.rect ? `<span class="small mono muted">${fmt(g.rect.s, 2)}–${fmt(g.rect.n, 2)} N · ${fmt(g.rect.w, 2)}–${fmt(g.rect.e, 2)} E</span>` : ''}` : ''}
${g.typ === 'vieleck' ? `<p class="note" style="margin:0">${t('ge_poly_note')}</p>${pts}<div class="row"><button type="button" class="sec" data-ge="ptlast" ${g.poly.length ? '' : 'disabled'}>${t('ge_pt_last')}</button><button type="button" class="sec" data-ge="clear" ${g.poly.length ? '' : 'disabled'}>${t('ge_clear')}</button></div>` : ''}
${g.typ === 'korridor' ? `<div class="row" style="gap:6px"><span class="small">${t('ge_def')}</span><label class="small">${t('ge_left')} <input type="number" min="0" max="200" data-gg="defL" value="${esc(g.defL)}" style="width:64px"></label><label class="small">${t('ge_right')} <input type="number" min="0" max="200" data-gg="defR" value="${esc(g.defR)}" style="width:64px"></label><span class="small">km</span></div>
<p class="note" style="margin:0">${t('ge_kor_note')}</p>
${hasStart() ? `<div class="ge-leg"><div class="row nowrap" style="gap:6px"><b class="mono">S</b><span class="small">${t('ge_start')} ${esc(s.name || '')}</span><span class="small muted">${t('ge_fixed')}</span></div></div>` : ''}${legs}
<div class="row"><button type="button" class="sec" data-ge="ptlast" ${g.pts.length ? '' : 'disabled'}>${t('ge_pt_last')}</button><label class="btn sec" style="cursor:pointer">${t('ge_import')}<input type="file" id="geimport" accept=".gpx,.geojson,.json,application/gpx+xml,application/geo+json" hidden></label></div>` : ''}
<div class="label" style="margin-top:8px">3 · ${t('ge_band')}</div>
<div class="row nowrap" style="gap:6px"><label>${t('ge_from')} <input type="text" class="mono" data-gh="von" value="${esc(h.von)}" style="width:80px"></label><label>${t('ge_to')} <input type="text" class="mono" data-gh="bis" value="${esc(h.bis)}" style="width:90px"></label></div>
<label><input type="checkbox" data-gh="radarOhneGrenze" ${h.radarOhneGrenze ? 'checked' : ''}> ${t('ge_radar')}</label>
<label class="row nowrap">${t('ge_margin')} <input type="number" min="0" max="100" data-gh="marginKm" value="${esc(h.marginKm)}" style="width:70px"> km</label>
<span class="small">${t('ge_countries')}: <b>${ccs.length ? ccs.map(cc2).join(', ') : '–'}</b> <span class="muted">${t('ge_countries_note')}</span></span>
<div class="label" style="margin-top:8px">4 · ${t('ge_svc')}</div>
${c.bloecke.filter(b => b.on).map(b => `<div class="ge-svc"><span class="small"><b>${esc(b.name)}</b></span><div class="row" style="gap:4px">${b.svc.length ? b.svc.map(s => `<label class="chip ge-chip"><input type="checkbox" data-gs="${esc(s)}" ${g.svcOff.includes(s) ? '' : 'checked'}> ${esc(s)}</label>`).join('') : `<span class="small muted">–</span>`}</div></div>`).join('')}
<span class="small muted">${t('ge_svc_note')} <a href="#einstellungen">${t('ge_change')}</a></span>
<button type="button" data-ge="propose" ${areaOf() ? '' : 'disabled'}>${t('ge_propose')}</button>
<div id="gestats">${statsHtml()}</div>
<p class="note" style="margin:0">${t('ge_data', { d: st.index ? X.fmtDate(st.index.generated) : '…' })} · <a href="#editor">${t('ge_to_editor')}</a></p>`;
    hint();
  }
  function hitsHtml() {
    if (!st.hits) return '';
    if (!st.hits.length) return `<p class="note">${t('ge_no_hits')}</p>`;
    return `<div class="stack" style="gap:4px">${st.hits.map((h, i) => `<button type="button" class="chip" data-ge="hit" data-v="${i}" style="text-align:left">${esc(h.label)}<br><span class="small" style="opacity:.8">${esc(h.sub)}</span></button>`).join('')}</div>`;
  }
  function statsHtml() {
    if (!st.last) return '';
    const s = st.last;
    return `<div class="row" style="gap:6px;margin-top:4px"><span class="badge">${t('ge_cand', { n: s.cand })}</span><span class="badge g">${t('ge_taken', { n: s.taken })}</span><span class="badge y">${t('ge_left_n', { n: s.left })}</span></div>
<p class="small muted" style="margin:4px 0 0">${t('ge_stats', { a: s.stats.airports, s: s.stats.airspaces, i: s.stats.invalid, b: s.stats.outsideBand, o: s.stats.svcOff })}</p>`;
  }
  function hint() {
    const g = cfg().gebiet, el = document.getElementById('gehint'); if (!el) return;
    el.textContent = !hasStart() && g.typ !== 'rechteck' && g.typ !== 'vieleck' ? t('ge_hint_start') : t('ge_hint_' + g.typ);
  }

  // ---------- Karte ----------
  function projector() { const s = cfg().standort; const a = areaOf(); const c = hasStart() ? s : a && a.typ === 'rechteck' ? { lat: (a.s + a.n) / 2, lon: (a.w + a.e) / 2 } : a && a.pts ? { lat: a.pts[0][0], lon: a.pts[0][1] } : { lat: 47, lon: 8 }; return A().projector(c.lat, c.lon); }
  function initMap() {
    const L = root.L;
    if (!L) { document.getElementById('gemap').innerHTML = `<p class="note" style="padding:12px">${t('ge_no_leaflet')}</p>`; return; }
    const s = cfg().standort;
    st.map = L.map('gemap', { zoomControl: true }).setView(hasStart() ? [s.lat, s.lon] : [47.2, 8.3], hasStart() ? 9 : 7);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap · Lufträume/Flugplätze: openAIP (CC BY-NC)' }).addTo(st.map);
    st.lyData = L.layerGroup().addTo(st.map); st.lyArea = L.layerGroup().addTo(st.map); st.lyEdit = L.layerGroup().addTo(st.map);
    st.map.on('click', onMapClick);
    drawArea(true);
    if (st.layers) drawData(st.layers);
    setTimeout(() => st.map && st.map.invalidateSize(), 50);
  }
  const icon = (txt, cls) => root.L.divIcon({ className: 'ge-pin ' + (cls || ''), html: `<span>${esc(txt)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
  function drawArea(fit) {
    const L = root.L; if (!L || !st.map) return;
    st.lyArea.clearLayers(); st.lyEdit.clearLayers();
    const c = cfg(), g = c.gebiet, s = c.standort;
    const style = { color: '#1f5fbf', weight: 2, fillColor: '#1f5fbf', fillOpacity: 0.08 };
    const a = areaOf();
    if (a) {
      const P = projector(), S = A().shape(a, P);
      if (a.typ === 'kreis') L.circle([a.lat, a.lon], { radius: a.r * 1000, ...style }).addTo(st.lyArea);
      else if (S && S.ring) L.polygon(S.ring.map(([x, y]) => P.from(x, y)), style).addTo(st.lyArea);
      else if (S && S.legs) {
        S.legs.forEach(lg => L.polygon(lg.corners.map(([x, y]) => P.from(x, y)), { ...style, weight: 1 }).addTo(st.lyArea));
        (S.joints || []).forEach(j => { if (j.r > 0) L.circle(P.from(j.c[0], j.c[1]), { radius: j.r * 1000, ...style, weight: 1 }).addTo(st.lyArea); });
        L.polyline([[s.lat, s.lon]].concat(g.pts.map(p => [p.lat, p.lon])), { color: '#1f5fbf', weight: 2, dashArray: '6 6' }).addTo(st.lyArea);
      }
      if (fit && st.map) { try { st.map.fitBounds(st.lyArea.getLayers()[0].getBounds().pad(0.15)); } catch (e) { /* egal */ } }
    }
    if (hasStart()) L.marker([s.lat, s.lon], { icon: icon('S', 'start'), keyboard: false, title: s.name || 'S' }).addTo(st.lyEdit);
    if (g.typ === 'korridor' || g.typ === 'vieleck') {
      const arr = g.typ === 'vieleck' ? g.poly : g.pts;
      arr.forEach((p, i) => {
        const m = L.marker([p.lat, p.lon], { icon: icon(g.typ === 'korridor' ? 'P' + (i + 1) : String(i + 1)), draggable: true, title: 'P' + (i + 1) }).addTo(st.lyEdit);
        m.on('dragend', ev => { const ll = ev.target.getLatLng(); p.lat = +ll.lat.toFixed(5); p.lon = +ll.lng.toFixed(5); changed(); });
      });
      // Zwischenpunkte: kleiner Kreis in der Mitte jedes Schenkels, Klick fügt einen Punkt ein
      const chain = g.typ === 'korridor' ? (hasStart() ? [{ lat: s.lat, lon: s.lon }].concat(arr) : arr) : arr.concat(arr.length > 2 ? [arr[0]] : []);
      for (let i = 1; i < chain.length; i++) {
        const mid = [(chain[i - 1].lat + chain[i].lat) / 2, (chain[i - 1].lon + chain[i].lon) / 2];
        const at = g.typ === 'korridor' ? i - 1 : i;
        L.marker(mid, { icon: L.divIcon({ className: 'ge-mid', iconSize: [14, 14], iconAnchor: [7, 7] }), title: t('ge_mid') }).addTo(st.lyEdit)
          .on('click', ev => { root.L.DomEvent.stopPropagation(ev); const ref = arr[Math.min(at, arr.length - 1)] || {}; arr.splice(at, 0, g.typ === 'korridor' ? { lat: +mid[0].toFixed(5), lon: +mid[1].toFixed(5), l: ref.l != null ? ref.l : g.defL, r: ref.r != null ? ref.r : g.defR } : { lat: +mid[0].toFixed(5), lon: +mid[1].toFixed(5) }); changed(); });
      }
    }
    if (g.typ === 'rechteck' && st.rectA) L.marker(st.rectA, { icon: icon('1') }).addTo(st.lyEdit);
  }
  function drawData(layers) {
    const L = root.L; if (!L || !st.map) return;
    st.layers = layers; st.lyData.clearLayers();
    for (const s of layers.airspaces) for (const r of s.rings) L.polygon(r, { color: '#c0392b', weight: 1.5, dashArray: '6 5', fill: false }).bindTooltip(s.name).addTo(st.lyData);
    for (const a of layers.airports) L.circleMarker([a.lat, a.lon], { radius: 6, color: a.in ? '#1f5fbf' : '#9aa7b6', fillColor: a.in ? '#1f5fbf' : '#9aa7b6', fillOpacity: 0.9, weight: 1 })
      .bindTooltip((a.icao ? a.icao + ' ' : '') + a.name).addTo(st.lyData);
  }
  function onMapClick(ev) {
    const g = cfg().gebiet, ll = [+ev.latlng.lat.toFixed(5), +ev.latlng.lng.toFixed(5)];
    if (g.typ === 'korridor') { if (!hasStart()) { X.msg(t('ge_hint_start'), 'warn'); return; } g.pts.push({ lat: ll[0], lon: ll[1], l: g.defL, r: g.defR }); changed(); }
    else if (g.typ === 'vieleck') { g.poly.push({ lat: ll[0], lon: ll[1] }); changed(); }
    else if (g.typ === 'rechteck') {
      if (!st.rectA) { st.rectA = ll; drawArea(false); return; }
      const [a, b] = [st.rectA, ll]; st.rectA = null;
      g.rect = { s: Math.min(a[0], b[0]), n: Math.max(a[0], b[0]), w: Math.min(a[1], b[1]), e: Math.max(a[1], b[1]) }; changed();
    } else if (g.typ === 'kreis' && !hasStart()) X.msg(t('ge_hint_start'), 'warn');
  }
  function changed(fit) { st.last = null; X.saveDraft(); aside(); drawArea(!!fit); }

  // ---------- Daten ----------
  async function loadIndex() {
    if (st.index) { aside(); return; }
    try { const r = await fetch(DATA + 'index.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); st.index = await r.json(); }
    catch (e) { X.msg(t('ge_data_err', { e: e.message }), 'err'); return; }
    if (document.getElementById('geaside')) aside();
  }
  async function file(cc) {
    if (st.files[cc]) return st.files[cc];
    const r = await fetch(DATA + 'freq-' + cc + '.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('freq-' + cc + ': HTTP ' + r.status);
    st.files[cc] = await r.json(); return st.files[cc];
  }
  async function propose(btn) {
    const c = cfg(), a = areaOf(); if (!a) return;
    if (!st.index) await loadIndex(); if (!st.index) return;
    const lo = A().parseAlt(c.hoehe.von), hi = A().parseAlt(c.hoehe.bis);
    if (isNaN(lo) || isNaN(hi) || hi < lo) { X.msg(t('ge_band_bad'), 'warn'); return; }
    const P = projector();
    const ccs = A().countriesFor(st.index, A().bboxOf(a, P, c.hoehe.marginKm));
    if (!ccs.length) { X.msg(t('ge_no_countries'), 'warn'); return; }
    btn.disabled = true; btn.textContent = t('ge_loading');
    try {
      const got = await Promise.allSettled(ccs.map(file));
      const data = got.filter(g => g.status === 'fulfilled').map(g => g.value);
      const miss = ccs.filter((_, i) => got[i].status !== 'fulfilled');
      if (miss.length) X.msg(t('ge_missing', { c: miss.map(cc2).join(', ') }), 'warn');
      if (!data.length) throw new Error(got[0].reason && got[0].reason.message || 'keine Daten');
      const res = A().propose(data, { area: a, standort: hasStart() ? c.standort : null, bandLo: lo, bandHi: hi, radarNoLimit: c.hoehe.radarOhneGrenze, marginKm: c.hoehe.marginKm, services: M().servicesOf(c), adLoc: c.settings.adLoc, svcOff: c.gebiet.svcOff });
      const replaced = c.eintraege.filter(e => !(e.quellen || []).includes('eigen')).length;
      if (replaced && !(await X.ask(t('ge_replace_q'), t('ge_replace_b', { n: replaced, m: res.entries.length }), t('ge_replace_yes'), null, 'go'))) { aside(); return; }
      A().applyProposal(c, res.entries);
      c.datenStand = st.index.generated; delete c.beispiel;
      if (!c.name) c.name = (c.standort && c.standort.name ? c.standort.name.replace(/^[A-Z]{2}-/, '') : t('ge_area')) + ' ' + t('ge_t_' + c.gebiet.typ);
      X.saveDraft();
      const L = M().layout(c);
      st.last = { cand: res.entries.length, taken: Object.keys(L.slotOf).length, left: L.notPlaced.length, stats: res.stats };
      X.msg(t('ge_done', { n: res.entries.length, p: Object.keys(L.slotOf).length, c: ccs.map(cc2).join(', ') }), 'ok');
      drawData(res.layers);
    } catch (e) { X.msg(t('ge_data_err', { e: e.message }), 'err'); }
    aside();
  }
  async function search(q) {
    st.q = q; st.hits = null; aside();
    if (!q.trim()) return;
    try {
      const r = await fetch(NOMINATIM + encodeURIComponent(q) + '&accept-language=' + (X.lang === 'en' ? 'en' : 'de'), { headers: { Accept: 'application/json' } });
      const j = await r.json();
      st.hits = j.map(h => {
        const ad = h.address || {};
        const cc = cc2(ad.country_code);
        const name = h.name || (h.display_name || '').split(',')[0];
        const where = [ad.state, ad.county].filter(Boolean)[0] || '';
        return { label: (cc ? cc + '-' : '') + name, sub: [h.type ? t('ge_type_' + h.type) !== 'ge_type_' + h.type ? t('ge_type_' + h.type) : h.type : '', where].filter(Boolean).join(', '), lat: +h.lat, lon: +h.lon, cc };
      });
    } catch (e) { st.hits = []; X.msg(t('ge_search_err', { e: e.message }), 'err'); }
    aside();
  }

  /** GPX- oder GeoJSON-Linie als Korridor-Mittellinie (vereinfacht, höchstens 30 Punkte). */
  function importLine(text) {
    let pts = [];
    if (/<gpx/i.test(text)) {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      pts = [...doc.querySelectorAll('trkpt, rtept, wpt')].map(n => [+n.getAttribute('lat'), +n.getAttribute('lon')]);
    } else {
      const j = JSON.parse(text);
      const geoms = j.type === 'FeatureCollection' ? j.features.map(f => f.geometry) : [j.type === 'Feature' ? j.geometry : j];
      const g = geoms.find(x => x && /LineString/.test(x.type));
      if (g) pts = (g.type === 'MultiLineString' ? g.coordinates.flat() : g.coordinates).map(([lon, lat]) => [lat, lon]);
    }
    pts = pts.filter(p => isFinite(p[0]) && isFinite(p[1]));
    if (pts.length < 2) throw new Error(t('ge_import_none'));
    const P = A().projector(pts[0][0], pts[0][1]);
    const xy = pts.map(p => P.to(p[0], p[1]));
    const keep = new Set([0, xy.length - 1]);
    (function dp(a, b, tol) {
      let md = 0, mi = -1;
      for (let i = a + 1; i < b; i++) { const [x, y] = xy[i], [ax, ay] = xy[a], [bx, by] = xy[b]; const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-9; const d = Math.abs(dy * x - dx * y + bx * ay - by * ax) / l; if (d > md) { md = d; mi = i; } }
      if (mi > 0 && md > tol) { keep.add(mi); dp(a, mi, tol); dp(mi, b, tol); }
    })(0, xy.length - 1, 1.0);
    let out = [...keep].sort((a, b) => a - b).map(i => pts[i]);
    while (out.length > 30) out = out.filter((_, i) => i % 2 === 0 || i === out.length - 1);
    return out;
  }

  // ---------- Ereignisse (vom Dokument, nur auf dieser Seite) ----------
  function onClick(ev) {
    const b = ev.target.closest('[data-ge]'); if (!b || !document.getElementById('geaside')) return false;
    const g = cfg().gebiet, act = b.dataset.ge;
    const arr = g.typ === 'vieleck' ? g.poly : g.pts;
    if (act === 'typ') { g.typ = b.dataset.v; st.rectA = null; changed(true); }
    else if (act === 'hit') {
      const h = st.hits[+b.dataset.v]; const c = cfg();
      c.standort = { name: h.label, lat: +h.lat.toFixed(5), lon: +h.lon.toFixed(5), cc: h.cc }; st.hits = null;
      if (st.map) st.map.setView([h.lat, h.lon], 10);
      changed(true);
    }
    else if (act === 'ptdel') { arr.splice(+b.closest('[data-i]').dataset.i, 1); changed(); }
    else if (act === 'ptlast') { arr.pop(); changed(); }
    else if (act === 'clear') { arr.length = 0; changed(); }
    else if (act === 'propose') propose(b);
    else return false;
    return true;
  }
  function onChange(ev) {
    const el = ev.target; if (!document.getElementById('geaside')) return false;
    const c = cfg(), g = c.gebiet;
    if (el.id === 'geimport') {
      const f = el.files && el.files[0]; if (!f) return true;
      f.text().then(txt => {
        try { const pts = importLine(txt); g.typ = 'korridor'; if (!hasStart()) c.standort = { name: t('ge_track_start'), lat: pts[0][0], lon: pts[0][1] }; g.pts = pts.slice(hasStart() && Math.hypot(pts[0][0] - c.standort.lat, pts[0][1] - c.standort.lon) < 0.01 ? 1 : 0).map(p => ({ lat: +p[0].toFixed(5), lon: +p[1].toFixed(5), l: g.defL, r: g.defR })); X.msg(t('ge_imported', { n: g.pts.length }), 'ok'); changed(true); }
        catch (e) { X.msg(t('ge_import_err', { e: e.message }), 'err'); }
      });
      return true;
    }
    if (el.dataset.gg) { const v = Math.max(0, Number(el.value) || 0); g[el.dataset.gg] = el.dataset.gg === 'r' ? Math.max(1, v) : v; changed(el.dataset.gg === 'r'); return true; }
    if (el.dataset.gf) { const i = +el.closest('[data-i]').dataset.i; g.pts[i][el.dataset.gf] = Math.max(0, Number(el.value) || 0); changed(); return true; }
    if (el.dataset.gs) { const s = el.dataset.gs; g.svcOff = g.svcOff.filter(x => x !== s); if (!el.checked) g.svcOff.push(s); st.last = null; X.saveDraft(); document.getElementById('gestats').innerHTML = ''; return true; }
    if (el.dataset.gh) { const k = el.dataset.gh; c.hoehe[k] = el.type === 'checkbox' ? el.checked : k === 'marginKm' ? Math.max(0, Number(el.value) || 0) : el.value.trim().toUpperCase(); if ((k === 'von' || k === 'bis') && isNaN(A().parseAlt(c.hoehe[k]))) X.msg(t('ge_band_bad'), 'warn'); changed(); return true; }
    return false;
  }
  function onSubmit(ev) {
    const f = ev.target.closest('form[data-ge-form=search]'); if (!f) return false;
    ev.preventDefault(); search(f.querySelector('#geq').value); return true;
  }
  function leave() { if (st.map) { st.map.remove(); st.map = null; } }

  root.KRT2GEBIET = { render, onClick, onChange, onSubmit, leave, _importLine: importLine };
})(typeof self !== 'undefined' ? self : this);
