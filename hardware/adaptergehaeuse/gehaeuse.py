"""Gehäuse für das USB-RS232-Board EXSYS EX-13101 (FT232RL) an der Sensorleitung zur Binder-Buchse der ART-36A.

v6 (22.11.2026): Kabel Ø 4.9 mm; Griffrillen auf dem breiten hinteren Teil (7 umlaufende V-Rillen, 45°); gerundete
  Längskanten, 45°-Übergang zwischen schmalem und breitem Teil, Fasen an beiden Enden; Trichter vor der Kammer.
  Ausgelegt für den stehenden Druck (Kabelende unten, PLA, 0.08 mm Schicht): alle Flächen höchstens 45° überhängend,
  ausser der Querrippe (1.5 mm, an drei Seiten angebunden), den Klemmrippen (0.5 mm) und den Passstiftbohrungen (Ø 2).
  Die STL liegen stehend; mit --liegend wie v5 (Schnittfläche unten). Sitz der Querrippe am v5-Probestück bestätigt.

v5 (22.11.2026): nach den Massen des gelieferten Boards (Balthasar, 22.11.2026):
  Blechmantel 15.03 mm lang, 12.0 × 4.6 mm (Datenblatt); dahinter eine Lücke von 2.1 mm, dann die zwei angelöteten
  Haltezähne des Mantels (2.11 mm lang, an beiden Platinenkanten), dann 21.1 mm grüne Platine, 11.03 mm breit.
  Gesamt 40.34 mm (Datenblatt 40.00).
- Halt: eine Querrippe in der oberen Hälfte greift in die Lücke zwischen Mantel-Hinterkante und Haltezähnen. Ihre
  Vorderseite stützt den Mantel (Einstecken), ihre Rückseite die Zähne (Ausziehen). Sie berührt die Platine nicht.
- Hinter den Zähnen ist der Kanal nur so breit wie die Platine (11.03 + 2 × 0.2): sie liegt seitlich geführt.
- Die Kammer beginnt 5 mm vor der Platinen-Hinterkante: die Lötpunkte liegen in der hohen Kammer, nicht im Kanal.
- Verklebt wie v4, ohne Kabelbinder: Passstifte hinten, Klemmrippen im Kabelkanal. Die Anschläge hinter der Platine
  aus v4 entfallen (die Querrippe übernimmt den Zug).
v5 wurde mit der Schnittfläche nach unten gedruckt; die Querrippe entstand dabei als Brücke von Wand zu Wand (12.4 mm).

Masse in mm. x = Längsachse (0 = Vorderkante des Gehäuses, zum USB-Stecker hin), y = Breite, z = Höhe
(0 = Mitte des Blechmantels = Schnittebene; die Platine liegt dort ungefähr in der Mitte).
Aufruf: python3 gehaeuse.py [Lücke] [Kabel-Ø aussen] [--liegend] [--probe]
"""
import sys
import numpy as np
from manifold3d import Manifold, CrossSection, JoinType

