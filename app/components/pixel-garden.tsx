"use client";

import { useEffect, useRef } from "react";

// A little pixel garden growing up from the bottom of a post, near the left
// and right edges and clear of the text. It follows the theme:
//
// night: bioluminescent plants like the ones in the landing scene
//        (moon-falls.tsx): glowing mushrooms, bulb stalks and ferns whose
//        glow pulses slowly. Fireflies drift over them (see posts/layout.tsx).
// day:   wildflowers (daisies, lavender spikes and tulips) swaying in a
//        breeze, with a few butterflies fluttering around them.
//
// Drawn on a coarse pixel grid (PLANT_PX screen pixels per art pixel) and
// scaled up with crisp pixels. Layouts are seeded, so the garden is the same
// on every visit; they're rebuilt only when the width changes. It pauses off
// screen and holds still for people who prefer reduced motion.

type RGB = [number, number, number];

export const PLANT_PX = 4;
const FPS_INTERVAL = 1000 / 12;

// Clumps sit near the edges: two a side on wide screens, one on narrow ones.
const anchorsFor = (w: number) => (w * PLANT_PX >= 720 ? [0.05, 0.15, 0.86, 0.95] : [0.12, 0.86]);

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lighten = (c: RGB, k = 0.6): RGB => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];

type Pixel = { x: number; y: number; c: RGB };

// ---------------------------------------------------------------------------
// Night: glowing plants
// ---------------------------------------------------------------------------

const GLOW_COLORS: RGB[] = [
  [90, 245, 230], // cyan
  [255, 120, 215], // pink
  [180, 150, 255], // violet
  [150, 255, 170], // mint
];
const STEM: RGB = [52, 122, 112];
const NIGHT_GRASS: RGB[] = [
  [44, 104, 96],
  [62, 136, 120],
];

type Light = { x: number; y: number; r: number; c: RGB; phase: number; speed: number };

function growNight(w: number, h: number) {
  const rand = mulberry32(11);
  const pixels: Pixel[] = [];
  const lights: Light[] = [];
  const px = (x: number, y: number, c: RGB) => pixels.push({ x: Math.round(x), y: Math.round(y), c });
  const light = (x: number, y: number, r: number, c: RGB) =>
    lights.push({ x, y, r, c, phase: rand() * 6.28, speed: 0.5 + rand() * 0.9 });
  const ground = h - 1;

  // A domed cap on a stem, with a pale highlight across its top.
  const mushroom = (x: number, s: number, color: RGB) => {
    for (let d = 0; d < s + 1; d++) {
      px(x, ground - d, STEM);
      if (s > 2) px(x + 1, ground - d, STEM);
    }
    const capY = ground - s - 1;
    for (let row = 0; row < 3; row++) {
      const half = s - row;
      for (let dx = -half; dx <= half + (s > 2 ? 1 : 0); dx++) px(x + dx, capY - row, row === 2 ? lighten(color) : color);
    }
    light(x, capY - 1, 7 + s * 3, color);
  };

  // A thin, leaning stem ending in a round bulb with a bright core.
  const stalk = (x: number, height: number, color: RGB) => {
    const lean = (rand() - 0.5) * 0.5;
    for (let d = 0; d < height; d++) px(x + lean * d, ground - d, STEM);
    const tx = Math.round(x + lean * height);
    const ty = ground - height;
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) px(tx + dx, ty + dy, color);
    px(tx, ty, lighten(color));
    light(tx, ty, 7 + Math.round(height * 0.3), color);
  };

  // A spray of fronds with glowing tips and beads along them.
  const fern = (x: number, color: RGB) => {
    for (let b = -4; b <= 4; b++) {
      const height = 3 + Math.floor(rand() * 4) - Math.abs(b) / 2;
      for (let d = 0; d < height; d++) {
        const c = d >= height - 1 ? lighten(color) : d >= height - 2 || rand() > 0.75 ? color : STEM;
        px(x + b + (b * d) / 5, ground - d, c);
      }
    }
    light(x, ground - 4, 9, color);
  };

  const grass = (x: number) => {
    const blades = 2 + Math.floor(rand() * 3);
    for (let n = 0; n < blades; n++) {
      const bx = x + n * 2 - blades;
      const height = 2 + Math.floor(rand() * 4);
      const lean = (rand() - 0.5) * 0.8;
      for (let d = 0; d < height; d++) px(bx + lean * d, ground - d, NIGHT_GRASS[(n + d) % 2]);
    }
  };

  // One clump: a main plant with a smaller companion and grass at its feet.
  const clump = (x: number) => {
    const color = GLOW_COLORS[Math.floor(rand() * GLOW_COLORS.length)];
    const pick = rand();
    grass(x - 7);
    if (pick < 0.4) {
      mushroom(x, 3, color);
      mushroom(x + 6, 1 + Math.floor(rand() * 2), color);
    } else if (pick < 0.75) {
      stalk(x, 11 + Math.floor(rand() * 7), color);
      stalk(x + 3, 6 + Math.floor(rand() * 4), color);
      if (rand() < 0.5) stalk(x - 3, 7 + Math.floor(rand() * 3), color);
    } else {
      fern(x, color);
    }
    grass(x + 9);
  };

  for (const a of anchorsFor(w)) clump(Math.round(a * w));
  return { pixels, lights };
}

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

