/* krt2.wicki.aero – Zugriff auf die API (Worker). Token und Konto bleiben im Browser gespeichert (angemeldet bleiben). */
(function (root) {
  'use strict';
  const LS_T = 'krt2.token', LS_U = 'krt2.user';
  let token = null, user = null;
  try { token = localStorage.getItem(LS_T); user = JSON.parse(localStorage.getItem(LS_U) || 'null'); } catch (e) { /* ohne Speicher */ }
  const base = () => String((root.KRT2CONFIG || {}).apiBase || '').replace(/\/+$/, '');
  class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  function setSession(t, u) {
    token = t; user = u;
    try { if (t) localStorage.setItem(LS_T, t); else localStorage.removeItem(LS_T); if (u) localStorage.setItem(LS_U, JSON.stringify(u)); else localStorage.removeItem(LS_U); } catch (e) { /* egal */ }
  }
  async function call(method, path, body) {
    if (!base()) throw new ApiError(0, 'offline', 'Keine API eingerichtet');
    let r;
    try {
      r = await fetch(base() + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) { throw new ApiError(0, 'network', 'Server nicht erreichbar (' + e.message + ')'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && token && path !== '/api/login') { setSession(null, null); if (root.KRT2API.onLogout) root.KRT2API.onLogout(); }
    if (!r.ok) throw new ApiError(r.status, j.error || 'http', j.message || ('HTTP ' + r.status));
    return j;
  }
  root.KRT2API = {
    ApiError, onLogout: null,
    get enabled() { return !!base(); }, get user() { return user; }, get base() { return base(); },
    health: () => call('GET', '/api/health'),
    setupNeeded: () => call('GET', '/api/setup').then(j => j.needed),
    async setup(password, name) { const j = await call('POST', '/api/setup', { password, name }); setSession(j.token, j.user); return j.user; },
    async login(login, password) { const j = await call('POST', '/api/login', { login, password }); setSession(j.token, j.user); return j.user; },
    async logout() { try { await call('POST', '/api/logout'); } catch (e) { /* trotzdem abmelden */ } setSession(null, null); },
    async me() { const j = await call('GET', '/api/me'); setSession(token, j.user); return j.user; },
    changePw: (old, neu) => call('POST', '/api/me/password', { old, neu }),
    users: () => call('GET', '/api/users').then(j => j.users),
    createUser: o => call('POST', '/api/users', o).then(j => j.user),
    patchUser: (id, o) => call('PATCH', '/api/users/' + id, o),
    devices: () => call('GET', '/api/devices').then(j => j.devices),
    device: id => call('GET', '/api/devices/' + id).then(j => j.device),
    createDevice: b => call('POST', '/api/devices', { bezeichnung: b }).then(j => j.device),
    renameDevice: (id, b) => call('PATCH', '/api/devices/' + id, { bezeichnung: b }).then(j => j.device),
    deleteDevice: id => call('DELETE', '/api/devices/' + id),
    setAktuell: (id, a) => call('PUT', '/api/devices/' + id + '/aktuell', a).then(j => j.device),
    sicherung: id => call('GET', '/api/devices/' + id + '/sicherung').then(j => j.sicherung),
    configs: () => call('GET', '/api/configs').then(j => j.configs),
    config: id => call('GET', '/api/configs/' + id).then(j => j.config),
    createConfig: (name, data) => call('POST', '/api/configs', { name, data }).then(j => j.config),
    saveConfig: (id, name, data, baseVersion) => call('PUT', '/api/configs/' + id, { name, data, baseVersion }).then(j => j.config),
    copyConfig: (id, name) => call('POST', '/api/configs/' + id + '/copy', name ? { name } : {}).then(j => j.config),
    deleteConfig: id => call('DELETE', '/api/configs/' + id),
    versions: id => call('GET', '/api/configs/' + id + '/versions').then(j => j.versions)
  };
})(typeof self !== 'undefined' ? self : this);
