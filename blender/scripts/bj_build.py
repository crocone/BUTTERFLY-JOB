"""Layout-driven building construction: exterior sides with windows/doors, interior walls from
room boundaries, floors.  Doors and walls follow src/data/layout.json so navigation, vision and
geometry agree."""
from __future__ import annotations

import bj_arch as A
import bj_kit as K
from bj_kit import MB, PAL, W
from mathutils import Vector

L = K.layout()
LV = {k: v['y'] for k, v in L['levels'].items()}
DOOR_H = 1.4


def rect_tiles(r):
    x0, z0, x1, z1 = r
    return [(x, z) for z in range(z0, z1 + 1) for x in range(x0, x1 + 1)]


def side_tiles(side, rect):
    """Tiles along a side in wall order (the order MB.wall runs for that side)."""
    x0, z0, x1, z1 = rect
    if side == 's':
        return [(x, z1) for x in range(x0, x1 + 1)]
    if side == 'n':
        return [(x, z0) for x in range(x1, x0 - 1, -1)]
    if side == 'e':
        return [(x1, z) for z in range(z1, z0 - 1, -1)]
    return [(x0, z) for z in range(z0, z1 + 1)]


def side_u(side, rect, x, z):
    """u offset (metres along the wall run) of the start of tile (x,z)'s segment."""
    return side_tiles(side, rect).index((x, z))


def exterior_side(mb: MB, side: str, rect, y0: float, y1: float, openings, out_mat='wall', out_col=None,
                  in_col=None, t=A.WALL_T, skip=()):
    """Build one straight exterior side.  openings: list of (tile_index, kind, params) where
    kind is 'window' (sill, height, width), 'door' (width, height), 'gap' (full-height hole for a
    variant slot).  Returns the list of (hole, kind, params, centre) for decoration."""
    s, e = A.edge_line(side, *rect)
    along, out = A.dir_vectors(side)
    holes = []
    deco = []
    for (i, kind, p) in openings:
        if i in skip:
            continue
        c = i + 0.5
        if kind == 'window':
            w, sill, h = p.get('w', 0.5), p.get('sill', 0.6), p.get('h', 0.85)
            holes.append((c - w / 2, c + w / 2, sill, sill + h))
        elif kind == 'door':
            w, h = p.get('w', 0.62), p.get('h', DOOR_H)
            holes.append((c - w / 2, c + w / 2, 0.0, h))
        elif kind == 'wide':
            w, h = p.get('w', 1.5), p.get('h', DOOR_H + 0.2)
            c = i + p.get('center', 1.0)
            holes.append((c - w / 2, c + w / 2, 0.0, h))
        elif kind == 'gap':
            holes.append((float(i), float(i + 1), 0.0, y1 - y0))
        deco.append((i, kind, p))
    mb.wall(s, e, y0, y1, t, holes=holes, out_mat=out_mat, out_col=out_col or PAL['cream'],
            in_mat='paper', in_col=in_col or PAL['ivory'])
    return deco, s, (e - s).normalized(), out


def decorate(mb: MB, deco, start, along, out, y0, frame_col=None, glass_col=None, door_col=None, arch=False,
             shutters=None, canopy=None):
    up = Vector((0, 0, 1))
    for (i, kind, p) in deco:
        c = i + 0.5
        if kind == 'window':
            w, sill, h = p.get('w', 0.5), p.get('sill', 0.6), p.get('h', 0.85)
            A.window(mb, start + along * c + up * (y0 + sill) + out * (A.WALL_T / 2), along, out, w, h,
                     frame_col=frame_col, glass_col=glass_col, mullions=p.get('mullions', 1), arch=arch, shutters=shutters)
        elif kind == 'door':
            w, h = p.get('w', 0.62), p.get('h', DOOR_H)
            A.door(mb, start + along * c + up * y0 + out * (A.WALL_T / 2), along, out, w, h, col=p.get('col', door_col),
                   glass=p.get('glass', False), canopy=p.get('canopy', canopy))
        elif kind == 'wide':
            w, h = p.get('w', 1.5), p.get('h', DOOR_H + 0.2)
            cc = i + p.get('center', 1.0)
            A.door(mb, start + along * cc + up * y0 + out * (A.WALL_T / 2), along, out, w, h, col=p.get('col', door_col), double=True,
                   glass=True, canopy=p.get('canopy', canopy))