function drawNight(ctx: CanvasRenderingContext2D, garden: ReturnType<typeof growNight>, t: number, still: boolean) {
  ctx.globalCompositeOperation = "lighter";
  for (const l of garden.lights) {
    const k = (still ? 0.8 : 0.6 + 0.4 * Math.sin(t * l.speed + l.phase)) * 0.32;
    for (const [dx, dy, f] of glowOffsets(l.r)) {
      ctx.fillStyle = `rgb(${l.c[0]} ${l.c[1]} ${l.c[2]} / ${f * k})`;
      ctx.fillRect(Math.round(l.x) + dx, Math.round(l.y) + dy, 1, 1);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  for (const p of garden.pixels) {
    ctx.fillStyle = `rgb(${p.c[0]} ${p.c[1]} ${p.c[2]})`;
    ctx.fillRect(p.x, p.y, 1, 1);
  }
}

// ---------------------------------------------------------------------------
// Day: wildflowers and butterflies
// ---------------------------------------------------------------------------

// Saturated enough to read on the pale day paper.
const PETALS: RGB[] = [
  [150, 118, 222], // lavender
  [226, 110, 160], // pink
  [236, 160, 52], // marigold
  [228, 104, 84], // coral
];
const FLOWER_CENTER: RGB = [246, 196, 70];
const DAY_STEM: RGB = [74, 138, 92];
const LEAF: RGB = [96, 160, 104];
const DAY_GRASS: RGB[] = [
  [86, 150, 98],
  [64, 124, 82],
];
const BUTTERFLY_COLORS: RGB[] = [
  [124, 92, 214], // violet
  [232, 136, 48], // orange
  [36, 146, 136], // teal
];
const BUTTERFLY_BODY: RGB = [52, 48, 60];

type Flower = {
  x: number;
  height: number;
  kind: "daisy" | "lavender" | "tulip";
  color: RGB;
  leaf: -1 | 1;
  phase: number;
};
type Butterfly = { hx: number; hy: number; color: RGB; phase: number; speed: number; range: number };

function growDay(w: number, h: number) {
  const rand = mulberry32(23);
  const flowers: Flower[] = [];
  const grass: Pixel[] = [];
  const butterflies: Butterfly[] = [];
  const ground = h - 1;

  const tuft = (x: number) => {
    const blades = 2 + Math.floor(rand() * 3);
    for (let n = 0; n < blades; n++) {
      const bx = x + n * 2 - blades;
      const height = 2 + Math.floor(rand() * 3);
      const lean = (rand() - 0.5) * 0.8;
      for (let d = 0; d < height; d++) grass.push({ x: Math.round(bx + lean * d), y: ground - d, c: DAY_GRASS[(n + d) % 2] });
    }
  };

  const anchors = anchorsFor(w);
  anchors.forEach((a, i) => {
    const x = Math.round(a * w);
    const color = PETALS[Math.floor(rand() * PETALS.length)];
    tuft(x - 8);
    // A small patch: three or four flowers of mixed heights.
    const count = 3 + Math.floor(rand() * 2);
    for (let n = 0; n < count; n++) {
      const pick = rand();
      flowers.push({
        x: x - 4 + n * 3 + Math.floor(rand() * 2),
        height: 5 + Math.floor(rand() * 8),
        kind: pick < 0.45 ? "daisy" : pick < 0.75 ? "lavender" : "tulip",
        color: n === 1 ? PETALS[Math.floor(rand() * PETALS.length)] : color,
        leaf: rand() < 0.5 ? -1 : 1,
        phase: rand() * 6.28,
      });
    }
    tuft(x + 10);
    // A butterfly for every other patch.
    if (i % 2 === 0 || anchors.length === 2) {
      butterflies.push({
        hx: x + 4,
        hy: ground - 18,
        color: BUTTERFLY_COLORS[butterflies.length % BUTTERFLY_COLORS.length],
        phase: rand() * 6.28,
        speed: 0.7 + rand() * 0.4,
        range: 10 + rand() * 6,
      });
    }
  });

  return { flowers, grass, butterflies };
}

function drawDay(ctx: CanvasRenderingContext2D, garden: ReturnType<typeof growDay>, w: number, h: number, t: number, still: boolean) {
  const ground = h - 1;
  const put = (x: number, y: number, c: RGB) => {
    ctx.fillStyle = `rgb(${c[0]} ${c[1]} ${c[2]})`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };

  for (const g of garden.grass) put(g.x, g.y, g.c);

  // A breeze that comes and goes; each flower bends with it from the ground
  // up, most at the top.
  const gust = still ? 0 : 0.6 + 0.4 * Math.sin(t * 0.35);
  for (const f of garden.flowers) {
    const sway = (d: number) => Math.round(Math.sin(t * 0.9 + f.phase + f.x * 0.05) * 1.4 * gust * (d / f.height) ** 1.5);
    for (let d = 0; d < f.height; d++) put(f.x + sway(d), ground - d, DAY_STEM);
    const leafD = Math.round(f.height * 0.4);
    put(f.x + sway(leafD) + f.leaf, ground - leafD, LEAF);

    const tx = f.x + sway(f.height);
    const ty = ground - f.height;
    if (f.kind === "daisy") {
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) put(tx + dx, ty + dy, f.color);
      put(tx, ty, FLOWER_CENTER);
    } else if (f.kind === "lavender") {
      // A spike of little florets up the top of the stem.
      for (let k = 0; k < 4; k++) {
        put(tx, ty - k, k % 2 ? lighten(f.color, 0.25) : f.color);
        if (k % 2 === 0) {
          put(tx - 1, ty - k, f.color);
          put(tx + 1, ty - k, f.color);
        }
      }
    } else {
      // A tulip cup.
      put(tx - 1, ty - 1, f.color);
      put(tx + 1, ty - 1, f.color);
      put(tx - 1, ty, f.color);
      put(tx, ty, f.color);
      put(tx + 1, ty, f.color);
      put(tx, ty - 1, lighten(f.color, 0.3));
    }
  }

  // Butterflies loop around their patch, wings flapping.
  for (const b of garden.butterflies) {
    const s = t * b.speed + b.phase;
    const x = still ? b.hx : b.hx + Math.sin(s * 0.6) * b.range + Math.sin(s * 1.7) * 3;
    const y = still ? b.hy : b.hy + Math.sin(s * 0.9 + 1.3) * 6 + Math.sin(s * 3.1) * 1.5;
    if (x < 2 || x > w - 3) continue;
    const open = still || Math.floor(t * 7 + b.phase) % 2 === 0;
    const tip = lighten(b.color, 0.35);
    if (open) {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]) put(x + dx, y + dy, b.color);
      for (const [dx, dy] of [[-2, -1], [2, -1], [-2, 0], [2, 0]]) put(x + dx, y + dy, tip);
    } else {
      for (const [dx, dy] of [[-1, -2], [1, -2], [-1, -1], [1, -1]]) put(x + dx, y + dy, b.color);
    }
    for (let dy = -1; dy <= 1; dy++) put(x, y + dy, BUTTERFLY_BODY);
  }
}

// ---------------------------------------------------------------------------

export default function PixelGarden({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let night = growNight(0, 0);
    let day = growDay(0, 0);
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    const start = performance.now();

    const fit = () => {
      const box = canvas.getBoundingClientRect();
      const nw = Math.ceil(box.width / PLANT_PX);
      const nh = Math.ceil(box.height / PLANT_PX);
      if (!nw || !nh || (nw === w && nh === h)) return;
      w = canvas.width = nw;
      h = canvas.height = nh;
      night = growNight(w, h);
      day = growDay(w, h);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      if (document.documentElement.dataset.theme === "day") drawDay(ctx, day, w, h, t, still);
      else drawNight(ctx, night, t, still);
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

    // Switch gardens straight away when the theme changes, even with motion off.
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
