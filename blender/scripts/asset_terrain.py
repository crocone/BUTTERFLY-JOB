"""Terrain: the diorama plinth, ground plates per era, utilities (1946 trench, sewers, repairs,
utility markings), manhole and hatch shafts, hedges and the architect's margin marks."""
from __future__ import annotations

import math
import random

import bj_arch as A
import bj_kit as K
from bj_kit import MB, PAL, W, rect_box
from mathutils import Vector

L = K.layout()
LV = {k: v['y'] for k, v in L['levels'].items()}
MARGIN = 0.7
BOTTOM = -4.4


def area_rects(area_id):
    for a in L['areas']:
        if a['id'] == area_id:
            return a['rects']
    raise KeyError(area_id)


# ---------------------------------------------------------------------------------------------
# plinth
# ---------------------------------------------------------------------------------------------

def build_plinth(col):
    root = K.vroot('terrain__plinth', 'terrain.plinth', anim='none', col=col)
    mb = MB(seed=3, jitter=0.02)
    x0, z0, x1, z1 = -MARGIN, -MARGIN, 30 + MARGIN, 22 + MARGIN
    T = 0.35
    # the four stacked-cardboard sides; the east side has the storm-drain outfall
    sw, se, ne, nw = W(x0, z1), W(x1, z1), W(x1, z0), W(x0, z0)
    outfall_u = (22 + MARGIN) - (20.5 + MARGIN)  # distance along the east wall from its south end
    sides = [
        (sw, se, []),
        (se, ne, [(outfall_u + 0.5 - 0.42, outfall_u + 0.5 + 0.42, (LV['S'] - BOTTOM) + 0.05, (LV['S'] - BOTTOM) + 0.95)]),
        (ne, nw, []),
        (nw, sw, []),
    ]
    for a, b, holes in sides:
        d = (b - a).normalized()
        inward = Vector((-d.y, d.x, 0))
        mb.wall(a + inward * (T / 2), b + inward * (T / 2), BOTTOM, -0.02, T, holes=holes,
                out_mat='edge', out_col=PAL['card'], in_mat='paper', in_col=PAL['card_dark'],
                edge_col=PAL['card'])
    # desk shadow lip and top margin board (warm ivory)
    mb.box(W(x0, z1).x - 0.04, W(x0, z1).y - 0.04, BOTTOM - 0.06, W(x1, z0).x + 0.04, W(x1, z0).y + 0.04, BOTTOM, 'paper', PAL['card_dark'])
    for (ax, az, bx, bz) in ((x0, z0, x1, 0), (x0, 22, x1, z1), (x0, 0, 0, 22), (30, 0, x1, 22)):
        a, b = W(ax, bz), W(bx, az)
        mb.box(a.x, a.y, -0.1, b.x, b.y, -0.02, 'paper', PAL['ivory'], edge_col=PAL['card'])
    mb.build('terrain__plinth__body', parent=root, col=col, props={'bj_role': 'part', 'bj_anim': 'none'})

    # engraved lettering on the two faces seen from the default camera
    t = MB(jitter=0)
    A.sign(t, W(9.0, z1, -1.2) + Vector((0, -0.01, 0)), Vector((1, 0, 0)), Vector((0, -1, 0)), 'R I V E R D A L E', 0.42,
           PAL['card'], PAL['card_dark'], board=False, bold=False)
    A.sign(t, W(x1, 11.0, -1.25) + Vector((0.01, 0, 0)), Vector((0, 1, 0)), Vector((1, 0, 0)), 'CASE FILE No 46  -  LINDEN SQUARE', 0.3,
           PAL['card'], PAL['card_dark'], board=False, bold=False)
    t.build('terrain__plinth__lettering', parent=root, col=col, props={'bj_role': 'part'})

    # architect's margin marks: tile ticks, numbers, north arrow, scale bar, pencil notes
    m = MB(jitter=0)
    ink = PAL['slate_light']
    for x in range(0, 31):
        a = W(x, 22.12, 0)
        h = 0.3 if x % 5 == 0 else 0.14
        m.box(a.x - 0.012, a.y - h, -0.019, a.x + 0.012, a.y, -0.012, 'paper', ink, edge=None)
    for z in range(0, 23):
        a = W(30.12, z, 0)
        h = 0.3 if z % 5 == 0 else 0.14
        m.box(a.x, a.y - 0.012, -0.019, a.x + h, a.y + 0.012, -0.012, 'paper', ink, edge=None)
    flat = K.Matrix.Rotation(-math.pi / 2, 4, 'X')
    for x in range(0, 31, 5):
        lbl = K.text_mb(str(x), 0.2, 0.004, ink, bold=False)
        m.merge(lbl, K.Matrix.Translation(W(x, 22.52, -0.017)) @ flat)
    # north arrow at the NE margin
    c = W(30.35, -0.35, -0.015)
    m.face([c + Vector((0, 0.3, 0)), c + Vector((-0.1, -0.12, 0)), c + Vector((0, -0.05, 0))], 'paper', PAL['ink'], vary=False)
    m.face([c + Vector((0, 0.3, 0)), c + Vector((0, -0.05, 0)), c + Vector((0.1, -0.12, 0))], 'paper', PAL['ivory'], vary=False)
    lbl = K.text_mb('N', 0.2, 0.004, PAL['ink'])
    m.merge(lbl, K.Matrix.Translation(c + Vector((0, 0.38, 0))) @ flat)
    # scale bar 0—5 m at the SW margin
    for i in range(5):
        a = W(0.2 + i, 22.3, -0.016)
        m.box(a.x, a.y - 0.06, a.z, a.x + 1, a.y, a.z + 0.004, 'paper', PAL['ink'] if i % 2 == 0 else PAL['ivory'], edge=None)
    lbl = K.text_mb('0     5 m', 0.16, 0.004, ink, bold=False)
    m.merge(lbl, K.Matrix.Translation(W(2.7, 22.58, -0.017)) @ flat)
    # dimension line along the north margin: the bank frontage, drawn like a repair note
    a = W(11, -0.35, -0.016)
    b = W(21, -0.35, -0.016)
    m.box(a.x, a.y - 0.01, a.z, b.x, a.y + 0.01, a.z + 0.004, 'paper', PAL['coral'], edge=None)
    for p, sgn in ((a, 1), (b, -1)):
        m.face([p, p + Vector((0.18 * sgn, 0.07, 0)), p + Vector((0.18 * sgn, -0.07, 0))] if sgn > 0 else
               [p, p + Vector((0.18 * sgn, -0.07, 0)), p + Vector((0.18 * sgn, 0.07, 0))], 'paper', PAL['coral'], vary=False)
        m.box(p.x - 0.01, p.y - 0.2, p.z, p.x + 0.01, p.y + 0.2, p.z + 0.004, 'paper', PAL['coral'], edge=None)
    lbl = K.text_mb('10.00 m  -  RIVERDALE SAVINGS', 0.17, 0.004, PAL['coral'], bold=False)
    m.merge(lbl, K.Matrix.Translation(W(16, -0.55, -0.016)) @ flat)
    m.build('terrain__plinth__marks', parent=root, col=col, props={'bj_role': 'part'})
    return root


