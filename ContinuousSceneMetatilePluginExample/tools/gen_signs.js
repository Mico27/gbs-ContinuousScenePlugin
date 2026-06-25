/**
 * gen_signs.js
 * ------------
 * Generates one read_sign.gbsres per metatile type in project/scripts/<type>/.
 * Each script switches on CurrentArea (var22) for only its type's areas, then on
 * faced tile X (var12) and, where >1 sign shares an X, Y (var13).
 *
 * Also patches every scripts/<type>/init_script.gbsres that references the old
 * monolithic read_area_sign to instead reference its per-type script, and removes
 * the old read_area_sign.gbsres.
 *
 *   node gen_signs.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pokered, parseObjects } = require('./pokered_lib.js');

const ROOT    = path.join(__dirname, '..', 'project');
const POKERED = 'C:/Users/micka/Documents/pokered';
const PRESET_ID  = 'b5f85a5b-5f40-4355-9e63-db5ce2bfe0bc';
const OLD_READ_SIGN_ID = 'f0a1b2c3-d4e5-4f60-8a1b-2c3d4e5f6071';
const AREA_VAR = '22';

// Stable per-type script IDs (hardcoded so re-runs preserve them)
const TYPE_SCRIPT_IDS = {
  overworld:  'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6071',
  plateau:    'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6072',
  cavern:     'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6073',
  lab:        'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6074',
  forest:     'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6075',
  gate:       'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6076',
  house:      'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6077',
  reds_house: 'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6078',
  interior:   'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6079',
  mansion:    'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f607a',
  lobby:      'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f607b',
  ship:       'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f607c',
  gym:        'f1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f607d',
};

// Which AREAS[] index (0-based) belongs to which metatile type.
// Overworld indices: all 0..37 except 10 (indigo_plateau = plateau type).
const OW = [...Array(10).keys(), ...Array(27).keys().map(i => i + 11)]; // 0-9, 11-37
const TYPE_AREA_INDICES = {
  overworld:  OW,
  plateau:    [10],
  cavern:     [38, 39, 40],
  lab:        [41, 42, 43],
  forest:     [44, 45, 46, 47, 48],
  gate:       [49, 50, 51, 52, 53, 54],
  house:      [55],
  reds_house: [56, 57],
  interior:   [58],
  mansion:    [59, 60, 61, 62],
  lobby:      [63, 64, 65, 66, 67, 68, 69, 70],
  ship:       [71],
  gym:        [],   // no bg_events in gym maps; keep empty script for init reference
};

// scene order == area number (1..38). [scene, pokeredMap, splitCfg, fallbackText]
const AREAS = [
  ['palette_town', 'PalletTown', null, ['PALLET TOWN', 'Shades of your', 'journey await!']],
  ['viridian_city', 'ViridianCity', null, ['VIRIDIAN CITY', 'The eternally', 'green paradise.']],
  ['pewter_city', 'PewterCity', null, ['PEWTER CITY', 'A stone gray city.']],
  ['cerulean_city', 'CeruleanCity', null, ['CERULEAN CITY', 'A mysterious,', 'blue aura town.']],
  ['vermillion_city', 'VermilionCity', null, ['VERMILION CITY', 'Port of exquisite', 'sunsets.']],
  ['lavender_town', 'LavenderTown', null, ['LAVENDER TOWN', 'The noble', 'purple town.']],
  ['celadon_city', 'CeladonCity', null, ['CELADON CITY', 'City of rainbow', 'dreams.']],
  ['fuchsia_city', 'FuchsiaCity', null, ['FUCHSIA CITY', 'Behold! Passion', 'pink!']],
  ['saffron_city', 'SaffronCity', null, ['SAFFRON CITY', 'Golden land of', 'commerce.']],
  ['cinabar_island', 'CinnabarIsland', null, ['CINNABAR ISLAND', 'Fiery town of', 'burning desire.']],
  ['indigo_plateau', 'IndigoPlateau', null, ['INDIGO PLATEAU', 'POKéMON LEAGUE', 'front.']],
  ['route_1', 'Route1', null, ['ROUTE 1']], ['route_2', 'Route2', null, ['ROUTE 2']],
  ['route_3', 'Route3', null, ['ROUTE 3']], ['route_4', 'Route4', null, ['ROUTE 4']],
  ['route_5', 'Route5', null, ['ROUTE 5']], ['route_6', 'Route6', null, ['ROUTE 6']],
  ['route_7', 'Route7', null, ['ROUTE 7']], ['route_8', 'Route8', null, ['ROUTE 8']],
  ['route_9', 'Route9', null, ['ROUTE 9']], ['route_10', 'Route10', null, ['ROUTE 10']],
  ['route_11', 'Route11', null, ['ROUTE 11']], ['route_12', 'Route12', null, ['ROUTE 12']],
  ['route_13', 'Route13', null, ['ROUTE 13']], ['route_14', 'Route14', null, ['ROUTE 14']],
  ['route_15', 'Route15', null, ['ROUTE 15']], ['route_16', 'Route16', null, ['ROUTE 16']],
  ['route_17a', 'Route17', { top: 144 }, ['ROUTE 17', 'Cycling Road', '(north end)']],
  ['route_17b', 'Route17', { bottom: 144 }, ['ROUTE 17', 'Cycling Road', '(south end)']],
  ['route_18', 'Route18', null, ['ROUTE 18']], ['route_19', 'Route19', null, ['ROUTE 19']],
  ['route_20', 'Route20', null, ['ROUTE 20']], ['route_21', 'Route21', null, ['ROUTE 21']],
  ['route_22', 'Route22', null, ['ROUTE 22']],
  ['route_23_a', 'Route23', { top: 144 }, ['ROUTE 23', 'Victory Road', '(A)']],
  ['route_23_b', 'Route23', { bottom: 144 }, ['ROUTE 23', 'Victory Road', '(B)']],
  ['route_24', 'Route24', null, ['ROUTE 24']], ['route_25', 'Route25', null, ['ROUTE 25']],
  // Indoor areas (39–72) — area numbers continue from overworld 1–38
  ['mt_moon1_f',                  'MtMoon1F',                  null, ['MT. MOON 1F']],
  ['rock_tunnel1_f',              'RockTunnel1F',              null, ['ROCK TUNNEL 1F']],
  ['seafoam_islands_b4_f',        'SeafoamIslandsB4F',         null, ['SEAFOAM ISLANDS', 'B4F']],
  ['cinnabar_lab',                'CinnabarLab',               null, ['CINNABAR LAB']],
  ['cinnabar_lab_metronome_room', 'CinnabarLabMetronomeRoom',  null, ['CINNABAR LAB', 'FOSSIL ROOM']],
  ['wardens_house',               'WardensHouse',              null, ["SAFARI WARDEN'S", 'HOUSE']],
  ['safari_zone_center',          'SafariZoneCenter',          null, ['SAFARI ZONE', 'CENTER']],
  ['safari_zone_east',            'SafariZoneEast',            null, ['SAFARI ZONE EAST']],
  ['safari_zone_north',           'SafariZoneNorth',           null, ['SAFARI ZONE NORTH']],
  ['safari_zone_west',            'SafariZoneWest',            null, ['SAFARI ZONE WEST']],
  ['viridian_forest',             'ViridianForest',            null, ['VIRIDIAN FOREST']],
  ['museum2_f',                   'Museum2F',                  null, ['PEWTER MUSEUM', '2F']],
  ['route11_gate2_f',             'Route11Gate2F',             null, ['ROUTE 11 GATE', '2F']],
  ['route12_gate2_f',             'Route12Gate2F',             null, ['ROUTE 12 GATE', '2F']],
  ['route15_gate2_f',             'Route15Gate2F',             null, ['ROUTE 15 GATE', '2F']],
  ['route16_gate2_f',             'Route16Gate2F',             null, ['ROUTE 16 GATE', '2F']],
  ['route18_gate2_f',             'Route18Gate2F',             null, ['ROUTE 18 GATE', '2F']],
  ['cerulean_trashed_house',      'CeruleanTrashedHouse',      null, ['CERULEAN HOUSE']],
  ['copycats_house2_f',           'CopycatsHouse2F',           null, ["COPYCAT'S HOUSE", '2F']],
  ['reds_house1_f',               'RedsHouse1F',               null, ["RED'S HOUSE 1F"]],
  ['pokemon_fan_club',            'PokemonFanClub',            null, ["POKéMON FAN CLUB"]],
  ['celadon_mansion1_f',          'CeladonMansion1F',          null, ['CELADON MANSION', '1F']],
  ['celadon_mansion2_f',          'CeladonMansion2F',          null, ['CELADON MANSION', '2F']],
  ['celadon_mansion3_f',          'CeladonMansion3F',          null, ['CELADON MANSION', '3F']],
  ['celadon_mansion_roof',        'CeladonMansionRoof',        null, ['CELADON MANSION', 'ROOF']],
  ['celadon_mart1_f',             'CeladonMart1F',             null, ['CELADON MART 1F']],
  ['celadon_mart2_f',             'CeladonMart2F',             null, ['CELADON MART 2F']],
  ['celadon_mart3_f',             'CeladonMart3F',             null, ['CELADON MART 3F']],
  ['celadon_mart4_f',             'CeladonMart4F',             null, ['CELADON MART 4F']],
  ['celadon_mart5_f',             'CeladonMart5F',             null, ['CELADON MART 5F']],
  ['celadon_mart_roof',           'CeladonMartRoof',           null, ['CELADON MART ROOF']],
  ['game_corner',                 'GameCorner',                null, ['GAME CORNER']],
  ['game_corner_prize_room',      'GameCornerPrizeRoom',       null, ['GAME CORNER', 'PRIZE ROOM']],
  ['s_s_anne_captains_room',      'SSAnneCaptainsRoom',        null, ["S.S. ANNE", "CAPTAIN'S ROOM"]],
];

const uid = () => crypto.randomUUID();

// Static text overrides for bg_events that point to dynamic scripts (menus) in pokered.
// Keys match the "scene:TEXT_CONST" pattern from the NO TEXT report.
// Pages array format matches Pokered._toPages(): each string starts with \n, lines separated by \n\n.
const TEXT_OVERRIDES = {
  // CeladonMartRoof — all 3 vending machines sell the same drinks
  'celadon_mart_roof:TEXT_CELADONMARTROOF_VENDING_MACHINE1': ['\nFRESH WATER ¥200\n\nSODA POP ¥300', '\nLEMONADE ¥350'],
  'celadon_mart_roof:TEXT_CELADONMARTROOF_VENDING_MACHINE2': ['\nFRESH WATER ¥200\n\nSODA POP ¥300', '\nLEMONADE ¥350'],
  'celadon_mart_roof:TEXT_CELADONMARTROOF_VENDING_MACHINE3': ['\nFRESH WATER ¥200\n\nSODA POP ¥300', '\nLEMONADE ¥350'],
  // GameCornerPrizeRoom — 3 prize vendors (Pokémon Red prizes)
  'game_corner_prize_room:TEXT_GAMECORNERPRIZEROOM_PRIZE_VENDOR_1': ['\nABRA  180 COINS\n\nCLEFAIRY 500', '\nNIDORINA 1200'],
  'game_corner_prize_room:TEXT_GAMECORNERPRIZEROOM_PRIZE_VENDOR_2': ['\nDRATINI 2800\n\nSCYTHER 5500', '\nPORYGON 9999'],
  'game_corner_prize_room:TEXT_GAMECORNERPRIZEROOM_PRIZE_VENDOR_3': ['\nTM23 DRAGONRAGE\n\nTM15 HYPR BEAM', '\nTM50 SUBSTITUTE'],
};
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
    id: uid(),
  };
}
// chained EVENT_SWITCH (16 cases per level). cases: [value, bodyArr][]
function chainSwitch(variable, cases, elseBody) {
  const chunk = cases.slice(0, 16), rest = cases.slice(16);
  const args = { variable, choices: chunk.length, __collapseElse: false };
  for (let i = 0; i < 16; i++) args[`__collapseCase${i}`] = false;
  chunk.forEach(([v], i) => { args[`value${i}`] = { type: 'number', value: v }; });
  const children = {};
  chunk.forEach(([, body], i) => { children[`true${i}`] = body; });
  children.false = rest.length ? [chainSwitch(variable, rest, elseBody)] : elseBody;
  return { command: 'EVENT_SWITCH', args, children, id: uid() };
}

// Returns { areaCase: [areaNum, body], signCount: N }
function buildAreaCase(pk, scene, map, split, fallback, areaNum, noText) {
  const fb = () => [textEvent(['\n' + fallback.join('\n\n')])];
  const { bgs } = parseObjects(POKERED, map);

  const signs = [];
  for (const b of bgs) {
    let gx = b.x * 2, gy = b.y * 2;
    if (split && split.top != null) { if (gy >= split.top) continue; }
    if (split && split.bottom != null) { if (gy < split.bottom) continue; gy -= split.bottom; }
    const pages = pk.resolveTextConst(b.text) || TEXT_OVERRIDES[`${scene}:${b.text}`];
    if (!pages) { noText.push(`${scene}:${b.text}`); continue; }
    signs.push({ x: gx, y: gy, pages });
  }

  if (!signs.length) return { areaCase: [areaNum, fb()], signCount: 0 };

  const byX = new Map();
  for (const s of signs) { if (!byX.has(s.x)) byX.set(s.x, []); byX.get(s.x).push(s); }
  const xCases = [];
  for (const [x, ys] of byX) {
    const body = ys.length === 1
      ? [textEvent(ys[0].pages)]
      : [chainSwitch('13', ys.map(s => [s.y, [textEvent(s.pages)]]), fb())];
    xCases.push([x, body]);
  }
  return { areaCase: [areaNum, [chainSwitch('12', xCases, fb())]], signCount: signs.length };
}

function main() {
  const pk = new Pokered(POKERED).load();
  let totalSigns = 0;
  const noText = [];

  // Build all area cases once
  const allAreaCases = AREAS.map(([scene, map, split, fallback], i) => {
    const areaNum = i + 1;
    const { areaCase, signCount } = buildAreaCase(pk, scene, map, split, fallback, areaNum, noText);
    totalSigns += signCount;
    return areaCase;
  });

  const SCRIPTS_DIR = path.join(ROOT, 'scripts');

  // Generate one read_sign.gbsres per type
  let filesWritten = 0;
  for (const [type, indices] of Object.entries(TYPE_AREA_INDICES)) {
    const id     = TYPE_SCRIPT_IDS[type];
    const typeCases = indices.map(i => allAreaCases[i]);
    const script = typeCases.length
      ? [chainSwitch(AREA_VAR, typeCases, [])]
      : [];
    const doc = {
      _resourceType: 'script',
      id,
      name: `${type[0].toUpperCase() + type.slice(1)}/Read Sign`,
      description: `Sign text for ${type} scenes. Switches on var22 (area number), `
        + 'then var12 (faced tile X) and var13 (Y). Generated by tools/gen_signs.js.',
      variables: {},
      actors: {},
      symbol: `script_read_sign_${type}`,
      script,
    };
    const outDir = path.join(SCRIPTS_DIR, type);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'read_sign.gbsres'), JSON.stringify(doc, null, 2) + '\n');
    filesWritten++;
  }
  console.log(`Wrote ${filesWritten} per-type read_sign.gbsres files.`);

  // Patch init_script.gbsres: replace OLD_READ_SIGN_ID with per-type ID
  let patched = 0;
  for (const [type, newId] of Object.entries(TYPE_SCRIPT_IDS)) {
    const fp = path.join(SCRIPTS_DIR, type, 'init_script.gbsres');
    if (!fs.existsSync(fp)) continue;
    const src = fs.readFileSync(fp, 'utf8');
    if (!src.includes(OLD_READ_SIGN_ID)) continue;
    const updated = src.replaceAll(OLD_READ_SIGN_ID, newId);
    fs.writeFileSync(fp, updated);
    patched++;
    console.log(`  patched ${type}/init_script.gbsres`);
  }
  console.log(`Patched ${patched} init scripts.`);

  // Remove the old monolithic script
  const oldPath = path.join(SCRIPTS_DIR, 'read_area_sign.gbsres');
  if (fs.existsSync(oldPath)) {
    fs.unlinkSync(oldPath);
    console.log('Removed read_area_sign.gbsres.');
  }

  console.log(`\nTotal: ${totalSigns} signs across ${AREAS.length} areas.`);
  if (noText.length) console.log('NO TEXT (' + noText.length + '):', noText.join(', '));
}
main();
