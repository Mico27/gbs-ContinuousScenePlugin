# gbs-ContinuousScenePlugin

**Version 4.3.0 — Requires GB Studio ≥ 4.3.0**

A GB Studio engine plugin that stitches multiple scenes into a single seamless world. The camera always stays centered on the player, scroll limits are lifted, and as the player approaches a scene edge the plugin pulls tile data from the registered neighbour scene directly into VRAM — so the neighbouring map is already visible on screen before the player crosses. When the player reaches the boundary, the scene load happens instantly and invisibly: coordinates are rebased so the new scene aligns perfectly with where the player already is. No fade, no transition animation — the world simply keeps scrolling.

Scenes can be arranged in any rectangular grid with optional connection offsets, diagonal corners are supported, and the world can optionally wrap horizontally and/or vertically. All supported scene types (Top-Down, Platformer, Adventure, Point & Click, SHMUP) work with the plugin.

Four events are added to the **Scene** group: **Set Continuous Scene**, **Auto Connect Continuous Scene**, **Remove Continuous Scene**, and **Assign current scene scroll offset to Variable**.

Continuous pokemon red overworld example (with map connection offsets):

https://github.com/user-attachments/assets/69258872-59f5-4267-8529-4f755d5f1cdc

Continuous FF1 overworld example (with horizontal and vertical world looping):

https://github.com/user-attachments/assets/76cedc32-d258-475c-a235-4a8ffa2a8946

---

## Table of Contents