# ---------------------------------------------------------------------------------------------
# ground plates per era
# ---------------------------------------------------------------------------------------------

def plate(mb, rects, mat, col, top=0.0, thick=0.06, inset=0.0):
    for r in rects:
        rect_box(mb, r[0], r[1], r[2], r[3], top - thick, top, mat, col, inset=inset)


LOTS = {
    'workshop': [[1, 2, 8, 9]],
    'cafe': [[1, 10, 8, 14]],
    'townhouses': [[0, 15, 8, 18]],
    'bank': [[11, 2, 20, 9]],
    'annex': [[21, 2, 23, 9]],
    'hedge': [[0, 2, 0, 14]],
}


def build_ground(col):
    specs = {
        1946: dict(street=('cobble', PAL['warmgray']), square=('paper', PAL['soil']), lane=('paper', PAL['soil']),
                   yard=('paper', PAL['soil']), walk=('paper', PAL['soil_dark']), lot=('paper', PAL['stone_dark'])),
        1986: dict(street=('paving', PAL['asphalt']), square=('paving', PAL['warmgray']), lane=('cobble', PAL['stone_dark']),
                   yard=('paving', PAL['concrete']), walk=('paving', PAL['stone']), lot=('paper', PAL['stone'])),
        2026: dict(street=('paving', PAL['gray']), square=('paving', PAL['stone']), lane=('cobble', PAL['warmgray']),
                   yard=('paving', PAL['concrete']), walk=('paving', PAL['stone']), lot=('paper', PAL['stone'])),
    }
    for era, sp in specs.items():
        root = K.vroot(f'ground__{era}', f'ground.{era}', anim='flatten', col=col)
        mb = MB(seed=era, jitter=0.02)
        plate(mb, area_rects('street'), *sp['street'], thick=0.05)
        plate(mb, area_rects('square'), *sp['square'], thick=0.06)
        plate(mb, area_rects('lane'), *sp['lane'], thick=0.05)
        plate(mb, area_rects('yard'), *sp['yard'], thick=0.05)
        plate(mb, area_rects('eastwalk'), *sp['walk'], thick=0.07)
        for rects in LOTS.values():
            plate(mb, rects, *sp['lot'], thick=0.04)
        if era != 1946:
            # raised sidewalk strips with visible kerb edges along the street
            rect_box(mb, 0, 19, 29, 19, -0.05, 0.05, 'paving', PAL['stone'])
            rect_box(mb, 9, 18, 21, 18, -0.05, 0.03, 'paving', sp['square'][1])
        if era == 2026:
            # square pattern: a ring of darker tiles and a crosswalk
            ctr = W(15.5, 14.0, 0.061)
            for i in range(24):
                a = i / 24 * math.tau
                p = ctr + Vector((math.cos(a) * 2.6, math.sin(a) * 2.6, 0))
                mb.box(p.x - 0.18, p.y - 0.18, 0.0, p.x + 0.18, p.y + 0.18, 0.064, 'paving', PAL['warmgray'], edge=None)
            for i in range(6):
                a = W(13.2 + i * 0.5, 19.15, 0.052)
                mb.box(a.x, a.y - 2.7, 0.0, a.x + 0.28, a.y, 0.056, 'paper', PAL['white'], edge=None)
            # bike lane stripe
            a = W(0, 20.95, 0.052)
            b = W(30, 20.85, 0.052)
            mb.box(a.x, a.y, 0.0, b.x, b.y, 0.055, 'paper', PAL['coral_pale'], edge=None)
        if era == 1986:
            a = W(0, 20.5, 0.052)
            for i in range(0, 30, 2):
                p = W(i + 0.3, 20.52, 0.051)
                mb.box(p.x, p.y - 0.04, 0.0, p.x + 1.0, p.y + 0.04, 0.054, 'paper', PAL['white'], edge=None)
        if era == 1946:
            # cart ruts and a few loose cobbles on the unpaved square
            rng = random.Random(46)
            for i in range(40):
                x = 9 + rng.random() * 12.5
                z = 10 + rng.random() * 8.5
                p = W(x, z, 0)
                s = 0.08 + rng.random() * 0.07
                mb.box(p.x - s, p.y - s, -0.02, p.x + s, p.y + s, 0.03, 'cobble', PAL['stone_dark'], edge=None)
        mb.build(f'ground__{era}__plates', parent=root, col=col, props={'bj_role': 'part', 'bj_anim': 'flatten'})

    # alley surfaces
    r = K.vroot('ground__alley_1946', 'ground.alley.1946', anim='flatten', col=col)
    mb = MB(seed=5)
    plate(mb, area_rects('alley'), 'paper', PAL['soil'], thick=0.05)
    mb.build('ground__alley_1946__plate', parent=r, col=col, props={'bj_role': 'part'})
    r = K.vroot('ground__alley_kept', 'ground.alley.kept', anim='flatten', col=col)
    mb = MB(seed=6)
    plate(mb, area_rects('alley'), 'cobble', PAL['warmgray'], thick=0.05)
    # drain gutter down the middle
    a = W(9.95, 2, 0.051)
    b = W(10.05, 10, 0.051)
    mb.box(a.x, b.y, 0.0, b.x, a.y, 0.054, 'paper', PAL['slate_light'], edge=None)
    mb.build('ground__alley_kept__plate', parent=r, col=col, props={'bj_role': 'part'})

    # garden ground
    r = K.vroot('ground__garden_1946', 'ground.garden.1946', anim='flatten', col=col)
    mb = MB(seed=7)
    plate(mb, area_rects('garden'), 'paper', PAL['soil'], thick=0.05)
    for i in range(7):
        a = W(22.3, 10.6 + i, 0.05)
        b = W(28.7, 10.85 + i, 0.05)
        mb.box(a.x, b.y, 0.0, b.x, a.y, 0.09, 'paper', PAL['soil_dark'])
    mb.build('ground__garden_1946__plate', parent=r, col=col, props={'bj_role': 'part'})
    r = K.vroot('ground__garden', 'ground.garden', anim='unfurl', col=col)
    mb = MB(seed=8)
    plate(mb, area_rects('garden'), 'grass', PAL['grass'], thick=0.06)
    # gravel paths between the gates
    for (ax, az, bx, bz) in ((22, 14, 25, 14), (25, 14, 25, 17), (26, 10, 26, 14), (25, 14, 26, 14)):
        a = W(min(ax, bx) + 0.15, max(az, bz) + 0.85, 0)
        b = W(max(ax, bx) + 0.85, min(az, bz) + 0.15, 0)
        mb.box(a.x, a.y, -0.01, b.x, b.y, 0.066, 'cobble', PAL['stone'])
    mb.build('ground__garden__plate', parent=r, col=col, props={'bj_role': 'part'})


