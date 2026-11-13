// Ende-zu-Ende-Prüfung der API gegen einen laufenden Worker mit leerer Datenbank:
//   cd worker && npx wrangler dev --config wrangler.test.toml   (lokal, siehe SETUP.md)
//   node tests/worker.test.mjs [http://127.0.0.1:8787]
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../src/sample.js');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
let n = 0;
async function api(method, path, body, token, expect = 200) {
  const r = await fetch(BASE + path, { method, headers: Object.assign({ 'Content-Type': 'application/json', Origin: 'https://krt2.wicki.aero' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  assert.strictEqual(r.status, expect, `${method} ${path} → ${r.status} ${JSON.stringify(j)}`); n++;
  if (method !== 'OPTIONS') assert.strictEqual(r.headers.get('access-control-allow-origin'), 'https://krt2.wicki.aero', 'CORS');
  return j;
}

const h = await api('GET', '/api/health'); assert.ok(h.ok);
assert.deepStrictEqual(await api('GET', '/api/setup'), { needed: true, login: 'bwicki' });
await api('POST', '/api/setup', { password: 'abc' }, null, 400);
const su = await api('POST', '/api/setup', { password: 'geheim-12345', name: 'Balthasar Wicki' });
assert.strictEqual(su.user.role, 'super'); const T = su.token;
await api('POST', '/api/setup', { password: 'nochmal-12345' }, null, 409);
assert.strictEqual((await api('GET', '/api/me', null, T)).user.login, 'bwicki');
await api('GET', '/api/me', null, 'falsch', 401);

// Konten: nur Supermaster
const anna = (await api('POST', '/api/users', { login: 'Anna.M', name: 'Anna Muster', password: 'anfang-123' }, T)).user;
assert.strictEqual(anna.login, 'anna.m');
await api('POST', '/api/users', { login: 'anna.m', password: 'anfang-123' }, T, 409);
await api('POST', '/api/users', { login: 'x', password: 'anfang-123' }, T, 400);
const A = (await api('POST', '/api/login', { login: 'ANNA.M', password: 'anfang-123' })).token;
await api('GET', '/api/users', null, A, 403);
await api('POST', '/api/users', { login: 'otto', password: 'anfang-123' }, A, 403);
assert.strictEqual((await api('GET', '/api/users', null, T)).users.length, 2);
await api('POST', '/api/me/password', { old: 'falsch', neu: 'neues-kennwort' }, A, 403);
await api('POST', '/api/me/password', { old: 'anfang-123', neu: 'neues-kennwort' }, A);
await api('POST', '/api/login', { login: 'anna.m', password: 'anfang-123' }, null, 401);
const A2 = (await api('POST', '/api/login', { login: 'anna.m', password: 'neues-kennwort' })).token;

// Sperre nach fünf Fehlversuchen
for (let i = 0; i < 5; i++) await api('POST', '/api/login', { login: 'otto-nicht', password: 'x' }, null, 401);
await api('POST', '/api/login', { login: 'otto-nicht', password: 'x' }, null, 429);

// Geräte: öffentlich lesbar, ändern nur Besitzer
const d = (await api('POST', '/api/devices', { bezeichnung: 'KRT2-S 50001110T' }, T)).device;
await api('POST', '/api/devices', { bezeichnung: 'x' }, null, 401);
const list = (await api('GET', '/api/devices')).devices;
assert.strictEqual(list.length, 1); assert.strictEqual(list[0].owner.login, 'bwicki'); assert.strictEqual(list[0].aktuell, null);
await api('PATCH', '/api/devices/' + d.id, { bezeichnung: 'fremd' }, A2, 403);
await api('PATCH', '/api/devices/' + d.id, { bezeichnung: 'KRT2-S HB-QXY' }, T);
const pl = Array.from({ length: 100 }, (_, i) => ({ nr: i, ch: i === 99 ? '121.500' : '118.000', name: i === 99 ? 'EMERGENC' : 'FREE' }));
await api('PUT', `/api/devices/${d.id}/aktuell`, { plaetze: pl.slice(0, 99) }, T, 400);
await api('PUT', `/api/devices/${d.id}/aktuell`, { plaetze: pl, herkunft: 'ausgelesen', configName: 'Test' }, T);
const dg = (await api('GET', '/api/devices/' + d.id)).device;
assert.strictEqual(dg.aktuell.plaetze.length, 100); assert.strictEqual(dg.aktuell.herkunft, 'ausgelesen');
assert.ok(!('plaetze' in (await api('GET', '/api/devices')).devices[0].aktuell), 'Liste ohne Plätze');

// Konfigurationen: alle sehen, Besitzer ändert, andere kopieren; Versionen
const cfg = S.sampleConfig();
const c1 = (await api('POST', '/api/configs', { name: 'Zürich Nord', data: cfg }, T)).config;
assert.strictEqual(c1.version, 1); assert.strictEqual(c1.anzahl, cfg.eintraege.filter(e => e.aktiv).length); assert.strictEqual(c1.standort, cfg.standort.name);
await api('GET', '/api/configs', null, null, 401);
assert.strictEqual((await api('GET', '/api/configs', null, A2)).configs.length, 1);
await api('PUT', '/api/configs/' + c1.id, { data: cfg, baseVersion: 1 }, A2, 403);
cfg.eintraege[0].klar = 'geändert';
const c2 = (await api('PUT', '/api/configs/' + c1.id, { data: cfg, baseVersion: 1 }, T)).config;
assert.strictEqual(c2.version, 2); assert.strictEqual(c2.data.eintraege[0].klar, 'geändert');
await api('PUT', '/api/configs/' + c1.id, { data: cfg, baseVersion: 1 }, T, 409);
await api('PUT', '/api/configs/' + c1.id, { data: { a: 1 }, baseVersion: 2 }, T, 400);
assert.deepStrictEqual((await api('GET', `/api/configs/${c1.id}/versions`, null, A2)).versions.map(v => v.version), [2, 1]);
assert.notStrictEqual((await api('GET', `/api/configs/${c1.id}/versions/1`, null, A2)).data.eintraege[0].klar, 'geändert');
const kop = (await api('POST', `/api/configs/${c1.id}/copy`, {}, A2)).config;
assert.strictEqual(kop.owner.login, 'anna.m'); assert.strictEqual(kop.data.kopieVon.id, c1.id); assert.strictEqual(kop.version, 1);
await api('DELETE', '/api/configs/' + c1.id, null, A2, 403);
await api('DELETE', '/api/configs/' + kop.id, null, A2);
await api('GET', '/api/configs/' + kop.id, null, A2, 404);

// Sperren, Kennwort zurücksetzen
await api('PATCH', '/api/users/' + anna.id, { active: false }, T);
await api('GET', '/api/me', null, A2, 401);
await api('PATCH', '/api/users/' + su.user.id, { active: false }, T, 400);
await api('PATCH', '/api/users/' + anna.id, { active: true, password: 'zurueckgesetzt' }, T);
await api('POST', '/api/login', { login: 'anna.m', password: 'zurueckgesetzt' });
await api('POST', '/api/logout', null, T);
await api('GET', '/api/me', null, T, 401);
await api('GET', '/api/nichts', null, null, 404);
console.log(n + ' API-Prüfungen bestanden');
