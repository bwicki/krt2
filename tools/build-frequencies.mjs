// Nächtliche Frequenzdaten für krt2.wicki.aero – ganz Europa, ohne Schlüssel.
// Quellen:
//   openAIP-Länderexporte (s3.openaip.net/openaip-system-exports/<cc>_apt.geojson, <cc>_asp.geojson),
//     Lizenz CC BY-NC 4.0 – Flugplätze und Lufträume mit Frequenzen
//   OurAirports (github.com/davidmegginson/ourairports-data, gemeinfrei) – Gegenprobe der Flugplatzfrequenzen
// Ergebnis (Verzeichnis OUT): freq-<cc>.json je Land, index.json, schema-sample.json (Rohbeispiele zur Kontrolle).
// Frequenzen werden auf gültige Kanalnamen (8.33/25 kHz) gebracht; Unklares wird markiert, nicht verworfen.
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../src/krt2codec.js');

const EXPORT_BASE = 'https://s3.openaip.net/openaip-system-exports';
const OA_BASE = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main';
const OUT = process.env.OUT || 'out';
const UA = { 'User-Agent': 'krt2-frequencies/1.0 (+https://krt2.wicki.aero)' };
// Europa ohne Russland/Belarus/Türkei; openAIP-Kürzel in Kleinbuchstaben
const DEFAULT_CC = 'al,at,ba,be,bg,ch,cy,cz,de,dk,ee,es,fi,fr,gb,gr,hr,hu,ie,is,it,li,lt,lu,lv,md,me,mk,mt,nl,no,pl,pt,ro,rs,se,si,sk,ua';
const COUNTRIES = (process.env.COUNTRIES || DEFAULT_CC).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// openAIP-Frequenztypen (API v2) → ICAO-Dienstkürzel (Doc 8400) für den Kurznamen
const OAIP_FTYPE = { 0: 'APP', 1: 'APN', 2: 'ARR', 3: 'ACC', 4: 'CTAF', 5: 'DEL', 6: 'DEP', 7: 'FIS', 8: 'GLD', 9: 'GND', 10: 'INFO', 11: 'MCOM', 12: 'UCOM', 13: 'RDR', 14: 'TWR', 15: 'ATIS', 16: 'RDO', 17: 'OTH', 18: 'AIRMET', 19: 'AWOS', 20: 'LGT', 21: 'VOLMET', 22: 'AFIS' };
// OurAirports-Typen (freier Text) → Dienstkürzel
// openAIP-Luftraumtypen (api.core.openaip.net, Stand 2026) [likely] – im Datensatz CH bestätigt: 1 R, 2 D, 4 CTR, 5 TMZ, 6 RMZ, 7 TMA, 21 GLD-Sektor, 26 CTA, 33 FIS-Sektor
export const OAIP_ASPTYPE = { 0: 'OTHER', 1: 'R', 2: 'D', 3: 'P', 4: 'CTR', 5: 'TMZ', 6: 'RMZ', 7: 'TMA', 8: 'TRA', 9: 'TSA', 10: 'FIR', 11: 'UIR', 12: 'ADIZ', 13: 'ATZ', 14: 'MATZ', 15: 'AWY', 16: 'MTR', 17: 'ALERT', 18: 'WARNING', 19: 'PROTECTED', 20: 'HTZ', 21: 'GLDSEC', 22: 'TRP', 23: 'TIZ', 24: 'TIA', 25: 'MTA', 26: 'CTA', 27: 'ACC', 28: 'SPORT', 29: 'LOWFLY', 30: 'MRT', 31: 'TFR', 32: 'VFRSEC', 33: 'FISSEC', 34: 'LTA', 35: 'UTA' };
// Dienst eines Luftraum-Frequenzeintrags: zuerst aus dem Rufnamen, sonst aus dem Luftraumtyp
const NAME_SVC = [[/\bATIS\b/, 'ATIS'], [/\bAFIS\b/, 'AFIS'], [/\bVOLMET\b/, 'VOLMET'], [/\b(RADAR|RDR)\b/, 'RDR'], [/\b(TERMINAL|APPROACH|APP)\b/, 'APP'], [/\b(ARRIVAL|ARR)\b/, 'ARR'], [/\b(DEPARTURE|DEP)\b/, 'DEP'], [/\b(TOWER|TWR)\b/, 'TWR'], [/\b(GROUND|GND)\b/, 'GND'], [/\b(DELIVERY|DEL)\b/, 'DEL'], [/\b(INFORMATION|INFO|FIS)\b/, 'INFO'], [/\b(CONTROL|CENTER|CENTRE|ACC)\b/, 'ACC'], [/\b(RADIO|RDO)\b/, 'RDO'], [/\b(GLIDER|GLIDING|GLD|SEGELFLUG)\b/, 'GLD']];
const TYPE_SVC = { 4: 'TWR', 13: 'TWR', 14: 'TWR', 20: 'TWR', 7: 'APP', 26: 'APP', 27: 'ACC', 10: 'INFO', 11: 'INFO', 33: 'INFO', 23: 'INFO', 24: 'INFO', 5: 'INFO', 6: 'INFO', 1: 'INFO', 2: 'INFO', 3: 'INFO', 8: 'INFO', 9: 'INFO', 25: 'INFO', 21: 'GLD' };
export function aspService(freqName, aspType) {
  const n = String(freqName || '').toUpperCase();
  for (const [re, s] of NAME_SVC) if (re.test(n)) return { s, by: 'name' };
  return { s: TYPE_SVC[aspType] || 'OTH', by: 'type' };
}

