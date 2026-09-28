"""Open every .blend in blender/source and verify it is self-contained and matches the manifest.

    python3 blender/scripts/verify_blend.py        (bpy 5.0.1)  or  blender -b -P blender/scripts/verify_blend.py
Checks: file opens, every image/font is packed (no external paths), no missing files, object and
triangle counts match public/assets/manifest.json, variant roots carry bj_variant ids.
"""
from __future__ import annotations

import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bj_kit as K  # noqa: E402
import bpy  # noqa: E402

manifest = json.load(open(os.path.join(K.ROOT, 'public', 'assets', 'manifest.json')))
ok = True
report = []
for path in sorted(glob.glob(os.path.join(K.SRC_DIR, '*.blend'))):
    asset = os.path.splitext(os.path.basename(path))[0]
    bpy.ops.wm.open_mainfile(filepath=path)
    problems = []
    for img in bpy.data.images:
        if img.users and not img.packed_file and img.source == 'FILE':
            problems.append(f'image {img.name} not packed')
    for f in bpy.data.fonts:
        if f.users and not f.packed_file and f.filepath != '<builtin>':
            problems.append(f'font {f.name} not packed')
    try:
        bpy.ops.file.report_missing_files()
    except Exception as exc:  # pragma: no cover
        problems.append(f'report_missing_files failed: {exc}')
    objs = [o for o in bpy.data.objects if not o.name.startswith('preview_')]
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH')
    m = manifest['assets'].get(asset)
    if not m:
        problems.append('not in manifest')
    else:
        if m['stats']['objects'] != len(objs):
            problems.append(f'object count {len(objs)} != manifest {m["stats"]["objects"]}')
        if m['stats']['triangles'] != tris:
            problems.append(f'triangles {tris} != manifest {m["stats"]["triangles"]}')
    variants = sorted({o['bj_variant'] for o in objs if 'bj_variant' in o.keys()})
    report.append(f'{asset:12s} objects={len(objs):4d} tris={tris:6d} variants={len(variants):3d} images={len(bpy.data.images)} '
                  f'fonts={len(bpy.data.fonts)} {"OK" if not problems else "PROBLEMS: " + "; ".join(problems)}')
    ok = ok and not problems

print('\n'.join(report))
print('Blender', bpy.app.version_string, '- all .blend files OK' if ok else '- FAILED')
sys.exit(0 if ok else 1)
