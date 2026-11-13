// krt2.wicki.aero – API (Cloudflare Worker + D1)
// Konten legt nur der Supermaster an (E26). Konfigurationen sehen alle angemeldeten Konten und übernehmen sie als
// Kopie; ändern kann nur der Besitzer (E27). Geräte und ihre aktuelle Programmierung sind ohne Anmeldung lesbar (E7/E28).
// Kennwörter: PBKDF2-SHA-256 (100 000 Runden, Höchstwert der Workers-Laufzeit). Sitzungen: zufälliges Token, in D1 nur
// als SHA-256 gespeichert – deshalb braucht der Worker kein eigenes Secret.

const VERSION = '0.4.1';
const SUPER_LOGIN = 'bwicki';
const PBKDF2_ITER = 100000;
const SESSION_DAYS = 180;
const MAX_FAIL = 5, LOCK_MIN = 5;
const MAX_CONFIG_BYTES = 300 * 1024;

class HttpError extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }
const bad = (code, msg) => new HttpError(400, code, msg);

export default {
  async fetch(req, env) {
    const cors = corsHeaders(env, req.headers.get('Origin') || '');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try { res = await route(req, env, new URL(req.url)); }
    catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e && e.stack || e);
      res = json({ ok: false, error: e instanceof HttpError ? e.code : 'server', message: e instanceof HttpError ? e.message : 'Interner Fehler' }, status);
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }
};

function corsHeaders(env, origin) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = { 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
const now = () => new Date().toISOString();
async function body(req) { try { return await req.json(); } catch { throw bad('json', 'Ungültige Anfrage (JSON erwartet)'); } }

// ---------- Kryptografie ----------
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
function rand(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
function newId(prefix) { return prefix + '-' + b64u(rand(9)).replace(/[-_]/g, 'x'); }
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function pbkdf2(pw, saltB64, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  return b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
async function hashPw(pw) { const salt = btoa(String.fromCharCode(...rand(16))); return { pw_salt: salt, pw_iter: PBKDF2_ITER, pw_hash: await pbkdf2(pw, salt, PBKDF2_ITER) }; }
function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

// ---------- Prüfungen ----------
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
function checkLogin(s) { const l = String(s || '').trim().toLowerCase(); if (!LOGIN_RE.test(l)) throw bad('login', 'Konto: 3–32 Zeichen, a–z, 0–9, Punkt, Bindestrich, Unterstrich'); return l; }
function checkPw(s) { const p = String(s || ''); if (p.length < 4) throw bad('password', 'Kennwort: mindestens 4 Zeichen'); if (p.length > 200) throw bad('password', 'Kennwort zu lang'); return p; }
function checkText(s, max, code) { const t = String(s == null ? '' : s).trim(); if (t.length > max) throw bad(code, `höchstens ${max} Zeichen`); return t; }
function checkConfig(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.eintraege) || !Array.isArray(data.bloecke)) throw bad('config', 'keine KRT2-Konfiguration');
  const s = JSON.stringify(data);
  if (s.length > MAX_CONFIG_BYTES) throw bad('config', 'Konfiguration zu gross');
  return s;
}
const FREQ_RE = /^1[1-3]\d\.\d{3}$/;
function checkPlaetze(p) {
  if (!Array.isArray(p) || p.length !== 100) throw bad('plaetze', '100 Plätze erwartet');
  return p.map((x, i) => {
    const ch = String(x && x.ch || ''), name = String(x && x.name || '');
    if (!FREQ_RE.test(ch) || name.length > 8 || !/^[A-Z0-9 \-]*$/.test(name)) throw bad('plaetze', `Platz ${i}: ungültig`);
    const o = { nr: i, ch, name };
    for (const [k, max] of [['klar', 60], ['dienst', 8], ['block', 20], ['kind', 8], ['cc', 2]]) if (x[k] != null) o[k] = String(x[k]).slice(0, max);
    return o;
  });
}

// ---------- Sitzung ----------
async function auth(req, env, need = true) {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.get('Authorization') || '');
  if (m) {
    const row = await env.DB.prepare('SELECT u.id, u.login, u.name, u.role, u.active, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
      .bind(await sha256(m[1])).first();
    if (row && row.active && row.expires > now()) return { id: row.id, login: row.login, name: row.name, role: row.role };
  }
  if (need) throw new HttpError(401, 'auth', 'Bitte anmelden');
  return null;
}
async function newSession(env, userId) {
  const token = b64u(rand(32));
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, now(), exp).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now()).run();
  return token;
}
const pubUser = u => ({ id: u.id, login: u.login, name: u.name, role: u.role });
const needSuper = u => { if (u.role !== 'super') throw new HttpError(403, 'forbidden', 'Nur für den Supermaster'); };