VERSION = 'v6'   # v6 = Kabel 4.9, Griffrillen, stehend; v5 = Querrippe, echte Masse; v4 = verklebt mit geschätzter Platine
P = dict(
    ueberlapp=3.0,     # Gehäuse überdeckt so viel vom Blechmantel (vorne bleiben 12 mm frei zum Einstecken)
    mantel_b=12.0,     # Blechmantel breit (Datenblatt 12.00)
    mantel_h=4.6,      # Blechmantel hoch (Datenblatt 4.60)
    luecke=2.1,        # Lücke zwischen Mantel-Hinterkante und Haltezähnen (Balthasar)
    zahn_l=2.11,       # Haltezähne lang (Balthasar)
    gruen=21.1,        # Platine hinter den Zähnen (Balthasar)
    pcb_b=11.03,       # Platine breit (Balthasar)
    spiel=0.2,         # Spiel je Seite
    kanal_h=5.6,       # Kanalhöhe hinter den Zähnen (Mantel 4.6 + 1.0): Luft für Chip und Bauteile, falls die Platine
                       # nicht genau in der Mantelmitte liegt
    rippe_spiel=0.15,  # Spiel der Querrippe vorne und hinten in der Lücke → Rippe 1.8 mm dick
    rippe_z=1.0,       # Unterkante der Querrippe über der Schnittebene (Platine oben bei etwa +0.5…+0.8)
    rippe_fase=0.3,    # Fase unten hinten an der Rippe: Platz für den Lötzinn-Fuss der Zähne (klein halten:
                       # die Rückseite muss die Zähne ab 1.3 mm über der Schnittebene fassen)
    wand=2.0,          # Wand vorne über Mantel und Platine
    wand_k=2.4,        # Wand um die Kammer
    quer_l=3.0,        # Querwand vor der Kammer (Klebefläche)
    pad_l=5.0,         # Kammer beginnt so weit vor der Platinen-Hinterkante (Lötpunkte darin)
    nach_pcb=8.0,      # Kammer reicht so weit hinter die Platine (Drahtbogen zum Kabel)
    kammer_b=14.0, kammer_h=11.0,
    austritt_l=7.0,    # Austrittswand mit Klemmrippen
    kabel_d=4.9,       # Aussendurchmesser des Kabels (Balthasar, 22.11.2026; vorher 4.7)
    kanal_plus=0.3,    # Kanal zwischen den Klemmrippen = Kabel + 0.3
    rippe_minus=0.7,   # Klemmrippen = Kabel − 0.7 → je Seite 0.35 mm Pressung in den Mantel
    klemm_l=1.0, klemmrippen=3,
    stift_d=2.0,       # Bohrung für Passstift aus 1.75-mm-Filament
    stift_t=3.0,       # Bohrtiefe je Hälfte → Stift 5.5 mm lang
    rund_vorne=1.5,    # Radius der Längskanten am schmalen vorderen Teil
    rund_hinten=2.0,   # Radius der Längskanten am Griffteil (muss ≥ Rillentiefe sein)
    fase_ende=0.6,     # 45°-Fase rundum an Vorder- und Hinterkante
    rillen=7,          # Griffrillen auf dem Griffteil, umlaufend
    rillen_teilung=2.5,
    rillen_tiefe=0.6,  # V-Rille mit 45°-Flanken → 1.2 mm breit; Wand darunter noch 1.8 mm
)
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
FLAGS = [a for a in sys.argv[1:] if a.startswith('--')]
if len(ARGS) > 0: P['luecke'] = float(ARGS[0])
if len(ARGS) > 1: P['kabel_d'] = float(ARGS[1])
E = 0.01


def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def zyl_x(x0, laenge, d):
    """Zylinder entlang x ab x0."""
    return Manifold.cylinder(laenge, d / 2, d / 2, 64).rotate([0, 90, 0]).translate([x0, 0, 0])


def prisma_y(pts_xz, y0, y1):
    """Polygon in der x-z-Ebene, entlang y von y0 bis y1 ausgezogen."""
    cs = CrossSection([[(x, z) for x, z in pts_xz]])
    # extrude entlang lokal z; Drehung um x um +90°: (u, v, w) → (u, −w, v)
    return cs.extrude(y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0])


def rr(b, h, r):
    """Querschnitt b (y) × h (z) mit Eckradius r, zentriert, für slab(). Lokal u = z, v = y."""
    if r <= 0:
        return CrossSection.square([h, b], True)
    return CrossSection.square([h - 2 * r, b - 2 * r], True).offset(r, JoinType.Round, 2.0, 48)


def slab(cs, x0, x1):
    """Querschnitt entlang x von x0 bis x1 ausgezogen. Drehung um y um +90°: (u, v, w) → (w, v, −u)."""
    return cs.extrude(x1 - x0).rotate([0, 90, 0]).translate([x0, 0, 0])


def huelle(*teile):
    return Manifold.batch_hull(list(teile))


def masse():
    s, w, wk = P['spiel'], P['wand'], P['wand_k']
    U = P['ueberlapp']                     # Mantel-Hinterkante
    Z0 = U + P['luecke']                   # Vorderkante der Haltezähne
    Z1 = Z0 + P['zahn_l']                  # Hinterkante der Haltezähne
    F = Z1 + P['gruen']                    # Platinen-Hinterkante
    K0 = F - P['pad_l']                    # Kammer beginnt
    Q0 = K0 - P['quer_l']                  # Querwand beginnt (grosser Aussenquerschnitt)
    K1 = F + P['nach_pcb']
    L = K1 + P['austritt_l']
    cb, ch = P['mantel_b'] + 2 * s, P['mantel_h'] + 2 * s     # vorne: Mantel und Zähne
    pb, ph = P['pcb_b'] + 2 * s, P['kanal_h']                 # hinter den Zähnen: nur die Platine
    return dict(U=U, Z0=Z0, Z1=Z1, F=F, K0=K0, Q0=Q0, K1=K1, L=L, cb=cb, ch=ch, pb=pb, ph=ph,
                kb=P['kammer_b'], kh=P['kammer_h'], w=w, wk=wk)


def stifte():
    m = masse()
    ya = P['kabel_d'] / 2 + 3.6
    return [(m['K1'] + P['austritt_l'] / 2, sgn * ya) for sgn in (-1, 1)]


