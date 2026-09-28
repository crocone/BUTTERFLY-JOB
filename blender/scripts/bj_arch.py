"""Architectural helpers for the paper-model kit (windows, doors, roofs, stairs, railings,
awnings, signs, fences, lamps).  Everything is emitted into an MB (mesh builder) so assets can
merge parts into as few meshes as the runtime needs (cutaway sides, variants, animated parts).
"""
from __future__ import annotations

import math

import bj_kit as K
from bj_kit import MB, PAL, W
from mathutils import Vector

WALL_T = 0.12      # cardboard wall thickness
SLAB_T = 0.1       # floor slab thickness


def dir_vectors(side: str):
    """Unit vectors for a façade side.  Returns (along, outward) in Blender XY.
    along: direction the façade runs when looking at it from outside, left→right."""
    return {
        's': (Vector((1, 0, 0)), Vector((0, -1, 0))),
        'n': (Vector((-1, 0, 0)), Vector((0, 1, 0))),
        'e': (Vector((0, 1, 0)), Vector((1, 0, 0))),
        'w': (Vector((0, -1, 0)), Vector((-1, 0, 0))),
    }[side]


def edge_line(side: str, x0: int, z0: int, x1: int, z1: int):
    """Endpoints (Blender) of a building side for the inclusive tile rect, in wall order so that
    MB.wall()'s outside face points outward."""
    if side == 's':
        return W(x0, z1 + 1), W(x1 + 1, z1 + 1)
    if side == 'n':
        return W(x1 + 1, z0), W(x0, z0)
    if side == 'e':
        return W(x1 + 1, z1 + 1), W(x1 + 1, z0)
    return W(x0, z0), W(x0, z1 + 1)


def window(mb: MB, base: Vector, along: Vector, out: Vector, width: float, height: float,
           frame_col=None, glass_col=None, mullions: int = 1, sill: bool = True, arch: bool = False,
           shutters=None):
    """Window set into a wall opening whose outer face centre-bottom is `base`."""
    frame_col = frame_col or PAL['white']
    glass_col = glass_col or PAL['glass']
    up = Vector((0, 0, 1))
    left = base - along * (width / 2)
    # glass pane recessed into the opening
    g0 = left - out * 0.05
    mb.panel(g0, along * width, up * height, 0.02, 'glass', glass_col, edge_col=PAL['glass_dark'])
    # frame (outer)
    fw = 0.045
    for (o, u, v) in (
        (left, along * width, up * fw),                       # bottom
        (left + up * (height - fw), along * width, up * fw),  # top
        (left, along * fw, up * height),                      # left
        (left + along * (width - fw), along * fw, up * height),  # right
    ):
        mb.panel(o + out * 0.012, u, v, 0.035, 'paper', frame_col)
    # mullions
    for i in range(mullions):
        f = (i + 1) / (mullions + 1)
        mb.panel(left + along * (width * f - fw / 3) + out * 0.01, along * (fw * 0.66), up * height, 0.025, 'paper', frame_col)
    mb.panel(left + up * (height * 0.55) + out * 0.01, along * width, up * (fw * 0.6), 0.025, 'paper', frame_col)
    if sill:
        mb.panel(left - along * 0.05 + out * 0.08 - up * 0.04, along * (width + 0.1), up * 0.05, 0.1, 'paper', PAL['stone'])
    if arch:
        # printed keystone arch: a small folded triangle strip above the window
        mb.panel(left + up * (height + 0.02) + out * 0.02, along * width, up * 0.08, 0.03, 'paper', PAL['stone_dark'])
        mb.panel(left + along * (width / 2 - 0.06) + up * (height + 0.02) + out * 0.03, along * 0.12, up * 0.16, 0.035, 'paper', PAL['stone'])
    if shutters:
        for s in (-1, 1):
            o = base + along * (s * (width / 2 + 0.02) + (0 if s > 0 else -width * 0.42)) + out * 0.03
            mb.panel(o, along * (width * 0.42), up * height, 0.02, 'wood', shutters)


