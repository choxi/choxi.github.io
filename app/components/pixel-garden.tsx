"use client";

import { useEffect, useRef } from "react";

// A small pixel scene at the bottom of each post: a strip of grassy ground
// with rounded shrubs on either side and a pond in the middle, edged with
// rocks, with lily pads and fish. It follows the theme:
//
// night: deep-teal greens, glowing fish like the landing scene's
//        (moon-falls.tsx), bioluminescent mushrooms, stalks and ferns among
//        the shrubs, and mint glints on the water. Fireflies drift over it
//        (see posts/layout.tsx).
// day:   fresh greens, koi, wildflowers swaying in a breeze, and a dragonfly
//        that hovers and darts between the pond and the flowers.
//
// Everything is drawn on a coarse pixel grid (PLANT_PX screen pixels per art
// pixel) and scaled up with crisp pixels. The still parts of each theme are
// drawn once into an offscreen canvas; each frame copies that and adds what
// moves. Layouts are seeded, so the scene is the same on every visit, and
// rebuilt only when the size changes. It pauses off screen and holds still
// for people who prefer reduced motion.

type RGB = [number, number, number];
type Theme = "day" | "night";

export const PLANT_PX = 4;
const FPS_INTERVAL = 1000 / 12;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (x: number, y: number, z = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const lighten = (c: RGB, k = 0.6): RGB => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];
const rgb = (c: RGB, a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;

const PALETTES = {
  day: {
    grassTop: [124, 182, 102] as RGB,
    grass: [92, 154, 88] as RGB,
    grassDark: [68, 126, 76] as RGB,
    shrub: [
      [50, 102, 68],
      [76, 138, 84],
      [116, 172, 98],
    ] as RGB[],
    blossom: [
      [176, 146, 232],
      [214, 192, 248],
    ] as RGB[],
    waterFar: [72, 132, 166] as RGB,
    water: [98, 166, 198] as RGB,
    waterNear: [124, 186, 212] as RGB,
    glint: [240, 250, 254] as RGB,
    rock: [
      [118, 120, 132],
      [152, 154, 164],
      [194, 196, 204],
    ] as RGB[],
    pad: [
      [70, 138, 78],
      [102, 170, 96],
    ] as RGB[],
    fish: [
      [244, 128, 52],
      [248, 244, 234],
      [240, 188, 64],
    ] as RGB[],
  },
  night: {
    grassTop: [44, 102, 90] as RGB,
    grass: [28, 72, 66] as RGB,
    grassDark: [18, 52, 50] as RGB,
    shrub: [
      [12, 36, 38],
      [20, 58, 56],
      [36, 90, 80],
    ] as RGB[],
    blossom: [
      [150, 126, 210],
      [198, 178, 242],
    ] as RGB[],
    waterFar: [10, 34, 42] as RGB,
    water: [16, 50, 60] as RGB,
    waterNear: [24, 68, 76] as RGB,
    glint: [150, 255, 210] as RGB,
    rock: [
      [30, 44, 50],
      [46, 64, 70],
      [70, 92, 96],
    ] as RGB[],
    pad: [
      [20, 60, 50],
      [32, 86, 68],
    ] as RGB[],
    fish: [
      [90, 245, 230],
      [255, 130, 215],
      [190, 160, 255],
      [255, 214, 100],
    ] as RGB[],
  },
};

// ---------------------------------------------------------------------------
// Layout, shared by both themes
// ---------------------------------------------------------------------------

type Pond = { cx: number; cy: number; rx: number; ry: number };
type Shrub = { x: number; r: number; blossom: boolean };
type Fish = { cx: number; cy: number; rx: number; ry: number; phase: number; speed: number };

function plan(w: number, h: number) {
  const rand = mulberry32(7);
  const wide = w * PLANT_PX >= 720;

  // The pond is sunk into a band of ground deep enough to hold it.
  const pond: Pond = {
    cx: Math.round(w / 2),
    cy: h - 6,
    rx: Math.round(wide ? Math.min(w * 0.17, 62) : w * 0.26),
    ry: 6,
  };

  // The top of the ground, gently rolling.
  const tops = Array.from({ length: w }, (_, x) => h - 13 + Math.round(Math.sin(x * 0.09) * 0.8 + Math.sin(x * 0.031 + 1) * 0.9));
  const groundAt = (x: number) => tops[Math.max(0, Math.min(w - 1, Math.round(x)))];

  // Shrubs and plants on both sides of the pond; fewer on narrow screens.
  const shrubs: Shrub[] = wide
    ? [
        { x: w * 0.04, r: 15, blossom: false },
        { x: w * 0.2, r: 11, blossom: true },
        { x: w * 0.8, r: 12, blossom: true },
        { x: w * 0.96, r: 16, blossom: false },
      ]
    : [
        { x: w * 0.05, r: 10, blossom: true },
        { x: w * 0.95, r: 11, blossom: false },
      ];
  const plantSpots = wide ? [w * 0.12, w * 0.27, w * 0.73, w * 0.88] : [w * 0.2, w * 0.8];

  // Rocks around the rim (angles from the pond's centre; up is negative).
  const rocks = [200, 228, 262, 312, 338, 168].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: Math.round(pond.cx + Math.cos(a) * pond.rx), y: Math.round(pond.cy + Math.sin(a) * pond.ry), big: rand() < 0.5 };
  });

  const pads = [
    { x: Math.round(pond.cx - pond.rx * 0.5), y: pond.cy - 2, flower: true },
    { x: Math.round(pond.cx + pond.rx * 0.45), y: pond.cy, flower: false },
    { x: Math.round(pond.cx + pond.rx * 0.05), y: pond.cy - 4, flower: false },
  ];

  const fish: Fish[] = Array.from({ length: wide ? 4 : 3 }, (_, n) => ({
    cx: pond.cx + (rand() - 0.5) * pond.rx * 0.3,
    cy: pond.cy - 2 + (rand() - 0.5) * 2,
    rx: pond.rx * (0.35 + rand() * 0.4),
    ry: pond.ry * (0.25 + rand() * 0.25),
    phase: rand() * 6.28,
    speed: (0.25 + rand() * 0.2) * (n % 2 ? -1 : 1),
  }));

  const ripples = Array.from({ length: 2 }, () => ({
    x: pond.cx + (rand() - 0.5) * pond.rx * 1.2,
    y: pond.cy - 2 + Math.round((rand() - 0.5) * 4),
    phase: rand() * 5,
  }));

  const glints = Array.from({ length: 7 }, () => ({
    x: Math.round(pond.cx + (rand() - 0.5) * pond.rx * 1.6),
    y: Math.round(pond.cy - 4 + rand() * 6),
    phase: rand() * 6.28,
    speed: 0.6 + rand() * 1.2,
  }));

  const inPond = (x: number, y: number) => ((x - pond.cx) / pond.rx) ** 2 + ((y - pond.cy) / pond.ry) ** 2 < 1;

  return { w, h, wide, groundAt, pond, shrubs, plantSpots, rocks, pads, fish, ripples, glints, inPond, rand };
}

