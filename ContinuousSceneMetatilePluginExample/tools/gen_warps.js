/**
 * gen_warps.js — Full pokered warp importer
 * ============================================
 * Deletes ALL existing warp triggers, then recreates them from pokered data
 * with authentic per-type behavior:
 *
 *   DOOR_CAVE  Overworld → Indoor building/cave entry.
 *              Trigger has inline WarpCooldown guard, then calls warp_script(WarpId).
 *              On arrival: post_fadein_overworld_script walks player 2 south
 *              if standing on door (124) or cave (123) metatile.
 *
 *   EXIT_DOWN  Indoor → Overworld through a door (player presses DOWN).
 *   EXIT_LEFT  Gate exit heading west (player presses LEFT).
 *   EXIT_RIGHT Gate exit heading east (player presses RIGHT).
 *   EXIT_UP    Rare top-exit (player presses UP).
 *              All call the matching Warp Input {dir} custom event with WarpId.
 *              leaveScript on the trigger removes the input handler.
 *
 *   SIMPLE     Indoor stairway between floors (step-on → instant switch).
 *              Inline EVENT_SWITCH_SCENE.
 *
 *   SPINNER    Teleport pad in FACILITY/INTERIOR tileset maps (same-scene warp).
 *              Calls Spinning Warp custom event with WarpId.
 *              Spinning Warp: spin animation + set WarpType(var23)=1 + warp_script.
 *              Destination scene init script checks var23 and plays spin arrival.
 *
 * Custom scripts written to project/scripts/:
 *   warp_script         — pure WarpId→scene router (all warp types)
 *   script_warp_input_down  — DOWN exit behavior
 *   script_warp_input_left  — LEFT exit behavior
 *   script_warp_input_right — RIGHT exit behavior
 *   script_warp_input_up    — UP exit behavior
 *   script_spinning_warp    — spinner departure animation
 *
 * Usage:
 *   node gen_warps.js            # apply all changes
 *   node gen_warps.js --dry-run  # print plan, write nothing
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.join(__dirname, '..');
const SCENES_DIR   = path.join(PROJECT_ROOT, 'project', 'scenes');
const SCRIPTS_DIR  = path.join(PROJECT_ROOT, 'project', 'scripts');
const POKERED      = 'C:/Users/micka/Documents/pokered';

// ─────────────────────────────────────────────────────────────
// Stable custom script IDs
// ─────────────────────────────────────────────────────────────
const WARP_SCRIPT_ID        = 'f7a1e2d3-4b5c-6d7e-8f9a-0b1c2d3e4f5a';  // existing — ENTRY (overworld→indoor)
const WARP_SCRIPT_INDOOR_ID = 'e2000001-0000-4000-a000-000000000001';  // indoor — EXIT + SPINNER
const INIT_INDOOR_SCRIPT_ID = 'e3000001-0000-4000-a000-000000000001';  // legacy (merged into init_overworld)
const INIT_OVERWORLD_ID     = '70823794-eb52-4bb1-83a1-d0a628f22deb';  // shared init (all scenes)
const POST_FADEIN_ID        = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';  // post-fadein (all scenes)
// Stable id for the FACILITY spinner-detection block injected into init_overworld's
// Metatile Enter handler, so re-runs can find and replace it idempotently.
const SPINNER_INJECT_ID     = 'e3000001-0000-4000-a000-0000000000aa';
const VAR_WARP_COOLDOWN     = '20';
const VAR_PENDING_WARP_ID   = '17';  // PendingWarpId — carries a WarpId into a persistent input handler (V0 locals don't survive Attach-to-Input)
const WARP_INPUT_DOWN_ID    = 'e1000001-0000-4000-a000-000000000001';
const WARP_INPUT_LEFT_ID    = 'e1000001-0000-4000-a000-000000000002';
const WARP_INPUT_RIGHT_ID   = 'e1000001-0000-4000-a000-000000000003';
const WARP_INPUT_UP_ID      = 'e1000001-0000-4000-a000-000000000004';
const SPINNING_WARP_ID      = 'e1000001-0000-4000-a000-000000000005';

// METATILETYPES/FACILITY constant UUID (written to variables.gbsres by ensureWarpTypeVariable)
const FACILITY_TYPE_CONST_ID    = 'b001-0000-0000-0000-0000f3000004';
// METATILEIDS/FACILITY_SPINNING_WARP constant UUID
const FACILITY_WARP_PAD_CONST_ID = 'b001-0000-0000-0000-0000f4000001';
// FACILITY warp-pad metatile id (the spinner-pad tile within a FACILITY metatile scene)
const FACILITY_SPINNING_WARP_METATILE_ID = 31;
// The spinning-warp pad is actually METATILEIDS/FACILITY/SPECIAL_3 (metatile id 60),
// not the old id-31 deco tile — detection now keys off this constant.
const FACILITY_SPECIAL_3_CONST_ID = 'a9d27fd2-0f2a-46e7-a05c-02270e5a680a';

// Per-source-type warp routers live at scripts/<type>/warp_script.gbsres (mirrors the
// Init/Post per-type split). Each scene's DOOR_CAVE/SPINNER warp routes through the
// router for that scene's own metatile type. Router ids are read from the on-disk
// router files so they stay stable (overworld f7a1e2d3…, facility e2000001…), which is
// also why the existing trigger builders — which call those ids — need no change.
const TYPE_CONST_TO_NAME = {
  'e06a546c-3ca3-4608-87b5-c34395ad41f6': 'overworld',
  '4341312c-72d9-4409-bd99-5d48f50eec3e': 'plateau',
  'b001-0000-0000-0000-0000f3000001': 'cavern',
  'b001-0000-0000-0000-0000f3000002': 'cemetery',
  'b001-0000-0000-0000-0000f3000003': 'club',
  'b001-0000-0000-0000-0000f3000004': 'facility',
  'b001-0000-0000-0000-0000f3000005': 'forest',
  'b001-0000-0000-0000-0000f3000006': 'gate',
  'b001-0000-0000-0000-0000f3000007': 'gym',
  'b001-0000-0000-0000-0000f3000008': 'house',
  'b001-0000-0000-0000-0000f3000009': 'interior',
  'b001-0000-0000-0000-0000f300000a': 'lab',
  'b001-0000-0000-0000-0000f300000b': 'lobby',
  'b001-0000-0000-0000-0000f300000c': 'mansion',
  'b001-0000-0000-0000-0000f300000d': 'pokecenter',
  'b001-0000-0000-0000-0000f300000e': 'reds_house',
  'b001-0000-0000-0000-0000f300000f': 'ship',
  'b001-0000-0000-0000-0000f3000010': 'ship_port',
  'b001-0000-0000-0000-0000f3000011': 'underground',
};
const WARP_ROUTER_TYPES = Object.values(TYPE_CONST_TO_NAME);

// Maps metatile scene UUIDs → METATILETYPES/* constant UUIDs.
// Derived from the scene indices computed by gen_indoor_metatiles.js.
const METATILE_SCENE_ID_TO_TYPE_CONST = {
  '3bfc6403-d858-4b4e-b235-73dbb828b337': 'e06a546c-3ca3-4608-87b5-c34395ad41f6',  // OVERWORLD = 0
  '833113a4-fa67-47ba-9466-cc5194472f26': '4341312c-72d9-4409-bd99-5d48f50eec3e',  // PLATEAU = 1
  '944389bf-6266-4090-aa70-8c361cf3a874': 'b001-0000-0000-0000-0000f3000001',      // CAVERN = 2
  'ac107464-8c52-4173-bbeb-6044ff183813': 'b001-0000-0000-0000-0000f3000002',      // CEMETERY = 3
  '7c56cd68-3a30-4d10-8013-9c2056532f68': 'b001-0000-0000-0000-0000f3000003',      // CLUB = 4
  '3dcfb78d-8aab-46c5-8e14-2bd8712142bf': FACILITY_TYPE_CONST_ID,                  // FACILITY = 5
  '8143aa71-cb0e-4972-8c10-15dc7b49f555': 'b001-0000-0000-0000-0000f3000005',      // FOREST = 6
  'be091cf5-b232-41ad-a078-2666f17c821e': 'b001-0000-0000-0000-0000f3000006',      // GATE = 7
  '6ba45848-b087-48c5-ae19-fb6dd62a7b25': 'b001-0000-0000-0000-0000f3000007',      // GYM = 8
  '5dfc6b74-d862-4fe2-8b2c-208d7049a71e': 'b001-0000-0000-0000-0000f3000008',      // HOUSE = 9
  '815ea311-000a-4341-af48-577370bd6e84': 'b001-0000-0000-0000-0000f3000009',      // INTERIOR = 10
  '113d3def-5a4e-4521-893f-5ba653053941': 'b001-0000-0000-0000-0000f300000a',      // LAB = 11
  '7ab9a7a2-5957-4f4a-885b-2f5c99d9d1bf': 'b001-0000-0000-0000-0000f300000b',      // LOBBY = 12
  'e7fed2f5-572c-46f5-a451-bbe304a97119': 'b001-0000-0000-0000-0000f300000c',      // MANSION = 13
  '5e12ba29-a7fc-4631-be50-fff1e493f71c': 'b001-0000-0000-0000-0000f300000d',      // POKECENTER = 14
  '5488617e-a78e-48b3-9ea4-3144015066ee': 'b001-0000-0000-0000-0000f300000e',      // REDS_HOUSE = 15
  'a50510e8-6ce4-4e8b-b221-371d8f4563db': 'b001-0000-0000-0000-0000f300000f',      // SHIP = 16
  '46ccfdee-0173-4e07-a99f-a19cd8c7f87e': 'b001-0000-0000-0000-0000f3000010',      // SHIP_PORT = 17
  'b85dfc90-df6b-4e5c-8949-a6abae5d9d1e': 'b001-0000-0000-0000-0000f3000011',      // UNDERGROUND = 18
};

const WARP_INPUT_SCRIPT_IDS = {
  down:  WARP_INPUT_DOWN_ID,
  left:  WARP_INPUT_LEFT_ID,
  right: WARP_INPUT_RIGHT_ID,
  up:    WARP_INPUT_UP_ID,
};

// Building entry warps start at WarpId 54 (1-53 were old border warps, now unused)
const FIRST_BUILDING_WARP_ID = 54;

// var23 = WarpType: 0 = normal, 1 = spinner arrival
const VAR_WARP_TYPE = '23';

// Phase B "LastMap collapse" (pokered wLastMap model):
// DOOR_CAVE entry records where to return to the overworld; the generic
// indoor EXIT resolves its destination from these instead of a per-warp case.
// NOTE: var24 is an existing "SceneType" variable — do not reuse it.
const VAR_LAST_MAP = '27';  // index into the exit-target overworld scene list
const VAR_LAST_X   = '25';  // overworld return X (GBS tiles)
const VAR_LAST_Y   = '26';  // overworld return Y (GBS tiles)

// StairCooldown: anti-reentry guard for SIMPLE stair/ladder warps. Set ON at
// departure; the paired destination trigger sees ON and skips, then the player's
// trigger leaveScript clears it when they step off. Kept separate from
// WarpCooldown (which stays ON for the whole indoor visit and would otherwise
// block the first stair). Reuses the WARPCOOLDOWN/OFF(0) and ON(1) constants.
const VAR_STAIR_COOLDOWN = '28';

// Custom script that resolves a generic indoor→overworld EXIT from LastMap.
const WARP_EXIT_RESOLVE_ID = 'e4000001-0000-4000-a000-000000000001';

// Named constants in variables.gbsres
const DIR_CONST = {
  down:  'b001-0000-0000-0000-000000000010', // value 0
  right: 'b001-0000-0000-0000-000000000011', // value 1
  up:    'b001-0000-0000-0000-000000000012', // value 2
  left:  'b001-0000-0000-0000-000000000013', // value 3
};
const WARP_COOLDOWN_OFF = 'b001-0000-0000-0000-000000000018';
const WARP_COOLDOWN_ON  = 'b001-0000-0000-0000-000000000019';

const uuid    = () => crypto.randomUUID();
const DRY_RUN = process.argv.includes('--dry-run');

// ─────────────────────────────────────────────────────────────
// Scene maps
// ─────────────────────────────────────────────────────────────
const OVERWORLD_SCENES = {
  palette_town:    { map: 'PalletTown' },
  viridian_city:   { map: 'ViridianCity' },
  pewter_city:     { map: 'PewterCity' },
  cerulean_city:   { map: 'CeruleanCity' },
  vermillion_city: { map: 'VermilionCity' },
  celadon_city:    { map: 'CeladonCity' },
  saffron_city:    { map: 'SaffronCity' },
  lavender_town:   { map: 'LavenderTown' },
  fuchsia_city:    { map: 'FuchsiaCity' },
  cinabar_island:  { map: 'CinnabarIsland' },
  indigo_plateau:  { map: 'IndigoPlateau' },
  route_1:  { map: 'Route1' },  route_2:  { map: 'Route2' },  route_3:  { map: 'Route3' },
  route_4:  { map: 'Route4' },  route_5:  { map: 'Route5' },  route_6:  { map: 'Route6' },
  route_7:  { map: 'Route7' },  route_8:  { map: 'Route8' },  route_9:  { map: 'Route9' },
  route_10: { map: 'Route10' }, route_11: { map: 'Route11' }, route_12: { map: 'Route12' },
  route_13: { map: 'Route13' }, route_14: { map: 'Route14' }, route_15: { map: 'Route15' },
  route_16: { map: 'Route16' },
  route_17a: { map: 'Route17', splitTop: 144 },
  route_17b: { map: 'Route17', splitBottom: 144 },
  route_18: { map: 'Route18' }, route_19: { map: 'Route19' }, route_20: { map: 'Route20' },
  route_21: { map: 'Route21' }, route_22: { map: 'Route22' },
  route_23_a: { map: 'Route23', splitTop: 144 },
  route_23_b: { map: 'Route23', splitBottom: 144 },
  route_24: { map: 'Route24' }, route_25: { map: 'Route25' },
};

// Maps that use FACILITY or INTERIOR tilesets (spinner pads)
const SPINNER_MAPS = new Set([
  'SaffronGym',
]);

const INDOOR_SCENES = {
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
  agathas_room:              'AgathasRoom',
  brunos_room:               'BrunosRoom',
  champions_room:            'ChampionsRoom',
  lances_room:               'LancesRoom',
  loreleis_room:             'LoreleisRoom',
  hall_of_fame:              'HallOfFame',
  pokemon_tower1_f:          'PokemonTower1F',
  pokemon_tower2_f:          'PokemonTower2F',
  pokemon_tower3_f:          'PokemonTower3F',
  pokemon_tower4_f:          'PokemonTower4F',
  pokemon_tower5_f:          'PokemonTower5F',
  pokemon_tower6_f:          'PokemonTower6F',
  pokemon_tower7_f:          'PokemonTower7F',
  bike_shop:                 'BikeShop',
  colosseum:                 'Colosseum',
  trade_center:              'TradeCenter',
  cinnabar_gym:              'CinnabarGym',
  cinnabar_lab:              'CinnabarLab',
  cinnabar_lab_fossil_room:  'CinnabarLabFossilRoom',
  cinnabar_lab_metronome_room: 'CinnabarLabMetronomeRoom',
  cinnabar_lab_trade_room:   'CinnabarLabTradeRoom',
  cinnabar_mart:             'CinnabarMart',
  cinnabar_pokecenter:       'CinnabarPokecenter',
  pokemon_mansion1_f:        'PokemonMansion1F',
  pokemon_mansion2_f:        'PokemonMansion2F',
  pokemon_mansion3_f:        'PokemonMansion3F',
  pokemon_mansion_b1_f:      'PokemonMansionB1F',
  power_plant:               'PowerPlant',
  rocket_hideout_b1_f:       'RocketHideoutB1F',
  rocket_hideout_b2_f:       'RocketHideoutB2F',
  rocket_hideout_b3_f:       'RocketHideoutB3F',
  rocket_hideout_b4_f:       'RocketHideoutB4F',
  rocket_hideout_elevator:   'RocketHideoutElevator',
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
  viridian_forest:           'ViridianForest',
  viridian_forest_north_gate: 'ViridianForestNorthGate',
  viridian_forest_south_gate: 'ViridianForestSouthGate',
  museum1_f:                 'Museum1F',
  museum2_f:                 'Museum2F',
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
  route2_trade_house:        'Route2TradeHouse',
  route12_super_rod_house:   'Route12SuperRodHouse',
  route16_fly_house:         'Route16FlyHouse',
  underground_path_route5:   'UndergroundPathRoute5',
  underground_path_route6:   'UndergroundPathRoute6',
  underground_path_route7:   'UndergroundPathRoute7',
  underground_path_route8:   'UndergroundPathRoute8',
  underground_path_north_south: 'UndergroundPathNorthSouth',
  underground_path_west_east:   'UndergroundPathWestEast',
  celadon_gym:               'CeladonGym',
  cerulean_gym:              'CeruleanGym',
  fighting_dojo:             'FightingDojo',
  fuchsia_gym:               'FuchsiaGym',
  oaks_lab:                  'OaksLab',
  pewter_gym:                'PewterGym',
  vermilion_gym:             'VermilionGym',
  viridian_gym:              'ViridianGym',
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
  vermilion_old_rod_house:   'VermilionOldRodHouse',
  vermilion_pidgey_house:    'VermilionPidgeyHouse',
  vermilion_trade_house:     'VermilionTradeHouse',
  viridian_nickname_house:   'ViridianNicknameHouse',
  viridian_school_house:     'ViridianSchoolHouse',
  wardens_house:             'WardensHouse',
  pokemon_fan_club:          'PokemonFanClub',
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
  saffron_pokecenter:        'SaffronPokecenter',
  vermilion_mart:            'VermilionMart',
  vermilion_pokecenter:      'VermilionPokecenter',
  viridian_mart:             'ViridianMart',
  viridian_pokecenter:       'ViridianPokecenter',
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

// ─────────────────────────────────────────────────────────────
// Build reverse lookup: pokered PascalCase → GBS slug(s)
// ─────────────────────────────────────────────────────────────
const PASCAL_TO_SLUG = {};
for (const [slug, info] of Object.entries(OVERWORLD_SCENES)) {
  const m = info.map;
  if (info.splitTop !== undefined || info.splitBottom !== undefined) {
    if (!PASCAL_TO_SLUG[m]) PASCAL_TO_SLUG[m] = { isSplit: true, splits: [] };
    const splitY = info.splitTop !== undefined ? info.splitTop : info.splitBottom;
    PASCAL_TO_SLUG[m].splits.push({ slug, isTop: info.splitTop !== undefined, splitY });
  } else {
    PASCAL_TO_SLUG[m] = { slug };
  }
}
for (const [slug, pascal] of Object.entries(INDOOR_SCENES)) {
  if (pascal) PASCAL_TO_SLUG[pascal] = { slug };
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────
function pascalToSnake(s) {
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')        // SSAnne → SS_Anne
    .replace(/([a-z])([A-Z])/g, '$1_$2')               // camelCase break
    .replace(/(\d)([A-Z])(?=[a-z])/g, '$1_$2')         // 11Gate → 11_Gate (not 1F)
    .replace(/([a-zA-Z])(\d)/g, (_, l, d) =>           // letter → digit
      (l === 'B' || l === 'b') ? l + d : l + '_' + d  // preserve B1F, B2F basement
    )
    .toUpperCase();
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function buildConstToPascalMap() {
  const dir = path.join(POKERED, 'data', 'maps', 'objects');
  const map = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.asm'))) {
    const pascal = f.replace(/\.asm$/, '');
    map[pascalToSnake(pascal)] = pascal;
  }
  return map;
}

// ─────────────────────────────────────────────────────────────
// Parse warp_events from a pokered map file
// Returns: [{idx (1-based), x, y, destConst, destWarpId}]
// ─────────────────────────────────────────────────────────────
function parseWarps(mapPascalName) {
  const file = path.join(POKERED, 'data', 'maps', 'objects', mapPascalName + '.asm');
  if (!fs.existsSync(file)) return [];
  const warps = [];
  let inWarps = false;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = raw.trim();
    if (t === 'def_warp_events') { inWarps = true; continue; }
    if (t.startsWith('def_') && t !== 'def_warp_events') { inWarps = false; }
    if (!inWarps) continue;
    const m = t.match(/^warp_event\s+(\d+)\s*,\s*(\d+)\s*,\s*([\w]+)\s*,\s*(\d+)/);
    if (m) warps.push({ idx: warps.length + 1, x: +m[1], y: +m[2], destConst: m[3], destWarpId: +m[4] });
  }
  return warps;
}

// ─────────────────────────────────────────────────────────────
// Build GBS scene ID / dimension map: slug → {id, width, height}
// ─────────────────────────────────────────────────────────────
function buildSceneIdMap() {
  const map = {};
  for (const entry of fs.readdirSync(SCENES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sceneFile = path.join(SCENES_DIR, entry.name, 'scene.gbsres');
    if (!fs.existsSync(sceneFile)) continue;
    const d = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
    map[entry.name] = { id: d.id, width: d.width, height: d.height };
  }
  return map;
}

// ─────────────────────────────────────────────────────────────
// Resolve GBS slug(s) for a pokered position (handles split routes)
// ─────────────────────────────────────────────────────────────
function resolveSlug(pascal, gbsX, gbsY) {
  const entry = PASCAL_TO_SLUG[pascal];
  if (!entry) return null;
  if (!entry.isSplit) return { slug: entry.slug, localX: gbsX, localY: gbsY };
  for (const split of entry.splits) {
    if (split.isTop && gbsY < split.splitY)
      return { slug: split.slug, localX: gbsX, localY: gbsY };
    if (!split.isTop && gbsY >= split.splitY)
      return { slug: split.slug, localX: gbsX, localY: gbsY - split.splitY };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Determine which direction to exit for a LAST_MAP indoor warp.
// In pokered, building door exits always press DOWN (south).
// Gate exits press LEFT or RIGHT based on x position.
// ─────────────────────────────────────────────────────────────
function determineExitDirection(gbsX, gbsY, sceneWidth, sceneHeight) {
  if (gbsX <= 2) return 'left';
  if (gbsX >= sceneWidth - 4) return 'right';
  return 'down';  // all vertical door exits: player presses DOWN to leave
}

// ─────────────────────────────────────────────────────────────
// Compute destination X,Y for EXIT_* warps in overworld.
// For DOWN/UP: spawn on door tile; post_fadein walks player 2 south.
// For LEFT/RIGHT: spawn 2 tiles further in exit direction (clears gate door tile).
// ─────────────────────────────────────────────────────────────
function computeOverworldExitSpawn(owX, owY, exitDir) {
  if (exitDir === 'left')  return { x: owX - 2, y: owY };
  if (exitDir === 'right') return { x: owX + 2, y: owY };
  return { x: owX, y: owY };  // down/up: spawn on door tile, post_fadein walks south
}

// ─────────────────────────────────────────────────────────────
// Floor number helper (for stairway direction labelling)
// ─────────────────────────────────────────────────────────────
function extractFloor(pascal) {
  const b = pascal.match(/B(\d+)F$/i);  if (b) return -parseInt(b[1]);
  const r = pascal.match(/Roof/i);      if (r) return 99;
  const n = pascal.match(/(\d+)F$/i);   if (n) return  parseInt(n[1]);
  return 0;
}

// ─────────────────────────────────────────────────────────────
// File I/O helpers
// ─────────────────────────────────────────────────────────────
function writeFile(filePath, data) {
  if (DRY_RUN) return;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, content);
}

function deleteAllTriggers() {
  let count = 0;
  for (const entry of fs.readdirSync(SCENES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const trigDir = path.join(SCENES_DIR, entry.name, 'triggers');
    if (!fs.existsSync(trigDir)) continue;
    for (const f of fs.readdirSync(trigDir)) {
      if (!f.endsWith('.gbsres') || f.endsWith('.bak')) continue;
      const fp = path.join(trigDir, f);
      if (!DRY_RUN) fs.unlinkSync(fp);
      count++;
    }
  }
  console.log(`  Deleted ${count} trigger files.`);
}

// ─────────────────────────────────────────────────────────────
// GBS JSON event builders
// ─────────────────────────────────────────────────────────────
function evSwitchScene(sceneId, x, y, direction = 'down', fadeSpeed = '2') {
  return {
    command: 'EVENT_SWITCH_SCENE',
    args: { sceneId, x: { type: 'number', value: x }, y: { type: 'number', value: y }, direction, fadeSpeed },
    id: uuid(),
  };
}

// Change Scene with the destination X/Y supplied by variables (script values).
// EVENT_SWITCH_SCENE's x/y fields are type "value" so they accept variables;
// sceneId/direction stay static. Used by the LastMap exit resolver.
function evSwitchSceneVarCoords(sceneId, xVar, yVar, direction = 'down', fadeSpeed = '2') {
  return {
    command: 'EVENT_SWITCH_SCENE',
    args: {
      sceneId,
      x: { type: 'variable', value: xVar },
      y: { type: 'variable', value: yVar },
      direction,
      fadeSpeed,
    },
    id: uuid(),
  };
}

function evScriptUnlock() {
  return { command: 'EVENT_SCRIPT_UNLOCK', args: {}, id: uuid() };
}

function evGetPosition(actorId = '$self$', xVar = '12', yVar = '13') {
  return {
    command: 'EVENT_ACTOR_GET_POSITION',
    args: { actorId, vectorX: xVar, vectorY: yVar, '__collapse': true },
    id: uuid(),
  };
}

function evWait(frames) {
  return {
    command: 'EVENT_WAIT',
    args: { time: { type: 'number', value: 0.5 }, frames: { type: 'number', value: frames }, units: 'frames' },
    id: uuid(),
  };
}

function evSetDirection(dir) {
  return {
    command: 'EVENT_ACTOR_SET_DIRECTION',
    args: { actorId: 'player', direction: { type: 'direction', value: dir } },
    id: uuid(),
  };
}

function evGetDirection(varId = '14') {
  return {
    command: 'EVENT_ACTOR_GET_DIRECTION',
    args: { actorId: 'player', direction: varId, '__collapse': true },
    id: uuid(),
  };
}

function evSetValue(variable, value) {
  return {
    command: 'EVENT_SET_VALUE',
    args: { variable, value: { type: 'number', value } },
    id: uuid(),
  };
}

// Set a variable to a named constant (by constant UUID).
function evSetValueConst(variable, constId) {
  return {
    command: 'EVENT_SET_VALUE',
    args: { variable, value: { type: 'constant', value: constId } },
    id: uuid(),
  };
}

function evFadeIn(speed = '2') {
  return { command: 'EVENT_FADE_IN', args: { speed }, id: uuid() };
}

function evComment(text) {
  return { command: 'EVENT_COMMENT', args: { text }, id: uuid() };
}

// 3 full rotations of the player sprite: down→left→up→right × 3
function spinSteps(framesPerStep = 3) {
  const dirs = ['down', 'left', 'up', 'right'];
  const steps = [];
  for (let i = 0; i < 3; i++) {
    for (const d of dirs) {
      steps.push(evSetDirection(d));
      steps.push(evWait(framesPerStep));
    }
  }
  return steps;
}

// Call warp_script_indoor from within a custom event, forwarding V0.
// Used by the spinning_warp script (spinner destinations are still per-WarpId).
function evCallWarpScriptForwardV0() {
  return {
    command: 'EVENT_CALL_CUSTOM_EVENT',
    args: { customEventId: WARP_SCRIPT_INDOOR_ID, '$variable[V0]$': { type: 'variable', value: 'V0' } },
    id: uuid(),
  };
}

// Call the Spinning Warp animation script (no argument — it no longer routes).
function evCallSpinningWarp() {
  return { command: 'EVENT_CALL_CUSTOM_EVENT', args: { customEventId: SPINNING_WARP_ID }, id: uuid() };
}

// Call a per-type warp router with a constant WarpId in V0.
function evCallRouter(routerId, warpId) {
  return {
    command: 'EVENT_CALL_CUSTOM_EVENT',
    args: { customEventId: routerId, '$variable[V0]$': { type: 'number', value: warpId } },
    id: uuid(),
  };
}

// Call a per-type warp router forwarding a variable (e.g. PendingWarpId) into V0.
function evCallRouterVar(routerId, varId) {
  return {
    command: 'EVENT_CALL_CUSTOM_EVENT',
    args: { customEventId: routerId, '$variable[V0]$': { type: 'variable', value: varId } },
    id: uuid(),
  };
}

// Call the generic LastMap exit resolver (no argument). Used by warp_input_*.
function evCallExitResolve() {
  return {
    command: 'EVENT_CALL_CUSTOM_EVENT',
    args: { customEventId: WARP_EXIT_RESOLVE_ID },
    id: uuid(),
  };
}

// ─────────────────────────────────────────────────────────────
// Trigger script builders
// ─────────────────────────────────────────────────────────────

// DOOR_CAVE: inline cooldown guard, then call the overworld warp router(WarpId).
function scriptDoorCave(warpId) {
  return [{
    command: 'EVENT_IF',
    args: {
      condition: {
        type: 'eq',
        valueA: { type: 'variable', value: '20' },
        valueB: { type: 'constant', value: WARP_COOLDOWN_OFF },
      },
      '__collapseElse': true,
    },
    children: {
      true: [
        { command: 'EVENT_SET_VALUE', args: { variable: '20', value: { type: 'constant', value: WARP_COOLDOWN_ON } }, id: uuid() },
        evCallRouter(WARP_SCRIPT_ID, warpId),
      ],
      false: [],
    },
    id: uuid(),
  }];
}

// Per-type EXIT input-handler registry: one Warp Input {dir} script per (type, dir),
// each forwarding PendingWarpId to that type's warp router. Memoised; written in Phase 4.
const inputScripts = {};
function getInputScript(type, dir) {
  const key = `${type}_${dir}`;
  if (!inputScripts[key]) {
    inputScripts[key] = { id: uuid(), symbol: `script_warp_input_${dir}_${type}`,
      name: `Warp Input ${dir[0].toUpperCase() + dir.slice(1)} ${titleCaseType(type)}`, type, dir };
  }
  return inputScripts[key];
}

// EXIT_*: store the WarpId in PendingWarpId (so the persistent input handler can read it),
// then call the per-type Warp Input {dir} handler, which routes through the type's Warp Script.
function scriptExit(exitDir, type, exitWarpId) {
  const input = getInputScript(type, exitDir);
  return [
    evSetValue(VAR_PENDING_WARP_ID, exitWarpId),
    { command: 'EVENT_CALL_CUSTOM_EVENT', args: { customEventId: input.id }, id: uuid() },
  ];
}

// leaveScript: remove the input handler for this direction
function leaveScriptExit(exitDir) {
  return [{
    command: 'EVENT_REMOVE_INPUT_SCRIPT',
    args: { input: [exitDir] },
    id: uuid(),
  }];
}

// SIMPLE: step on → guarded switch. The StairCooldown guard prevents the paired
// destination stair trigger (which the player spawns on) from bouncing them back.
// Routes through the source scene's per-type warp router (routerId) with a WarpId,
// instead of an inline Change Scene, so every stair uses its type's Warp Script.
function scriptSimpleRouted(warpId, routerId) {
  return [{
    command: 'EVENT_IF',
    args: {
      condition: {
        type: 'eq',
        valueA: { type: 'variable', value: VAR_STAIR_COOLDOWN },
        valueB: { type: 'constant', value: WARP_COOLDOWN_OFF },
      },
      '__collapseElse': true,
    },
    children: {
      true: [
        evSetValueConst(VAR_STAIR_COOLDOWN, WARP_COOLDOWN_ON),
        evCallRouter(routerId, warpId),
      ],
      false: [],
    },
    id: uuid(),
  }];
}

// leaveScript for SIMPLE stairs: clear StairCooldown when the player steps off
// the destination trigger, re-arming stairs. (Scene change does NOT run leave
// scripts — engine trigger_reset skips them — so the ON state survives the warp.)
function leaveScriptSimple() {
  return [evSetValueConst(VAR_STAIR_COOLDOWN, WARP_COOLDOWN_OFF)];
}

// SPINNER: play the Spinning Warp animation, THEN call the source scene's per-type
// warp router (routerId) with the WarpId — sequentially in the trigger. The Warp
// Script call lives here, not inside Spinning Warp.
function scriptSpinner(warpId, routerId) {
  return [
    evCallSpinningWarp(),
    evCallRouter(routerId, warpId),
  ];
}

// ─────────────────────────────────────────────────────────────
// Trigger file builder
// ─────────────────────────────────────────────────────────────
function makeTrigger(name, x, y, w, h, script, leaveScript = []) {
  return {
    _resourceType: 'trigger',
    id: uuid(),
    name,
    prefabId: '',
    x, y,
    symbol: `trigger_${slugify(name)}`,
    prefabScriptOverrides: {},
    width: w, height: h,
    script,
    leaveScript,
    _index: 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Warp script builder: pure WarpId→scene router (no cooldown).
// Chained EVENT_SWITCH (16 cases each) in a nested false-branch chain.
// ─────────────────────────────────────────────────────────────
function buildSwitchChain(cases) {
  const batches = [];
  for (let i = 0; i < cases.length; i += 16) batches.push(cases.slice(i, i + 16));

  function buildChain(idx) {
    if (idx >= batches.length) return null;
    const batch   = batches[idx];
    const hasMore = idx + 1 < batches.length;
    const args = { variable: 'V0', choices: batch.length, '__collapseElse': !hasMore };
    for (let i = 0; i < batch.length; i++) {
      args[`value${i}`]        = { type: 'number', value: batch[i].warpId };
      args[`__collapseCase${i}`] = false;
    }
    const children = {};
    for (let i = 0; i < batch.length; i++) {
      const c = batch[i];
      children[`true${i}`] = [
        evComment(`WarpId ${c.warpId} → ${c.comment}`),
        evSwitchScene(c.sceneId, c.x, c.y, c.direction),
      ];
    }
    if (hasMore) { const next = buildChain(idx + 1); if (next) children.false = [next]; }
    return { command: 'EVENT_SWITCH', args, children, id: uuid() };
  }

  return cases.length ? buildChain(0) : null;
}

// ENTRY script: overworld → indoor DOOR_CAVE warps. Called by overworld triggers (inline cooldown guard).
function buildWarpScriptEntry(cases) {
  const node = buildSwitchChain(cases);
  return {
    _resourceType: 'script',
    id: WARP_SCRIPT_ID,
    name: 'Warp Script',
    description: 'Entry warp router. Routes WarpId (V0) to indoor destination via chained EVENT_SWITCH (16 cases each). Covers DOOR_CAVE building/cave entries from overworld. WarpCooldown guard is in the trigger, not here.',
    variables: { V0: { id: 'V0', name: 'WarpId', passByReference: false } },
    actors: {},
    symbol: 'script_warp',
    script: node ? [node] : [],
  };
}

// INDOOR script: SPINNER (same-scene) warps only.
// (EXIT warps are now resolved generically by warp_exit_resolve via LastMap.)
// Called by the spinning_warp custom script.
function buildWarpScriptIndoor(cases) {
  const node = buildSwitchChain(cases);
  return {
    _resourceType: 'script',
    id: WARP_SCRIPT_INDOOR_ID,
    name: 'Warp Script Indoor',
    description: 'Indoor warp router. Routes WarpId (V0) to a same-scene SPINNER teleport destination via chained EVENT_SWITCH (16 cases each). Called by the spinning_warp script. EXIT (indoor→overworld) warps are handled by warp_exit_resolve.',
    variables: { V0: { id: 'V0', name: 'WarpId', passByReference: false } },
    actors: {},
    symbol: 'script_warp_indoor',
    script: node ? [node] : [],
  };
}

// EXIT resolver: generic indoor→overworld return (pokered wLastMap model).
// Switches on LastMap (var24) → Change Scene to that overworld scene using the
// stored return coordinates (LastWarpX/var25, LastWarpY/var26). One static case
// per distinct exit-target overworld scene; coordinates are dynamic.
// exitTargets: [{ index, sceneId, slug }] ordered by index.
function buildWarpExitResolve(exitTargets) {
  const batches = [];
  for (let i = 0; i < exitTargets.length; i += 16) batches.push(exitTargets.slice(i, i + 16));

  function buildChain(idx) {
    if (idx >= batches.length) return null;
    const batch   = batches[idx];
    const hasMore = idx + 1 < batches.length;
    const args = { variable: VAR_LAST_MAP, choices: batch.length, '__collapseElse': !hasMore };
    for (let i = 0; i < batch.length; i++) {
      args[`value${i}`]          = { type: 'number', value: batch[i].index };
      args[`__collapseCase${i}`] = false;
    }
    const children = {};
    for (let i = 0; i < batch.length; i++) {
      const t = batch[i];
      children[`true${i}`] = [
        evComment(`LastMap ${t.index} → ${t.slug}`),
        evSwitchSceneVarCoords(t.sceneId, VAR_LAST_X, VAR_LAST_Y, 'down'),
      ];
    }
    if (hasMore) { const next = buildChain(idx + 1); if (next) children.false = [next]; }
    return { command: 'EVENT_SWITCH', args, children, id: uuid() };
  }

  const node = exitTargets.length ? buildChain(0) : null;
  // Set WarpCooldown ON before warping out: on overworld arrival the player lands
  // ON the door tile and the door trigger fires on frame 1 (before post_fadein
  // steps them off). The cooldown blocks that re-entry. post_fadein then clears it.
  // Required because indoor scenes now reset WarpCooldown via post_fadein, so it no
  // longer persists through the visit on its own.
  const script = [evSetValueConst(VAR_WARP_COOLDOWN, WARP_COOLDOWN_ON)];
  if (node) script.push(node);
  return {
    _resourceType: 'script',
    id: WARP_EXIT_RESOLVE_ID,
    name: 'Warp Exit Resolve',
    description: 'Generic indoor→overworld exit resolver (pokered wLastMap model). Sets WarpCooldown ON (blocks the destination door re-entry on arrival), then switches on LastMap (var27) to the overworld scene the player entered from, spawning at the stored return position (LastWarpX var25, LastWarpY var26). Replaces per-building EXIT warp cases.',
    variables: {},
    actors: {},
    symbol: 'script_warp_exit_resolve',
    script,
  };
}

// ─────────────────────────────────────────────────────────────
// Warp Input {dir} custom script builder
// Handles EXIT trigger behavior: unlock → debounce → check input →
// check facing direction → call warp_script(V0).
// ─────────────────────────────────────────────────────────────
function buildWarpInputScript(id, name, symbol, dir, routerId) {
  const dirConst = DIR_CONST[dir];

  function makeCheck() {
    return [
      evGetDirection(),
      {
        command: 'EVENT_IF',
        args: {
          condition: {
            type: 'eq',
            valueA: { type: 'variable', value: '14' },
            valueB: { type: 'constant', value: dirConst },
          },
          '__collapseElse': true,
        },
        children: {
          // Block the destination door from re-firing on arrival (post_fadein clears it),
          // then route through this type's Warp Script using the stored PendingWarpId.
          true: [
            evSetValueConst(VAR_WARP_COOLDOWN, WARP_COOLDOWN_ON),
            evCallRouterVar(routerId, VAR_PENDING_WARP_ID),
          ],
          false: [],
        },
        id: uuid(),
      },
    ];
  }

  return {
    _resourceType: 'script',
    id,
    name,
    description: `EXIT trigger behavior for ${dir} exits. Unlocks the script, waits 4 frames, checks ${dir.toUpperCase()} input and player facing direction, then routes through this scene type's Warp Script (PendingWarpId → router) to switch scene. Also installs a persistent input handler for continuous detection.`,
    variables: {},
    actors: {},
    symbol,
    script: [
      evScriptUnlock(),
      evWait(4),
      {
        command: 'EVENT_IF_INPUT',
        args: { input: [dir], '__collapseElse': true },
        children: { true: makeCheck(), false: [] },
        id: uuid(),
      },
      {
        command: 'EVENT_SET_INPUT_SCRIPT',
        args: { input: [dir], override: false, '__scriptTabs': 'press' },
        children: { true: makeCheck() },
        id: uuid(),
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Spinning Warp custom script builder
// Plays 3-rotation spin animation, signals spinner arrival (var23=1),
// then calls warp_script(V0) to teleport to destination.
// ─────────────────────────────────────────────────────────────
function buildSpinningWarpScript() {
  return {
    _resourceType: 'script',
    id: SPINNING_WARP_ID,
    name: 'Spinning Warp',
    description: 'Spinner telepad departure animation: plays a 3-rotation spin (down→left→up→right × 3) and sets WarpType (var23)=1 to signal spinner arrival. The destination Warp Script is called AFTER this, sequentially in the spinner trigger — not from here.',
    variables: {},
    actors: {},
    symbol: 'script_spinning_warp',
    script: [
      evComment('SPINNING WARP: 3-rotation departure spin'),
      ...spinSteps(3),
      evSetValue(VAR_WARP_TYPE, 1),
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Build the spinner-pad Metatile Enter handler body:
//   1. EVENT_GET_META_TILE_AT_POS (PlayerX=var12, PlayerY=var13) → var0
//   2. EVENT_IF var0 == METATILEIDS/FACILITY/SPECIAL_3 (id 60, the warp pad):
//      → nested X→Y switch → [Spinning Warp animation, FACILITY router(WarpId)]
// ─────────────────────────────────────────────────────────────
function buildSaffronSpinnerSwitch(spinners) {
  const byX = {};
  for (const s of spinners) {
    if (!byX[s.x]) byX[s.x] = [];
    byX[s.x].push(s);
  }
  const xVals = Object.keys(byX).map(Number).sort((a, b) => a - b);

  const xArgs = { variable: '12', choices: xVals.length, '__collapseElse': true };
  for (let i = 0; i < 16; i++) xArgs[`__collapseCase${i}`] = false;
  for (let i = 0; i < xVals.length; i++) xArgs[`value${i}`] = { type: 'number', value: xVals[i] };

  const xChildren = {};
  for (let i = 0; i < xVals.length; i++) {
    const yEntries = byX[xVals[i]].sort((a, b) => a.y - b.y);
    const yArgs = { variable: '13', choices: yEntries.length, '__collapseElse': true };
    for (let j = 0; j < 16; j++) yArgs[`__collapseCase${j}`] = false;
    for (let j = 0; j < yEntries.length; j++) yArgs[`value${j}`] = { type: 'number', value: yEntries[j].y };
    const yChildren = {};
    for (let j = 0; j < yEntries.length; j++) {
      // Spinning Warp animation, then the FACILITY router (e2000001) — sequentially.
      yChildren[`true${j}`] = [
        evCallSpinningWarp(),
        evCallRouter(WARP_SCRIPT_INDOOR_ID, yEntries[j].warpId),
      ];
    }
    xChildren[`true${i}`] = [{ command: 'EVENT_SWITCH', args: yArgs, children: yChildren, id: uuid() }];
  }

  const positionSwitch = { command: 'EVENT_SWITCH', args: xArgs, children: xChildren, id: uuid() };

  // Detect the actual spinning-warp pad tile: METATILEIDS/FACILITY/SPECIAL_3 (id 60).
  const conditionValue = { type: 'constant', value: FACILITY_SPECIAL_3_CONST_ID };

  return [
    {
      command: 'EVENT_GET_META_TILE_AT_POS',
      args: { x: { type: 'variable', value: '12' }, y: { type: 'variable', value: '13' }, output: '0' },
      id: uuid(),
    },
    {
      command: 'EVENT_IF',
      args: {
        condition: { type: 'eq', valueA: { type: 'variable', value: '0' }, valueB: conditionValue },
        '__collapseElse': true,
      },
      children: { true: [positionSwitch], false: [] },
      id: uuid(),
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// Build the FACILITY spinner-detection block injected into init_overworld's
// Metatile Enter (event 0) handler. Gated by MetatileType (var21) so only
// FACILITY scenes ever test the FACILITY_SPINNING_WARP metatile id:
//   SWITCH var21 == FACILITY:
//     get player position (var12,var13)
//     get metatile there → var0
//     IF var0 == FACILITY_SPINNING_WARP(31): X/Y position switch → spinning_warp
// Returned as a single element with a STABLE id (SPINNER_INJECT_ID) so re-runs
// can locate and replace it idempotently.
// ─────────────────────────────────────────────────────────────
function buildFacilitySpinnerInject(saffronSpinners) {
  const facilityBranch = [
    evGetPosition('$self$', '12', '13'),
    ...buildSaffronSpinnerSwitch(saffronSpinners),  // GET_META_TILE_AT_POS + IF==31 → X/Y switch
  ];

  return {
    command: 'EVENT_SWITCH',
    args: {
      variable: '21',
      choices: 1,
      value0: { type: 'constant', value: FACILITY_TYPE_CONST_ID },
      '__collapseElse': true,
      '__collapseCase0': false,
    },
    children: { true0: facilityBranch },
    id: SPINNER_INJECT_ID,
  };
}

// ─────────────────────────────────────────────────────────────
// Inject the FACILITY spinner-detection block into init_overworld_script's
// existing "Metatile Enter" (metatile_event "0") handler. Idempotent: removes
// any prior injected block (by SPINNER_INJECT_ID) before appending the fresh one.
// ─────────────────────────────────────────────────────────────
function injectSpinnerIntoInitOverworld(saffronSpinners) {
  const file = path.join(SCRIPTS_DIR, 'init_overworld_script.gbsres');
  if (!fs.existsSync(file)) { console.log('  WARN: init_overworld_script.gbsres not found'); return; }
  const script = JSON.parse(fs.readFileSync(file, 'utf8'));

  const enterHandler = (script.script || []).find(e =>
    e.command === 'PM_EVENT_METATILE_SCRIPT' && e.args && e.args.metatile_event === '0');
  if (!enterHandler || !enterHandler.children || !enterHandler.children.script) {
    console.log('  WARN: init_overworld_script has no Metatile Enter (event 0) handler');
    return;
  }

  // Remove any previously injected block, then append the fresh one.
  enterHandler.children.script = enterHandler.children.script.filter(e => e.id !== SPINNER_INJECT_ID);
  enterHandler.children.script.push(buildFacilitySpinnerInject(saffronSpinners));

  writeFile(file, script);
  console.log(`  Injected FACILITY spinner detection (${saffronSpinners.length} pads) into init_overworld Metatile Enter.`);
}

// ─────────────────────────────────────────────────────────────
// Build the spinner arrival EVENT_IF block used by saffron_gym.
// var23==1 means the player arrived via a spinning warp.
// ─────────────────────────────────────────────────────────────
function buildSpinnerArrivalEvents() {
  return [{
    command: 'EVENT_IF',
    args: {
      condition: {
        type: 'eq',
        valueA: { type: 'variable', value: VAR_WARP_TYPE },
        valueB: { type: 'number', value: 1 },
      },
      '__collapseElse': false,
    },
    children: {
      true: [
        evSetValue(VAR_WARP_TYPE, 0),
        evFadeIn('2'),
        evComment('Spinner arrival: spin while descending'),
        ...spinSteps(3),
      ],
      false: [evFadeIn('2')],
    },
    id: uuid(),
  }];
}

// ─────────────────────────────────────────────────────────────
// Update ALL indoor scene init scripts to the unified pattern (same as the
// overworld scenes): LOAD_META_TILES → SET var21 (MetatileType) →
// CALL init_overworld → FADE_IN → CALL post_fadein. The spinner detection now
// lives in init_overworld (gated by var21 == FACILITY), so indoor scenes no
// longer call a separate init_indoor script.
//   saffron_gym: the FADE_IN is replaced by the WarpType==1 spinner-arrival
//   block (which fades internally), with post_fadein still appended.
// Idempotent: rebuilds the init from LOAD_META_TILES + canonical events, dropping
// any warp-scaffolding events injected on a prior run; unknown events are kept.
// ─────────────────────────────────────────────────────────────
function isWarpScaffoldingEvent(e) {
  if (e.command === 'EVENT_LOAD_META_TILES') return true;
  if (e.command === 'PM_EVENT_METATILE_SCRIPT') return true;       // legacy init_indoor handler
  if (e.command === 'EVENT_FADE_IN') return true;
  if (e.command === 'EVENT_SET_VALUE' && e.args && e.args.variable === '21') return true;
  if (e.command === 'EVENT_CALL_CUSTOM_EVENT' && e.args &&
      [INIT_INDOOR_SCRIPT_ID, INIT_OVERWORLD_ID, POST_FADEIN_ID].includes(e.args.customEventId)) return true;
  // saffron spinner-arrival IF (condition on WarpType / var23)
  if (e.command === 'EVENT_IF' && e.args && e.args.condition &&
      e.args.condition.valueA && e.args.condition.valueA.value === VAR_WARP_TYPE) return true;
  return false;
}

function updateAllIndoorScenes(saffronSpinners) {
  let updated = 0;
  let skipped = 0;
  for (const [slug] of Object.entries(INDOOR_SCENES)) {
    const sceneFile = path.join(SCENES_DIR, slug, 'scene.gbsres');
    if (!fs.existsSync(sceneFile)) { skipped++; continue; }
    const scene = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));

    const loadMetaTiles = scene.script.find(e => e.command === 'EVENT_LOAD_META_TILES');
    if (!loadMetaTiles) {
      console.log(`  WARN ${slug}: no EVENT_LOAD_META_TILES, skipping`);
      skipped++;
      continue;
    }

    const typeConstId = METATILE_SCENE_ID_TO_TYPE_CONST[loadMetaTiles.args.sceneId];
    if (!typeConstId) {
      console.log(`  WARN ${slug}: unknown metatile scene ${loadMetaTiles.args.sceneId}, skipping`);
      skipped++;
      continue;
    }

    const evSetVar21       = evSetValueConst('21', typeConstId);
    const evCallInitOW     = { command: 'EVENT_CALL_CUSTOM_EVENT', args: { customEventId: INIT_OVERWORLD_ID }, id: uuid() };
    const evCallPostFadein = { command: 'EVENT_CALL_CUSTOM_EVENT', args: { customEventId: POST_FADEIN_ID }, id: uuid() };
    const otherRest = scene.script.filter(e => !isWarpScaffoldingEvent(e));

    const middle = (slug === 'saffron_gym')
      ? buildSpinnerArrivalEvents()   // fades internally
      : [evFadeIn('2')];

    scene.script = [loadMetaTiles, evSetVar21, evCallInitOW, ...middle, evCallPostFadein, ...otherRest];
    writeFile(sceneFile, scene);
    updated++;
  }
  console.log(`  Updated ${updated} indoor scenes (init_overworld + post_fadein), skipped ${skipped}.`);
}

// ─────────────────────────────────────────────────────────────
// Update variables.gbsres to add WarpType (var23) if missing
// ─────────────────────────────────────────────────────────────
function ensureWarpTypeVariable() {
  const varFile = path.join(PROJECT_ROOT, 'project', 'variables.gbsres');
  if (!fs.existsSync(varFile)) return;
  const data = JSON.parse(fs.readFileSync(varFile, 'utf8'));

  // Ensure WarpType + LastMap return variables (idempotent).
  const ensureVar = (id, name, symbol) => {
    if (!data.variables.find(v => v.id === id)) {
      data.variables.push({ id, name, symbol });
      console.log(`  Added var${id} = ${name}`);
    } else {
      console.log(`  var${id} (${name}) already exists.`);
    }
  };
  ensureVar(VAR_WARP_TYPE,      'WarpType',      'var_warptype');
  ensureVar(VAR_LAST_MAP,       'LastMap',       'var_lastmap');
  ensureVar(VAR_LAST_X,         'LastWarpX',     'var_lastwarpx');
  ensureVar(VAR_LAST_Y,         'LastWarpY',     'var_lastwarpy');
  ensureVar(VAR_STAIR_COOLDOWN, 'StairCooldown', 'var_staircooldown');

  // METATILETYPES constants for every pokered indoor metatile scene.
  // OVERWORLD=0 and PLATEAU=1 already exist; new scenes get 2-18.
  const METATILE_SCENE_TYPES = [
    // name, value, stable-id-suffix
    ['METATILETYPES/CAVERN',     2,  'f3000001'],
    ['METATILETYPES/CEMETERY',   3,  'f3000002'],
    ['METATILETYPES/CLUB',       4,  'f3000003'],
    ['METATILETYPES/FACILITY',   5,  'f3000004'],
    ['METATILETYPES/FOREST',     6,  'f3000005'],
    ['METATILETYPES/GATE',       7,  'f3000006'],
    ['METATILETYPES/GYM',        8,  'f3000007'],
    ['METATILETYPES/HOUSE',      9,  'f3000008'],
    ['METATILETYPES/INTERIOR',   10, 'f3000009'],
    ['METATILETYPES/LAB',        11, 'f300000a'],
    ['METATILETYPES/LOBBY',      12, 'f300000b'],
    ['METATILETYPES/MANSION',    13, 'f300000c'],
    ['METATILETYPES/POKECENTER', 14, 'f300000d'],
    ['METATILETYPES/REDS_HOUSE', 15, 'f300000e'],
    ['METATILETYPES/SHIP',       16, 'f300000f'],
    ['METATILETYPES/SHIP_PORT',  17, 'f3000010'],
    ['METATILETYPES/UNDERGROUND',18, 'f3000011'],
  ];

  for (const [name, value, suffix] of METATILE_SCENE_TYPES) {
    const constId = `b001-0000-0000-0000-0000${suffix}`;
    if (!data.constants.find(c => c.id === constId)) {
      data.constants.push({ id: constId, name, value });
      console.log(`  Added constant ${name} = ${value}`);
    } else {
      console.log(`  Constant ${name} already exists.`);
    }
  }

  // METATILEIDS/FACILITY_SPINNING_WARP = 31 (warp pad metatile in FACILITY scene)
  const FACILITY_WARP_PAD_CONST_ID = 'b001-0000-0000-0000-0000f4000001';
  if (!data.constants.find(c => c.id === FACILITY_WARP_PAD_CONST_ID)) {
    data.constants.push({ id: FACILITY_WARP_PAD_CONST_ID, name: 'METATILEIDS/FACILITY_SPINNING_WARP', value: FACILITY_SPINNING_WARP_METATILE_ID });
    console.log(`  Added constant METATILEIDS/FACILITY_SPINNING_WARP = ${FACILITY_SPINNING_WARP_METATILE_ID}`);
  } else {
    console.log('  Constant METATILEIDS/FACILITY_SPINNING_WARP already exists.');
  }

  writeFile(varFile, data);
  return FACILITY_WARP_PAD_CONST_ID;
}

// ─────────────────────────────────────────────────────────────
// Per-type warp router helpers (source-type split)
// ─────────────────────────────────────────────────────────────
// Read the stable router id+symbol for each type from its on-disk
// scripts/<type>/warp_script.gbsres (created by split_warp_routers_by_type.js).
function readPerTypeRouterIds() {
  const out = {};
  for (const t of WARP_ROUTER_TYPES) {
    const f = path.join(SCRIPTS_DIR, t, 'warp_script.gbsres');
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      out[t] = { id: j.id, symbol: j.symbol || `script_warp_${t}` };
    } else {
      out[t] = { id: uuid(), symbol: `script_warp_${t}` };
    }
  }
  return out;
}

// Resolve a scene slug's metatile type via its EVENT_LOAD_META_TILES source scene.
function srcTypeOfSlug(slug) {
  const f = path.join(SCENES_DIR, slug, 'scene.gbsres');
  if (!fs.existsSync(f)) return null;
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  const lm = (s.script || []).find(e => e.command === 'EVENT_LOAD_META_TILES');
  if (!lm || !lm.args) return null;
  return TYPE_CONST_TO_NAME[METATILE_SCENE_ID_TO_TYPE_CONST[lm.args.sceneId]] || null;
}

function titleCaseType(t) { return t.split('_').map(s => s[0].toUpperCase() + s.slice(1)).join(' '); }

function buildWarpRouter(meta, cases) {
  const node = buildSwitchChain(cases);
  return {
    _resourceType: 'script',
    id: meta.id,
    name: `${titleCaseType(meta.type)}/Warp Script`,
    description: `Source-type warp router for ${meta.type.toUpperCase()} scenes. Routes WarpId (V0) to its destination via chained EVENT_SWITCH (16 cases each). ${cases.length} case(s).`,
    variables: { V0: { id: 'V0', name: 'WarpId', passByReference: false } },
    actors: {},
    symbol: meta.symbol,
    script: node ? [node] : [],
  };
}

// Write one router per source type to scripts/<type>/warp_script.gbsres, grouping
// warpCases by their srcType. Empty types get an empty (scaffold) router.
function writePerTypeRouters(warpCases, routerIds) {
  const bySrc = {};
  for (const t of WARP_ROUTER_TYPES) bySrc[t] = [];
  for (const c of warpCases) {
    const t = (c.srcType && bySrc[c.srcType]) ? c.srcType : 'overworld';
    bySrc[t].push(c);
  }
  for (const t of WARP_ROUTER_TYPES) {
    const dir = path.join(SCRIPTS_DIR, t);
    if (!fs.existsSync(dir) && !DRY_RUN) fs.mkdirSync(dir, { recursive: true });
    writeFile(path.join(dir, 'warp_script.gbsres'),
      buildWarpRouter({ type: t, id: routerIds[t].id, symbol: routerIds[t].symbol }, bySrc[t]));
    if (bySrc[t].length) console.log(`  scripts/${t}/warp_script.gbsres: ${bySrc[t].length} case(s)`);
  }
  // spinning_warp forwards V0 to the facility router id only; warn if a spinner is
  // sourced from a non-facility scene (would land in a router spinning_warp never calls).
  const badSpin = warpCases.filter(c => c.comment.startsWith('SPINNER') && c.srcType !== 'facility');
  if (badSpin.length) console.log(`  WARN: ${badSpin.length} SPINNER case(s) not facility-sourced — spinning_warp only routes to the facility router.`);
}

// Inject the FACILITY spinner-pad detection into the per-type FACILITY init script's
// "Metatile Enter" (event 0) handler, creating that handler if absent. Idempotent by
// SPINNER_INJECT_ID. Replaces the old injectSpinnerIntoInitOverworld (which targeted the
// now-retired shared init); init/post wiring is owned by gen_metatile_type_scripts.js.
function injectSpinnerIntoFacilityInit(saffronSpinners) {
  const file = path.join(SCRIPTS_DIR, 'facility', 'init_script.gbsres');
  if (!fs.existsSync(file)) { console.log('  WARN: facility/init_script.gbsres not found — skipping spinner inject'); return; }
  const script = JSON.parse(fs.readFileSync(file, 'utf8'));
  script.script = script.script || [];

  let enter = script.script.find(e =>
    e.command === 'PM_EVENT_METATILE_SCRIPT' && e.args && e.args.metatile_event === '0');
  if (!enter) {
    enter = { command: 'PM_EVENT_METATILE_SCRIPT',
      args: { metatile_event: '0', __scriptTabs: 'scriptinput', __collapse: true },
      children: { script: [] }, id: uuid() };
    script.script.push(enter);
  }
  enter.children.script = (enter.children.script || []).filter(e => e.id !== SPINNER_INJECT_ID);
  enter.children.script.push(buildFacilitySpinnerInject(saffronSpinners));

  writeFile(file, script);
  console.log(`  Injected FACILITY spinner detection (${saffronSpinners.length} pads) into facility/init_script Metatile Enter.`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
function main() {
  const routerIds = readPerTypeRouterIds();
  const CONST_TO_PASCAL = buildConstToPascalMap();
  const sceneIds        = buildSceneIdMap();

  const overworldPascals = new Set(Object.values(OVERWORLD_SCENES).map(v => v.map));
  const indoorPascals    = new Set(Object.values(INDOOR_SCENES).filter(Boolean));

  // ── Phase 0: Delete all existing triggers ──
  console.log('\n=== Phase 0: Delete all triggers ===');
  deleteAllTriggers();

  // ── Phase 1: Build LAST_MAP reverse lookup ──
  // lastMapReverse[indoorPascal][warpIdx] = [{owSlug, owGbsX, owGbsY}]
  console.log('\n=== Phase 1: Build LAST_MAP reverse lookup ===');
  const lastMapReverse = {};

  for (const [owSlug, owInfo] of Object.entries(OVERWORLD_SCENES)) {
    const owPascal = owInfo.map;
    for (const w of parseWarps(owPascal)) {
      const destPascal = CONST_TO_PASCAL[w.destConst];
      if (!destPascal) continue;
      if (!indoorPascals.has(destPascal)) continue;

      const src = resolveSlug(owPascal, w.x * 2, w.y * 2);
      if (!src || src.slug !== owSlug) continue;

      if (!lastMapReverse[destPascal]) lastMapReverse[destPascal] = {};
      if (!lastMapReverse[destPascal][w.destWarpId]) lastMapReverse[destPascal][w.destWarpId] = [];
      lastMapReverse[destPascal][w.destWarpId].push({
        owSlug: src.slug,
        owGbsX: src.localX,
        owGbsY: src.localY,
      });
    }
  }
  console.log(`  Reverse map built for ${Object.keys(lastMapReverse).length} indoor maps.`);

  // ── Phase 2: Overworld → Indoor (DOOR_CAVE entries + EXIT_* exits) ──
  console.log('\n=== Phase 2: Overworld → Indoor warps ===');

  let nextWarpId    = FIRST_BUILDING_WARP_ID;
  const warpCases   = [];   // for warp_script (all types)
  let triggerCount  = 0;

  // Track created indoor exit triggers to avoid duplicates
  const createdIndoorExits = new Set();

  // Registry of distinct overworld return scenes for the LastMap exit resolver.
  // Each gets a stable index (the LastMap value stored at DOOR_CAVE entry).
  const exitTargets = [];                 // [{ index, sceneId, slug }]
  const exitTargetIndexBySlug = new Map();
  function getExitTargetIndex(slug, sceneId) {
    if (exitTargetIndexBySlug.has(slug)) return exitTargetIndexBySlug.get(slug);
    const index = exitTargets.length;
    exitTargets.push({ index, sceneId, slug });
    exitTargetIndexBySlug.set(slug, index);
    return index;
  }

  for (const [owSlug, owInfo] of Object.entries(OVERWORLD_SCENES)) {
    const owPascal = owInfo.map;
    const owWarps  = parseWarps(owPascal);
    if (!owWarps.length) continue;

    const owScene = sceneIds[owSlug];
    if (!owScene) continue;

    for (const w of owWarps) {
      const destPascal = CONST_TO_PASCAL[w.destConst];
      if (!destPascal || !indoorPascals.has(destPascal)) continue;

      const destEntry = PASCAL_TO_SLUG[destPascal];
      if (!destEntry || destEntry.isSplit) continue;

      const indoorSlug = destEntry.slug;
      const indoorScene = sceneIds[indoorSlug];
      if (!indoorScene) continue;

      // Source position in GBS coordinates
      const src = resolveSlug(owPascal, w.x * 2, w.y * 2);
      if (!src || src.slug !== owSlug) continue;

      // Indoor spawn position (where player appears in indoor scene)
      const indoorWarps = parseWarps(destPascal);
      const indoorWarp  = indoorWarps[w.destWarpId - 1];
      if (!indoorWarp) {
        console.log(`  WARN: ${destPascal} has no warp #${w.destWarpId} (needed by ${owPascal})`);
        continue;
      }
      const spawnX = indoorWarp.x * 2;
      const spawnY = indoorWarp.y * 2;

      // ─── Resolve overworld return target (where exiting the building lands) ───
      // Computed per entry so each door records its own return point (LastMap).
      const exitDir = determineExitDirection(spawnX, spawnY, indoorScene.width, indoorScene.height);
      const spawn   = computeOverworldExitSpawn(src.localX, src.localY, exitDir);
      const owDest  = resolveSlug(owPascal, spawn.x, spawn.y);
      if (!owDest) { console.log(`  WARN: can't resolve overworld return for ${indoorSlug} (from ${owSlug}), skipping`); continue; }
      const owDestScene = sceneIds[owDest.slug];
      if (!owDestScene) { console.log(`  WARN: no scene for return ${owDest.slug}, skipping`); continue; }

      // ─── Assign WarpId for DOOR_CAVE entry ───
      const entryWarpId = nextWarpId++;

      // ─── Create DOOR_CAVE overworld entry trigger ───
      const entryName = `${indoorSlug}_${entryWarpId}`;
      const entryFile = path.join(SCENES_DIR, owSlug, 'triggers', `${slugify(entryName)}.gbsres`);
      writeFile(entryFile, makeTrigger(
        `Entry to ${indoorSlug}`,
        src.localX, src.localY, 2, 2,
        scriptDoorCave(entryWarpId),
      ));
      triggerCount++;

      // ─── Add DOOR_CAVE (ENTRY) case to the overworld router ───
      warpCases.push({
        warpId: entryWarpId,
        sceneId: indoorScene.id,
        x: spawnX, y: spawnY,
        direction: 'down',
        srcType: 'overworld',   // DOOR_CAVE doors live in the overworld source scene
        comment: `ENTRY ${indoorSlug} (${spawnX},${spawnY})`,
      });

      console.log(`  ENTRY ${owSlug} (${src.localX},${src.localY}) → WarpId ${entryWarpId} → ${indoorSlug} spawn (${spawnX},${spawnY}); return ${owDest.slug} (${owDest.localX},${owDest.localY})`);

      // ─── Create EXIT indoor exit trigger (deduplicated; static per-type routing) ───
      const exitKey = `${indoorSlug}:${w.destWarpId}`;
      if (createdIndoorExits.has(exitKey)) continue;
      createdIndoorExits.add(exitKey);

      const exitType    = srcTypeOfSlug(indoorSlug) || 'overworld';
      const exitWarpId  = nextWarpId++;
      // EXIT destination is the overworld return scene + coords, as a static case in
      // the indoor scene type's own router.
      warpCases.push({
        warpId: exitWarpId,
        sceneId: owDestScene.id,
        x: owDest.localX, y: owDest.localY,
        direction: 'down',
        srcType: exitType,
        comment: `EXIT ${indoorSlug} → ${owDest.slug} (${owDest.localX},${owDest.localY})`,
      });

      const exitName = `exit_to_${owDest.slug}_${w.destWarpId}`;
      const exitFile = path.join(SCENES_DIR, indoorSlug, 'triggers', `${slugify(exitName)}.gbsres`);
      writeFile(exitFile, makeTrigger(
        `Exit to ${owDest.slug}`,
        spawnX, spawnY, 2, 2,
        scriptExit(exitDir, exitType, exitWarpId),
        leaveScriptExit(exitDir),
      ));
      triggerCount++;
      console.log(`  EXIT ${indoorSlug}[${exitType}] (${spawnX},${spawnY}) dir:${exitDir} → ${owDest.slug} (${owDest.localX},${owDest.localY}) WarpId ${exitWarpId}`);
    }
  }

  // ── Phase 3: Indoor → Indoor (SIMPLE stairs + SPINNER pads) ──
  console.log('\n=== Phase 3: Indoor stairways and spinners ===');

  const processedStairs = new Set();
  const saffronSpinners = [];  // {x, y, warpId} for metatile-based detection

  for (const [slug, pascal] of Object.entries(INDOOR_SCENES)) {
    const scene = sceneIds[slug];
    if (!scene) continue;

    const warps = parseWarps(pascal);
    if (!warps.length) continue;

    for (const w of warps) {
      if (w.destConst === 'LAST_MAP') continue;

      const destPascal = CONST_TO_PASCAL[w.destConst];
      if (!destPascal) {
        console.log(`  UNKNOWN const ${w.destConst} in ${pascal}`);
        continue;
      }

      const srcX = w.x * 2;
      const srcY = w.y * 2;
      const isSpinner = (destPascal === pascal) || SPINNER_MAPS.has(pascal);

      if (isSpinner) {
        // ─── SPINNER warp (same-scene teleport) ───
        const destWarp = warps[w.destWarpId - 1];
        if (!destWarp) {
          console.log(`  WARN spinner: ${pascal} has no warp #${w.destWarpId}`);
          continue;
        }
        const destX = destWarp.x * 2;
        const destY = destWarp.y * 2;

        const spinKey = `${slug}:${srcX}:${srcY}:${destX}:${destY}`;
        if (processedStairs.has(spinKey)) continue;
        processedStairs.add(spinKey);

        // ─── Assign WarpId for SPINNER ───
        const spinWarpId = nextWarpId++;

        // ─── Add SPINNER case to warp_script ───
        warpCases.push({
          warpId: spinWarpId,
          sceneId: scene.id,
          x: destX, y: destY,
          direction: 'down',
          srcType: srcTypeOfSlug(slug) || 'facility',   // spinner pad's own scene type
          comment: `SPINNER ${slug} → (${destX},${destY})`,
        });

        if (slug === 'saffron_gym') {
          // Saffron Gym: skip individual triggers (would exceed 30-trigger limit).
          // Instead, collect positions for metatile-based detection in the scene init script.
          saffronSpinners.push({ x: srcX, y: srcY, warpId: spinWarpId });
          console.log(`  SPINNER(metatile) ${slug} (${srcX},${srcY}) → (${destX},${destY}) WarpId ${spinWarpId}`);
        } else {
          const spinRouterId = routerIds[srcTypeOfSlug(slug) || 'facility'].id;
          const spinFile = path.join(SCENES_DIR, slug, 'triggers', `${slugify(`spinner_${srcX}_${srcY}`)}.gbsres`);
          writeFile(spinFile, makeTrigger(
            `Spinner ${srcX},${srcY}`,
            srcX, srcY, 2, 2,
            scriptSpinner(spinWarpId, spinRouterId),
          ));
          triggerCount++;
          console.log(`  SPINNER ${slug} (${srcX},${srcY}) → (${destX},${destY}) WarpId ${spinWarpId}`);
        }
        continue;
      }

      // ─── SIMPLE stairway (indoor → different indoor) ───
      const destEntry = PASCAL_TO_SLUG[destPascal];
      if (!destEntry || destEntry.isSplit) continue;
      if (overworldPascals.has(destPascal)) continue;
      if (!indoorPascals.has(destPascal)) continue;

      const destSlug  = destEntry.slug;
      const destScene = sceneIds[destSlug];
      if (!destScene) continue;

      const destWarps = parseWarps(destPascal);
      const destWarp  = destWarps[w.destWarpId - 1];
      if (!destWarp) {
        console.log(`  WARN stair: ${destPascal} has no warp #${w.destWarpId}`);
        continue;
      }
      const destX = destWarp.x * 2;
      const destY = destWarp.y * 2;

      const keyA = `${slug}:${srcX}:${srcY}:${destSlug}:${destX}:${destY}`;
      const keyB = `${destSlug}:${destX}:${destY}:${slug}:${srcX}:${srcY}`;
      if (processedStairs.has(keyA) || processedStairs.has(keyB)) continue;
      processedStairs.add(keyA);
      processedStairs.add(keyB);

      const srcFloor  = extractFloor(pascal);
      const destFloor = extractFloor(destPascal);
      const dirA = destFloor > srcFloor ? 'up' : 'down';
      const dirB = destFloor > srcFloor ? 'down' : 'up';

      // Route each stair through its OWN scene's per-type warp router.
      const typeA = srcTypeOfSlug(slug)     || 'overworld';
      const typeB = srcTypeOfSlug(destSlug) || 'overworld';
      const warpIdA = nextWarpId++;   // trigger in `slug` → dest
      const warpIdB = nextWarpId++;   // trigger in `destSlug` → src
      warpCases.push({ warpId: warpIdA, sceneId: destScene.id, x: destX, y: destY, direction: dirA,
        srcType: typeA, comment: `STAIR ${slug} → ${destSlug} (${destX},${destY})` });
      warpCases.push({ warpId: warpIdB, sceneId: scene.id,     x: srcX,  y: srcY,  direction: dirB,
        srcType: typeB, comment: `STAIR ${destSlug} → ${slug} (${srcX},${srcY})` });

      const fileA = path.join(SCENES_DIR, slug, 'triggers', `${slugify(`stair_to_${destSlug}_${srcX}_${srcY}`)}.gbsres`);
      writeFile(fileA, makeTrigger(
        `Stair to ${destSlug}`, srcX, srcY, 2, 2,
        scriptSimpleRouted(warpIdA, routerIds[typeA].id),
        leaveScriptSimple(),
      ));

      const fileB = path.join(SCENES_DIR, destSlug, 'triggers', `${slugify(`stair_to_${slug}_${destX}_${destY}`)}.gbsres`);
      writeFile(fileB, makeTrigger(
        `Stair to ${slug}`, destX, destY, 2, 2,
        scriptSimpleRouted(warpIdB, routerIds[typeB].id),
        leaveScriptSimple(),
      ));

      triggerCount += 2;
      console.log(`  STAIR ${slug}[${typeA}](${srcX},${srcY}) ↔ ${destSlug}[${typeB}](${destX},${destY})`);
    }
  }

  // ── Phase 4: Write warp scripts and custom input scripts ──
  console.log('\n=== Phase 4: Write warp scripts and custom scripts ===');

  const entryCases   = warpCases.filter(c => c.comment.startsWith('ENTRY'));
  const exitCases    = warpCases.filter(c => c.comment.startsWith('EXIT'));
  const stairCases   = warpCases.filter(c => c.comment.startsWith('STAIR'));
  const spinnerCases = warpCases.filter(c => c.comment.startsWith('SPINNER'));
  console.log(`  Cases — entry:${entryCases.length} exit:${exitCases.length} stair:${stairCases.length} spinner:${spinnerCases.length}`);
  console.log(`  WarpId range: ${FIRST_BUILDING_WARP_ID}–${nextWarpId - 1}`);

  // Per-source-type routers: scripts/<type>/warp_script.gbsres (ids read from disk,
  // overworld f7a1e2d3… / facility e2000001… preserved so triggers resolve unchanged).
  writePerTypeRouters(warpCases, routerIds);
  console.log(`  Wrote ${WARP_ROUTER_TYPES.length} per-type warp routers.`);

  // Per-type EXIT input handlers (one per (type,dir) actually used by an EXIT trigger),
  // each routing through its type's Warp Script. Replaces the 4 shared warp_input_* + the
  // warp_exit_resolve (LastMap) script, both now removed.
  const customScripts = [buildSpinningWarpScript()];
  for (const k of Object.keys(inputScripts)) {
    const e = inputScripts[k];
    customScripts.push(buildWarpInputScript(e.id, e.name, e.symbol, e.dir, routerIds[e.type].id));
  }
  for (const s of customScripts) {
    writeFile(path.join(SCRIPTS_DIR, `${s.symbol}.gbsres`), s);
    console.log(`  Wrote ${s.name} → ${s.symbol}.gbsres`);
  }

  // Remove the retired shared EXIT scripts (LastMap resolver + 4 generic input handlers).
  for (const stale of ['warp_exit_resolve', 'script_warp_input_down', 'script_warp_input_left',
                       'script_warp_input_right', 'script_warp_input_up']) {
    const f = path.join(SCRIPTS_DIR, `${stale}.gbsres`);
    if (fs.existsSync(f) && !DRY_RUN) { fs.unlinkSync(f); console.log(`  Removed ${stale}.gbsres (retired)`); }
  }

  // Spinner-pad detection lives in the per-type FACILITY init (Metatile Enter).
  // NOTE: scene init/post wiring is owned by gen_metatile_type_scripts.js — this
  // tool no longer rewrites scene scripts (Phase 6 removed) so it cannot clobber
  // the per-type Init/Post split.
  injectSpinnerIntoFacilityInit(saffronSpinners);

  // ── Phase 5: variables.gbsres — WarpType var + METATILETYPES + METATILEIDS constants ──
  console.log('\n=== Phase 5: variables.gbsres ===');
  ensureWarpTypeVariable();
  console.log(`  Saffron Gym: ${saffronSpinners.length} spinner pad positions handled via FACILITY init detection.`);

  // ── Summary ──
  console.log(`\n=== Done ===`);
  console.log(`  Triggers created: ${triggerCount}`);
  console.log(`  WarpScript cases: ${warpCases.length} (WarpIds ${FIRST_BUILDING_WARP_ID}–${nextWarpId - 1})`);
  if (DRY_RUN) console.log('  [DRY-RUN: no files written]');
}

main();
