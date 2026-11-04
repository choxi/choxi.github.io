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
  cliffWarm: hex("#1d2522"),
  cliffLit: hex("#2d403b"),
  root: hex("#1f2a26"),
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
  bark: hex("#131a1a"),
  leaf: hex("#0c1714"),
  leafLit: hex("#1b3124"),
  wetEdge: hex("#0b1513"),
  pad: hex("#0f3322"),
  padLit: hex("#2a6a3a"),
  poolDeep: hex("#164d52"),
  reed: hex("#3c5a44"),
  cattail: hex("#3b2c24"),
  koi: hex("#ff9a3c"),
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
const POOL_CY = 158; // vertical centre of the plunge pool
const TIER = 13;

type Scene = {
  W: number;
  base: Uint8ClampedArray;
  fx: number;
  fallBottom: number;
  poolCx: number;
  mainFall: number[];
  upperFall: number[];
  lowerFall: number[];
  seeps: number[];
  pool: number[];
  lights: Light[];
  reeds: { x: number; y: number; h: number; phase: number; glow: boolean }[];
  fish: { phase: number; speed: number; rx: number; ry: number; color: RGB }[];
  shallow: Uint8Array;
  poolRx: number;
  stars: { i: number; phase: number; speed: number; big: boolean }[];
  petals: { x: number; y: number; phase: number; speed: number }[];
  flies: { x: number; y: number; phase: number; sx: number; sy: number }[];
};

// The fall's horizontal position lives in its own helper so the component can
// keep it clear of the content card at any aspect ratio.
const FALL_HALF = 0.05; // half the lip width, as a fraction of W
const FALL_SPILL = 3 * 6 + 2; // how far the lowest tier reaches left of the lip, in px

function fallCenter(W: number, cardHalf: number) {
  const clear = W / 2 + cardHalf + W * FALL_HALF + FALL_SPILL + 2;
  return Math.round(Math.min(W - 34, Math.max(W * 0.72, clear)));
}

// Decides where the fall goes and which horizontal slice of the canvas is on
// screen (`left`, in canvas px; `visW` is the slice width).
// - Wide screens see the whole canvas; the fall sits just right of the card.
// - On narrow/portrait screens the card spans the whole slice, so the fall
//   can't dodge it sideways. Instead the slice pans onto the fall and pool:
//   the moon shows above the card and the fall's base, pool and fish below.
function frameScene(W: number, visW: number, cardHalf: number) {
  const centered = (W - visW) / 2;
  const fx = fallCenter(W, cardHalf);
  if (fx + W * FALL_HALF + 1 <= centered + visW) return { fx, left: centered };
  const fxPortrait = Math.round(W * 0.72);
  const focus = fxPortrait - W * 0.05; // between the fall and the pool
  const left = Math.min(W - visW, Math.max(0, focus - visW / 2));
  return { fx: fxPortrait, left };
}

