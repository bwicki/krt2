# Gehäuse für das USB-RS232-Board EXSYS EX-13101 (v1)

Zwei Hälften, je mit der flachen Schnittfläche nach unten gedruckt, ohne Stützen. Erzeugt mit
`python3 gehaeuse.py [Platinenlänge hinter dem Stecker] [Kabel-Ø]` (Vorgabe 21 mm, 6 mm; braucht `manifold3d`, `numpy`).

- Aussen 42.6 × 17.2 × 14.2 mm (vorne über der Platine 15.6 × 8.2 mm), je Hälfte ca. 2.3 g PETG.
- Vorne überdeckt das Gehäuse 3 mm des Blechmantels; zwei Anschläge hinter der Platinen-Hinterkante übertragen
  den Kabelzug auf Platine und Stecker statt auf die Lötstellen.
- Zugentlastung: kleiner Kabelbinder (2.5 mm) um das Kabel, liegt in der Kammer vor der Austrittswand (Kanal Ø 6 mm).
- Verschluss: zwei Kabelbinder 2.5 mm in den Aussennuten.

Annahme v1: Platine 21 mm hinter dem Blechmantel (aus dem Datenblattfoto geschätzt), Kabel bis 6 mm.