def door(mb: MB, base: Vector, along: Vector, out: Vector, width: float, height: float, col=None,
         frame_col=None, double: bool = False, glass: bool = False, canopy=None):
    col = col or PAL['wood']
    frame_col = frame_col or PAL['white']
    up = Vector((0, 0, 1))
    left = base - along * (width / 2) - out * 0.03
    if double:
        for i in range(2):
            mb.panel(left + along * (i * width / 2), along * (width / 2 - 0.01), up * height, 0.03, 'wood', col)
    else:
        mb.panel(left, along * width, up * height, 0.03, 'wood', col)
    if glass:
        mb.panel(left + along * (width * 0.2) + up * (height * 0.55) + out * 0.005, along * (width * 0.6), up * (height * 0.3), 0.01, 'glass', PAL['glass'])
    # frame
    fw = 0.05
    fl = base - along * (width / 2 + fw) + out * 0.015
    mb.panel(fl, along * fw, up * (height + fw), 0.04, 'paper', frame_col)
    mb.panel(fl + along * (width + fw), along * fw, up * (height + fw), 0.04, 'paper', frame_col)
    mb.panel(fl + up * height, along * (width + 2 * fw), up * fw, 0.04, 'paper', frame_col)
    # knob
    mb.box(*(base + along * (width * 0.3) + out * 0.01 + up * (height * 0.48)), *(base + along * (width * 0.3 + 0.05) + out * 0.05 + up * (height * 0.52)), 'paper', PAL['copper'], edge=None)
    if canopy is not None:
        c0 = base - along * (width / 2 + 0.12) + up * (height + 0.12)
        mb.panel(c0 + out * 0.3, along * (width + 0.24), -out * 0.3 + up * 0.08, 0.03, 'paper', canopy)


def gable_roof(mb: MB, x0, z0, x1, z1, eave: float, rise: float, ridge_axis: str, col, overhang=0.18,
               thickness=0.08, gable_col=None, gable_mat='wall'):
    """Two folded panels + gable triangles.  ridge_axis 'x' runs east-west, 'z' north-south."""
    a = W(x0, z1 + 1, eave)   # SW
    b = W(x1 + 1, z1 + 1, eave)  # SE
    c = W(x1 + 1, z0, eave)   # NE
    d = W(x0, z0, eave)       # NW
    o = overhang
    gable_col = gable_col or PAL['cream']
    if ridge_axis == 'x':
        midy = (a.y + d.y) / 2
        r0 = Vector((a.x - o, midy, eave + rise))
        r1 = Vector((b.x + o, midy, eave + rise))
        # south slope
        s0 = Vector((a.x - o, a.y - o, eave - o * rise / ((d.y - a.y) / 2)))
        s1 = Vector((b.x + o, a.y - o, s0.z))
        mb.panel(s0, s1 - s0, r0 - s0, thickness, 'roof', col, back_mat='paper', back_col=PAL['card'])
        n0 = Vector((b.x + o, d.y + o, s0.z))
        n1 = Vector((a.x - o, d.y + o, s0.z))
        mb.panel(n0, n1 - n0, r1 - n0, thickness, 'roof', col, back_mat='paper', back_col=PAL['card'])
        # gables (triangles) at west and east ends
        for x, sgn in ((a.x, -1), (b.x, 1)):
            p = [Vector((x, a.y, eave)), Vector((x, d.y, eave)), Vector((x, midy, eave + rise))]
            if sgn < 0:
                p = [p[1], p[0], p[2]]
            mb.face(p, gable_mat, gable_col)
            mb.face(list(reversed([q + Vector((-sgn * 0.02, 0, 0)) for q in p])), 'paper', PAL['ivory'])
        # ridge cap
        mb.box(r0.x, midy - 0.06, eave + rise - 0.02, r1.x, midy + 0.06, eave + rise + 0.05, 'paper', PAL['charcoal'], edge=None)
    else:
        midx = (a.x + b.x) / 2
        r0 = Vector((midx, a.y - o, eave + rise))
        r1 = Vector((midx, d.y + o, eave + rise))
        drop = o * rise / ((b.x - a.x) / 2)
        e0 = Vector((b.x + o, a.y - o, eave - drop))
        e1 = Vector((b.x + o, d.y + o, eave - drop))
        mb.panel(e0, e1 - e0, r0 - e0, thickness, 'roof', col, back_mat='paper', back_col=PAL['card'])
        w0 = Vector((a.x - o, d.y + o, eave - drop))
        w1 = Vector((a.x - o, a.y - o, eave - drop))
        mb.panel(w0, w1 - w0, r1 - w0, thickness, 'roof', col, back_mat='paper', back_col=PAL['card'])
        for y, sgn in ((a.y, -1), (d.y, 1)):
            p = [Vector((b.x, y, eave)), Vector((a.x, y, eave)), Vector((midx, y, eave + rise))]
            if sgn > 0:
                p = [p[1], p[0], p[2]]
            mb.face(p, gable_mat, gable_col)
            mb.face(list(reversed([q + Vector((0, -sgn * 0.02, 0)) for q in p])), 'paper', PAL['ivory'])
        mb.box(midx - 0.06, r0.y, eave + rise - 0.02, midx + 0.06, r1.y, eave + rise + 0.05, 'paper', PAL['charcoal'], edge=None)


