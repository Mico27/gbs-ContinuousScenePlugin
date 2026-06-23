# Pokered Warp System — Research & GB Studio Implementation Plan

Research date: 2026-06-22. Source: `C:/Users/micka/Documents/pokered/`.

---

## Part 1 — How pokered actually warps

### 1.1 The warp data model

Every map carries a `def_warp_events` list (`data/maps/objects/*.asm`):

```
warp_event  x, y, DEST_MAP, dest_warp_id
```

On map load (`home/overworld.asm:2082`) these are copied into `wWarpEntries`, **4 bytes per warp** — `Y, X, destWarpID, destMap` — with the count in `wNumberOfWarps`.

Key fields written when a warp fires (`WarpFound1`/`WarpFound2`, `overworld.asm:476`):

| RAM | Meaning |
|---|---|
| `wDestinationWarpID` | which warp slot to spawn on in the destination map |
| `hWarpDestinationMap` | destination map id |
| `wWarpedFromWhichWarp` | slot index of the warp we just used |
| `wWarpedFromWhichMap` | map we left |
| `wLastMap` | last *outdoor* map (set only when leaving an "outside" map) |

**The `LAST_MAP` ($FF) trick** (`overworld.asm:508`): if a warp's destination map is `LAST_MAP`, the engine sends the player back to `wLastMap` — the outdoor map they last came from. This is how dozens of generic building interiors (every identical house, every Poké Mart) share one exit that returns you to whatever town you entered from. The matching spawn point is resolved through `wWarpedFromWhichWarp`.

Destination spawn coordinates are pulled by `LoadDestinationWarpPosition` (`overworld.asm:2429`), indexing the **destination** map's warp list by `dest_warp_id`.

### 1.2 When does a warp trigger?

In `OverworldLoop`, after the player finishes a step, one of two checkers runs:

- **`CheckWarpsNoCollision`** (`overworld.asm:391`) — player stepped freely onto a tile.
- **`CheckWarpsCollision`** (`overworld.asm:440`) — player walked into a wall *while standing on* a warp coordinate (edge-of-map exits).

A warp at the player's (X,Y) fires only when an **extra condition** also passes. `IsPlayerStandingOnDoorTileOrWarpTile` (`player_state.asm:190`) gives an immediate yes; otherwise `ExtraWarpCheck` (`overworld.asm:719`) selects one of two tests by map/tileset:

- **Function 1 — `IsPlayerFacingEdgeOfMap`** (`player_state.asm:86`): passes when the player is at the map border *facing outward*. Used for S.S. Anne 3F and similar where the exit is the literal edge.
- **Function 2 — `IsWarpTileInFrontOfPlayer`** (`player_state.asm:152`): passes when the tile the player faces is a "warp carpet" tile **and** a directional button is held (`PAD_CTRL_PAD`, `overworld.asm:434`). Used by outdoor tilesets, ships, the Plateau, Rocket Hideout, Rock Tunnel — i.e. cave mouths and door mats you must walk *into*.

So pokered effectively has these trigger flavors:

| Flavor | Condition | Example |
|---|---|---|
| **Door / warp tile** | stand on a door/warp tile listed for the tileset | building doors, Poké Center mat |
| **Directional (carpet)** | face a warp-carpet tile **and press toward it** | cave entrances, outdoor mats |
| **Edge-of-map** | at border facing out, standing on a warp coord | S.S. Anne deck exits |
| **Forced / scripted** | `BIT_WARP_FROM_CUR_SCRIPT`, `BIT_FORCED_WARP` | story warps |

### 1.3 Per-tileset tile tables

Detection is entirely tile-id + tileset driven:

- `WarpTileIDPointers` (`data/tilesets/warp_tile_ids.asm`) — tiles you *stand on* to warp.
- `WarpTileListPointers` / `warp_carpet_tile_ids.asm` — carpet tiles checked *in front*, indexed by facing.
- `DoorTileIDPointers` (`data/tilesets/door_tile_ids.asm`) — door tiles; standing on one sets `BIT_STANDING_ON_DOOR` so the player animates stepping out of the door on arrival.
- `WarpPadAndHoleData` (`data/tilesets/warp_pad_hole_tile_ids.asm`):
  ```
  FACILITY $20 -> 1 (warp pad)   ; Saffron Gym, Silph Co teleporters
  FACILITY $11 -> 2 (hole)
  CAVERN   $22 -> 2 (hole)       ; Rocket Hideout drop-downs
  INTERIOR $55 -> 1 (warp pad)
  ```