# ---------------------------------------------------------------------------------------------
# utilities
# ---------------------------------------------------------------------------------------------

STREET_DRAIN = [(x, 20) for x in range(3, 30)]
CREEK_DRAIN = [(8, z) for z in range(19, 10, -1)] + [(x, 11) for x in range(9, 13)] + [(12, z) for z in range(10, 6, -1)]


def trench(mb, tiles, pipe_col=None, rng_seed=1):
    """Exposed 1946 utility works drawn on top of the ground: dark cut strip, spoil mounds, pipes."""
    rng = random.Random(rng_seed)
    pipe_col = pipe_col or PAL['pipe']
    ts = set(tiles)
    for (x, z) in tiles:
        horiz = (x - 1, z) in ts or (x + 1, z) in ts
        rect_box(mb, x, z, x, z, 0.0, 0.012, 'paper', PAL['ink'], inset=0.22, edge=None)
        rect_box(mb, x, z, x, z, 0.0, 0.008, 'paper', PAL['soil_dark'], inset=0.12, edge=None)
        for s in (-1, 1):
            p = W(x + 0.5, z + 0.5, 0.0)
            off = Vector((0, 0.38 * s, 0)) if horiz else Vector((0.38 * s, 0, 0))
            if rng.random() < 0.7:
                mb.blob(p + off + Vector((0, 0, 0.03)), Vector((0.17, 0.17, 0.09)), 'paper', [PAL['soil'], PAL['soil_dark']],
                        subdiv=1, seed=rng.randrange(9999), flat_bottom=0.1)
    # pipe segments waiting beside the cut
    for i in range(0, len(tiles) - 1, 3):
        a = W(tiles[i][0] + 0.5, tiles[i][1] + 0.5, 0.1)
        b = W(tiles[i + 1][0] + 0.5, tiles[i + 1][1] + 0.5, 0.1)
        _pipe(mb, a, b, 0.09, pipe_col)


