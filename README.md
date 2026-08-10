# gbs-ContinuousScenePlugin

**Version 4.3.0 — Requires GB Studio ≥ 4.3.0**

A GB Studio engine plugin that stitches multiple scenes into a single seamless world. The camera always stays centered on the player, scroll limits are lifted, and as the player approaches a scene edge the plugin pulls tile data from the registered neighbour scene directly into VRAM — so the neighbouring map is already visible on screen before the player crosses. When the player reaches the boundary, the scene load happens instantly and invisibly: coordinates are rebased so the new scene aligns perfectly with where the player already is. No fade, no transition animation — the world simply keeps scrolling.

Scenes can be arranged in any rectangular grid with optional connection offsets, diagonal corners are supported, and the world can optionally wrap horizontally and/or vertically. All supported scene types (Top-Down, Platformer, Adventure, Point & Click, SHMUP) work with the plugin, however it was designed with Top-Down in mind and require more processing than the default rendering method, so it is best to avoid having too much going on in continuous scenes.

> **Incompatibility:** this plugin is not compatible with **gbs-ScreenScrollPlugin**. Do not use both in the same project.

Four events are added to the **Scene** group: **Set Continuous Scene**, **Auto Connect Continuous Scene**, **Remove Continuous Scene**, and **Assign current scene scroll offset to Variable**.

Continuous pokemon red overworld example (with map connection offsets):

https://github.com/user-attachments/assets/69258872-59f5-4267-8529-4f755d5f1cdc

Continuous FF1 overworld example (with horizontal and vertical world looping):

https://github.com/user-attachments/assets/76cedc32-d258-475c-a235-4a8ffa2a8946

---

## Table of Contents

