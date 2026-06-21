/**
 * generate_sprites.js
 * -------------------
 * Slices pokemon_actors_sprite_sheet.png into per-character GBS sprite strips
 * and generates .gbsres sprite definition + actor prefab files.
 *
 * Usage:
 *   node generate_sprites.js            # full generation
 *   node generate_sprites.js --analyze  # print detected strips only, no files written
 *
 * Requires pngjs (uses gb-studio's node_modules for convenience).
 *
 * Sheet layout (confirmed via pixel analysis):
 *   - Width: 187px = 9px border + [16px tile + 1px gap] × 10 + 9px border
 *   - Tile X start positions: [9, 26, 43, 60, 77, 94, 111, 128, 145, 162]
 *   - Each character occupies a single 16px-tall horizontal strip
 *   - Strips are separated by 1px background gaps
 *   - Section separators: large gaps (>5px) before Pokémon and Misc sections
 *   - Tile layout per strip:
 *       [0,1,2] = down  (idle, walk_A, walk_B)
 *       [3,4,5] = left  (idle, walk_A, walk_B)  ← skipped (flipLeft=true)
 *       [6,7,8] = right (idle, walk_A, walk_B)
 *       [9]     = up    (idle only; walk frames reuse it)
 *
 * Output PNG per character: 144×16px (9 frames × 16px)
 *   Row 0 (y=0..7):  feet/lower body (sliceY=0, canvas y=20)
 *   Row 1 (y=8..15): head/upper body (sliceY=8, canvas y=12)
 * (swapped vs. natural order to match pkmn_player.png convention)
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const PNG    = require('c:/Users/micka/Documents/gb-studio/node_modules/pngjs').PNG;

// ─────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────
const PROJECT_ROOT   = path.join(__dirname, '..');
const SHEET_PATH     = path.join(PROJECT_ROOT, 'assets', 'sprites', 'pokemon_actors_sprite_sheet.png');
const SPRITES_DIR    = path.join(PROJECT_ROOT, 'assets', 'sprites');
const PREFABS_DIR    = path.join(PROJECT_ROOT, 'project', 'prefabs', 'actors', 'pokemon_npcs');
const VARS_FILE      = path.join(PROJECT_ROOT, 'project', 'variables.gbsres');
const SPRITE_IDS_OUT = path.join(__dirname, 'sprite_ids.json');

// ─────────────────────────────────────────────────────────────
// Sheet constants
// ─────────────────────────────────────────────────────────────
const TILE_X   = [9, 26, 43, 60, 77, 94, 111, 128, 145, 162]; // X start of each tile column
const TILE_SIZE = 16;

// Source tile indices per direction (0-indexed within the 10-tile strip)
const DIR_DOWN  = [0, 1, 2];
const DIR_RIGHT = [6, 7, 8];
const DIR_UP    = [9, 9, 9]; // only 1 unique up frame; walk reuses it

const OUT_FRAMES = 9;           // 3×down + 3×right + 3×up
const OUT_W      = OUT_FRAMES * TILE_SIZE; // 144px
const OUT_H      = TILE_SIZE;              // 16px

// ─────────────────────────────────────────────────────────────
// GBS canvas/bounds (matches pkmn_player.png.gbsres)
// ─────────────────────────────────────────────────────────────
const CANVAS = { originX: 0, originY: -8, width: 32, height: 48 };
const BOUNDS  = { x: 0, y: -8, width: 16, height: 16 };

// ─────────────────────────────────────────────────────────────
// NPC wander variable
// ─────────────────────────────────────────────────────────────
const NPC_DIR_VAR_ID   = '15';
const NPC_DIR_VAR_NAME = 'NpcDir';

// ─────────────────────────────────────────────────────────────
// Character manifest
// ─────────────────────────────────────────────────────────────
// section: 'chars' | 'pokemon' | 'misc'
// type:    'npc' (wanders + talks) | 'pokemon' (static) | 'object' (static, maybe talks)
const MANIFEST = [
  { name: 'young_trainer_m', type: 'npc',     section: 'chars',   dialogue: "The road to Pallet never ends!" },
  { name: 'young_trainer_f', type: 'npc',     section: 'chars',   dialogue: "I'm waiting for my first Pokemon!" },
  { name: 'old_man',         type: 'npc',     section: 'chars',   dialogue: "Back in my day we walked everywhere." },
  { name: 'scientist',       type: 'npc',     section: 'chars',   dialogue: "These fossils hold great mysteries." },
  { name: 'gym_leader_m',    type: 'npc',     section: 'chars',   dialogue: "I have trained here for years." },
  { name: 'pokemon_fan',     type: 'npc',     section: 'chars',   dialogue: "Pokemon are simply adorable!" },
  { name: 'police_officer',  type: 'npc',     section: 'chars',   dialogue: "This area requires constant patrol." },
  { name: 'swimmer',         type: 'npc',     section: 'chars',   dialogue: "The water is perfect today!" },
  { name: 'pikachu',         type: 'pokemon', section: 'pokemon', dialogue: null },
  { name: 'snorlax',         type: 'pokemon', section: 'pokemon', dialogue: null },
  { name: 'item_ball',       type: 'object',  section: 'misc',    dialogue: null },
  { name: 'sign_post',       type: 'object',  section: 'misc',    dialogue: "Welcome to the Pokemon world!" },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

function getPixel(png, x, y) {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function setPixel(png, x, y, r, g, b, a) {
  const i = (y * png.width + x) * 4;
  png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
}

// ─────────────────────────────────────────────────────────────
// Sheet analysis
// ─────────────────────────────────────────────────────────────

function analyzeSheet(srcPng) {
  const { width, height, data } = srcPng;

  // Unique color count per row
  const rowUnique = [];
  for (let y = 0; y < height; y++) {
    const colors = new Set();
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    rowUnique.push(colors.size);
  }

  // Find content strips (runs of rows with >3 unique colors)
  const strips = [];
  let inStrip = false, stripStart = 0;
  for (let y = 0; y <= height; y++) {
    const isBg = y >= height || rowUnique[y] <= 3;
    if (!inStrip && !isBg) { inStrip = true; stripStart = y; }
    if (inStrip && isBg) {
      strips.push({ start: stripStart, end: y - 1, h: y - stripStart });
      inStrip = false;
    }
  }

  // Find section breaks (gap > 5px between consecutive strips)
  const sectionBreaks = [];
  for (let i = 0; i < strips.length - 1; i++) {
    const gap = strips[i + 1].start - strips[i].end - 1;
    if (gap > 5) sectionBreaks.push(i);
  }

  if (sectionBreaks.length < 2) {
    throw new Error(`Expected at least 2 section breaks, found ${sectionBreaks.length}. Check sheet format.`);
  }

  // Only h===TILE_SIZE strips are valid character sprites; h=14/15 are label banners
  const charStrips    = strips.slice(0, sectionBreaks[0] + 1).filter(s => s.h === TILE_SIZE);
  const pokemonStrips = strips.slice(sectionBreaks[0] + 1, sectionBreaks[1] + 1).filter(s => s.h === TILE_SIZE);
  const miscStrips    = strips.slice(sectionBreaks[1] + 1).filter(s => s.h === TILE_SIZE);

  return { charStrips, pokemonStrips, miscStrips, all: strips, sectionBreaks };
}

// ─────────────────────────────────────────────────────────────
// Tile extraction
// ─────────────────────────────────────────────────────────────

function extractTile(srcPng, tileIdx, stripY) {
  // Returns a 16×16 grid of [r,g,b,a] pixels, indexed [row][col]
  const x0 = TILE_X[tileIdx];
  const pixels = [];
  for (let py = 0; py < TILE_SIZE; py++) {
    const row = [];
    for (let px = 0; px < TILE_SIZE; px++) {
      row.push(getPixel(srcPng, x0 + px, stripY + py));
    }
    pixels.push(row);
  }
  return pixels;
}

// ─────────────────────────────────────────────────────────────
// Output PNG construction
// ─────────────────────────────────────────────────────────────

function buildOutputPng(tileFrames) {
  // tileFrames: array of 9 elements, each a 16×16 pixel grid
  // Output: 144×16 PNG with rows SWAPPED to match GBS pkmn_player convention:
  //   output row 0..7  (y=0..7):  source rows 8..15 (lower body/feet → sliceY=0 → canvas y=20)
  //   output row 8..15 (y=8..15): source rows 0..7  (upper body/head → sliceY=8 → canvas y=12)
  const outPng = new PNG({ width: OUT_W, height: OUT_H });
  outPng.data.fill(0);

  for (let f = 0; f < OUT_FRAMES; f++) {
    const tile = tileFrames[f];
    for (let py = 0; py < TILE_SIZE; py++) {
      const outY = py < 8 ? py + 8 : py - 8; // swap upper/lower halves
      for (let px = 0; px < TILE_SIZE; px++) {
        const [r, g, b, a] = tile[py][px];
        setPixel(outPng, f * TILE_SIZE + px, outY, r, g, b, a);
      }
    }
  }

  return outPng;
}

// ─────────────────────────────────────────────────────────────
// GBS sprite .gbsres builder
// ─────────────────────────────────────────────────────────────

function makeTiles(frameIdx) {
  // 4 tiles for a 16×16 animation frame placed at canvas (y=12 upper, y=20 lower)
  const sx = frameIdx * TILE_SIZE;
  return [
    { id: uuid(), x: 0, y: 12, sliceX: sx,     sliceY: 8, palette: 0, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
    { id: uuid(), x: 8, y: 12, sliceX: sx + 8,  sliceY: 8, palette: 0, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
    { id: uuid(), x: 0, y: 20, sliceX: sx,     sliceY: 0, palette: 0, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
    { id: uuid(), x: 8, y: 20, sliceX: sx + 8,  sliceY: 0, palette: 0, flipX: false, flipY: false, objPalette: "OBP0", paletteIndex: 0, priority: false },
  ];
}

function makeAnimFrame(frameIdx) {
  return { id: uuid(), tiles: makeTiles(frameIdx) };
}

function makeSpriteGbsres(name, spriteId, pngFilename, checksum) {
  // multi_movement, flipLeft=true → 8 animation slots:
  //   0=idle_down(f0)  1=idle_left(empty→auto)  2=idle_right(f3)  3=idle_up(f6)
  //   4=walk_down(f1,f2)  5=walk_left(empty→auto)  6=walk_right(f4,f5)  7=walk_up(f7,f8)
  const animations = [
    { id: uuid(), frames: [makeAnimFrame(0)] },                     // 0: idle_down
    { id: uuid(), frames: [] },                                      // 1: idle_left (auto-derived)
    { id: uuid(), frames: [makeAnimFrame(3)] },                     // 2: idle_right
    { id: uuid(), frames: [makeAnimFrame(6)] },                     // 3: idle_up
    { id: uuid(), frames: [makeAnimFrame(1), makeAnimFrame(2)] },   // 4: walk_down
    { id: uuid(), frames: [] },                                      // 5: walk_left (auto-derived)
    { id: uuid(), frames: [makeAnimFrame(4), makeAnimFrame(5)] },   // 6: walk_right
    { id: uuid(), frames: [makeAnimFrame(7), makeAnimFrame(8)] },   // 7: walk_up
  ];

  return {
    _resourceType: "sprite",
    id: spriteId,
    name,
    symbol: `sp_${name}`,
    states: [{
      id: uuid(),
      name: "Default",
      animationType: "multi_movement",
      flipLeft: true,
      animations,
    }],
    numTiles: 36,
    canvasOriginX: CANVAS.originX,
    canvasOriginY: CANVAS.originY,
    canvasWidth:   CANVAS.width,
    canvasHeight:  CANVAS.height,
    boundsX:       BOUNDS.x,
    boundsY:       BOUNDS.y,
    boundsWidth:   BOUNDS.width,
    boundsHeight:  BOUNDS.height,
    animSpeed:     15,
    filename:      pngFilename,
    width:         OUT_W,
    height:        OUT_H,
    checksum,
  };
}

// ─────────────────────────────────────────────────────────────
// GBS actor prefab .gbsres builder
// ─────────────────────────────────────────────────────────────

function makeMove(dx, dy) {
  return {
    id: uuid(),
    command: "EVENT_ACTOR_MOVE_RELATIVE",
    args: {
      actorId: "$self$",
      x: { type: "number", value: dx },
      y: { type: "number", value: dy },
      moveType: "horizontal",
      collideWith: ["walls"],
    },
  };
}

function makeWanderScript() {
  // LOOP → [set NpcDir=random(1..4)] → SWITCH → [move in chosen direction] → WAIT 30 frames
  return [{
    id: uuid(),
    command: "EVENT_LOOP",
    args: {},
    children: {
      true: [
        {
          id: uuid(),
          command: "EVENT_VARIABLE_MATH",
          args: { vectorX: NPC_DIR_VAR_ID, operation: "set", other: "rnd", minValue: 1, maxValue: 4 },
        },
        {
          id: uuid(),
          command: "EVENT_SWITCH",
          args: {
            variable: NPC_DIR_VAR_ID,
            choices: 4,
            __collapseCase0: false, value0: { type: "number", value: 1 },
            __collapseCase1: false, value1: { type: "number", value: 2 },
            __collapseCase2: false, value2: { type: "number", value: 3 },
            __collapseCase3: false, value3: { type: "number", value: 4 },
            __collapseElse: false,
          },
          children: {
            true0: [makeMove(0, -2)],   // case 1: move up    (2 tiles = 1 metatile)
            true1: [makeMove(2, 0)],    // case 2: move right
            true2: [makeMove(0, 2)],    // case 3: move down
            true3: [makeMove(-2, 0)],   // case 4: move left
            false: [],
          },
        },
        {
          id: uuid(),
          command: "EVENT_WAIT",
          args: { frames: { type: "number", value: 30 }, units: "frames" },
        },
      ],
    },
  }];
}

function makeDialogueScript(text) {
  return [{
    id: uuid(),
    command: "EVENT_TEXT",
    args: { text, avatarId: "" },
  }];
}

function makePrefabGbsres(name, prefabId, spriteId, charType, dialogue) {
  const hasWander   = charType === 'npc';
  const hasDialogue = dialogue !== null;
  return {
    _resourceType: "actorPrefab",
    id: prefabId,
    name,
    frame: 0,
    animate: true,
    spriteSheetId:      spriteId,
    paletteId:          "",
    moveSpeed:          1,
    animSpeed:          15,
    persistent:         false,
    collisionGroup:     "",
    collisionExtraFlags: [],
    script:       hasDialogue ? makeDialogueScript(dialogue) : [],
    startScript:  [],
    updateScript: hasWander ? makeWanderScript() : [],
    hit1Script:   [],
    hit2Script:   [],
    hit3Script:   [],
  };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function main() {
  const analyzeOnly = process.argv.includes('--analyze');

  // Load sheet
  const srcPng = PNG.sync.read(fs.readFileSync(SHEET_PATH));
  console.log(`Sprite sheet: ${srcPng.width}×${srcPng.height}px`);

  // Analyze structure
  const { charStrips, pokemonStrips, miscStrips } = analyzeSheet(srcPng);
  console.log(`Sections: Characters=${charStrips.length}, Pokémon=${pokemonStrips.length}, Misc=${miscStrips.length}`);

  if (analyzeOnly) {
    console.log('\n=== Characters strips (first 12) ===');
    charStrips.slice(0, 12).forEach((s, i) =>
      console.log(`  [${String(i).padStart(2)}] y=${s.start}..${s.end}`));
    console.log('\n=== Pokémon strips ===');
    pokemonStrips.forEach((s, i) =>
      console.log(`  [${i}] y=${s.start}..${s.end}`));
    console.log('\n=== Misc strips ===');
    miscStrips.forEach((s, i) =>
      console.log(`  [${i}] y=${s.start}..${s.end}`));
    return;
  }

  // Validate section strip counts
  const needs = { chars: 0, pokemon: 0, misc: 0 };
  for (const c of MANIFEST) needs[c.section]++;
  const avail = { chars: charStrips.length, pokemon: pokemonStrips.length, misc: miscStrips.length };
  for (const sec of ['chars', 'pokemon', 'misc']) {
    if (needs[sec] > avail[sec]) {
      console.error(`ERROR: Need ${needs[sec]} ${sec} strips but only ${avail[sec]} available.`);
      console.error('Run with --analyze to inspect sheet layout.');
      process.exit(1);
    }
  }

  // Create output directories
  fs.mkdirSync(SPRITES_DIR, { recursive: true });
  fs.mkdirSync(PREFABS_DIR, { recursive: true });

  const sectionStrips   = { chars: charStrips, pokemon: pokemonStrips, misc: miscStrips };
  const sectionCounters = { chars: 0, pokemon: 0, misc: 0 };
  const spriteIds = {};

  for (const char of MANIFEST) {
    const strips = sectionStrips[char.section];
    const idx    = sectionCounters[char.section]++;
    const strip  = strips[idx];
    const stripY = strip.start;

    console.log(`\nProcessing [${char.name}] section=${char.section} strip-y=${stripY}...`);

    // Extract 9 source tile frames: [down×3, right×3, up×3]
    const srcTileIndices = [...DIR_DOWN, ...DIR_RIGHT, ...DIR_UP];
    const tileFrames = srcTileIndices.map(ti => extractTile(srcPng, ti, stripY));

    // Build GBS output PNG
    const outPng    = buildOutputPng(tileFrames);
    const pngBuffer = PNG.sync.write(outPng);
    const checksum  = crypto.createHash('sha1').update(pngBuffer).digest('hex');

    // Write PNG
    const pngFilename = `${char.name}.png`;
    const pngPath     = path.join(SPRITES_DIR, pngFilename);
    fs.writeFileSync(pngPath, pngBuffer);
    console.log(`  ✓ PNG  → assets/sprites/${pngFilename} (${OUT_W}×${OUT_H})`);

    // Generate UUIDs
    const spriteId = uuid();
    const prefabId = uuid();

    // Write sprite .gbsres
    const spriteData = makeSpriteGbsres(char.name, spriteId, pngFilename, checksum);
    const spriteFile = path.join(SPRITES_DIR, `${pngFilename}.gbsres`);
    fs.writeFileSync(spriteFile, JSON.stringify(spriteData, null, 2));
    console.log(`  ✓ GBSRES → assets/sprites/${pngFilename}.gbsres`);

    // Write prefab .gbsres
    const prefabData = makePrefabGbsres(char.name, prefabId, spriteId, char.type, char.dialogue);
    const prefabFile = path.join(PREFABS_DIR, `${char.name}.gbsres`);
    fs.writeFileSync(prefabFile, JSON.stringify(prefabData, null, 2));
    console.log(`  ✓ PREFAB → project/prefabs/actors/pokemon_npcs/${char.name}.gbsres`);

    spriteIds[char.name] = { spriteId, prefabId, type: char.type, dialogue: char.dialogue };
  }

  // Update variables.gbsres: add NpcDir variable if not present
  const varsData = JSON.parse(fs.readFileSync(VARS_FILE, 'utf8'));
  if (!varsData.variables.find(v => v.id === NPC_DIR_VAR_ID)) {
    varsData.variables.push({
      id:     NPC_DIR_VAR_ID,
      name:   NPC_DIR_VAR_NAME,
      symbol: 'var_npcdir',
    });
    fs.writeFileSync(VARS_FILE, JSON.stringify(varsData, null, 2));
    console.log(`\n✓ Added variable ${NPC_DIR_VAR_ID} (${NPC_DIR_VAR_NAME}) to variables.gbsres`);
  } else {
    console.log(`\n  Variable ${NPC_DIR_VAR_ID} already exists in variables.gbsres`);
  }

  // Write sprite_ids.json for populate_scenes.js
  fs.writeFileSync(SPRITE_IDS_OUT, JSON.stringify(spriteIds, null, 2));
  console.log(`\n✓ sprite_ids.json written`);

  console.log('\n══════════════════════════════════════════════════════');
  console.log('Done! Verify the generated PNGs in assets/sprites/ before');
  console.log('running populate_scenes.js.');
  console.log('Open the project in GB Studio to visually check sprites.');
  console.log('══════════════════════════════════════════════════════');
}

main();
