'use strict';
// Faithful port of gb-studio's sprite numTiles computation (optimiseTiles),
// plus grey->working palette recolor. Used by generate_sprites_refactor.js.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PNG = require('c:/Users/micka/Documents/gb-studio/node_modules/pngjs').PNG;

const TRANSPARENT = 0, LIGHT = 1, MID = 2, DARK = 3, UNKNOWN = 255;

// --- indexedImage helpers (ported 1:1) ---
const mk = (w, h) => ({ width: w, height: h, data: new Uint8Array(w * h) });
const clone = (im) => ({ width: im.width, height: im.height, data: new Uint8Array(im.data) });
const idx = (x, y, im) => x + y * im.width;

const spriteIndexFn = (r, g, b, a) => {
  if ((g > 249 && r < 180 && b < 20) || (b >= 200 && g < 20) || a < 200) return TRANSPARENT;
  if (g >= 205) return LIGHT;
  if (g >= 130) return MID;
  return DARK;
};

function pngToIndexed(file) {
  const p = PNG.sync.read(fs.readFileSync(file));
  const im = mk(p.width, p.height);
  let ii = 0;
  for (let i = 0; i < p.data.length; i += 4) {
    im.data[ii++] = spriteIndexFn(p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]);
  }
  return im;
}

function slice(inD, sx, sy, w, h) {
  const o = mk(w, h);
  let ii = 0;
  for (let y = sy; y < sy + h; y++)
    for (let x = sx; x < sx + w; x++) {
      o.data[ii++] = (x < inD.width && y < inD.height && x >= 0 && y >= 0) ? inD.data[idx(x, y, inD)] : TRANSPARENT;
    }
  return o;
}
function flipX(inD) {
  const o = mk(inD.width, inD.height); let ii = 0;
  for (let y = 0; y < inD.height; y++) for (let x = 0; x < inD.width; x++) o.data[ii++] = inD.data[idx(inD.width - x - 1, y, inD)];
  return o;
}
function flipY(inD) {
  const o = mk(inD.width, inD.height); let ii = 0;
  for (let y = 0; y < inD.height; y++) for (let x = 0; x < inD.width; x++) o.data[ii++] = inD.data[idx(x, inD.height - y - 1, inD)];
  return o;
}
function removeMask(inD, mask, ox, oy) {
  const o = clone(inD);
  for (let y = 0; y < inD.height; y++)
    for (let x = 0; x < inD.width; x++) {
      const di = idx(x, y, inD); const mx = x + ox, my = y + oy;
      if (mx < 0 || my < 0 || mx >= mask.width || my >= mask.height) o.data[di] = UNKNOWN;
      else if (mask.data[idx(mx, my, mask)] !== TRANSPARENT) o.data[di] = UNKNOWN;
    }
  return o;
}
function blit(canvas, inD, ox, oy) {
  const o = clone(canvas);
  for (let y = 0; y < inD.height; y++)
    for (let x = 0; x < inD.width; x++) {
      const di = idx(x, y, inD);
      if (inD.data[di] !== TRANSPARENT) o.data[idx(x + ox, y + oy, canvas)] = inD.data[di];
    }
  return o;
}
function eq(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++)
    if (a.data[i] !== b.data[i] && a.data[i] !== UNKNOWN && b.data[i] !== UNKNOWN) return false;
  return true;
}
function isBlank(im) {
  for (let i = 0; i < im.data.length; i++) if (im.data[i] !== TRANSPARENT && im.data[i] !== UNKNOWN) return false;
  return true;
}
function merge(a, b) {
  const o = clone(a);
  for (let i = 0; i < o.data.length; i++) if (o.data[i] === UNKNOWN) o.data[i] = b.data[i];
  return o;
}

// metasprites: array of frames, each frame = array of tile defs {sliceX,sliceY,x,y,flipX,flipY}
// returns numTiles (= uniqTiles.length * 2 for 8x16)
function computeNumTiles(file, spriteWidth, spriteHeight, metasprites, spriteMode) {
  const indexedImage = pngToIndexed(file);
  const baseWidth = 16;
  const originX = spriteWidth < baseWidth ? 0 : spriteWidth / 2 - baseWidth / 2;
  const originY = spriteHeight - (spriteMode === '8x8' ? 8 : 16);
  const th = spriteMode === '8x8' ? 8 : 16;
  const allTiles = [];
  for (const myTiles of metasprites) {
    let mask = mk(spriteWidth, spriteHeight);
    for (let ti = myTiles.length - 1; ti >= 0; ti--) {
      const td = myTiles[ti];
      let s = slice(indexedImage, td.sliceX, td.sliceY, 8, th);
      if (td.flipX) s = flipX(s);
      if (td.flipY) s = flipY(s);
      const vis = removeMask(s, mask, originX + td.x, originY - td.y);
      mask = blit(mask, s, originX + td.x, originY - td.y);
      allTiles.push(vis);
    }
  }
  const uniq = [];
  for (let i = 0; i < allTiles.length; i++) {
    const tile = allTiles[i];
    if (isBlank(tile)) continue;
    let found = false;
    for (let ui = 0; ui < uniq.length; ui++) {
      const u = uniq[ui];
      const fx = flipX(tile), fy = flipY(tile), fxy = flipX(flipY(tile));
      if (eq(tile, u)) { uniq[ui] = merge(u, tile); found = true; break; }
      else if (eq(fx, u)) { uniq[ui] = merge(u, fx); found = true; break; }
      else if (eq(fy, u)) { uniq[ui] = merge(u, fy); found = true; break; }
      else if (eq(fxy, u)) { uniq[ui] = merge(u, fxy); found = true; break; }
    }
    if (!found) uniq.push(tile);
  }
  return uniq.length * (spriteMode === '8x8' ? 1 : 2);
}

// flatten states -> metasprites (array of frame tile-arrays)
function statesToMetasprites(states) {
  const out = [];
  for (const st of states) for (const a of st.animations) for (const fr of a.frames) out.push(fr.tiles);
  return out;
}

// --- recolor ---
const GREY_MAP = {
  '0,0,0': [7, 24, 33], '85,85,85': [134, 192, 108],
  '170,170,170': [218, 237, 202], '255,255,255': [101, 255, 0],
};
function recolorPng(file) {
  const p = PNG.sync.read(fs.readFileSync(file));
  let changed = false;
  for (let i = 0; i < p.data.length; i += 4) {
    const k = `${p.data[i]},${p.data[i + 1]},${p.data[i + 2]}`;
    const m = GREY_MAP[k];
    if (m) { if (p.data[i] !== m[0] || p.data[i + 1] !== m[1] || p.data[i + 2] !== m[2]) changed = true; p.data[i] = m[0]; p.data[i + 1] = m[1]; p.data[i + 2] = m[2]; p.data[i + 3] = 255; }
  }
  if (changed) fs.writeFileSync(file, PNG.sync.write(p));
  return changed;
}

function sha1File(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}
function regenIds(obj) {
  if (Array.isArray(obj)) { obj.forEach(regenIds); return; }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if (k === 'id') obj[k] = crypto.randomUUID();
      else regenIds(obj[k]);
    }
  }
}

module.exports = { computeNumTiles, statesToMetasprites, recolorPng, sha1File, regenIds, pngToIndexed };