type Plan = ReturnType<typeof plan>;

// ---------------------------------------------------------------------------
// The still scene for a theme, drawn once
// ---------------------------------------------------------------------------

type Light = { x: number; y: number; r: number; c: RGB; phase: number; speed: number };
type Flower = { x: number; base: number; height: number; kind: "daisy" | "lavender" | "tulip"; color: RGB; leaf: -1 | 1; phase: number };

function bake(p: Plan, theme: Theme) {
  const pal = PALETTES[theme];
  const canvas = document.createElement("canvas");
  canvas.width = p.w;
  canvas.height = p.h;
  const ctx = canvas.getContext("2d")!;
  const put = (x: number, y: number, c: RGB) => {
    ctx.fillStyle = rgb(c);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const rand = mulberry32(theme === "day" ? 31 : 13);

  // Shrubs first, so the ground's grass overlaps their feet.
  for (const s of p.shrubs) {
    const base = p.groundAt(s.x) + 1;
    const blobs: [number, number, number][] = [
      [s.x - s.r * 0.75, base - s.r * 0.45, s.r * 0.72],
      [s.x + s.r * 0.8, base - s.r * 0.4, s.r * 0.68],
      [s.x, base - s.r * 0.7, s.r],
      [s.x + s.r * 0.15, base - s.r * 1.2, s.r * 0.62],
    ];
    for (const [bx, by, br] of blobs)
      for (let y = Math.floor(by - br); y <= by + br; y++)
        for (let x = Math.floor(bx - br); x <= bx + br; x++) {
          const dx = x - bx;
          const dy = y - by;
          const d = Math.hypot(dx, dy) / br;
          if (d >= 1 || y > base) continue;
          // Lit from the upper left, with a little dithered texture.
          const l = (-dx * 0.6 - dy) / br + (hash(x, y, 1) - 0.5) * 0.55;
          let c = pal.shrub[l > 0.55 ? 2 : l > -0.2 ? 1 : 0];
          if (d > 0.82 && dy > 0) c = pal.shrub[0];
          if (s.blossom && l > 0.1 && hash(x, y, 2) > 0.72) c = pal.blossom[hash(x, y, 3) > 0.5 ? 1 : 0];
          put(x, y, c);
        }
  }

  // Ground: a grass edge with a few blades poking up, darker below.
  for (let x = 0; x < p.w; x++) {
    const top = p.groundAt(x);
    for (let y = top; y < p.h; y++) put(x, y, y === top ? pal.grassTop : y === top + 1 ? pal.grass : pal.grassDark);
    if (hash(x, 0, 4) > 0.78) put(x, top - 1, pal.grassTop);
    if (hash(x, 0, 5) > 0.93) put(x, top - 2, pal.grass);
  }

  // Pond: deeper colour toward the far bank, lighter toward us, with faint
  // streaks across the surface.
  const { pond } = p;
  for (let y = pond.cy - pond.ry; y < p.h; y++)
    for (let x = pond.cx - pond.rx; x <= pond.cx + pond.rx; x++) {
      if (!p.inPond(x, y)) continue;
      const v = (y - pond.cy) / pond.ry;
      let c = v < -0.55 ? pal.waterFar : v > 0.15 ? pal.waterNear : pal.water;
      if (hash(x >> 2, y, 6) > 0.86 && v > -0.55) c = lighten(c, 0.12);
      put(x, y, c);
    }

  // Rocks around the rim: shaded lumps, lit from above.
  for (const r of p.rocks) {
    const half = r.big ? 2 : 1;
    for (let dx = -half; dx <= half; dx++) {
      put(r.x + dx, r.y, pal.rock[0]);
      if (Math.abs(dx) < half || !r.big) put(r.x + dx, r.y - 1, pal.rock[1]);
    }
    put(r.x - (r.big ? 1 : 0), r.y - 1, pal.rock[2]);
    if (r.big) put(r.x, r.y - 2, pal.rock[1]);
  }

  // Night: glowing plants among the shrubs. Day: wildflowers, which sway, so
  // they're drawn each frame instead.
  const lights: Light[] = [];
  const flowers: Flower[] = [];
  if (theme === "night") {
    const STEM: RGB = [52, 122, 112];
    const GLOW: RGB[] = [
      [90, 245, 230],
      [255, 120, 215],
      [180, 150, 255],
      [150, 255, 170],
    ];
    const light = (x: number, y: number, r: number, c: RGB) => lights.push({ x, y, r, c, phase: rand() * 6.28, speed: 0.5 + rand() * 0.9 });
    const mushroom = (x: number, s: number, color: RGB) => {
      const ground = p.groundAt(x);
      for (let d = 0; d < s + 1; d++) {
        put(x, ground - d, STEM);
        if (s > 2) put(x + 1, ground - d, STEM);
      }
      const capY = ground - s - 1;
      for (let row = 0; row < 3; row++) {
        const half = s - row;
        for (let dx = -half; dx <= half + (s > 2 ? 1 : 0); dx++) put(x + dx, capY - row, row === 2 ? lighten(color) : color);
      }
      light(x, capY - 1, 7 + s * 3, color);
    };
    const stalk = (x: number, height: number, color: RGB) => {
      const ground = p.groundAt(x);
      const lean = (rand() - 0.5) * 0.5;
      for (let d = 0; d < height; d++) put(x + lean * d, ground - d, STEM);
      const tx = Math.round(x + lean * height);
      const ty = ground - height;
      for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) put(tx + dx, ty + dy, color);
      put(tx, ty, lighten(color));
      light(tx, ty, 7 + Math.round(height * 0.3), color);
    };
    const fern = (x: number, color: RGB) => {
      const ground = p.groundAt(x);
      for (let b = -4; b <= 4; b++) {
        const height = 3 + Math.floor(rand() * 4) - Math.abs(b) / 2;
        for (let d = 0; d < height; d++) {
          const c = d >= height - 1 ? lighten(color) : d >= height - 2 || rand() > 0.75 ? color : STEM;
          put(x + b + (b * d) / 5, ground - d, c);
        }
      }
      light(x, ground - 4, 9, color);
    };
    p.plantSpots.forEach((sx, i) => {
      const x = Math.round(sx);
      const color = GLOW[(i * 3 + 1) % GLOW.length];
      const kind = i % 3;
      if (kind === 0) {
        mushroom(x, 4, color);
        mushroom(x + 7, 2, color);
        mushroom(x - 5, 1, color);
      } else if (kind === 1) {
        stalk(x, 16 + Math.floor(rand() * 8), color);
        stalk(x + 3, 9 + Math.floor(rand() * 5), color);
        stalk(x - 3, 11 + Math.floor(rand() * 4), color);
      } else fern(x, color);
    });
    // A glowing bud on one lily pad.
    const bud = p.pads[1];
    light(bud.x, bud.y - 1, 6, GLOW[0]);
  } else {
    const PETALS: RGB[] = [
      [150, 118, 222],
      [226, 110, 160],
      [236, 160, 52],
      [228, 104, 84],
    ];
    p.plantSpots.forEach((sx) => {
      const x = Math.round(sx);
      const color = PETALS[Math.floor(rand() * PETALS.length)];
      const count = 3 + Math.floor(rand() * 2);
      for (let n = 0; n < count; n++) {
        const fx = x - 4 + n * 3 + Math.floor(rand() * 2);
        const pick = rand();
        flowers.push({
          x: fx,
          base: p.groundAt(fx),
          height: 7 + Math.floor(rand() * 10),
          kind: pick < 0.45 ? "daisy" : pick < 0.75 ? "lavender" : "tulip",
          color: n === 1 ? PETALS[Math.floor(rand() * PETALS.length)] : color,
          leaf: rand() < 0.5 ? -1 : 1,
          phase: rand() * 6.28,
        });
      }
    });
  }

  return { canvas, lights, flowers };
}

