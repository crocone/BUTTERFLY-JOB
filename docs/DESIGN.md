# BUTTERFLY JOB — internal design

> "I robbed a bank by planting a tree 80 years ago."

This document is the working design that the code and the Blender scripts implement.
Stable identifiers used here (`oak.plant`, `bank.hatch`, `door.bank.service_alley`, …) are the
same identifiers used in `src/data/*`, in `blender/scripts/*` and in `public/assets/manifest.json`.

## 1. The neighborhood: Linden Square, Riverdale

One compact block on a 30 × 22 tile grid (1 tile = 1 m, north = −z, east = +x).
The default camera looks from the south-east corner, so the bank sits upper-right,
the townhouses left and the garden in the foreground right (matching the reference mockup).

```
     x  0         1         2
        012345678901234567890123456789
 z 0    LLLLLLLLLLLLLLLLLLLLLLLLLLLLLL   L  Linden Lane (service lane)
 z 1    LLLLLLLLLLLLLLLLLLLLLLLLLLLLLL
 z 2    #.WWWWWWWaaBBBBBBBBBBAAAYYYYYE   W  Brandt workshop       a  alley (1986 fate!)
 z 3    #.WWWWWWWaaBBBBBBBBBBAAAYYYYYE   B  Riverdale Savings     A  bank annex (1 storey)
 z 4    #.WWWWWWWaaBBBBBBBBBBAAAYYYYYE   Y  service yard          E  east walk
 z 5    #.WWWWWWWaaBBBBBBBBBBAAAYYYYYE
 z 6    #.WWWWWWWaaBBBBBBBBBBAAAYYYYYE
 z 7    #.WWWWWWWaaBBBBBBBBBBAAAYYYYYE
 z 8    #.WWWWWWWaaBBBBBBBBBBAAAYYYYYE
 z 9    #.WWWWWWWaaBBBBBBBBBBAAAYYYYYE
 z10    #CCCCCCCCSSSSSSSSSSSSSGGGGGGGE   C  Café Kopp             S  Linden Square
 z11    #CCCCCCCCSSSSSSSSSSSSSGGGGGGGE   G  community garden (fenced, two gates)
 z12    #CCCCCCCCSSSSSSSSSSSSSGGGGGGGE
 z13    #CCCCCCCCSSSSSSSSSSSSSGGGGGGGE
 z14    #CCCCCCCCSSSSSSSSSSSSSGGGGGGGE
 z15    TTTTTTTTTSSSSSSSSSSSSGGGGGGGE    T  townhouses (decorative)
 z16    TTTTTTTTTSSSSSSSSSSSSGGGGGGGE
 z17    TTTTTTTTTSSSSSSSSSSSSGGGGGGGE
 z18    TTTTTTTTTSSSSSSSSSSSSsssssssE
 z19    sssssssssssssssssssssssssssss    s  Riverdale Street (thief starts at x1,z20)
 z20    sssssssssssssssssssssssssssss
 z21    sssssssssssssssssssssssssssss
```

Vertical levels (floor height, world y):

| level | y     | contents |
|-------|-------|----------|
| `S`   | −3.6  | storm drains (street drain always; creek drain if rerouted) |
| `B`   | −2.0  | bank basement: stairwell, corridor, archive, vault, boiler room |
| `G`   |  0.0  | streets, square, alley, yard, garden; bank ground floor |
| `U`   |  2.0  | bank upper floor (corridor, Glass Room); annex roof (outdoor) |
| `R`   |  4.1  | bank main roof deck (skylight) |

Bank interior (main block x11–20, z2–9):

* **B**: stairwell (11–12, 2–4) · corridor (11–20, 5–6) · archive (13–16, 2–4) · vault (17–20, 2–4) ·
  boiler room (11–14, 7–9) with the optional hatch at (12,8).
* **G**: stairwell · service corridor (11–12, 5–9) · lobby (13–20, 5–9, main doors locked) ·
  West Wing plant room (9–10, 2–5, only when the wing exists).
* **U**: stairwell · corridor (11–20, 5–6) · Glass Room (13–18, 2–4, skylight above (16,3)) ·
  upper service door (20,5)|(21,5) onto the annex roof.
* **R**: flat roof deck with parapet; iron ladder down to the annex roof at (21,8).

Walls live on tile *edges*; doors are edges. The same `src/data/layout.json` drives
navigation, line of sight **and** the Blender wall/door/window generation, so geometry and
rules cannot disagree.

## 2. Eras

