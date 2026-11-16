/* Zusammenspiel krt2 (Funkprotokoll, src/vhflog.js) und Reporting-App (index.html, v261116-01)
   auf EINEM nachgebildeten GitHub, das sich wie das echte verhält:
   - PUT mit veralteter sha → 409, ohne sha auf bestehende Datei → 422
   - über 1 MB kein eingebetteter Inhalt (encoding none), Inhalt nur roh
   - ETag / If-None-Match → 304
   Nicht in CI (braucht die Reporting-App und jsdom). Aufruf:
     git clone --depth 1 https://github.com/bwicki/gb_notion_frontend ../gb_notion_frontend
     npm install jsdom@24
     node tests/reporting_cross.js ../gb_notion_frontend/index.html src/vhflog.js
   Stand 16.11.2026 (krt2 0.7.1, Reporting v261116-01): 16 Prüfungen bestanden. */
const fs = require('fs'), { JSDOM } = require('jsdom');
const HTML = fs.readFileSync(process.argv[2], 'utf8');
const K = require(require('path').resolve(process.argv[3]));

let FILES = {}, N = 0, LOG = [];
const put = (p, text) => { FILES[p] = { text, sha: 's' + (++N) }; };
const HOOK = {};               // HOOK[client+':'+path] = async () => {} – einmalig nach dem Lesen
let BROKEN = false;            // Fahrtabelle liefert kaputtes JSON

function mock(client) {
  return async function (u, opt) {
    u = String(u); opt = opt || {};
    const met = (opt.method || 'GET').toUpperCase();
    const H = opt.headers || {}, acc = H.Accept || H.accept || '', inm = H['If-None-Match'];
    const path = decodeURI((u.split('/contents/')[1] || '').split('?')[0]);
    const R = (st, body, raw, hd) => ({ ok: st < 400, status: st, headers: { get: k => (hd || {})[String(k).toLowerCase()] || null },
      json: async () => body, text: async () => raw != null ? raw : JSON.stringify(body) });
    if (met === 'PUT') {
      const b = JSON.parse(opt.body), cur = FILES[path];
      if (cur && b.sha !== cur.sha) { LOG.push(client + ' PUT ' + path + ' → 409'); return R(409, { message: 'sha mismatch' }); }
      if (cur && !b.sha) return R(422, { message: 'sha missing' });
      put(path, Buffer.from(b.content, 'base64').toString('utf8'));
      LOG.push(client + ' PUT ' + path + ' ok');
      return R(200, { content: { sha: FILES[path].sha } });
    }
    if (/\/repos\/[^/]+\/[^/?]+$/.test(u.split('?')[0])) return R(200, { full_name: 'bwicki/gb_flight_data', permissions: { push: true } });
    if (path === 'data') return R(200, Object.keys(FILES).map(p => ({ type: 'file', name: p.slice(5), path: p, sha: FILES[p].sha, size: Buffer.byteLength(FILES[p].text) })));
    const f = FILES[path];
    if (!f) return R(404, { message: 'Not Found' });
    const flight = /GB-2026-07\.json$/.test(path);
    const text = BROKEN && flight ? '[{"id":"x", KAPUTT' : f.text;
    const size = Buffer.byteLength(text), et = '"' + f.sha + '"';
    let res;
    if (/raw/.test(acc)) res = R(200, null, text);
    else if (inm && inm === et) res = R(304, null, '', { etag: et });
    else if (size > 1024 * 1024) res = R(200, { sha: f.sha, size, encoding: 'none', content: '' }, null, { etag: et });
    else res = R(200, { sha: f.sha, size, encoding: 'base64', content: Buffer.from(text, 'utf8').toString('base64') }, null, { etag: et });
    const hk = HOOK[client + ':' + path];
    if (hk && !/raw/.test(acc)) { delete HOOK[client + ':' + path]; await hk(); }
    return res;
  };
}

const iso = (m, s) => '2026-11-16T08:' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.000Z';
const crew = (i) => ({ id: 'c' + i, flight_id: 'GB-2026-07', callsign: 'HB-QXY', device: 'D7K2', device_mode: 'shared',
  reporter: 'Balthasar', ts_utc: iso(i % 60, i % 60), ts_local: iso(i % 60, i % 60), type: ['POS', 'ATC', 'Other', 'Ballast'][i % 4],
  ballast_action: i % 4 === 3 ? 'drop' : undefined, ballast_medium: i % 4 === 3 ? 'sand' : undefined, ballast_delta_kg: i % 4 === 3 ? -2 : undefined,
  note: 'crew entry ' + i + ' – written from the basket on a long competition flight, with some text to make the row realistic' });
const T0 = Date.UTC(2026, 10, 16, 8, 30, 0);
let q = 0;
const ev = (kind, s, ch, name, ms) => ({ id: 'k' + (++q), kind, wall: T0 + s * 1000, ch, name, ms, pos: { lat: 47.5 + s / 1e4, lon: 8.5, alt: 1220 } });