// ---------- Routen ----------
async function route(req, env, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const M = req.method;
  let m;
  if (p === '/api/health' && M === 'GET') {
    let db = 'ok';
    try { const r = await env.DB.prepare('SELECT COUNT(*) n FROM users').first(); db = `ok (${r.n} Konten)`; } catch (e) { db = 'Fehler: ' + e.message; }
    return json({ ok: true, version: VERSION, db, time: now() });
  }
  if (p === '/api/setup' && M === 'GET') return json({ needed: await setupNeeded(env), login: SUPER_LOGIN });
  if (p === '/api/setup' && M === 'POST') return setup(req, env);
  if (p === '/api/login' && M === 'POST') return login(req, env);
  if (p === '/api/logout' && M === 'POST') {
    const m2 = /^Bearer\s+(\S+)$/.exec(req.headers.get('Authorization') || '');
    if (m2) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m2[1])).run();
    return json({ ok: true });
  }
  if (p === '/api/me' && M === 'GET') return json({ user: pubUser(await auth(req, env)) });
  if (p === '/api/me/password' && M === 'POST') return changePw(req, env);

  if (p === '/api/users' && M === 'GET') { needSuper(await auth(req, env)); return listUsers(env); }
  if (p === '/api/users' && M === 'POST') { needSuper(await auth(req, env)); return createUser(req, env); }
  if ((m = /^\/api\/users\/([\w-]+)$/.exec(p)) && M === 'PATCH') { const u = await auth(req, env); needSuper(u); return patchUser(req, env, m[1], u); }

  if (p === '/api/devices' && M === 'GET') return listDevices(env);
  if (p === '/api/devices' && M === 'POST') return createDevice(req, env, await auth(req, env));
  if ((m = /^\/api\/devices\/([\w-]+)$/.exec(p))) {
    if (M === 'GET') return getDevice(env, m[1]);
    if (M === 'PATCH') return patchDevice(req, env, m[1], await auth(req, env));
    if (M === 'DELETE') return deleteDevice(env, m[1], await auth(req, env));
  }
  if ((m = /^\/api\/devices\/([\w-]+)\/aktuell$/.exec(p)) && M === 'PUT') return putAktuell(req, env, m[1], await auth(req, env));
  if ((m = /^\/api\/devices\/([\w-]+)\/sicherung$/.exec(p)) && M === 'GET') return getSicherung(env, m[1]);

  if (p === '/api/configs' && M === 'GET') { await auth(req, env); return listConfigs(env); }
  if (p === '/api/configs' && M === 'POST') return createConfig(req, env, await auth(req, env));
  if ((m = /^\/api\/configs\/([\w-]+)$/.exec(p))) {
    const u = await auth(req, env);
    if (M === 'GET') return getConfig(env, m[1]);
    if (M === 'PUT') return putConfig(req, env, m[1], u);
    if (M === 'DELETE') return deleteConfig(env, m[1], u);
  }
  if ((m = /^\/api\/configs\/([\w-]+)\/copy$/.exec(p)) && M === 'POST') return copyConfig(req, env, m[1], await auth(req, env));
  if ((m = /^\/api\/configs\/([\w-]+)\/versions$/.exec(p)) && M === 'GET') { await auth(req, env); return listVersions(env, m[1]); }
  if ((m = /^\/api\/configs\/([\w-]+)\/versions\/(\d+)$/.exec(p)) && M === 'GET') { await auth(req, env); return getVersion(env, m[1], +m[2]); }
  throw new HttpError(404, 'notfound', 'Unbekannte Adresse');
}

