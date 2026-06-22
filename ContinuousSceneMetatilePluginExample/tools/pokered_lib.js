/**
 * pokered_lib.js
 * --------------
 * Parses the pokered decompilation to extract, for any overworld map:
 *   - object_events  (NPCs, trainers, item balls) with sprite, coords, dir, movement, dialogue
 *   - bg_events      (signs) with coords + dialogue
 *
 * Dialogue resolution chain (handles the trainer indirection):
 *   object TEXT_X  ->  dw_const FuncLabel, TEXT_X        (text pointers)
 *   FuncLabel:
 *     text_far _Str                                       -> simple NPC/sign
 *     text_asm ... ld hl, HeaderN ... call TalkToTrainer  -> trainer: use header's BattleText
 *     text_asm ... .lbl: text_far _Str ...                -> conditional NPC: first text_far
 *   _Str::  text "..." / line / cont / para ...           -> the actual string (text/*.asm)
 *
 * All paths are relative to the pokered repo root passed to load().
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ───────────────────────── charmap substitutions ─────────────────────────
// Multi-char tokens first; '#' last. Control tokens are stripped by the caller.
const MACROS = [
  ['<PLAYER>', 'RED'], ['<RIVAL>', 'BLUE'],
  ['<PKMN>', 'POKéMON'], ['<PK>', 'PK'], ['<MN>', 'MN'],
  ['<PC>', 'PC'], ['<TM>', 'TM'], ['<TRAINER>', 'TRAINER'], ['<ROCKET>', 'ROCKET'],
  ['<USER>', 'RED'], ['<TARGET>', 'foe'],
  ['<DOT>', '.'], ['<COLON>', ':'], ['<to>', 'to'], ['<……>', '……'],
  ['#', 'POKé'],
];
// control tokens that should never reach output (we split on the paragraph ones)
const CONTROL = ['<NULL>', '<PAGE>', '<_CONT>', '<SCROLL>', '<NEXT>', '<LINE>',
  '<PARA>', '<CONT>', '<DONE>', '<PROMPT>', '<DEXEND>', '<LV>', '<ID>'];

function applyCharmap(s) {
  for (const [k, v] of MACROS) s = s.split(k).join(v);
  for (const c of CONTROL) s = s.split(c).join('');
  return s.replace(/@+$/, '');           // strip terminator(s)
}

// ───────────────────────── low-level .asm scan ─────────────────────────
function readAsm(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/);
}
function listAsm(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listAsm(p));
    else if (e.name.endsWith('.asm')) out.push(p);
  }
  return out;
}

// extract first double-quoted string on a line
function quoted(line) {
  const m = line.match(/"((?:[^"\\]|\\.)*)"/);
  return m ? m[1] : null;
}

class Pokered {
  constructor(root) {
    this.root = root;
    this.labelBody = new Map();   // scriptLabel -> array of following directive lines (until next label)
    this.textStr = new Map();     // _Label -> [ {lines:[...]} pages ]
    this.dwConst = new Map();     // TEXT_CONST -> FuncLabel
    this.trainer = new Map();     // HeaderLabel -> {battle,end,after}
  }

  load() {
    this._indexScripts();
    this._indexText();
    return this;
  }

  // scripts/*.asm + data/maps/*.asm + engine: label bodies, dw_const, trainer headers
  _indexScripts() {
    const files = [
      ...listAsm(path.join(this.root, 'scripts')),
      ...listAsm(path.join(this.root, 'engine')),
      ...listAsm(path.join(this.root, 'home')),
      ...listAsm(path.join(this.root, 'data', 'maps')),
    ];
    for (const f of files) {
      const lines = readAsm(f);
      let curLabel = null, body = [];
      const flush = () => { if (curLabel) this.labelBody.set(curLabel, body); };
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const labelM = raw.match(/^(\w[\w\d_]*):/);   // top-level label (col 0)
        if (labelM) {
          flush();
          curLabel = labelM[1];
          body = [];
          // capture trainer header defined on the SAME label
          // (label line then a `trainer ...` directive on next non-empty line)
          continue;
        }
        const t = raw.trim();
        if (t) body.push(t);
        // dw_const FuncLabel, TEXT_CONST
        const dw = t.match(/^dw_const\s+([\w\d_]+),\s*(TEXT_[\w\d_]+)/);
        if (dw) this.dwConst.set(dw[2], dw[1]);
      }
      flush();
    }
    // trainer headers: a label whose body's first directive is `trainer ...`
    for (const [label, body] of this.labelBody) {
      const first = body.find(l => l && !l.startsWith(';'));
      if (first && first.startsWith('trainer ')) {
        const parts = first.slice('trainer'.length).split(',').map(s => s.trim());
        // trainer EVENT, party, BattleText, EndBattleText, AfterBattleText
        this.trainer.set(label, { battle: parts[2], end: parts[3], after: parts[4] });
      }
    }
  }

  // text/*.asm and data/text/*.asm : _Label:: -> pages
  _indexText() {
    const files = [...listAsm(path.join(this.root, 'text')), ...listAsm(path.join(this.root, 'data', 'text'))];
    for (const f of files) {
      const lines = readAsm(f);
      let cur = null, pages = null, page = null;
      const endBlock = () => {
        if (cur) { if (page && page.lines.length) pages.push(page); this.textStr.set(cur, pages); }
        cur = null; pages = null; page = null;
      };
      for (const raw of lines) {
        const lm = raw.match(/^_(\w[\w\d_]*)::/);
        if (lm) { endBlock(); cur = '_' + lm[1]; pages = []; page = { lines: [] }; continue; }
        if (!cur) continue;
        const t = raw.trim();
        if (/^(text_end|done)\b/.test(t)) { endBlock(); continue; }
        const q = quoted(t);
        if (/^(text|text_start)\b/.test(t)) {
          if (page.lines.length) { pages.push(page); page = { lines: [] }; }
          if (q !== null) page.lines.push(q);
        } else if (/^para\b/.test(t)) {
          if (page.lines.length) { pages.push(page); page = { lines: [] }; }
          if (q !== null) page.lines.push(q);
        } else if (/^(line|cont|next)\b/.test(t)) {
          if (q !== null) page.lines.push(q);
        } else if (/^prompt\b/.test(t)) {
          // page break w/ button; treat like para boundary
          if (page.lines.length) { pages.push(page); page = { lines: [] }; }
        }
        // text_far / text_ram / sound_* inside a text block: skip (dynamic)
      }
      endBlock();
    }
  }

  // ── resolve a text pointer TEXT_CONST -> array of GBS page strings ──
  resolveTextConst(textConst, opts = {}) {
    const func = this.dwConst.get(textConst);
    if (!func) return null;
    return this._resolveFunc(func, opts, new Set());
  }

  _resolveFunc(func, opts, seen) {
    if (seen.has(func)) return null;
    seen.add(func);

    // direct text string label?
    if (this.textStr.has(func)) return this._toPages(this.textStr.get(func));
    if (this.textStr.has('_' + func)) return this._toPages(this.textStr.get('_' + func));

    const body = this.labelBody.get(func);
    if (!body) return null;
    const code = body.filter(l => l && !l.startsWith(';'));

    // 1) trainer header reference (ld hl, ...TrainerHeaderN) -> battle text
    for (const l of code) {
      const hl = l.match(/^ld hl,\s*(\w+)/);
      if (hl && this.trainer.has(hl[1])) {
        const tr = this.trainer.get(hl[1]);
        const r = tr && tr.battle && this._resolveFunc(tr.battle, opts, seen);
        if (r) return r;
      }
    }
    // 2) direct text_far _Str in this body (simple NPC / sign / *BattleText)
    const tf = code.find(l => /^text_far\s+_\w+/.test(l));
    if (tf) {
      const lbl = tf.match(/^text_far\s+(_\w+)/)[1];
      if (this.textStr.has(lbl)) return this._toPages(this.textStr.get(lbl));
    }
    // 3) follow `ld hl, X` (PrintText arg) then `call/jp/jr X` (delegated script),
    //    preferring labels that are not the "after/end battle" variant.
    const SKIP = /^(PrintText|TextScriptEnd|Delay3|DelayFrames|GiveItem|PlaySound|TextCommandProcessor|.*TalkToTrainer|.*CopyBadgeTextScript)$/;
    const grab = (re) => code.flatMap(l => { const m = l.match(re); return m && !m[1].startsWith('.') && !SKIP.test(m[1]) ? [m[1]] : []; });
    const cands = [...grab(/^ld hl,\s*(\w+)/), ...grab(/^(?:call|jp|jr)\s+(?:nz,|z,|nc,|c,)?\s*(\w+)/)];
    const ranked = cands.sort((a, b) => (/After|End/i.test(a) ? 1 : 0) - (/After|End/i.test(b) ? 1 : 0));
    for (const c of ranked) {
      const r = this._resolveFunc(c, opts, seen);
      if (r) return r;
    }
    return null;
  }

  // pokered pages -> GBS page strings (<=2 wrapped lines per page, '\n\n' join)
  _toPages(pages, LINE_W = 18, LINES_PER = 2) {
    const out = [];
    for (const pg of pages) {
      // substitute + wrap each pokered line, flatten
      let wrapped = [];
      for (const ln of pg.lines) {
        const s = applyCharmap(ln);
        wrapped.push(...wrap(s, LINE_W));
      }
      // chunk into GBS pages of LINES_PER (drop empty / whitespace-only lines).
      // Each page starts with an empty line (leading '\n').
      wrapped = wrapped.filter(l => l.trim());
      for (let i = 0; i < wrapped.length; i += LINES_PER) {
        out.push('\n' + wrapped.slice(i, i + LINES_PER).join('\n\n'));
      }
    }
    return out.length ? out : null;
  }
}

function wrap(s, width) {
  const words = s.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let w of words) {
    while (w.length > width) {          // hard-break overly long token
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.slice(0, width)); w = w.slice(width);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// ───────────────────────── object/bg event parsing ─────────────────────────
const DIR_MAP = { UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right', NONE: 'down', ANY_DIR: 'down' };

function parseObjects(root, mapName) {
  const file = path.join(root, 'data', 'maps', 'objects', mapName + '.asm');
  const lines = readAsm(file);
  const objs = [], bgs = [];
  for (const raw of lines) {
    const t = raw.trim();
    let m;
    if ((m = t.match(/^object_event\s+(.+)$/))) {
      const p = m[1].split(',').map(s => s.replace(/;.*$/, '').trim());
      // x, y, SPRITE, movement, dir, TEXT[, OPP/ITEM, party]
      const o = {
        x: parseCoord(p[0]), y: parseCoord(p[1]),
        sprite: p[2], movement: p[3], facing: p[4], text: p[5],
        extra: p[6] || null, party: p[7] || null,
      };
      if (o.extra && /^OPP_/.test(o.extra)) o.kind = 'trainer';
      else if (o.extra) o.kind = 'item';
      else o.kind = 'npc';
      objs.push(o);
    } else if ((m = t.match(/^bg_event\s+(.+)$/))) {
      const p = m[1].split(',').map(s => s.replace(/;.*$/, '').trim());
      bgs.push({ x: parseCoord(p[0]), y: parseCoord(p[1]), text: p[2] });
    }
  }
  return { objs, bgs };
}
function parseCoord(s) { return parseInt(s, 10); }

function itemLabel(extra) {
  // ITEM_FOO / TM_FOO -> "FOO" nicely spaced
  return extra.replace(/^(TM|HM)_/, '$1 ').replace(/_/g, ' ');
}

module.exports = { Pokered, parseObjects, applyCharmap, wrap, DIR_MAP, itemLabel };
