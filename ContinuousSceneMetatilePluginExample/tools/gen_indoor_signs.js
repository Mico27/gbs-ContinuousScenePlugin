/**
 * gen_indoor_signs.js
 * -------------------
 * Creates actor-based sign hotspots for every indoor pokered bg_event.
 * Each bg_event becomes an invisible (SPRITE_NONE) actor placed at
 * (bx*2, by*2+1) — same Y formula as NPC actors — so the player can
 * stand in the metatile row below and press A to read it.
 *
 * Skips positions where a sign_<x>_<y>.gbsres already exists.
 * Warns when a scene already has >=28 actors (approaching the 30-actor limit).
 *
 *   node gen_indoor_signs.js [--dry-run]
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pokered, parseObjects } = require('./pokered_lib.js');

const PROJECT_ROOT = path.join(__dirname, '..');
const SCENES_DIR   = path.join(PROJECT_ROOT, 'project', 'scenes');
const POKERED      = 'C:/Users/micka/Documents/pokered';

const SPRITE_NONE_ID = '164c12bf-7cb8-430e-b23e-b98c1bb32b5f';
const PRESET_ID      = 'b5f85a5b-5f40-4355-9e63-db5ce2bfe0bc';

const DRY = process.argv.includes('--dry-run');
const uuid = () => crypto.randomUUID();

// scene folder slug -> pokered PascalCase map name (same as gen_indoor_actors.js)
const SCENE_MAP = {
  cerulean_cave1_f:              'CeruleanCave1F',
  cerulean_cave2_f:              'CeruleanCave2F',
  cerulean_cave_b1_f:            'CeruleanCaveB1F',
  digletts_cave:                 'DiglettsCave',
  digletts_cave_route11:         'DiglettsCaveRoute11',
  digletts_cave_route2:          'DiglettsCaveRoute2',
  mt_moon1_f:                    'MtMoon1F',
  mt_moon_b1_f:                  'MtMoonB1F',
  mt_moon_b2_f:                  'MtMoonB2F',
  rock_tunnel1_f:                'RockTunnel1F',
  rock_tunnel_b1_f:              'RockTunnelB1F',
  seafoam_islands1_f:            'SeafoamIslands1F',
  seafoam_islands_b1_f:          'SeafoamIslandsB1F',
  seafoam_islands_b2_f:          'SeafoamIslandsB2F',
  seafoam_islands_b3_f:          'SeafoamIslandsB3F',
  seafoam_islands_b4_f:          'SeafoamIslandsB4F',
  victory_road1_f:               'VictoryRoad1F',
  victory_road2_f:               'VictoryRoad2F',
  victory_road3_f:               'VictoryRoad3F',
  agathas_room:                  'AgathasRoom',
  brunos_room:                   'BrunosRoom',
  champions_room:                'ChampionsRoom',
  lances_room:                   'LancesRoom',
  loreleis_room:                 'LoreleisRoom',
  hall_of_fame:                  'HallOfFame',
  pokemon_tower1_f:              'PokemonTower1F',
  pokemon_tower2_f:              'PokemonTower2F',
  pokemon_tower3_f:              'PokemonTower3F',
  pokemon_tower4_f:              'PokemonTower4F',
  pokemon_tower5_f:              'PokemonTower5F',
  pokemon_tower6_f:              'PokemonTower6F',
  pokemon_tower7_f:              'PokemonTower7F',
  bike_shop:                     'BikeShop',
  colosseum:                     'Colosseum',
  trade_center:                  'TradeCenter',
  cinnabar_gym:                  'CinnabarGym',
  cinnabar_lab:                  'CinnabarLab',
  cinnabar_lab_fossil_room:      'CinnabarLabFossilRoom',
  cinnabar_lab_metronome_room:   'CinnabarLabMetronomeRoom',
  cinnabar_lab_trade_room:       'CinnabarLabTradeRoom',
  cinnabar_mart:                 'CinnabarMart',
  cinnabar_pokecenter:           'CinnabarPokecenter',
  pokemon_mansion1_f:            'PokemonMansion1F',
  pokemon_mansion2_f:            'PokemonMansion2F',
  pokemon_mansion3_f:            'PokemonMansion3F',
  pokemon_mansion_b1_f:          'PokemonMansionB1F',
  power_plant:                   'PowerPlant',
  rocket_hideout_b1_f:           'RocketHideoutB1F',
  rocket_hideout_b2_f:           'RocketHideoutB2F',
  rocket_hideout_b3_f:           'RocketHideoutB3F',
  rocket_hideout_b4_f:           'RocketHideoutB4F',
  rocket_hideout_elevator:       'RocketHideoutElevator',
  saffron_gym:                   'SaffronGym',
  saffron_mart:                  'SaffronMart',
  saffron_pidgey_house:          'SaffronPidgeyHouse',
  saffron_pokecenter:            'SaffronPokecenter',
  silph_co1_f:                   'SilphCo1F',
  silph_co2_f:                   'SilphCo2F',
  silph_co3_f:                   'SilphCo3F',
  silph_co4_f:                   'SilphCo4F',
  silph_co5_f:                   'SilphCo5F',
  silph_co6_f:                   'SilphCo6F',
  silph_co7_f:                   'SilphCo7F',
  silph_co8_f:                   'SilphCo8F',
  silph_co9_f:                   'SilphCo9F',
  silph_co10_f:                  'SilphCo10F',
  silph_co11_f:                  'SilphCo11F',
  silph_co_elevator:             'SilphCoElevator',
  safari_zone_center:            'SafariZoneCenter',
  safari_zone_east:              'SafariZoneEast',
  safari_zone_north:             'SafariZoneNorth',
  safari_zone_west:              'SafariZoneWest',
  safari_zone_center_rest_house: 'SafariZoneCenterRestHouse',
  safari_zone_east_rest_house:   'SafariZoneEastRestHouse',
  safari_zone_gate:              'SafariZoneGate',
  safari_zone_north_rest_house:  'SafariZoneNorthRestHouse',
  safari_zone_west_rest_house:   'SafariZoneWestRestHouse',
  safari_zone_secret_house:      'SafariZoneSecretHouse',
  viridian_forest:               'ViridianForest',
  viridian_forest_north_gate:    'ViridianForestNorthGate',
  viridian_forest_south_gate:    'ViridianForestSouthGate',
  museum1_f:                     'Museum1F',
  museum2_f:                     'Museum2F',
  route2_gate:                   'Route2Gate',
  route5_gate:                   'Route5Gate',
  route6_gate:                   'Route6Gate',
  route7_gate:                   'Route7Gate',
  route8_gate:                   'Route8Gate',
  route22_gate:                  'Route22Gate',
  route11_gate1_f:               'Route11Gate1F',
  route11_gate2_f:               'Route11Gate2F',
  route12_gate1_f:               'Route12Gate1F',
  route12_gate2_f:               'Route12Gate2F',
  route15_gate1_f:               'Route15Gate1F',
  route15_gate2_f:               'Route15Gate2F',
  route16_gate1_f:               'Route16Gate1F',
  route16_gate2_f:               'Route16Gate2F',
  route18_gate1_f:               'Route18Gate1F',
  route18_gate2_f:               'Route18Gate2F',
  route2_trade_house:            'Route2TradeHouse',
  route12_super_rod_house:       'Route12SuperRodHouse',
  route16_fly_house:             'Route16FlyHouse',
  underground_path_route5:       'UndergroundPathRoute5',
  underground_path_route6:       'UndergroundPathRoute6',
  underground_path_route7:       'UndergroundPathRoute7',
  underground_path_route8:       'UndergroundPathRoute8',
  underground_path_north_south:  'UndergroundPathNorthSouth',
  underground_path_west_east:    'UndergroundPathWestEast',
  celadon_gym:                   'CeladonGym',
  cerulean_gym:                  'CeruleanGym',
  fighting_dojo:                 'FightingDojo',
  fuchsia_gym:                   'FuchsiaGym',
  oaks_lab:                      'OaksLab',
  pewter_gym:                    'PewterGym',
  vermilion_gym:                 'VermilionGym',
  viridian_gym:                  'ViridianGym',
  bills_house:                   'BillsHouse',
  blues_house:                   'BluesHouse',
  celadon_chief_house:           'CeladonChiefHouse',
  celadon_mansion_roof_house:    'CeladonMansionRoofHouse',
  cerulean_badge_house:          'CeruleanBadgeHouse',
  cerulean_trade_house:          'CeruleanTradeHouse',
  cerulean_trashed_house:        'CeruleanTrashedHouse',
  copycats_house1_f:             'CopycatsHouse1F',
  copycats_house2_f:             'CopycatsHouse2F',
  daycare:                       'Daycare',
  fuchsia_bills_grandpas_house:  'FuchsiaBillsGrandpasHouse',
  fuchsia_good_rod_house:        'FuchsiaGoodRodHouse',
  fuchsia_meeting_room:          'FuchsiaMeetingRoom',
  lavender_cubone_house:         'LavenderCuboneHouse',
  mr_fujis_house:                'MrFujisHouse',
  mr_psychics_house:             'MrPsychicsHouse',
  name_raters_house:             'NameRatersHouse',
  pewter_nidoran_house:          'PewterNidoranHouse',
  pewter_speech_house:           'PewterSpeechHouse',
  reds_house1_f:                 'RedsHouse1F',
  reds_house2_f:                 'RedsHouse2F',
  vermilion_old_rod_house:       'VermilionOldRodHouse',
  vermilion_pidgey_house:        'VermilionPidgeyHouse',
  vermilion_trade_house:         'VermilionTradeHouse',
  viridian_nickname_house:       'ViridianNicknameHouse',
  viridian_school_house:         'ViridianSchoolHouse',
  wardens_house:                 'WardensHouse',
  pokemon_fan_club:              'PokemonFanClub',
  celadon_diner:                 'CeladonDiner',
  celadon_hotel:                 'CeladonHotel',
  celadon_mansion1_f:            'CeladonMansion1F',
  celadon_mansion2_f:            'CeladonMansion2F',
  celadon_mansion3_f:            'CeladonMansion3F',
  celadon_mansion_roof:          'CeladonMansionRoof',
  celadon_mart1_f:               'CeladonMart1F',
  celadon_mart2_f:               'CeladonMart2F',
  celadon_mart3_f:               'CeladonMart3F',
  celadon_mart4_f:               'CeladonMart4F',
  celadon_mart5_f:               'CeladonMart5F',
  celadon_mart_elevator:         'CeladonMartElevator',
  celadon_mart_roof:             'CeladonMartRoof',
  celadon_pokecenter:            'CeladonPokecenter',
  game_corner:                   'GameCorner',
  game_corner_prize_room:        'GameCornerPrizeRoom',
  cerulean_mart:                 'CeruleanMart',
  cerulean_pokecenter:           'CeruleanPokecenter',
  fuchsia_mart:                  'FuchsiaMart',
  fuchsia_pokecenter:            'FuchsiaPokecenter',
  indigo_plateau_lobby:          'IndigoPlateauLobby',
  lavender_mart:                 'LavenderMart',
  lavender_pokecenter:           'LavenderPokecenter',
  mt_moon_pokecenter:            'MtMoonPokecenter',
  pewter_mart:                   'PewterMart',
  pewter_pokecenter:             'PewterPokecenter',
  rock_tunnel_pokecenter:        'RockTunnelPokecenter',
  saffron_mart:                  'SaffronMart',
  saffron_pokecenter:            'SaffronPokecenter',
  vermilion_mart:                'VermilionMart',
  vermilion_pokecenter:          'VermilionPokecenter',
  viridian_mart:                 'ViridianMart',
  viridian_pokecenter:           'ViridianPokecenter',
  s_s_anne1_f:                   'SSAnne1F',
  s_s_anne1_f_rooms:             'SSAnne1FRooms',
  s_s_anne2_f:                   'SSAnne2F',
  s_s_anne2_f_rooms:             'SSAnne2FRooms',
  s_s_anne3_f:                   'SSAnne3F',
  s_s_anne_b1_f:                 'SSAnneB1F',
  s_s_anne_b1_f_rooms:           'SSAnneB1FRooms',
  s_s_anne_bow:                  'SSAnneBow',
  s_s_anne_captains_room:        'SSAnneCaptainsRoom',
  s_s_anne_kitchen:              'SSAnneKitchen',
  vermilion_dock:                'VermilionDock',
};

// ── helpers ──────────────────────────────────────────────────────────────────
const PRESET_ARGS = {
  minHeight: 6, maxHeight: 6, textX: 1, textY: 1, textHeight: 4,
  position: 'bottom', clearPrevious: true, showFrame: 'true',
  speedIn: -3, speedOut: -3, closeWhen: 'key', closeButton: 'a',
  closeDelayTime: 0.5, closeDelayFrames: 30,
};

function textEvent(pages) {
  return {
    command: 'EVENT_TEXT',
    args: { __presetId: PRESET_ID, text: pages, __section: 'presets', avatarId: '', ...PRESET_ARGS },
    id: uuid(),
  };
}

function makeSignActor(bx, by, gx, gy, idx, pages) {
  const sym = `sign_${bx}_${by}`;
  return {
    _resourceType: 'actor',
    id: uuid(),
    _index: idx,
    symbol: sym,
    prefabId: '',
    name: sym,
    coordinateType: 'tiles',
    x: gx, y: gy,
    frame: 0,
    animate: false,
    spriteSheetId: SPRITE_NONE_ID,
    paletteId: '',
    direction: 'down',
    moveSpeed: 1,
    animSpeed: 15,
    isPinned: false,
    persistent: false,
    collisionGroup: '',
    collisionExtraFlags: [],
    prefabScriptOverrides: {},
    script: [textEvent(pages)],
    startScript: [],
    updateScript: [],
    hit1Script: [],
    hit2Script: [],
    hit3Script: [],
  };
}

// Static fallback text for TEXT_CONST values that use dynamic in-game menus
// (elevator floor selection, vending machines, prize vendor menus).
const TEXT_OVERRIDES = {
  TEXT_SILPHCOELEVATOR_ELEVATOR:         ['\nELEVATOR\n\nWhich floor?'],
  TEXT_CELADONMARTELEVATOR:              ['\nELEVATOR\n\nWhich floor?'],
  TEXT_CELADONMARTROOF_VENDING_MACHINE1: ['\nVENDING\n\nMACHINE'],
  TEXT_CELADONMARTROOF_VENDING_MACHINE2: ['\nVENDING\n\nMACHINE'],
  TEXT_CELADONMARTROOF_VENDING_MACHINE3: ['\nVENDING\n\nMACHINE'],
  TEXT_GAMECORNERPRIZEROOM_PRIZE_VENDOR_1: ['\nPRIZE CORNER\n\nExchange coins!'],
  TEXT_GAMECORNERPRIZEROOM_PRIZE_VENDOR_2: ['\nPRIZE CORNER\n\nExchange coins!'],
  TEXT_GAMECORNERPRIZEROOM_PRIZE_VENDOR_3: ['\nPRIZE CORNER\n\nExchange coins!'],
};

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  const pk = new Pokered(POKERED).load();
  let totalSigns = 0, totalScenes = 0, noText = [], skipped = 0;

  for (const [scene, mapName] of Object.entries(SCENE_MAP)) {
    const pokeredFile = path.join(POKERED, 'data', 'maps', 'objects', mapName + '.asm');
    if (!fs.existsSync(pokeredFile)) continue;

    const { bgs } = parseObjects(POKERED, mapName);
    if (!bgs.length) continue;

    const sceneDir = path.join(SCENES_DIR, scene);
    if (!fs.existsSync(path.join(sceneDir, 'scene.gbsres'))) {
      console.warn(`[SKIP] ${scene}: no scene.gbsres`);
      continue;
    }

    const actorsDir = path.join(sceneDir, 'actors');
    if (!fs.existsSync(actorsDir)) fs.mkdirSync(actorsDir);

    // count existing actors for index assignment + limit warning
    const existing = fs.readdirSync(actorsDir).filter(f => f.endsWith('.gbsres') && !f.endsWith('.bak'));
    const existingCount = existing.length;
    if (existingCount >= 28) {
      console.warn(`[WARN] ${scene}: already ${existingCount} actors — may hit 30-actor limit`);
    }

    let sceneAdded = 0;
    for (const b of bgs) {
      const signFile = path.join(actorsDir, `sign_${b.x}_${b.y}.gbsres`);
      if (fs.existsSync(signFile)) { skipped++; continue; }

      const pages = TEXT_OVERRIDES[b.text] || pk.resolveTextConst(b.text);
      if (!pages) { noText.push(`${scene}:${b.text}`); continue; }

      const gx = b.x * 2;
      const gy = b.y * 2 + 1;
      const idx = existingCount + sceneAdded;

      if (idx >= 30) {
        console.warn(`[SKIP] ${scene}: sign_${b.x}_${b.y} would exceed 30-actor limit`);
        continue;
      }

      const actor = makeSignActor(b.x, b.y, gx, gy, idx, pages);
      if (!DRY) fs.writeFileSync(signFile, JSON.stringify(actor, null, 2) + '\n');
      sceneAdded++;
      totalSigns++;
    }

    if (sceneAdded > 0) {
      console.log(`  ${scene} (${mapName}): +${sceneAdded} sign(s)`);
      totalScenes++;
    }
  }

  console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Done: ${totalSigns} sign actors across ${totalScenes} scenes.`);
  if (skipped) console.log(`Skipped ${skipped} already-existing sign file(s).`);
  if (noText.length) console.log(`NO TEXT (${noText.length}): ${noText.join(', ')}`);
}
main();
