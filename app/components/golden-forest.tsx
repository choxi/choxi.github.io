"use client";

import { useEffect, useRef } from "react";

// Full-viewport animated pixel-art background built on a painted scene: a
// night forest under golden canopies, a stream winding out of a misty clearing,
// and a glowing ring standing on a mossy rock.
//
// The painting is sampled down to a small canvas (384x256) and scaled back up
// with nearest-neighbour sampling, so every effect lands on the same coarse
// pixel grid as the art. On wide screens the canvas grows sideways and the
// painting's edges are mirrored into the extra columns, so the scene isn't
// cropped top and bottom. On load the image is scanned for its golden leaves,
// stream, trunks and misty clearing; a short waterfall and glowing plants are
// painted in, and the colours are varied. Each frame copies that base and
// animates the canopy, water, mist and glow, then adds drifting leaves,
// fireflies and the ring's gold dust on top.

const SRC = "/assets/golden-forest.webp";
const IMG_W = 384;
const H = 256;
// Widest the canvas grows (an aspect ratio of 1.875:1, covering 16:9 and
// 16:10). Kept narrow enough that the wrapped margins never repeat the ring.
const MAX_W = 480;
const FPS_INTERVAL = 1000 / 20;

// Canvas width for the current viewport; set before each scene is built.
let W = IMG_W;

type RGB = [number, number, number];

const GOLD: RGB = [255, 206, 60];
const GOLD_PALE: RGB = [255, 240, 160];
const AMBER: RGB = [240, 160, 20];
const CORAL: RGB = [255, 120, 70];
const MIST: RGB = [120, 200, 220];
const MIST_VIOLET: RGB = [160, 140, 240];
const FOAM: RGB = [200, 238, 255];
const SPARKLE: RGB = [240, 252, 255];
const FIREFLIES: RGB[] = [[255, 226, 120], [160, 255, 170], [130, 235, 255]];

const FALL_DARK: RGB = [28, 88, 145];
const FALL_MID: RGB = [70, 152, 215];
const FALL_LIGHT: RGB = [175, 228, 255];
const FALL_FOAM: RGB = [236, 250, 255];
const ROCK: RGB = [34, 50, 60];
const ROCK_DARK: RGB = [18, 30, 40];
const ROCK_LIT: RGB = [74, 96, 104];
const MOSS: RGB = [70, 104, 58];
const MOSS_LIT: RGB = [196, 160, 44];

const GLOW_COLORS: RGB[] = [
  [90, 245, 230], // cyan
  [255, 110, 220], // magenta
  [175, 140, 255], // violet
  [130, 255, 160], // green
  [90, 245, 230],
];
const STEM: RGB = [34, 66, 74];

// Positions in painting coordinates (0..384); offset by `ox` on the canvas.
const RING = { x: 62, y: 93, r: 4 };
const FALL = { x: 323, top: 112, bottom: 224, tier: 28 };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

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

type Light = { x: number; y: number; r: number; color: RGB; phase: number; speed: number; strength: number };

type Scene = {
  ox: number;
  base: Uint8ClampedArray;
  canopy: number[]; // pixels in and around the golden canopy that sway
  leaves: number[]; // golden leaf pixels that can catch a glint
  water: number[]; // the painted stream
  channel: number[]; // the run from the waterfall's pool into the stream
  fall: number[];
  splash: number[];
  mist: number[];
  ringPx: number[];
  lights: Light[];
  falling: { x: number; y: number; vy: number; phase: number; big: boolean; color: RGB }[];
  motes: { a: number; r: number; speed: number; rise: number; phase: number }[];
  flies: { x: number; y: number; phase: number; sx: number; sy: number; color: RGB }[];
};

const isGold = (r: number, g: number, b: number) => r > 160 && g > 100 && b < 110 && r - b > 100;
// The pale grey-green trunks, which stay in front of anything painted in.
const isTrunk = (r: number, g: number, b: number) =>
  g > 95 && g - r > 8 && g - b > 8 && Math.max(r, g, b) - Math.min(r, g, b) < 55;

// Draws the painting into a canvas `W` wide and fills any extra columns either
// side by wrapping it around, so each margin continues with the far edge of
// the painting. (A mirror would leave symmetric "faces" at the seams; wrapping
// just stands one trunk beside another.)
function paintBase(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const ox = Math.floor((W - IMG_W) / 2);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, ox, 0, IMG_W, H);
  const image = ctx.getImageData(0, 0, W, H);
  const d = image.data;
  const copy = (to: number, from: number) => {
    d[to * 4] = d[from * 4];
    d[to * 4 + 1] = d[from * 4 + 1];
    d[to * 4 + 2] = d[from * 4 + 2];
    d[to * 4 + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < ox; x++) copy(y * W + x, y * W + x + IMG_W);
    for (let x = ox + IMG_W; x < W; x++) copy(y * W + x, y * W + x - IMG_W);
  }
  return { image, ox };
}