### 1.4 The three "spin" behaviors — keep them distinct

This is the part most easily conflated:

1. **Warp pads (teleporters)** — FACILITY `$20`, INTERIOR `$55`. These **are real warp_events**. They teleport to another warp pad, usually in the **same map** (Saffron Gym's 30+ pads), with a spin animation:
   - Leaving: `_LeaveMapAnim` → `IsPlayerStandingOnWarpPadOrHole` → `PlayerSpinWhileMovingUpOrDown` spins the player upward off the pad, `SFX_TELEPORT_EXIT` (`player_animations.asm:95`).
   - Arriving: `EnterMapAnim` → `PlayerSpinWhileMovingDown` spins the player down onto the pad, `SFX_TELEPORT_ENTER` (`player_animations.asm:19`), then `BIT_FLY_WARP` re-runs the enter anim.

2. **Holes** — FACILITY `$11`, CAVERN `$22`. Real warps too; `LeaveMapThroughHoleAnim` drops the player through the floor to the floor below (Rocket Hideout).

3. **Arrow / spin tiles** — Rocket Hideout & Viridian Gym (`scripts/RocketHideoutB2F.asm`). **NOT warps at all.** The map script looks up the player's (Y,X) in an arrow-movement RLE table (`RocketHideout2ArrowTilePlayerMovement`), sets `BIT_SPINNING`, and `StartSimulatingJoypadStates` to slide the player across the floor (spinning, `SFX_ARROW_TILES`) until they reach a stop tile. No map change. Driven by `LoadSpinnerArrowTiles` (`engine/overworld/spinners.asm`).

### 1.5 Special warps (out of scope but noted)

Fly, Dig/Escape Rope, dungeon warps, and blackout all route through `PrepareForSpecialWarp` / `SpecialEnterMap` / `HandleFlyWarpOrDungeonWarp` (`overworld.asm:783`). They jump to fixed targets (last Poké Center, last dungeon entrance) rather than a tile-matched warp_event.

---

## Part 2 — Mapping pokered → GB Studio

GB Studio has no tileset-driven warp engine. Warps are normally per-instance triggers calling **Change Scene**. The project already replicates pokered semantics with a tile-/metatile-aware script layer. Reconciliation:

| pokered behavior | pokered trigger condition | GB Studio realization (this project) |
|---|---|---|
| Building door / cave mouth (overworld→indoor) | stand-on / press-into door tile + cooldown | **DOOR_CAVE**: overworld trigger, cooldown guard (`WarpCooldown`), `warp_script` (ENTRY) → Change Scene |
| Indoor exit back outside (`LAST_MAP`) | walk into edge / press toward mat | **EXIT**: indoor trigger installs an input handler (`script_warp_input_{dir}`), checks facing dir, `warp_script_indoor` → Change Scene; `leaveScript` removes the handler |
| Stairs / ladder (indoor↔indoor) | stand on stair tile | **SIMPLE**: trigger → direct Change Scene |
| Warp pad / teleporter (Saffron Gym) | stand on FACILITY `$20`, spin anim | **SPINNER**: metatile-id (31) detection in the shared init script's *Metatile Enter* handler → `script_spinning_warp` (manual spin) → `warp_script_indoor`; arrival re-spin when `WarpType==1` |
| Hole drop-down (Rocket Hideout) | stand on FACILITY `$11` / CAVERN `$22` | *not yet implemented* — same shape as SPINNER, drop anim instead of spin |
| Arrow/spin slide tiles | (Y,X) lookup, simulated joypad | *not yet implemented* — would use simulated-input plugin, no scene change |

### What pokered teaches us that improves the current design

1. **The `LAST_MAP` pattern is the right model for generic interiors.** Rather than hard-wiring every house's exit to a specific town, an indoor EXIT can resolve its destination from "where did I enter from." The current per-warp `warp_script_indoor` case list is the explicit expansion of this; it works but is large. A `LastMap`/`LastWarp` variable pair would collapse many EXIT cases into one.

2. **Trigger condition belongs on the tile, not on a hand-placed trigger box.** pokered never places a warp "trigger volume" — the warp coordinate + the tile id under/in-front-of the player *is* the trigger. The project already moved Saffron Gym's 30 pads to **metatile-id detection** (id 31, FACILITY) inside a Metatile Enter handler. That is exactly pokered's model and should be the default for all pad/hole/cave behaviors, reserving real triggers only for arbitrary one-off warps.

3. **Directional gating matters.** pokered's "Function 2" requires pressing *into* the warp. The EXIT input-handler approach already mirrors this (checks held direction + facing). Door/cave entries that should fire on *step-on* must NOT gate on direction.

4. **Spin is an entry+exit animation pair tied to the pad tile**, not a property of the destination. `WarpType==1` arrival re-spin already captures the entry half; the exit half is `script_spinning_warp`.

5. **Anti-reentry: spawning on a warp tile re-fires it.** Engine `trigger.c` resets `last_trigger` on scene load, so a SIMPLE warp that drops the player on the paired stair/ladder trigger re-fires it → infinite bounce. Each warp flavor needs a guard against this:
   - DOOR_CAVE → `WarpCooldown` (var20) + `post_fadein_overworld` steps the player off the door and clears it.
   - EXIT → input-gating (must press a direction), so spawning on it does nothing.
   - SIMPLE stairs/ladders → **`StairCooldown` (var28)** ✅ FIXED (2026-06-22): trigger sets it ON before Change Scene; the paired destination trigger sees ON and skips; the trigger's `leaveScript` clears it when the player steps off. Kept separate from `WarpCooldown` (which stays ON for the whole indoor visit and would otherwise block the first indoor stair). Safe because `trigger_reset` does **not** run leave scripts on scene change — the ON state survives the warp.

### Unified init (2026-06-22) ✅

The separate **Init Indoor Script** was merged into **Init Overworld Script** and deleted. Every played scene (overworld + indoor, 224 total) now calls **init_overworld** *and* **post_fadein** from On Init:

- The FACILITY spinner-pad detection moved into init_overworld's **Metatile Enter (event 0)** handler, gated by `SWITCH var21 (MetatileType) == FACILITY` — so only FACILITY scenes ever test metatile id 31 (`FACILITY_SPINNING_WARP`). Injected idempotently by `gen_warps.js::injectSpinnerIntoInitOverworld` (stable id `…0000000000aa`); it reads the player position first (`$self$` → var12/var13) before the metatile/position switch.
- Indoor init pattern now mirrors overworld: `LOAD_META_TILES → SET var21 → CALL init_overworld → FADE_IN → CALL post_fadein` (saffron substitutes the `WarpType==1` arrival block for the plain fade).
- **Cooldown consequence**: `post_fadein` resets `WarpCooldown` on *every* scene now, so it no longer persists through an indoor visit. To keep DOOR_CAVE anti-reentry working on EXIT, **`warp_exit_resolve` sets `WarpCooldown` ON before warping out** — the overworld door the player lands on is blocked on frame 1, then `post_fadein` steps them off and clears it. (Confirmed via engine `topdown.c`: triggers activate every frame in `topdown_update`, so the door fires before the init script's `post_fadein` runs.)

---

## Part 3 — Implementation plan

### Phase A — Consolidate the tile-driven model (no engine edits)

1. **Metatile-type + metatile-id constants** (done): `MetatileType` (var21) per scene, `METATILEIDS/FACILITY_SPINNING_WARP=31`. Extend with `FACILITY_HOLE`, `CAVERN_HOLE` ids when holes are added.
2. **Shared init scripts** (in progress): `init_overworld_script` and the new `init_indoor_script`, each registering a *Metatile Enter* handler that dispatches on `MetatileType`. This is the GB Studio analogue of pokered's per-tileset tile tables — one dispatcher, tileset-keyed.
3. **Pad detection lives in the init script, not in triggers** (in progress for Saffron): `IF MetatileType==FACILITY → GetMetatileAtPos → IF id==31 → position switch → spinning_warp(WarpId)`. Roll this pattern out to any other map using FACILITY/INTERIOR pads.

### Phase B — Collapse EXIT cases with a LAST_MAP variable ✅ IMPLEMENTED (2026-06-22)

- Added globals **LastMap (var27)**, **LastWarpX (var25)**, **LastWarpY (var26)**. (var24 is an existing `SceneType` var — not reused.)
- **DOOR_CAVE entry** now records the overworld return scene index + coords before the warp.
- New **`warp_exit_resolve`** script (`e4000001-…`, symbol `script_warp_exit_resolve`): `SWITCH LastMap → Change Scene(town, x=LastWarpX, y=LastWarpY, down)`. Coordinates are variables (the `x`/`y` fields are `type:"value"`); only the scene is static.
- `warp_input_{dir}` scripts now call the resolver (no WarpId); EXIT cases removed from `warp_script_indoor`, which now holds **spinners only**.
- **Result: 139 per-building EXIT cases → 27 LastMap targets.** `warp_script_indoor` 173 → 34 cases. Entries unchanged (143). ROM builds clean (1 MB, exit 0).
- More correct than the old static approach: shared entrances now return to the *door actually used*, because each DOOR_CAVE entry records its own return point.

### Phase C — Holes & arrow tiles (future)

- **Holes**: clone the SPINNER path; swap the spin animation for a fall/drop (actor move down + fade), detection by `FACILITY $11` / `CAVERN $22` metatile ids.
- **Arrow/spin slide tiles** (Rocket Hideout / Viridian Gym): this is force-movement, not a warp. Use the **simulateInputPlugin** to replay a per-tile movement sequence; detect the arrow metatile in the Metatile Enter handler and feed the matching RLE-style input list. No scene change.

### Engine-edit assessment

| Need | Engine edit? |
|---|---|
| Read metatile under / in front of player | **No** — `EVENT_GET_META_TILE_AT_POS` exists |
| Metatile Enter hook | **No** — `PM_EVENT_METATILE_SCRIPT` (MetaTile plugin) provides it |
| Spin / drop animations | **No** — scriptable via actor frames / fades (current `script_spinning_warp`) |
| Simulated input for arrow tiles | **No** — simulateInputPlugin |
| `LAST_MAP` resolution | **No** — plain variables |
| Per-frame perf if every Metatile Enter does a switch | **Maybe** — if the dispatcher gets heavy across 240+ scenes, a small VM helper to compare "metatile in front against a tileset table" could replace nested switches. Defer until measured. |

**Conclusion: the behavior is fully reproducible in scripts with the MetaTile + simulateInput plugins. No engine C edits are required for door/cave/exit/stairs/warp-pad parity.** Engine work would only be a *performance* optimization (a tileset→warp-tile lookup VM helper) or to gain the exact pokered spin-pixel animation, neither of which is necessary for correct behavior.

---

## Summary

- **pokered warps = warp_event coordinate + tileset tile-id condition**, resolved through per-tileset tile tables, with `LAST_MAP` giving shared generic-interior exits. Four trigger flavors: stand-on-door, press-into-carpet, edge-of-map, scripted.
- **Three "spin" things are different**: warp pads (real teleport warps w/ spin anim), holes (real warps w/ drop anim), and arrow tiles (force-movement, *not* warps).
- **GB Studio mapping**: DOOR_CAVE / EXIT / SIMPLE / SPINNER already cover doors, edge-exits, stairs, and warp pads. The project's move to **metatile-id detection inside a shared Metatile Enter dispatcher** is precisely pokered's tileset-table model and should be the default; reserve hand-placed triggers for one-offs.
- **Plan**: (A) finish the tile-driven dispatcher + constants, (B) optionally collapse EXIT cases with `LastMap`/`LastWarp` variables, (C) add holes (clone SPINNER) and arrow tiles (simulateInput) later.
- **No engine edits required** for full door/cave/exit/stairs/warp-pad parity — everything is achievable with the MetaTile and simulateInput plugins plus existing VM events. Engine C work would be optional perf/animation polish only.
