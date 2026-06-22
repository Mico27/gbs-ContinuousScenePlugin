/**
 * gen_signs.js
 * ------------
 * Rebuilds project/scripts/read_area_sign.gbsres so that every Sign metatile the
 * player faces shows that sign's REAL pokered text.
 *
 * The central handler switches on CurrentArea (var22, set per-scene 1..38 in the
 * fixed AREAS order below), then on the faced tile X (var12) and, where several
 * signs share an X, the faced tile Y (var13). Faced tile coords == pokered
 * bg_event coords * 2 (validated to match the painted Sign metatiles). Unmatched
 * sign tiles fall through to a generic area-marker text.
 *
 *   node gen_signs.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pokered, parseObjects } = require('./pokered_lib.js');

const ROOT = path.join(__dirname, '..', 'project');
const POKERED = 'C:/Users/micka/Documents/pokered';
const PRESET_ID = 'b5f85a5b-5f40-4355-9e63-db5ce2bfe0bc';
const READ_SIGN_ID = 'f0a1b2c3-d4e5-4f60-8a1b-2c3d4e5f6071';
const AREA_VAR = '22';

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
];

const uid = () => crypto.randomUUID();
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

function main() {
  const pk = new Pokered(POKERED).load();
  let totalSigns = 0, noText = [];

  const areaCases = [];
  AREAS.forEach(([scene, map, split, fallback], i) => {
    const num = i + 1;
    const fb = () => [textEvent(['\n' + fallback.join('\n\n')])];
    const { bgs } = parseObjects(POKERED, map);

    // collect signs as faced-tile coords with resolved pokered text
    const signs = [];
    for (const b of bgs) {
      let gx = b.x * 2, gy = b.y * 2;
      if (split && split.top != null) { if (gy >= split.top) continue; }
      if (split && split.bottom != null) { if (gy < split.bottom) continue; gy -= split.bottom; }
      let pages = pk.resolveTextConst(b.text);
      if (!pages) { noText.push(`${scene}:${b.text}`); continue; }
      signs.push({ x: gx, y: gy, pages });
      totalSigns++;
    }

    if (!signs.length) { areaCases.push([num, fb()]); return; }

    // group by X; nested Y switch where >1 sign shares an X
    const byX = new Map();
    for (const s of signs) { if (!byX.has(s.x)) byX.set(s.x, []); byX.get(s.x).push(s); }
    const xCases = [];
    for (const [x, ys] of byX) {
      let body;
      if (ys.length === 1) body = [textEvent(ys[0].pages)];
      else body = [chainSwitch('13', ys.map(s => [s.y, [textEvent(s.pages)]]), fb())];
      xCases.push([x, body]);
    }
    areaCases.push([num, [chainSwitch('12', xCases, fb())]]);
  });

  const doc = {
    _resourceType: 'script',
    id: READ_SIGN_ID,
    name: 'Read Area Sign',
    description: 'Shows the faced Sign\'s real pokered text. Switches on CurrentArea '
      + '(var22), then faced tile X (var12) and Y (var13). Unmatched tiles fall '
      + 'through to a generic area sign. Generated by tools/gen_signs.js.',
    variables: {},
    actors: {},
    symbol: 'script_read_area_sign',
    script: [chainSwitch(AREA_VAR, areaCases, [])],
  };
  fs.writeFileSync(path.join(ROOT, 'scripts', 'read_area_sign.gbsres'), JSON.stringify(doc, null, 2) + '\n');
  console.log(`read_area_sign.gbsres written: ${totalSigns} signs across ${AREAS.length} areas`);
  if (noText.length) console.log('NO TEXT (' + noText.length + '):', noText.join(', '));
}
main();
