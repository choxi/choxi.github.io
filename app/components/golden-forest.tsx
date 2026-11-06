"use client";

import { useEffect, useRef } from "react";

// Full-viewport animated pixel-art background built on a painted scene: a
// night forest under golden canopies, a waterfall at the back of a clearing
// feeding a stream over mossy rocks, and a glowing ring on the left.
//
// The 16:9 painting is sampled down to a small canvas (455x256) and scaled
// back up with nearest-neighbour sampling, so every effect lands on the same
// coarse pixel grid as the art. A 16:9 screen shows all of it; narrower
// screens crop the sides and wider ones the top and bottom. On load the image
// is scanned for its golden leaves, waterfall, stream, trunks and misty
// distance; the lower stream is turned into a pond, glowing plants are
// painted in, and the colours are varied. Each frame copies that base and
// animates the canopy, water, mist and glow, then adds fish, drifting leaves,
// fireflies and the ring's gold dust on top.

const SRC = "/assets/golden-forest.webp";
const W = 455;
const H = 256;
const FPS_INTERVAL = 1000 / 20;

type RGB = [number, number, number];

const GOLD: RGB = [255, 206, 60];
const GOLD_PALE: RGB = [255, 240, 160];
const AMBER: RGB = [240, 160, 20];
const CORAL: RGB = [255, 120, 70];
const MIST: RGB = [120, 200, 220];
const MIST_VIOLET: RGB = [160, 140, 240];
const FOAM: RGB = [200, 238, 255];
const SPARKLE: RGB = [240, 252, 255];
const FIREFLIES: RGB[] = [
  [255, 226, 120],
  [160, 255, 170],
  [130, 235, 255],
];

const FALL_LIGHT: RGB = [196, 236, 248];
const FALL_FOAM: RGB = [232, 250, 255];

const POND_DEEP: RGB = [8, 62, 108];
const POND: RGB = [14, 96, 152];
const POND_LIGHT: RGB = [48, 138, 200];
const POND_GLINT: RGB = [150, 215, 245];
const FISH_COLORS: RGB[] = [
  [255, 150, 60], // koi
  [90, 245, 230], // cyan
  [255, 120, 210], // magenta
  [255, 214, 90], // gold
  [255, 150, 60],
];

const GLOW_COLORS: RGB[] = [
  [90, 245, 230], // cyan
  [255, 110, 220], // magenta
  [175, 140, 255], // violet
  [130, 255, 160], // green
  [90, 245, 230],
];
const STEM: RGB = [34, 66, 74];

// Positions in canvas pixels (455x256).
const RING = { x: 72, y: 74, r: 4 };

// The painted waterfall: the columns it spans, the rows from its slanted lip
// down to where it lands, and the middle of its foot.
const FALL = { x0: 102, x1: 162, top: 112, foot: 172, footX: 146 };
// Running water below the fall: the cascade stepping down to the right, then
// the stream. (The bright clearing behind is left out; it's mist, not water.)
const inStream = (x: number, y: number) =>
  (y >= FALL.foot && x >= 140 && x < 215) || (y >= 196 && x >= 170 && x < 380);
// The lower stream becomes a still pond from this row down. Two of its rocks
// stay (centre x, centre y, half-width); the others are flooded.
const POND_TOP = 206;
// The pond's round body, which the stream's own outline is widened to.
const POND_BODY = { x: 272, y: 229, rx: 58, ry: 21 };
const KEEP_ROCKS: [number, number, number][] = [
  [202, 217, 13],
  [298, 238, 9],
];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) =>
  (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

const hash = (x: number, y: number, z = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// Smooth 2D value noise, used for the mist and the colour variation.
const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, 1);
  const b = hash(xi + 1, yi, 1);
  const c = hash(xi, yi + 1, 1);
  const d = hash(xi + 1, yi + 1, 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Glow footprints, quantized into a few bands so halos read as pixel art.
const glowCache = new Map<number, { dx: number; dy: number; f: number }[]>();
function glowOffsets(r: number) {
  let list = glowCache.get(r);
  if (list) return list;
  list = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d >= 1) continue;
      list.push({ dx, dy, f: Math.ceil((1 - d) ** 2 * 5) / 5 });
    }
  glowCache.set(r, list);
  return list;
}

type Light = {
  x: number;
  y: number;
  r: number;
  color: RGB;
  phase: number;
  speed: number;
  strength: number;
};

