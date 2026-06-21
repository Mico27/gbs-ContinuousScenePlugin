# ContinuousSceneMetatilePlugin — PROJECT.md

> **SKILLs in use:** `gbs-plugin-creator` · `gbs-skill-maintenance`
> **GBS target version:** 4.2
> **Last updated:** 2026-06-09

---

## Project Summary

| Field | Value |
|---|---|
| **Name** | ContinuousSceneMetatilePlugin — Scripted Actor Move Fix |
| **Type** | Engine plugin override (`vm_actor.c`) |
| **Plugin folder** | `ContinuousSceneMetatilePluginExample/plugins/ContinuousScenePlugin/` |
| **Goal** | Allow GBS scripted Actor Move events to move the player into negative coordinates so TOP and LEFT continuous scene transitions fire correctly in 16px metatile mode |
| **Delivery** | Single override file: `engine/src/core/vm_actor.c` |
| **Status** | v0.1 — override created, pending build verification |

---

## Status at Last Session

**v0.1 (2026-06-09)** — `vm_actor.c` engine override created.

Changes made:
- `vm_actor_move_to_init` and `vm_actor_move_to`: replaced `saturating_add_u16(actor->pos.x/y, (WORD)params->X/Y)` with plain UINT16 wrapping addition `actor->pos.x + params->X` / `actor->pos.y + params->Y`.
- All movement execution functions (`vm_actor_move_to`, `vm_actor_move_to_x`, `vm_actor_move_to_y`, `vm_actor_move_to_xy`): changed direction-pick and overshoot comparisons to `(INT16)` casts on both operands.
- `vm_actor_move_to_set_dir_x` / `vm_actor_move_to_set_dir_y`: same signed cast for direction ternary.

**Pending:** Build the project in GBS 4.2 to confirm no compiler errors. Runtime test: player at row-1 (16px mode), scripted move UP 1 metatile → TOP scene transition must fire.

---

## Defined Terms

**`saturating_add_u16(base, delta)`** — Inline function in GBS 4.2 `math.h` (line 160). Adds a signed 16-bit `delta` to an unsigned 16-bit `base`, clamping the result to `[0, UINT16_MAX]`. Used in stock `vm_actor_move_to_init` and `vm_actor_move_to` for relative moves. **Root cause of the bug**: a delta that would produce a negative result is clamped to 0 instead of wrapping.

**wrapping UINT16 addition** — Standard C unsigned integer addition that wraps on overflow. In this codebase: `0x0100 + 0xFE00 = 0xFF00` (256 + 65024 = 65280). The replacement for `saturating_add_u16` in this override. Safe because all valid in-scene coordinates fit in INT16 range (max scene ≈ 255 tiles × 8 px × 16 subpx = 32 640 subpixels < 32 767).

**negative coordinate** — A position with signed value < 0. Stored as a large UINT16 (e.g., −256 = `0xFF00`). Required for TOP and LEFT continuous scene transitions: `PLAYER.pos.y` must wrap below 0 to trigger the detection condition `PLAYER.pos.y > TILE_TO_SUBPX(SCREEN_OOB_TOP)` (unsigned comparison, `0xFF00 > 0` → true).

**continuous scene transition (TOP/LEFT)** — Fires when `check_transition_to_scene_collision()` detects `PLAYER.pos.y > TILE_TO_SUBPX(SCREEN_OOB_TOP)` or `PLAYER.pos.x > TILE_TO_SUBPX(SCREEN_OOB_LEFT)`. Because these are unsigned comparisons, a wrapped negative value like `0xFF00` satisfies them — the transition fires. This is the expected and correct mechanism.

**`ON_16PX_GRID`** — Macro in plugin's `actor.h`: `((((A).x >> 5) & 15) == 0 && (((A).y >> 5) & 15) == 8)`. The `topdown_update()` loop only accepts input and checks transitions when the player is on a 16px grid boundary. For `0xFF00`: `65280 >> 5 = 2040`, `2040 & 15 = 8` ✓. So a wrapped target position satisfies the grid check.

**engine override** — GBS 4.2 build mechanism: a file placed under `plugins/YourPlugin/engine/src/…` at the mirrored path replaces the corresponding stock engine file at build time. No GBS source modification required. The override must be a full replacement of the stock file (SDCC/GBDK has no function-level override).

**`vm_actor_move_to_init`** — The split-system init function called by GBS when using the newer Actor Move event implementation. Computes the absolute target position from the relative delta. Source: `gbvm/src/core/vm_actor.c`.

**`vm_actor_move_to`** — The legacy monolithic movement function. Also contains its own init block when `THIS->flags == 0`. Both it and `vm_actor_move_to_init` needed the same saturating → wrapping fix.

---

## File Layout We Care About