// ---------------------------------------------------------------------------
// What moves
// ---------------------------------------------------------------------------

// Stepped glow footprints, so halos read as pixel art.
const glowCache = new Map<number, [number, number, number][]>();
function glowOffsets(r: number) {
  let list = glowCache.get(r);
  if (list) return list;
  list = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d < 1) list.push([dx, dy, Math.ceil((1 - d) ** 2 * 5) / 5]);
    }
  glowCache.set(r, list);
  return list;
}

const DAY_STEM: RGB = [74, 138, 92];
const LEAF: RGB = [96, 160, 104];
const FLOWER_CENTER: RGB = [246, 196, 70];
const DRAGONFLY = { body: [34, 132, 146] as RGB, head: [22, 86, 100] as RGB, wing: [200, 228, 238] as RGB };

function animate(ctx: CanvasRenderingContext2D, p: Plan, scene: ReturnType<typeof bake>, theme: Theme, t: number, still: boolean) {
  const pal = PALETTES[theme];
  const night = theme === "night";
  const put = (x: number, y: number, c: RGB, a = 1) => {
    ctx.fillStyle = rgb(c, a);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const { pond } = p;
  const onPad = (x: number, y: number) => p.pads.some((pd) => Math.abs(x - pd.x) <= 2 && y >= pd.y - 1 && y <= pd.y);

  ctx.drawImage(scene.canvas, 0, 0);

  // Glints come and go on the water.
  for (const g of p.glints) {
    const k = still ? 0 : Math.sin(t * g.speed + g.phase);
    if (k > 0.75 && p.inPond(g.x, g.y)) put(g.x, g.y, pal.glint, night ? 0.9 : 0.8);
  }

  // Ripples spread in slow rings.
  for (const r of p.ripples) {
    if (still) break;
    const life = ((t + r.phase) % 4.5) / 4.5;
    const rad = life * 7;
    for (let a = 0; a < 6.28; a += 0.25) {
      const x = Math.round(r.x + Math.cos(a) * rad);
      const y = Math.round(r.y + Math.sin(a) * rad * 0.4);
      if (p.inPond(x, y) && !onPad(x, y)) put(x, y, lighten(pal.water, 0.35), (1 - life) * 0.7);
    }
  }

  // Fish circle the pond, with a flicking tail; drawn only over open water,
  // so they slip under the lily pads and out of sight at the rim.
  p.fish.forEach((f, n) => {
    const a = (still ? 0 : t) * f.speed + f.phase;
    const X = Math.round(f.cx + Math.cos(a) * f.rx);
    const Y = Math.round(f.cy + Math.sin(a) * f.ry);
    const dir = -Math.sin(a) * Math.sign(f.speed) > 0 ? 1 : -1;
    const color = pal.fish[n % pal.fish.length];
    if (night) {
      ctx.globalCompositeOperation = "lighter";
      for (const [dx, dy, k] of glowOffsets(5)) {
        const gx = X - dir + dx;
        const gy = Y + dy;
        if (p.inPond(gx, gy)) put(gx, gy, color, k * 0.3);
      }
      ctx.globalCompositeOperation = "source-over";
    }
    const flick = !still && Math.sin(t * 8 + f.phase) > 0 ? 1 : 0;
    const head = lighten(color, 0.5);
    const belly: RGB = [color[0] * 0.8, color[1] * 0.8, color[2] * 0.8];
    const body: [number, number, RGB][] = [
      [1, 0, head], [0, 0, color], [-1, 0, color], [-2, 0, color],
      [0, 1, belly], [-1, 1, belly],
      [-3, -1 + flick, color], [-3, 1 - flick + 0, belly],
    ];
    for (const [dx, dy, c] of body) {
      const x = X + dx * dir;
      const y = Y + dy;
      if (p.inPond(x, y) && !onPad(x, y)) put(x, y, c);
    }
  });

  // Lily pads float on top, one with a flower (or a glowing bud at night).
  p.pads.forEach((pd, i) => {
    for (let dx = -2; dx <= 2; dx++) if (dx !== 1) put(pd.x + dx, pd.y, pal.pad[0]);
    for (let dx = -1; dx <= 1; dx++) put(pd.x + dx, pd.y - 1, pal.pad[1]);
    if (!night && pd.flower) {
      put(pd.x - 1, pd.y - 2, [236, 130, 170]);
      put(pd.x + 1, pd.y - 2, [236, 130, 170]);
      put(pd.x, pd.y - 3, [244, 170, 200]);
      put(pd.x, pd.y - 2, FLOWER_CENTER);
    }
    if (night && i === 1) put(pd.x, pd.y - 2, [150, 255, 240]);
  });

  if (night) {
    // Plant glows pulse slowly.
    ctx.globalCompositeOperation = "lighter";
    for (const l of scene.lights) {
      const k = (still ? 0.8 : 0.6 + 0.4 * Math.sin(t * l.speed + l.phase)) * 0.3;
      for (const [dx, dy, f] of glowOffsets(l.r)) put(l.x + dx, l.y + dy, l.c, f * k);
    }
    ctx.globalCompositeOperation = "source-over";
    return;
  }

  // Day: wildflowers bend with a breeze that comes and goes, most at the top.
  const gust = still ? 0 : 0.6 + 0.4 * Math.sin(t * 0.35);
  for (const f of scene.flowers) {
    const sway = (d: number) => Math.round(Math.sin(t * 0.9 + f.phase + f.x * 0.05) * 1.4 * gust * (d / f.height) ** 1.5);
    for (let d = 0; d < f.height; d++) put(f.x + sway(d), f.base - d, DAY_STEM);
    const leafD = Math.round(f.height * 0.4);
    put(f.x + sway(leafD) + f.leaf, f.base - leafD, LEAF);
    const tx = f.x + sway(f.height);
    const ty = f.base - f.height;
    if (f.kind === "daisy") {
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) put(tx + dx, ty + dy, f.color);
      put(tx, ty, FLOWER_CENTER);
    } else if (f.kind === "lavender") {
      for (let k = 0; k < 4; k++) {
        put(tx, ty - k, k % 2 ? lighten(f.color, 0.25) : f.color);
        if (k % 2 === 0) {
          put(tx - 1, ty - k, f.color);
          put(tx + 1, ty - k, f.color);
        }
      }
    } else {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 0], [0, 0], [1, 0]]) put(tx + dx, ty + dy, f.color);
      put(tx, ty - 1, lighten(f.color, 0.3));
    }
  }

  // Day: a dragonfly hovers in place, then darts to its next spot: over the
  // pond, the lily pads and the flowers.
  const spots: [number, number][] = [
    [pond.cx - pond.rx * 0.5, pond.cy - pond.ry - 5],
    [p.pads[0].x + 2, p.pads[0].y - 6],
    [pond.cx + pond.rx * 0.6, pond.cy - pond.ry - 3],
    ...p.plantSpots.map((x): [number, number] => [x + 3, p.groundAt(x) - 22]),
    [pond.cx + pond.rx * 0.1, pond.cy - pond.ry - 9],
  ];
  const STEP = 3.2; // seconds per hover-and-dart
  const DART = 0.45;
  const k = still ? 0 : t / STEP;
  const i = Math.floor(k);
  const from = spots[(i * 5) % spots.length];
  const to = spots[((i + 1) * 5) % spots.length];
  const phaseT = (k - i) * STEP;
  const m = phaseT < STEP - DART ? 0 : (phaseT - (STEP - DART)) / DART;
  const ease = m * m * (3 - 2 * m);
  const hover = still ? 0 : Math.sin(t * 5) * 0.6;
  const dx = Math.round(from[0] + (to[0] - from[0]) * ease);
  const dy = Math.round(from[1] + (to[1] - from[1]) * ease + hover);
  const facing = to[0] >= from[0] ? 1 : -1;
  // Body: a long thin line with a darker head; wings flicker above it.
  for (let n = -4; n <= 1; n++) put(dx + n * facing, dy, n === 1 ? DRAGONFLY.head : DRAGONFLY.body);
  const up = still || Math.floor(t * 14) % 2 === 0;
  for (const wx of [-1, 0]) {
    put(dx + wx * facing, dy - 1, DRAGONFLY.wing, 0.9);
    put(dx + (wx - 1) * facing, dy + (up ? -2 : 1), DRAGONFLY.wing, 0.75);
  }
}

