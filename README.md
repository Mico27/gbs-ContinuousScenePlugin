# gbs-ContinuousScenePlugin

**Version 4.3.0 — Requires GB Studio ≥ 4.3.0**

A GB Studio engine plugin that enables seamless scrolling transitions between adjacent scenes, making it possible to build large continuous worlds split across multiple scenes. When the player walks off the edge of a scene, the screen scrolls in that direction and loads the neighbouring scene without a fade. Scenes can be arranged in any rectangular grid with optional connection offsets; diagonal corners are also supported. The world can optionally wrap horizontally and/or vertically.

All supported scene types (Top-Down, Platformer, Adventure, Point & Click, SHMUP) work with the plugin. Four events are added to the **Scene** group: **Set Continuous Scene**, **Auto Connect Continuous Scene**, **Remove Continuous Scene**, and **Assign current scene scroll offset to Variable**.

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

### How the Scroll Transition Works

GB Studio normally resets the viewport and tilemap when changing scenes. This plugin sidesteps that reset by keeping `bkg_offset_x`/`bkg_offset_y` accumulators alive across scene loads and by managing the camera and player positions manually during the transition. The screen content slides continuously in one direction while the new scene's tiles load row-by-row or column-by-column into the off-screen portion of the VRAM background map.

### The VRAM Tilemap as a Ring Buffer

The GB hardware background tilemap is 32×32 tiles but only 20×18 tiles are visible at once. The plugin exploits this by treating the map as a wrap-around ring buffer: when scrolling right, the new scene's column data is written into the left edge of the VRAM map (which is off-screen on the right side thanks to the SCX register), so no visual pop occurs.

The `bkg_offset_x` and `bkg_offset_y` fields accumulate the total tile displacement across all transitions. They are masked to 5 bits (`& 31`) to stay within the 32-tile VRAM map dimension.

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

### Scripts Are Reset on Transition

When a transition begins, all running script contexts in the current scene are terminated (variables are preserved). Timers, input events, and music events are also reset. The new scene's init scripts run after the scene loads.

### Camera Is Unlocked During Transition

The camera lock flag is cleared at transition start and restored once both the camera and player have reached their target positions in the new scene. During the transition the camera is driven by the step-interpolation function (`transition_camera_to`) rather than the standard camera logic.

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

Each frame, the state update loop calls `check_transition_to_scene_collision` when `continuous_scene_enabled` is set and no transition is already in progress. It compares the player's position against eight direction slots. Each cardinal direction has a threshold in sub-pixels (256 sub-pixels = 1 tile = 8 px):

- **Top**: `PLAYER.pos.y < SCROLL_CAM_Y` (≈9 tiles from the top)
- **Bottom**: `PLAYER.pos.y > TILE_TO_SUBPX(image_tile_height) − SCROLL_CAM_Y`
- **Left**: `PLAYER.pos.x < SCROLL_CAM_X` (≈10 tiles from the left)
- **Right**: `PLAYER.pos.x > TILE_TO_SUBPX(image_tile_width) − SCROLL_CAM_X`

Diagonal directions are detected by simultaneous crossing of both their component axes. A position-change guard prevents the same crossing from triggering on multiple consecutive frames.

### Scene Load Phase (`transition_load_scene`)

Before loading the new scene this function:

1. Hides all active actors (except the player) and clears all active projectiles.
2. Adjusts `camera_x`/`camera_y`, `PLAYER.pos`, and `bkg_offset_x`/`bkg_offset_y` for the scroll direction. For a right scroll, for example, the camera jumps left by one screen width, the player X is decremented by the scene width, and `bkg_offset_x` is incremented by the scene tile width.
3. Applies the connection **offset**: the player and camera are shifted along the perpendicular axis to compensate for scenes that are not edge-aligned.
4. Kills all running scripts and resets timers and event handlers.
5. Calls `load_scene` for the new scene. Because `is_transitioning_scene` is set and the tile offsets were pre-adjusted, the scroll init skips clearing `scroll_x/y` and `bkg_offset_x/y`, preserving cross-scene continuity.

### Scroll Animation Phase (`transition_to_scene_modal`)

After `transition_load_scene` returns, the function enters a per-frame loop:

1. `script_runner_update` ticks the new scene's init scripts.
2. `transition_camera_to` steps `camera_x`/`camera_y` toward the target by up to `SCROLL_CAM_SPEED` sub-pixels per frame.
3. `transition_player_to` steps the player's position toward the target by up to `SCROLL_PLAYER_SPEED` sub-pixels per frame.
4. The normal game-loop updates (`scroll_update`, `actors_update`, OAM, VBlank) all run. Because `is_transitioning_scene` is non-zero, `camera_update` is bypassed and `scroll_update` skips its per-scene scroll clamp logic for the transition axis.
5. When both camera and player reach their targets, the camera lock flag is restored and `is_transitioning_scene` is cleared, returning control to the standard game loop.

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