type Scene = {
  ox: number;
  base: Uint8ClampedArray;
  canopy: number[]; // pixels in and around the golden canopy that sway
  leaves: number[]; // golden leaf pixels that can catch a glint
  water: number[]; // the painted cascade and stream
  // The painted waterfall, column by column: each column's pixels top to
  // bottom and their original colours, which scroll down as the water falls.
  fallCols: { idx: number[]; colors: RGB[]; phase: number; speed: number }[];
  lip: number[]; // the bright edge where the water pours over
  splash: number[]; // where the waterfall lands
  pond: number[];
  isPond: Uint8Array;
  inflow: { x: number; y: number }; // where the cascade enters the pond
  fish: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    phase: number;
    speed: number;
    color: RGB;
  }[];
  mist: number[];
  ringPx: number[];
  lights: Light[];
  falling: {
    x: number;
    y: number;
    vy: number;
    phase: number;
    big: boolean;
    color: RGB;
  }[];
  motes: { a: number; r: number; speed: number; rise: number; phase: number }[];
  flies: {
    x: number;
    y: number;
    phase: number;
    sx: number;
    sy: number;
    color: RGB;
  }[];
};

const isGold = (r: number, g: number, b: number) =>
  r > 160 && g > 100 && b < 110 && r - b > 100;
// The pale grey-green trunks, which stay in front of anything painted in.
const isTrunk = (r: number, g: number, b: number) =>
  g > 95 &&
  g - r > 8 &&
  g - b > 8 &&
  Math.max(r, g, b) - Math.min(r, g, b) < 55;

