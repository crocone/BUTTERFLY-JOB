"""Trees: the story oak (all locations × growth states) and decorative street/garden trees.

Oak variants (bj_variant ids, conditions in src/data/variants.json):
  oak.<loc>.1946            sapling with stake and burlap root ball
  oak.<loc>.1986.pruned     young tree, crown cut back (1986 renovation)
  oak.<loc>.1986.full       young tree, full crown
  oak.<loc>.2026.pruned     mature, pruned side facing the buildings
  oak.<loc>.2026.full       mature, full crown (yard: branch reaches the annex roof)
  oak.yard.stump            felled for the Garden Wing crane (1987)
Each crown is split into canopy segments (bj_anim=unfurl, bj_order) whose pivots sit at the
trunk top, so the runtime can unfurl them one by one.
"""
from __future__ import annotations

import math
import random

import bj_kit as K  # imports bpy first (required before mathutils in the bpy module)
from bj_kit import MB, PAL, W
from mathutils import Vector

LEAVES = [PAL['leaf1'], PAL['leaf2'], PAL['leaf3']]
LEAVES_DARK = [PAL['leaf2'], PAL['leaf4'], PAL['leaf1']]
LEAVES_YOUNG = [PAL['leaf_young'], PAL['leaf3'], PAL['leaf1']]

# Oak trunk tiles; must match src/data/layout.json → "oakSites".
OAK_SITES = {
    'garden': (25.5, 13.5),
    'yard': (24.5, 5.5),
    'square': (15.5, 13.5),
}
# Direction (grid space) from the trunk toward the nearest building face; pruning flattens it,
# the full yard crown reaches over it.
TOWARD_BUILDING = {'garden': (-1, 0), 'yard': (-1, 0), 'square': (0, -1)}


def _trunk(mb: MB, base: Vector, height: float, r0: float, r1: float, seed: int, lean=Vector((0, 0, 0)),
           branches: int = 3, stubs: bool = False):
    rng = random.Random(seed)
    sides = 6
    # trunk in two sections for a gentle bend
    mid = base + Vector((0, 0, height * 0.55)) + lean * 0.4
    top = base + Vector((0, 0, height)) + lean
    _tapered(mb, base, mid, r0, (r0 + r1) / 2, sides, PAL['trunk'])
    _tapered(mb, mid, top, (r0 + r1) / 2, r1, sides, PAL['trunk'])
    # root flare: flat paper collar
    mb.cylinder(base + Vector((0, 0, 0.0)), r0 * 1.8, r0 * 1.05, 0.12, sides, 'wood', PAL['trunk_dark'], cap=True)
    tips = []
    for i in range(branches):
        ang = rng.random() * math.tau
        start = base + Vector((0, 0, height * (0.55 + 0.3 * rng.random()))) + lean * 0.6
        length = height * (0.35 + 0.2 * rng.random())
        end = start + Vector((math.cos(ang) * length * 0.8, math.sin(ang) * length * 0.8, length * 0.6))
        _tapered(mb, start, end, r1 * 0.55, r1 * 0.25, 5, PAL['trunk'])
        tips.append(end)
        if stubs:
            # fresh pruning cut: pale disc at the branch end
            mb.cylinder(end, r1 * 0.26, r1 * 0.26, 0.02, 5, 'wood', PAL['wood_light'], cap=True)
    return top, tips


def _tapered(mb: MB, a: Vector, b: Vector, ra: float, rb: float, sides: int, col):
    axis = (b - a)
    L = axis.length
    if L < 1e-6:
        return
    z = axis.normalized()
    x = z.orthogonal().normalized()
    y = z.cross(x)
    ring_a = [a + (x * math.cos(i / sides * math.tau) + y * math.sin(i / sides * math.tau)) * ra for i in range(sides)]
    ring_b = [b + (x * math.cos(i / sides * math.tau) + y * math.sin(i / sides * math.tau)) * rb for i in range(sides)]
    for i in range(sides):
        j = (i + 1) % sides
        mb.face([ring_a[i], ring_a[j], ring_b[j], ring_b[i]], 'wood', col)
    mb.face(list(reversed(ring_a)), 'wood', col)
    mb.face(ring_b, 'wood', col)