def _pipe(mb, a, b, r, col, sides=6):
    axis = b - a
    z = axis.normalized()
    x = z.orthogonal().normalized()
    y = z.cross(x)
    ring = lambda c: [c + (x * math.cos(i / sides * math.tau) + y * math.sin(i / sides * math.tau)) * r for i in range(sides)]
    ra, rb = ring(a), ring(b)
    for i in range(sides):
        j = (i + 1) % sides
        mb.face([ra[i], ra[j], rb[j], rb[i]], 'paper', col)
    mb.face(list(reversed(ra)), 'paper', PAL['ink'])
    mb.face(rb, 'paper', PAL['ink'])


def tunnel(mb, tiles, floor_y, height, brick_col, floor_col=None, open_ends=()):
    """Open-topped tunnel (section model) following the tile list."""
    ts = set(tiles)
    floor_col = floor_col or PAL['stone_dark']
    for (x, z) in tiles:
        rect_box(mb, x, z, x, z, floor_y - 0.12, floor_y, 'paper', floor_col)
        # water channel
        rect_box(mb, x, z, x, z, floor_y, floor_y + 0.015, 'glass', PAL['water'], inset=0.36, edge=None)
        for (dx, dz, side) in ((1, 0, 'e'), (-1, 0, 'w'), (0, 1, 's'), (0, -1, 'n')):
            if (x + dx, z + dz) in ts or (x, z, side) in open_ends:
                continue
            s, e = A.edge_line(side, x, z, x, z)
            mb.wall(s, e, floor_y, floor_y + height, 0.14, out_mat='brick', out_col=brick_col, in_mat='brick', in_col=brick_col)


