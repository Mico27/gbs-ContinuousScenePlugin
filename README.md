# gbs-ContinuousScenePlugin

**Version 4.3.0. Requires GB Studio 4.3.0 or newer.**

Joins your scenes into one continuous world. The camera stays on the player, the scroll limits are gone, and as the player nears an edge the next scene's tiles are already drawn on screen. Crossing the boundary loads the new scene without anything visible happening at all. No fade, no pause, no transition. The world just keeps scrolling.

That is what a Pokémon or Final Fantasy overworld needs: one map made of many scenes, with towns and routes joining without a seam.

Scenes go in any rectangular grid, neighbours can be offset along a shared edge, corners where four scenes meet are handled, and the world can wrap around horizontally, vertically or both. Top-Down, Platformer, Adventure, Point and Click and Shmup scenes all work, though it was built with Top-Down in mind. It costs more processing time than normal scene drawing, so keep continuous scenes light on other work.

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
6. [FAQ](#faq)
7. [Memory Footprint](#memory-footprint)
8. [Bank 0 (HOME) Usage](#bank-0-home-usage)
9. [Changelog](#changelog)

---

## Concepts

### Continuous Tile Rendering

GB Studio normally holds the camera inside the current scene. This plugin removes that limit, so the camera stays on the player and can travel past an edge. As it moves, tiles that fall outside the current scene are taken from the neighbour you registered in that direction. The neighbour's tiles appear on screen as the player walks towards the edge, exactly as if the two scenes were one map.

### The VRAM Tilemap as a Ring Buffer

The hardware background is 32 by 32 tiles and only 20 by 18 are on screen. The plugin uses the rest, wrapping around as it goes. **Scroll offset X** and **Scroll offset Y** track how far the view has moved in total across every crossing, and everything the plugin writes is placed relative to them. That keeps tiles from the current scene and tiles from its neighbour landing in the right places however many boundaries the player has crossed.

### Invisible Scene Load

When the player actually crosses a boundary, the plugin stops drawing tiles for a moment, moves the player, the camera and the scroll position into the new scene's coordinates so they land exactly where the player already is on screen, and loads the scene. The scroll offsets are protected from the reset a scene load normally does. Drawing resumes once the new scene's init scripts finish, and because the tiles were already on screen, nothing changes visually.

### Connection Offsets

Two scenes joined along an edge do not need to line up. An **offset** says how many tiles the neighbour sits along the shared edge relative to the current scene. That is how a route can join a town whose map starts higher or lower, which is how real overworlds are laid out. The tiles are stitched correctly at the join whatever the offset.

### Diagonal Corners

Where four scenes meet at a point, register the diagonal neighbours too: Top-Left, Top-Right, Bottom-Left and Bottom-Right. Without them, a single blank or wrong tile appears at the junction when the player walks diagonally through it.

---

## Project Setup

### Option A: manual setup with Set Continuous Scene

For a small map, or one that is not a regular grid, connect each scene by hand in its **On Init** script:

1. In the **On Init** script of a scene, add a **Set Continuous Scene** event for each direction that has a neighbour.
2. Set **Scene** to the neighbour scene in that direction.
3. Set **Direction of Scene** (Top, Right, Bottom, Left, or a diagonal).
4. Set **Offset of Scene** if the neighbour is shifted along the shared edge (see [Connection Offsets](#connection-offsets)).

Repeat for every scene and every direction. No triggers are needed on the edges, because the plugin notices the crossing itself.

### Option B: automatic setup with Auto Connect Continuous Scene

For a large grid, **Auto Connect Continuous Scene** works out every connection from where the scenes sit in the world map. Drag your map into place and it does the rest.

**Important:** it must go in the **On Init** script of the **very first scene** of the project. It writes the connections into the other scenes during the build, so it has to run before any of them are built.

> To make a scene first: close the project, open `project/scenes/<SceneName>/scene.gbres` in a text editor, set its `"_index"` to `-1`, save, reload the project in GB Studio and save again. GB Studio moves that scene to the front.

1. Give every scene you want connected the same **symbol prefix**, set through **View GBVM symbol** on each scene.

<img width="892" height="274" alt="image" src="https://github.com/user-attachments/assets/36714b5a-e7cc-43b3-ba4e-af7d1fd4d3d7" />
<img width="290" height="159" alt="image" src="https://github.com/user-attachments/assets/557a25e6-d78b-4ed9-8e20-6c534fba9bfc" />
<img width="285" height="141" alt="image" src="https://github.com/user-attachments/assets/9242132f-a294-4b8c-ad54-fed1babc5bd5" />

2. Place **Auto Connect Continuous Scene** in the On Init script of your first scene and set **Scene data symbol prefix** to that prefix.
3. Enable **Loop Horizontally** and/or **Loop Vertically** if the world should wrap.

Auto Connect only finds connections where scene edges **touch exactly** in the world map. Edges that do not meet are not connected. Use [Option A](#option-a-manual-setup-with-set-continuous-scene) for those, or move the scenes so their edges meet.

The event runs entirely during the build. It reads the scene positions, builds the table of connections, and adds the setup to the top of each matching scene's init script. Nothing is worked out while the game runs.

---

### Connection Offsets

When two side by side scenes have different heights, or sit at different vertical positions, set **Offset of Scene** to the current scene's top edge minus the neighbour's top edge, in tiles. A positive number means the neighbour starts lower and a negative one means it starts higher.

Auto Connect works this out from the world map positions, using top edges for side by side connections and left edges for stacked ones.

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

Because the background wraps, scenes can be at most **128 tiles wide and 128 tall**, half the usual GB Studio maximum. Going beyond that makes the picture wrap onto itself during a crossing.

### Common Tileset Is Required

Every scene that joins another must share one **common tileset**. Click the puzzle-piece icon on each scene and pick the same one. That keeps the tiles in the same places on both sides of the join, which is what makes it seamless.

### Scripts Are Reset on Boundary Crossing

Every running script in the leaving scene is stopped when the player crosses. Variables are kept. Timers, input events and music events are reset. The new scene's init scripts run before drawing resumes, so keep them short.

### The Camera Always Follows the Player

There is no transition animation and no camera lock during the load. The camera stays on the player throughout. The **Disable scroll limits** setting, on by default, removes the per-scene limit so the camera can follow the player past an edge and reveal the neighbour's tiles. It is a runtime field, so a script can turn the limits back on with **Engine Field Update** whenever you want the camera clamped to the current scene again.

### Out-of-Bounds Areas

Tiles that fall outside every registered neighbour are filled with **Out of bounds tile Id**. Set it to a solid colour, or to a water tile at the edge of a world map. **Out of bounds tile attribute** sets the palette and flip for that tile on Game Boy Color.

---

## Events Reference

All events are in the **Scene** group.

---

### Set Continuous Scene

Names the scene that lies in a given direction and switches on edge detection for the current scene. Put it in the scene's **On Init** script, once per direction with a neighbour, up to eight including the diagonals.

| Field | Description |
|-------|-------------|
| Scene | The scene to scroll to when the player exits in the chosen direction. |
| Direction of Scene | Top, Right, Bottom, Left, Top-Left, Top-Right, Bottom-Right, or Bottom-Left. |
| Offset of Scene | How far the neighbour sits along the shared edge, in tiles. A positive number shifts it down or right. |

---

### Auto Connect Continuous Scene

Reads the scene positions from the world map during the build and makes every connection for you, for each scene whose symbol starts with the prefix you give.

**It must go in the On Init script of the very first scene of the project.** Only edges that touch exactly are connected. Scenes whose edges do not meet need **Set Continuous Scene** instead.

> To make a scene first: close the project, open `project/scenes/<SceneName>/scene.gbres` in a text editor, set its `"_index"` to `-1`, save, reload the project in GB Studio and save again.

| Field | Description |
|-------|-------------|
| Scene data symbol prefix | The symbol prefix shared by the scenes to connect, such as `overworld_`. Only scenes whose symbol starts with it are included. |
| Loop Horizontally | Connect left-edge scenes to right-edge scenes so the world wraps horizontally. |
| Loop Vertically | Connect top-edge scenes to bottom-edge scenes so the world wraps vertically. |

---

### Remove Continuous Scene

Removes the neighbour in a given direction while the game runs. Use it to block a route the player has not unlocked yet, or to close a bridge after a story event.

| Field | Description |
|-------|-------------|
| Direction of Scene | Top, Right, Bottom, Left, Top-Left, Top-Right, Bottom-Right, or Bottom-Left. |

---

### Assign current scene scroll offset to Variable

Puts how far the view has scrolled, from 0 to 31 on each axis, into two variables. Scripts that draw at fixed screen positions need it to line up with world tiles.

| Field | Description |
|-------|-------------|
| X Offset Variable | Receives the horizontal offset, 0 to 31. |
| Y Offset Variable | Receives the vertical offset, 0 to 31. |

---

## Engine Settings

Found under **Settings**, then **Engine**, then **Continuous Scene**.

### Performance Flags

| Setting | Default | Description |
|---------|---------|-------------|
| **Disable player sprite loading on scene scroll** | Enabled | Skips reloading the player sprite during a crossing. Safe when the sprite is the same in both scenes. |
| **Disable tileset loading on scene scroll** | Disabled | Skips the tileset reload during a crossing. Only turn it on when every connected scene uses exactly the same common tileset. |
| **Disable loading UI tileset on scene load** | Disabled | Skips the interface tileset reload on every scene load. Turn it on when the interface tiles are part of the common tileset. |
| **Disable scroll limits** | Enabled | Removes the per-scene limit so the view can travel across boundaries. Runtime field: set it from a script with **Engine Field Update** (non-zero disables the limits, `0` restores them). |

### Out-of-Bounds Fill

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| **Out of bounds tile Id** | Number | 0 | The tile used where there is no registered neighbour. |
| **Out of bounds tile attribute** | Number | 0 | Its palette, tile bank and flip settings on Game Boy Color. |

### Top-Down Extra Collision

**Removed.** The old **Player extra collision group** setting, which added extra tile
values to the player's movement checks in Top-Down scenes, is gone. Its job is now done by
**CollisionExPlugin**'s **Player tile collision override**, which works in every scene type
rather than Top-Down alone.

To migrate, install CollisionExPlugin, leave its **Enable player tile collision override**
setting on, and set **Player tile collision override** where you used to set the old field.
With the setting off, the override is left out of the build and the extra collision quietly
stops applying. The Continuous Scene and Metatile example does exactly this.

### Values scripts can read

These are read-only and available through **Engine Field Value**.

| Field | Description |
|-------|-------------|
| **Scroll offset X** | How far the view has scrolled horizontally, 0 to 31. |
| **Scroll offset Y** | How far the view has scrolled vertically, 0 to 31. |

---

## FAQ

**How do I build a Pokémon style overworld out of separate scenes?**
Give every scene the same common tileset, lay them out in the world map so their edges touch, then
put **Auto Connect Continuous Scene** in the first scene of the project with your scene symbol
prefix. The whole map is wired up during the build.

**What is the difference between this and the ScreenScroll plugin?**
ScreenScroll slides the screen across when the player leaves a scene, one screen at a time. This
plugin has no transition at all: the neighbour is already drawn and the player walks straight into
it. Do not install both in the same project.

**Can two connected scenes be different sizes?**
Yes, and they can sit at different heights along the shared edge. Set **Offset of Scene** to the
difference in tiles, or let Auto Connect work it out from the world map.

**How do I make the world wrap around, like a Final Fantasy world map?**
Tick **Loop Horizontally** and **Loop Vertically** on the auto-connect event. Scenes at opposite
edges connect to each other, including the four corners.

**My auto-connect did nothing.**
The scene holding the event is not the first scene of the project, or the scene symbols do not
start with the prefix. Edges also have to touch exactly in the world map.

**There is a broken tile where four scenes meet.**
The diagonal neighbours are missing. Register Top-Left, Top-Right, Bottom-Left and Bottom-Right
with **Set Continuous Scene**, or let Auto Connect handle it.

**My neighbouring scene shows garbled tiles.**
The two scenes are not sharing one common tileset. Nothing is reloaded while scrolling, so every
connected scene has to draw from the same set.

**How do I block a route until the player has an item?**
Use **Remove Continuous Scene** on that direction, and add the connection back with **Set
Continuous Scene** once the item is obtained.

**What appears past the edge of my world?**
Whatever you set **Out of bounds tile Id** to. Water suits a world map, and a solid dark tile suits
an interior.

**Can my scenes be bigger than 128 by 128 tiles?**
No. That is the limit while this plugin is installed, half the usual maximum.

**My game slows down in continuous scenes.**
Drawing two scenes' worth of tiles costs more than a normal scene. Keep the number of actors and
the amount of script work down in continuous scenes.

**My scripts stop when the player crosses a boundary.**
Every running script in the leaving scene is stopped. Variables survive. Move anything that must
continue into the new scene's On Init, and keep those scripts short, since drawing waits for them.

**My overlay drawing lands on the wrong tiles after a few crossings.**
The view has moved. Read **Assign current scene scroll offset to Variable** and add the offset to
your positions.

**Does it work with the MetaTile plugin?**
Yes, and the two are often used together for large overworlds. A compatibility variant ships with
it.

---

<!-- SETTINGCOST:BEGIN -->
### What each engine setting costs

Each setting changes what gets compiled. Figures are what you **get back by turning
the setting off**. Rows marked *off by default* show what turning it **on** costs, and
sliders show the cost per step. "none" means that budget does not move.

| Setting | Bank 0 | WRAM | Banked ROM |
|---|---|---|---|
| Disable player sprite loading on scene scroll | none | none | **16 B** |
| Disable tileset loading on scene scroll *(off by default, so this is the cost of turning it on)* | none | none | +7 B |
| Disable loading ui tileset on scene load *(off by default, so this is the cost of turning it on)* | none | none | -8 B |
| Disable scroll limits *(runtime field, so the limit check is always compiled)* | none | 1 B | none |

Turning off the remaining on-by-default switch above frees **16 B** of banked ROM.
Disable scroll limits no longer appears in that span: it became a runtime field, so its
code is always compiled and it costs 1 B of WRAM instead. You keep whatever your game
actually uses.

<details><summary>How these were measured</summary>

GB Studio 4.3.0-e1. This plugin's engine code was compiled with the toolchain and
flags GB Studio itself uses, and the size of each part of the result was read back and
sorted into the three budgets: the fixed bank 0, work RAM, and switchable ROM banks.

Two caveats. Only this plugin's own engine sources are measured, so a setting that also
changes a shared data structure can move a few more bytes elsewhere. And each setting is
toggled on its own, so a few measure slightly *negative* when enabling their code lets
the compiler drop a fallback path, and a setting that gates other settings shows only
its own contribution.

</details>
<!-- SETTINGCOST:END -->

## Memory Footprint

Measured against the stock GB Studio **4.3.0-e1** engine at default engine settings, report of 2026-08-13. Figures are the difference against a stock project: a file that replaces a stock engine file counts only the change, which is why a plugin can come out negative. Each event you use also compiles a few bytes of script into your project, on top of the fixed cost below.

| Budget | Cost |
|---|---|
| Bank 0 (HOME) | -164 bytes |
| WRAM | +132 bytes |
| Banked ROM | +8,791 bytes |

- **Bank 0:** the plugin *gives back* 164 bytes, because its replacements for stock engine files compile smaller than the originals. See [Bank 0 (HOME) Usage](#bank-0-home-usage).
- **WRAM:** 132 bytes, almost all of it scrolling state and the row and column buffers.
- **Banked ROM:** 8,791 bytes. 70 of those land in stock engine files the plugin does not ship, which compile slightly differently once it is installed. It replaces fourteen stock engine files, so the figure is what is left after subtracting the stock code it displaces.
- **Engine WRAM headroom:** a stock GB Studio 4.3.0 project leaves about **854 bytes** of WRAM free (the engine has 7,776 bytes to work with and uses 6,922 of them). With this plugin installed roughly **722 bytes** remain. Adding more global variables to your project does not change that figure, because script memory is a fixed 3,584 byte block at stock engine settings.
- **SRAM:** not used.

---

<!-- BANK0:BEGIN -->
## Bank 0 (HOME) Usage

Bank 0 is the 16 KB fixed ROM bank shared by the GB Studio engine core, the
interrupt handlers and the GBDK runtime. Extra banked ROM is cheap to add,
bank 0 is not, so bank 0 is usually the first thing a project runs out of.

| | Bytes |
|---|---|
| Bank 0 used by this plugin | **-164** |
| Bank 0 free with this plugin installed | **1,615** of 16,384 (90% used) |

**This plugin gives bank 0 space back.** Its replacements for stock engine
files compile smaller than the originals, freeing 164 bytes.

| Module | This plugin | Stock engine | Bank 0 cost |
|---|---|---|---|
| Scrolling | 386 | 286 | +100 |
| Actor handling | 669 | 871 | -202 |
| Collision | 339 | 401 | -62 |

A module that replaces a stock engine file costs only the *difference*, because
the stock version's bank 0 bytes were being spent anyway.

<details><summary>How this was measured</summary>

GB Studio 4.3.0-e1, default engine settings. Each module was compiled with the
toolchain and flags GB Studio itself uses, and the bank 0 size the compiler
recorded was read back. The stock column is the same compile of the engine file
the module replaces.

The "free" figure assumes a stock project with this plugin and nothing else.
Your own number will differ, because other plugins and any engine settings that
change what the core compiles move it too.

</details>
<!-- BANK0:END -->

## Changelog

Grouped by the date each change was merged into the official
[gb-studio-plugins](https://github.com/gb-studio-dev/gb-studio-plugins) repository.

Only bug fixes, new features and feature changes are listed. Engine version
bumps, patch regeneration, packaging fixes and documentation edits are omitted.

### 2026-08-28

- **Disable scroll limits** is now a runtime value rather than a compile-time switch, so a
  script can turn it on and off with the **Engine Field Update** event.

### 2026-08-14

- Fixed background text wrapping. A row of the hardware tilemap is 32 cells wide and wraps onto
  itself, so the pen now steps within the row it is drawing on, worked out from its own address.
  The old test compared the pen's row against the row the text started on, which got the wrap
  wrong for right-to-left text and drifted further off as variable-width glyphs moved the pen.

### 2026-08-09

- **Removed the Top-Down extra collision setting.** Its job is covered by CollisionExPlugin's
  **Player tile collision override**, which works in every scene type rather than Top-Down
  alone. See [Top-Down Extra Collision](#top-down-extra-collision) for how to migrate.

### 2026-06-28

- Initial release.
- MetatilePlugin compatibility, with the collision functions reorganised.