def _crown(name: str, parent, pivot: Vector, blobs: list, seed: int, cols=LEAVES, subdiv=2):
    """Each blob (centre, radii) becomes its own canopy segment object pivoted at `pivot`."""
    for i, (c, r) in enumerate(blobs):
        mb = MB(seed=seed + i, jitter=0.05)
        mb.blob(c, r, 'foliage', cols, subdiv=subdiv, seed=seed * 13 + i, flat_bottom=0.55)
        mb.build(f'{name}__seg{i}', pivot=pivot, parent=parent,
                 props={'bj_role': 'part', 'bj_anim': 'unfurl', 'bj_order': i})


def _crown_layout(centre: Vector, radius: float, height: float, n: int, seed: int, squash=0.72,
                  flat_dir: Vector | None = None, stretch: Vector | None = None):
    """Clustered faceted blobs: one core + ring of satellites + a top knot."""
    rng = random.Random(seed)
    blobs = [(centre, Vector((radius * 0.8, radius * 0.8, height * 0.55)))]
    for i in range(n):
        a = i / n * math.tau + rng.random() * 0.5
        d = radius * (0.55 + 0.15 * rng.random())
        off = Vector((math.cos(a) * d, math.sin(a) * d, (rng.random() - 0.35) * height * 0.35))
        if stretch is not None:
            off += stretch * max(0.0, off.normalized().dot(stretch.normalized())) * 0.9
        if flat_dir is not None and off.normalized().dot(flat_dir) > 0.35:
            off -= flat_dir * off.dot(flat_dir) * 0.8   # pruned: pull back from the building
        r = radius * (0.48 + 0.15 * rng.random())
        blobs.append((centre + off, Vector((r, r, r * squash))))
    blobs.append((centre + Vector((0.1, -0.05, height * 0.42)), Vector((radius * 0.5, radius * 0.5, height * 0.3))))
    return blobs


