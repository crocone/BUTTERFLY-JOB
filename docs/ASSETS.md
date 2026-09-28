# Blender asset pipeline

Every visible 3D object in BUTTERFLY JOB comes from Blender. The Blender Python scripts in
`blender/scripts/` build each asset, save it as an editable `.blend` in `blender/source/`, and
export it to glTF 2.0 in `public/assets/models/`. The only runtime-generated geometry is
technical overlay: vision cones, patrol dashes, path dots, highlight rings and cause→effect arcs.

## Versions and reproduction

| | version used |
|---|---|
| Blender | **5.0.1**, run headless through the official `bpy` module from PyPI |
| Python | 3.11 (the version the `bpy` 5.0 wheel requires) |
| numpy | 1.26 (installed with `bpy`; used for texture generation) |

```bash
python3.11 -m venv ~/blender-venv
~/blender-venv/bin/pip install bpy==5.0.1

# build everything (≈5 s): .blend + .glb for each asset, then public/assets/manifest.json
~/blender-venv/bin/python blender/scripts/build_all.py
# build selected assets only (the manifest is re-merged from all parts)
~/blender-venv/bin/python blender/scripts/build_all.py -- bank trees
# open every .blend and report objects, triangles, variants, packed images and fonts
~/blender-venv/bin/python blender/scripts/verify_blend.py

# the same through npm
BLENDER_PYTHON=~/blender-venv/bin/python npm run assets
BLENDER_PYTHON=~/blender-venv/bin/python npm run assets:verify
```

The scripts should also run inside a regular Blender 5.0 install, for example
`blender --background --python blender/scripts/build_all.py -- bank`. Only the `bpy`-module route
was used and verified for this repository.

The build is **deterministic**:

- all randomness is seeded, and the character jitter uses a stable CRC32;
- two consecutive full builds produce byte-identical `.glb` files;
- `.blend` files differ only by what Blender stores on save.

The `.blend` files are generated, so the scripts are the source of truth. Opening a `.blend` in
Blender to inspect or tweak it works, but the next build overwrites it. Make lasting changes in
the scripts, or in `src/data/layout.json` for anything spatial.

## Files

| asset | script | contents | triangles | .glb |
|---|---|---|---|---|
| `terrain` | `asset_terrain.py` | diorama plinth with engraved lettering and margin marks, ground plates per era, the 1946 drain trenches and survey, 1986 drain works, street/creek sewers in section, manhole, hatch shaft | 17,267 | 236 KB |
| `bank` | `asset_bank.py` | Riverdale Savings: main block (4 floors, sides, roof), annex, West Wing, Garden Wing, 1946 construction site, era trims, service-door slots, hatch, cameras, laser curtain, the three contract targets, all door/portal/target anchors | 27,100 | 465 KB |
| `cafe` | `asset_cafe.py` | Café Kopp in every state (empty 1946 lot, 1986 terrace, 2026 open / flooded / terrace lost), backflow valve | 14,844 | 195 KB |
| `workshop` | `asset_workshop.py` | Brandt's workshop per era, alarm junction box with lever | 7,964 | 128 KB |
| `townhouses` | `asset_townhouses.py` | the terrace along Riverdale Street per era | 13,416 | 209 KB |
| `trees` | `asset_trees.py` | the oak at three sites × eras × pruned/full, the yard stump, street trees, garden plants, fence, plaque | 15,288 | 516 KB |
| `props` | `asset_props.py` | street furniture per era, cars, getaway bicycle, alley notice, blueprint, petition table | 15,686 | 201 KB |
| `characters` | `asset_characters.py` | thief, guard, courier, gardener, worker and three townsfolk on one rig with six clips | 1,776 | 70 KB |

Total: **113,341 triangles, 2,020 KB**.

Shared modules:

- `bj_kit.py`: palette, procedural textures, materials, the `MB` mesh builder, text, export and manifest writing.
- `bj_arch.py`: windows, doors, roofs, stairs, railings, awnings, signs, lamps.
- `bj_build.py`: walls, doors and floors generated from `src/data/layout.json`.
- `blender/fonts/`: Liberation Serif (SIL OFL), packed into the `.blend` files for cut-out lettering.

## Conventions

**Units and axes.**

- 1 unit is one grid tile, which is 1 m.
- Blender: `X = x − 15`, `Y = 11 − z`, `Z = height`.
- After the glTF export (Y up), three.js sees `X = x − 15`, `Y = height`, `Z = z − 11`.
- Floor heights are S −3.6, B −2.0, G 0, U 2.0 and R 4.1.

**Layout-driven geometry.** Walls, wall openings and doorways, and the positions of stairs,
ladders, the hatch and other portals, come from `src/data/layout.json`. That is the same file
that drives navigation and line of sight. A unit test
(`tests/assets.test.ts`) checks that every door and portal anchor in the exported bank sits exactly
where navigation expects it.

**Node names** use `<asset>__<part>`, because three.js strips dots from glTF node names. All
metadata is carried as Blender custom properties prefixed `bj_`, exported as glTF `extras`, and
read in three.js from `userData`.