// ---------------------------------------------------------------------------

export default function PixelGarden({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let layout: Plan | null = null;
    const scenes: Partial<Record<Theme, ReturnType<typeof bake>>> = {};
    let raf = 0;
    let last = 0;
    let visible = true;
    const start = performance.now();

    const fit = () => {
      const box = canvas.getBoundingClientRect();
      const w = Math.ceil(box.width / PLANT_PX);
      const h = Math.ceil(box.height / PLANT_PX);
      if (!w || !h || (layout && layout.w === w && layout.h === h)) return;
      canvas.width = w;
      canvas.height = h;
      layout = plan(w, h);
      delete scenes.day;
      delete scenes.night;
    };

    const draw = (t: number) => {
      if (!layout) return;
      const theme: Theme = document.documentElement.dataset.theme === "day" ? "day" : "night";
      const scene = (scenes[theme] ??= bake(layout, theme));
      ctx.clearRect(0, 0, layout.w, layout.h);
      animate(ctx, layout, scene, theme, t, still);
    };
    const now = () => (performance.now() - start) / 1000;

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || time - last < FPS_INTERVAL) return;
      last = time;
      draw((time - start) / 1000);
    };

    const resize = new ResizeObserver(() => {
      fit();
      draw(now());
    });
    resize.observe(canvas);

    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    seen.observe(canvas);

    // Switch scenes straight away when the theme changes, even with motion off.
    const themeWatch = new MutationObserver(() => draw(now()));
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    if (!still) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      themeWatch.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={["pixel-garden", className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
