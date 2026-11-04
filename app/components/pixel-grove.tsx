"use client";

import { useEffect, useRef } from "react";

// Full-viewport animated pixel-art background: a moonlit gorge where a thin
// fall drops from beneath the moon into a wide, stepped waterfall between two
// mossy cliffs. Blossom trees spill down the cliffs, a stone bridge crosses the
// glowing pool, and bioluminescent plants line the banks.
//
// The scene is drawn into a tiny canvas (180px tall) and scaled up with
// nearest-neighbour sampling. Static layers are painted once into a base
// buffer; each frame copies it and animates the water, glow, stars, drifting
// petals and fireflies on top.

const H = 180;
const FPS_INTERVAL = 1000 / 20;

type RGB = [number, number, number];

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const C = {
  skyTop: hex("#12181b"),
  skyLow: hex("#25302f"),
  moon: hex("#e9f7e6"),
  moonShade: hex("#bcd6c4"),
  moonHalo: hex("#34443f"),
  cliff: hex("#162120"),
  cliffDark: hex("#0e1716"),
  cliffStreak: hex("#1e2d2a"),
  moss: hex("#2c5130"),
  mossLit: hex("#4b7d42"),
  blossomBase: hex("#253133"),
  blossomShade: hex("#6c6a80"),
  blossom: hex("#a9a6bb"),
  blossomLit: hex("#e3e0ee"),
  fallDark: hex("#2b6e64"),
  fallMid: hex("#5abd9f"),
  fallLight: hex("#c6f5dc"),
  foam: hex("#eafff4"),
  upperFall: hex("#3a9586"),
  pool: hex("#1d6366"),
  poolMid: hex("#379c94"),
  poolLight: hex("#9ce6cf"),
  bridge: hex("#3a4144"),
  bridgeDark: hex("#252b2d"),
  bridgeLit: hex("#545d5e"),
  rail: hex("#1a1f21"),
  bush: hex("#0f1e19"),
  bushLit: hex("#1d3829"),
  trunk: hex("#0a0e0f"),
  trunkLit: hex("#1b2423"),
  leaf: hex("#0c1714"),
  leafLit: hex("#1b3124"),
  rock: hex("#272e31"),
  rockLit: hex("#414b4e"),
  stem: hex("#5d7a6c"),
  green: hex("#7dffb5"),
  cyan: hex("#6ff2e6"),
  mint: hex("#c4ffd8"),
  violet: hex("#b69bff"),
  mist: hex("#68dcab"),
  moonGlow: hex("#cfeedd"),
  petal: hex("#e6e2f0"),
  firefly: hex("#d4ff9a"),
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rand: () => number) {
  const v = Array.from({ length: 256 }, rand);
  const n = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = v[i & 255];
    const b = v[(i + 1) & 255];
    return a + (b - a) * f * f * (3 - 2 * f);
  };
  return (x: number) => n(x) * 0.6 + n(x * 2.1 + 40) * 0.3 + n(x * 4.3 + 90) * 0.1;
}

const hash = (x: number, y: number, z = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

type Light = { x: number; y: number; r: number; color: RGB; phase: number; speed: number; strength: number };

// Glow footprints, quantized into a few bands so halos read as pixel art.
const glowCache = new Map<number, { dx: number; dy: number; f: number }[]>();
function glowOffsets(r: number) {
  let list = glowCache.get(r);
  if (list) return list;
  list = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy * 1.15) / r;
      if (d >= 1) continue;
      const f = Math.ceil((1 - d) ** 2 * 5) / 5;
      list.push({ dx, dy, f });
    }
  }
  glowCache.set(r, list);
  return list;
}

const FALL_TOP = 64;
const TIER = 13;

type Scene = {
  W: number;
  base: Uint8ClampedArray;
  mainFall: number[];
  upperFall: number[];
  lowerFall: number[];
  pool: number[];
  lights: Light[];
  stars: { i: number; phase: number; speed: number; big: boolean }[];
  petals: { x: number; y: number; phase: number; speed: number }[];
  flies: { x: number; y: number; phase: number; sx: number; sy: number }[];
};