function buildScene(base: Uint8ClampedArray, ox: number): Scene {
  const rand = mulberry32(7);
  const N = W * H;
  const at = (i: number): RGB => [base[i * 4], base[i * 4 + 1], base[i * 4 + 2]];
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

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const [r, g, b] = at(i);
      const u = x - ox; // painting x
      const nearRing = Math.hypot(x - ring.x, y - ring.y) < RING.r + 2.5;
      // The canopy fills the top of the painting; the bushes below are left still.
      if (y < 105 && x > 0 && x < W - 1 && (gold[i] || gold[i - 1] || gold[i + 1])) canopy.push(i);
      if (gold[i] && !nearRing) {
        leaves.push(i);
        if (y < 90 && hash(x, y, 2) > 0.93) leafOrigins.push([x, y]);
      }
      // The stream: saturated blue in the lower middle, down to the bottom edge.
      if (y > 188 && u > 175 && u < 315 && b > 110 && b > g + 25 && b > r + 70) {
        water.push(i);
        isWater[i] = 1;
      }
      // The misty clearing behind the stream: pale cyan between the near trunks.
      else if (y > 70 && y < 200 && u > 140 && u < 250 && b > r + 30 && g > 40) mist.push(i);
      if (nearRing && gold[i]) ringPx.push(i);
    }

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
        if (n > 0.58) r += (b - r) * 0.5 * Math.min(1, (n - 0.58) * 4); // violet
        else if (n < 0.34) g += (b - g) * 0.45 * Math.min(1, (0.34 - n) * 4); // teal
      }
      px(x, y, [r, g, b]);
    }

  const lights: Light[] = [];
  const addLight = (x: number, y: number, r: number, color: RGB, strength = 1, speed = 0.6 + rand() * 1.2) =>
    lights.push({ x, y, r, color, phase: rand() * 6.28, speed, strength });

  // ---- Waterfall ----
  // A short fall drops from a mossy ledge between the trunks right of the big
  // tree, widening over a few steps, into a pool that runs into the stream.
  // Trunk pixels are skipped throughout so the trees stay in front of it.
  const fx = FALL.x + ox;
  const fall: number[] = [];
  const splash: number[] = [];
  const channel: number[] = [];
  const kind = new Uint8Array(N); // 1 fall, 2 splash, 3 channel
  // Near the foot, the golden bush tops stay in front of the water too.
  const paintable = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && !trunk[y * W + x] && !(y > FALL.bottom - 16 && gold[y * W + x]);
  const fallLeft = (y: number) => fx - 5 - Math.floor((y - FALL.top) / FALL.tier);
  const fallRight = (y: number) => fx + 5 + Math.floor((y - FALL.top) / FALL.tier);

  // Wet rock behind and beside the water, its edges broken into boulders.
  for (let y = FALL.top - 2; y <= FALL.bottom; y++) {
    const yy = Math.max(y, FALL.top);
    const l = fallLeft(yy) - 2 - Math.round(vnoise(y * 0.25, 1) * 5);
    const r = fallRight(yy) + 2 + Math.round(vnoise(y * 0.25, 7) * 5);
    for (let x = l; x <= r; x++) {
      if (!paintable(x, y)) continue;
      const edge = x === l || x === r;
      const lit = x - l < 2 && hash(x, y >> 1, 4) > 0.3; // light catches the left faces
      const c = edge ? ROCK_DARK : lit ? ROCK_LIT : hash(x >> 1, y >> 1, 4) > 0.75 ? ROCK_DARK : ROCK;
      px(x, y, c);
      // Moss creeping over the outer boulders.
      if (!edge && (x - l < 2 || r - x < 2) && vnoise(x * 0.4, y * 0.3) > 0.62) px(x, y, MOSS);
    }
  }
  // The ledge the water spills from: a rounded mound of stone under a cap of
  // moss and golden undergrowth, like the bushes around it.
  const lipTop = FALL.top - 9;
  for (let y = lipTop; y < FALL.top + 1; y++) {
    const u = (y - lipTop) / (FALL.top + 1 - lipTop);
    const half = Math.round(6 + Math.sqrt(u) * 9 + (hash(y, 5) - 0.5) * 2);
    for (let x = fx - half; x <= fx + half; x++) {
      if (!paintable(x, y)) continue;
      const fromTop = y - lipTop - Math.round(vnoise(x * 0.3, 2) * 2);
      let c: RGB;
      if (fromTop < 0) continue; // ragged top edge
      if (fromTop < 2) c = hash(x, y, 6) > 0.45 ? MOSS_LIT : MOSS;
      else if (fromTop < 4) c = hash(x, y, 6) > 0.6 ? MOSS : ROCK_LIT;
      else c = x < fx - half + 3 ? ROCK_LIT : y === FALL.top ? ROCK_DARK : ROCK;
      px(x, y, c);
    }
  }
  for (let y = FALL.top; y <= FALL.bottom; y++)
    for (let x = fallLeft(y); x <= fallRight(y); x++)
      if (paintable(x, y)) {
        kind[y * W + x] = 1;
        px(x, y, FALL_MID);
      }

  // Plunge pool at the foot.
  const poolX = fx - 1;
  const poolY = FALL.bottom + 3;
  for (let y = poolY - 5; y <= poolY + 5; y++)
    for (let x = poolX - 16; x <= poolX + 16; x++)
      if (((x - poolX) / 14) ** 2 + ((y - poolY) / 4) ** 2 <= 1 && paintable(x, y)) {
        kind[y * W + x] = 2;
        px(x, y, FALL_MID);
      }
  // Run from the pool down to where the painted stream ends.
  const path: [number, number][] = [[poolX - 8, poolY + 2], [poolX - 16, poolY + 8], [poolX - 26, poolY + 13], [poolX - 32, H + 2]];
  for (let s = 1; s < path.length; s++) {
    const [x0, y0] = path[s - 1];
    const [x1, y1] = path[s];
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let d = 0; d <= len; d += 0.5) {
      const cx = x0 + ((x1 - x0) * d) / len;
      const cy = y0 + ((y1 - y0) * d) / len;
      for (let w = -2; w <= 2; w++) {
        const x = Math.round(cx + w);
        const y = Math.round(cy);
        if (paintable(x, y) && !kind[y * W + x]) {
          kind[y * W + x] = 3;
          px(x, y, FALL_MID);
        }
      }
    }
  }
  for (let i = 0; i < N; i++) {
    if (kind[i] === 1) fall.push(i);
    else if (kind[i] === 2) splash.push(i);
    else if (kind[i] === 3) channel.push(i);
  }
  addLight(poolX, poolY - 2, 18, MIST, 0.8, 0.4);
  for (let y = FALL.top + 10; y < FALL.bottom; y += 22) addLight(fx, y, 12, MIST, 0.35, 0.5);

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
      for (let d = 0; d < h; d++) px(x + b + Math.round((b * d) / 6), y - d, d >= h - 1 ? color : STEM);
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
  // Zones in painting coordinates: [x0, x1, y0, y1, count]. The left zone runs
  // into the mirrored margin on wide screens.
  const zones: [number, number, number, number, number][] = [
    [8 - ox, 125, 160, 250, 10],
    [125, 215, 222, 252, 5],
    [235, 300, 205, 250, 4],
    [338, IMG_W + ox - 6, 175, 250, 7],
  ];
  for (const [x0, x1, y0, y1, count] of zones) {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 20; tries++) {
      const x = Math.round(ox + x0 + rand() * (x1 - x0));
      const y = Math.round(y0 + rand() * (y1 - y0));
      if (x < 4 || x >= W - 4) continue;
      const i = y * W + x;
      if (isWater[i] || kind[i] || trunk[i] || Math.hypot(x - ring.x, y - ring.y) < 16) continue;
      plant(x, y);
      placed++;
    }
  }

  // ---- Particles ----
  const falling: Scene["falling"] = [];
  const fallColors = [GOLD, GOLD, AMBER, CORAL];
  for (let n = 0; n < Math.round(W * 0.09); n++) {
    const [x, y] = leafOrigins[Math.floor(rand() * leafOrigins.length)] ?? [rand() * W, 20];
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
    motes.push({ a: rand() * 6.28, r: 5 + rand() * 9, speed: 0.3 + rand() * 0.6, rise: 2 + rand() * 4, phase: rand() });

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

  return { ox, base, canopy, leaves, water, channel, fall, splash, mist, ringPx, lights, falling, motes, flies };
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
    const dx = Math.round(Math.sin(t * 1.3 - x * 0.04 + y * 0.18) * gust * (0.6 + (1 - y / 105) * 0.7));
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
    const w = Math.sin(flow * 0.8 - t * 4.5) + Math.sin(flow * 0.31 + x * 0.2 - t * 2.4) * 0.6;
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
    flowing(i, x, y, y + x * 0.45 + hash(x >> 1, 3) * 3);
  }
  for (const i of s.channel) {
    const x = i % W;
    const y = (i / W) | 0;
    flowing(i, x, y, y * 1.2 - x * 0.6);
  }

  // Waterfall: streaks of water scroll down each column; every step's lip
  // curls over bright and spray churns where it lands on the step below.
  const streak = (x: number, y: number, speed: number, len: number) => {
    const v = (y + hash(x, 2) * 30 - t * (speed + hash(x, 1) * speed * 0.6)) / len;
    return v - Math.floor(v);
  };
  for (const i of s.fall) {
    const x = i % W;
    const y = (i / W) | 0;
    const local = y - FALL.top;
    const k = Math.floor(local / FALL.tier);
    const tierY = local - k * FALL.tier;
    // Ropes of water run the full height, so the steps don't read as blocks.
    const rope = hash(Math.floor(x / 2), 9);
    const st = streak(x, y, 40, rope > 0.7 ? 14 : 7);
    let c: RGB;
    if (rope > 0.7) c = st < 0.7 ? FALL_LIGHT : FALL_MID;
    else if (rope > 0.35) c = st < 0.2 ? FALL_LIGHT : FALL_MID;
    else c = st < 0.15 ? FALL_MID : FALL_DARK;
    if (tierY < 2) c = tierY === 0 || hash(x, y, fast) > 0.5 ? FALL_LIGHT : FALL_FOAM;
    else if (tierY > FALL.tier - 3 && hash(x, y, fast) > 0.5) c = FALL_FOAM;
    if (y > FALL.bottom - 5 && hash(x, y, fast) > 0.35) c = FALL_FOAM;
    put(i, c);
  }
  const poolX = FALL.x + s.ox - 1;
  const poolY = FALL.bottom + 3;
  for (const i of s.splash) {
    const x = i % W;
    const y = (i / W) | 0;
    const d = Math.hypot(x - poolX - 1, (y - poolY) * 3);
    let c: RGB = d > 11 ? FALL_DARK : FALL_MID;
    if (hash(x, y, fast) > 0.45 + d / 22) c = FALL_FOAM;
    put(i, c);
  }
  // Spray drifting up off the plunge pool.
  for (let n = 0; n < 10; n++) {
    const life = (t * 0.7 + n / 10) % 1;
    const X = Math.round(poolX + (hash(n, 4) - 0.5) * 20 + Math.sin(t + n) * 2);
    const Y = Math.round(poolY - 2 - life * 12);
    if (life < 0.8) add(Y * W + X, FALL_FOAM, 0.5 * (1 - life));
  }

  // Mist drifts slowly through the clearing in shifting cyan and violet.
  for (const i of s.mist) {
    const x = i % W;
    const y = (i / W) | 0;
    const n = vnoise(x * 0.045 + t * 0.12, y * 0.09 - t * 0.03) * 0.65 + vnoise(x * 0.11 - t * 0.2, y * 0.17) * 0.35;
    const k = Math.max(0, n - 0.45) * 1.6;
    if (k > bayer(x, y) * 0.5) add(i, vnoise(x * 0.02 - t * 0.05, y * 0.03) > 0.55 ? MIST_VIOLET : MIST, 0.07 + k * 0.12);
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
  for (const o of glowOffsets(18)) add((RING.y + o.dy) * W + rx + o.dx, GOLD, o.f * (0.06 + pulse * 0.08));

  // Gold dust rises in a slow spiral around the ring and fades out.
  for (const m of s.motes) {
    const life = (t * 0.12 * m.speed * 2 + m.phase) % 1;
    const a = m.a + t * m.speed;
    const X = Math.round(rx + Math.cos(a) * m.r * (1 - life * 0.4));
    const Y = Math.round(RING.y + 6 + Math.sin(a) * m.r * 0.5 - life * m.rise * 6);
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
    for (const o of glowOffsets(3)) add((Y + o.dy) * W + X + o.dx, f.color, o.f * blink * 0.3);
  }
}

