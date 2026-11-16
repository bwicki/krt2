# TQ KRT2-S2 Memory Manager — krt2.wicki.aero

**App 0.8.2 · README Dok. 261116-05**

Programmiert die 100 Speicherplätze des Flugfunkgeräts TQ KRT2 über die RS-232-Fernsteuerschnittstelle:
Frequenzen für ein auf der Karte markiertes Gebiet (Kreis, Rechteck, Vieleck, Korridor) aus öffentlichen
Quellen zusammenstellen, in konfigurierbaren Blöcken auf die Plätze verteilen, bearbeiten, speichern und ins
Funkgerät schreiben. Die Startseite zeigt die aktuelle Programmierung eines Geräts — ohne Anmeldung und
auch offline im Korb — und druckt sie als zwei A6-Karten auf ein Blatt A4, mit Schnittmarken.
Zweisprachig DE/EN.

**Live:** https://krt2.wicki.aero · **Repository:** https://github.com/bwicki/krt2
**Stack:** HTML/CSS/JS ohne Build-Schritt (ES-Module, GitHub Pages aus dem Repository-Stamm),
Web Serial (Chrome/Edge am Laptop, Bluetooth-Brücke am Handy), Leaflet/OSM, Cloudflare Worker mit D1,
IBM Plex. Gestaltung wie analyze.wicki.aero.

Stand: **App 0.8.2**. Gebaut und am Gerät erprobt: Gebiet und Vorschlag, Editor, Einstellungen, A4-Blatt mit
zwei A6-Karten, Konten, Konfigurationen, Gerät verbinden und programmieren, Vorschläge im Flug (rollender Bereich) und das
Funkprotokoll in die Fahrtabelle der Reporting-App. Dazu der Machbarkeitstest `test.html` (test 0.3.3) und das
Adaptergehäuse unter `hardware/`.
Einrichtung des Workers: `SETUP.md`. Konzept: Dropbox «046 WebAPP krt2\01_Konzept», Konzeptpapiere in
`docs/konzept`. Bauplan und Datenformate: `docs/BUILD.md`.

---

## App — `index.html`

| Seite | Inhalt | Stand |
|---|---|---|
| `#aktuell` | ohne Anmeldung: Liste aller Geräte, Programmierung des gewählten Geräts (sonst der Entwurf), Suche, A6-Karte | 0.4.0 |
| `#editor` | Spalten Land, Filter je Spalte (Kurzname, Dienst, Land), Sortieren nach Kurzname/Dienst/Distanz/Land ohne Platzverlust; Einträge an/aus (folgende rücken nach), verschieben (Griff oder ▲▼, auch über Blockgrenzen), Kurzname mit ICAO/Kürzel-Umschalter, Frequenz, Klartext, Dienst; Prüfliste; «nicht aufgenommen»; Speichern unter (JSON), Laden, CSV | 0.5.1 |
| `#einstellungen` | Aufteilung 00–99, feste Plätze (00 frei gebbar, 99 nur mit zweifacher Bestätigung), Blöcke mit Diensten, Höchstzahl und Reihenfolge, Platzhalter, Kurznamenregel mit eigenen Dienstkürzeln, Kleinbuchstaben | 0.4.6 |
| `#karte` | ein Blatt A4 hoch mit Schnittmarken, darauf beide A6-Karten quer (Vorder-/Rückseite zum Laminieren): Plätze 00–49 und 50–99 mit Kurzname, Frequenz, Klartext, Land | 0.3.6 |
| `#protokoll` | alle Meldungen mit Zeit, kopierbar (Symbolknopf oben rechts mit Zähler); Warnungen/Fehler zusätzlich unten rechts | 0.3.1 |
| `#konfigurationen` | eigene Konfigurationen (Öffnen, Duplizieren, Löschen, «Ins Gerät laden»), eigene Geräte, Konfigurationen anderer Konten als Kopie übernehmen | 0.4.3 |
| `#konten` | nur Supermaster: Konten anlegen, Kennwort zurücksetzen, sperren | 0.2.1 |
| `#gebiet` | Startort (Ortssuche mit Auswahlliste), Kreis/Rechteck/Vieleck/Korridor auf der OSM-Karte, Höhenband, Länder, Dienste je Block, Vorschlag aus den Frequenzdaten — nur VFR und nur eindeutige 8,33-Kanäle | 0.6.2 |
| `#geraet` | Gerät verbinden (Web Serial, am Handy über Bluetooth), sichern (von Hand, aus Datei oder aus dem Verlauf), programmieren mit Quittung je Platz, Stichprobe; nie während einer Aussendung, Verbindung wird selbst wieder aufgenommen | 0.6.3 ✓ |
| `#flug` | fürs Handy: Funkgerät und GPS, Richtung und Vorausschau; Vorschlagsliste (INFO und FIS zuerst, nach Distanz), antippen wählt aus, geschrieben wird nur in den **rollenden Bereich** (Einstellungen, Vorgabe 75–95, ohne Blöcke, der Reihe nach; im Editor wahlweise für den Flug freigehalten) — und das **Funkprotokoll** in die Fahrtabelle der Reporting-App (siehe unten) | 0.8.0 |

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

