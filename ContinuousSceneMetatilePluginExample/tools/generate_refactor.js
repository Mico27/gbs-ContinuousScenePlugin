'use strict';
// Refactor remaining actor sprites: recolor to GBS working palette + build
// metasprite states. Categories by PNG dimensions:
//   S 16x16  -> boulder template (fixed + Grass)        [objects]
//   M 16x48  -> balding_guy template (multi + Grass)
//   L 16x96  -> already configured by user; recolor only
// Usage: node generate_refactor.js --dry   (report only)
//        node generate_refactor.js         (apply)
const fs = require('fs');
const path = require('path');
const { computeNumTiles, statesToMetasprites, recolorPng, sha1File, regenIds } = require('./lib_sprite.js');

const DIR = path.join(__dirname, '..', 'assets', 'sprites');
const DRY = process.argv.includes('--dry');
const MODE = '8x8';
const g = (f) => path.join(DIR, f + '.png.gbsres');
const p = (f) => path.join(DIR, f + '.png');

// --- work lists (verified against verify_layout.js / census.js) ---
// LARGE: existing default matches red exactly; replace states w/ red template
// (default + Grass + Jump, canvas 32x40). Excludes references red, agatha.
const LARGE = [
  'beauty','biker','bird','blue','brunette_girl','bruno','channeler','cook','cooltrainer_f',
  'cooltrainer_m','daisy','fairy','fisher','gambler','gentleman','giovanni','girl','hiker','koga',
  'lance','little_girl','lorelei','middle_aged_man','middle_aged_woman','monster','mr_fuji','oak',
  'red_bike','rocker','rocket','sailor','scientist','seel','silph_worker_f','super_nerd','swimmer',
  'waiter','youngster',
];
const MEDIUM = [ // empty defaults; full config from balding_guy (multi + Grass)
  'bike_shop_clerk','captain','clerk','fishing_guru','gameboy_kid','gramps','granny','guard',
  'gym_guide','link_receptionist','little_boy','mom','nurse','safari_zone_worker',
  'silph_president','silph_worker_m','warden',
];
const SMALL = [ // boulder template (fixed + Grass). Excludes references boulder, tree(custom).
  'clipboard','fossil','gambler_asleep','old_amber','paper','poke_ball','pokedex','snorlax',
];

// --- load templates (states + canvas/bounds) ---
function loadTemplate(name) {
  const d = JSON.parse(fs.readFileSync(g(name), 'utf8'));
  return {
    states: d.states,
    canvasOriginX: d.canvasOriginX, canvasOriginY: d.canvasOriginY,
    canvasWidth: d.canvasWidth, canvasHeight: d.canvasHeight,
    boundsX: d.boundsX, boundsY: d.boundsY, boundsWidth: d.boundsWidth, boundsHeight: d.boundsHeight,
    animSpeed: d.animSpeed,
  };
}
const TPL = { S: loadTemplate('boulder'), M: loadTemplate('balding_guy'), L: loadTemplate('red') };

function applyTemplate(name, tpl) {
  const d = JSON.parse(fs.readFileSync(g(name), 'utf8'));
  // fresh states from template, new inner ids; keep sprite-level id/name/symbol
  const states = JSON.parse(JSON.stringify(tpl.states));
  regenIds(states);
  d.states = states;
  d.canvasOriginX = tpl.canvasOriginX; d.canvasOriginY = tpl.canvasOriginY;
  d.canvasWidth = tpl.canvasWidth; d.canvasHeight = tpl.canvasHeight;
  d.boundsX = tpl.boundsX; d.boundsY = tpl.boundsY;
  d.boundsWidth = tpl.boundsWidth; d.boundsHeight = tpl.boundsHeight;
  d.animSpeed = tpl.animSpeed;
  return d;
}

function finalize(name, d) {
  const ms = statesToMetasprites(d.states);
  d.numTiles = computeNumTiles(p(name), d.canvasWidth, d.canvasHeight, ms, MODE);
  d.checksum = sha1File(p(name));
  return d;
}

function write(name, d) {
  if (!fs.existsSync(g(name) + '.bak2')) fs.copyFileSync(g(name), g(name) + '.bak2');
  fs.writeFileSync(g(name), JSON.stringify(d, null, 2));
}
function backupPng(name) {
  if (!fs.existsSync(p(name) + '.preraw')) fs.copyFileSync(p(name), p(name) + '.preraw');
}

const report = [];
function run(name, kind) {
  // recolor first (so numTiles is computed against final pixels). idempotent.
  if (!DRY) { backupPng(name); }
  const changedPng = DRY ? false : recolorPng(p(name));
  const d = applyTemplate(name, TPL[kind]);
  const oldNum = JSON.parse(fs.readFileSync(g(name), 'utf8')).numTiles;
  finalize(name, d);
  report.push({ name, kind, oldNum, newNum: d.numTiles, recolored: changedPng,
    states: d.states.map(s => s.name || '∅').join('+') });
  if (!DRY) write(name, d);
}

console.log(DRY ? '=== DRY RUN (no writes) ===' : '=== APPLYING ===');
SMALL.forEach(n => run(n, 'S'));
MEDIUM.forEach(n => run(n, 'M'));
LARGE.forEach(n => run(n, 'L'));

console.log('\nname                       kind states          recolor  numTiles');
for (const r of report) {
  console.log(`  ${r.name.padEnd(24)} ${r.kind}   ${r.states.padEnd(15)} ${r.recolored ? 'yes' : 'no '}     ${r.oldNum}->${r.newNum}`);
}
console.log(`\nTotal: ${report.length} sprites  (S=${SMALL.length} M=${MEDIUM.length} L=${LARGE.length})`);
console.log('Excluded: red,agatha,boulder,balding_guy (references); tree (custom anim); red_fish (16x64 oddball).');
if (DRY) console.log('(DRY: numTiles computed on CURRENT grey png; real run recolors first.)');
