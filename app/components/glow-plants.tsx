"use client";

import { useEffect, useRef } from "react";

// A few clumps of bioluminescent plants growing up from the bottom of a post:
// glowing mushrooms, bulb stalks and ferns like the ones in the landing scene
// (moon-falls.tsx), with tufts of grass at their feet. They sit near the left
// and right edges, away from the text, and their glow pulses slowly.
//
// Drawn on a coarse pixel grid (PX screen pixels per art pixel) and scaled up
// with crisp pixels. The layout is seeded, so the plants are the same on every
// visit; it's rebuilt only when the width changes. They pause off screen and
// hold still for people who prefer reduced motion.

type RGB = [number, number, number];

export const PLANT_PX = 4;
const FPS_INTERVAL = 1000 / 12;
const GLOW_COLORS: RGB[] = [
  [90, 245, 230], // cyan
  [255, 120, 215], // pink
  [180, 150, 255], // violet
  [150, 255, 170], // mint
];
// Bright enough to read on the plain night background, dark enough on the
// day theme's paper.
const STEM: RGB = [52, 122, 112];
const GRASS: RGB[] = [
  [44, 104, 96],
  [62, 136, 120],
];

type Pixel = { x: number; y: number; c: RGB };
type Light = { x: number; y: number; r: number; c: RGB; phase: number; speed: number };

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

// Lay out the plants for a canvas w art-pixels wide; the ground is the
// bottom row, y = h - 1.
function grow(w: number, h: number) {
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
      for (let d = 0; d < height; d++) px(bx + lean * d, ground - d, GRASS[(n + d) % 2]);
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

  // Near the edges, clear of the text: two clumps a side on wide screens,
  // one a side on narrow ones.
  const anchors = w * PLANT_PX >= 720 ? [0.05, 0.15, 0.86, 0.95] : [0.12, 0.86];
  for (const a of anchors) clump(Math.round(a * w));

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

export default function GlowPlants({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let garden: ReturnType<typeof grow> = { pixels: [], lights: [] };
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
      garden = grow(w, h);
    };

    const draw = (t: number) => {
      // Glows add light on the dark night page; on the pale day page they're
      // a soft tint instead.
      const night = document.documentElement.dataset.theme !== "day";
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = night ? "lighter" : "source-over";
      for (const l of garden.lights) {
        const pulse = reduceMotion ? 0.8 : 0.6 + 0.4 * Math.sin(t * l.speed + l.phase);
        const k = pulse * (night ? 0.32 : 0.2);
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
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < FPS_INTERVAL) return;
      last = now;
      draw((now - start) / 1000);
    };

    const resize = new ResizeObserver(() => {
      fit();
      draw((performance.now() - start) / 1000);
    });
    resize.observe(canvas);

    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    seen.observe(canvas);

    // Redraw straight away when the theme changes, even with motion off.
    const themeWatch = new MutationObserver(() => draw((performance.now() - start) / 1000));
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    if (!reduceMotion) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      themeWatch.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={["glow-plants", className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
