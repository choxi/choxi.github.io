"use client";

import { useEffect, useRef } from "react";

// The sky at the top of each post, the counterpart of the pond scene at the
// bottom (pond-scene.tsx). It follows the theme:
//
// night: a pixel moon with a soft stepped halo, and stars that twinkle, a few
//        of the brighter ones flaring into little crosses.
// day:   a pixel sun with shimmering rays, and clouds drifting slowly by.
//
// Drawn on a coarse pixel grid (PX screen pixels per art pixel) on a
// transparent canvas, over a background fade set in post-page.css. Layouts
// are seeded and rebuilt only when the size changes. It pauses off screen and
// holds still for people who prefer reduced motion.

type RGB = [number, number, number];
type Theme = "day" | "night";

const PX = 4;
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

const rgb = (c: RGB, a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

type Star = { x: number; y: number; phase: number; speed: number; big: boolean; color: RGB };
type Cloud = { x: number; y: number; speed: number; puffs: [number, number, number][]; w: number };

const STAR_COLORS: RGB[] = [
  [255, 255, 245],
  [215, 235, 255],
  [255, 240, 205],
];

function plan(w: number, h: number) {
  const rand = mulberry32(3);
  const narrow = w * PX < 700;
  // The moon and sun sit up and to the right, clear of the reading column on
  // wide screens and above the title on narrow ones.
  const body = { x: Math.round(w * (narrow ? 0.82 : 0.8)), y: Math.round(h * (narrow ? 0.48 : 0.42)), r: narrow ? 6 : 8 };

  const stars: Star[] = [];
  const count = Math.round((w * h) / 140);
  for (let n = 0; n < count; n++) {
    const x = Math.floor(rand() * w);
    // Thicker near the top, thinning out toward the fade.
    const y = Math.floor(rand() ** 1.6 * h * 0.85);
    if (Math.hypot(x - body.x, y - body.y) < body.r + 6) continue;
    stars.push({
      x,
      y,
      phase: rand() * 6.28,
      speed: 0.6 + rand() * 1.8,
      big: rand() < 0.12,
      color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)],
    });
  }

  // Clouds: a few lumpy puffs with flat bottoms, drifting right and wrapping.
  const clouds: Cloud[] = [];
  const cloudCount = narrow ? 3 : 5;
  for (let n = 0; n < cloudCount; n++) {
    const size = 4 + rand() * 4;
    const puffs: [number, number, number][] = [];
    const lumps = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < lumps; k++) puffs.push([k * size * 0.9, -rand() * size * 0.5, size * (0.7 + rand() * 0.5)]);
    clouds.push({
      x: (n / cloudCount) * (w + 60) + rand() * 20,
      // Below the top bar, above where the sky fades out.
      y: Math.round(h * (0.33 + rand() * 0.2)),
      speed: 0.8 + rand() * 1.2,
      puffs,
      w: lumps * size * 0.9 + size * 2,
    });
  }

  return { w, h, body, stars, clouds };
}

type Plan = ReturnType<typeof plan>;

// Stepped glow footprints, so halos read as pixel art.
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
// Drawing
// ---------------------------------------------------------------------------

const MOON = { lit: [236, 240, 224] as RGB, shade: [200, 210, 198] as RGB, crater: [184, 194, 184] as RGB, glow: [190, 255, 220] as RGB };
const SUN = { core: [255, 236, 150] as RGB, body: [255, 208, 84] as RGB, rim: [250, 170, 60] as RGB, ray: [255, 200, 90] as RGB, glow: [255, 220, 130] as RGB };
const CLOUD = { top: [255, 255, 255] as RGB, body: [246, 249, 253] as RGB, shade: [222, 232, 244] as RGB };

function draw(ctx: CanvasRenderingContext2D, p: Plan, theme: Theme, t: number) {
  const put = (x: number, y: number, c: RGB, a = 1) => {
    ctx.fillStyle = rgb(c, a);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const { body } = p;
  ctx.clearRect(0, 0, p.w, p.h);

  if (theme === "night") {
    // Stars twinkle; the brighter ones flare into crosses.
    for (const s of p.stars) {
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
    const breathe = 0.85 + 0.15 * Math.sin(t * 0.6);
    for (const [dx, dy, f] of glowOffsets(body.r * 4)) put(body.x + dx, body.y + dy, MOON.glow, f * 0.2 * breathe);

    // The moon: lit from the upper left, with a few craters.
    const r = body.r;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r - 0.3) continue;
        const light = (-dx - dy) / (r * 1.4);
        put(body.x + dx, body.y + dy, light > -0.35 ? MOON.lit : MOON.shade);
      }
    const craters: [number, number, number][] = [
      [0.3, -0.2, 1],
      [-0.35, 0.3, 1],
      [0.15, 0.45, 0],
      [-0.1, -0.5, 0],
    ];
    for (const [cx, cy, big] of craters) {
      const x = body.x + Math.round(cx * r);
      const y = body.y + Math.round(cy * r);
      put(x, y, MOON.crater);
      if (big) {
        put(x + 1, y, MOON.crater);
        put(x, y + 1, MOON.crater);
      }
    }
    return;
  }

  // Day: the sun's warm glow.
  const breathe = 0.85 + 0.15 * Math.sin(t * 0.5);
  for (const [dx, dy, f] of glowOffsets(body.r * 4)) put(body.x + dx, body.y + dy, SUN.glow, f * 0.3 * breathe);

  // Rays: eight short spokes around the sun, alternating long and short and
  // taking turns to shimmer.
  const r = body.r;
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * Math.PI * 2;
    const long = n % 2 === 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + n * 0.8);
    const len = (long ? 4 : 2) + Math.round(pulse * 1.5);
    for (let k = 0; k < len; k++) {
      const d = r + 2 + k;
      put(body.x + Math.cos(a) * d, body.y + Math.sin(a) * d, SUN.ray, 0.9 - k / (len + 1) * 0.6);
    }
  }

  // The sun: a bright core, warm body and an orange rim.
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r - 0.3) continue;
      const c = d > r - 1.3 ? SUN.rim : Math.hypot(dx + r * 0.3, dy + r * 0.3) < r * 0.45 ? SUN.core : SUN.body;
      put(body.x + dx, body.y + dy, c);
    }

  // Clouds drift right, wrapping round. Each is a few overlapping puffs with
  // a flat bottom, white on top and faintly shaded underneath.
  for (const c of p.clouds) {
    const span = p.w + c.w + 20;
    const x0 = (((c.x + t * c.speed) % span) + span) % span - c.w - 10;
    const base = c.y;
    for (const [px, py, pr] of c.puffs) {
      const cx = x0 + pr + px;
      const cy = base + py;
      for (let dy = -Math.ceil(pr); dy <= 0; dy++)
        for (let dx = -Math.ceil(pr); dx <= Math.ceil(pr); dx++) {
          if (Math.hypot(dx, dy) > pr) continue;
          const y = cy + dy;
          if (y > base) continue;
          const col = y >= base - 1 ? CLOUD.shade : dy < -pr * 0.55 ? CLOUD.top : CLOUD.body;
          put(cx + dx, y, col, 0.95);
        }
    }
  }
}

// ---------------------------------------------------------------------------

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
      if (layout) draw(ctx, layout, currentTheme(), still ? 0 : (performance.now() - start) / 1000);
    };

    const fit = () => {
      const box = canvas.getBoundingClientRect();
      const w = Math.ceil(box.width / PX);
      const h = Math.ceil(box.height / PX);
      if (!w || !h || (layout && layout.w === w && layout.h === h)) return;
      canvas.width = w;
      canvas.height = h;
      layout = plan(w, h);
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