const CFG = { repo: 'bwicki/gb_flight_data', token: 'T', dir: 'data', branch: 'main', device: 'KRT2', reporter: 'KRT2' };
const SENT = [];
async function krt2(queue) {
  const r = await K.flush({ cfg: CFG, queue, sent: SENT, fetch: mock('krt2') });
  r.rows.forEach(x => SENT.push(x));
  return r;
}

const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://reporting.wicki.aero/',
  beforeParse(w) {
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = { speak() {}, cancel() {}, getVoices() { return []; } };
    w.AudioContext = function () { this.state = 'running'; this.currentTime = 0;
      this.createOscillator = () => ({ frequency: { value: 0 }, connect() {}, start() {}, stop() {} });
      this.createGain = () => ({ gain: { value: 0, exponentialRampToValueAtTime() {} }, connect() {} });
      this.destination = {}; this.resume = () => {}; };
    w.navigator.geolocation = { watchPosition() { return 1; }, getCurrentPosition() {} };
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.fetch = mock('rep'); w.open = () => null;
    w.localStorage.setItem('bsk.dev', 'DTEST');
    w.localStorage.setItem('bsk.cfg.v6', JSON.stringify({ repo: 'bwicki/gb_flight_data', token: 'W', dir: 'data', branch: 'main', role: 'master',
      flight: 'GB-2026-07', call: 'HB-QXY', lang: 'de', reporter: 'Balthasar', p1: 'Balthasar', p2: 'Nicole', mode: 'shared', provisioned: 1 }));
    try { Object.defineProperty(w.crypto, 'subtle', { value: require('crypto').webcrypto.subtle, configurable: true }); } catch (e) { w.crypto = require('crypto').webcrypto; }
  } });
const w = dom.window, E = x => w.eval(x);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? '  ok  ' : 'FAIL  ') + m); };
const table = () => JSON.parse(FILES['data/GB-2026-07.json'].text);
const ids = () => new Set(table().map(r => r.id));
async function repSync() { await E('(async()=>{await waitSync();await sync(true,true,0,true);await waitSync()})()'); }
function repAdd(row) { E('ENT.push(' + JSON.stringify(Object.assign({}, row, { synced: false })) + ');save(K_ENT,ENT)'); }
const strip = r => { const c = Object.assign({}, r); return JSON.stringify(Object.keys(c).sort().reduce((o, k) => (o[k] = c[k], o), {})); };