def hip_roof(mb: MB, x0, z0, x1, z1, eave: float, rise: float, col, overhang=0.2, thickness=0.08, ridge_frac=0.45):
    a = W(x0, z1 + 1, eave)
    b = W(x1 + 1, z1 + 1, eave)
    c = W(x1 + 1, z0, eave)
    d = W(x0, z0, eave)
    o = overhang
    A = Vector((a.x - o, a.y - o, eave - 0.05))
    B = Vector((b.x + o, b.y - o, eave - 0.05))
    C = Vector((c.x + o, c.y + o, eave - 0.05))
    D = Vector((d.x - o, d.y + o, eave - 0.05))
    cx, cy = (a.x + b.x) / 2, (a.y + d.y) / 2
    wx, wy = (b.x - a.x), (d.y - a.y)
    if wx >= wy:
        r0 = Vector((cx - wx * ridge_frac / 2, cy, eave + rise))
        r1 = Vector((cx + wx * ridge_frac / 2, cy, eave + rise))
        mb.face([A, B, r1, r0], 'roof', col)
        mb.face([C, D, r0, r1], 'roof', col)
        mb.face([B, C, r1], 'roof', col)
        mb.face([D, A, r0], 'roof', col)
    else:
        r0 = Vector((cx, cy - wy * ridge_frac / 2, eave + rise))
        r1 = Vector((cx, cy + wy * ridge_frac / 2, eave + rise))
        mb.face([A, B, r0], 'roof', col)
        mb.face([B, C, r1, r0], 'roof', col)
        mb.face([C, D, r1], 'roof', col)
        mb.face([D, A, r0, r1], 'roof', col)
    # visible board thickness along the eaves
    for p, q in ((A, B), (B, C), (C, D), (D, A)):
        mb.face([p, q, q - Vector((0, 0, thickness)), p - Vector((0, 0, thickness))], 'edge', PAL['card'],
                uvs=[(0, 0), ((q - p).length, 0), ((q - p).length, 1), (0, 1)])
    mb.face([D - Vector((0, 0, thickness)), C - Vector((0, 0, thickness)), B - Vector((0, 0, thickness)), A - Vector((0, 0, thickness))], 'paper', PAL['card'])


def flat_roof(mb: MB, x0, z0, x1, z1, top: float, col, parapet_h=0.35, parapet_col=None, cap_col=None,
              parapet_t=0.1, deck_mat='paper', gaps=()):
    """Roof slab with a parapet. gaps: list of (side, u0, u1) openings in the parapet (metres)."""
    p0 = W(x0, z1 + 1)
    p1 = W(x1 + 1, z0)
    mb.box(p0.x, p0.y, top - SLAB_T, p1.x, p1.y, top, deck_mat, col)
    parapet_col = parapet_col or PAL['cream']
    cap_col = cap_col or parapet_col
    for side in 'nesw':
        s, e = edge_line(side, x0, z0, x1, z1)
        L = (e - s).length
        holes = [(g[1], g[2], 0, parapet_h + 0.01) for g in gaps if g[0] == side]
        segs = [(0.0, L)]
        for h0, h1, _, _ in holes:
            nxt = []
            for a, b in segs:
                if h1 <= a or h0 >= b:
                    nxt.append((a, b))
                else:
                    if h0 > a:
                        nxt.append((a, h0))
                    if h1 < b:
                        nxt.append((h1, b))
            segs = nxt
        dn = (e - s).normalized()
        _, out = dir_vectors(side)
        for a, b in segs:
            q0 = s + dn * a - out * (parapet_t / 2)
            q1 = s + dn * b - out * (parapet_t / 2)
            mb.wall(Vector((q0.x, q0.y, 0)), Vector((q1.x, q1.y, 0)), top, top + parapet_h, parapet_t,
                    out_mat='wall', out_col=parapet_col, in_mat='paper', in_col=PAL['ivory'])
            # cap
            c0 = q0 + out * (parapet_t / 2 + 0.03) + Vector((0, 0, top + parapet_h))
            mb.panel(c0 - dn * 0.03, dn * (b - a + 0.06), -out * (parapet_t + 0.06), 0.05, 'paper', cap_col)