| property | meaning |
|---|---|
| `bj_role` | `variant`, `part`, `level`, `side`, `roof`, `anchor`, `proxy`, `camera`, `dynamic`, `character`, `rig` |
| `bj_variant` | variant id on a variant root, which must exist in `src/data/variants.json` (the build fails otherwise) |
| `bj_anim` | era-transition style: `rise` (floors grow in order), `fold` (a façade or prop folds up from flat about its base), `unfurl` (canopy segments open one by one), `pop`, `flatten` (ground plates swap mid-transition), `none` |
| `bj_order` | sequence index for `rise`/`unfurl` sub-parts |
| `bj_side` | façade side `n` `e` `s` `w`, used for `fold` direction and by the cutaway |
| `bj_level`, `bj_building` | floor and building of `level`/`side`/`roof` groups (and of props or cameras that must follow a floor) |
| `bj_cut` | interior partitions lowered when the thief is on that floor |
| `bj_dynamic` | moved by the simulation: `serviceDoor.front`, `serviceDoor.alley`, `vaultDoor`, `hatchLid`, `junctionLever`, `laserBeams`, `van` |
| `bj_camera` | security camera head (C1–C6), rotated to the simulated yaw |
| `bj_anchor` | non-rendered point: doors, portal ends, targets, exit, junction |
| `bj_proxy`, `bj_size` | pick/collision box as metadata |
| `bj_character` | which character a skinned mesh belongs to |
| `bj_spin` | spins in place (the diamond) |

**Pivots.**

- Level, side and roof groups pivot on their own floor. The cutaway can then hide upper floors, and
  lower the façades facing the camera, by scaling them vertically without moving anything.
- Folding façades and props pivot on their base edge.
- Doors, the hatch lid and the junction lever pivot on their hinges.
- Camera heads pivot on their mounts.
- Oak canopies are split into segments so they can unfurl.

**Variants and the causality system.** Blender never decides what is visible. Every era and
intervention variant is a root node with a stable `bj_variant` id. `src/data/variants.json` states
when each id is shown, as `eras`, `when` fact conditions and `contracts`. At runtime the world
applies `(era, facts, contract)` to that registry. The facts come from the deterministic
causality system (`src/sim/causality.ts`), which stays the single source of truth. A unit test
asserts that the manifest and the registry list exactly the same ids.

**Materials and textures.**

- Each surface is `vertex colour × grey print texture`: grain, hatch, brick, roof, paving, cobble,
  corrugated cardboard edge, foliage, wood, grass, plank and glass.
- The textures are generated procedurally with numpy and packed into each `.blend`.
- At runtime they become shared Lambert "paper" materials with flat shading.
- A post pass draws ink outlines from depth and adds paper grain.

**Export settings** (`bj_kit.export_glb`):

- glTF binary;
- Draco geometry compression: level 7; quantization position 14, texcoord 12, colour 8, generic 12;
- textures as WEBP, quality 82;
- vertex colours as `COLOR_0`;
- no normals, since shading is flat;
- extras on.

**Characters.**

- One armature, `char__rig`, carries six actions:
  - `idle`, 2.0 s;
  - `walk`, 0.8 s;
  - `climb`, 1.0 s;
  - `crouch`, 1.0 s;
  - `interact`, 1.0 s;
  - `sit`, 2.0 s.
- Eight characters are skinned to that rig.
- The game clones the rig per actor with `SkeletonUtils.clone` and plays the clips with an `AnimationMixer`.

## The manifest

`public/assets/manifest.json` is generated by `build_all.py` from the per-asset parts in
`blender/build/*.json`. The game loads it first and fetches the models it lists.

```jsonc
{
  "version": 1,
  "generated": "2026-09-28T23:31:15+00:00",
  "blender": "5.0.1",
  "conventions": { "units": "...", "up": "...", "grid_to_world": "...", "roles": { "variant": "...", ... } },
  "assets": {
    "bank": {
      "asset": "bank",
      "file": "assets/models/bank.glb",
      "source": "blender/source/bank.blend",
      "blender": "5.0.1",
      "variants": ["bank.annex", "bank.cam.C6", "bank.cams2026", ...],   // stable ids → this model
      "anchors": ["door.bank.archive", "portal.oak.a", "target.c1", ...],
      "clips": [],                                                     // characters: [{ "name": "walk", "seconds": 0.8 }, ...]
      "stats": { "objects": 205, "triangles": 27100, "materials": [...], "images": [...], "glb_bytes": 476576 },
      "nodes": [ { "node": "anchor__door_bank_archive", "role": "anchor", "anchor": "door.bank.archive",
                   "level": "B", "kind": "open", "parent": "bank__anchors", "position": [0.5, -2, -6] }, ... ]
    }
  }
}
```

Node `position`s and `bounds` are in three.js world coordinates.

## Editing workflow

1. Change `src/data/layout.json` for rooms, doors, portals and cameras, or an `asset_*.py` script
   for looks. For a new variant, also register its id and visibility rule in `src/data/variants.json`.
2. Rebuild the affected assets: `build_all.py -- <asset>`.
3. Run `npm test`. The asset tests catch unregistered or missing variants and misplaced anchors,
   and the solution tests catch layout changes that break a route.
4. Check it in the game, or in the development viewer at `/viewer.html`.
