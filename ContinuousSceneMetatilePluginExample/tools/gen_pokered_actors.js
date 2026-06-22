/**
 * gen_pokered_actors.js
 * ---------------------
 * Replaces every placeholder actor in the 38 Pokemon overworld scenes with
 * pokered-accurate actors: correct sprite, position (2x pokered coord,
 * split-route aware), facing, movement (WALK -> MoveNPCRandom), and the real
 * pokered dialogue (NPCs, trainers' pre-battle line, item balls).
 *
 *   node gen_pokered_actors.js [--dry-run]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pokered, parseObjects, DIR_MAP, itemLabel } = require('./pokered_lib.js');

const PROJECT_ROOT = path.join(__dirname, '..');
const SCENES_DIR = path.join(PROJECT_ROOT, 'project', 'scenes');
const SPRITES_DIR = path.join(PROJECT_ROOT, 'assets', 'sprites');
const POKERED = 'C:/Users/micka/Documents/pokered';
const PRESET_ID = 'b5f85a5b-5f40-4355-9e63-db5ce2bfe0bc';
const MOVE_RANDOM_ID = 'c468dd94-f2e8-4583-ba29-de77bb527f50';

// scene folder -> { map, offsetTiles, minY, maxY }   (offset/min/max for split routes)
const SCENE_MAP = {
  palette_town: { map: 'PalletTown' },
  viridian_city: { map: 'ViridianCity' },
  pewter_city: { map: 'PewterCity' },
  cerulean_city: { map: 'CeruleanCity' },
  vermillion_city: { map: 'VermilionCity' },
  celadon_city: { map: 'CeladonCity' },
  saffron_city: { map: 'SaffronCity' },
  lavender_town: { map: 'LavenderTown' },
  fuchsia_city: { map: 'FuchsiaCity' },
  cinabar_island: { map: 'CinnabarIsland' },
  indigo_plateau: { map: 'IndigoPlateau' },
  route_1: { map: 'Route1' }, route_2: { map: 'Route2' }, route_3: { map: 'Route3' },
  route_4: { map: 'Route4' }, route_5: { map: 'Route5' }, route_6: { map: 'Route6' },
  route_7: { map: 'Route7' }, route_8: { map: 'Route8' }, route_9: { map: 'Route9' },
  route_10: { map: 'Route10' }, route_11: { map: 'Route11' }, route_12: { map: 'Route12' },
  route_13: { map: 'Route13' }, route_14: { map: 'Route14' }, route_15: { map: 'Route15' },
  route_16: { map: 'Route16' },
  // Route 17 (40x288 tiles) split top/bottom at GBS tile 144
  route_17a: { map: 'Route17', splitTop: 144 },
  route_17b: { map: 'Route17', splitBottom: 144 },
  route_18: { map: 'Route18' }, route_19: { map: 'Route19' }, route_20: { map: 'Route20' },
  route_21: { map: 'Route21' }, route_22: { map: 'Route22' },
  // Route 23 (40x288) split top/bottom at GBS tile 144
  route_23_a: { map: 'Route23', splitTop: 144 },
  route_23_b: { map: 'Route23', splitBottom: 144 },
  route_24: { map: 'Route24' }, route_25: { map: 'Route25' },
};

// ── sprite SPRITE_X -> spriteSheetId ──
function buildSpriteMap() {
  const byName = {};
  for (const f of fs.readdirSync(SPRITES_DIR)) {
    if (!f.endsWith('.png.gbsres')) continue;
    const j = JSON.parse(fs.readFileSync(path.join(SPRITES_DIR, f), 'utf8'));
    const name = f.replace(/\.png\.gbsres$/, '');
    byName[name] = j.id;
  }
  const UNUSED = {
    unused_scientist: 'scientist', unused_guard: 'guard',
    unused_gameboy_kid: 'gameboy_kid', unused_old_amber: 'old_amber',
    unused_gambler_asleep_1: 'gambler_asleep', unused_gambler_asleep_2: 'gambler_asleep',
  };
  return function (spriteConst) {
    let n = spriteConst.replace(/^SPRITE_/, '').toLowerCase();
    if (UNUSED[n]) n = UNUSED[n];
    return byName[n] || byName[n.replace(/_/g, '')] || null;
  };
}

const uuid = () => crypto.randomUUID();

function textEvent(pages) {
  return {
    command: 'EVENT_TEXT',
    args: {
      __presetId: PRESET_ID, text: pages, __section: 'presets', avatarId: '',
      minHeight: 6, maxHeight: 6, textX: 1, textY: 1, textHeight: 4,
      position: 'bottom', clearPrevious: true, showFrame: 'true',
      speedIn: -3, speedOut: -3, closeWhen: 'key', closeButton: 'a',
      closeDelayTime: 0.5, closeDelayFrames: 30,
    },
    id: uuid(),
  };
}
function moveRandomEvent() {
  return {
    command: 'EVENT_CALL_CUSTOM_EVENT',
    args: { customEventId: MOVE_RANDOM_ID, '$variable[V0]$': { type: 'number', value: 0 } },
    id: uuid(),
  };
}

let globalIdx = 0;
function makeActor(o, sprId, gx, gy, sceneIdx, pages) {
  const baseName = o.sprite.replace(/^SPRITE_/, '').toLowerCase();
  const sym = `npc_${baseName.slice(0, 12)}_${(globalIdx).toString(16).padStart(4, '0')}`;
  const walk = o.movement === 'WALK';
  return {
    _resourceType: 'actor',
    id: uuid(),
    _index: sceneIdx,
    symbol: sym,
    name: baseName,
    coordinateType: 'tiles',
    x: gx, y: gy,
    frame: 0,
    animate: true,
    spriteSheetId: sprId,
    paletteId: '',
    direction: DIR_MAP[o.facing] || 'down',
    moveSpeed: 1,
    animSpeed: 15,
    isPinned: false,
    persistent: false,
    collisionGroup: '',
    collisionExtraFlags: [],
    prefabScriptOverrides: {},
    script: pages && pages.length ? [textEvent(pages)] : [],
    startScript: [],
    updateScript: walk ? [moveRandomEvent()] : [],
    hit1Script: [], hit2Script: [], hit3Script: [],
  };
}

function main() {
  const dry = process.argv.includes('--dry-run');
  const pk = new Pokered(POKERED).load();
  const spriteOf = buildSpriteMap();

  let totActors = 0, totScenes = 0, missingSprite = new Set(), noText = [];

  for (const [scene, cfg] of Object.entries(SCENE_MAP)) {
    const sceneDir = path.join(SCENES_DIR, scene);
    const sceneFile = path.join(sceneDir, 'scene.gbsres');
    if (!fs.existsSync(sceneFile)) { console.warn(`[SKIP] ${scene}: no scene.gbsres`); continue; }
    const sc = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
    const W = sc.width, H = sc.height;
    const { objs } = parseObjects(POKERED, cfg.map);

    const placed = [];
    let idx = 0;
    for (const o of objs) {
      // pokered object coords are 16px units; GBS tile = 2x. The +1 on Y seats
      // the actor on the lower tile of its metatile cell (pokered sprites are
      // anchored a tile higher than GBS actors).
      let gx = o.x * 2, gy = o.y * 2 + 1;
      // split-route filtering / offset
      if (cfg.splitTop != null) { if (gy >= cfg.splitTop) continue; }
      if (cfg.splitBottom != null) { if (gy < cfg.splitBottom) continue; gy -= cfg.splitBottom; }
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) {
        console.warn(`  [oob] ${scene} ${o.sprite} @${gx},${gy} (scene ${W}x${H})`);
        continue;
      }
      const sprId = spriteOf(o.sprite);
      if (!sprId) { missingSprite.add(o.sprite); continue; }

      let pages;
      if (o.kind === 'item') {
        pages = [`\nFound\n\n${itemLabel(o.extra)}!`];
      } else {
        pages = pk.resolveTextConst(o.text);
        if (!pages) { noText.push(`${scene}:${o.text}`); pages = ['...']; }
      }
      placed.push(makeActor(o, sprId, gx, gy, idx++, pages));
      globalIdx++;
    }

    console.log(`${dry ? '[dry] ' : ''}${scene} (${cfg.map}, ${W}x${H}): ${placed.length} actors`);
    if (!dry) {
      const actorsDir = path.join(sceneDir, 'actors');
      fs.mkdirSync(actorsDir, { recursive: true });
      // wipe existing actor .gbsres (keep .bak history; preserve the special
      // EffectActor bound to init_overworld_script's $actor[0]$ parameter)
      const KEEP = new Set(['effectactor.gbsres']);
      for (const f of fs.readdirSync(actorsDir)) {
        if (f.endsWith('.gbsres') && !KEEP.has(f)) fs.unlinkSync(path.join(actorsDir, f));
      }
      const nameCount = {};
      for (const a of placed) {
        nameCount[a.name] = (nameCount[a.name] || 0) + 1;
        const fn = `${a.name}${nameCount[a.name] > 1 ? '_' + nameCount[a.name] : ''}.gbsres`;
        fs.writeFileSync(path.join(actorsDir, fn), JSON.stringify(a, null, 2) + '\n');
      }
      // re-index a preserved effectactor to sit after the placed actors
      const ef = path.join(actorsDir, 'effectactor.gbsres');
      if (fs.existsSync(ef)) {
        const j = JSON.parse(fs.readFileSync(ef, 'utf8'));
        j._index = placed.length;
        fs.writeFileSync(ef, JSON.stringify(j, null, 2));
      }
    }
    totActors += placed.length; totScenes++;
  }

  console.log(`\n${dry ? 'DRY — ' : ''}${totActors} actors across ${totScenes} scenes`);
  if (missingSprite.size) console.log('MISSING SPRITES:', [...missingSprite].join(', '));
  if (noText.length) console.log('NO TEXT (' + noText.length + '):', noText.slice(0, 40).join(', '));
}
main();