1. [Concepts](#concepts)
2. [Project Setup](#project-setup)
3. [Size Limits and Restrictions](#size-limits-and-restrictions)
4. [Events Reference](#events-reference)
5. [Engine Settings](#engine-settings)
6. [Memory Footprint](#memory-footprint)
7. [Bank 0 (HOME) Usage](#bank-0-home-usage)
8. [Changelog](#changelog)

---

## Concepts

### Continuous Tile Rendering

GB Studio normally clamps the camera to the current scene's boundaries. This plugin removes that clamp. The camera is always centered on the player and can scroll freely past a scene edge. As the camera moves, `load_tile_row_continuous` / `load_tile_col_continuous` intercept every VRAM tile write and route out-of-bounds coordinates to the registered neighbour scene's tilemap. The result is that the neighbour scene's tiles appear on screen progressively as the player walks toward the edge — exactly as if the two scenes were one large map.

### The VRAM Tilemap as a Ring Buffer

The GB hardware background tilemap is 32×32 tiles but only 20×18 tiles are visible at once. The plugin exploits this by treating the map as a wrap-around ring buffer. `bkg_offset_x` and `bkg_offset_y` accumulate the total tile displacement across all scene crossings and are used as an additive offset when computing VRAM write addresses. This keeps the ring-buffer position coherent between scenes so tile data written for one scene and tile data written for a neighbour always land in the correct VRAM slots regardless of how many crossings have occurred.

### Invisible Scene Load

When the player's position actually crosses a scene boundary, `transition_to_scene_modal` fires. It temporarily disables tile rendering, rebases the player position, camera, scroll values, and `bkg_offset` so that the new scene's coordinate system matches the player's current on-screen position, then calls `load_scene`. Because the coordinates are pre-adjusted before the load and `is_transitioning_scene` prevents `scroll_reset` from clearing the offsets, the VRAM ring buffer stays intact. After the new scene's init scripts finish, rendering resumes — and since the tiles were already visible, nothing on screen changes.

### Connection Offsets

Scenes connected along a shared edge do not need to have perfectly aligned top or left edges. An **offset** value specifies how many tiles the neighbour scene is shifted relative to the current scene along the shared edge. This allows building overworld maps where, for example, two horizontally adjacent scenes start at different vertical positions — the tile data is correctly stitched at the seam regardless of the offset.

### Diagonal Corners

When four scenes share a corner point, the plugin can also register diagonal neighbours (Top-Left, Top-Right, Bottom-Left, Bottom-Right). This ensures that the corner pixel of the VRAM ring buffer is filled correctly and prevents a single blank or corrupt tile appearing at the junction when scrolling diagonally.

---

## Project Setup

### Option A — Manual Setup with Set Continuous Scene

For small maps or non-uniform grids, wire each connection by hand in the **On Init** script of every scene:

1. In the **On Init** script of a scene, add a **Set Continuous Scene** event for each direction that has a neighbour.
2. Set **Scene** to the neighbour scene in that direction.
3. Set **Direction of Scene** (Top, Right, Bottom, Left, or a diagonal).
4. Set **Offset of Scene** if the neighbour is shifted along the shared edge (see [Connection Offsets](#connection-offsets)).

Repeat for every scene and every direction. There is no need to place triggers on scene edges — the plugin detects boundary crossing automatically.

### Option B — Automatic Setup with Auto Connect Continuous Scene

For large grids of uniformly named scenes, the **Auto Connect Continuous Scene** event derives all connections automatically from the scenes' positions in the GB Studio world map.

**Important:** this event must be placed in the **On Init** script of the **very first scene** of the project. GBS injects the connection setup code into the init scripts of all matching scenes at compile time, and requires the event to be processed before any of those scenes are compiled.

> To force a scene to be the first scene of the project: close the project, open `project/scenes/<SceneName>/scene.gbres` in a text editor, and set the `"_index"` field to `-1`. Save the file, reload the project in GB Studio, then save the project — GB Studio will reposition that scene as the first one.

1. Give all the scenes you want connected a common **GBVM symbol prefix** (set via *View GBVM symbol* for each scene, or enforce a naming convention that becomes the symbol).

<img width="892" height="274" alt="image" src="https://github.com/user-attachments/assets/36714b5a-e7cc-43b3-ba4e-af7d1fd4d3d7" />
<img width="290" height="159" alt="image" src="https://github.com/user-attachments/assets/557a25e6-d78b-4ed9-8e20-6c534fba9bfc" />
<img width="285" height="141" alt="image" src="https://github.com/user-attachments/assets/9242132f-a294-4b8c-ad54-fed1babc5bd5" />

2. Place **Auto Connect Continuous Scene** in the On Init script of your first scene and set **Scene data symbol prefix** to that prefix.
3. Enable **Loop Horizontally** and/or **Loop Vertically** if the world should wrap.

Auto Connect only detects connections where scene boundaries **touch exactly** in the world map — if two scenes' edges do not perfectly align, no connection is created between them. Use [Option A](#option-a--manual-setup-with-set-continuous-scene) for those connections, or adjust scene positions in the world map so the edges meet.

The event runs entirely at **compile time**: it reads scene positions from the project, builds a connection table, and injects a `load_scene_connections` native call at the top of each matching scene's init script. No runtime overhead for the detection pass; connections are baked into ROM.

---

### Connection Offsets

When two horizontally adjacent scenes have different heights or are vertically misaligned, set **Offset of Scene** to `(current scene top) − (neighbour scene top)` in tiles. A positive offset means the neighbour starts lower; a negative offset means it starts higher.

The Auto Connect event computes this automatically from world-map positions: `offset = scene_top − other_scene_top` for left/right connections and `offset = scene_left − other_scene_left` for top/bottom connections.

---

### World Looping

Enable **Loop Horizontally** or **Loop Vertically** in the **Auto Connect Continuous Scene** event to wrap the world edges:

- **Loop Horizontally**: connects every left-edge scene to the corresponding right-edge scene.
- **Loop Vertically**: connects every top-edge scene to the corresponding bottom-edge scene.
- Both enabled: additionally connects the four world corners diagonally.

The offsets for wrap-around connections are computed by the same formula as regular connections.

---

## Size Limits and Restrictions

### Maximum Scene Size is Halved

Due to the ring-buffer nature of the VRAM tilemap, the usable scene dimensions are limited to **128 tiles wide and 128 tiles tall** (half of the standard GB Studio maximum of 256×256). Exceeding this causes visual wrap-around corruption during transitions.

### Common Tileset Is Required

All scenes that scroll into each other must share the same **common tileset**. Click the puzzle-piece icon on each scene in GB Studio and assign the same common tileset asset. This ensures tile indices are consistent across scene boundaries so that the visual join is seamless.

### Scripts Are Reset on Boundary Crossing

When the player crosses a scene boundary, all running script contexts in the current scene are terminated (variables are preserved). Timers, input events, and music events are also reset. The new scene's init scripts run after the scene loads, while tile rendering is still disabled, and the game loop resumes only once they finish.

### The Camera Always Follows the Player

There is no transition animation and no camera lock during the scene load. The camera is centered on the player at all times. The `DISABLE_SCROLL_LIMITS` define (enabled by default) removes the per-scene scroll clamp so the camera can freely follow the player past scene boundaries, revealing neighbour tiles as it goes.

### Out-of-Bounds Areas

While a scene is scrolling, tiles that fall outside any registered neighbour are filled with the tile specified by **Out of bounds tile Id** (`fill_tile_id`). Set this engine field to a solid-colour or water tile appropriate to your world's border. The corresponding **Out of bounds tile attribute** (`fill_tile_attr`) sets the CGB palette attribute for the fill tile.

---

## Events Reference

All events are in the **Scene** group.

---

### Set Continuous Scene

**`EVENT_SET_CONTINUOUS_SCENE`**

Registers a scene as the neighbour in a given direction and enables boundary-crossing detection for the current scene. Must be called in the scene's **On Init** script. Can be called up to eight times (once per direction) to register all neighbours, including diagonals.

| Field | Description |
|-------|-------------|
| Scene | The scene to scroll to when the player exits in the chosen direction. |
| Direction of Scene | Top, Right, Bottom, Left, Top-Left, Top-Right, Bottom-Right, or Bottom-Left. |
| Offset of Scene | Tile offset of the neighbour scene along the shared edge (positive = neighbour is shifted down/right). |

---

### Auto Connect Continuous Scene

**`EVENT_AUTO_CONNECT_CONTINUOUS_SCENE`**

Compile-time event that reads scene positions from the world map and automatically generates all **Set Continuous Scene** calls for every scene whose GBVM symbol starts with the given prefix. The connection table is written to a ROM asset and injected into each scene's init script at compile time.

**Must be placed in the On Init script of the very first scene of the project.** Only connections where two scene boundaries touch exactly in the world map are created; scenes whose edges do not perfectly align will not be auto-connected (use **Set Continuous Scene** for those).

> To force a scene to be the first scene of the project: close the project, open `project/scenes/<SceneName>/scene.gbres` in a text editor, and set the `"_index"` field to `-1`. Save the file, reload the project in GB Studio, then save the project again.

| Field | Description |
|-------|-------------|
| Scene data symbol prefix | GBVM symbol prefix shared by all scenes to connect (e.g. `overworld_`). Only scenes whose symbol starts with this prefix are included. |
| Loop Horizontally | Connect left-edge scenes to right-edge scenes so the world wraps horizontally. |
| Loop Vertically | Connect top-edge scenes to bottom-edge scenes so the world wraps vertically. |

---

### Remove Continuous Scene

**`EVENT_REMOVE_CONTINUOUS_SCENE`**

Removes the registered neighbour for a given direction at runtime. Use this to dynamically block a connection — for example, to prevent crossing into a scene that has not yet been unlocked in the game.

| Field | Description |
|-------|-------------|
| Direction of Scene | Top, Right, Bottom, Left, Top-Left, Top-Right, Bottom-Right, or Bottom-Left. |

---

### Assign current scene scroll offset to Variable

**`EVENT_GET_SCROLL_OFFSET`**

Reads the current accumulated background offset (`bkg_offset_x`, `bkg_offset_y`), masks each to 0–31, and stores the values into two variables. Useful for scripts that need to compensate for the viewport shift when drawing to fixed screen positions (e.g. placing overlay elements that must align with world tiles).

| Field | Description |
|-------|-------------|
| X Offset Variable | Destination variable for the horizontal tile offset (0–31). |
| Y Offset Variable | Destination variable for the vertical tile offset (0–31). |

---

## Engine Settings

These settings are found under **Settings → Engine Fields → Continuous Scene**.

### Performance Flags

| Setting | Default | Description |
|---------|---------|-------------|
| **Disable player sprite loading on scene scroll** | Enabled | Skips re-uploading the player sprite VRAM data on scroll transitions. Safe when the player sprite is unchanged between scenes. |
| **Disable tileset loading on scene scroll** | Disabled | Skips the full tileset VRAM reload on scroll transitions. Only enable if all connected scenes use an identical common tileset. |
| **Disable loading UI tileset on scene load** | Disabled | Skips the UI tileset reload on every scene load. Enable if the UI tiles are baked into the common tileset. |
| **Disable scroll limits** | Enabled | Removes the engine's normal per-scene scroll clamps so the viewport can travel freely across scene boundaries during a transition. |

### Out-of-Bounds Fill

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| **Out of bounds tile Id** (`fill_tile_id`) | Number | 0 | Tile index used to fill areas that fall outside all registered neighbour scenes during a scroll transition. |
| **Out of bounds tile attribute** (`fill_tile_attr`) | Number | 0 | CGB tile attribute applied to the fill tile (palette, bank, flip flags). |

### Top-Down Extra Collision

**Removed.** The *Player extra collision group* field (`player_collision_group`), which
OR'd extra tile bits into every player movement check in Top-Down scenes, is gone in
favour of **CollisionExPlugin**'s *Player tile collision mask XOR*
(`player_xor_tile_collision`) — the same job, but in every scene type rather than only
Top-Down.

Migrating is a symbol swap. The masks the old field was OR'd into are direction bits
only, so for a tile property bit such as `16` (`0x10`, the water surface) XOR'ing it in
produces exactly the same mask. Replace every
`VM_SET_CONST_UINT8 _player_collision_group, n` with
`VM_SET_CONST_UINT8 _player_xor_tile_collision, n` and install CollisionExPlugin, whose
**Enable player tile collision mask XOR** setting is on by default — with it off the field
is compiled out and ignored, and the extra collision silently stops applying. The
Continuous Scene + Metatile example does exactly this.

### Runtime-Only Fields

These are read-only engine fields accessible via **Engine Field Value** in scripts.

| Field | Description |
|-------|-------------|
| `bkg_offset_x` | Accumulated horizontal tile offset of the viewport (0–31). Updated on every transition. |
| `bkg_offset_y` | Accumulated vertical tile offset of the viewport (0–31). Updated on every transition. |

---

<!-- SETTINGCOST:BEGIN -->
### What each engine setting costs

Every setting here changes what gets compiled. Figures are what you **get back by
turning the setting off**; rows marked *off by default* show what turning it **on**
costs instead, and sliders show the cost per step. A dash means that budget does not
move.

| Setting | Bank 0 | WRAM | Banked ROM |
|---|---|---|---|
| Disable player sprite loading on scene scroll | — | — | **16 B** |
| Disable tileset loading on scene scroll *(off by default — cost of turning it on)* | — | — | +7 B |
| Disable loading ui tileset on scene load *(off by default — cost of turning it on)* | — | — | −8 B |
| Disable scroll limits | — | — | **147 B** |

Turning off every on-by-default switch above frees **131 B** of banked ROM — the full
span between this plugin at its fullest and stripped to nothing. Treat it as a
ceiling rather than a recipe: you keep whatever your game actually uses.

<details><summary>How these were measured</summary>

GB Studio 4.3.0-e1. This plugin's `engine/src/**/*.c` was compiled with the
toolchain and flags GB Studio itself uses (`lcc -msm83:gb -Wf--max-allocs-per-node 3000
-DHUGE_TRACKER -DRUMBLE_ENABLE=0x08u`) against a merged include tree, and the SDCC object
files' area records were read: `_HOME` is bank 0, `_DATA`/`_INITIALIZED`/`_BSS` are WRAM,
and `_CODE*`/`_CONST`/`_LIT`/`_INITIALIZER` are banked ROM.

Two caveats. Only this plugin's own engine sources are measured, so a setting that also
changes a struct shared with stock engine files can move a few more bytes in files the
plugin does not ship. And each setting is toggled on its own: a handful measure slightly
*negative* because enabling their code lets the compiler drop a fallback path elsewhere,
and settings that gate other settings only show their own contribution.

</details>
<!-- SETTINGCOST:END -->

## Memory Footprint

Measured against the stock GB Studio **4.3.0-e1** engine (per-file SDCC compile with GB Studio's build flags, default engine settings). Values are the plugin's *delta* versus the stock engine; DMG build, with CGB noted where it differs. ROM cost lands in banked ROM (GB Studio's autobanker spreads it across switchable banks); using the plugin's events additionally compiles a few bytes of GBVM script per call into your project's script banks.

| | Cost |
|---|---|
| WRAM | +133 bytes |
| ROM | +8,580 bytes (DMG) / +12,927 bytes (CGB) |

- **WRAM:** 133 bytes, almost all of it streaming state and row/column buffers.
- **ROM (CGB):** the extra ~4.3 KiB on Color builds is the attribute- and palette-aware streaming path.
- **Engine WRAM headroom:** the stock GB Studio 4.3.0 engine leaves about **854 bytes** of WRAM free (usable engine WRAM is 7,776 bytes at 0xC0A0–0xDF00; the stock engine uses 6,922 bytes). With this plugin installed roughly **721 bytes** remain. This figure does not depend on how many global variables your project defines: the script memory array has a fixed size of VM_HEAP_SIZE + (VM_MAX_CONTEXTS × VM_CONTEXT_STACK_SIZE) words — 768 + 16 × 64 = 1,792 words (3,584 bytes) with stock engine settings.
- **SRAM:** not used.

---

<!-- BANK0:BEGIN -->
## Bank 0 (HOME) Usage

Bank 0 is the 16 KB non-switchable ROM bank that the GB Studio engine core,
the interrupt handlers and the GBDK runtime all share. Banked ROM is cheap
(add another bank), bank 0 is not, so it is usually the first thing a project
runs out of.

| | Bytes |
|---|---|
| Bank 0 used by this plugin | **-152** |
| Bank 0 free with this plugin installed | **1,603** of 16,384 (90% used) |

**This plugin gives bank 0 space back.** Its replacements for stock engine
files compile smaller than the originals, freeing 152 bytes.

| Module | This plugin | Stock engine | Bank 0 cost |
|---|---|---|---|
| `actor.c` | 681 | 871 | -190 |
| `collision.c` | 339 | 401 | -62 |
| `scroll.c` | 386 | 286 | +100 |

Modules that replace or patch a stock engine file only cost the *difference*:
the stock version's bank 0 bytes were being spent anyway.

<details><summary>How this was measured</summary>

GB Studio 4.3.2, DMG target, default engine settings. Each module's bank 0
contribution is the `A _HOME size` record that SDCC writes into its `.rel`
object, summed over the engine sources this plugin provides. Stock sizes come
from building projects whose only plugin ships no engine C, so every module in
them is the untouched engine; two such builds were compared and agreed on all
73 shared modules.

The "free" figure is a stock project with this plugin and nothing else. Your
own number will differ: other plugins, and any engine settings that change what
the core compiles, move it independently of this plugin.

</details>
<!-- BANK0:END -->

## Changelog

Grouped by the date each change was merged into the official
[gb-studio-plugins](https://github.com/gb-studio-dev/gb-studio-plugins) repository.

Only bug fixes, new features and feature changes are listed. Engine version
bumps, patch regeneration, packaging fixes and documentation edits are omitted.

### 2026-08-09

- **Removed the Top-Down `player_collision_group` engine field.** Its job is covered by
  CollisionExPlugin's `player_xor_tile_collision`, which applies in every scene type
  rather than only Top-Down. See [Top-Down Extra Collision](#top-down-extra-collision)
  for the one-line migration.

### 2026-06-28

- Initial release.
- MetatilePlugin compatibility, with the collision functions reorganised.