export default function GoldenForest() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current!;
    const canvas = document.createElement("canvas");
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

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let scene: Scene | null = null;
    let image: ImageData | null = null;
    let loaded = false;
    let raf = 0;
    let last = 0;
    let cancelled = false;

    const draw = (now: number) => {
      if (!scene || !image) return;
      renderFrame(scene, image.data, (now - start) / 1000);
      ctx.putImageData(image, 0, 0);
    };

    const img = new Image();

    // Widen the canvas to the viewport's aspect ratio (up to 2:1) so wide
    // screens see the whole painting instead of a vertically cropped band.
    const resize = () => {
      if (!loaded) return;
      const { width, height } = host.getBoundingClientRect();
      const fit = Math.round((H * width) / Math.max(1, height) / 2) * 2;
      const next = Math.min(MAX_W, Math.max(IMG_W, fit));
      if (scene && next === W) return;
      W = next;
      canvas.width = W;
      const painted = paintBase(ctx, img);
      image = painted.image;
      scene = buildScene(new Uint8ClampedArray(image.data), painted.ox);
      draw(performance.now());
    };
    const observer = new ResizeObserver(resize);

    img.onload = () => {
      if (cancelled) return;
      loaded = true;
      scene = null;
      resize();
      observer.observe(host);
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
      observer.disconnect();
      canvas.remove();
    };
  }, []);

  return <div ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "#07131a" }} />;
}
