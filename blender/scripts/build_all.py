"""Build every BUTTERFLY JOB asset: .blend sources, .glb exports and the asset manifest.

Usage (either works; Blender 5.0.x):
    python3 blender/scripts/build_all.py            # with `pip install bpy==5.0.1` (Python 3.11)
    blender -b -P blender/scripts/build_all.py      # with a Blender 5.0 installation
    ... build_all.py -- trees bank                  # rebuild only some assets

Outputs:
    blender/source/<asset>.blend      editable sources (textures + fonts packed)
    public/assets/models/<asset>.glb  browser assets (Draco + WEBP, self-contained)
    public/assets/manifest.json       node roles, variants, anchors, animations, stats
"""
from __future__ import annotations

import datetime
import importlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bj_kit as K  # noqa: E402  (imports bpy)

ASSETS = [
    # (asset id, module)
    ('terrain', 'asset_terrain'),
    ('bank', 'asset_bank'),
    ('cafe', 'asset_cafe'),
    ('workshop', 'asset_workshop'),
    ('townhouses', 'asset_townhouses'),
    ('trees', 'asset_trees'),
    ('props', 'asset_props'),
    ('characters', 'asset_characters'),
]


def selected_assets(argv):
    if '--' in argv:
        wanted = argv[argv.index('--') + 1:]
    else:
        wanted = [a for a in argv[1:] if not a.startswith('-') and not a.endswith('.py')]
    if not wanted:
        return ASSETS
    return [a for a in ASSETS if a[0] in wanted]


def merge_manifest():
    parts_dir = K.MANIFEST_PARTS_DIR
    assets = {}
    for asset, _ in ASSETS:
        p = os.path.join(parts_dir, f'{asset}.json')
        if os.path.exists(p):
            with open(p) as fh:
                assets[asset] = json.load(fh)
    import bpy
    manifest = {
        'version': 1,
        'generated': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'blender': bpy.app.version_string,
        'conventions': {
            'units': '1 unit = 1 tile = 1 m',
            'up': '+Y (glTF), Blender +Z',
            'grid_to_world': 'x_world = x_grid - 15, z_world = z_grid - 11',
            'node_names': '<asset>__<part>; bj_* custom properties exported as extras',
            'roles': ['variant', 'part', 'anchor', 'proxy', 'camera', 'dynamic', 'pivot', 'character'],
        },
        'assets': assets,
    }
    out = os.path.join(K.ROOT, 'public', 'assets', 'manifest.json')
    with open(out, 'w') as fh:
        json.dump(manifest, fh, indent=1)
    total = sum(a['stats']['glb_bytes'] for a in assets.values())
    tris = sum(a['stats']['triangles'] for a in assets.values())
    print(f'[bj] manifest: {len(assets)} assets, {tris} triangles, {total / 1024:.0f} KB of .glb')


def main():
    t0 = time.time()
    for asset, module in selected_assets(sys.argv):
        mod = importlib.import_module(module)
        t = time.time()
        mod.build()
        print(f'[bj] built {asset} in {time.time() - t:.1f}s')
    merge_manifest()
    print(f'[bj] done in {time.time() - t0:.1f}s')


if __name__ == '__main__':
    main()