| era  | accent | what the diorama shows |
|------|--------|------------------------|
| 1946 | ochre  | Bank is a construction site with scaffolding and a crane. Storm-drain trench is open. Workshop "Brandt — Electric & Smithy" is busy. Café lot is empty. A gardener holds an oak sapling. Young street trees, gas lamps. |
| 1986 | teal   | Bank complete (+ West Wing over the alley in the original timeline). Café Kopp with teal awning. Drain renovation crew. Pruning crew at the oak. Redevelopment notice in the alley. Sodium lamps. |
| 2026 | coral  | Modern bank with cameras and guards; everything accumulated from earlier decisions. |

## 3. Interventions (the plan)

All interventions cost 1. The budget counts only *active* deviations from the original
timeline; exploration and era switching are free; undo refunds.

| id | era | site | options (first = original) | prerequisite |
|----|-----|------|----------------------------|--------------|
| `oak.plant`        | 1946 | oak sapling    | `garden` · `yard` (beside the service yard) · `square` | — |
| `drain.route`      | 1946 | survey stakes  | `street` · `creek` (old creek bed, under the bank lot) | — |
| `alarm.wiring`     | 1946 | Brandt workshop| `grid` · `workshop` (alarm fed through the workshop junction box) | — |
| `oak.renovation`   | 1986 | the oak        | `prune` · `preserve` | oak is not in the garden (the garden oak is a protected heritage tree) |
| `drain.renovation` | 1986 | drain works    | `seal` · `hatch` (maintenance hatch into the bank boiler room) | `drain.route = creek` |
| `cafe.valve`       | 1986 | Café Kopp cellar | `none` · `valve` (backflow valve) | `drain.route = creek` |
| `alley.fate`       | 1986 | alley notice   | `built_over` · `kept` (1911 right-of-way upheld) | — |
| `service.door`     | 1986 | bank blueprint | `front` · `alley` | `alley.fate = kept` |
| `garden.petition`  | 1986 | petition table | `none` · `signed` (garden becomes protected) | — |

When a prerequisite stops holding (e.g. the oak is moved back to the garden), the dependent
decision is removed from the plan with an explanation toast; the removal is part of the same
undo step, so Ctrl+Z restores both.

The prerequisite graph is a DAG (1946 → 1986 only); a unit test verifies it is acyclic.

## 4. Consequence rules (deterministic, recomputed from scratch)

`computeTimeline(decisions)` evaluates these rules in a fixed topological order every time.
No rule reads the previously displayed state, so era switching can never accumulate effects.

1946
* `oak.location` = plant choice (default garden).
* `drain.route`, `alarm.feed` = choices.

1986
* `garden.protected` = oak in garden **or** petition signed.
* `bank.expansion` = `alley` if the alley is built over; else `none` if the garden is protected;
  else `garden` (the **Garden Wing** is built on the garden).
* `oak.felled` = oak in yard **and** expansion = garden (the Garden Wing crane needed the yard, 1987).
* `oak.pruned` = oak outside the garden and not preserved.
* `drain.hatch` = creek **and** renovation = hatch. `cafe.valve` = creek **and** valve.
* `service.door` = alley choice or front. `delivery.stop` = lane (alley door) or square (front door).
* `junction.box` = `none` / `westwing` (box ends up inside the West Wing plant room when the wing
  is built over the alley) / `alley` (box stays outside on the workshop wall).

2026
* `oak.roofAccess` = oak in yard, preserved, not felled → climbable to the annex roof.
* `oak.squareCanopy` = oak in square, preserved → canopy hides the bank front from the square camera C5.
* `roof.camera` = roof access exists (installed 1998 after a break-in attempt via the oak).
* `car.spot` = lane if the yard oak is preserved (no parking under the canopy), else yard.
* `cafe.state` = `closed_flood` if creek without valve (2003 storm); `closed_terrace` if the square
  oak's protected root zone took the terrace (1991); else `open`.
* `garden.state` = `paved` if expansion = garden, else `garden`.
* `guardB.route` gains the alley loop if the alley was kept; guard B takes a coffee stop at the café
  counter only while the café is open; with the garden paved he walks around it.

Unexpected consequences required by the brief:

| brief item | where it happens |
|---|---|
| tree gives roof access but obscures part of the courtyard | yard oak canopy blocks camera C3's view of part of the yard; roof camera C6 appears |
| a new passage changes a guard's route | kept alley → guard B patrols the alley and the lane |
| altered service access relocates a delivery stop | alley service door → van stops in Linden Lane instead of the square |
| infrastructure helps the heist but closes the café | creek drain floods Café Kopp in 2003 unless the valve is fitted |
| two useful interventions conflict | yard oak + kept alley → Garden Wing on the unprotected garden, its crane fells the oak; fix with the garden petition |
| relocated parking space | preserved yard oak moves the manager's car from the yard to the lane |

## 5. Present-day security (2026)

