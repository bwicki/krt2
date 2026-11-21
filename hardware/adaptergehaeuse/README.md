# Gehäuse für das USB-RS232-Board EXSYS EX-13101 (v4, verklebt)

Zwei Hälften, je mit der flachen Schnittfläche nach unten gedruckt, ohne Stützen, **verklebt – ohne Kabelbinder**.
Erzeugt mit `python3 gehaeuse.py [Platinenlänge hinter dem Stecker] [Kabel-Ø]` (Vorgabe 21 mm, Kabel 4.7 mm; braucht
`manifold3d`, `numpy`). Druck- und Montageanleitung: `ex13101_gehaeuse_anleitung_v4_20261121.docx`.

- Aussen 45.0 × 18.8 × 15.8 mm (vorne über der Platine 16.4 × 9.0 mm), je Hälfte 3.1 cm³.
- Klebefläche 264 mm² je Hälfte (v3: 160 mm²): Wände vorne 2.0 mm, um die Kammer 2.4 mm, Querwand 3 mm, Austrittswand 7 mm.
- Ausrichtung: vorne der USB-Stecker selbst, hinten zwei Passstifte aus 1.75-mm-Filament (5.5 mm lang) in Bohrungen Ø 2.0 mm.
- Zugentlastung: drei Klemmrippen Ø 4.0 mm im Kanal Ø 5.0 mm (Kabel Ø 4.7 mm); Zug geht über die Rippen aufs Gehäuse und
  über zwei Anschläge hinter der Platinen-Hinterkante auf Platine und Stecker, nicht auf die Lötstellen.
- Erst löten und prüfen, dann kleben (Sekundenkleber-Gel empfohlen). Verklebt ist endgültig.

Annahme: Platine 21 mm hinter dem Blechmantel (aus dem Datenblattfoto geschätzt; nach Erhalt nachmessen).
Frühere Stände: v3 mit zwei Kabelbindern aussen und einem als Zugentlastung (Git-Verlauf); v1/v2 waren fehlerhaft geschriebene STL.