1. [Concepts](#concepts)
2. [Project Setup](#project-setup)
3. [Connection Offsets](#connection-offsets)
4. [World Looping](#world-looping)
5. [Technicalities and Restrictions](#technicalities-and-restrictions)
6. [Events Reference](#events-reference)
7. [Engine Fields and Settings](#engine-fields-and-settings)
8. [Inner Workings](#inner-workings)

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

For large grids of uniformly named scenes, the **Auto Connect Continuous Scene** event derives all connections automatically from the scenes' positions in the GB Studio world map. Place this event in a special init scene (such as a `compilermap` scene that runs once at startup) or in a shared custom event called from every scene's On Init.

1. Give all the scenes you want connected a common **GBVM symbol prefix** (set via *Settings → Game Boy → Custom Engine Fields → symbol* for each scene, or enforce a naming convention that becomes the symbol).
2. Add **Auto Connect Continuous Scene** anywhere in the project and set **Scene data symbol prefix** to that prefix.
3. Enable **Loop Horizontally** and/or **Loop Vertically** if the world should wrap.

The event runs entirely at **compile time**: it reads scene positions from the project, builds a connection table, and injects a `load_scene_connections` native call at the top of each matching scene's init script. No runtime overhead for the detection pass; connections are baked into ROM.

---

## Connection Offsets

When two horizontally adjacent scenes have different heights or are vertically misaligned, set **Offset of Scene** to `(current scene top) − (neighbour scene top)` in tiles. A positive offset means the neighbour starts lower; a negative offset means it starts higher.

The Auto Connect event computes this automatically from world-map positions: `offset = scene_top − other_scene_top` for left/right connections and `offset = scene_left − other_scene_left` for top/bottom connections.

---

## World Looping

Enable **Loop Horizontally** or **Loop Vertically** in the **Auto Connect Continuous Scene** event to wrap the world edges:

- **Loop Horizontally**: connects every left-edge scene to the corresponding right-edge scene.
- **Loop Vertically**: connects every top-edge scene to the corresponding bottom-edge scene.
- Both enabled: additionally connects the four world corners diagonally.

The offsets for wrap-around connections are computed by the same formula as regular connections.

---

## Technicalities and Restrictions

### Maximum Scene Size is Halved

Due to the ring-buffer nature of the VRAM tilemap, the usable scene dimensions are limited to **128 tiles wide and 128 tiles tall** (half of the standard GB Studio maximum of 256×256). Exceeding this causes visual wrap-around corruption during transitions.

### Common Tileset Is Required

All scenes that scroll into each other must share the same **common tileset**. Click the puzzle-piece icon on each scene in GB Studio and assign the same common tileset asset. This ensures tile indices are consistent across scene boundaries so that the visual join is seamless.

### Matching Edge Dimensions

The dimension along the shared edge must overlap between the two connecting scenes:

- A scene to the left/right of another must have overlapping **height** ranges.
- A scene above/below another must have overlapping **width** ranges.

Mismatched edges produce a seam or missing tiles at the boundary.

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

## Engine Fields and Settings

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

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| **Player extra collision group** (`player_collision_group`) | Number | 0 | Additional tile collision flags OR'd into every player movement check in Top-Down scenes. Set to `16` (`0x10`) to enable water-surface collision for surfing. |

### Runtime-Only Fields

These are read-only engine fields accessible via **Engine Field Value** in scripts.

| Field | Description |
|-------|-------------|
| `bkg_offset_x` | Accumulated horizontal tile offset of the viewport (0–31). Updated on every transition. |
| `bkg_offset_y` | Accumulated vertical tile offset of the viewport (0–31). Updated on every transition. |

---

## Inner Workings

### Boundary Detection (`check_transition_to_scene_collision`)

Each frame the state update loop calls `check_transition_to_scene_collision` when `continuous_scene_enabled` is set and no transition is already in progress. It detects when the player's coordinates have wrapped past the scene's edge using UBYTE wrapping arithmetic:

- **Top**: `PLAYER.pos.y > TILE_TO_SUBPX(SCREEN_OOB_TOP)` — Y has wrapped below zero (negative in sub-pixels stored as unsigned)
- **Bottom**: `PLAYER.pos.y >= image_height_subpx` — Y has reached or passed the scene's bottom
- **Left**: `PLAYER.pos.x > TILE_TO_SUBPX(SCREEN_OOB_LEFT)` — X has wrapped below zero
- **Right**: `PLAYER.pos.x >= image_width_subpx` — X has reached or passed the scene's right edge

A position-change guard (`transitioning_player_pos_x/y != PLAYER.pos.x/y`) prevents the same crossing from triggering on multiple consecutive frames.

### Invisible Scene Load (`transition_load_scene` / `transition_to_scene_modal`)

`transition_to_scene_modal` sets `is_transitioning_scene = 1` and `scroll_render_disabled = 1`, then calls `transition_load_scene`:

1. Active actors (except the player) are hidden and projectiles are cleared. A final OAM frame is pushed so sprites disappear cleanly before the remap.
2. For **Right** and **Bottom** crossings, coordinates are remapped *before* `load_scene`: the player position and camera are decremented by the full scene size, `bkg_offset` is incremented by the scene tile size, and the scroll is adjusted accordingly. For **Left** and **Top** crossings, `load_scene` runs first, then coordinates are incremented by the new scene's size and `bkg_offset` is decremented.
3. The offset is applied: player/camera/scroll are shifted along the perpendicular axis by `continuous_scene->offset` tiles so that scenes which are not edge-aligned stitch correctly.
4. All running scripts are killed (variables preserved), timers, input events, and music events are reset.
5. `load_scene` loads the new scene. Because `is_transitioning_scene` is non-zero, `scroll_reset` inside `scroll_init` skips clearing `scroll_x/y` and `bkg_offset_x/y`, keeping the VRAM ring buffer coherent.

After `transition_load_scene` returns, init scripts are ticked (`script_runner_update`) until the VM is no longer locked. Then `is_transitioning_scene` and `scroll_render_disabled` are cleared and the standard game loop resumes. Because the tiles were already rendered into VRAM before the crossing and the coordinate remap is invisible, nothing on screen changes during this entire sequence.

### Compile-Time Connection Table (Auto Connect)

The **Auto Connect Continuous Scene** event runs entirely at compile time inside `compile()`. It:

1. Filters the project's scene list to those whose GBVM symbol matches the prefix.
2. Derives left/right/top/bottom world extents from scene bounding boxes.
3. For each scene pair, checks all eight adjacency conditions (edge equality + overlap) and records a `{ scene_symbol, direction, offset }` connection.
4. If looping is enabled, additionally connects edge scenes to their opposite-edge counterparts.
5. Writes two ROM assets — a `scene_connections_symbol.c` array and matching `.h` header — containing one `scene_connection_t[8]` entry per scene.
6. Injects a `VM_CALL_NATIVE load_scene_connections` GBVM event at the top of each scene's init script, passing the scene's index into the connection table.

At runtime `load_scene_connections` reads the prebuilt array and calls `set_continuous_scene` for each non-null slot, replacing what would otherwise be eight manual **Set Continuous Scene** events per scene.

### `bkg_offset` and Tile Alignment

`bkg_scroll_x` and `bkg_scroll_y` (the actual SCX/SCY values written to hardware) are computed each frame as:

```
bkg_scroll_x = draw_scroll_x + TILE_TO_PX(bkg_offset_x)
bkg_scroll_y = draw_scroll_y + TILE_TO_PX(bkg_offset_y)
```

The `bkg_offset` values shift the VRAM map origin so that tile data written into a specific ring-buffer slot always appears at the correct screen position, regardless of how many transitions have occurred. Without this accumulation, consecutive scroll transitions in the same direction would progressively misalign the background.