```
ContinuousSceneMetatilePluginExample/
├── PROJECT.md                                           ← this file
├── plugins/
│   └── ContinuousScenePlugin/
│       ├── engine/
│       │   ├── engine.json
│       │   ├── include/
│       │   │   ├── actor.h                              (ON_16PX_GRID macro)
│       │   │   └── continuous_scene.h                   (transition structs + extern declarations)
│       │   └── src/
│       │       ├── core/
│       │       │   ├── continuous_scene.c               (check_transition_to_scene_collision)
│       │       │   └── vm_actor.c                       ← NEW OVERRIDE (this fix)
│       │       └── states/
│       │           └── topdown.c                        (calls check_transition_to_scene_collision)
│       └── events/
│           └── *.js                                     (GBS event definitions)
└── ...

Reference engine source (read-only — never edit):
c:\Users\micka\Documents\gb-studio\appData\engine\gbvm\src\core\vm_actor.c
c:\Users\micka\Documents\gb-studio\appData\engine\gbvm\include\math.h
```

---

## Engine Knowledge Confirmed

### Root Cause Walk-Through

Player at `pos.y = 0x0100` (256 subpx, row 1, 16px mode). GBS Actor Move event: relative UP 1 metatile = delta `0xFE00` (−512 in signed).

| Step | Stock GBS (broken) | This override (fixed) |
|---|---|---|
| Target Y computation | `saturating_add_u16(0x0100, -512)` → clamps to `0x0000` | `0x0100 + 0xFE00` → wraps to `0xFF00` |
| Target == current? | `0x0000 != 0x0100` → move needed | `0xFF00 != 0x0100` → move needed ✓ |
| Direction pick | `0x0100 > 0x0000` (unsigned) → false → move DOWN | `(INT16)0x0100 > (INT16)0xFF00` → `256 > −256` → true → move UP ✓ |
| Movement | Moves DOWN toward 0, never reaches 0x0000 as pos clamps | Moves UP, pos.y decreases, wraps through 0 |
| ON_16PX_GRID at 0xFF00 | n/a (player frozen) | `(0xFF00 >> 5) & 15 == 8` ✓ → grid check passes |
| Transition detection | Never fires | `0xFF00 > 0` (unsigned) ✓ → `transition_to_scene_modal(DIRECTION_TOP)` fires |
| After transition | Player frozen at top of scene | New scene loads, `PLAYER.pos.y += image_height_subpx` repositions player ✓ |

### Functions Changed and Why

All movement execution comparisons were unsigned in stock GBS — correct for normal in-scene moves (all coordinates positive). With wrapping targets, unsigned comparisons produce wrong direction and incorrect overshoot detection. Casting both operands to `(INT16)` before comparing restores correct signed semantics.

| Function | Change | Reason |
|---|---|---|
| `vm_actor_move_to_init` | `saturating_add_u16` → `actor->pos + params->X/Y` | Wrapping needed for negative targets |
| `vm_actor_move_to` (init block) | Same | Legacy path, same bug |
| `vm_actor_move_to` (direction flags) | `actor->pos.x > params->X` → `(INT16)` cast | Wrong direction without signed compare |
| `vm_actor_move_to` (overshoot) | `<= / >=` → `(INT16)` cast | Overshoot never detected unsigned |
| `vm_actor_move_to_x` | Direction + both overshoot checks → `(INT16)` cast | Same |
| `vm_actor_move_to_y` | Direction + both overshoot checks → `(INT16)` cast | Same |
| `vm_actor_move_to_xy` | Direction + overshoot checks for both axes → `(INT16)` cast | Same |
| `vm_actor_move_to_set_dir_x/y` | Direction ternary → `(INT16)` cast | Facing direction set wrong without fix |

### What Was NOT Changed