def shaft(mb, x, z, y0, y1, col):
    """Square vertical shaft with ladder rungs."""
    c = W(x + 0.5, z + 0.5)
    r = 0.34
    for side in 'nesw':
        along, out = A.dir_vectors(side)
        p0 = c + out * r - along * r
        p1 = c + out * r + along * r
        mb.wall(p0, p1, y0, y1, 0.08, out_mat='brick', out_col=col, in_mat='brick', in_col=col)
    for i in range(int((y1 - y0) / 0.28)):
        yy = y0 + 0.2 + i * 0.28
        mb.box(c.x - 0.18, c.y + 0.22, yy, c.x + 0.18, c.y + 0.27, yy + 0.035, 'paper', PAL['rust'], edge=None)
    for s in (-1, 1):
        mb.box(c.x + s * 0.2 - 0.02, c.y + 0.22, y0, c.x + s * 0.2 + 0.02, c.y + 0.27, y1, 'paper', PAL['rust'], edge=None)


def build_utilities(col):
    # 1946: open trench along the chosen route + survey stakes marking the old creek bed
    for vid, tiles in (('trench.street', STREET_DRAIN), ('trench.creek', CREEK_DRAIN)):
        r = K.vroot(f'trench__{vid.split(".")[1]}', vid, anim='fold', col=col)
        mb = MB(seed=len(tiles))
        trench(mb, tiles, rng_seed=len(tiles))
        mb.build(f'trench__{vid.split(".")[1]}__cut', parent=r, col=col, props={'bj_role': 'part', 'bj_anim': 'rise'})
    r = K.vroot('survey__1946', 'survey.1946', anim='pop', col=col)
    mb = MB(seed=11)
    for i, (x, z) in enumerate(CREEK_DRAIN[::2]):
        p = W(x + 0.25, z + 0.25, 0)
        mb.box(p.x - 0.02, p.y - 0.02, 0, p.x + 0.02, p.y + 0.02, 0.45, 'wood', PAL['wood_light'])
        mb.face([p + Vector((0.02, 0, 0.44)), p + Vector((0.2, 0, 0.38)), p + Vector((0.02, 0, 0.32))], 'paper', PAL['ochre'])
        mb.face([p + Vector((0.02, 0, 0.32)), p + Vector((0.2, 0, 0.38)), p + Vector((0.02, 0, 0.44))], 'paper', PAL['ochre'])
    # string line between stakes
    pts = [W(x + 0.25, z + 0.25, 0.3) for (x, z) in CREEK_DRAIN[::2]]
    for p, q in zip(pts, pts[1:]):
        n = Vector((-(q - p).y, (q - p).x, 0)).normalized() * 0.006
        mb.face([p - n, q - n, q + n, p + n], 'paper', PAL['ochre_pale'], vary=False)
    # surveyor's tripod at the junction
    t = W(7.4, 18.6, 0)
    for a in (0, 2.1, 4.2):
        _pipe(mb, t + Vector((math.cos(a) * 0.25, math.sin(a) * 0.25, 0)), t + Vector((0, 0, 0.7)), 0.018, PAL['wood'], sides=4)
    mb.box(t.x - 0.08, t.y - 0.05, 0.7, t.x + 0.08, t.y + 0.05, 0.82, 'paper', PAL['ochre'])
    mb.build('survey__1946__stakes', parent=r, col=col, props={'bj_role': 'part'})
    K.anchor('anchor__site_drain', 'site.drain', W(8.5, 19.5, 0.4), col=col)

    # sewers (1986+), open-topped section view inside the plinth
    y = LV['S']
    r = K.vroot('sewer__street', 'sewer.street', anim='rise', col=col, level='S')
    mb = MB(seed=21)
    tunnel(mb, STREET_DRAIN, y, 1.25, PAL['brick'], open_ends={(29, 20, 'e')})
    rect_box(mb, 30, 20, 30, 20, y - 0.12, y, 'paper', PAL['stone_dark'])
    mb.build('sewer__street__tunnel', parent=r, col=col, props={'bj_role': 'part', 'bj_level': 'S'})
    mb = MB(seed=22)
    shaft(mb, 8, 20, y, -0.06, PAL['brick_dark'])
    mb.build('sewer__street__manholeShaft', parent=r, col=col, props={'bj_role': 'part', 'bj_level': 'S'})
    K.anchor('anchor__portal_manhole_top', 'portal.manhole.a', W(8.5, 20.5, 0), parent=r, col=col)
    K.anchor('anchor__portal_manhole_bottom', 'portal.manhole.b', W(8.5, 20.5, y), parent=r, col=col)

    r = K.vroot('sewer__creek', 'sewer.creek', anim='rise', col=col, level='S')
    mb = MB(seed=23)
    tunnel(mb, CREEK_DRAIN, y, 1.25, PAL['stone_dark'], floor_col=PAL['concrete'])
    mb.build('sewer__creek__tunnel', parent=r, col=col, props={'bj_role': 'part', 'bj_level': 'S'})

    r = K.vroot('sewer__hatchShaft', 'sewer.hatchShaft', anim='rise', col=col, level='S')
    mb = MB(seed=24)
    shaft(mb, 12, 8, y + 1.25, LV['B'] - 0.02, PAL['concrete'])
    mb.build('sewer__hatchShaft__shaft', parent=r, col=col, props={'bj_role': 'part', 'bj_level': 'S'})
    K.anchor('anchor__portal_hatch_bottom', 'portal.hatch.a', W(12.5, 8.5, y), parent=r, col=col)

    # manhole cover (the street drain always has one from 1986 on)
    r = K.vroot('manhole__street', 'manhole.street', anim='pop', col=col)
    mb = MB(seed=25)
    c = W(8.5, 20.5, 0.05)
    mb.cylinder(c, 0.36, 0.36, 0.03, 12, 'cobble', PAL['slate'])
    for i in range(4):
        mb.box(c.x - 0.25 + i * 0.14, c.y - 0.22, 0.08, c.x - 0.22 + i * 0.14, c.y + 0.22, 0.085, 'paper', PAL['ink'], edge=None)
    mb.build('manhole__street__cover', parent=r, col=col, props={'bj_role': 'part'})
    K.proxy('proxy__manhole', 'site.drain', W(8.5, 20.5, 0.2), Vector((0.9, 0.9, 0.4)), parent=r, col=col)

    # repairs: patched paving strips over the drain actually built (1986+)
    for vid, tiles in (('repair.street', STREET_DRAIN), ('repair.creek', CREEK_DRAIN)):
        r = K.vroot(f'repair__{vid.split(".")[1]}', vid, anim='flatten', col=col)
        mb = MB(seed=31, jitter=0.06)
        for (x, z) in tiles:
            if vid == 'repair.street' and (x, z) == (8, 20):
                continue
            p = W(x + 0.5, z + 0.5, 0)
            horiz = (x, z + 1) not in tiles and (x, z - 1) not in tiles
            hw, hd = (0.5, 0.2) if horiz else (0.2, 0.5)
            mb.box(p.x - hw, p.y - hd, 0.0, p.x + hw, p.y + hd, 0.072, 'cobble', PAL['stone_dark'], edge=None)
        mb.build(f'repair__{vid.split(".")[1]}__patch', parent=r, col=col, props={'bj_role': 'part'})

    # 2026 utility markings: stencilled dashes over the creek drain
    r = K.vroot('utility__creek', 'utility.creek', anim='flatten', col=col)
    mb = MB(seed=41, jitter=0)
    for i, (x, z) in enumerate(CREEK_DRAIN):
        if i % 2:
            continue
        p = W(x + 0.5, z + 0.5, 0)
        mb.box(p.x - 0.07, p.y - 0.25, 0.0, p.x + 0.07, p.y + 0.25, 0.078, 'paper', PAL['teal'], edge=None)
    mb.build('utility__creek__marks', parent=r, col=col, props={'bj_role': 'part'})

    # 1986 drain works around the manhole: barriers, tent, cable reel
    r = K.vroot('drainworks__1986', 'drainworks.1986', anim='pop', col=col)
    mb = MB(seed=51)
    c = W(8.5, 20.5, 0)
    for (dx, dy, rot) in ((-0.8, 0, 90), (0.8, 0, 90), (0, 0.8, 0), (0, -0.8, 0)):
        p = c + Vector((dx, dy, 0))
        along = Vector((1, 0, 0)) if rot == 0 else Vector((0, 1, 0))
        for k in range(4):
            q = p + along * (-0.45 + k * 0.225)
            mb.panel(q + Vector((0, 0, 0.3)), along * 0.225, Vector((0, 0, 0.12)), 0.02, 'paper', PAL['red'] if k % 2 == 0 else PAL['white'])
        for s in (-0.45, 0.45):
            q = p + along * s
            mb.box(q.x - 0.02, q.y - 0.02, 0, q.x + 0.02, q.y + 0.02, 0.44, 'paper', PAL['slate'], edge=None)
    # open manhole cover leaning on the barrier
    mb.cylinder(c + Vector((0.5, 0.45, 0)), 0.3, 0.3, 0.03, 10, 'cobble', PAL['slate'])
    # little canvas tent
    t = W(6.2, 19.4, 0)
    mb.face([t, t + Vector((0.9, 0, 0)), t + Vector((0.45, 0, 0.7))], 'paper', PAL['teal_pale'])
    mb.panel(t, Vector((0.9, 0, 0)), Vector((0, 0.8, 0)), 0.01, 'paper', PAL['teal'])
    mb.panel(t + Vector((0, 0, 0)), Vector((0.45, 0, 0.7)), Vector((0, 0.8, 0)), 0.01, 'paper', PAL['teal_pale'])
    mb.panel(t + Vector((0.45, 0, 0.7)), Vector((0.45, 0, -0.7)), Vector((0, 0.8, 0)), 0.01, 'paper', PAL['teal'])
    mb.build('drainworks__1986__site', parent=r, col=col, props={'bj_role': 'part'})


def build_hedges(col):
    # the west boundary hedge (all eras; grows over time is not needed for gameplay)
    root = K.group('terrain__hedges', col=col)
    mb = MB(seed=61, jitter=0.05)
    for z in range(2, 15):
        c = W(0.5, z + 0.5, 0.0)
        mb.blob(c + Vector((0, 0, 0.35)), Vector((0.55, 0.58, 0.42)), 'foliage', [PAL['leaf2'], PAL['leaf4']], subdiv=1, seed=z, flat_bottom=0.6)
    mb.build('terrain__hedges__west', parent=root, col=col, props={'bj_role': 'part'})


def build():
    K.reset_scene()
    col = K.collection('terrain')
    build_plinth(col)
    build_ground(col)
    build_utilities(col)
    build_hedges(col)
    K.add_preview_rig(W(15, 11, 0), 40)
    return K.save_and_export('terrain', notes='Diorama plinth, era ground plates, utilities and sewers.')


if __name__ == '__main__':
    build()