const OA_FTYPE = { TWR: 'TWR', TOWER: 'TWR', APP: 'APP', APPROACH: 'APP', ARR: 'ARR', DEP: 'DEP', GND: 'GND', GROUND: 'GND', ATIS: 'ATIS', AFIS: 'AFIS', INFO: 'INFO', 'A/G': 'RDO', RDO: 'RDO', RADIO: 'RDO', DEL: 'DEL', CLD: 'DEL', CLNC: 'DEL', APRON: 'APN', APN: 'APN', CTAF: 'CTAF', UNIC: 'UCOM', UNICOM: 'UCOM', FIS: 'FIS', RDR: 'RDR', RADAR: 'RDR', CNTR: 'ACC', CTR: 'ACC', ACC: 'ACC', VOLMET: 'VOLMET', MIL: 'MIL', OPS: 'OTH' };

async function getJson(url) {
  const r = await fetch(url, { headers: { ...UA, Accept: 'application/geo+json, application/json' } });
  if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
  return r.text();
}
function csv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// Frequenzwert → Kanalname. Liefert { ch, note } – note bei Rundung/Umrechnung/Ungültigkeit.
export function channel(raw) {
  if (raw == null || raw === '') return { ch: null, note: 'leer' };
  let s = String(raw).trim().replace(',', '.');
  const num = Number(s);
  if (!Number.isFinite(num)) return { ch: null, note: 'kein Wert: ' + s };
  if (num < 118 || num >= 137) return { ch: null, note: 'ausserhalb Flugfunk: ' + s };
  const dec = (s.split('.')[1] || '');
  if (dec.length <= 3) {
    const e = C.encodeFreq(num.toFixed(3));
    if (e.ok) return { ch: e.display, note: dec.length === 2 ? 'nur zwei Nachkommastellen – evtl. gerundet' : '' };
  }
  // echte Frequenz (z. B. 118.6083) → nächster 8.33-Kanal; 25-kHz-Raster bevorzugt, wenn exakt
  const khz = Math.round((num - Math.floor(num)) * 1e5) / 100; // kHz mit 2 Nachkommastellen
  const mhz = Math.floor(num);
  const k25 = Math.round(khz / 25) * 25;
  if (Math.abs(khz - k25) < 0.02) { const e = C.encodeFreq(mhz + '.' + String(k25).padStart(3, '0')); if (e.ok) return { ch: e.display, note: '' }; }
  const slot = Math.round(khz / (25 / 3));               // 8.33-Raster ab 0
  const real = slot * 25 / 3;
  if (Math.abs(khz - real) < 0.7) {   // 0.7 kHz deckt auf 3 Stellen abgeschnittene Werte (132.833) ab
    const block = Math.floor(slot / 3), sub = slot % 3;   // je 25 kHz drei Kanäle: +5, +10, +15
    const chk = block * 25 + (sub + 1) * 5;
    const e = C.encodeFreq(mhz + '.' + String(chk).padStart(3, '0'));
    if (e.ok) return { ch: e.display, note: 'aus echter Frequenz ' + s };
  }
  return { ch: null, note: 'kein gültiger Kanal: ' + s };
}