def build_oak_variant(loc: str, state: str, col):
    gxz = OAK_SITES[loc]
    base = W(gxz[0], gxz[1], 0.0)
    tb = TOWARD_BUILDING[loc]
    toward = Vector((tb[0], -tb[1], 0))   # grid dir → blender dir (z flips)
    vid = f'oak.{loc}.{state}'
    name = f'oak__{loc}_{state.replace(".", "_")}'
    root = K.empty(name, base, col=col, props={'bj_role': 'variant', 'bj_variant': vid, 'bj_anim': 'unfurl'})
    seed = sum(map(ord, vid))
    heritage = loc == 'garden'
    if state == '1946':
        mb = MB(seed=seed)
        # burlap root ball + stake + slim stem with three leaf clusters
        mb.cylinder(base, 0.22, 0.16, 0.14, 7, 'paper', PAL['soil'], cap=True)
        mb.box(base.x + 0.12, base.y - 0.02, 0, base.x + 0.15, base.y + 0.01, 0.75, 'wood', PAL['wood'])
        _tapered(mb, base + Vector((0, 0, 0.1)), base + Vector((0.02, 0, 0.62)), 0.03, 0.018, 5, PAL['trunk'])
        mb.build(f'{name}__stem', pivot=base, parent=root, props={'bj_role': 'part', 'bj_anim': 'rise'})
        leaves = [(base + Vector((0.02, 0, 0.66)), Vector((0.13, 0.13, 0.11))),
                  (base + Vector((-0.09, 0.05, 0.55)), Vector((0.09, 0.09, 0.07))),
                  (base + Vector((0.1, -0.05, 0.5)), Vector((0.08, 0.08, 0.07)))]
        _crown(name, root, base + Vector((0, 0, 0.5)), leaves, seed, cols=LEAVES_YOUNG, subdiv=1)
        return root
    if state.startswith('1986'):
        pruned = state.endswith('pruned')
        h, r = 1.25, (0.62 if pruned else 0.95)
        mb = MB(seed=seed)
        top, _ = _trunk(mb, base, h, 0.1, 0.07, seed, branches=2 if pruned else 3, stubs=pruned)
        if pruned:
            # the 1986 pruning crew: ladder against the trunk and cut branches on the ground
            lad = base + Vector((0.35, 0.25, 0))
            for s_ in (-0.12, 0.12):
                mb.box(lad.x + s_ - 0.02, lad.y - 0.02, 0, lad.x + s_ + 0.02, lad.y + 0.02, 1.2, 'wood', PAL['teal'])
            for k in range(5):
                mb.box(lad.x - 0.12, lad.y - 0.02, 0.2 + k * 0.22, lad.x + 0.12, lad.y + 0.02, 0.23 + k * 0.22, 'wood', PAL['teal'])
            for k in range(3):
                a0 = base + Vector((-0.5 + k * 0.3, -0.45, 0.04))
                _tapered(mb, a0, a0 + Vector((0.45, -0.2, 0.02)), 0.04, 0.02, 4, PAL['trunk'])
                mb.blob(a0 + Vector((0.45, -0.2, 0.06)), Vector((0.14, 0.14, 0.08)), 'foliage', LEAVES, subdiv=1, seed=seed + k)
        elif loc != 'garden':
            # preserved: a teal tag on the trunk (1986 preservation order)
            t0 = base + Vector((0.1, -0.02, 0.7))
            mb.panel(t0, Vector((0.12, -0.05, 0)), Vector((0, 0, 0.16)), 0.01, 'paper', PAL['teal'])
        mb.build(f'{name}__trunk', pivot=base, parent=root, props={'bj_role': 'part', 'bj_anim': 'rise'})
        c = top + Vector((0, 0, r * 0.55))
        blobs = _crown_layout(c, r, r * 1.3, 4 if pruned else 5, seed,
                              flat_dir=toward if pruned else None)
        _crown(name, root, top, blobs, seed, cols=LEAVES_YOUNG if not pruned else LEAVES)
        return root
    if state == 'stump':
        mb = MB(seed=seed)
        mb.cylinder(base, 0.34, 0.3, 0.22, 7, 'wood', PAL['trunk'], cap=True, cap_col=PAL['wood_light'])
        # growth rings printed as a thin inner disc
        mb.cylinder(base + Vector((0, 0, 0.221)), 0.18, 0.18, 0.004, 7, 'wood', PAL['wood'], cap=True)
        # sawdust + a fallen branch
        mb.cylinder(base + Vector((0.3, -0.25, 0)), 0.32, 0.26, 0.02, 8, 'paper', PAL['wood_light'], cap=True)
        _tapered(mb, base + Vector((0.4, 0.3, 0.05)), base + Vector((1.1, 0.55, 0.12)), 0.07, 0.04, 5, PAL['trunk'])
        mb.build(f'{name}__stump', pivot=base, parent=root, props={'bj_role': 'part', 'bj_anim': 'pop'})
        return root
    # 2026 mature
    pruned = state.endswith('pruned')
    if heritage:
        h, r, rz = 1.9, 2.25, 2.0
    elif pruned:
        h, r, rz = 1.7, 1.35, 1.55
    else:
        h, r, rz = 1.85, 2.05, 1.9
    mb = MB(seed=seed)
    lean = toward * 0.35 if (loc == 'yard' and not pruned) else Vector((0, 0, 0))
    top, tips = _trunk(mb, base, h, 0.2, 0.13, seed, lean=lean, branches=4, stubs=pruned)
    if loc == 'yard' and not pruned:
        # the bridge branch that reaches over the annex parapet (the thief's route)
        start = base + Vector((0, 0, h * 0.75)) + lean * 0.5
        end = W(22.6, 5.45, 2.35)
        _tapered(mb, start, end, 0.11, 0.06, 6, PAL['trunk'])
        _tapered(mb, end, end + Vector((-0.5, 0.25, 0.25)), 0.06, 0.03, 5, PAL['trunk'])
    mb.build(f'{name}__trunk', pivot=base, parent=root, props={'bj_role': 'part', 'bj_anim': 'rise'})
    c = top + Vector((0, 0, rz * 0.5))
    stretch = toward * 1.0 if (loc == 'yard' and not pruned) else None
    blobs = _crown_layout(c, r, rz, 7 if not pruned else 5, seed, flat_dir=toward if pruned else None,
                          stretch=stretch)
    _crown(name, root, top, blobs, seed, cols=LEAVES if not heritage else LEAVES_DARK)
    return root