(async () => {
  await sleep(700);
  E('ENT=[];TOMB=[];save(K_ENT,ENT);save(K_TOMB,TOMB)');
  // Fahrt mit drei Crew-Einträgen über die Reporting-App
  [0, 1, 2].forEach(i => repAdd(crew(i))); await repSync();
  ok(FILES['data/GB-2026-07.json'] && table().length === 3, 'A0 Reporting-App legt die Fahrt mit 3 Einträgen an (' + (FILES['data/GB-2026-07.json'] ? table().length : 0) + ')');
  const setupThere = !!FILES['data/_setup.json'];
  if (setupThere) { const s = await K.readSetup(CFG, mock('krt2')); ok(s.flight === 'GB-2026-07' && s.call === 'HB-QXY', 'A1 krt2 liest Fahrt und Rufzeichen aus _setup.json der Reporting-App (' + s.flight + ' / ' + s.call + ')'); }
  else console.log('  --  A1 _setup.json nicht geschrieben (Testumgebung) – krt2 liest es trotzdem');
  if (!setupThere) put('data/_setup.json', JSON.stringify({ flight: 'GB-2026-07', call: 'HB-QXY' }));

  // A: krt2 schreibt, dann Crew-Eintrag – alles bleibt, VHF-Felder unverändert
  const r1 = await krt2([ev('frq', 0, '127.800', 'ZURICH F'), ev('tx', 20, '127.800', 'ZURICH F', 6200), ev('frq', 60, '124.700', 'GENEVA F'), ev('tx', 75, '124.700', 'GENEVA F', null)]);
  ok(r1.added === 4 && table().length === 7, 'A2 krt2 hängt 4 VHF-Zeilen an (Tabelle ' + table().length + ')');
  const vhfSnap = new Map(table().filter(r => r.type === 'VHF').map(r => [r.id, strip(r)]));
  repAdd(crew(3)); await repSync();
  ok(table().length === 8, 'A3 nach Crew-Eintrag 8 Zeilen (' + table().length + ')');
  const same = table().filter(r => r.type === 'VHF').every(r => vhfSnap.get(r.id) === strip(r));
  ok(same, 'A4 Reporting-App schreibt die VHF-Zeilen Feld für Feld unverändert zurück');
  if (!same) table().filter(r => r.type === 'VHF').forEach(r => { if (vhfSnap.get(r.id) !== strip(r)) console.log('       vorher ' + vhfSnap.get(r.id) + '\n       nachher ' + strip(r)); });
  ok(E('ENT.filter(e=>e.type==="VHF").length') === 4, 'A5 Reporting-App zeigt die 4 VHF-Zeilen im Log');

  // B: krt2 liest, Reporting-App schreibt dazwischen → krt2 bekommt 409 und versucht neu
  HOOK['krt2:data/GB-2026-07.json'] = async () => { repAdd(crew(4)); await repSync(); };
  LOG = [];
  const r2 = await krt2([ev('tx', 120, '124.700', 'GENEVA F', 3100)]);
  ok(LOG.includes('krt2 PUT data/GB-2026-07.json → 409') && r2.added === 1, 'B1 krt2 erhält 409 und schreibt im zweiten Anlauf');
  ok(ids().has('c4') && ids().has(r2.rows[0].id) && table().length === 10, 'B2 beide Einträge stehen in der Tabelle (' + table().length + ')');

  // C: Reporting-App liest, krt2 schreibt dazwischen → Reporting-App 409, neuer Anlauf
  let r3;
  HOOK['rep:data/GB-2026-07.json'] = async () => { r3 = await krt2([ev('frq', 180, '128.050', 'ZURICH INFO')]); };
  LOG = []; repAdd(crew(5)); await repSync();
  ok(LOG.includes('rep PUT data/GB-2026-07.json → 409'), 'C1 Reporting-App erhält 409 (krt2 war schneller)');
  ok(r3 && ids().has(r3.rows[0].id) && ids().has('c5') && table().length === 12, 'C2 beide Einträge stehen in der Tabelle (' + table().length + ')');

  // D: Crew löscht eine VHF-Zeile → krt2 trägt sie nicht nach
  const victim = SENT[0].id;
  E('TOMB.push({id:' + JSON.stringify(victim) + ',ts:new Date().toISOString(),by:"Balthasar"});save(K_TOMB,TOMB);ENT=ENT.filter(x=>x.id!==' + JSON.stringify(victim) + ');save(K_ENT,ENT)');
  await repSync();
  ok(!ids().has(victim) && FILES['data/GB-2026-07.deleted.json'] && FILES['data/GB-2026-07.deleted.json'].text.includes(victim), 'D1 gelöschte VHF-Zeile weg, Tombstone in <Fahrt>.deleted.json');
  const r4 = await krt2([ev('tx', 240, '128.050', 'ZURICH INFO', 1500)]);
  ok(!ids().has(victim) && r4.healed === 0, 'D2 krt2 respektiert den Tombstone und trägt die Zeile nicht nach');
  // D3: Zeile verschwindet ohne Tombstone (z.B. von Hand in GitHub gelöscht) → krt2 trägt nach
  const lost = SENT[1].id, t0 = table().filter(r => r.id !== lost);
  put('data/GB-2026-07.json', JSON.stringify(t0, null, 1));
  const r5 = await krt2([ev('frq', 300, '127.800', 'ZURICH F')]);
  ok(ids().has(lost) && r5.healed === 1, 'D3 ohne Tombstone verschwundene eigene Zeile wird nachgetragen');

  // E: Tabelle über 1 MB
  const big = table(); for (let i = 100; i < 2900; i++) big.push(crew(i));
  put('data/GB-2026-07.json', JSON.stringify(big, null, 1));
  const before = table().length, sz = Buffer.byteLength(FILES['data/GB-2026-07.json'].text);
  const r6 = await krt2([ev('tx', 360, '127.800', 'ZURICH F', 4400)]);
  ok(sz > 1024 * 1024 && r6.added === 1 && table().length === before + 1, 'E1 krt2 bei ' + (sz / 1048576).toFixed(2) + ' MB: liest roh, hängt an, nichts verloren (' + table().length + ')');
  repAdd(crew(9000)); await repSync();
  ok(table().length === before + 2, 'E2 Reporting-App bei > 1 MB: nichts verloren (' + table().length + ')');

  // F: Datei existiert, Inhalt nicht lesbar
  const keep = FILES['data/GB-2026-07.json'].text; BROKEN = true; LOG = [];
  repAdd(crew(9001)); await repSync();
  ok(!LOG.some(l => l.startsWith('rep PUT data/GB-2026-07.json ok')), 'F1 Reporting-App schreibt bei unlesbarer Tabelle nicht');
  E('LOSTWARN=true');
  let err = null; try { await krt2([ev('tx', 420, '127.800', 'ZURICH F', 2000)]); } catch (e) { err = e; }
  BROKEN = false;
  ok(FILES['data/GB-2026-07.json'].text === keep && err, 'F2 krt2 schreibt bei unlesbarer Tabelle nicht (' + (err ? err.message : 'hat geschrieben!') + ')');

  console.log(bad ? '\n' + bad + ' FEHLER' : '\nalle Prüfungen bestanden');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