def slot_wall(mb: MB, side: str, rect, tile_index: int, y0: float, y1: float, kind: str, p=None, out_col=None,
              frame_col=None, door_col=None, out_mat='wall'):
    """One-tile wall piece that fills a 'gap' left in a side (variant slot)."""
    p = p or {}
    s, e = A.edge_line(side, *rect)
    along, out = A.dir_vectors(side)
    dn = (e - s).normalized()
    a = s + dn * tile_index
    b = s + dn * (tile_index + 1)
    holes = []
    if kind == 'door':
        w, h = p.get('w', 0.62), p.get('h', DOOR_H)
        holes.append((0.5 - w / 2, 0.5 + w / 2, 0.0, h))
    elif kind == 'window':
        w, sill, h = p.get('w', 0.5), p.get('sill', 0.6), p.get('h', 0.85)
        holes.append((0.5 - w / 2, 0.5 + w / 2, sill, sill + h))
    mb.wall(a, b, y0, y1, A.WALL_T, holes=holes, out_mat=out_mat, out_col=out_col or PAL['cream'], in_mat='paper', in_col=PAL['ivory'])
    decorate(mb, [(0, kind, p)] if kind in ('door', 'window') else [], a, dn, out, y0, frame_col=frame_col, door_col=door_col)


def building_area_map(building: str, level: str, facts_ok=lambda a: True):
    """tile → area id for all (walkable or closed) areas of `building` on `level`."""
    out = {}
    for a in L['areas']:
        if a.get('building') != building or a['level'] != level or not facts_ok(a):
            continue
        for r in a['rects']:
            for t in rect_tiles(r):
                out[t] = a['id']
    return out


def interior_runs(area_map: dict, door_edges: set):
    """Walls between different rooms. Returns list of (p0, p1, holes) in Blender coords.
    door_edges: set of frozenset({(x,z),(x2,z2)}) edges that get a doorway."""
    vert = {}   # line x → list of z (edge between (x-1,z) and (x,z))
    horz = {}   # line z → list of x (edge between (x,z-1) and (x,z))
    for (x, z), aid in area_map.items():
        n = (x + 1, z)
        if n in area_map and area_map[n] != aid:
            vert.setdefault(x + 1, []).append(z)
        n = (x, z + 1)
        if n in area_map and area_map[n] != aid:
            horz.setdefault(z + 1, []).append(x)
    runs = []
    for lx, zs in vert.items():
        for seg in _contiguous(sorted(zs)):
            p0, p1 = W(lx, seg[0]), W(lx, seg[-1] + 1)
            holes = []
            for k, z in enumerate(seg):
                if frozenset({(lx - 1, z), (lx, z)}) in door_edges:
                    holes.append((k + 0.19, k + 0.81, 0.0, DOOR_H))
            runs.append((p0, p1, holes))
    for lz, xs in horz.items():
        for seg in _contiguous(sorted(xs)):
            p0, p1 = W(seg[0], lz), W(seg[-1] + 1, lz)
            holes = []
            for k, x in enumerate(seg):
                if frozenset({(x, lz - 1), (x, lz)}) in door_edges:
                    holes.append((k + 0.19, k + 0.81, 0.0, DOOR_H))
            runs.append((p0, p1, holes))
    return runs


def _contiguous(vals):
    out, cur = [], []
    for v in vals:
        if cur and v != cur[-1] + 1:
            out.append(cur)
            cur = []
        cur.append(v)
    if cur:
        out.append(cur)
    return out


def door_edge_set(level: str, ids=None):
    out = set()
    for d in L['doors']:
        if d['level'] != level:
            continue
        if ids is not None and d['id'] not in ids:
            continue
        out.add(frozenset({tuple(d['a']), tuple(d['b'])}))
    return out


def floor_slab(mb: MB, rects, top: float, col, mat='plank', thick=A.SLAB_T):
    for r in rects:
        K.rect_box(mb, r[0], r[1], r[2], r[3], top - thick, top, mat, col)
