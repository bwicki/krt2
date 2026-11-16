// Prüft src/vhflog.js: Einträge aus den Funkgerät-Meldungen (Frequenz stabil 3 s, Aussendungen ab 0,3 s) und das Schreiben
// in die Fahrtabelle von gb_flight_data (Anhängen, Konflikt, grosse Datei, gelöschte Zeilen, Nachtragen fehlender Zeilen).
'use strict';
const assert = require('assert');
const V = require('../src/vhflog.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// 1. Frequenzwechsel: erst nach 3 s Ruhe, Zwischenwerte beim Drehen nicht, gleiche Frequenz nicht doppelt
{
  const L = new V.VhfLogger();
  const W0 = Date.UTC(2026, 10, 16, 9, 0, 0);
  L.feed({ kind: 'active', t: 0, wall: W0, ch: '122.255', name: 'BALLOON' });
  L.tick(W0 + 2900); ok(L.drain().length === 0, 'vor 3 s noch kein Eintrag');
  L.tick(W0 + 3000); let e = L.drain();
  ok(e.length === 1 && e[0].kind === 'frq' && e[0].ch === '122.255' && e[0].wall === W0 && V.noteOf(e[0]) === 'FRQ 122.255 BALLOON active', 'Startfrequenz nach 3 s: ' + JSON.stringify(e));
  // drehen: 124.700 → 124.705 → 124.710, dann 127.800 stehen lassen
  [['124.700', 10000], ['124.705', 10400], ['124.710', 10800], ['127.800', 11200]].forEach(([ch, dt]) => L.feed({ kind: 'active', t: dt, wall: W0 + dt, ch, name: '' }));
  L.tick(W0 + 13000); ok(L.drain().length === 0, 'während des Drehens nichts');
  L.tick(W0 + 14300); e = L.drain();
  ok(e.length === 1 && e[0].ch === '127.800' && e[0].wall === W0 + 11200, 'nur die stehen gebliebene 127.800');
  // hin und zurück innert 3 s: nichts
  L.feed({ kind: 'active', t: 20000, wall: W0 + 20000, ch: '118.100', name: 'ZURI T' });
  L.feed({ kind: 'active', t: 21000, wall: W0 + 21000, ch: '127.800', name: '' });
  L.tick(W0 + 30000); ok(L.drain().length === 0, 'kurz weg und zurück: kein Eintrag');
  // 2. Aussendungen: Dauer K→Y, auf der aktiven Frequenz, kurze ignoriert, fehlendes Ende
  L.feed({ kind: 'txon', t: 40000, wall: W0 + 40000 }); L.feed({ kind: 'txoff', t: 46240, wall: W0 + 46240 });
  e = L.drain();
  ok(e.length === 1 && e[0].kind === 'tx' && e[0].ms === 6240 && e[0].ch === '127.800' && V.noteOf(e[0]) === 'Tx 6.2 sec' && e[0].wall === W0 + 40000, 'Tx 6.2 sec auf 127.800');
  L.feed({ kind: 'txon', t: 50000, wall: W0 + 50000 }); L.feed({ kind: 'txoff', t: 50250, wall: W0 + 50250 });
  ok(L.drain().length === 0, 'Antippen (0,25 s) wird nicht protokolliert');
  L.feed({ kind: 'txon', t: 60000, wall: W0 + 60000 }); L.linkDown();
  e = L.drain(); ok(e.length === 1 && e[0].ms === null && V.noteOf(e[0]) === 'Tx ? sec (Ende nicht empfangen)', 'Verbindung weg während des Sendens');
  L.feed({ kind: 'txon', t: 70000, wall: W0 + 70000 }); L.feed({ kind: 'txon', t: 80000, wall: W0 + 80000 }); L.feed({ kind: 'txoff', t: 83000, wall: W0 + 83000 });
  e = L.drain(); ok(e.length === 2 && e[0].ms === null && e[1].ms === 3000, 'verpasstes Ende: alte offen, neue 3.0 s');
  ok(V.noteOf({ kind: 'tx', ms: 3000 }) === 'Tx 3.0 sec', 'Format eine Nachkommastelle');
}

// 3. Zeilen im Schema der Reporting-App
{
  const r = V.rowOf({ id: 'x1', kind: 'tx', wall: Date.UTC(2026, 10, 16, 10, 35, 42), ch: '127.800', name: 'ZURICH F', ms: 6240, pos: { lat: 47.1234567, lon: 8.5, alt: 1523.4 } }, { flight: 'GB27Test', call: 'HB-QPJ', device: 'KRT2-AB12' });
  ok(r.type === 'VHF' && r.note === 'Tx 6.2 sec' && r.atc_freq === '127.800' && r.atc_station === 'ZURICH F' && r.atc_dir === 'TX' && r.flight_id === 'GB27Test' && r.callsign === 'HB-QPJ', 'Spalten');
  ok(r.ts_utc === '2026-11-16T10:35:42.000Z' && /^2026-11-16T\d\d:35:42[+-]\d\d:\d\d$/.test(r.ts_local) && r.lat === 47.123457 && r.alt_gps_m === 1523 && r.source === 'krt2', 'Zeit, Position, Quelle');
  const f = V.rowOf({ kind: 'frq', wall: 0, ch: '124.700', name: '' }, {});
  ok(f.note === 'FRQ 124.700 active' && !('atc_dir' in f) && !('lat' in f) && /^[0-9a-f-]{36}$/.test(f.id), 'Frequenzzeile ohne Position, mit UUID');
}

// 4. Schreiben in gb_flight_data (nachgebautes GitHub)
function fakeGitHub(files, opt) {
  opt = opt || {};
  let shaN = 1, puts = 0;
  const sha = () => 's' + (shaN++);
  for (const k of Object.keys(files)) files[k] = { text: files[k], sha: sha() };
  const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, headers: { get: k => (headers || {})[k.toLowerCase()] || null }, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const fn = async (u, init) => {
    init = init || {};
    const path = decodeURI(u.split('/contents/')[1].split('?')[0]);
    if ((init.method || 'GET') === 'GET') {
      const f = files[path];
      if (!f) return res(404, { message: 'Not Found' });
      const size = Buffer.byteLength(f.text);
      if (init.headers.Accept === 'application/vnd.github.raw') return res(200, f.text);
      if (size > (opt.big || 1e6)) return res(200, { sha: f.sha, size, content: '', encoding: 'none' });
      return res(200, { sha: f.sha, size, content: Buffer.from(f.text).toString('base64'), encoding: 'base64' });
    }
    const b = JSON.parse(init.body); puts++;
    if (opt.conflictOnce && puts === 1) { files[path].text = JSON.stringify(JSON.parse(files[path].text).concat([{ id: 'rep-2', type: 'ATC', ts_utc: '2026-11-16T09:30:00.000Z' }]), null, 1); files[path].sha = sha(); }
    const cur = files[path];
    if (cur && cur.sha !== b.sha) return res(409, { message: 'conflict' });
    files[path] = { text: Buffer.from(b.content, 'base64').toString(), sha: sha() };
    fn.lastMsg = b.message;
    return res(200, { content: { sha: files[path].sha } });
  };
  fn.puts = () => puts;
  return fn;
}
const cfg = { repo: 'bwicki/gb_flight_data', branch: 'main', dir: 'data', token: 'test', device: 'KRT2-AB12' };
const setup = JSON.stringify({ flight: 'GB27 Test', call: 'HB-QPJ' });
const ev = (id, kind, min, extra) => Object.assign({ id, kind, wall: Date.UTC(2026, 10, 16, 9, min), ch: '127.800', name: 'ZURICH F', ms: kind === 'tx' ? 5100 : undefined }, extra || {});

(async () => {
  {
    const files = { 'data/_setup.json': setup, 'data/GB27-Test.json': JSON.stringify([{ id: 'rep-1', type: 'Ballast', ts_utc: '2026-11-16T09:10:00.000Z' }], null, 1) };
    const gh = fakeGitHub(files, { conflictOnce: true });
    const r = await V.flush({ cfg, fetch: gh, queue: [ev('a', 'frq', 5), ev('b', 'tx', 20)] });
    const t = JSON.parse(files['data/GB27-Test.json'].text);
    ok(r.flight === 'GB27 Test' && r.added === 2, 'Fahrt aus _setup.json, Dateiname wie die Reporting-App (GB27-Test.json)');
    ok(t.map(x => x.id).join() === 'a,rep-1,b,rep-2' && gh.puts() === 2, 'Konflikt: neu gelesen, Zeile der Reporting-App bleibt, nach Zeit sortiert: ' + t.map(x => x.id));
    ok(t.find(x => x.id === 'b').note === 'Tx 5.1 sec' && t.find(x => x.id === 'b').callsign === 'HB-QPJ', 'Inhalt der Zeile');
    const again = await V.flush({ cfg, fetch: gh, queue: [ev('a', 'frq', 5)] });
    ok(again.added === 0 && gh.puts() === 2, 'schon vorhanden: nichts schreiben');
  }
  {
    // gelöschte Zeilen nicht wieder schreiben; fehlende eigene Zeilen nachtragen (z. B. von einem anderen Gerät überschrieben)
    const files = { 'data/_setup.json': setup, 'data/GB27-Test.json': '[]', 'data/GB27-Test.deleted.json': JSON.stringify([{ id: 'del-1' }]) };
    const gh = fakeGitHub(files);
    const sent = [V.rowOf(ev('old-1', 'tx', 1), { flight: 'GB27 Test', call: 'HB-QPJ' }), V.rowOf(ev('del-1', 'tx', 2), { flight: 'GB27 Test' }), V.rowOf(ev('other', 'tx', 3), { flight: 'GB26' })];
    const r = await V.flush({ cfg, fetch: gh, queue: [ev('del-1', 'tx', 2)], sent });
    const t = JSON.parse(files['data/GB27-Test.json'].text);
    ok(r.added === 0 && r.healed === 1 && t.map(x => x.id).join() === 'old-1', 'nachgetragen: old-1; gelöscht bleibt gelöscht; andere Fahrt nicht');
  }
  {
    // Datei über 1 MB: Inhalt kommt roh, Anhängen funktioniert
    const big = Array.from({ length: 2600 }, (_, i) => ({ id: 'r' + i, type: 'VHF', ts_utc: '2026-11-16T08:' + String(i % 60).padStart(2, '0') + ':00.000Z', note: 'Tx 1.0 sec', pad: 'x'.repeat(300) }));
    const files = { 'data/_setup.json': setup, 'data/GB27-Test.json': JSON.stringify(big, null, 1) };
    ok(Buffer.byteLength(files['data/GB27-Test.json']) > 1e6, 'Testdatei grösser als 1 MB');
    const gh = fakeGitHub(files);
    const r = await V.flush({ cfg, fetch: gh, queue: [ev('n1', 'tx', 30)] });
    const t = JSON.parse(files['data/GB27-Test.json'].text);
    ok(r.added === 1 && t.length === 2601 && r.size > 1e6, 'grosse Datei: alle 2600 Zeilen behalten, neue dazu');
  }
  {
    // keine Fahrt in _setup.json → Fehler, nichts geschrieben; 401 → Fehler mit auth
    const gh = fakeGitHub({ 'data/_setup.json': '{}' });
    let err = null; try { await V.flush({ cfg, fetch: gh, queue: [ev('z', 'tx', 1)] }); } catch (e) { err = e; }
    ok(err && /Fahrt/.test(err.message) && gh.puts() === 0, 'ohne Fahrt kein Schreiben');
    const deny = async () => ({ status: 401, ok: false, headers: { get: () => null }, json: async () => ({}) });
    err = null; try { await V.flush({ cfg, fetch: deny, queue: [] }); } catch (e) { err = e; }
    ok(err && err.auth, 'Token abgelehnt → auth');
  }
  // 5. Protokoll: VHF und ATC nach Zeit, CSV
  {
    const rows = [{ type: 'Ballast', ts_utc: '3' }, { type: 'VHF', ts_utc: '2', note: 'Tx 2.0 sec', atc_freq: '127.800', source: 'krt2' }, { type: 'ATC', ts_utc: '1', atc_dir: 'RX', atc_station: 'Zurich Info', atc_msg: 'QNH 1013', reporter: 'Balthasar' }];
    const p = V.protocolRows(rows, true), csv = V.protocolCsv(p);
    ok(p.map(r => r.type).join() === 'ATC,VHF' && V.protocolRows(rows, false).length === 1, 'Protokoll mit/ohne ATC');
    ok(csv.split('\r\n')[0].startsWith('UTC;Lokal;Kategorie') && /"RX · QNH 1013"/.test(csv) && /"Tx 2.0 sec"/.test(csv), 'CSV');
  }
  console.log('vhflog: ' + n + ' Prüfungen bestanden');
})().catch(e => { console.error(e); process.exit(1); });