- `vm_actor_move_cancel` — uses unsigned comparisons to snap to tile-aligned position; this always operates within valid positive coordinates (called after transition, not before).
- `check_collision_horizontal/vertical` — static helpers; take UWORD and do unsigned tile math. Not called for boundary-crossing moves (those don't use `ACTOR_ATTR_CHECK_COLL_WALLS`).
- All non-movement functions — unrelated to coordinate arithmetic.

### Coordinate Safety

The unsigned-to-signed cast is safe because GBS scene dimensions are bounded: max scene is 255 × 255 tiles, each tile 8 px, each pixel 16 subpixels = 32 640 subpixels maximum. `INT16_MAX = 32 767 > 32 640`. No valid in-scene coordinate can exceed INT16 range, so the signed cast never misinterprets a legitimate large positive value as negative.

---

## Invariants (Don't Break These)

1. **Full file copy required** — The override must be a complete copy of the stock `vm_actor.c`. SDCC/GBDK has no function-level override mechanism. If only a subset of functions were changed and the rest were missing, the linker would fail.

2. **Wrapping is unconditional** — The saturating behavior is not restored when `continuous_scene_enabled == 0`. This is intentional: gating on the runtime flag would add a branch in a frequently-called path and the safety argument (coordinates fit in INT16) holds regardless of whether continuous scenes are active.

3. **ACTOR_ATTR_CHECK_COLL_WALLS must not be combined with boundary-crossing moves** — `check_collision_horizontal/vertical` receive `UWORD end_pos` and do unsigned tile index math. A wrapped negative target (e.g., `0xFF00`) passed as `end_pos` would produce tile index ~255, pointing to garbage data. The plugin's boundary-crossing moves should never have wall collision enabled — the player is supposed to walk through the boundary.

4. **Re-sync required after GBS engine updates** — The override is a full copy of `vm_actor.c` from GBS 4.2. If GBS updates this file (new movement features, bug fixes), the override will silently shadow the update. Check `gbvm/src/core/vm_actor.c` for changes when upgrading GBS version and merge the delta into this override.

---

## Known Gotchas

1. **SDCC warning 85 (unreferenced function parameter)** — If `THIS` is not used in a VM helper, SDCC emits warning 85. Not currently triggered by this override (all functions use `THIS`), but keep in mind if adding new helpers. Fix: add `(void)THIS;` at the top of the function body.

2. **Stale bash/terminal view after file edits** — The GBS plugin-creator SKILL documents this: immediately after writing a file, the terminal may serve a stale view. Trust the editor's file view (Read tool), not the terminal `cat` output, to confirm changes took effect.

3. **Legacy `vm_actor_move_to` vs. split system** — GBS 4.2 has two movement code paths: the older `vm_actor_move_to` (monolithic) and the newer split system (`vm_actor_move_to_init` + `vm_actor_move_to_x/y/xy`). Both must be fixed. This override fixes both. If a future GBS version removes the legacy path, the orphaned code is harmless.

4. **RELATIVE_SNAP after wrapping** — If `ACTOR_ATTR_RELATIVE_SNAP_PX` or `ACTOR_ATTR_RELATIVE_SNAP_TILE` is set alongside `ACTOR_ATTR_RELATIVE`, the snap macros (`SUBPX_SNAP_PX`, `SUBPX_SNAP_TILE`) are applied after the wrapping add. These macros mask the low bits and are unsigned-safe. A wrapped negative target like `0xFF00` snapped to tile: `SUBPX_SNAP_TILE(0xFF00) = 0xFF00 & 0xFF00 = 0xFF00` (already tile-aligned). No issue.

---

## Versions

### v0.1 — 2026-06-09
- Created `plugins/ContinuousScenePlugin/engine/src/core/vm_actor.c` engine override.
- Fixed: `saturating_add_u16` → wrapping UINT16 addition in `vm_actor_move_to_init` and `vm_actor_move_to`.
- Fixed: all direction-pick and overshoot comparisons in `vm_actor_move_to`, `vm_actor_move_to_x/y/xy`, `vm_actor_move_to_set_dir_x/y` changed to `(INT16)` signed casts.
- Added file-level comment documenting the override purpose, GBS version pin, and the `ACTOR_ATTR_CHECK_COLL_WALLS` constraint.
- **Pending verification:** build test + runtime test in 16px metatile mode.

---

## What's Out of Scope

- **Diagonal scene transitions** (TOP_LEFT, TOP_RIGHT, etc.) — these use a different detection path; not affected by this fix and not tested.
- **Other scene types** (platform, adventure, shmup) — `check_transition_to_scene_collision()` is only called from `topdown_update()`. Scripted actor moves in those scene types are unaffected by the boundary-crossing problem.
- **Wall collision during boundary-crossing** — combining `ACTOR_ATTR_CHECK_COLL_WALLS` with a boundary-crossing move is out of scope and explicitly unsupported (Invariant 3).
- **RIGHT/BOTTOM transitions** — those go to large positive coordinates and already work correctly with unsigned comparisons; untouched.

---

## Working Style

- **Confirm before assuming** — Read engine source files before describing their behavior. The root-cause analysis in this document was confirmed against actual source files, not documentation.
- **Minimal override** — Only changed the lines that required it. The rest of `vm_actor.c` is an exact copy of the GBS 4.2 stock file.
- **Flag uncertainty explicitly** — If v0.1 verification reveals unexpected behavior, add a "Known Issue" entry before starting any v0.2 work.
- **One concern at a time** — Do not add other plugin features (e.g., diagonal transition scripted moves) in the same session as an unverified fix.

---

## Handover Protocol

Run at the end of each session:

1. Update "Status at Last Session" section above with what was done and what's pending.
2. Note any new facts that belong in "Engine Knowledge Confirmed" or "Known Gotchas".
3. Note any candidates for promotion to the `gbs-plugin-creator` SKILL (promotion criteria: confirmed across 2+ projects, high confidence).
4. Write the opening prompt for the next session: *"Read PROJECT.md. Status is [v0.x]. Pending: [task]. Start by [first step]."*
5. List any unfinished work under a new "Pending" heading here.

### Pending (v0.1)

- [ ] Build `ContinuousSceneMetatilePluginExample` in GBS 4.2; confirm no compiler errors.
- [ ] Runtime test: player at Y = row 1 (16px mode), scripted Actor Move UP 1 metatile → TOP transition fires.
- [ ] Runtime test: scripted Actor Move DOWN in unconnected scene → reaches destination without wrap-around regression.
- [ ] Confirm facing direction is correct (UP) during the cross-boundary move.
