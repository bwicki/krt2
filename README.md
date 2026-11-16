# TQ KRT2-S2 Memory Manager — krt2.wicki.aero

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

Stand: **App 0.3.1** (Gebiet und Vorschlag, Editor, Einstellungen, A6-Karte, Konten, Konfigurationen, Geräte) und
Machbarkeitstest am Gerät. Einrichtung des Workers: `SETUP.md`.
Konzept: Dropbox «046 WebAPP krt2\01_Konzept». Bauplan und Datenformate: `docs/BUILD.md`.

---

## App — `index.html`

| Seite | Inhalt | Stand |
|---|---|---|
| `#aktuell` | ohne Anmeldung: Liste aller Geräte, Programmierung des gewählten Geräts (sonst der Entwurf), Suche, A6-Karte | 0.2.0 |
| `#editor` | Spalten Land, Filter je Spalte (Kurzname, Dienst, Land), Sortieren nach Kurzname/Dienst/Distanz/Land ohne Platzverlust; Einträge an/aus (folgende rücken nach), verschieben (Griff oder ▲▼, auch über Blockgrenzen), Kurzname mit ICAO/Kürzel-Umschalter, Frequenz, Klartext, Dienst; Prüfliste; «nicht aufgenommen»; Speichern unter (JSON), Laden, CSV | 0.1.0 |
| `#einstellungen` | Aufteilung 00–99, feste Plätze (00 frei gebbar, 99 nur mit zweifacher Bestätigung), Blöcke mit Diensten, Höchstzahl und Reihenfolge, Platzhalter, Kurznamenregel | 0.1.0 |
| `#karte` | Karte 2 × A6 quer (Vorder-/Rückseite zum Laminieren): Plätze 00–49 und 50–99 mit Kurzname, Frequenz, Klartext, Land | 0.3.1 |
| `#protokoll` | alle Meldungen mit Zeit, kopierbar (Symbolknopf oben rechts mit Zähler); Warnungen/Fehler zusätzlich unten rechts | 0.3.1 |
| `#konfigurationen` | eigene Konfigurationen (Öffnen, Duplizieren, Löschen), eigene Geräte, Konfigurationen anderer Konten als Kopie übernehmen | 0.2.0 |
| `#konten` | nur Supermaster: Konten anlegen, Kennwort zurücksetzen, sperren | 0.2.0 |
| `#gebiet` | Startort (Ortssuche mit Auswahlliste), Kreis/Rechteck/Vieleck/Korridor auf der OSM-Karte, Höhenband, Länder, Vorschlag aus den Frequenzdaten | 0.3.0 |
| `#geraet` | Gerät verbinden, sichern (von Hand/aus Datei), programmieren, Stichprobe | 0.4.0 ✓ |
| `#flug` | fürs Handy: Funkgerät und GPS, Vorschläge je Block unterwegs — und das **Funkprotokoll** in die Fahrtabelle der Reporting-App (siehe unten) | 0.7.0 |

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
ausserdem gar nicht erst zurück, wenn das Lesen zu kurz ausgefallen ist. Eine Fahrt mit mehreren
hundert Funkzeilen ist damit auf beiden Seiten unbedenklich.

**Drin lesen.** Die Reporting-App zeigt VHF als eigene Kategorie: eigenes Kürzel im Log, ein Chip
«ohne VHF», um die Funkzeilen beiseitezulegen, eigener Ordner in der KML-Ausgabe. Im Ausdruck
dort sind sie standardmässig **aus** — sonst verdecken sie das übrige Protokoll. Von Hand ändern
lässt sich eine VHF-Zeile dort nicht; löschen schon, über den gewöhnlichen Weg mit Grabstein, den
diese App respektiert. Einzelheiten in deren Handbuch, §19a und §19b.

**Zugang.** Entweder ein Beitrittscode der Reporting-App (ein Gerätecode mit Schreibrecht, kein
Lese-Code) oder ein Token von Hand mit Schreibrecht auf `bwicki/gb_flight_data`. Beides bleibt im
Browser dieses Geräts. `vh_proto` baut aus der Tabelle ein Funkprotokoll als CSV und A4-Seite,
auf Wunsch mit den ATC-Einträgen, die die Crew von Hand erfasst hat.

Prüfung: `node tests/vhflog.test.js`.

## Protokoll (RS-232)

TQ «KRT2 Series Remote RS232 Protocol» Rev. 003 (2021-05-11), 9600 Bd 8N1.
`src/krt2decoder.js` zerlegt den Datenstrom vom Funkgerät, `src/krt2codec.js` baut die Befehle.
Prüfung: `node tests/codec.test.js` (Beispiele der Protokollbeschreibung, Rundlauf),
`node tests/model.test.js` (Belegung, Kurznamen, Prüfung), `node tests/frequencies.test.mjs` (Datenumrechnung).

## Lizenz

Alle Rechte vorbehalten, Quelltext zur Einsicht — siehe `LICENSE`.
