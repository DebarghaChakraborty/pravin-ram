'use strict';
// Level layout: a tile grid built from random "chunks" (flat run, pit, blocks, pipes, stairs, platforms).
const TILE = 36, ROWS = 15, GROUND_ROW = 13;

const T = {
  EMPTY: 0, GROUND: 1, BRICK: 2, QCOIN: 3, QMUSH: 4, USED: 5, HARD: 6,
  PIPE_TL: 7, PIPE_TR: 8, PIPE_L: 9, PIPE_R: 10,
};

// Small seeded random generator: the same seed always rebuilds the same level (used after losing a life).
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateLevel(num, seed) {
  const rnd = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const chance = p => rnd() < p;

  const targetCols = Math.min(110 + num * 20, 230);
  const stride = targetCols + 80;
  const tiles = new Uint8Array(stride * ROWS);
  const coins = [], enemies = [], deco = [];

  const danger = Math.min(0.35 + num * 0.1, 0.9);       // how likely a chunk gets an enemy
  const redChance = num < 2 ? 0 : Math.min(num * 0.1, 0.5);
  const maxGap = Math.min(2 + Math.ceil(num / 2), 4);
  let sinceMush = 9;

  const set = (c, r, t) => { if (c >= 0 && c < stride && r >= 0 && r < ROWS) tiles[r * stride + c] = t; };
  const get = (c, r) => tiles[r * stride + c];
  const ground = (c0, n) => {
    for (let c = c0; c < c0 + n; c++) { set(c, GROUND_ROW, T.GROUND); set(c, GROUND_ROW + 1, T.GROUND); }
  };
  const coin = (c, r) => coins.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, taken: false });
  const enemy = c => enemies.push({ col: c, type: chance(redChance) ? 'red' : 'goomba' });
  const pipe = (c, h) => {
    const top = GROUND_ROW - h;
    set(c, top, T.PIPE_TL); set(c + 1, top, T.PIPE_TR);
    for (let r = top + 1; r < GROUND_ROW; r++) { set(c, r, T.PIPE_L); set(c + 1, r, T.PIPE_R); }
  };

  const chunks = {
    flat(x) {
      const w = ri(6, 9);
      ground(x, w);
      if (chance(danger)) enemy(x + ri(3, w - 1));
      if (num >= 3 && chance(danger - 0.3)) enemy(x + ri(2, w - 2));
      if (chance(0.5)) {
        const rows = [11, 10, 10, 11];
        rows.forEach((r, i) => coin(x + 1 + i, r));
      }
      return w;
    },

    gap(x) {
      const g = ri(2, maxGap);
      ground(x, 2);
      ground(x + 2 + g, 3);
      if (chance(0.7)) for (let i = 0; i < g; i++) coin(x + 2 + i, i === 0 || i === g - 1 ? 10 : 9);
      return g + 5;
    },

    blocks(x, forceMush) {
      const w = ri(9, 11), n = ri(3, 5), c0 = x + 2, r = GROUND_ROW - 4;
      ground(x, w);
      for (let i = 0; i < n; i++) set(c0 + i, r, i % 2 === 1 || chance(0.2) ? T.QCOIN : T.BRICK);
      if (forceMush || (sinceMush >= 3 && chance(0.6))) {
        set(c0 + ri(0, n - 1), r, T.QMUSH);
        sinceMush = 0;
      }
      if (n >= 4 && chance(0.5)) {            // bonus block higher up, reached from the lower row
        const c = c0 + ri(1, n - 2);
        set(c, r - 4, T.QCOIN);
        if (chance(0.5)) { set(c - 1, r - 4, T.BRICK); set(c + 1, r - 4, T.BRICK); }
      } else if (chance(0.4)) {
        for (let i = 0; i < n; i++) coin(c0 + i, r - 1);
      }
      if (chance(danger)) enemy(x + ri(4, w - 1));
      return w;
    },

    pipes(x) {
      ground(x, 11);
      const h1 = ri(2, 3), h2 = ri(2, 3);
      pipe(x + 2, h1);
      pipe(x + 7, h2);
      coin(x + 2.5, GROUND_ROW - h1 - 2);
      coin(x + 7.5, GROUND_ROW - h2 - 2);
      if (chance(danger)) enemy(x + 5);
      return 11;
    },

    stairs(x) {
      const h = ri(3, 4), g = ri(2, 3), pit = num >= 2 && chance(0.6);
      ground(x, 1 + h);
      if (!pit) ground(x + 1 + h, g);
      ground(x + 1 + h + g, h + 1);
      for (let i = 0; i < h; i++) {
        for (let j = 0; j <= i; j++) set(x + 1 + i, GROUND_ROW - 1 - j, T.HARD);
        for (let j = 0; j < h - i; j++) set(x + 1 + h + g + i, GROUND_ROW - 1 - j, T.HARD);
      }
      for (let i = 0; i < g; i++) coin(x + 1 + h + i, GROUND_ROW - h - 3);
      return 2 * h + g + 2;
    },

    platforms(x) {
      ground(x, 2);
      let c = x + 2;
      const n = ri(1, 2);
      for (let i = 0; i < n; i++) {
        c += ri(2, 3);
        const r = GROUND_ROW - ri(1, 3), len = ri(2, 3);
        for (let k = 0; k < len; k++) { set(c + k, r, T.HARD); coin(c + k, r - 1); }
        c += len;
      }
      c += ri(2, 3);
      ground(c, 3);
      return c + 3 - x;
    },
  };

  const weights = { flat: 2, gap: 2, blocks: 3, pipes: 2, stairs: 1.2, platforms: num >= 2 ? 2 : 0.6 };
  const names = Object.keys(weights);
  const pick = last => {
    const pool = names.filter(n => n !== last);
    let roll = rnd() * pool.reduce((s, n) => s + weights[n], 0);
    for (const n of pool) { roll -= weights[n]; if (roll <= 0) return n; }
    return pool[0];
  };

  // Start zone, then a guaranteed power-up, then random chunks.
  ground(0, 12);
  let x = 12;
  x += chunks.blocks(x, true);
  let last = 'blocks';
  while (x < targetCols) {
    last = pick(last);
    x += chunks[last](x);
    sinceMush++;
  }

  // End zone: big staircase, flag pole, castle.
  const e = x;
  ground(e, 34);
  for (let i = 0; i < 6; i++) for (let j = 0; j <= i; j++) set(e + 3 + i, GROUND_ROW - 1 - j, T.HARD);
  for (let j = 0; j < 6; j++) set(e + 9, GROUND_ROW - 1 - j, T.HARD);
  const flagCol = e + 15, castleCol = e + 21, cols = e + 34;

  // Bushes on free ground
  for (let c = 2; c < cols - 3; c += ri(5, 11)) {
    const size = ri(1, 3);
    let free = true;
    for (let k = -1; k <= size; k++) {
      if (get(c + k, GROUND_ROW) !== T.GROUND || get(c + k, GROUND_ROW - 1) !== T.EMPTY) free = false;
    }
    if (free && Math.abs(c - flagCol) > 2 && (c + size < castleCol || c > castleCol + 5)) deco.push({ col: c, size });
  }

  return {
    num, cols, stride, tiles, coins, enemies, deco,
    theme: (num - 1) % 3,
    flagX: flagCol * TILE + TILE / 2,
    flagTop: 3 * TILE,
    castleX: castleCol * TILE,
  };
}