Guards see 90° / 6 tiles on their own floor and also notice anyone within 1.1 tiles whatever
way they face (walls and floors still block). Cameras watch the floor they are mounted on.
Line of sight is blocked by wall edges, closed doors, building footprints and sight blockers
(canopies, van, umbrellas, kiosk, statue). Nobody sees across floors.

A single detection meter fills while any observer sees the thief (faster when close) and drains
when unseen. Guards who see the thief stop and turn toward them; breaking line of sight for a
moment sends them back to their route. The meter at 100 % = caught. Each new sighting is logged
as a detection event.

| observer | floor | behaviour |
|---|---|---|
| guard A | contract-specific | C1 lobby loop · C2 upper corridor · C3 basement corridor |
| guard B | G | outdoor loop (square → garden → yard), alley/lane loop if kept, café stop if open |
| C1 lobby | G | sweeping |
| C2 basement corridor | B | sweeping along the corridor |
| C3 yard | G | sweeping; oak canopy blocks part |
| C4 Glass Room dome | U | rotating; on the alarm circuit |
| C5 square lamppost | G | static, faces the bank front; monitored live, so it fills the meter 2.5× faster |
| C6 roof | U | only if roof access exists; sweeps the annex roof |
| courier | G | short-sighted; only during deliveries |

Deliveries run on a fixed 30 s cycle (first van at 6 s): the van arrives, the courier walks to
the service door and props it open for 8 s, then walks back and the van leaves. The parked van
blocks sight and movement. Service doors can always be opened from inside (push bar).

## 6. Contracts

| # | name | target | budget | new problem |
|---|------|--------|--------|-------------|
| 1 | The First Withdrawal | Linden file, archive (B) | 5 | get into the sealed bank at all |
| 2 | The Glass Diamond | diamond, Glass Room (U) | 5 | building access **plus** a way past the laser door / dome camera |
| 3 | A Clean Timeline | deposit box 46, vault (B, maglock) | 3 | the vault needs the alarm circuit cut, and the garden must survive and the café must stay open |

The alarm circuit feeds contract-specific security — contract 2: the Glass Room laser and dome
camera C4; contract 3: the vault maglock and basement camera C2. It can only be cut at the
workshop junction box, which exists only if `alarm.wiring = workshop` in 1946.

### Contract 1 solutions (each verified by a scripted heist test)

| family | plan | route |
|---|---|---|
| Rooftop | oak→yard (1946) + preserve (1986) | yard → climb oak → annex roof → upper service door → stairwell → archive |
| Underground | drain→creek (1946) + hatch (1986) | manhole → creek drain → hatch → boiler room → archive |
| Service | alley kept + service door→alley (1986) | alley → wait for the delivery → service door → stairwell → archive |
| Tree + service (combo) | oak→square + preserve | canopy hides the front service door from C5 → slip in during the square delivery |

Zero interventions: the only physical way in is the front service door, which camera C5 watches permanently.

### Contract 2 solutions

* Rooftop + skylight: oak→yard + preserve; annex roof → ladder → roof deck → skylight into the Glass Room, timed against the rotating dome camera and guard A glancing through the door.
* Any access + power cut: `alarm.wiring = workshop` plus rooftop / underground / service / combo access.
  With the alley built over, the box is inside the West Wing plant room (reach it through the stairwell);
  with the alley kept, it hangs outside in the alley on guard B's new route.

### Contract 3 solutions (budget 3, garden + café required)

* Rooftop + power cut: oak→yard + preserve + workshop wiring (garden safe because the West Wing still takes the alley).
* Service + power cut: alley kept + alley door + workshop wiring (garden safe because the heritage oak protects it).
* Tempting but dirty: underground + power cut floods the café (fixing it needs a 4th change); square-oak combo closes the café terrace.

## 7. Modes and loop

Planning: inspect objects in any era, change decisions in object cards, undo/reset, compare with
the original timeline, show patrols and vision, watch 2026 guards on their schedule. Era
changes asked for while a transition is still playing are queued; plan changes are refused
until it settles.
Heist: timeline locked; click to move / interact, hold Space to wait, Esc to pause; target then
escape to the getaway bicycle. Failure → retry the same plan or return to planning.
Success → replay (obstacle → interventions by era → resulting route → theft → escape) → results.

## 8. Code boundaries

* `src/sim/*` — pure TypeScript: causality, plan, layout expansion, navigation, vision, heist. No Three.js.
* `src/render/*` — Three.js: asset cache, world view (facts → variants), transitions, overlays, camera.
* `src/ui/*` — DOM case-file interface. `src/data/text.en.ts` holds all English copy.
* `src/audio/*` — procedural Web Audio. `src/game/*` — progression, save, share links.