const r3 = x => Math.round(x * 1000) / 1000;
function simplifyRing(ring) {
  const out = []; let last = null;
  for (const [x, y] of ring) { const p = [r3(x), r3(y)]; if (!last || p[0] !== last[0] || p[1] !== last[1]) out.push(p); last = p; }
  return out;
}
function geomOut(g) {
  if (!g) return null;
  if (g.type === 'Polygon') return { t: 'P', c: g.coordinates.map(simplifyRing) };
  if (g.type === 'MultiPolygon') return { t: 'M', c: g.coordinates.map(p => p.map(simplifyRing)) };
  return null;
}
function bboxOf(g) {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = a => { if (typeof a[0] === 'number') { w = Math.min(w, a[0]); e = Math.max(e, a[0]); s = Math.min(s, a[1]); n = Math.max(n, a[1]); } else a.forEach(walk); };
  walk(g.c); return [r3(w), r3(s), r3(e), r3(n)];
}
function limitOut(l) { return l ? { v: l.value, u: l.unit, r: l.referenceDatum } : null; }
function props(f) { return f.properties || f; }
function items(j) { return Array.isArray(j) ? j : (j.features || j.items || []); }

async function ourAirports() {
  const [apt, frq] = await Promise.all([getText(OA_BASE + '/airports.csv'), getText(OA_BASE + '/airport-frequencies.csv')]);
  const airports = new Map();
  for (const a of csv(apt)) airports.set(a.ident, a);
  const byIdent = new Map();
  byIdent.iata = new Map();
  for (const [id, a] of airports) if (a.iata_code) byIdent.iata.set(id, a.iata_code);
  for (const f of csv(frq)) {
    const a = airports.get(f.airport_ident); if (!a) continue;
    const t = (f.type || '').toUpperCase().trim();
    const c = channel(f.frequency_mhz);
    if (!byIdent.has(f.airport_ident)) byIdent.set(f.airport_ident, { a, f: [] });
    byIdent.get(f.airport_ident).f.push({ ch: c.ch, note: c.note, raw: f.frequency_mhz, s: OA_FTYPE[t] || OA_FTYPE[t.split(/[ /]/)[0]] || 'OTH', n: f.description || '' });
  }
  return byIdent;
}