function buildScene(base: Uint8ClampedArray): Scene {
  const ox = 0; // the painting fills the canvas
  const rand = mulberry32(7);
  const N = W * H;
  const at = (i: number): RGB => [
    base[i * 4],
    base[i * 4 + 1],
    base[i * 4 + 2],
  ];
  const px = (x: number, y: number, c: RGB) => {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    base[i * 4] = c[0];
    base[i * 4 + 1] = c[1];
    base[i * 4 + 2] = c[2];
  };

  const gold = new Uint8Array(N);
  const trunk = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const [r, g, b] = at(i);
    gold[i] = isGold(r, g, b) ? 1 : 0;
    trunk[i] = isTrunk(r, g, b) ? 1 : 0;
  }
  const ring = { x: RING.x + ox, y: RING.y };

  // ---- Masks over the painting ----
  const canopy: number[] = [];
  const leaves: number[] = [];
  const water: number[] = [];
  const mist: number[] = [];
  const ringPx: number[] = [];
  const isWater = new Uint8Array(N);
  const leafOrigins: [number, number][] = [];
  const fallCols: Scene["fallCols"] = [];
  const lip: number[] = [];
  const splash: number[] = [];
  const isFallWater = (r: number, g: number, b: number) =>
    b > 120 && b > r + 50 && g > 90;

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const [r, g, b] = at(i);
      const u = x - ox; // painting x
      const nearRing = Math.hypot(x - ring.x, y - ring.y) < RING.r + 2.5;
      // The canopy fills the top of the painting; the bushes below are left still.
      if (
        y < 105 &&
        x > 0 &&
        x < W - 1 &&
        (gold[i] || gold[i - 1] || gold[i + 1])
      )
        canopy.push(i);
      if (gold[i] && !nearRing) {
        leaves.push(i);
        if (y < 90 && hash(x, y, 2) > 0.93) leafOrigins.push([x, y]);
      }
      const inFall =
        y >= FALL.top && y < FALL.foot && u >= FALL.x0 && u <= FALL.x1;
      // The cascade below the fall and the stream: blue water down to the bottom edge.
      if (inStream(u, y) && b > 110 && b > r + 60) {
        water.push(i);
        isWater[i] = 1;
      } else if (inFall && isFallWater(r, g, b)) isWater[i] = 1;
      // The misty clearing behind the stream: pale blue between the near trunks.
      else if (y > 50 && y < 195 && u > 175 && u < 310 && b > r + 30 && g > 40)
        mist.push(i);
      if (inFall && isWater[i] && y > FALL.foot - 8) splash.push(i);
      if (nearRing && gold[i]) ringPx.push(i);
    }
  // The waterfall's columns. The lip slants, so each column's first two water
  // pixels are its lip; below that, down to where it lands, the water scrolls.
  for (let x = FALL.x0 + ox; x <= FALL.x1 + ox; x++) {
    const run: number[] = [];
    for (let y = FALL.top; y < FALL.foot - 8; y++)
      if (isWater[y * W + x]) run.push(y * W + x);
    if (run.length < 6) continue;
    lip.push(run[0], run[1]);
    const idx = run.slice(2);
    fallCols.push({
      idx,
      colors: idx.map(at),
      phase: rand() * 40,
      speed: 16 + rand() * 8,
    });
  }

  // ---- Pond ----
  // Each row of the lower stream is filled from its leftmost to its rightmost
  // water, flooding the rocks between (except the two kept), with the row
  // ends smoothed so the shore curves. Bush tops and trunks stay in front.
  const pond: number[] = [];
  const isPond = new Uint8Array(N);
  const rows: [number, number][] = [];
  for (let y = POND_TOP; y < H; y++) {
    let l = Infinity;
    let r = -Infinity;
    for (let u = 170; u < 380; u++)
      if (isWater[y * W + u + ox]) {
        l = Math.min(l, u);
        r = Math.max(r, u);
      }
    rows.push(
      Number.isFinite(l) ? [l, r] : (rows[rows.length - 1] ?? [230, 250]),
    );
  }
  const keptRock = (u: number, y: number) =>
    KEEP_ROCKS.some(
      ([rx, ry, s]) => ((u - rx) / s) ** 2 + ((y - ry) / (s * 0.55)) ** 2 <= 1,
    );
  for (let y = POND_TOP; y < H; y++) {
    // Average each shore over nearby rows, and round off the pond's top.
    let l = 0;
    let r = 0;
    let n = 0;
    for (let k = -4; k <= 4; k++) {
      const row =
        rows[Math.min(rows.length - 1, Math.max(0, y - POND_TOP + k))];
      l += row[0];
      r += row[1];
      n++;
    }
    const top = Math.min(1, (y - POND_TOP + 1) / 6);
    let lo = l / n;
    let hi = r / n;
    // Widen the row out to the pond's round body, with a wobbling shore.
    const e = (y - POND_BODY.y) / POND_BODY.ry;
    if (Math.abs(e) < 1) {
      const reach =
        POND_BODY.rx *
        Math.sqrt(1 - e * e) *
        (0.92 + vnoise(y * 0.3, 4) * 0.16);
      lo = Math.min(lo, POND_BODY.x - reach);
      hi = Math.max(hi, POND_BODY.x + reach);
    }
    const mid = (lo + hi) / 2;
    const half = ((hi - lo) / 2) * Math.sqrt(top) + 1;
    for (let u = Math.round(mid - half); u <= mid + half; u++) {
      const x = u + ox;
      const i = y * W + x;
      if (gold[i] || trunk[i] || keptRock(u, y)) continue;
      isPond[i] = 1;
      isWater[i] = 1;
      pond.push(i);
      // Long horizontal swirls of lighter and deeper water, like the painted
      // stream, and a dark wet rim along the shore.
      const edge = Math.min(u - (mid - half), mid + half - u);
      const swirl =
        vnoise(x * 0.13, y * 0.45) * 0.7 + vnoise(x * 0.3 + 9, y * 0.9) * 0.3;
      const c =
        edge < 1.5
          ? POND_DEEP
          : swirl > 0.6
            ? POND_LIGHT
            : swirl < 0.4
              ? POND_DEEP
              : POND;
      px(x, y, c);
    }
  }
  const pondWater = water.filter((i) => !isPond[i]);
  water.length = 0;
  water.push(...pondWater);
  // Where the cascade spills into the pond.
  const inflow = { x: 200 + ox, y: POND_TOP + 2 };

  // Glowing fish circling the pond on overlapping loops.
  const fish: Scene["fish"] = FISH_COLORS.map((color, n) => ({
    cx: POND_BODY.x + ox + (rand() - 0.5) * 16,
    cy: POND_BODY.y + (rand() - 0.5) * 6,
    rx: 16 + rand() * 22,
    ry: 5 + rand() * 7,
    phase: rand() * 6.28,
    speed: (0.22 + rand() * 0.2) * (n % 2 ? -1 : 1),
    color,
  }));

  // ---- Colour variation ----
  // Patches of the canopy turn orange and coral or cool toward lime, and the
  // blue undergrowth drifts toward violet in some places and teal in others.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (Math.hypot(x - ring.x, y - ring.y) < RING.r + 4) continue;
      let [r, g, b] = at(i);
      if (gold[i]) {
        const n = vnoise(x * 0.035, y * 0.05 + 9);
        if (n > 0.58) {
          const t = Math.min(1, (n - 0.58) * 5) * 0.85;
          g -= g * 0.4 * t;
          b -= b * 0.5 * t;
          if (n > 0.72) g -= g * 0.18; // the hottest patches go coral
        } else if (n < 0.3) {
          const t = Math.min(1, (0.3 - n) * 6) * 0.7;
          r -= r * 0.22 * t;
          b += 25 * t;
        }
      } else if (y > 110 && !isWater[i] && b > r + 20 && b > g) {
        const n = vnoise(x * 0.03 + 40, y * 0.045);
        if (n > 0.58)
          r += (b - r) * 0.5 * Math.min(1, (n - 0.58) * 4); // violet
        else if (n < 0.34) g += (b - g) * 0.45 * Math.min(1, (0.34 - n) * 4); // teal
      }
      px(x, y, [r, g, b]);
    }

  const lights: Light[] = [];
  const addLight = (
    x: number,
    y: number,
    r: number,
    color: RGB,
    strength = 1,
    speed = 0.6 + rand() * 1.2,
  ) => lights.push({ x, y, r, color, phase: rand() * 6.28, speed, strength });

  // Mist glowing off the waterfall, brightest where it lands.
  addLight(FALL.footX + ox, FALL.foot - 2, 18, MIST, 0.9, 0.4);
  addLight(
    FALL.footX + ox - 12,
    (FALL.top + FALL.foot) / 2,
    14,
    MIST,
    0.4,
    0.5,
  );

  // ---- Bioluminescent plants ----
  // Glowing mushrooms, bulb stalks and ferns tucked into the undergrowth.
  const mushroom = (x: number, y: number, s: number, color: RGB) => {
    for (let d = 0; d < s + 1; d++) px(x, y - d, STEM);
    for (let dx = -s; dx <= s; dx++) px(x + dx, y - s - 1, color);
    for (let dx = -s + 1; dx <= s - 1; dx++) px(x + dx, y - s - 2, color);
    px(x - s + 1, y - s - 2, GOLD_PALE); // a bright fleck on the cap
    addLight(x, y - s - 1, 6 + s * 2, color);
  };
  const stalk = (x: number, y: number, h: number, color: RGB) => {
    const lean = (rand() - 0.5) * 0.5;
    for (let d = 0; d < h; d++) px(x + Math.round(lean * d), y - d, STEM);
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
      for (let d = 0; d < h; d++)
        px(x + b + Math.round((b * d) / 6), y - d, d >= h - 1 ? color : STEM);
    }
    addLight(x, y - 3, 7, color, 0.8);
  };
  const plant = (x: number, y: number) => {
    const color = GLOW_COLORS[Math.floor(rand() * GLOW_COLORS.length)];
    const pick = rand();
    if (pick < 0.45) {
      mushroom(x, y, 1 + Math.floor(rand() * 2), color);
      if (rand() < 0.6) mushroom(x + 3, y + 1, 1, color); // mushrooms grow in pairs
    } else if (pick < 0.75) stalk(x, y, 5 + Math.floor(rand() * 8), color);
    else fern(x, y, color);
  };
  // Zones of undergrowth: [x0, x1, y0, y1, count]. Left of the waterfall,
  // along the near bank, and across the right side of the forest.
  const zones: [number, number, number, number, number][] = [
    [8, 98, 120, 250, 10],
    [95, 185, 205, 252, 5],
    [330, 380, 175, 225, 3],
    [380, W - 6, 150, 250, 8],
  ];
  for (const [x0, x1, y0, y1, count] of zones) {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 20; tries++) {
      const x = Math.round(ox + x0 + rand() * (x1 - x0));
      const y = Math.round(y0 + rand() * (y1 - y0));
      if (x < 4 || x >= W - 4) continue;
      const i = y * W + x;
      if (isWater[i] || trunk[i] || Math.hypot(x - ring.x, y - ring.y) < 16)
        continue;
      plant(x, y);
      placed++;
    }
  }

  // ---- Particles ----
  const falling: Scene["falling"] = [];
  const fallColors = [GOLD, GOLD, AMBER, CORAL];
  for (let n = 0; n < Math.round(W * 0.09); n++) {
    const [x, y] = leafOrigins[Math.floor(rand() * leafOrigins.length)] ?? [
      rand() * W,
      20,
    ];
    falling.push({
      x,
      y: y + rand() * (H - y),
      vy: 5 + rand() * 7,
      phase: rand() * 6.28,
      big: rand() < 0.35,
      color: fallColors[Math.floor(rand() * fallColors.length)],
    });
  }

  const motes: Scene["motes"] = [];
  for (let n = 0; n < 16; n++)
    motes.push({
      a: rand() * 6.28,
      r: 5 + rand() * 9,
      speed: 0.3 + rand() * 0.6,
      rise: 2 + rand() * 4,
      phase: rand(),
    });

  const flies: Scene["flies"] = [];
  for (let n = 0; n < Math.round(W * 0.07); n++)
    flies.push({
      x: rand() * W,
      y: 125 + rand() * 125,
      phase: rand() * 6.28,
      sx: 0.15 + rand() * 0.35,
      sy: 0.2 + rand() * 0.4,
      color: FIREFLIES[Math.floor(rand() * FIREFLIES.length)],
    });

  return {
    ox,
    base,
    canopy,
    leaves,
    water,
    fallCols,
    lip,
    splash,
    pond,
    isPond,
    inflow,
    fish,
    mist,
    ringPx,
    lights,
    falling,
    motes,
    flies,
  };
}