// ---------- Konten ----------
async function setupNeeded(env) { const r = await env.DB.prepare('SELECT COUNT(*) n FROM users').first(); return r.n === 0; }
async function setup(req, env) {
  const b = await body(req);
  if (!(await setupNeeded(env))) throw new HttpError(409, 'done', 'Supermaster ist bereits eingerichtet');
  const pw = checkPw(b.password);
  const id = newId('u');
  const h = await hashPw(pw);
  await env.DB.prepare('INSERT INTO users (id, login, name, role, pw_hash, pw_salt, pw_iter, created, last_login) VALUES (?, ?, ?, \'super\', ?, ?, ?, ?, ?)')
    .bind(id, SUPER_LOGIN, checkText(b.name || 'Balthasar Wicki', 80, 'name'), h.pw_hash, h.pw_salt, h.pw_iter, now(), now()).run();
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ token: await newSession(env, id), user: pubUser(user) });
}
async function login(req, env) {
  const b = await body(req);
  const l = String(b.login || '').trim().toLowerCase();
  const fail = await env.DB.prepare('SELECT n, until FROM login_fail WHERE login = ?').bind(l).first();
  if (fail && fail.until && fail.until > now()) throw new HttpError(429, 'locked', `Zu viele Fehlversuche – bitte ${LOCK_MIN} Minuten warten`);
  const u = await env.DB.prepare('SELECT * FROM users WHERE login = ?').bind(l).first();
  const ok = u && u.active && same(await pbkdf2(String(b.password || ''), u.pw_salt, u.pw_iter), u.pw_hash);
  if (!ok) {
    const n = (fail && (!fail.until || fail.until <= now()) ? fail.n : 0) + 1;
    const until = n >= MAX_FAIL ? new Date(Date.now() + LOCK_MIN * 6e4).toISOString() : null;
    await env.DB.prepare('INSERT INTO login_fail (login, n, until) VALUES (?, ?, ?) ON CONFLICT(login) DO UPDATE SET n = excluded.n, until = excluded.until').bind(l, until ? 0 : n, until).run();
    throw new HttpError(401, 'wrong', 'Konto oder Kennwort falsch');
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_fail WHERE login = ?').bind(l),
    env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(now(), u.id)
  ]);
  return json({ token: await newSession(env, u.id), user: pubUser(u) });
}
async function changePw(req, env) {
  const me = await auth(req, env);
  const b = await body(req);
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(me.id).first();
  if (!same(await pbkdf2(String(b.old || ''), u.pw_salt, u.pw_iter), u.pw_hash)) throw new HttpError(403, 'wrong', 'Bisheriges Kennwort falsch');
  const h = await hashPw(checkPw(b.neu));
  await env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iter = ? WHERE id = ?').bind(h.pw_hash, h.pw_salt, h.pw_iter, me.id).run();
  return json({ ok: true });
}
async function listUsers(env) {
  const r = await env.DB.prepare(`SELECT u.id, u.login, u.name, u.role, u.active, u.created, u.last_login,
      (SELECT COUNT(*) FROM configs c WHERE c.owner = u.id AND c.deleted = 0) configs,
      (SELECT COUNT(*) FROM devices d WHERE d.owner = u.id) devices
    FROM users u ORDER BY u.role DESC, u.login`).all();
  return json({ users: r.results });
}
async function createUser(req, env) {
  const b = await body(req);
  const l = checkLogin(b.login);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE login = ?').bind(l).first()) throw new HttpError(409, 'exists', 'Konto existiert bereits');
  const h = await hashPw(checkPw(b.password));
  const id = newId('u');
  await env.DB.prepare('INSERT INTO users (id, login, name, role, pw_hash, pw_salt, pw_iter, created) VALUES (?, ?, ?, \'user\', ?, ?, ?, ?)')
    .bind(id, l, checkText(b.name, 80, 'name'), h.pw_hash, h.pw_salt, h.pw_iter, now()).run();
  return json({ user: { id, login: l, name: b.name || '', role: 'user', active: 1 } });
}
async function patchUser(req, env, id, me) {
  const b = await body(req);
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!u) throw new HttpError(404, 'notfound', 'Konto nicht gefunden');
  const st = [];
  if (b.name != null) st.push(env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(checkText(b.name, 80, 'name'), id));
  if (b.active != null) {
    if (u.id === me.id) throw bad('self', 'Das eigene Konto lässt sich nicht sperren');
    st.push(env.DB.prepare('UPDATE users SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, id));
    if (!b.active) st.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
  }
  if (b.password != null) {
    const h = await hashPw(checkPw(b.password));
    st.push(env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iter = ? WHERE id = ?').bind(h.pw_hash, h.pw_salt, h.pw_iter, id));
    st.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
  }
  if (st.length) await env.DB.batch(st);
  return json({ ok: true });
}

// ---------- Geräte ----------
function devOut(r, full) {
  const a = r.aktuell ? JSON.parse(r.aktuell) : null;
  const aktuell = a ? (full ? a : { zeit: a.zeit, herkunft: a.herkunft, configId: a.configId || null, configName: a.configName || '', version: a.version || null }) : null;
  return { id: r.id, bezeichnung: r.bezeichnung, owner: { id: r.owner, login: r.login, name: r.oname }, aktuell, updated: r.updated };
}
const DEV_SQL = 'SELECT d.*, u.login, u.name oname FROM devices d JOIN users u ON u.id = d.owner';
async function listDevices(env) { const r = await env.DB.prepare(DEV_SQL + ' ORDER BY d.bezeichnung COLLATE NOCASE').all(); return json({ devices: r.results.map(x => devOut(x, false)) }); }
async function getDevice(env, id) { const r = await env.DB.prepare(DEV_SQL + ' WHERE d.id = ?').bind(id).first(); if (!r) throw new HttpError(404, 'notfound', 'Gerät nicht gefunden'); return json({ device: devOut(r, true) }); }
async function ownDevice(env, id, me) {
  const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(id).first();
  if (!d) throw new HttpError(404, 'notfound', 'Gerät nicht gefunden');
  if (d.owner !== me.id) throw new HttpError(403, 'forbidden', 'Nur der Besitzer kann das Gerät ändern');
  return d;
}
async function createDevice(req, env, me) {
  const b = await body(req);
  const name = checkText(b.bezeichnung, 60, 'bezeichnung'); if (!name) throw bad('bezeichnung', 'Bezeichnung fehlt');
  const id = newId('d');
  await env.DB.prepare('INSERT INTO devices (id, owner, bezeichnung, created, updated) VALUES (?, ?, ?, ?, ?)').bind(id, me.id, name, now(), now()).run();
  return getDevice(env, id);
}
async function patchDevice(req, env, id, me) {
  await ownDevice(env, id, me);
  const b = await body(req);
  const name = checkText(b.bezeichnung, 60, 'bezeichnung'); if (!name) throw bad('bezeichnung', 'Bezeichnung fehlt');
  await env.DB.prepare('UPDATE devices SET bezeichnung = ?, updated = ? WHERE id = ?').bind(name, now(), id).run();
  return getDevice(env, id);
}
async function deleteDevice(env, id, me) {
  await ownDevice(env, id, me);
  await env.DB.batch([env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(id), env.DB.prepare('DELETE FROM device_history WHERE device_id = ?').bind(id)]);
  return json({ ok: true });
}
/** Aktuelle Programmierung eines Geräts festhalten (ab 0.4.0 nach dem Schreiben oder Auslesen). */
async function putAktuell(req, env, id, me) {
  await ownDevice(env, id, me);
  const b = await body(req);
  const a = {
    plaetze: checkPlaetze(b.plaetze), herkunft: b.herkunft === 'ausgelesen' ? 'ausgelesen' : 'geschrieben', zeit: now(),
    configId: b.configId ? String(b.configId).slice(0, 40) : null, configName: checkText(b.configName, 80, 'configName'),
    version: Number.isInteger(b.version) ? b.version : null, quittiert: Number.isInteger(b.quittiert) ? b.quittiert : null, von: me.login
  };
  const s = JSON.stringify(a);
  await env.DB.batch([
    env.DB.prepare('UPDATE devices SET aktuell = ?, updated = ? WHERE id = ?').bind(s, a.zeit, id),
    env.DB.prepare('INSERT INTO device_history (device_id, zeit, aktuell) VALUES (?, ?, ?)').bind(id, a.zeit, s)
  ]);
  return getDevice(env, id);
}

/** Letzte Sicherung eines Geräts (jüngster Stand mit Herkunft «ausgelesen» im Verlauf) – zum Zurückschreiben (ab 0.4.1). */
async function getSicherung(env, id) {
  const d = await env.DB.prepare('SELECT id FROM devices WHERE id = ?').bind(id).first();
  if (!d) throw new HttpError(404, 'notfound', 'Gerät nicht gefunden');
  const r = await env.DB.prepare("SELECT aktuell FROM device_history WHERE device_id = ? AND json_extract(aktuell, '$.herkunft') = 'ausgelesen' ORDER BY zeit DESC LIMIT 1").bind(id).first();
  return json({ sicherung: r ? JSON.parse(r.aktuell) : null });
}

// ---------- Konfigurationen ----------
const CFG_LIST = `SELECT c.id, c.name, c.version, c.standort, c.anzahl, c.created, c.updated, c.owner, u.login, u.name oname
  FROM configs c JOIN users u ON u.id = c.owner WHERE c.deleted = 0`;
const cfgMeta = r => ({ id: r.id, name: r.name, version: r.version, standort: r.standort, anzahl: r.anzahl, created: r.created, updated: r.updated, owner: { id: r.owner, login: r.login, name: r.oname } });
function summary(data) { return { standort: checkText(data.standort && data.standort.name || '', 120, 'standort'), anzahl: data.eintraege.filter(e => e && e.aktiv).length }; }
async function listConfigs(env) { const r = await env.DB.prepare(CFG_LIST + ' ORDER BY c.updated DESC').all(); return json({ configs: r.results.map(cfgMeta) }); }
async function loadCfg(env, id) {
  const r = await env.DB.prepare(`SELECT c.*, u.login, u.name oname FROM configs c JOIN users u ON u.id = c.owner WHERE c.id = ? AND c.deleted = 0`).bind(id).first();
  if (!r) throw new HttpError(404, 'notfound', 'Konfiguration nicht gefunden');
  return r;
}
async function getConfig(env, id) { const r = await loadCfg(env, id); return json({ config: Object.assign(cfgMeta(r), { data: JSON.parse(r.data) }) }); }
async function insertCfg(env, me, name, data) {
  const s = checkConfig(data);
  const sum = summary(data);
  const id = newId('c'), t = now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO configs (id, owner, name, version, standort, anzahl, data, created, updated) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)').bind(id, me.id, name, sum.standort, sum.anzahl, s, t, t),
    env.DB.prepare('INSERT INTO config_versions (config_id, version, data, saved) VALUES (?, 1, ?, ?)').bind(id, s, t)
  ]);
  return getConfig(env, id);
}
async function createConfig(req, env, me) {
  const b = await body(req);
  const name = checkText(b.name, 80, 'name'); if (!name) throw bad('name', 'Name fehlt');
  return insertCfg(env, me, name, b.data);
}
async function putConfig(req, env, id, me) {
  const r = await loadCfg(env, id);
  if (r.owner !== me.id) throw new HttpError(403, 'forbidden', 'Ändern kann nur, wer die Konfiguration angelegt hat – bitte als Kopie übernehmen');
  const b = await body(req);
  if (b.baseVersion !== r.version) throw new HttpError(409, 'conflict', `Inzwischen gibt es Version ${r.version} – bitte neu laden oder als Kopie speichern`);
  const name = checkText(b.name || r.name, 80, 'name');
  const s = checkConfig(b.data), sum = summary(b.data), v = r.version + 1, t = now();
  const res = await env.DB.batch([
    env.DB.prepare('UPDATE configs SET name = ?, version = ?, standort = ?, anzahl = ?, data = ?, updated = ? WHERE id = ? AND version = ?').bind(name, v, sum.standort, sum.anzahl, s, t, id, r.version),
    env.DB.prepare('INSERT INTO config_versions (config_id, version, data, saved) VALUES (?, ?, ?, ?)').bind(id, v, s, t)
  ]);
  if (!res[0].meta.changes) throw new HttpError(409, 'conflict', 'Gleichzeitig geändert – bitte neu laden');
  return getConfig(env, id);
}
async function copyConfig(req, env, id, me) {
  const r = await loadCfg(env, id);
  const b = await body(req).catch(() => ({}));
  const data = JSON.parse(r.data);
  const name = checkText(b.name || (r.owner === me.id ? r.name + ' (Kopie)' : r.name), 80, 'name');
  data.name = name;
  data.kopieVon = { id: r.id, version: r.version, owner: r.login };
  return insertCfg(env, me, name, data);
}
async function deleteConfig(env, id, me) {
  const r = await loadCfg(env, id);
  if (r.owner !== me.id) throw new HttpError(403, 'forbidden', 'Löschen kann nur, wer die Konfiguration angelegt hat');
  await env.DB.prepare('UPDATE configs SET deleted = 1, updated = ? WHERE id = ?').bind(now(), id).run();
  return json({ ok: true });
}
async function listVersions(env, id) {
  await loadCfg(env, id);
  const r = await env.DB.prepare('SELECT version, saved FROM config_versions WHERE config_id = ? ORDER BY version DESC').bind(id).all();
  return json({ versions: r.results });
}
async function getVersion(env, id, v) {
  await loadCfg(env, id);
  const r = await env.DB.prepare('SELECT version, saved, data FROM config_versions WHERE config_id = ? AND version = ?').bind(id, v).first();
  if (!r) throw new HttpError(404, 'notfound', 'Version nicht gefunden');
  return json({ version: r.version, saved: r.saved, data: JSON.parse(r.data) });
}
