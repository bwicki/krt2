-- krt2.wicki.aero – D1-Schema (wiederholbar: nur CREATE … IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  login      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'user',          -- 'super' | 'user'
  pw_hash    TEXT NOT NULL,
  pw_salt    TEXT NOT NULL,
  pw_iter    INTEGER NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created    TEXT NOT NULL,
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,                       -- SHA-256 des Tokens, das Token selbst wird nie gespeichert
  user_id    TEXT NOT NULL,
  created    TEXT NOT NULL,
  expires    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_fail (
  login TEXT PRIMARY KEY COLLATE NOCASE,
  n     INTEGER NOT NULL,
  until TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,
  owner       TEXT NOT NULL,
  bezeichnung TEXT NOT NULL,
  aktuell     TEXT,                                  -- JSON { plaetze[100], herkunft, zeit, configId, configName, version }
  created     TEXT NOT NULL,
  updated     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_owner ON devices(owner);

CREATE TABLE IF NOT EXISTS device_history (
  device_id TEXT NOT NULL,
  zeit      TEXT NOT NULL,
  aktuell   TEXT NOT NULL,
  PRIMARY KEY (device_id, zeit)
);

CREATE TABLE IF NOT EXISTS configs (
  id       TEXT PRIMARY KEY,
  owner    TEXT NOT NULL,
  name     TEXT NOT NULL,
  version  INTEGER NOT NULL,
  standort TEXT NOT NULL DEFAULT '',
  anzahl   INTEGER NOT NULL DEFAULT 0,
  data     TEXT NOT NULL,
  created  TEXT NOT NULL,
  updated  TEXT NOT NULL,
  deleted  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS configs_owner ON configs(owner);

CREATE TABLE IF NOT EXISTS config_versions (
  config_id TEXT NOT NULL,
  version   INTEGER NOT NULL,
  data      TEXT NOT NULL,
  saved     TEXT NOT NULL,
  PRIMARY KEY (config_id, version)
);