def rillen_x():
    """Mitten der Griffrillen, mittig auf dem Griffteil (vom Ende des Übergangs bis zur Hinterkante)."""
    m = masse()
    n, t = P['rillen'], P['rillen_teilung']
    mitte = (m['Q0'] + m['L']) / 2
    return [mitte + (i - (n - 1) / 2) * t for i in range(n)]


def aussen_koerper():
    """Aussenform: schmaler Teil vorne, 45°-Übergang, Griffteil mit Rillen; gerundete Längskanten, Endfasen."""
    m = masse()
    Q0, L = m['Q0'], m['L']
    f = P['fase_ende']
    W1, H1, r1 = m['cb'] + 2 * m['w'], m['ch'] + 2 * m['w'], P['rund_vorne']
    W2, H2, r2 = m['kb'] + 2 * m['wk'], m['kh'] + 2 * m['wk'], P['rund_hinten']
    A, Af = rr(W1, H1, r1), rr(W1 - 2 * f, H1 - 2 * f, r1 - f)
    B, Bf = rr(W2, H2, r2), rr(W2 - 2 * f, H2 - 2 * f, r2 - f)
    lt = (H2 - H1) / 2                                  # Übergang 45° in der Höhe
    k = huelle(slab(Af, 0, E), slab(A, f, f + E)) + slab(A, f, Q0 - lt) + \
        huelle(slab(A, Q0 - lt - E, Q0 - lt), slab(B, Q0, Q0 + E)) + slab(B, Q0, L - f) + \
        huelle(slab(B, L - f - E, L - f), slab(Bf, L - E, L))
    d, u = P['rillen_tiefe'], 0.3                       # u: Flanken laufen 0.3 mm über die Oberfläche hinaus (saubere Schnitte)
    Bi, Bu, Bg = rr(W2 - 2 * d, H2 - 2 * d, r2 - d), rr(W2 + 2 * u, H2 + 2 * u, r2 + u), rr(W2 + 4, H2 + 4, r2 + 2)
    for xc in rillen_x():
        bleibt = huelle(slab(Bu, xc - d - u - E, xc - d - u), slab(Bi, xc, xc + E)) + \
            huelle(slab(Bi, xc - E, xc), slab(Bu, xc + d + u, xc + d + u + E))
        k -= slab(Bg, xc - d - u, xc + d + u) - bleibt
    return k, lt


def rippe():
    """Querrippe der oberen Hälfte in der Lücke hinter dem Mantel, von Wand zu Wand."""
    m = masse()
    x0, x1 = m['U'] + P['rippe_spiel'], m['Z0'] - P['rippe_spiel']
    z0, z1, f = P['rippe_z'], m['ch'] / 2 + 0.01, P['rippe_fase']
    pts = [(x0, z0), (x1 - f, z0), (x1, z0 + f), (x1, z1), (x0, z1)]
    return prisma_y(pts, -(m['cb'] / 2 + 0.01), m['cb'] / 2 + 0.01)


def gehaeuse():
    m = masse()
    U, Z0, Z1, F, K0, Q0, K1, L = (m[k] for k in ("U", "Z0", "Z1", "F", "K0", "Q0", "K1", "L"))
    cb, ch, pb, ph, kb, kh, w, wk = (m[k] for k in ('cb', 'ch', 'pb', 'ph', 'kb', 'kh', 'w', 'wk'))
    aussen, _ = aussen_koerper()
    xz = Z1 + 0.3                                      # Ende der Zahnzone (0.3 Luft hinter den Zähnen)
    # Mantel und Lücke 12.4 × 5.0 (die Querrippe hängt an dieser Decke); Zahnzone 12.4 breit und 5.6 hoch wie der Kanal dahinter
    # (falls die Zähne etwas über den Mantel ragen); hinter den Zähnen nur Platinenbreite
    innen = box(-1, Z0 + 0.01, -cb / 2, cb / 2, -ch / 2, ch / 2) + \
        box(Z0, xz, -cb / 2, cb / 2, -ph / 2, ph / 2) + \
        box(xz - 0.01, K0 + 0.01, -pb / 2, pb / 2, -ph / 2, ph / 2) + \
        box(K0, K1, -kb / 2, kb / 2, -kh / 2, kh / 2)
    # Trichter: die Kammer läuft unter 45° in den Kanal aus (stehend gedruckt keine Brücke über der Kammer)
    tr = max((kh - ph) / 2, (kb - pb) / 2)
    innen += huelle(box(K0 - tr, K0 - tr + E, -pb / 2, pb / 2, -ph / 2, ph / 2), box(K0, K0 + E, -kb / 2, kb / 2, -kh / 2, kh / 2))
    kanal = zyl_x(K1 - 1, P['austritt_l'] + 2, P['kabel_d'] + P['kanal_plus'])
    teil = aussen - innen - kanal
    n, rl = P['klemmrippen'], P['klemm_l']
    teilung = P['austritt_l'] / (n + 1)
    for i in range(n):
        x0 = K1 + teilung * (i + 1) - rl / 2
        ring = zyl_x(x0, rl, P['kabel_d'] + P['kanal_plus'] + 0.02) - zyl_x(x0 - 0.1, rl + 0.2, P['kabel_d'] - P['rippe_minus'])
        teil += ring
    for (x, y) in stifte():
        teil -= Manifold.cylinder(2 * P['stift_t'], P['stift_d'] / 2, P['stift_d'] / 2, 48).translate([x, y, -P['stift_t']])
    return teil, L


