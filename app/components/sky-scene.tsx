"use client";

import { useEffect, useRef } from "react";

// The scene at the top of each post, the counterpart of the pond scene at the
// bottom (pond-scene.tsx). It follows the theme:
//
// night: a pixel moon with a soft stepped halo, and stars that twinkle, a few
//        of the brighter ones flaring into little crosses.
// day:   a forest canopy overhead, in the footer painting's greens: leaves
//        hanging from the top edge, deeper at the sides with a branch reaching
//        in from each, their lower fringe swaying gently. Below it, sunlight
//        comes through: faint shafts, flecks of dappled light that drift and
//        brighten and fade, and a few motes of pollen floating in it.
//
// Drawn on a coarse pixel grid (PX screen pixels per art pixel) on a
// transparent canvas, over a background fade set in post-page.css. Layouts
// are seeded and rebuilt only when the size changes; the canopy's still
// parts are drawn once into offscreen canvases. It pauses off screen and
// holds still for people who prefer reduced motion.

type RGB = [number, number, number];
type Theme = "day" | "night";

const PX = 4;
const FPS_INTERVAL = 1000 / 12;
// Everything up here runs at this fraction of its natural pace, so it stays
// gentle at the top of the page.
const SPEED = 0.2;

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

const rgb = (c: RGB, a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;

// Stepped glow footprints, so halos and light read as pixel art.
const glowCache = new Map<number, [number, number, number][]>();
function glowOffsets(r: number) {
  let list = glowCache.get(r);
  if (list) return list;
  list = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d < 1) list.push([dx, dy, Math.ceil((1 - d) ** 2.2 * 8) / 8]);
    }
  glowCache.set(r, list);
  return list;
}

// ---------------------------------------------------------------------------
// Night: moon and stars
// ---------------------------------------------------------------------------

type Star = { x: number; y: number; phase: number; speed: number; big: boolean; color: RGB };

const STAR_COLORS: RGB[] = [
  [255, 255, 245],
  [215, 235, 255],
  [255, 240, 205],
];
const MOON = { lit: [236, 240, 224] as RGB, shade: [200, 210, 198] as RGB, crater: [184, 194, 184] as RGB, glow: [190, 255, 220] as RGB };

function planNight(w: number, h: number) {
  const rand = mulberry32(3);
  const narrow = w * PX < 700;
  // The moon sits up and to the right.
  const moon = { x: Math.round(w * (narrow ? 0.82 : 0.8)), y: Math.round(h * (narrow ? 0.48 : 0.42)), r: narrow ? 6 : 8 };
  const stars: Star[] = [];
  const count = Math.round((w * h) / 140);
  for (let n = 0; n < count; n++) {
    const x = Math.floor(rand() * w);
    // Thicker near the top, thinning out toward the fade.
    const y = Math.floor(rand() ** 1.6 * h * 0.85);
    if (Math.hypot(x - moon.x, y - moon.y) < moon.r + 6) continue;
    stars.push({ x, y, phase: rand() * 6.28, speed: 0.6 + rand() * 1.8, big: rand() < 0.12, color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)] });
  }
  return { moon, stars };
}