Geführter Test (Version test 0.3.3): Verbindung «r», Blättern mit «W», den Speicher von Hand auslesen und als
Sicherung speichern (CSV/JSON), einen Platz schreiben, Kleinbuchstaben und Ziffern im Namen, Schreiben während
Empfang und während einer eigenen Aussendung, Kanalraster, Zurückstellen der Testplätze aus der Sicherung,
Ergebnis speichern. Dazu ein Funkstille-Wächter und «Senden beobachten». Jeder Schritt hat ein automatisches
Resultat und eine Frage zur Anzeige am Gerät. Befehle gehen nur hinaus, wenn «Senden freigeben» und
«Befehle an das Funkgerät freigeben» gesetzt sind; gesendet werden nur «x» (Antwort auf «S»), ACK, W, Z
und R. `test.html?sim=1` startet ein nachgebildetes Funkgerät zum Üben ohne Adapter.

## Funkprotokoll — die Fahrtabelle teilen mit Basket Reporting

Auf `#flug` lässt sich das **Funkprotokoll** einschalten. Es schreibt jeden Wechsel der aktiven
Frequenz (nach 3 s Ruhe) und jede eigene Aussendung ab 0,3 s in **dieselbe Fahrtabelle**, die die
Reporting-App (reporting.wicki.aero, Repository `bwicki/gb_notion_frontend`) führt:
`<dir>/<Fahrt>.json` in `bwicki/gb_flight_data`. Zwei Apps, eine Datei — darum ein paar Regeln,
an die sich beide Seiten halten.

**Was eine Zeile trägt.** Kategorie `type: "VHF"`, `source: "krt2"`, `reporter: "KRT2"`,
`device_mode: "personal"`, dazu `note` («FRQ 127.800 ZURICH F active» oder «Tx 6.2 sec»),
`atc_freq`, `atc_station`, bei einer Aussendung `atc_dir: "TX"`, und mit Fix `lat`, `lon`,
`pos_source: "gps"`, `alt_gps_m`. `ts_utc` und `ts_local` werden im selben Format geschrieben wie
dort (`2026-11-16T11:35:42+01:00`), sonst zählte die Reporting-App die Ortszeit falsch.
`id` ist eine UUID — daran erkennt die andere Seite die Zeile wieder.

**Wie zwei Schreiber sich nicht ins Gehege kommen.** Beide lesen die Datei mit ihrer `sha`, fügen
hinzu und schreiben zurück; bei `409` wird neu gelesen und wiederholt. Diese App hängt
ausschliesslich an (`rows.concat(add)`) und ersetzt nie — eine Zeile, die sie nicht kennt, bleibt
unangetastet. Die Reporting-App führt ihrerseits nach `id` zusammen und behält fremde Zeilen.
Fehlen eigene Zeilen in der Tabelle und ist dafür kein Grabstein in `<Fahrt>.deleted.json`
eingetragen, trägt diese App sie nach.