function buildScene(W: number): Scene {
  const rand = mulberry32(11);
  const noise = makeNoise(rand);
  const base = new Uint8ClampedArray(W * H * 4);
  // 0 solid, 1 main fall, 2 pool, 3 upper fall, 4 lower cascade
  const kind = new Uint8Array(W * H);

  const px = (x: number, y: number, c: RGB, k = 0) => {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    base[i * 4] = c[0];
    base[i * 4 + 1] = c[1];
    base[i * 4 + 2] = c[2];
    base[i * 4 + 3] = 255;
    kind[i] = k;
  };
  const dither = (x: number, y: number, a: RGB, b: RGB, t: number) => (t > bayer(x, y) ? b : a);
  const disc = (cx: number, cy: number, r: number, fill: (x: number, y: number) => RGB | null) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x - cx) ** 2 + ((y - cy) * 1.2) ** 2 <= r * r) {
          const c = fill(x, y);
          if (c) px(x, y, c);
        }
  };
  // Tapered thick line, used for trunks and branches.
  const limb = (pts: [number, number][], w0: number, w1: number) => {
    let total = 0;
    for (let s = 1; s < pts.length; s++) total += Math.hypot(pts[s][0] - pts[s - 1][0], pts[s][1] - pts[s - 1][1]);
    let done = 0;
    for (let s = 1; s < pts.length; s++) {
      const [x0, y0] = pts[s - 1];
      const [x1, y1] = pts[s];
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let d = 0; d <= len; d += 0.5) {
        const u = d / len;
        const x = x0 + (x1 - x0) * u;
        const y = y0 + (y1 - y0) * u;
        const w = (w0 + (w1 - w0) * ((done + d) / total)) / 2;
        for (let dx = -w; dx <= w; dx++) px(x + dx, y, dx > w - 1.5 && hash(x + dx, y) > 0.4 ? C.trunkLit : C.trunk);
      }
      done += len;
    }
  };

  const lights: Light[] = [];
  const addLight = (x: number, y: number, r: number, color: RGB, strength = 1, speed = 0.6 + rand() * 1.2) =>
    lights.push({ x, y, r, color, phase: rand() * 6.28, speed, strength });

  const fx = Math.round(W * 0.6); // fall centre line
  const lipL = Math.round(fx - W * 0.055);
  const lipR = Math.round(fx + W * 0.055);
  const fallBottom = 150;
  // The curtain spills further left with each ledge; the right edge hugs the cliff.
  const fallLeft = (y: number) => {
    const k = Math.floor((y - FALL_TOP) / TIER);
    return lipL - 3 * k - Math.round(hash(k, 7) * 2);
  };
  const fallRight = (y: number) => lipR + (y - FALL_TOP > TIER * 3 ? 1 : 0);

  // Sky.
  for (let y = 0; y < 110; y++)
    for (let x = 0; x < W; x++) px(x, y, dither(x, y, C.skyTop, C.skyLow, y / 90));

  const stars: Scene["stars"] = [];
  for (let n = 0; n < W * 0.12; n++) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * 55);
    stars.push({ i: y * W + x, phase: rand() * 6.28, speed: 0.4 + rand() * 1.5, big: rand() < 0.25 });
  }

  // Thin fall pouring from beneath the moon.
  for (let y = 30; y < FALL_TOP + 2; y++)
    for (let x = fx - 3; x <= fx + 3; x++) px(x, y, C.upperFall, 3);

  // Moon with a dithered halo.
  const my = 24;
  for (let y = my - 30; y <= my + 30; y++)
    for (let x = fx - 30; x <= fx + 30; x++) {
      const d = Math.hypot(x - fx, y - my);
      if (d > 12 && d < 30 && (1 - (d - 12) / 18) * 0.7 > bayer(x, y) && kind[y * W + x] === 0) px(x, y, C.moonHalo);
    }
  disc(fx, my, 13, (x, y) => (Math.hypot(x - fx + 4, y - my - 3) < 4 || hash(x, y) > 0.88 ? C.moonShade : C.moon));
  addLight(fx, my, 34, C.moonGlow, 0.35, 0.25);

  // Cliffs either side of the fall, streaked faces and mossy rims.
  const cliffTop = (x: number) =>
    x < lipL
      ? FALL_TOP - ((lipL - x) / lipL) * 24 + noise(x * 0.08) * 6
      : FALL_TOP - 2 - ((x - lipR) / (W - lipR)) * 22 + noise(x * 0.08 + 50) * 6;
  for (let x = 0; x < W; x++) {
    if (x >= lipL && x <= lipR) continue;
    const top = Math.floor(cliffTop(x));
    const streak = hash(x, 0) > 0.6;
    const drip = Math.floor(hash(x, 3) * hash(x, 4) * 10);
    for (let y = top; y < 160; y++) {
      const depth = (y - top) / 90;
      let c = dither(x, y, streak ? C.cliffStreak : C.cliff, C.cliffDark, depth);
      if (y - top < 2) c = dither(x, y, C.moss, C.mossLit, 0.5);
      else if (y - top < 4 + drip) c = C.moss;
      px(x, y, c);
    }
  }

  // Main fall: stepped tiers widening toward the pool.
  for (let y = FALL_TOP; y < fallBottom; y++)
    for (let x = fallLeft(y); x <= fallRight(y); x++) px(x, y, C.fallMid, 1);

  // Blossom canopies spilling down the cliffs.
  // Each canopy is a loose cluster of smaller puffs so it reads as layered foliage.
  const puff = (cx: number, cy: number, r: number) =>
    disc(cx, cy, r, (x, y) => {
      if (kind[y * W + x] === 1 || kind[y * W + x] === 3) return null;
      const h = hash(x, y);
      const shade = (x - cx) / r + (y - cy) / r; // light from upper left
      if (h > 0.45) return shade > 0.7 ? C.blossomShade : h > 0.8 && shade < 0.2 ? C.blossomLit : C.blossom;
      return C.blossomBase;
    });
  const blossom = (cx: number, cy: number, r: number) => {
    const n = 4 + Math.floor(r / 3);
    for (let p = 0; p < n; p++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.7;
      puff(cx + Math.cos(a) * d * 1.3, cy + Math.sin(a) * d * 0.6 + (rand() - 0.3) * 3, r * (0.35 + rand() * 0.25));
    }
  };
  const leftClumps: [number, number, number][] = [
    [0.03, 36, 15], [0.12, 30, 14], [0.22, 34, 14], [0.32, 44, 12], [0.43, 52, 11],
    [0.27, 70, 9], [0.38, 64, 8],
  ];
  const rightClumps: [number, number, number][] = [
    [0.69, 60, 8], [0.76, 52, 12], [0.86, 44, 13], [0.97, 48, 13],
    [0.72, 92, 10], [0.8, 84, 12], [0.9, 100, 13], [0.75, 116, 9], [0.84, 126, 11],
  ];
  for (const [u, y, r] of [...leftClumps, ...rightClumps]) blossom(W * u, y, r);

  // Pool, the outlet channel and a small cascade over rocks at the bottom.
  const poolCx = W * 0.54;
  const inPool = (x: number, y: number) =>
    ((x - poolCx) / (W * 0.16)) ** 2 + ((y - 154) / 10) ** 2 <= 1 ||
    (y >= 154 && y < 167 && x > W * 0.48 && x < W * 0.6);
  for (let y = 140; y < 168; y++)
    for (let x = 0; x < W; x++) if (inPool(x, y)) px(x, y, C.pool, 2);
  for (let y = 167; y < H; y++)
    for (let x = Math.round(W * 0.515); x <= W * 0.565; x++) px(x, y, C.fallMid, 4);

  // Banks: dark bush mounds.
  const bush = (cx: number, cy: number, r: number) =>
    disc(cx, cy, r, (x, y) => (y < cy - r * 0.3 && hash(x, y) > 0.55 ? C.bushLit : C.bush));
  for (let n = 0; n < 7; n++) bush(W * (0.02 + n * 0.06), 168 + rand() * 6, 12 + rand() * 6);
  for (let n = 0; n < 6; n++) bush(W * (0.7 + n * 0.06), 154 + n * 3 + rand() * 6, 11 + rand() * 7);
  bush(W * 0.36, 146, 9);
  bush(W * 0.68, 146, 8);

  const rocks: [number, number, number][] = [
    [0.46, 170, 7], [0.63, 168, 8], [0.44, 179, 7], [0.65, 179, 7], [0.54, 182, 4], [0.69, 158, 5],
  ];
  for (const [u, y, r] of rocks)
    disc(W * u, y, r, (x, yy) => (yy < y - r * 0.5 || (hash(x, yy) > 0.85 && yy < y) ? C.rockLit : C.rock));

  // Arched stone bridge with a lattice railing.
  const bx0 = Math.round(W * 0.15);
  const bx1 = Math.round(W * 0.47);
  for (let x = bx0; x <= bx1; x++) {
    const u = (x - bx0) / (bx1 - bx0);
    const deck = Math.round(156 - u * 8 - Math.sin(u * Math.PI) * 7);
    const archU = (u - 0.62) / 0.3;
    const archTop = Math.abs(archU) < 1 ? deck + 4 + (1 - Math.sqrt(1 - archU * archU)) * 14 : 999;
    const bottom = 172 - u * 10;
    for (let y = deck; y < bottom; y++) {
      if (y >= archTop) {
        if (!inPool(x, y)) px(x, y, C.bridgeDark);
        continue;
      }
      const row = Math.floor((y - deck) / 3);
      const mortar = (y - deck) % 3 === 0 || (x + (row % 2) * 2) % 5 === 0;
      px(x, y, y === deck ? C.bridgeLit : mortar ? C.bridgeDark : C.bridge);
    }
    for (let y = deck - 5; y < deck; y++) {
      const top = y === deck - 5;
      const post = x % 6 === 0;
      const lattice = (x + y) % 3 === 0 || (x - y + 300) % 3 === 0;
      if (top || post || lattice) px(x, y, top && hash(x, 1) > 0.5 ? C.bridgeDark : C.rail);
    }
  }

  // Bioluminescent plants.
  const mushroom = (x: number, y: number, s: number, color: RGB) => {
    for (let d = 0; d < s + 1; d++) px(x, y - d, C.stem);
    for (let dx = -s; dx <= s; dx++) px(x + dx, y - s - 1, color);
    for (let dx = -s + 1; dx <= s - 1; dx++) px(x + dx, y - s - 2, color);
    addLight(x, y - s - 1, 5 + s * 2, color);
  };
  const stalk = (x: number, y: number, h: number, color: RGB) => {
    const lean = (rand() - 0.5) * 0.4;
    for (let d = 0; d < h; d++) px(x + Math.round(lean * d), y - d, C.stem);
    const tx = x + Math.round(lean * h);
    const ty = y - h;
    px(tx, ty, color);
    px(tx + 1, ty, color);
    px(tx, ty - 1, color);
    px(tx + 1, ty - 1, color);
    addLight(tx, ty, 7 + Math.round(h * 0.3), color);
  };
  const fern = (x: number, y: number, color: RGB) => {
    for (let b = -3; b <= 3; b++) {
      const h = 2 + Math.floor(rand() * 4) - Math.abs(b) / 2;
      for (let d = 0; d < h; d++) px(x + b + Math.round((b * d) / 6), y - d, d >= h - 1 ? color : C.bushLit);
    }
    addLight(x, y - 3, 6, color, 0.7);
  };
  const glowPalette = [C.green, C.green, C.cyan, C.mint, C.violet];
  const plant = (x: number, y: number, scale: number) => {
    const color = glowPalette[Math.floor(rand() * glowPalette.length)];
    const pick = rand();
    if (pick < 0.4) mushroom(x, y, Math.max(1, Math.round(scale * 2)), color);
    else if (pick < 0.7) stalk(x, y, Math.round(5 + scale * 10 * (0.5 + rand())), color);
    else fern(x, y, color);
  };
  // Along the far side of the pool and the right bank.
  for (let n = 0; n < 9; n++) plant(Math.round(W * (0.66 + rand() * 0.3)), Math.round(150 + rand() * 26), 1 + rand());
  // Near the bridge foot and the left bank.
  for (let n = 0; n < 9; n++) plant(Math.round(W * (0.02 + rand() * 0.3)), Math.round(163 + rand() * 15), 1 + rand());
  // Under the bridge and at the pool rim.
  for (let n = 0; n < 5; n++) plant(Math.round(W * (0.36 + rand() * 0.08)), Math.round(146 + rand() * 4), 0.6);
  // Tucked into cliff ledges.
  for (let n = 0; n < 6; n++) {
    const x = Math.round(rand() < 0.5 ? W * (0.05 + rand() * 0.4) : W * (0.68 + rand() * 0.3));
    plant(x, Math.round(cliffTop(x) + 8 + rand() * 50), 0.4);
  }

  // Framing trees: a slender one left, a heavy leaning trunk right.
  limb([[W * 0.1, H + 4], [W * 0.13, 120], [W * 0.1, 60], [W * 0.06, -4]], 7, 3);
  limb([[W * 0.125, 112], [W * 0.22, 92], [W * 0.33, 76]], 3, 1);
  limb([[W * 0.11, 78], [W * 0.03, 56], [-4, 50]], 3, 1);
  limb([[W * 0.1, 64], [W * 0.2, 36], [W * 0.27, 18]], 2.5, 1);
  limb([[W * 0.17, 102], [W * 0.18, 86]], 1.5, 1);
  blossom(W * 0.21, 84, 11);
  blossom(W * 0.08, 96, 12);
  blossom(W * 0.3, 74, 7);

  limb([[W * 0.93, H + 4], [W * 0.95, 120], [W * 0.88, 50], [W * 0.84, -4]], 13, 7);
  limb([[W * 0.88, 44], [W * 0.75, 18], [W * 0.62, -4]], 5, 2);
  limb([[W * 0.91, 74], [W * 0.99, 56], [W + 4, 48]], 4, 2);
  limb([[W * 0.86, 30], [W * 0.95, 8], [W, -2]], 3, 2);
  // Dark leaves hanging across the top right, partly over the moon.
  for (let n = 0; n < 16; n++) {
    const cx = W * (0.56 + rand() * 0.46);
    const cy = rand() * 12 - 4;
    disc(cx, cy, 6 + rand() * 9, (x, y) => (hash(x, y) > 0.7 && y > cy ? C.leafLit : C.leaf));
  }
  for (let n = 0; n < 22; n++) {
    const x = Math.round(W * (0.58 + rand() * 0.42));
    const len = 6 + Math.floor(rand() * 22);
    for (let d = 0; d < len; d++) if (hash(x, d) > 0.15) px(x + Math.round(Math.sin(d * 0.4) * 0.6), 6 + d, C.leaf);
  }

  // Foreground bushes at the very bottom corners.
  for (let n = 0; n < 4; n++) bush(W * (n * 0.07), 182, 12 + rand() * 6);
  for (let n = 0; n < 4; n++) bush(W * (0.78 + n * 0.08), 182, 12 + rand() * 6);
  for (let n = 0; n < 5; n++) plant(Math.round(W * (rand() < 0.5 ? rand() * 0.2 : 0.8 + rand() * 0.2)), 176 + Math.floor(rand() * 4), 1.6);

  // Mist glow where the fall meets the pool, and along the fall itself.
  addLight(fx - 6, fallBottom - 2, 30, C.mist, 0.9, 0.35);
  addLight(poolCx, 156, 22, C.mist, 0.6, 0.5);
  for (let y = FALL_TOP + 6; y < fallBottom - 10; y += 14) addLight(fx - (y - FALL_TOP) / 8, y, 16, C.mist, 0.35, 0.4);
  addLight(W * 0.54, 172, 12, C.mist, 0.5, 0.6);

  const petals: Scene["petals"] = [];
  for (let n = 0; n < Math.round(W * 0.1); n++)
    petals.push({ x: rand() * W, y: rand() * H, phase: rand() * 6.28, speed: 3 + rand() * 6 });

  const flies: Scene["flies"] = [];
  for (let n = 0; n < Math.round(W * 0.06); n++)
    flies.push({ x: rand() * W, y: 110 + rand() * 65, phase: rand() * 6.28, sx: 0.2 + rand() * 0.4, sy: 0.3 + rand() * 0.5 });

  const mainFall: number[] = [];
  const upperFall: number[] = [];
  const lowerFall: number[] = [];
  const pool: number[] = [];
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] === 1) mainFall.push(i);
    else if (kind[i] === 2) pool.push(i);
    else if (kind[i] === 3) upperFall.push(i);
    else if (kind[i] === 4) lowerFall.push(i);
  }

  return { W, base, mainFall, upperFall, lowerFall, pool, lights, stars, petals, flies };
}