function buildScene(W: number, fx: number): Scene {
  let rand = mulberry32(11);
  const noise = makeNoise(rand);
  // Each major element restarts the random stream from its own seed, so adding
  // detail to one part of the scene never reshuffles the others.
  const reseed = (seed: number) => {
    rand = mulberry32(seed);
  };
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
        for (let dx = -w; dx <= w; dx++) {
          const X = Math.floor(x + dx);
          // Moonlit right edge; on thick limbs, broken vertical bark grooves.
          let c = C.trunk;
          if (dx > w - 1.5 && hash(X, y) > 0.4) c = C.trunkLit;
          else if (w > 2 && X % 3 === 0 && hash(X, Math.floor(y / 5)) > 0.45) c = C.bark;
          px(X, y, c);
        }
      }
      done += len;
    }
  };

  const lights: Light[] = [];
  const addLight = (x: number, y: number, r: number, color: RGB, strength = 1, speed = 0.6 + rand() * 1.2) =>
    lights.push({ x, y, r, color, phase: rand() * 6.28, speed, strength });

  const lipL = Math.round(fx - W * FALL_HALF);
  const lipR = Math.round(fx + W * FALL_HALF);
  // Everything around the pool hangs off the fall's position.
  // The pool sits forward and left of where the fall lands, leaving calm water
  // away from the churn for lily pads and fish.
  const poolCx = fx - W * 0.09;
  const poolRx = W * 0.15;
  const fallBottom = 150;
  // The curtain spills further left with each ledge; the right edge hugs the cliff.
  const fallLeft = (y: number) => {
    const k = Math.floor((y - FALL_TOP) / TIER);
    return lipL - 3 * k - Math.round(hash(k, 7) * 2);
  };
  const fallRight = (y: number) => lipR + (y - FALL_TOP > TIER * 3 ? 1 : 0);

  // Sky, then a dark ground floor so nothing below the cliffs is left unpainted.
  for (let y = 0; y < 110; y++)
    for (let x = 0; x < W; x++) px(x, y, dither(x, y, C.skyTop, C.skyLow, y / 90));
  for (let y = 110; y < H; y++)
    for (let x = 0; x < W; x++) px(x, y, hash(x, y) > 0.85 ? C.bushLit : C.bush);

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
  // Faces are stacked bands of rock separated by wavy ledges; each band is
  // split into blocks by vertical joints. Blocks catch light on the side facing
  // the fall, ledges are lit on top and shadowed beneath their overhang.
  const ledgeY = (n: number, x: number) => 68 + n * 17 + (noise(x * 0.06 + n * 7.3) - 0.5) * 10;
  // Ledges only jut out along stretches; elsewhere the face runs on unbroken.
  const ledgeHere = (n: number, x: number) => noise(x * 0.09 + n * 3.1) > 0.45;
  // Irregular vertical joints, so the rock reads as fractured stone, not masonry.
  const jointAt = (x: number, n: number) => hash(x, n + 20) > 0.84 && hash(x - 1, n + 20) <= 0.84;
  const bandAt = (x: number, y: number) => {
    let n = 0;
    while (y >= ledgeY(n, x)) n++;
    return n;
  };
  for (let x = 0; x < W; x++) {
    if (x >= lipL && x <= lipR) continue;
    const top = Math.floor(cliffTop(x));
    const drip = Math.floor(hash(x, 3) * hash(x, 4) * 10);
    const facesRight = x < lipL; // the left cliff's blocks face the fall on their right
    for (let y = top; y < 160; y++) {
      const n = bandAt(x, y);
      const prev = n > 0 ? ledgeY(n - 1, x) : top;
      const ly = y - Math.floor(prev);
      const bandH = ledgeY(n, x) - prev;
      // Block tone changes from one joint to the next.
      let jx = x;
      while (jx > 0 && !jointAt(jx, n) && x - jx < 20) jx--;
      const block = jx;
      const bh = hash(block, n + 40);
      const tone = bh < 0.45 ? C.cliff : bh < 0.8 ? C.cliffStreak : C.cliffWarm;
      let c = dither(x, y, tone, C.cliffDark, (y - top) / 100);
      // Joints run part-way down a band; the stone beside them catches light
      // on the side facing the fall.
      const jointOpen = ly > 1 && ly < bandH - 2 && hash(block, n + 21) > 0.3;
      const nextJoint = facesRight ? jointAt(x + 1, n) : jointAt(x, n);
      if (jointOpen && jointAt(x, n) && facesRight) c = C.cliffDark;
      else if (jointOpen && jointAt(x + 1, n) && !facesRight) c = C.cliffDark;
      else if (jointOpen && nextJoint && hash(x, y) > 0.4) c = C.cliffLit;
      if (ledgeHere(n, x) && ledgeY(n, x) - y < 1.5) c = C.cliffDark; // shadow under the next ledge's lip
      if (n > 0 && ly < 1 && ledgeHere(n - 1, x)) {
        // Ledge tops: lit stone, or moss that drips over the edge.
        c = hash(block, n + 3) > 0.55 ? C.mossLit : C.cliffLit;
      } else if (n > 0 && ledgeHere(n - 1, x) && hash(block, n + 3) > 0.55 && ly < 1 + Math.floor(hash(x, n) * hash(x, n + 1) * 6)) {
        c = C.moss;
      }
      if (y - top < 2) c = dither(x, y, C.moss, C.mossLit, 0.5);
      else if (y - top < 4 + drip) c = C.moss;
      px(x, y, c);
    }
  }
  const onCliff = (x: number, y: number) =>
    x >= 0 && x < W && (x < lipL - 1 || x > lipR + 1) && y > cliffTop(x) + 4 && y < 150;

  // Glowing lichen crusted along a few ledges.
  for (let n = 0; n < 16; n++) {
    const x = Math.floor(rand() * W);
    const band = 1 + Math.floor(rand() * 5);
    const y = Math.floor(ledgeY(band - 1, x));
    if (!onCliff(x, y)) continue;
    const color = rand() < 0.6 ? C.cyan : C.green;
    const len = 2 + Math.floor(rand() * 4);
    for (let d = 0; d < len; d++) if (onCliff(x + d, y)) px(x + d, y - (hash(x + d, y) > 0.7 ? 1 : 0), color);
    addLight(x + len / 2, y, 5, color, 0.5, 0.3 + rand() * 0.5);
  }

  // Roots dangling from the rim, a few ending in a glowing bud.
  for (let n = 0; n < 14; n++) {
    let x = Math.floor(rand() * W);
    if (x >= lipL - 2 && x <= lipR + 2) continue;
    const y0 = Math.floor(cliffTop(x)) + 2;
    const len = 4 + Math.floor(rand() * 10);
    for (let d = 0; d < len; d++) {
      if (hash(x, y0 + d, 9) > 0.75) x += hash(x, d) > 0.5 ? 1 : -1;
      px(x, y0 + d, C.root);
    }
    if (rand() < 0.35) {
      px(x, y0 + len, C.mint);
      addLight(x, y0 + len, 4, C.mint, 0.6);
    }
  }

  // Thin seeps trickling down the left cliff face.
  for (let n = 0; n < 3; n++) {
    const x = Math.round(W * (0.04 + rand() * 0.2));
    const from = Math.floor(ledgeY(1 + Math.floor(rand() * 2), x));
    const to = Math.min(150, Math.floor(ledgeY(4 + Math.floor(rand() * 3), x)));
    for (let y = from; y < to; y++) if (onCliff(x, y)) px(x, y, C.upperFall, 5);
  }

  // Main fall: stepped tiers widening toward the pool.
  for (let y = FALL_TOP; y < fallBottom; y++)
    for (let x = fallLeft(y); x <= fallRight(y); x++) px(x, y, C.fallMid, 1);

  // Blossom canopies. Each canopy is a stack of flattened pads drawn back to
  // front, so lower tiers overlap the ones behind with their lit tops. Pads are
  // built from 2x2 florets shaded by where they sit on the pad: moonlit on the
  // upper right, falling into shadow underneath.
  const canopy: { x: number; y: number; r: number }[] = [];
  const TONES = [C.blossomBase, C.blossomShade, C.blossom, C.blossomLit];
  const FLORET: [number, number, number][] = [[0, 0, 0], [1, 0, 1], [0, 1, -1], [1, 1, 0]];
  const pad = (cx: number, cy: number, r: number) => {
    const rx = r * 1.35;
    const ry = r * 0.8;
    for (let gy = Math.floor((cy - ry) / 2) * 2; gy <= cy + ry; gy += 2)
      for (let gx = Math.floor((cx - rx) / 2) * 2; gx <= cx + rx; gx += 2) {
        const nx = (gx + 1 - cx) / rx;
        const ny = (gy + 1 - cy) / ry;
        if (nx * nx + ny * ny > 1 - hash(gx, gy, 3) * 0.35) continue; // ragged fringe
        const l = -ny * 0.75 + nx * 0.3 + (hash(gx, gy, 4) - 0.5) * 0.5;
        const tone = l > 0.55 ? 3 : l > 0.05 ? 2 : l > -0.45 ? 1 : 0;
        // Rotate the floret's light/dark corners so no regular checker forms.
        const rot = Math.floor(hash(gx, gy, 6) * 4);
        for (let f = 0; f < 4; f++) {
          const [ox, oy] = FLORET[f];
          const step = FLORET[(f + rot) % 4][2];
          const X = gx + ox;
          const Y = gy + oy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const k = kind[Y * W + X];
          if (k === 1 || k === 3 || k === 5 || hash(X, Y, 5) > 0.92) continue;
          px(X, Y, TONES[Math.min(3, Math.max(0, tone + step))]);
        }
      }
    // A few petals dangle below the pad's rim.
    for (let n = 0; n < r / 2; n++) {
      const x = cx + (rand() - 0.5) * rx * 1.4;
      const y = cy + ry * (0.7 + rand() * 0.4);
      if (kind[Math.floor(y) * W + Math.floor(x)] !== 1) px(x, y, C.blossomShade);
    }
  };
  const blossom = (cx: number, cy: number, r: number) => {
    const pads: [number, number, number][] = [];
    const n = 3 + Math.floor(r / 4);
    for (let p = 0; p < n; p++)
      pads.push([cx + (rand() - 0.5) * r * 1.8, cy + (rand() - 0.5) * r * 0.9, r * (0.45 + rand() * 0.3)]);
    pads.sort((a, b) => a[1] - b[1]);
    for (const [x, y, pr] of pads) pad(x, y, pr);
    canopy.push({ x: cx, y: cy, r });
    // Some canopies carry a faint bioluminescent bloom.
    if (rand() < 0.35) addLight(cx, cy, Math.round(r + 6), C.violet, 0.22, 0.3);
  };

  // Recursive branching: each limb bends once, then forks into two or three
  // thinner, shorter limbs, nudged back toward vertical. Tips are collected.
  // An optional keep-out keeps limbs left of `maxX` / right of `minX` below
  // `belowY` (used to stop the willow from growing across the waterfall).
  type KeepOut = { minX?: number; maxX?: number; belowY: number };
  const branch = (
    x: number, y: number, len: number, ang: number, w: number, depth: number,
    tips: [number, number][], keep?: KeepOut,
  ) => {
    const blocked = (px2: number, py2: number) =>
      !!keep && py2 > keep.belowY && ((keep.minX !== undefined && px2 < keep.minX) || (keep.maxX !== undefined && px2 > keep.maxX));
    let a2 = ang + (rand() - 0.5) * 0.5;
    // Steer straight up if this limb would stray into the keep-out.
    if (blocked(x + Math.cos(ang) * len * 0.5 + Math.cos(a2) * len * 0.5, y + Math.sin(ang) * len)) ang = a2 = -Math.PI / 2;
    const x1 = x + Math.cos(ang) * len * 0.5;
    const y1 = y + Math.sin(ang) * len * 0.5;
    const x2 = x1 + Math.cos(a2) * len * 0.5;
    const y2 = y1 + Math.sin(a2) * len * 0.5;
    const w1 = Math.max(1, w * 0.68);
    limb([[x, y], [x1, y1], [x2, y2]], w, w1);
    if (depth === 0) {
      tips.push([x2, y2]);
      return;
    }
    const forks = rand() < 0.3 ? 3 : 2;
    for (let i = 0; i < forks; i++) {
      let a = a2 + (i - (forks - 1) / 2) * (0.5 + rand() * 0.5) + (rand() - 0.5) * 0.2;
      a += (-Math.PI / 2 - a) * 0.15;
      branch(x2, y2, len * (0.62 + rand() * 0.18), a, w1, depth - 1, tips, keep);
    }
  };
  // Left-cliff clumps are fractions of W; the ones beside the fall are offsets from the lips.
  const leftClumps: [number, number, number][] = [
    [0.03, 36, 15], [0.12, 30, 14], [0.22, 34, 14], [0.32, 44, 12], [0.43, 50, 11], [0.53, 54, 11],
    [0.27, 70, 9], [0.38, 64, 8], [0.48, 72, 8],
  ];
  for (const [u, y, r] of leftClumps) blossom(W * u, y, r);
  const nearFall: [number, number, number][] = [
    [-10, 58, 10], [-14, 88, 9], [-22, 112, 10], [8, 50, 9], [20, 44, 11], [10, 90, 10], [16, 116, 11],
  ];
  for (const [dx, y, r] of nearFall) blossom((dx < 0 ? lipL : lipR) + dx, y, r);

  reseed(303);
  // Pool, the outlet channel and a small cascade over rocks at the bottom.
  // The shoreline wobbles with noise; a band just inside it is shallow water.
  const POOL_RY = 11;
  const poolDist = (x: number, y: number) => {
    const nx = (x - poolCx) / poolRx;
    const ny = (y - POOL_CY) / POOL_RY;
    const shore = 0.88 + noise(Math.atan2(ny, nx) * 1.6 + 20) * 0.26;
    return Math.hypot(nx, ny) / shore; // <1 inside the pool
  };
  const inPool = (x: number, y: number) =>
    poolDist(x, y) <= 1 || (y >= POOL_CY && y < 170 && Math.abs(x - poolCx) < W * 0.05);
  const shallow = new Uint8Array(W * H);
  for (let y = 140; y < 171; y++)
    for (let x = 0; x < W; x++)
      if (inPool(x, y)) {
        px(x, y, C.pool, 2);
        if (poolDist(x, y) > 0.8) shallow[y * W + x] = 1;
      }
  for (let y = 170; y < H; y++)
    for (let x = Math.round(poolCx - W * 0.025); x <= poolCx + W * 0.025; x++) px(x, y, C.fallMid, 4);

  // Banks: dark bush mounds.
  const bush = (cx: number, cy: number, r: number) =>
    disc(cx, cy, r, (x, y) => (y < cy - r * 0.3 && hash(x, y) > 0.55 ? C.bushLit : C.bush));
  for (let n = 0; n < 7; n++) bush(W * (0.02 + n * 0.06), 168 + rand() * 6, 12 + rand() * 6);
  for (let x = poolCx + poolRx + 4; x < W + 12; x += W * 0.06) bush(x, 160 + rand() * 8, 11 + rand() * 7);
  bush(lipR + 18, 146, 8);

  // Boulders frame the outlet below the pool rather than sitting in it.
  const rocks: [number, number, number][] = [
    [-0.07, 175, 6], [0.07, 174, 7], [-0.1, 181, 7], [0.11, 181, 7], [0, 184, 4], [0.16, 160, 5],
  ];
  for (const [u, y, r] of rocks)
    disc(poolCx + W * u, y, r, (x, yy) => (yy < y - r * 0.5 || (hash(x, yy) > 0.85 && yy < y) ? C.rockLit : C.rock));

  // Shoreline: a dark wet line hugging the water, then a scatter of pebbles.
  for (let y = 138; y < 170; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (kind[i] !== 0) continue;
      const d = poolDist(x, y);
      if (d > 1.22) continue;
      const touchesWater = kind[i - 1] === 2 || kind[i + 1] === 2 || kind[i - W] === 2 || kind[i + W] === 2;
      if (touchesWater) px(x, y, C.wetEdge);
      else if (hash(x, y, 8) > 0.72) px(x, y, hash(x, y, 9) > 0.5 ? C.rockLit : C.rock);
    }

  // Lily pads, foreshortened into flat ellipses, some with a glowing bloom.
  // Kept away from the churn where the fall lands.
  const impactX = fx - 8;
  for (let n = 0, placed = 0; n < 30 && placed < 6; n++) {
    const lx = Math.round(poolCx + (rand() - 0.5) * poolRx * 1.6);
    const ly = Math.round(POOL_CY - 5 + rand() * 11);
    if (Math.abs(lx - impactX) < 14 || poolDist(lx, ly) > 0.75) continue;
    placed++;
    const r = 2 + Math.floor(rand() * 2);
    const notch = rand() < 0.5 ? 1 : -1;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if ((dx / r) ** 2 + dy * dy > 1.05) continue;
        if (dy === 0 && dx * notch > 0 && dx * notch < r) continue; // wedge-shaped notch
        px(lx + dx, ly + dy, dy < 0 ? C.padLit : C.pad);
        // A dark line where the pad meets the water seats it on the surface.
        if (dy === 1 || (dy === 0 && Math.abs(dx) === r)) px(lx + dx, ly + dy + 1, C.wetEdge);
      }
    if (rand() < 0.6) {
      const bloom = rand() < 0.5 ? C.mint : C.violet;
      px(lx - notch, ly - 1, bloom);
      px(lx - notch, ly - 2, C.petal);
      addLight(lx - notch, ly - 1, 6, bloom, 0.6);
    }
  }

  // Arched stone footbridge over a side channel feeding the pool. Both feet
  // stand on the bank; the arch spans water so the opening never reads as a hole.
  const bx1 = Math.round(poolCx - poolRx + 6);
  const bx0 = Math.round(bx1 - W * 0.26);
  const span = bx1 - bx0;
  const footL = 167; // ground line at each foot
  const footR = 163;
  const ground = (u: number) => footL + (footR - footL) * u;
  const deckY = (u: number) => Math.round(ground(u) - 7 - Math.sin(u * Math.PI) * 7);
  // Arch opening: a half-ellipse across the middle of the span, low enough
  // that a solid band of stone runs over its crown.
  const archC = 0.5;
  const archHalf = 0.27;
  const crown = deckY(archC) + 7;
  const archTopY = (u: number) => {
    const a = (u - archC) / archHalf;
    if (Math.abs(a) >= 1) return Infinity;
    return crown + (1 - Math.sqrt(1 - a * a)) * (ground(u) + 2 - crown);
  };

  // Water only under the arch: a stream slipping beneath the span.
  const cmx = bx0 + span * archC;
  for (let y = crown; y < footL + 4; y++)
    for (let x = bx0; x <= bx1; x++)
      if (((x - cmx) / (span * archHalf + 2)) ** 2 + ((y - (footL + 1)) / 6) ** 2 <= 1) px(x, y, C.pool, 2);

  // Viewed from slightly above: far railing, then the walkway surface, then
  // the near face and near railing in front.
  const WALK = 2; // visible depth of the walkway, in px
  const railing = (x: number, base: number, near: boolean) => {
    const railH = 5;
    for (let y = base - railH; y < base; y++) {
      const dy = base - y;
      const post = (x - bx0) % 6 === 0;
      const lattice = dy < 5 && ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0);
      if (dy === 5 || post) px(x, y, near ? (dy === railH ? C.bridgeLit : C.bridge) : C.bridgeDark);
      else if (lattice) px(x, y, near ? C.bridgeDark : C.rail);
    }
  };
  for (let x = bx0; x <= bx1; x++) railing(x, deckY((x - bx0) / span) - WALK, false);

  for (let x = bx0 - 1; x <= bx1 + 1; x++) {
    const u = Math.min(1, Math.max(0, (x - bx0) / span));
    const deck = deckY(u);
    const bottom = ground(u) + 3;
    // Each end is a squared stone pillar that rises from the bank to cap the
    // railing, so the bridge stops cleanly where the rail does.
    const pillar = x <= bx0 + 1 || x >= bx1 - 1;
    if (pillar) {
      const outer = x === bx0 - 1 || x === bx1 + 1;
      for (let y = deck - 8; y < bottom; y++) {
        let c = (y - deck) % 3 === 0 ? C.bridgeDark : C.bridge;
        if (y === deck - 8) c = C.bridgeLit; // cap
        else if (outer) c = C.bridgeDark; // crisp outside edge
        else if (x === bx1 && y > deck - 8) c = (y - deck) % 3 === 0 ? C.bridgeDark : C.bridgeLit; // moonlit side
        px(x, y, c);
      }
      continue;
    }
    const top = deck;
    const arch = archTopY(u);
    // Walkway: moonlit flagstones.
    for (let y = deck - WALK; y < deck; y++) px(x, y, (x + (y % 2) * 2) % 5 === 0 ? C.bridge : C.bridgeLit);
    for (let y = top; y < bottom; y++) {
      if (y >= arch) continue; // the stream shows through the opening
      const row = Math.floor((y - deck) / 3);
      const mortar = (y - deck) % 3 === 0 || (x + (row % 2) * 3) % 6 === 0;
      let c = mortar ? C.bridgeDark : C.bridge;
      if (y === top) c = C.bridgeLit;
      else if (arch - y < 2) c = (x + y) % 3 === 0 ? C.bridgeDark : C.bridgeLit; // voussoir ring
      px(x, y, c);
    }
    // Shadow the water just under the crown.
    if (Number.isFinite(arch)) for (let y = Math.ceil(arch); y < arch + 2; y++) px(x, y, C.bridgeDark);
    railing(x, deck, true);
  }

  // Rocks and a bush in front of the feet so each end settles into the bank
  // instead of stopping in a flat vertical cut.
  for (const [ox, oy, r] of [[3, 5, 6], [8, 7, 5], [-2, 8, 5], [12, 4, 4]] as const)
    disc(bx1 + ox, footR + oy, r, (x, y) => (y < footR + oy - r * 0.4 || (hash(x, y) > 0.85 && y < footR + oy) ? C.rockLit : C.rock));
  bush(bx0 - 3, footL + 7, 8);
  bush(bx0 + 4, footL + 9, 6);

  // Grass tufts on the banks around the pool.
  for (let n = 0; n < 90; n++) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(146 + rand() * 32);
    const i = y * W + x;
    if (kind[i] !== 0 || inPool(x, y) || (x >= bx0 - 4 && x <= bx1 + 4 && y < footL + 3)) continue;
    const blades = 2 + Math.floor(rand() * 3);
    for (let b = 0; b < blades; b++) {
      const h = 1 + Math.floor(rand() * 3);
      const lean = b - (blades - 1) / 2;
      for (let d = 0; d < h; d++) px(x + Math.round(lean * (d / 2 + 0.5)), y - d, d === h - 1 ? C.mossLit : C.moss);
    }
  }

  // Reeds standing along the shore; drawn per frame so they sway.
  const reeds: Scene["reeds"] = [];
  for (let n = 0; n < 60 && reeds.length < 16; n++) {
    const a = rand() * Math.PI * 2;
    const x = Math.round(poolCx + Math.cos(a) * poolRx * 1.02);
    const y = Math.round(POOL_CY + Math.sin(a) * POOL_RY * 1.05);
    if (y < 146 || inPool(x, y) || x < bx1 + 4 || Math.abs(x - impactX) < 14) continue;
    for (let k = 0; k < 2 + Math.floor(rand() * 2); k++)
      reeds.push({ x: x + k * 2 - 1, y, h: 6 + Math.floor(rand() * 8), phase: rand() * 6.28, glow: rand() < 0.35 });
  }
  // A clump at the bridge's near foot as well.
  for (let k = 0; k < 4; k++)
    reeds.push({ x: bx0 + 6 + k * 2, y: footL + 2, h: 7 + Math.floor(rand() * 7), phase: rand() * 6.28, glow: k === 1 });

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
  const rightBank = poolCx + poolRx;
  for (let n = 0; n < 7; n++) plant(Math.round(rightBank + rand() * (W - rightBank)), Math.round(152 + rand() * 24), 1 + rand());
  // Near the bridge foot and the left bank.
  for (let n = 0; n < 10; n++) plant(Math.round(W * (0.02 + rand() * 0.36)), Math.round(163 + rand() * 15), 1 + rand());
  // On the rocks by the bridge's far foot, clear of the railing.
  for (let n = 0; n < 4; n++) plant(Math.round(bx1 + 4 + rand() * 8), Math.round(footR + 6 + rand() * 4), 0.6);
  // Tucked into cliff ledges.
  for (let n = 0; n < 6; n++) {
    const x = Math.round(rand() < 0.7 ? W * (0.05 + rand() * 0.5) : lipR + 4 + rand() * (W - lipR - 4));
    plant(x, Math.round(cliffTop(x) + 8 + rand() * 50), 0.4);
  }

  // Left: a blossom tree grown by branching, with a canopy on every tip.
  reseed(101);
  const leftTips: [number, number][] = [];
  branch(W * 0.1, H + 4, 48, -Math.PI / 2 + 0.06, 8, 4, leftTips);
  for (const [x, y] of leftTips) blossom(x, y, 7 + rand() * 4);

  // Right: a dark tree leaning in over the moon, with leaf clumps on its tips.
  const tx = Math.max(lipR + 14, W * 0.93);
  const rightTips: [number, number][] = [];
  reseed(202);
  branch(tx, H + 4, 52, -Math.PI / 2 - 0.14, 13, 4, rightTips, { minX: lipR + 3, belowY: FALL_TOP - 6 });
  for (const [x, y] of rightTips)
    disc(x, y, 5 + rand() * 3, (X, Y) => (Y > y && hash(X, Y) > 0.6 ? C.leafLit : C.leaf));

  // Foreground bushes at the very bottom corners.
  for (let n = 0; n < 4; n++) bush(W * (n * 0.07), 182, 12 + rand() * 6);
  for (let n = 0; n < 4; n++) bush(W * (0.78 + n * 0.08), 182, 12 + rand() * 6);
  for (let n = 0; n < 5; n++) plant(Math.round(W * (rand() < 0.5 ? rand() * 0.2 : 0.8 + rand() * 0.2)), 176 + Math.floor(rand() * 4), 1.6);

  // Mist glow where the fall meets the pool, and along the fall itself.
  addLight(fx - 8, fallBottom - 2, 32, C.mist, 0.9, 0.35);
  addLight(impactX - 4, POOL_CY - 2, 18, C.mist, 0.45, 0.5);
  for (let y = FALL_TOP + 6; y < fallBottom - 10; y += 14) addLight(fx - (y - FALL_TOP) / 8, y, 16, C.mist, 0.35, 0.4);
  addLight(poolCx, 172, 12, C.mist, 0.5, 0.6);

  // Glowing fish circling the pool beneath the surface.
  const fishColors = [C.koi, C.cyan, C.koi];
  const fish: Scene["fish"] = fishColors.map((color, n) => ({
    phase: rand() * 6.28,
    speed: (0.25 + rand() * 0.2) * (n % 2 ? -1 : 1),
    rx: poolRx * (0.45 + rand() * 0.3),
    ry: 3 + rand() * 3,
    color,
  }));

  // Petals shed from the canopies and flutter down and to the left.
  const petals: Scene["petals"] = [];
  for (let n = 0; n < Math.round(W * 0.12); n++) {
    const c = canopy[Math.floor(rand() * canopy.length)];
    petals.push({ x: c.x + (rand() - 0.5) * c.r * 2, y: c.y, phase: rand(), speed: 4 + rand() * 6 });
  }

  const flies: Scene["flies"] = [];
  for (let n = 0; n < Math.round(W * 0.06); n++)
    flies.push({ x: rand() * W, y: 110 + rand() * 65, phase: rand() * 6.28, sx: 0.2 + rand() * 0.4, sy: 0.3 + rand() * 0.5 });

  const mainFall: number[] = [];
  const upperFall: number[] = [];
  const lowerFall: number[] = [];
  const seeps: number[] = [];
  const pool: number[] = [];
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] === 5) seeps.push(i);
    // shallow: 0 = not water, 1 = shallows, 2 = deep (only where water survived).
    if (kind[i] !== 2) shallow[i] = 0;
    else if (!shallow[i]) shallow[i] = 2;
    if (kind[i] === 1) mainFall.push(i);
    else if (kind[i] === 2) pool.push(i);
    else if (kind[i] === 3) upperFall.push(i);
    else if (kind[i] === 4) lowerFall.push(i);
  }

  return { W, base, fx, fallBottom, poolCx, mainFall, upperFall, lowerFall, seeps, pool, lights, stars, petals, flies,
    reeds, fish, shallow, poolRx };
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
    const core = Math.abs(x - s.fx) <= 1;
    put(i, st < (core ? 0.45 : 0.2) ? (core ? C.fallLight : C.fallMid) : C.upperFall);
  }

  for (const i of s.mainFall) {
    const x = i % W;
    const y = (i / W) | 0;
    // Lumpy ledge lines so each tier's lip bulges instead of running straight.
    const local = y - FALL_TOP + Math.round(Math.sin(x * 0.45) * 1.2 + hash(Math.floor(x / 3), 5) * 2);
    const k = Math.floor(local / TIER);
    const tierY = local - k * TIER;
    // Water gathers into ropes a couple of pixels wide, offset on every tier.
    const rope = hash(Math.floor((x + k * 3) / 2), 9 + k);
    const st = streak(x, y, 34, rope > 0.8 ? 14 : 7);
    let c: RGB;
    if (rope > 0.8) c = st < 0.7 ? C.fallLight : C.fallMid;
    else if (rope > 0.45) c = st < 0.18 ? C.fallLight : C.fallMid;
    else c = st < 0.12 ? C.fallMid : C.fallDark;
    // The curtain glows a little brighter as it nears the pool.
    const low = (y - (s.fallBottom - 26)) / 26;
    if (c === C.fallDark && low > bayer(x, y)) c = C.fallMid;
    // Each lip curls over bright; spray churns where the water hits the ledge below.
    if (tierY < 2 && hash(Math.floor(x / 2), k) > 0.2) c = tierY === 0 || hash(x, y, tick) > 0.5 ? C.fallLight : C.foam;
    else if (tierY > TIER - 3 && hash(x, y, tick) > 0.55) c = C.foam;
    if (y > s.fallBottom - 7 && hash(x, y, tick) > 0.35) c = C.foam;
    put(i, c);
  }

  // Seeps: beads of light sliding down a thin wet line.
  for (const i of s.seeps) {
    const x = i % W;
    const y = (i / W) | 0;
    const st = streak(x, y, 14, 11);
    put(i, st < 0.15 ? C.fallLight : st < 0.4 ? C.fallMid : C.upperFall);
  }

  for (const i of s.lowerFall) {
    const x = i % W;
    const y = (i / W) | 0;
    const st = streak(x, y, 30, 6);
    put(i, st < 0.25 ? C.foam : st < 0.6 ? C.fallMid : C.fallDark);
  }

  // Pool: still water so the fish read clearly. Shallows are lighter, deep
  // water darkens toward the far bank; only the landing point churns.
  const ix = s.fx - 8;
  const iy = s.fallBottom + 1;
  for (const i of s.pool) {
    const x = i % W;
    const y = (i / W) | 0;
    let c: RGB;
    if (s.shallow[i] === 1) c = C.poolMid;
    else {
      const far = Math.abs(x - s.poolCx) / s.poolRx;
      c = far > 0.5 && bayer(x, y) < far - 0.4 ? C.poolDeep : C.pool;
    }
    const d = Math.hypot(x - ix, (y - iy) * 2.4);
    if (d < 10 && hash(x, y, tick) > 0.55 + d / 30) c = C.foam;
    put(i, c);
  }

  // Fish: solid bright bodies with a pale head, darker belly and a forked tail
  // that flicks; a soft halo makes them glow. Drawn only over open water.
  const tint = (c: RGB, k: number): RGB =>
    k > 1 ? [c[0] + (255 - c[0]) * (k - 1), c[1] + (255 - c[1]) * (k - 1), c[2] + (255 - c[2]) * (k - 1)] : [c[0] * k, c[1] * k, c[2] * k];
  for (const f of s.fish) {
    const a = t * f.speed + f.phase;
    const X = Math.round(s.poolCx + Math.cos(a) * f.rx);
    const Y = Math.round(POOL_CY + 1 + Math.sin(a) * f.ry);
    const dir = -Math.sin(a) * Math.sign(f.speed) > 0 ? 1 : -1; // facing along the path
    for (const o of glowOffsets(6)) {
      const j = (Y + o.dy) * W + X + o.dx;
      if (s.shallow[j]) add(j, f.color, o.f * 0.18);
    }
    const head = tint(f.color, 1.6);
    const belly = tint(f.color, 0.75);
    const flick = Math.sin(t * 8 + f.phase) > 0 ? 1 : 0;
    const body: [number, number, RGB][] = [
      [0, 0, head], [-1, 0, f.color], [-2, 0, f.color], [-3, 0, f.color],
      [-1, 1, belly], [-2, 1, belly], [-3, 1, belly],
      [-4, -1 + flick, f.color], [-5, -1 + flick, belly], [-4, 2 - flick, f.color], [-5, 2 - flick, belly],
    ];
    for (const [dx, dy, c] of body) {
      const j = (Y + dy) * W + X + dx * dir;
      if (s.shallow[j]) put(j, c);
    }
  }


  // Reeds bend from the root; cattail heads, some of them glowing.
  for (const r of s.reeds) {
    let X = r.x;
    for (let d = 0; d < r.h; d++) {
      X = Math.round(r.x + Math.sin(t * 0.7 + r.phase) * (d / r.h) ** 1.5 * 1.6);
      const Y = r.y - d;
      if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
      const head = d >= r.h - 2;
      put(Y * W + X, head ? (r.glow ? C.green : C.cattail) : C.reed);
    }
    if (r.glow) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 1.2 + r.phase);
      for (const o of glowOffsets(4)) add((r.y - r.h + 1 + o.dy) * W + X + o.dx, C.green, o.f * 0.3 * pulse);
    }
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


  // Petals fall from their canopy, drifting left and flickering as they turn.
  for (const p of s.petals) {
    const span = H - p.y + 8;
    const dy = (t * p.speed + p.phase * span) % span;
    const Y = Math.floor(p.y + dy);
    const X = Math.floor(p.x - dy * 0.35 + Math.sin(t * 1.5 + p.phase * 40) * 3);
    if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
    const flip = Math.floor(t * 6 + p.phase * 10) % 3 === 0;
    put(Y * W + X, flip ? C.blossomShade : C.petal);
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
      // Half the content card's width (see home.module.css) plus a margin, in canvas pixels.
      const scale = Math.max(width / W, height / H);
      const cardHalf = (Math.min(width - 32, 440) / 2 + 24) / scale;
      const visW = Math.min(W, width / scale);
      const { fx, left } = frameScene(W, visW, cardHalf);
      // object-position pans the cropped canvas so `left` is the slice's edge.
      canvas.style.objectPosition = W - visW < 0.5 ? "50% 50%" : `${(left / (W - visW)) * 100}% 50%`;
      if (scene?.W === W && scene.fx === fx) return;
      canvas.width = W;
      canvas.height = H;
      scene = buildScene(W, fx);
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