def stairs(mb: MB, start: Vector, direction: Vector, width_dir: Vector, width: float, rise: float, run: float,
           steps: int, col=None, side_col=None):
    """Straight flight from `start` (bottom front centre) going `direction` (unit, horizontal)."""
    col = col or PAL['stone']
    side_col = side_col or PAL['card']
    step_h = rise / steps
    step_d = run / steps
    for i in range(steps):
        p = start + direction * (i * step_d) - width_dir * (width / 2)
        h = step_h * (i + 1)
        q = p + direction * step_d + width_dir * width
        mb.box(min(p.x, q.x), min(p.y, q.y), start.z, max(p.x, q.x), max(p.y, q.y), start.z + h, 'paper', col, edge_col=side_col)


def railing(mb: MB, a: Vector, b: Vector, height=0.35, posts=4, col=None):
    col = col or PAL['charcoal']
    d = b - a
    for i in range(posts + 1):
        p = a + d * (i / posts)
        mb.box(p.x - 0.02, p.y - 0.02, p.z, p.x + 0.02, p.y + 0.02, p.z + height, 'paper', col, edge=None)
    top = Vector((0, 0, height))
    n = Vector((-d.y, d.x, 0)).normalized() * 0.02
    mb.face([a + top - n, b + top - n, b + top + n, a + top + n], 'paper', col)
    mb.face([a + top * 0.5 - n, b + top * 0.5 - n, b + top * 0.5 + n, a + top * 0.5 + n], 'paper', col)


def iron_fence(mb: MB, a: Vector, b: Vector, height=0.42, spacing=0.18, col=None, post_col=None):
    col = col or PAL['ink']
    post_col = post_col or PAL['stone']
    d = b - a
    L = d.length
    n = max(1, int(L / spacing))
    dn = d.normalized()
    side = Vector((-dn.y, dn.x, 0)) * 0.012
    for i in range(n + 1):
        p = a + dn * (L * i / n)
        mb.face([p - side, p + side, p + side + Vector((0, 0, height)), p - side + Vector((0, 0, height))], 'paper', col, vary=False)
        mb.face([p + side, p - side, p - side + Vector((0, 0, height)), p + side + Vector((0, 0, height))], 'paper', col, vary=False)
    for hgt in (0.08, height - 0.05):
        z = Vector((0, 0, hgt))
        mb.box(*(Vector((min(a.x, b.x), min(a.y, b.y), 0)) + z - Vector((0.015, 0.015, 0.015))),
               *(Vector((max(a.x, b.x), max(a.y, b.y), 0)) + z + Vector((0.015, 0.015, 0.015))), 'paper', col, edge=None)
    for p in (a, b):
        mb.box(p.x - 0.06, p.y - 0.06, 0, p.x + 0.06, p.y + 0.06, height + 0.1, 'paper', post_col)
        mb.box(p.x - 0.075, p.y - 0.075, height + 0.1, p.x + 0.075, p.y + 0.075, height + 0.14, 'paper', PAL['stone_dark'])


def awning(mb: MB, left: Vector, along: Vector, out: Vector, width: float, depth: float, drop: float,
           cols, stripes: int = 6, valance=True):
    """Striped fabric awning folded from paper: sloped panel + scalloped valance."""
    up = Vector((0, 0, 1))
    sw = width / stripes
    for i in range(stripes):
        c = cols[i % len(cols)]
        o = left + along * (i * sw)
        mb.panel(o, along * sw, out * depth - up * drop, 0.02, 'paper', c, back_col=c)
        if valance:
            f = o + out * depth - up * drop
            mb.panel(f + out * 0.001, along * sw, -up * 0.12, 0.02, 'paper', c)
    # side cheeks
    for s in (0, width):
        o = left + along * s
        mb.face([o, o + out * depth - up * drop, o + out * depth - up * (drop + 0.12)], 'paper', cols[0])