function renderFrame(s: Scene, frame: Uint8ClampedArray, t: number) {
  const { W } = s;
  frame.set(s.base);
  const put = (i: number, c: RGB) => {
    frame[i * 4] = c[0];
    frame[i * 4 + 1] = c[1];
    frame[i * 4 + 2] = c[2];
  };
  const add = (i: number, c: RGB, k: number) => {
    if (i < 0 || i >= W * H) return;
    frame[i * 4] += c[0] * k;
    frame[i * 4 + 1] += c[1] * k;
    frame[i * 4 + 2] += c[2] * k;
  };
  const tick = Math.floor(t * 12);

  // Falling water: per-column streaks scrolling down.
  const streak = (x: number, y: number, speed: number, len: number) => {
    const v = (y + hash(x, 2) * 30 - t * (speed + hash(x, 1) * speed * 0.6)) / len;
    return v - Math.floor(v);
  };

  for (const i of s.upperFall) {
    const x = i % W;
    const y = (i / W) | 0;
    const st = streak(x, y, 26, 9);
    put(i, st < 0.2 ? C.fallMid : C.upperFall);
  }

  for (const i of s.mainFall) {
    const x = i % W;
    const y = (i / W) | 0;
    const tierY = (y - FALL_TOP + Math.round(Math.sin(x * 0.7) * 1.5) + TIER) % TIER;
    const st = streak(x, y, 34, 8);
    let c = st < 0.16 ? C.fallLight : st < 0.55 ? C.fallMid : C.fallDark;
    // Each tier's lip curls over in a bright band; the curtain darkens below it.
    if (tierY < 2 && hash(x, Math.floor((y - FALL_TOP) / TIER)) > 0.3) c = hash(x, y, tick) > 0.3 ? C.fallLight : C.foam;
    else if (tierY > TIER - 3 && st > 0.4) c = C.fallDark;
    if (y > 143 && hash(x, y, tick) > 0.4) c = C.foam;
    put(i, c);
  }

  for (const i of s.lowerFall) {
    const x = i % W;
    const y = (i / W) | 0;
    const st = streak(x, y, 30, 6);
    put(i, st < 0.25 ? C.foam : st < 0.6 ? C.fallMid : C.fallDark);
  }

  // Pool: rings spreading out from the fall, plus drifting ripples.
  for (const i of s.pool) {
    const x = i % W;
    const y = (i / W) | 0;
    const n =
      Math.sin((y - t * 7) * 0.9 + Math.sin(x * 0.2 + t * 0.6) * 1.8) * 0.6 +
      Math.sin(x * 0.13 - y * 0.3 + t * 1.1) * 0.4;
    let c = n > 0.8 ? C.poolLight : n > 0.35 ? C.poolMid : C.pool;
    if (y < 151 && hash(x, y, tick) > 0.65) c = C.foam;
    put(i, c);
  }

  // Twinkling stars; the brightest flare into small crosses.
  for (const st of s.stars) {
    const k = 0.5 + 0.5 * Math.sin(t * st.speed + st.phase);
    add(st.i, C.petal, k * 0.8);
    if (st.big && k > 0.7) {
      add(st.i - 1, C.petal, 0.4);
      add(st.i + 1, C.petal, 0.4);
      add(st.i - W, C.petal, 0.4);
      add(st.i + W, C.petal, 0.4);
    }
  }

  // Pulsing glow from the plants, the fall's mist and the moon.
  for (const l of s.lights) {
    const k = (0.6 + 0.4 * Math.sin(t * l.speed + l.phase)) * l.strength * 0.45;
    for (const o of glowOffsets(l.r)) {
      const X = Math.floor(l.x) + o.dx;
      const Y = Math.floor(l.y) + o.dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      add(Y * W + X, l.color, o.f * k);
    }
  }

  // Petals drifting down across the scene.
  for (const p of s.petals) {
    const Y = Math.floor((p.y + t * p.speed) % H);
    const X = Math.floor((((p.x + Math.sin(t * 0.8 + p.phase) * 6 - t * 2) % W) + W) % W);
    add(Y * W + X, C.petal, 0.55);
  }

  // Fireflies.
  for (const f of s.flies) {
    const X = Math.round(f.x + Math.sin(t * f.sx + f.phase) * 14);
    const Y = Math.round(f.y + Math.sin(t * f.sy + f.phase * 2) * 8);
    const blink = Math.max(0, Math.sin(t * 1.3 + f.phase * 3));
    if (blink < 0.1 || X < 1 || Y < 1 || X >= W - 1 || Y >= H - 1) continue;
    put(Y * W + X, C.firefly);
    for (const o of glowOffsets(3)) add((Y + o.dy) * W + X + o.dx, C.firefly, o.f * blink * 0.25);
  }
}

export default function PixelGrove() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current!;
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      imageRendering: "pixelated",
    });
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let scene: Scene | null = null;
    let image: ImageData | null = null;
    let raf = 0;
    let last = 0;

    const draw = (now: number) => {
      if (!scene || !image) return;
      renderFrame(scene, image.data, (now - start) / 1000);
      ctx.putImageData(image, 0, 0);
    };

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      // Narrow screens crop the sides (object-fit: cover) rather than squeeze the gorge.
      const W = Math.min(480, Math.max(220, Math.round((H * width) / Math.max(1, height))));
      if (scene?.W === W) return;
      canvas.width = W;
      canvas.height = H;
      scene = buildScene(W);
      image = ctx.createImageData(W, H);
      draw(performance.now());
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    if (!reduceMotion) {
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (document.hidden || now - last < FPS_INTERVAL) return;
        last = now;
        draw(now);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.remove();
    };
  }, []);

  return <div ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "#12181b" }} />;
}