function drawNight(ctx: CanvasRenderingContext2D, night: ReturnType<typeof planNight>, t: number) {
  const put = (x: number, y: number, c: RGB, a = 1) => {
    ctx.fillStyle = rgb(c, a);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };

  // Stars twinkle; the brighter ones flare into crosses.
  for (const s of night.stars) {
    const k = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
    if (k < 0.2) continue;
    put(s.x, s.y, s.color, 0.35 + k * 0.65);
    if (s.big && k > 0.75) {
      const a = (k - 0.75) * 2.4;
      put(s.x - 1, s.y, s.color, a);
      put(s.x + 1, s.y, s.color, a);
      put(s.x, s.y - 1, s.color, a);
      put(s.x, s.y + 1, s.color, a);
    }
  }

  // The moon's halo breathes.
  const { moon } = night;
  const breathe = 0.85 + 0.15 * Math.sin(t * 0.6);
  for (const [dx, dy, f] of glowOffsets(moon.r * 4)) put(moon.x + dx, moon.y + dy, MOON.glow, f * 0.2 * breathe);

  // The moon: lit from the upper left, with a few craters.
  const r = moon.r;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (Math.hypot(dx, dy) > r - 0.3) continue;
      const light = (-dx - dy) / (r * 1.4);
      put(moon.x + dx, moon.y + dy, light > -0.35 ? MOON.lit : MOON.shade);
    }
  const craters: [number, number, number][] = [
    [0.3, -0.2, 1],
    [-0.35, 0.3, 1],
    [0.15, 0.45, 0],
    [-0.1, -0.5, 0],
  ];
  for (const [cx, cy, big] of craters) {
    const x = moon.x + Math.round(cx * r);
    const y = moon.y + Math.round(cy * r);
    put(x, y, MOON.crater);
    if (big) {
      put(x + 1, y, MOON.crater);
      put(x, y + 1, MOON.crater);
    }
  }
}

// ---------------------------------------------------------------------------
// Day: canopy and dappled light
// ---------------------------------------------------------------------------

// The footer painting's greens, darkest to lightest, and its bark.
const LEAF: RGB[] = [
  [30, 72, 50],
  [50, 104, 62],
  [84, 142, 76],
  [134, 182, 94],
];
const BARK: RGB = [86, 66, 50];
const BARK_DARK: RGB = [62, 46, 36];
// Warm and golden enough to show against the pale day page.
const SUNLIGHT: RGB = [255, 222, 140];
const POLLEN: RGB = [255, 236, 170];

type Fleck = { x: number; y: number; r: number; phase: number; speed: number; drift: number };
type Shaft = { x: number; width: number; phase: number };
type Mote = { x: number; y: number; phase: number; speed: number };