**Grösse.** Ab einem Megabyte liefert die GitHub-Contents-API den Inhalt nicht mehr in der eigenen
Antwort mit (`encoding: "none"`, `content` leer). `ghGet()` in `src/vhflog.js` holt den Rumpf dann
roh nach. Die Reporting-App tut das seit **v261116-01** ebenso und schreibt eine Tabelle
ausserdem gar nicht erst zurück, wenn das Lesen zu kurz ausgefallen ist. Diese App hält es seit
**0.7.1** gleich: Gibt es die Datei, ergibt das Lesen aber keine Liste (kaputtes JSON, leere rohe
Antwort), schreibt sie nichts und meldet es einmal; die Einträge warten in der Warteschlange. Eine
Fahrt mit mehreren hundert Funkzeilen ist damit auf beiden Seiten unbedenklich. Das Zusammenspiel
prüft `tests/reporting_cross.js` gegen die echte `index.html` der Reporting-App.

**Drin lesen.** Die Reporting-App zeigt VHF als eigene Kategorie: eigenes Kürzel im Log, ein Chip
«ohne VHF», um die Funkzeilen beiseitezulegen, eigener Ordner in der KML-Ausgabe. Im Ausdruck
dort sind sie standardmässig **aus** — sonst verdecken sie das übrige Protokoll. Von Hand ändern
lässt sich eine VHF-Zeile dort nicht; löschen schon, über den gewöhnlichen Weg mit Grabstein, den
diese App respektiert. Einzelheiten in deren Handbuch, §19a und §19b.

**Zugang.** In den Einstellungen (ab 0.8.0, nicht mehr auf `#flug`): entweder ein Beitrittscode
der Reporting-App (ein Gerätecode mit Schreibrecht, kein Lese-Code) oder ein Token von Hand mit
Schreibrecht auf `bwicki/gb_flight_data`. Ist der Zugang eingerichtet, verschwinden die Eingaben.
Beides bleibt im Browser dieses Geräts. `vh_proto` baut aus der Tabelle ein Funkprotokoll als CSV und A4-Seite,
auf Wunsch mit den ATC-Einträgen, die die Crew von Hand erfasst hat.

Prüfung: `node tests/vhflog.test.js`; das Zusammenspiel zusätzlich mit
`node tests/reporting_cross.js ../gb_notion_frontend/index.html src/vhflog.js` (braucht jsdom und
eine Arbeitskopie der Reporting-App, darum nicht in CI).

## Protokoll (RS-232)

TQ «KRT2 Series Remote RS232 Protocol» Rev. 003 (2021-05-11), 9600 Bd 8N1.
`src/krt2decoder.js` zerlegt den Datenstrom vom Funkgerät, `src/krt2codec.js` baut die Befehle.
Prüfung: `node tests/codec.test.js` (Beispiele der Protokollbeschreibung, Rundlauf),
`node tests/model.test.js` (Belegung, Kurznamen, Prüfung), `node tests/frequencies.test.mjs` (Datenumrechnung),
`node tests/link.test.js` (Verbindung, Funkstille, Wiederaufnahme), `node tests/readout.test.js` (Auslesen von
Hand), `node tests/flug.test.js` (Vorschläge im Flug), `node tests/area.test.mjs` (Länderwahl) und
`node tests/vhflog.test.js` (Funkprotokoll). `tests/reporting_cross.js` und `tests/worker.test.mjs` brauchen
mehr als das Repository — die Reporting-App bzw. einen lokal laufenden Worker,
siehe `SETUP.md`.

## Hardware

`hardware/adaptergehaeuse` — parametrisches Gehäuse für das USB-RS232-Board EX-13101, je Hälfte als STL,
mit Kabelkanal für Kabel Ø 4,7 mm.

## Lizenz

Alle Rechte vorbehalten, Quelltext zur Einsicht — siehe `LICENSE`.
