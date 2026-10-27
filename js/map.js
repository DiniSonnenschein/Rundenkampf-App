/*
 * Map eines Levels: Raster aus quadratischen Feldern.
 * Gespeichert als Zeilen-Strings, y = 0 ist die oberste Reihe.
 *   .  Boden    #  Wand    S  Startfeld (Allys)    G  Ziel
 * Abstände werden in Schritten gemessen, diagonal zählt wie gerade (Schachkönig).
 */
(function (global) {
  'use strict';

  const TILES = {
    '.': { name: 'Boden' },
    '#': { name: 'Wand' },
    S: { name: 'Start' },
    G: { name: 'Ziel' },
  };
  const LIMITS = { minW: 3, maxW: 20, minH: 3, maxH: 30 };
  const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  function clampInt(v, min, max, fallback) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }

  /** Neue Map: oberste Reihe Ziel, unten mittig drei Startfelder. */
  function create(w, h) {
    w = clampInt(w, LIMITS.minW, LIMITS.maxW, 7);
    h = clampInt(h, LIMITS.minH, LIMITS.maxH, 10);
    const rows = [];
    for (let y = 0; y < h; y++) rows.push('.'.repeat(w));
    rows[0] = 'G'.repeat(w);
    const mid = Math.floor(w / 2);
    rows[h - 1] = rows[h - 1].split('').map((c, x) => (Math.abs(x - mid) <= 1 ? 'S' : c)).join('');
    return { w, h, rows };
  }

  function normalize(map) {
    if (!map || !Array.isArray(map.rows)) return create();
    const w = clampInt(map.w, LIMITS.minW, LIMITS.maxW, 7);
    const h = clampInt(map.h, LIMITS.minH, LIMITS.maxH, 10);
    const rows = [];
    for (let y = 0; y < h; y++) {
      const src = String(map.rows[y] || '');
      let row = '';
      for (let x = 0; x < w; x++) row += TILES[src[x]] ? src[x] : '.';
      rows.push(row);
    }
    return { w, h, rows };
  }

  function inside(map, x, y) {
    return x >= 0 && y >= 0 && x < map.w && y < map.h;
  }

  function get(map, x, y) {
    return inside(map, x, y) ? map.rows[y][x] : '#';
  }

  function set(map, x, y, ch) {
    if (!inside(map, x, y) || !TILES[ch]) return;
    const row = map.rows[y];
    map.rows[y] = row.slice(0, x) + ch + row.slice(x + 1);
  }

  function passable(map, x, y) {
    return inside(map, x, y) && get(map, x, y) !== '#';
  }

  function dist(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  function key(map, x, y) {
    return y * map.w + x;
  }

  function tilesOf(map, ch) {
    const out = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.rows[y][x] === ch) out.push({ x, y });
    return out;
  }

  /** Startfelder (oder unterste Reihe), von unten-mitte nach außen sortiert. */
  function startTiles(map) {
    let tiles = tilesOf(map, 'S');
    if (!tiles.length) {
      for (let x = 0; x < map.w; x++) if (passable(map, x, map.h - 1)) tiles.push({ x, y: map.h - 1 });
    }
    const mid = (map.w - 1) / 2;
    return tiles.sort((a, b) => b.y - a.y || Math.abs(a.x - mid) - Math.abs(b.x - mid) || a.x - b.x);
  }

  /** Zielfelder (oder oberste Reihe). */
  function goalTiles(map) {
    const tiles = tilesOf(map, 'G');
    if (tiles.length) return tiles;
    const out = [];
    for (let x = 0; x < map.w; x++) if (passable(map, x, 0)) out.push({ x, y: 0 });
    return out;
  }

  /** Begehbare Nachbarfelder. Diagonal nur, wenn nicht beide Ecken Wände sind. */
  function neighbors(map, x, y) {
    const out = [];
    DIRS.forEach(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      if (!passable(map, nx, ny)) return;
      if (dx && dy && !passable(map, x + dx, y) && !passable(map, x, y + dy)) return;
      out.push({ x: nx, y: ny });
    });
    return out;
  }

  /**
   * Breitensuche. Liefert Map key → Schritte.
   * @param {function} [canEnter] (x, y) => boolean, zusätzlich zu "begehbar"
   * @param {number}   [maxSteps]
   * @param {function} [stopAt]   (x, y) => boolean: hier endet die Bewegung (gilt nicht für Startfelder)
   */
  function bfs(map, sources, canEnter, maxSteps, stopAt) {
    const out = new Map();
    const queue = [];
    sources.forEach((s) => {
      const k = key(map, s.x, s.y);
      if (!out.has(k)) { out.set(k, 0); queue.push(s); }
    });
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      const d = out.get(key(map, cur.x, cur.y));
      if (maxSteps != null && d >= maxSteps) continue;
      if (d > 0 && stopAt && stopAt(cur.x, cur.y)) continue;
      neighbors(map, cur.x, cur.y).forEach((n) => {
        const k = key(map, n.x, n.y);
        if (out.has(k) || (canEnter && !canEnter(n.x, n.y))) return;
        out.set(k, d + 1);
        queue.push(n);
      });
    }
    return out;
  }

  /**
   * Größe ändern. Erste und letzte Reihe (Ziel/Start) bleiben erhalten,
   * Reihen werden in der Mitte eingefügt bzw. entfernt, Spalten rechts.
   * Passt die Positionen in `placements` ({x, y}) an und entfernt ungültige.
   */
  function resize(map, w, h, placements) {
    w = clampInt(w, LIMITS.minW, LIMITS.maxW, map.w);
    h = clampInt(h, LIMITS.minH, LIMITS.maxH, map.h);
    let rows = map.rows.map((r) => (r.length >= w ? r.slice(0, w) : r + '.'.repeat(w - r.length)));
    const oldH = map.h;
    if (h > oldH) {
      const extra = [];
      for (let i = 0; i < h - oldH; i++) extra.push('.'.repeat(w));
      rows = rows.slice(0, oldH - 1).concat(extra, rows.slice(oldH - 1));
    } else if (h < oldH) {
      rows = rows.slice(0, h - 1).concat(rows.slice(oldH - 1));
    }
    const kept = (placements || []).filter((p) => {
      if (p.x >= w) return false;
      if (p.y === oldH - 1) { p.y = h - 1; return true; }
      return p.y < h - 1;
    });
    if (placements) placements.splice(0, placements.length, ...kept);
    map.w = w;
    map.h = h;
    map.rows = rows;
    return map;
  }

  const GridMap = { TILES, LIMITS, create, normalize, inside, get, set, passable, dist, key, startTiles, goalTiles, neighbors, bfs, resize };
  if (typeof module !== 'undefined' && module.exports) module.exports = GridMap;
  else global.GridMap = GridMap;
})(this);
