# KRT2-Speicherplätze — krt2.wicki.aero

Programmiert die 100 Speicherplätze des Flugfunkgeräts TQ KRT2 über die RS-232-Fernsteuerschnittstelle:
Frequenzen für ein auf der Karte markiertes Gebiet (Kreis, Rechteck, Vieleck, Korridor) aus öffentlichen
Quellen zusammenstellen, in konfigurierbaren Blöcken auf die Plätze verteilen, bearbeiten, speichern und ins
Funkgerät schreiben. Die Startseite zeigt die aktuelle Programmierung eines Geräts — ohne Anmeldung und
auch offline im Korb — und druckt sie auf eine A6-Karte. Zweisprachig DE/EN.

**Live:** https://krt2.wicki.aero · **Repository:** https://github.com/bwicki/krt2
**Stack (geplant):** HTML/CSS/JS ohne Build-Schritt (ES-Module, GitHub Pages aus dem Repository-Stamm),
Web Serial (Chrome/Edge am Laptop), Leaflet/OSM, Cloudflare Worker mit D1, IBM Plex. Gestaltung wie
analyze.wicki.aero.

> **Hilfsmittel ohne Gewähr.** Frequenzen aus öffentlichen Quellen können falsch oder veraltet sein.
> Massgebend sind AIP, VFR-Manual, NOTAM und die Handbücher des Funkgeräts.

Stand: **App 0.1.0** (Editor, Einstellungen, A6-Karte; Entwurf lokal im Browser) und Machbarkeitstest am Gerät.
Konzept: Dropbox «046 WebAPP krt2\01_Konzept». Bauplan und Datenformate: `docs/BUILD.md`.

---

## App — `index.html`

| Seite | Inhalt | Stand |
|---|---|---|
| `#aktuell` | Belegung der 100 Plätze nach Blöcken, Suche, A6-Karte | 0.1.0 (zeigt den Entwurf; programmierter Stand ab 0.4.0) |
| `#editor` | Einträge an/aus, verschieben (Griff oder ▲▼, auch über Blockgrenzen), Kurzname mit ICAO/Kürzel-Umschalter, Frequenz, Klartext, Dienst; Prüfliste; «nicht aufgenommen»; Speichern unter (JSON), Laden, CSV | 0.1.0 |
| `#einstellungen` | Aufteilung 00–99, feste Plätze (00 frei gebbar, 99 nur mit zweifacher Bestätigung), Blöcke mit Diensten, Höchstzahl und Reihenfolge, Platzhalter, Kurznamenregel | 0.1.0 |
| `#karte` | A6-Karte quer (148 × 105 mm), eine Seite zum Laminieren | 0.1.0 |
| `#gebiet`, `#geraet`, `#konfigurationen` | Karte und Vorschlag, Gerät schreiben/auslesen, Konten | 0.2.0–0.4.0 |

Belegung: 00 = BALLOON 122.255 (fest, freigebbar), Blöcke ab 01 lückenlos, freie Plätze (118.000 FREE) nur am
Ende, 99 = EMERGENC 121.500. Kurzname = Ortskürzel (IATA, sonst drei Buchstaben) + ICAO-Dienstkürzel, höchstens
8 Zeichen; mit ICAO-Code und vierstelligem Dienst ohne Leerzeichen (LSZHATIS); zu lang → Ortsteil kürzen.
Logik in `src/model.js` (ohne DOM), Oberfläche in `src/app.js`, Texte DE/EN in `src/i18n.js`.

## Frequenzdaten

Nächtliche GitHub Action (`.github/workflows/frequencies.yml`, `tools/build-frequencies.mjs`) baut aus den
openAIP-Länderexporten und OurAirports je Land `freq-<cc>.json` im Zweig `data` (39 Länder Europas).
Dieselbe Frequenz als 25-kHz-Angabe und als 8.33-Kanalname (123.550 / 123.555) wird zusammengeführt.

---

## Machbarkeitstest — `test.html`

Geführter Test in acht Schritten (Version test 0.2): Verbindung «r», Blättern mit «W», ganzen Speicher
auslesen und als Sicherung speichern (CSV/JSON), einen Platz schreiben, Ziffern im Namen, Kanalraster,
Zurückstellen der Testplätze aus der Sicherung, Ergebnis speichern. Jeder Schritt hat ein automatisches
Resultat und eine Frage zur Anzeige am Gerät. Befehle gehen nur hinaus, wenn «Senden freigeben» und
«Befehle an das Funkgerät freigeben» gesetzt sind; gesendet werden nur «x» (Antwort auf «S»), ACK, W, Z
und R. `test.html?sim=1` startet ein nachgebildetes Funkgerät zum Üben ohne Adapter.

## Protokoll

TQ «KRT2 Series Remote RS232 Protocol» Rev. 003 (2021-05-11), 9600 Bd 8N1.
`src/krt2decoder.js` zerlegt den Datenstrom vom Funkgerät, `src/krt2codec.js` baut die Befehle.
Prüfung: `node tests/codec.test.js` (Beispiele der Protokollbeschreibung, Rundlauf),
`node tests/model.test.js` (Belegung, Kurznamen, Prüfung), `node tests/frequencies.test.mjs` (Datenumrechnung).

## Lizenz

Alle Rechte vorbehalten, Quelltext zur Einsicht — siehe `LICENSE`.