async function country(cc, oa, samples) {
  const out = { cc, airports: [], airspaces: [], warnings: [] };
  let apt = [], asp = [];
  try { apt = items(await getJson(`${EXPORT_BASE}/${cc}_apt.geojson`)); } catch (e) { out.warnings.push('Flugplätze: ' + e.message); }
  try { asp = items(await getJson(`${EXPORT_BASE}/${cc}_asp.geojson`)); } catch (e) { out.warnings.push('Lufträume: ' + e.message); }
  if (!samples.apt && apt.length) samples.apt = apt.find(x => (props(x).frequencies || []).length) || apt[0];
  if (!samples.asp && asp.length) samples.asp = asp.find(x => (props(x).frequencies || []).length) || asp[0];
  const seen = new Set();
  for (const f of apt) {
    const p = props(f);
    const g = f.geometry || p.geometry;
    const coord = g && g.coordinates;
    const icao = p.icaoCode || p.icao || '';
    const freqs = [];
    for (const q of p.frequencies || []) {
      const c = channel(q.value);
      freqs.push({ ch: c.ch, note: c.note, raw: String(q.value), s: OAIP_FTYPE[q.type] || 'OTH', n: q.name || '', pri: !!q.primary, src: ['oaip'] });
    }
    // Gegenprobe OurAirports
    const o = icao && oa.get(icao);
    if (o) {
      seen.add(icao);
      for (const q of o.f) {
        const hit = freqs.find(x => x.ch && x.ch === q.ch);
        if (hit) { if (!hit.src.includes('oa')) hit.src.push('oa'); }
        else freqs.push({ ch: q.ch, note: q.note, raw: q.raw, s: q.s, n: q.n, pri: false, src: ['oa'] });
      }
    }
    if (!freqs.length) continue;
    out.airports.push({ id: p._id || p.id || icao || p.name, icao, iata: (oa.iata && oa.iata.get(icao)) || p.iataCode || '', name: p.name || '', t: p.type, lon: coord ? r3(coord[0]) : null, lat: coord ? r3(coord[1]) : null, f: freqs });
  }
  // OurAirports-Flugplätze, die openAIP nicht kennt (nur dieses Land)
  for (const [ident, o] of oa) {
    if (seen.has(ident) || (o.a.iso_country || '').toLowerCase() !== cc) continue;
    if (out.airports.some(a => a.icao === ident)) continue;
    out.airports.push({ id: 'oa-' + ident, icao: /^[A-Z]{4}$/.test(ident) ? ident : '', iata: o.a.iata_code || '', name: o.a.name, t: 'oa:' + o.a.type, lon: r3(Number(o.a.longitude_deg)), lat: r3(Number(o.a.latitude_deg)), f: o.f.map(q => ({ ch: q.ch, note: q.note, raw: q.raw, s: q.s, n: q.n, pri: false, src: ['oa'] })) });
  }
  for (const f of asp) {
    const p = props(f);
    const fr = (p.frequencies || []).map(q => { const c = channel(q.value); const sv = aspService(q.name, p.type); return { ch: c.ch, note: c.note, raw: String(q.value), s: sv.s, sby: sv.by, n: q.name || '', pri: !!q.primary, src: ['oaip'] }; });
    if (!fr.length) continue;
    const g = geomOut(f.geometry || p.geometry);
    if (!g) continue;
    out.airspaces.push({ id: p._id || p.id || p.name, name: p.name || '', t: p.type, cls: p.icaoClass, lo: limitOut(p.lowerLimit), hi: limitOut(p.upperLimit), f: fr, bb: bboxOf(g), g });
  }
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const generated = new Date().toISOString();
  console.log('OurAirports laden …');
  let oa = new Map();
  try { oa = await ourAirports(); console.log('OurAirports: ' + oa.size + ' Flugplätze mit Frequenzen'); }
  catch (e) { console.log('WARNUNG OurAirports: ' + e.message); }
  const samples = {};
  const index = { generated, schema: 2, license: { openaip: 'CC BY-NC 4.0, openaip.net', ourairports: 'Public Domain, ourairports.com' }, countries: [] };
  for (const cc of COUNTRIES) {
    const c = await country(cc, oa, samples);
    const nA = c.airports.length, nS = c.airspaces.length;
    const fAll = [...c.airports.flatMap(a => a.f), ...c.airspaces.flatMap(a => a.f)];
    const bad = fAll.filter(x => !x.ch).length;
    const bb = [180, 90, -180, -90];
    for (const a of c.airports) if (a.lon != null) { bb[0] = Math.min(bb[0], a.lon); bb[1] = Math.min(bb[1], a.lat); bb[2] = Math.max(bb[2], a.lon); bb[3] = Math.max(bb[3], a.lat); }
    for (const s of c.airspaces) { bb[0] = Math.min(bb[0], s.bb[0]); bb[1] = Math.min(bb[1], s.bb[1]); bb[2] = Math.max(bb[2], s.bb[2]); bb[3] = Math.max(bb[3], s.bb[3]); }
    const body = JSON.stringify({ cc, generated, airports: c.airports, airspaces: c.airspaces, warnings: c.warnings });
    await writeFile(`${OUT}/freq-${cc}.json`, body);
    index.countries.push({ cc, airports: nA, airspaces: nS, frequencies: fAll.length, invalid: bad, bbox: nA + nS ? bb : null, bytes: body.length, warnings: c.warnings });
    console.log(`${cc}: ${nA} Flugplätze, ${nS} Lufträume mit Frequenzen, ${fAll.length} Frequenzen (${bad} ungültig), ${(body.length / 1024).toFixed(0)} kB ${c.warnings.join(' | ')}`);
  }
  await writeFile(`${OUT}/index.json`, JSON.stringify(index, null, 1));
  await writeFile(`${OUT}/schema-sample.json`, JSON.stringify(samples, null, 1).slice(0, 200000));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