function planDay(w: number, h: number) {
  const rand = mulberry32(17);
  const edge = Math.max(10, w * 0.22); // how far in from each side the canopy runs deep

  // How far down the leaves hang at each column: a shallow, uneven fringe
  // across the middle, much deeper toward the sides.
  const depth = Array.from({ length: w }, (_, x) => {
    const side = Math.max(0, 1 - Math.min(x, w - 1 - x) / edge);
    return 6 + 2 * Math.sin(x * 0.13) + 1.5 * Math.sin(x * 0.047 + 1) + side ** 1.6 * h * 0.5;
  });
  const depthAt = (x: number) => depth[Math.max(0, Math.min(w - 1, Math.round(x)))];

  // Leaves are drawn as overlapping rounded clumps, each lit from above
  // through the canopy and darker underneath. The upper ones are still; the
  // lower ones (the fringe and the dangling tips) sway, split between two
  // layers that move out of step.
  const layers = [0, 1, 2].map(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  });
  const [still, swayA, swayB] = layers.map((c) => c.getContext("2d")!);
  const paint = (ctx: CanvasRenderingContext2D, x: number, y: number, c: RGB) => {
    ctx.fillStyle = rgb(c);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };

  type Clump = { x: number; y: number; r: number; layer: number };
  const clumps: Clump[] = [];
  // Packed densely enough that the canopy reads as solid foliage: clumps are
  // stacked down each column in proportion to how deep the leaves hang there.
  for (let x = -4; x < w + 4; x += 1.5) {
    const d = depthAt(x);
    const count = Math.max(2, Math.ceil(d / 2.4));
    for (let k = 0; k < count; k++) {
      const r = 2.8 + rand() * 2.6;
      const y = -2 + ((k + rand()) / count) * Math.max(1, d - r * 0.5);
      clumps.push({ x: x + (rand() - 0.5) * 2, y, r, layer: y > d - 5 ? (rand() < 0.5 ? 1 : 2) : 0 });
    }
  }
  // A few clumps dangling below the fringe, like vine tips.
  for (let n = 0; n < Math.max(4, w / 30); n++) {
    const x = rand() * w;
    const d = depthAt(x);
    const len = 3 + Math.floor(rand() * 6);
    for (let k = 0; k < len; k += 2) clumps.push({ x: x + (rand() - 0.5), y: d + k, r: 1.4 + rand() * 0.8, layer: 1 + (n % 2) });
  }

  // A leafy bough reaching in from each side: a branch behind the leaves,
  // with clumps of leaves growing along its outer half.
  const branch = (fromLeft: boolean) => {
    const x0 = fromLeft ? -2 : w + 1;
    const y0 = Math.round(depthAt(fromLeft ? 0 : w - 1) * 0.42);
    const len = Math.round(edge * 0.9);
    for (let k = 0; k < len; k++) {
      const x = fromLeft ? x0 + k : x0 - k;
      const y = y0 + Math.round(k * 0.28 + Math.sin(k * 0.3) * 0.8);
      const thick = k < len * 0.6 ? 2 : 1;
      for (let j = 0; j < thick; j++) paint(still, x, y + j, j === thick - 1 ? BARK_DARK : BARK);
      if (k > len * 0.35 && k % 3 === 0) {
        const r = 1.8 + rand() * 1.8;
        clumps.push({ x: x + (rand() - 0.5) * 2, y: y - r * 0.4 + rand() * 2, r, layer: 1 + (k % 2) });
      }
    }
  };
  branch(true);
  branch(false);

  // Draw the clumps top to bottom, so the lower ones overlap the upper.
  clumps.sort((a, b) => a.y - b.y);
  const ctxFor = [still, swayA, swayB];
  for (const c of clumps) {
    const ctx = ctxFor[c.layer];
    const R = Math.ceil(c.r);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const dist = Math.hypot(dx, dy) / c.r;
        if (dist > 1) continue;
        const x = Math.round(c.x + dx);
        const y = Math.round(c.y + dy);
        if (y < 0 || y >= h) continue;
        const light = (-dy * 0.9 - dx * 0.3) / c.r + (hash(x, y, 4) - 0.5) * 0.35;
        let tone = light > 0.7 ? 3 : light > 0.15 ? 2 : light > -0.4 ? 1 : 0;
        if (dist > 0.8 && dy > 0) tone = 0;
        paint(ctx, x, y, LEAF[tone]);
      }
  }

  // Sunlight under the canopy: a few shafts through the gaps, flecks of
  // dappled light, and pollen drifting in it.
  const below = (x: number) => depthAt(x) + 3;
  const shafts: Shaft[] = [0.3, 0.52, 0.71].map((k) => ({ x: Math.round(w * k + (rand() - 0.5) * 20), width: 5 + Math.floor(rand() * 4), phase: rand() * 6.28 }));
  const flecks: Fleck[] = [];
  for (let n = 0; n < Math.max(8, Math.round(w / 28)); n++) {
    const x = Math.round(w * (0.08 + rand() * 0.84));
    const lo = below(x);
    const y = Math.round(lo + rand() * Math.max(2, h * 0.75 - lo));
    flecks.push({ x, y, r: 1.5 + rand() * 2.2, phase: rand() * 6.28, speed: 0.7 + rand() * 0.9, drift: 1 + rand() * 2 });
  }
  const motes: Mote[] = Array.from({ length: Math.max(6, Math.round(w / 45)) }, () => ({
    x: rand() * w,
    y: Math.round(h * (0.25 + rand() * 0.5)),
    phase: rand() * 6.28,
    speed: 0.5 + rand() * 0.6,
  }));

  return { layers, depthAt, shafts, flecks, motes };
}