OAK_STATES = ['1946', '1986.pruned', '1986.full', '2026.pruned', '2026.full']


def build_oaks(col):
    roots = []
    for loc in OAK_SITES:
        for st in OAK_STATES:
            if loc == 'garden' and st.endswith('pruned'):
                continue   # the heritage oak in the garden is never pruned
            roots.append(build_oak_variant(loc, st, col))
    roots.append(build_oak_variant('yard', 'stump', col))
    return roots


# ---------------------------------------------------------------------------------------------
# decorative trees (margins only: nothing decorative may suggest cover on the playable grid)
# ---------------------------------------------------------------------------------------------
DECOR_TREES = [(1.2, -0.35), (4.6, -0.4), (8.4, -0.35), (13.0, -0.4), (18.2, -0.35), (24.6, -0.4), (28.3, -0.35),
               (-0.4, 16.2), (-0.4, 19.8), (30.4, 5.0), (30.4, 12.0), (1.6, 2.6), (1.6, 8.5)]


def street_tree(mb_trunk: MB, crown: MB, base: Vector, era: int, seed: int, kind: str):
    rng = random.Random(seed)
    if era == 1946:
        _tapered(mb_trunk, base, base + Vector((0, 0, 0.9)), 0.04, 0.03, 5, PAL['trunk'])
        mb_trunk.box(base.x + 0.08, base.y - 0.015, 0, base.x + 0.11, base.y + 0.015, 0.8, 'wood', PAL['wood_light'])
        crown.blob(base + Vector((0, 0, 1.0)), Vector((0.28, 0.28, 0.3)), 'foliage', LEAVES_YOUNG, subdiv=1, seed=seed)
        return
    scale = 0.75 if era == 1986 else 1.0
    if kind == 'poplar':
        _tapered(mb_trunk, base, base + Vector((0, 0, 0.8 * scale)), 0.08 * scale, 0.05 * scale, 5, PAL['trunk'])
        crown.blob(base + Vector((0, 0, 1.9 * scale)), Vector((0.45, 0.45, 1.3)) * scale, 'foliage', [PAL['leaf4'], PAL['leaf2']], subdiv=1, seed=seed)
        return
    _tapered(mb_trunk, base, base + Vector((0, 0, 1.1 * scale)), 0.1 * scale, 0.07 * scale, 5, PAL['trunk'])
    c = base + Vector((0, 0, 1.75 * scale))
    crown.blob(c, Vector((0.8, 0.8, 0.7)) * scale, 'foliage', LEAVES, subdiv=2, seed=seed, flat_bottom=0.5)
    for k in range(2):
        a = rng.random() * math.tau
        crown.blob(c + Vector((math.cos(a) * 0.45, math.sin(a) * 0.45, 0.25)) * scale, Vector((0.5, 0.5, 0.45)) * scale, 'foliage', LEAVES, subdiv=1, seed=seed + k + 1)


def build_decor_trees(col):
    for era in (1946, 1986, 2026):
        root = K.vroot(f'trees__{era}', f'trees.{era}', anim='unfurl', col=col)
        for i, (x, z) in enumerate(DECOR_TREES):
            base = W(x, z, 0)
            trunk, crown = MB(seed=i), MB(seed=i + 100, jitter=0.05)
            kind = 'poplar' if i % 3 == 1 else 'round'
            street_tree(trunk, crown, base, era, 7000 + i, kind)
            trunk.build(f'trees__{era}__t{i}', pivot=base, parent=root, col=col, props={'bj_role': 'part', 'bj_anim': 'rise', 'bj_order': i})
            crown.build(f'trees__{era}__c{i}', pivot=base + Vector((0, 0, 1.0)), parent=root, col=col, props={'bj_role': 'part', 'bj_anim': 'unfurl', 'bj_order': i})


