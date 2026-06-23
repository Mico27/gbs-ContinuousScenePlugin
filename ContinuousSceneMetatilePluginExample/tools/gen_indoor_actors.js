/**
 * gen_indoor_actors.js
 * --------------------
 * Populates actors for all 186 indoor scenes (indices 58–243) from pokered
 * object_events: correct sprite, position (2x pokered coord + Y+1 for
 * metatile anchoring), facing, movement, and real pokered dialogue.
 *
 *   node gen_indoor_actors.js [--dry-run]
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

// scene folder slug -> pokered PascalCase map name
const SCENE_MAP = {
  // Caves / tunnels
  cerulean_cave1_f:          'CeruleanCave1F',
  cerulean_cave2_f:          'CeruleanCave2F',
  cerulean_cave_b1_f:        'CeruleanCaveB1F',
  digletts_cave:             'DiglettsCave',
  digletts_cave_route11:     'DiglettsCaveRoute11',
  digletts_cave_route2:      'DiglettsCaveRoute2',
  mt_moon1_f:                'MtMoon1F',
  mt_moon_b1_f:              'MtMoonB1F',
  mt_moon_b2_f:              'MtMoonB2F',
  rock_tunnel1_f:            'RockTunnel1F',
  rock_tunnel_b1_f:          'RockTunnelB1F',
  seafoam_islands1_f:        'SeafoamIslands1F',
  seafoam_islands_b1_f:      'SeafoamIslandsB1F',
  seafoam_islands_b2_f:      'SeafoamIslandsB2F',
  seafoam_islands_b3_f:      'SeafoamIslandsB3F',
  seafoam_islands_b4_f:      'SeafoamIslandsB4F',
  victory_road1_f:           'VictoryRoad1F',
  victory_road2_f:           'VictoryRoad2F',
  victory_road3_f:           'VictoryRoad3F',
  // Elite Four / Champion
  agathas_room:              'AgathasRoom',
  brunos_room:               'BrunosRoom',
  champions_room:            'ChampionsRoom',
  lances_room:               'LancesRoom',
  loreleis_room:             'LoreleisRoom',
  hall_of_fame:              'HallOfFame',
  // Pokemon Tower
  pokemon_tower1_f:          'PokemonTower1F',
  pokemon_tower2_f:          'PokemonTower2F',
  pokemon_tower3_f:          'PokemonTower3F',
  pokemon_tower4_f:          'PokemonTower4F',
  pokemon_tower5_f:          'PokemonTower5F',
  pokemon_tower6_f:          'PokemonTower6F',
  pokemon_tower7_f:          'PokemonTower7F',
  // Special venues
  bike_shop:                 'BikeShop',
  colosseum:                 'Colosseum',
  trade_center:              'TradeCenter',
  // Cinnabar
  cinnabar_gym:              'CinnabarGym',
  cinnabar_lab:              'CinnabarLab',
  cinnabar_lab_fossil_room:  'CinnabarLabFossilRoom',
  cinnabar_lab_metronome_room: 'CinnabarLabMetronomeRoom',
  cinnabar_lab_trade_room:   'CinnabarLabTradeRoom',
  cinnabar_mart:             'CinnabarMart',
  cinnabar_pokecenter:       'CinnabarPokecenter',
  // Pokemon Mansion
  pokemon_mansion1_f:        'PokemonMansion1F',
  pokemon_mansion2_f:        'PokemonMansion2F',
  pokemon_mansion3_f:        'PokemonMansion3F',
  pokemon_mansion_b1_f:      'PokemonMansionB1F',
  // Power Plant
  power_plant:               'PowerPlant',
  // Rocket Hideout
  rocket_hideout_b1_f:       'RocketHideoutB1F',
  rocket_hideout_b2_f:       'RocketHideoutB2F',
  rocket_hideout_b3_f:       'RocketHideoutB3F',
  rocket_hideout_b4_f:       'RocketHideoutB4F',
  rocket_hideout_elevator:   'RocketHideoutElevator',
  // Saffron / Silph
  saffron_gym:               'SaffronGym',
  saffron_mart:              'SaffronMart',
  saffron_pidgey_house:      'SaffronPidgeyHouse',
  saffron_pokecenter:        'SaffronPokecenter',
  silph_co1_f:               'SilphCo1F',
  silph_co2_f:               'SilphCo2F',
  silph_co3_f:               'SilphCo3F',
  silph_co4_f:               'SilphCo4F',
  silph_co5_f:               'SilphCo5F',
  silph_co6_f:               'SilphCo6F',
  silph_co7_f:               'SilphCo7F',
  silph_co8_f:               'SilphCo8F',
  silph_co9_f:               'SilphCo9F',
  silph_co10_f:              'SilphCo10F',
  silph_co11_f:              'SilphCo11F',
  silph_co_elevator:         'SilphCoElevator',
  // Safari Zone
  safari_zone_center:        'SafariZoneCenter',
  safari_zone_east:          'SafariZoneEast',
  safari_zone_north:         'SafariZoneNorth',
  safari_zone_west:          'SafariZoneWest',
  safari_zone_center_rest_house: 'SafariZoneCenterRestHouse',
  safari_zone_east_rest_house:   'SafariZoneEastRestHouse',
  safari_zone_gate:          'SafariZoneGate',
  safari_zone_north_rest_house:  'SafariZoneNorthRestHouse',
  safari_zone_west_rest_house:   'SafariZoneWestRestHouse',
  safari_zone_secret_house:  'SafariZoneSecretHouse',
  // Viridian Forest
  viridian_forest:           'ViridianForest',
  viridian_forest_north_gate: 'ViridianForestNorthGate',
  viridian_forest_south_gate: 'ViridianForestSouthGate',
  // Museums
  museum1_f:                 'Museum1F',
  museum2_f:                 'Museum2F',
  // Route gates
  route2_gate:               'Route2Gate',
  route5_gate:               'Route5Gate',
  route6_gate:               'Route6Gate',
  route7_gate:               'Route7Gate',
  route8_gate:               'Route8Gate',
  route22_gate:              'Route22Gate',
  route11_gate1_f:           'Route11Gate1F',
  route11_gate2_f:           'Route11Gate2F',
  route12_gate1_f:           'Route12Gate1F',
  route12_gate2_f:           'Route12Gate2F',
  route15_gate1_f:           'Route15Gate1F',
  route15_gate2_f:           'Route15Gate2F',
  route16_gate1_f:           'Route16Gate1F',
  route16_gate2_f:           'Route16Gate2F',
  route18_gate1_f:           'Route18Gate1F',
  route18_gate2_f:           'Route18Gate2F',
  // Route houses
  route2_trade_house:        'Route2TradeHouse',
  route12_super_rod_house:   'Route12SuperRodHouse',
  route16_fly_house:         'Route16FlyHouse',
  // Underground
  underground_path_route5:   'UndergroundPathRoute5',
  underground_path_route6:   'UndergroundPathRoute6',
  underground_path_route7:   'UndergroundPathRoute7',
  underground_path_route8:   'UndergroundPathRoute8',
  underground_path_north_south: 'UndergroundPathNorthSouth',
  underground_path_west_east:   'UndergroundPathWestEast',
  // Gyms
  celadon_gym:               'CeladonGym',
  cerulean_gym:              'CeruleanGym',
  fighting_dojo:             'FightingDojo',
  fuchsia_gym:               'FuchsiaGym',
  oaks_lab:                  'OaksLab',
  pewter_gym:                'PewterGym',
  vermilion_gym:             'VermilionGym',
  viridian_gym:              'ViridianGym',
  // Houses
  bills_house:               'BillsHouse',
  blues_house:               'BluesHouse',
  celadon_chief_house:       'CeladonChiefHouse',
  celadon_mansion_roof_house: 'CeladonMansionRoofHouse',
  cerulean_badge_house:      'CeruleanBadgeHouse',
  cerulean_trade_house:      'CeruleanTradeHouse',
  cerulean_trashed_house:    'CeruleanTrashedHouse',
  copycats_house1_f:         'CopycatsHouse1F',
  copycats_house2_f:         'CopycatsHouse2F',
  daycare:                   'Daycare',
  fuchsia_bills_grandpas_house: 'FuchsiaBillsGrandpasHouse',
  fuchsia_good_rod_house:    'FuchsiaGoodRodHouse',
  fuchsia_meeting_room:      'FuchsiaMeetingRoom',
  lavender_cubone_house:     'LavenderCuboneHouse',
  mr_fujis_house:            'MrFujisHouse',
  mr_psychics_house:         'MrPsychicsHouse',
  name_raters_house:         'NameRatersHouse',
  pewter_nidoran_house:      'PewterNidoranHouse',
  pewter_speech_house:       'PewterSpeechHouse',
  reds_house1_f:             'RedsHouse1F',
  reds_house2_f:             'RedsHouse2F',
  saffron_pidgey_house_2:    null,  // no pokered file
  vermilion_old_rod_house:   'VermilionOldRodHouse',
  vermilion_pidgey_house:    'VermilionPidgeyHouse',
  vermilion_trade_house:     'VermilionTradeHouse',
  viridian_nickname_house:   'ViridianNicknameHouse',
  viridian_school_house:     'ViridianSchoolHouse',
  wardens_house:             'WardensHouse',
  // Pokémon Fan Club
  pokemon_fan_club:          'PokemonFanClub',
  // Celadon buildings
  celadon_diner:             'CeladonDiner',
  celadon_hotel:             'CeladonHotel',
  celadon_mansion1_f:        'CeladonMansion1F',
  celadon_mansion2_f:        'CeladonMansion2F',
  celadon_mansion3_f:        'CeladonMansion3F',
  celadon_mansion_roof:      'CeladonMansionRoof',
  celadon_mart1_f:           'CeladonMart1F',
  celadon_mart2_f:           'CeladonMart2F',
  celadon_mart3_f:           'CeladonMart3F',
  celadon_mart4_f:           'CeladonMart4F',
  celadon_mart5_f:           'CeladonMart5F',
  celadon_mart_elevator:     'CeladonMartElevator',
  celadon_mart_roof:         'CeladonMartRoof',
  celadon_pokecenter:        'CeladonPokecenter',
  game_corner:               'GameCorner',
  game_corner_prize_room:    'GameCornerPrizeRoom',
  // Marts / Pokécenters
  cerulean_mart:             'CeruleanMart',
  cerulean_pokecenter:       'CeruleanPokecenter',
  fuchsia_mart:              'FuchsiaMart',
  fuchsia_pokecenter:        'FuchsiaPokecenter',
  indigo_plateau_lobby:      'IndigoPlateauLobby',
  lavender_mart:             'LavenderMart',
  lavender_pokecenter:       'LavenderPokecenter',
  mt_moon_pokecenter:        'MtMoonPokecenter',
  pewter_mart:               'PewterMart',
  pewter_pokecenter:         'PewterPokecenter',
  rock_tunnel_pokecenter:    'RockTunnelPokecenter',
  saffron_mart:              'SaffronMart',
  saffron_pokecenter:        'SaffronPokecenter',
  vermilion_mart:            'VermilionMart',
  vermilion_pokecenter:      'VermilionPokecenter',
  viridian_mart:             'ViridianMart',
  viridian_pokecenter:       'ViridianPokecenter',
  // SS Anne
  s_s_anne1_f:               'SSAnne1F',
  s_s_anne1_f_rooms:         'SSAnne1FRooms',
  s_s_anne2_f:               'SSAnne2F',
  s_s_anne2_f_rooms:         'SSAnne2FRooms',
  s_s_anne3_f:               'SSAnne3F',
  s_s_anne_b1_f:             'SSAnneB1F',
  s_s_anne_b1_f_rooms:       'SSAnneB1FRooms',
  s_s_anne_bow:              'SSAnneBow',
  s_s_anne_captains_room:    'SSAnneCaptainsRoom',
  s_s_anne_kitchen:          'SSAnneKitchen',
  vermilion_dock:            'VermilionDock',
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

  for (const [scene, mapName] of Object.entries(SCENE_MAP)) {
    if (!mapName) continue;
    const sceneDir = path.join(SCENES_DIR, scene);
    const sceneFile = path.join(sceneDir, 'scene.gbsres');
    if (!fs.existsSync(sceneFile)) { console.warn(`[SKIP] ${scene}: no scene.gbsres`); continue; }

    const pokeredFile = path.join(POKERED, 'data', 'maps', 'objects', mapName + '.asm');
    if (!fs.existsSync(pokeredFile)) {
      console.warn(`[SKIP] ${scene}: pokered file missing (${mapName}.asm)`);
      continue;
    }

    const sc = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
    const W = sc.width, H = sc.height;
    const { objs } = parseObjects(POKERED, mapName);

    const placed = [];
    let idx = 0;
    for (const o of objs) {
      // pokered coords are in 16px metatile units; GBS tile = 2x pokered.
      // +1 on Y: pokered actor sprites anchor to the top of their metatile cell,
      // GBS actors anchor to the bottom tile of theirs.
      let gx = o.x * 2, gy = o.y * 2 + 1;
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

    console.log(`${dry ? '[dry] ' : ''}${scene} (${mapName}, ${W}x${H}): ${placed.length} actors`);

    if (!dry) {
      const actorsDir = path.join(sceneDir, 'actors');
      fs.mkdirSync(actorsDir, { recursive: true });
      // wipe any existing actor .gbsres
      if (fs.existsSync(actorsDir)) {
        for (const f of fs.readdirSync(actorsDir)) {
          if (f.endsWith('.gbsres')) fs.unlinkSync(path.join(actorsDir, f));
        }
      }
      const nameCount = {};
      for (const a of placed) {
        nameCount[a.name] = (nameCount[a.name] || 0) + 1;
        const fn = `${a.name}${nameCount[a.name] > 1 ? '_' + nameCount[a.name] : ''}.gbsres`;
        fs.writeFileSync(path.join(actorsDir, fn), JSON.stringify(a, null, 2) + '\n');
      }
    }
    totActors += placed.length; totScenes++;
  }

  console.log(`\n${dry ? 'DRY — ' : ''}${totActors} actors across ${totScenes} scenes`);
  if (missingSprite.size) console.log('MISSING SPRITES:', [...missingSprite].join(', '));
  if (noText.length) console.log('NO TEXT (' + noText.length + '):', noText.slice(0, 60).join(', '));
}
main();