function renderFrame(s: Scene, frame: Uint8ClampedArray, t: number) {
  const { base } = s;
  frame.set(base);
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
  const tick = Math.floor(t * 3);
  const fast = Math.floor(t * 12);

  // Canopy sways in the wind: rows of leaves slide a pixel side to side,
  // with gusts rolling across from left to right.
  const gust = 0.55 + 0.45 * Math.sin(t * 0.35);
  for (const i of s.canopy) {
    const x = i % W;
    const y = (i / W) | 0;
    const dx = Math.round(
      Math.sin(t * 1.3 - x * 0.04 + y * 0.18) *
        gust *
        (0.6 + (1 - y / 105) * 0.7),
    );
    if (dx === 0) continue;
    const j = i - dx;
    frame[i * 4] = base[j * 4];
    frame[i * 4 + 1] = base[j * 4 + 1];
    frame[i * 4 + 2] = base[j * 4 + 2];
  }

  // A few leaves at a time catch the light and glint.
  for (const i of s.leaves) {
    const x = i % W;
    const y = (i / W) | 0;
    if (hash(x, y, tick) > 0.992) put(i, GOLD_PALE);
  }

  // Stream: ripples and foam flecks run downstream toward the viewer.
  const flowing = (i: number, x: number, y: number, flow: number) => {
    const w =
      Math.sin(flow * 0.8 - t * 4.5) +
      Math.sin(flow * 0.31 + x * 0.2 - t * 2.4) * 0.6;
    if (w > 1.1) put(i, FOAM);
    else if (w > 0.6) add(i, FOAM, 0.3);
    else if (w < -1.15) {
      frame[i * 4] *= 0.75;
      frame[i * 4 + 1] *= 0.82;
      frame[i * 4 + 2] *= 0.86;
    }
    // Dashes of foam riding the current.
    const v = (flow * 0.12 - t * 1.6 + hash(x >> 1, 7) * 4) % 1;
    if ((v + 1) % 1 < 0.06) put(i, FALL_FOAM);
    if (hash(x, y, fast) > 0.993) put(i, SPARKLE);
  };
  for (const i of s.water) {
    const x = i % W;
    const y = (i / W) | 0;
    flowing(i, x, y, y + x * 0.3 + hash(x >> 1, 3) * 3);
  }

  // Waterfall: each column's painted pixels scroll downward, so the falling
  // water keeps its painted look but pours. Bright streaks race down a few
  // columns, the lip shimmers, and the water churns white where it lands.
  for (const col of s.fallCols) {
    const n = col.idx.length;
    const shift = Math.floor(t * col.speed + col.phase);
    for (let j = 0; j < n; j++)
      put(col.idx[j], col.colors[(((j - shift) % n) + n) % n]);
    const x = col.idx[0] % W;
    if (hash(x, 9) > 0.6) {
      const head = (t * col.speed * 1.4 + col.phase * 3) % (n + 6);
      for (let j = 0; j < n; j++)
        if (j <= head && head - j < 3) put(col.idx[j], FALL_LIGHT);
    }
  }
  for (const i of s.lip) if (hash(i, fast) > 0.6) put(i, FALL_FOAM);

  // Pond: still water with slow glints drifting across it, and rings
  // spreading from where the cascade pours in.
  const { inflow } = s;
  for (const i of s.pond) {
    const x = i % W;
    const y = (i / W) | 0;
    const w =
      Math.sin(x * 0.12 + t * 0.5 + Math.sin(y * 0.7) * 2) *
      Math.sin(y * 1.3 - t * 0.8);
    if (w > 0.8) add(i, POND_GLINT, 0.3);
    const d = Math.hypot(x - inflow.x, (y - inflow.y) * 2.6);
    for (let k = 0; k < 3; k++) {
      const r = (t * 6 + k * 8) % 24;
      if (Math.abs(d - r) < 0.7) add(i, POND_GLINT, 0.45 * (1 - r / 24));
    }
    if (d < 5 && hash(x, y, fast) > 0.5) put(i, FALL_FOAM);
    else if (hash(x, y, fast) > 0.996) put(i, SPARKLE);
  }

  // Fish: bright bodies with a pale head, darker belly and a flicking forked
  // tail, each wrapped in a soft glow. Only drawn over open pond water, so
  // they slip out of sight behind rocks and under the bank.
  const tint = (c: RGB, k: number): RGB =>
    k > 1
      ? [
          c[0] + (255 - c[0]) * (k - 1),
          c[1] + (255 - c[1]) * (k - 1),
          c[2] + (255 - c[2]) * (k - 1),
        ]
      : [c[0] * k, c[1] * k, c[2] * k];
  for (const f of s.fish) {
    const a = t * f.speed + f.phase;
    const X = Math.round(f.cx + Math.cos(a) * f.rx);
    const Y = Math.round(f.cy + Math.sin(a) * f.ry);
    const dir = -Math.sin(a) * Math.sign(f.speed) > 0 ? 1 : -1; // facing along the path
    for (const o of glowOffsets(8)) {
      const j = (Y + o.dy) * W + X - 2 * dir + o.dx;
      if (j >= 0 && j < W * H && s.isPond[j]) add(j, f.color, o.f * 0.4);
    }
    const head = tint(f.color, 1.7);
    const belly = tint(f.color, 0.8);
    const flick = Math.sin(t * 8 + f.phase) > 0 ? 1 : 0;
    const body: [number, number, RGB][] = [
      [1, 0, head],
      [0, 0, head],
      [0, 1, head],
      [-1, 0, f.color],
      [-2, 0, f.color],
      [-3, 0, f.color],
      [-4, 0, f.color],
      [-1, 1, belly],
      [-2, 1, belly],
      [-3, 1, belly],
      [-4, 1, belly],
      [-5, -1 + flick, f.color],
      [-6, -1 + flick, belly],
      [-5, 2 - flick, f.color],
      [-6, 2 - flick, belly],
    ];
    for (const [dx, dy, c] of body) {
      const j = (Y + dy) * W + X + dx * dir;
      if (j >= 0 && j < W * H && s.isPond[j]) put(j, c);
    }
  }
  const poolX = FALL.footX + s.ox;
  const poolY = FALL.foot;
  for (const i of s.splash) {
    const x = i % W;
    const y = (i / W) | 0;
    if (hash(x, y, fast) > 0.35 + Math.abs(y - poolY) / 20) put(i, FALL_FOAM);
  }
  // Spray drifting up off the foot of the fall.
  for (let n = 0; n < 10; n++) {
    const life = (t * 0.6 + n / 10) % 1;
    const X = Math.round(poolX + (hash(n, 4) - 0.5) * 16 + Math.sin(t + n) * 2);
    const Y = Math.round(poolY - 2 - life * 10);
    if (life < 0.8) add(Y * W + X, FALL_FOAM, 0.45 * (1 - life));
  }

  // Mist drifts slowly through the clearing in shifting cyan and violet.
  for (const i of s.mist) {
    const x = i % W;
    const y = (i / W) | 0;
    const n =
      vnoise(x * 0.045 + t * 0.12, y * 0.09 - t * 0.03) * 0.65 +
      vnoise(x * 0.11 - t * 0.2, y * 0.17) * 0.35;
    const k = Math.max(0, n - 0.45) * 1.6;
    if (k > bayer(x, y) * 0.5)
      add(
        i,
        vnoise(x * 0.02 - t * 0.05, y * 0.03) > 0.55 ? MIST_VIOLET : MIST,
        0.07 + k * 0.12,
      );
  }

  // Glow from the plants and the waterfall's mist, pulsing slowly.
  for (const l of s.lights) {
    const k = (0.6 + 0.4 * Math.sin(t * l.speed + l.phase)) * l.strength * 0.5;
    for (const o of glowOffsets(l.r)) {
      const X = Math.floor(l.x) + o.dx;
      const Y = Math.floor(l.y) + o.dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      add(Y * W + X, l.color, o.f * k);
    }
  }

  // The ring pulses, its gold brightening and a halo breathing around it.
  const rx = RING.x + s.ox;
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
  for (const i of s.ringPx) add(i, GOLD_PALE, 0.15 + pulse * 0.35);
  for (const o of glowOffsets(18))
    add((RING.y + o.dy) * W + rx + o.dx, GOLD, o.f * (0.06 + pulse * 0.08));

  // Gold dust rises in a slow spiral around the ring and fades out.
  for (const m of s.motes) {
    const life = (t * 0.12 * m.speed * 2 + m.phase) % 1;
    const a = m.a + t * m.speed;
    const X = Math.round(rx + Math.cos(a) * m.r * (1 - life * 0.4));
    const Y = Math.round(
      RING.y + 6 + Math.sin(a) * m.r * 0.5 - life * m.rise * 6,
    );
    const k = Math.sin(life * Math.PI);
    if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
    add(Y * W + X, GOLD, 0.4 + k * 0.6);
  }

  // Leaves drift down from the canopy, swinging as they fall.
  for (const p of s.falling) {
    const span = H + 10;
    const fall = (p.y + t * p.vy) % span;
    const Y = Math.floor(fall) - 5;
    const sway = Math.sin(t * 1.4 + p.phase) * 5;
    const X = Math.floor(p.x + sway - fall * 0.18 + Math.sin(t * 0.2) * 4);
    if (X < 1 || X >= W - 1 || Y < 0 || Y >= H - 1) continue;
    const turn = Math.sin(t * 2.8 + p.phase * 3);
    const c = turn > 0.3 ? p.color : turn < -0.6 ? GOLD_PALE : AMBER;
    put(Y * W + X, c);
    if (p.big) put(Y * W + X + (turn > 0 ? 1 : -1), c);
  }

  // Fireflies wander over the undergrowth, blinking on and off.
  for (const f of s.flies) {
    const X = Math.round(f.x + Math.sin(t * f.sx + f.phase) * 16);
    const Y = Math.round(f.y + Math.sin(t * f.sy + f.phase * 2) * 9);
    const blink = Math.max(0, Math.sin(t * 1.1 + f.phase * 3));
    if (blink < 0.15 || X < 2 || Y < 2 || X >= W - 2 || Y >= H - 2) continue;
    put(Y * W + X, f.color);
    for (const o of glowOffsets(3))
      add((Y + o.dy) * W + X + o.dx, f.color, o.f * blink * 0.3);
  }
}

export default function GoldenForest() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current!;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    Object.assign(canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      imageRendering: "pixelated",
    });
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const start = performance.now();
    let scene: Scene | null = null;
    let image: ImageData | null = null;
    let raf = 0;
    let last = 0;
    let cancelled = false;

    const draw = (now: number) => {
      if (!scene || !image) return;
      renderFrame(scene, image.data, (now - start) / 1000);
      ctx.putImageData(image, 0, 0);
    };

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, W, H);
      image = ctx.getImageData(0, 0, W, H);
      scene = buildScene(new Uint8ClampedArray(image.data));
      draw(performance.now());
      canvas.style.opacity = "1";
    };
    img.src = SRC;

    // Fade the scene in once the painting has loaded.
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 600ms ease-out";

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
      cancelled = true;
      cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, background: "#07131a" }}
    />
  );
}