def build_garden(col):
    import bj_arch as A
    # 1946 plot: wheelbarrow, seed trays, water can (the gardener stands by the sapling)
    r = K.vroot('garden__plot1946', 'garden.plot1946', loc=W(25.5, 13.5, 0), anim='pop', col=col)
    mb = MB(seed=7100)
    wb = W(23.4, 16.2, 0)
    mb.box(wb.x - 0.3, wb.y - 0.18, 0.2, wb.x + 0.2, wb.y + 0.18, 0.42, 'wood', PAL['wood'])
    mb.cylinder(wb + Vector((0.32, 0, 0.12)), 0.12, 0.12, 0.04, 8, 'paper', PAL['ink'])
    for k in range(3):
        p = W(27.2 + k * 0.35, 11.4, 0)
        mb.box(p.x - 0.14, p.y - 0.1, 0, p.x + 0.14, p.y + 0.1, 0.1, 'wood', PAL['wood_light'])
        mb.blob(p + Vector((0, 0, 0.14)), Vector((0.12, 0.08, 0.06)), 'foliage', LEAVES_YOUNG, subdiv=1, seed=k)
    mb.build('garden__plot1946__tools', parent=r, col=col, props={'bj_role': 'part'})

    # 1986+ garden plantings (beds match the layout blockers)
    r = K.vroot('garden__plants', 'garden.plants', loc=W(25.5, 13.5, 0), anim='unfurl', col=col)
    flowers = [PAL['rose'], PAL['lilac'], PAL['mustard'], PAL['white'], PAL['coral_pale']]
    for i, (x, z) in enumerate(((23, 16), (28, 11))):
        mb = MB(seed=7110 + i, jitter=0.06)
        K.rect_box(mb, x, z, x, z, 0, 0.14, 'wood', PAL['wood'], inset=0.06)
        K.rect_box(mb, x, z, x, z, 0.14, 0.16, 'paper', PAL['soil_dark'], inset=0.1, edge=None)
        for k in range(6):
            p = W(x + 0.25 + (k % 3) * 0.25, z + 0.3 + (k // 3) * 0.4, 0.22)
            mb.blob(p, Vector((0.13, 0.13, 0.1)), 'foliage', [flowers[(k + i) % 5], PAL['leaf3']], subdiv=1, seed=k + i * 10)
        mb.build(f'garden__plants__bed{i}', pivot=W(x + 0.5, z + 0.5, 0), parent=r, col=col, props={'bj_role': 'part', 'bj_anim': 'unfurl', 'bj_order': i})
    mb = MB(seed=7120, jitter=0.05)
    # low shrubs along the fence (below eye level: they do not block sight)
    for (x, z) in ((22.3, 10.4), (22.3, 12.0), (28.6, 13.5), (28.6, 15.0), (24.0, 17.6), (27.2, 17.6)):
        mb.blob(W(x, z, 0.18), Vector((0.3, 0.3, 0.2)), 'foliage', [PAL['leaf2'], PAL['leaf1']], subdiv=1, seed=int(x * z))
    # birdbath, bench and the garden shed (layout blocker garden.shed)
    bb = W(24.5, 11.5, 0)
    mb.cylinder(bb, 0.12, 0.08, 0.5, 6, 'paper', PAL['stone'])
    mb.cylinder(bb + Vector((0, 0, 0.5)), 0.3, 0.26, 0.08, 8, 'paper', PAL['stone'])
    mb.cylinder(bb + Vector((0, 0, 0.58)), 0.22, 0.22, 0.005, 8, 'glass', PAL['water'])
    bench = W(27.5, 13.5, 0)
    mb.box(bench.x - 0.1, bench.y - 0.45, 0.28, bench.x + 0.18, bench.y + 0.45, 0.33, 'plank', PAL['wood'])
    mb.box(bench.x + 0.14, bench.y - 0.45, 0.33, bench.x + 0.19, bench.y + 0.45, 0.6, 'plank', PAL['wood'])
    for s_ in (-0.4, 0.4):
        mb.box(bench.x - 0.08, bench.y + s_ - 0.03, 0, bench.x + 0.16, bench.y + s_ + 0.03, 0.28, 'paper', PAL['ink'], edge=None)
    mb.build('garden__plants__furniture', parent=r, col=col, props={'bj_role': 'part'})
    shed = K.group('garden__shed', parent=r, col=col, loc=W(28, 17, 0), role='part', anim='rise')
    mb = MB(seed=7130)
    K.rect_box(mb, 27, 16, 28, 17, 0, 1.3, 'plank', PAL['sage_dark'], inset=0.12)
    A.gable_roof(mb, 27, 16, 28, 17, 1.3, 0.55, 'x', PAL['slate'], overhang=0.12, gable_col=PAL['sage_dark'], gable_mat='plank')
    A.door(mb, W(27.5, 16.12, 0), Vector((-1, 0, 0)), Vector((0, 1, 0)), 0.5, 1.1, col=PAL['wood'])
    mb.build('garden__shed__mesh', pivot=W(28, 17, 0), parent=shed, col=col, props={'bj_role': 'part'})

    # iron fence with three gates (matches layout.json gate edges)
    r = K.vroot('fence__garden', 'fence.garden', loc=W(25.5, 13.5, 0), anim='fold', col=col)
    mb = MB(seed=7140, jitter=0)
    x0, z0, x1, z1 = 22, 10, 28, 17
    runs = [
        (W(x0, z0), W(x0, 14)), (W(x0, 15), W(x0, z1 + 1)),            # west, gate at z=14
        (W(x0, z0), W(26, z0)), (W(27, z0), W(x1 + 1, z0)),             # north, gate at x=26
        (W(x0, z1 + 1), W(25, z1 + 1)), (W(26, z1 + 1), W(x1 + 1, z1 + 1)),  # south, gate at x=25
        (W(x1 + 1, z0), W(x1 + 1, z1 + 1)),                              # east
    ]
    for a, b in runs:
        A.iron_fence(mb, a, b, height=0.42)
    # open gate leaves
    for hinge, d in ((W(x0, 14), Vector((-0.6, -0.5, 0))), (W(26, z0), Vector((0.5, 0.6, 0))), (W(25, z1 + 1), Vector((0.5, -0.6, 0)))):
        A.iron_fence(mb, hinge, hinge + d.normalized() * 0.8, height=0.4, spacing=0.16)
    mb.build('fence__garden__iron', parent=r, col=col, props={'bj_role': 'part'})

    # charter plaque at the west gate (2026, petition signed)
    r = K.vroot('garden__plaque', 'garden.plaque', loc=W(21.8, 13.5, 0), anim='pop', col=col)
    mb = MB(seed=7150, jitter=0)
    p = W(21.8, 13.6, 0)
    mb.box(p.x - 0.03, p.y - 0.03, 0, p.x + 0.03, p.y + 0.03, 0.55, 'paper', PAL['ink'], edge=None)
    A.sign(mb, p + Vector((0, -0.05, 0.62)), Vector((1, 0, 0)), Vector((0, -1, 0)), 'PROTECTED 1986', 0.07, PAL['teal'], PAL['white'])
    mb.build('garden__plaque__sign', parent=r, col=col, props={'bj_role': 'part'})


def build():
    K.reset_scene()
    col = K.collection('oak')
    build_oaks(col)
    build_decor_trees(K.collection('decor'))
    build_garden(K.collection('garden'))
    K.add_preview_rig(W(20, 10, 0), 26)
    return K.save_and_export('trees', notes='Story oak variants (pipeline validation asset).')


if __name__ == '__main__':
    build()
