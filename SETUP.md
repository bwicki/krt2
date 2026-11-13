# Einrichtung – Konten und Speicher (Cloudflare Worker + D1)

Alles im Browser, ohne Kommandozeile. Schlüssel und Kennwörter nie in Dateien des Repositories schreiben und nie im
Chat weitergeben.

## 1 Cloudflare-Token und Secrets (erledigt am 13.11.2026)

1. Cloudflare → My Profile → **API Tokens** → **Create Token** → Vorlage **«Edit Cloudflare Workers»**.
   In der Konto-Regel zusätzlich **D1 → Edit** setzen. **IP Address Filtering leer lassen** (GitHub-Server haben
   wechselnde Adressen). Token sofort kopieren – es wird nur einmal gezeigt.
2. GitHub `bwicki/krt2` → **Settings → Secrets and variables → Actions → New repository secret**:
   `CLOUDFLARE_API_TOKEN` (das Token) und `CLOUDFLARE_ACCOUNT_ID` (Cloudflare → Workers & Pages → rechts «Account ID»).

## 2 Worker einrichten: Workflow «Setup worker»

1. GitHub → **Actions** → links **Setup worker** → rechts **Run workflow** → `api_base` auf `auto` lassen →
   grüner Knopf **Run workflow**.
2. Der Lauf dauert 1–2 Minuten: D1-Datenbank `krt2` anlegen, `database_id` in `worker/wrangler.toml` eintragen,
   Schema einspielen, Worker `krt2-api` deployen, `/api/health` prüfen, die Adresse
   `https://krt2-api.<konto>.workers.dev` in `src/config.js` eintragen (Commit «Setup worker: …»).
3. Bricht ein Schritt ab, steht die Ursache rot im Protokoll (meist Token ohne «D1 Edit» oder mit IP-Filter).
   Der Workflow ist wiederholbar.

Danach deployt **Deploy worker** jede Änderung unter `worker/` automatisch und spielt das Schema nach.

## 3 Supermaster einrichten (einmal, gleich nach Schritt 2)

1. https://krt2.wicki.aero öffnen (GitHub Pages braucht nach dem Commit 1–2 Minuten; notfalls neu laden).
2. Oben rechts **Anmelden** → es erscheint **«Supermaster einrichten»** → Kennwort zweimal eingeben → **Einrichten**.
   Das Konto heisst `bwicki`. Kennwort im Passwortmanager ablegen.
3. Solange kein Konto besteht, kann das erste Konto jeder einrichten, der die Seite öffnet – deshalb diesen Schritt
   direkt nach Schritt 2 erledigen.

## 4 Konten für Kolleginnen und Kollegen

**Konten** (nur für den Supermaster sichtbar) → Konto, Name, Anfangskennwort (vorgeschlagen) → **Konto anlegen**.
Die Meldung zeigt Konto und Anfangskennwort zum Kopieren. Die Person ändert das Kennwort nach der ersten Anmeldung
(oben rechts auf den Kontonamen → Kennwort ändern). Vergessenes Kennwort: **Kennwort zurücksetzen**.

## 5 Was wo liegt

| Daten | Ort | sichtbar für |
|---|---|---|
| Entwurf im Editor | Browser (localStorage) | nur dieses Gerät |
| Konfigurationen mit Versionen | D1 `configs`, `config_versions` | alle Konten (Kopie übernehmen), ändern nur Besitzer |
| Geräte und ihre aktuelle Programmierung | D1 `devices`, `device_history` | alle, auch ohne Anmeldung (Startseite) |
| Konten, Sitzungen | D1 `users`, `sessions` (Kennwörter PBKDF2, Sitzungen nur als SHA-256) | Supermaster |

Lokale Prüfung (für Entwickler): `cd worker && npm ci && npx wrangler d1 execute krt2 --local --config wrangler.test.toml --file=schema.sql && npx wrangler dev --config wrangler.test.toml`
(`wrangler.test.toml` = `wrangler.toml` mit beliebiger `database_id`), dann `node tests/worker.test.mjs`.