function drawDay(ctx: CanvasRenderingContext2D, day: ReturnType<typeof planDay>, w: number, h: number, t: number) {
  const put = (x: number, y: number, c: RGB, a: number) => {
    ctx.fillStyle = rgb(c, a);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };

  // Shafts of light slanting down from gaps in the canopy, very faint and
  // fading as they go, brightening and dimming slowly.
  for (const s of day.shafts) {
    const shimmer = 0.7 + 0.3 * Math.sin(t * 0.8 + s.phase);
    const top = Math.round(day.depthAt(s.x));
    for (let y = top; y < h * 0.95; y++) {
      const fade = 1 - (y - top) / (h * 0.95 - top);
      const x0 = s.x + Math.round((y - top) * 0.35);
      for (let k = 0; k < s.width; k++) {
        const edgeSoft = k === 0 || k === s.width - 1 ? 0.5 : 1;
        put(x0 + k, y, SUNLIGHT, 0.13 * fade * shimmer * edgeSoft);
      }
    }
  }

  // Dappled light: soft flecks that drift a little and brighten and fade as
  // the leaves above them move.
  for (const f of day.flecks) {
    const k = 0.5 + 0.5 * Math.sin(t * f.speed + f.phase);
    if (k < 0.15) continue;
    const x = f.x + Math.sin(t * 0.5 + f.phase) * f.drift;
    for (const [dx, dy, s] of glowOffsets(Math.round(f.r * 1.6))) {
      if (Math.abs(dy) > f.r) continue; // flatter than tall, like light on a surface
      put(x + dx, f.y + dy, SUNLIGHT, s * 0.42 * k);
    }
  }

  // The canopy: still upper leaves, and the fringe swaying in two layers.
  const sway = (phase: number) => Math.round(Math.sin(t * 2.5 + phase) * 0.9);
  ctx.drawImage(day.layers[0], 0, 0);
  ctx.drawImage(day.layers[1], sway(0), 0);
  ctx.drawImage(day.layers[2], sway(2.1), 0);

  // Pollen drifts slowly across, glinting as it turns.
  for (const m of day.motes) {
    const x = (((m.x + t * 2 + Math.sin(t * m.speed + m.phase) * 4) % (w + 10)) + w + 10) % (w + 10) - 5;
    const y = m.y + Math.sin(t * m.speed * 1.3 + m.phase) * 3;
    const glint = 0.45 + 0.4 * Math.sin(t * 1.7 + m.phase * 3);
    put(x, y, POLLEN, glint);
  }
}

// ---------------------------------------------------------------------------

type Plan = { w: number; h: number; night: ReturnType<typeof planNight>; day: ReturnType<typeof planDay> };

const currentTheme = (): Theme => (document.documentElement.dataset.theme === "day" ? "day" : "night");

export default function SkyScene({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let layout: Plan | null = null;
    let raf = 0;
    let last = 0;
    let visible = true;

    const render = () => {
      if (!layout) return;
      const t = still ? 0 : ((performance.now() - start) / 1000) * SPEED;
      ctx.clearRect(0, 0, layout.w, layout.h);
      if (currentTheme() === "day") drawDay(ctx, layout.day, layout.w, layout.h, t);
      else drawNight(ctx, layout.night, t);
    };

    const fit = () => {
      const box = canvas.getBoundingClientRect();
      const w = Math.ceil(box.width / PX);
      const h = Math.ceil(box.height / PX);
      if (!w || !h || (layout && layout.w === w && layout.h === h)) return;
      canvas.width = w;
      canvas.height = h;
      layout = { w, h, night: planNight(w, h), day: planDay(w, h) };
    };

    const resize = new ResizeObserver(() => {
      fit();
      render();
    });
    resize.observe(canvas);

    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    seen.observe(canvas);

    const themeWatch = new MutationObserver(render);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < FPS_INTERVAL) return;
      last = now;
      render();
    };
    if (!still) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      themeWatch.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={["sky-scene", className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