def haelften_roh():
    """Beide Hälften in Gehäuse-Koordinaten (Schnittebene z = 0)."""
    teil, L = gehaeuse()
    big = 200
    oben = (teil ^ box(-big, big, -big, big, 0, big)) + rippe()
    unten = teil ^ box(-big, big, -big, big, -big, 0)
    return oben, unten, L


def haelften(liegend=False):
    oben, unten, L = haelften_roh()
    if liegend:   # v5: Schnittfläche nach unten
        return oben, unten.rotate([180, 0, 0]), L
    # stehend, Kabelende unten: z' = L − x; Schnittfläche senkrecht
    st = lambda h: h.rotate([0, 90, 0]).translate([0, 0, L])
    return st(oben), st(unten), L


def write_stl(m, path):
    mesh = m.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3]
    f = np.asarray(mesh.tri_verts)
    tri = v[f]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.linalg.norm(n, axis=1)[:, None] + 1e-12
    with open(path, 'wb') as fh:
        fh.write(('EX-13101 Gehaeuse ' + VERSION).encode('ascii')[:80].ljust(80, b' '))   # Kopf genau 80 Byte
        fh.write(np.uint32(len(f)).tobytes())
        rec = np.zeros(len(f), dtype=[('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')])
        rec['n'] = n; rec['v'] = tri
        fh.write(rec.tobytes())


if __name__ == '__main__':
    teil, L = gehaeuse()
    print('Klebefläche je Hälfte %.0f mm2' % teil.slice(0.0).area())
    liegend = '--liegend' in FLAGS
    oben, unten, L = haelften(liegend)
    tag = f"{VERSION}_luecke{P['luecke']:g}_kabel{P['kabel_d']:g}_{'liegend' if liegend else 'stehend'}"
    for name, m in (('oben', oben), ('unten', unten)):
        bb = m.bounding_box()
        print(name, 'Volumen %.2f cm3' % (m.volume() / 1000), 'Masse x %.1f y %.1f z %.1f' % (bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]),
              'z von %.2f bis %.2f' % (bb[2], bb[5]), 'Gattung', m.genus())
        write_stl(m.translate([-bb[0], -bb[1], -bb[2]]), f'ex13101_gehaeuse_{name}_{tag}.stl')
    if '--probe' in FLAGS:
        # Probestück: die vorderen 12 mm der oberen Hälfte (Mantel, Lücke mit Querrippe, Zähne), liegend
        probe = haelften_roh()[0] ^ box(-1, 12.0, -50, 50, -1, 50)
        write_stl(probe, f'ex13101_gehaeuse_probe_{VERSION}_luecke{P["luecke"]:g}.stl')
        print('probe Volumen %.2f cm3' % (probe.volume() / 1000))
    mm = masse()
    print('Länge %.2f; vorne %.1f x %.1f; Kammer aussen %.1f x %.1f' % (L, mm['cb'] + 2 * mm['w'], mm['ch'] + 2 * mm['w'], mm['kb'] + 2 * mm['wk'], mm['kh'] + 2 * mm['wk']))
    print('x: Mantel-Hinterkante %.2f, Zähne %.2f–%.2f, Platinenende %.2f, Querwand %.2f–%.2f, Kammer %.2f–%.2f' % (
        mm['U'], mm['Z0'], mm['Z1'], mm['F'], mm['Q0'], mm['K0'], mm['K0'], mm['K1']))
    print('Querrippe x %.2f–%.2f, z %.2f–%.2f' % (mm['U'] + P['rippe_spiel'], mm['Z0'] - P['rippe_spiel'], P['rippe_z'], mm['ch'] / 2))
    print('Stifte', [(round(x, 1), round(y, 1)) for x, y in stifte()])
    print('Griffrillen bei x', [round(x, 2) for x in rillen_x()], '; Übergang %.1f mm' % aussen_koerper()[1])