def sign(mb: MB, centre: Vector, along: Vector, out: Vector, text: str, height: float, board_col, text_col,
         pad=0.12, depth=0.05, board=True, bold=True, width: float | None = None):
    """Board with raised cut-out letters.  centre = middle of the board's front face."""
    up = Vector((0, 0, 1))
    letters = K.text_mb(text, height, 0.02, text_col, bold=bold)
    # measure
    xs = [v[0] for v in letters.verts] or [0]
    tw = max(xs) - min(xs)
    bw = width if width else tw + pad * 2
    bh = height * 1.25 + pad
    if board:
        mb.panel(centre - along * (bw / 2) - up * (bh / 2), along * bw, up * bh, depth, 'paper', board_col)
    # orient letters: local x→along, local -y→out, z→up
    m = K.Matrix((
        (along.x, -out.x, 0, 0),
        (along.y, -out.y, 0, 0),
        (along.z, -out.z, 1, 0),
        (0, 0, 0, 1),
    ))
    off = centre - up * (height * 0.36) + out * (0.012 if board else 0)
    mb.merge(letters, K.Matrix.Translation(off) @ m)
    return bw


def banner(mb: MB, top: Vector, along: Vector, out: Vector, width: float, length: float, col, emblem_col=None):
    up = Vector((0, 0, 1))
    mb.panel(top - along * (width / 2) + out * 0.03 - up * length, along * width, up * length, 0.015, 'paper', col)
    # swallow tail
    b = top - up * length + out * 0.03
    mb.face([b - along * (width / 2), b, b - along * (width / 2) - up * 0.12], 'paper', col)
    mb.face([b, b + along * (width / 2), b + along * (width / 2) - up * 0.12], 'paper', col)
    mb.box(*(top - along * (width / 2 + 0.04) + out * 0.02), *(top + along * (width / 2 + 0.04) + out * 0.06 + up * 0.03), 'paper', PAL['charcoal'], edge=None)
    if emblem_col:
        c = top - up * (length * 0.55) + out * 0.04
        mb.panel(c - along * 0.07 - up * 0.07, along * 0.14, up * 0.14, 0.01, 'paper', emblem_col)


def lamp(mb: MB, base: Vector, era: int):
    """Street lamp per era: 1946 ornate gas lamp, 1986 sodium cobra head, 2026 slim LED post."""
    if era == 1946:
        mb.cylinder(base, 0.09, 0.07, 0.18, 6, 'paper', PAL['ink'])
        mb.cylinder(base + Vector((0, 0, 0.18)), 0.035, 0.03, 1.55, 6, 'paper', PAL['ink'])
        top = base + Vector((0, 0, 1.72))
        mb.cylinder(top, 0.1, 0.13, 0.22, 6, 'glass', PAL['ochre_pale'])
        mb.cylinder(top + Vector((0, 0, 0.22)), 0.15, 0.02, 0.1, 6, 'paper', PAL['ink'])
        mb.box(base.x - 0.16, base.y - 0.012, 1.45, base.x + 0.16, base.y + 0.012, 1.48, 'paper', PAL['ink'], edge=None)
    elif era == 1986:
        mb.cylinder(base, 0.06, 0.05, 0.1, 6, 'paper', PAL['slate'])
        mb.cylinder(base + Vector((0, 0, 0.1)), 0.035, 0.028, 1.95, 6, 'paper', PAL['slate'])
        top = base + Vector((0, 0, 2.02))
        mb.box(top.x - 0.02, top.y - 0.02, top.z - 0.02, top.x + 0.42, top.y + 0.02, top.z + 0.02, 'paper', PAL['slate'], edge=None)
        mb.box(top.x + 0.3, top.y - 0.07, top.z - 0.07, top.x + 0.56, top.y + 0.07, top.z + 0.01, 'paper', PAL['slate_light'], edge=None)
        mb.box(top.x + 0.32, top.y - 0.05, top.z - 0.08, top.x + 0.54, top.y + 0.05, top.z - 0.07, 'glass', PAL['amber'], edge=None)
    else:
        mb.cylinder(base, 0.05, 0.05, 0.06, 8, 'paper', PAL['charcoal'])
        mb.cylinder(base + Vector((0, 0, 0.06)), 0.03, 0.03, 1.75, 8, 'paper', PAL['charcoal'])
        top = base + Vector((0, 0, 1.81))
        mb.cylinder(top, 0.1, 0.1, 0.05, 8, 'paper', PAL['charcoal'])
        mb.cylinder(top - Vector((0, 0, 0.01)), 0.085, 0.085, 0.012, 8, 'glass', PAL['white'])
