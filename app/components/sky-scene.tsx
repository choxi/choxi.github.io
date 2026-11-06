"use client";

import { useEffect, useRef } from "react";

// The scene at the top of each post, the counterpart of the pond scene at the
// bottom (pond-scene.tsx). It follows the theme:
//
// night: a pixel moon with a soft stepped halo, and stars that twinkle, a few
//        of the brighter ones flaring into little crosses.
// day:   a red pixel sun with a rosy halo and shimmering rays, low in a dusky
//        purple, rose and vanilla sky (the sky itself is a background fade in
//        post-page.css), with sunset-tinted clouds drifting slowly by.
//
// Drawn on a coarse pixel grid (PX screen pixels per art pixel) on a
// transparent canvas, over that fade. Layouts are seeded and rebuilt only
// when the size changes. It pauses off screen and holds still for people who
// prefer reduced motion.

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

const rgb = (c: RGB, a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;

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
// Layout
// ---------------------------------------------------------------------------

type Star = { x: number; y: number; phase: number; speed: number; big: boolean; color: RGB };
type Cloud = {
  x: number;
  y: number; // its flat base
  speed: number;
  pixels: { dx: number; dy: number; tone: 0 | 1 | 2 }[]; // tone: 0 lit top, 1 body, 2 shaded base
  w: number;
  alpha: number;
};

const STAR_COLORS: RGB[] = [
  [255, 255, 245],
  [215, 235, 255],
  [255, 240, 205],
];

function plan(w: number, h: number) {
  const rand = mulberry32(3);
  const narrow = w * PX < 700;
  // The moon and sun sit up and to the right.
  const body = { x: Math.round(w * (narrow ? 0.82 : 0.8)), y: Math.round(h * (narrow ? 0.48 : 0.42)), r: narrow ? 6 : 8 };

  const stars: Star[] = [];
  const count = Math.round((w * h) / 140);
  for (let n = 0; n < count; n++) {
    const x = Math.floor(rand() * w);
    // Thicker near the top, thinning out toward the fade.
    const y = Math.floor(rand() ** 1.6 * h * 0.85);
    if (Math.hypot(x - body.x, y - body.y) < body.r + 6) continue;
    stars.push({ x, y, phase: rand() * 6.28, speed: 0.6 + rand() * 1.8, big: rand() < 0.12, color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)] });
  }

  // Clouds (day): cumulus shapes, a tall middle puff with smaller ones
  // stepping down either side, all on one flat base. Each cloud's pixels are
  // worked out once here (so overlapping puffs don't double up when drawn
  // semi-transparent) and then just slid across.
  const clouds: Cloud[] = [];
  const cloudCount = narrow ? 3 : 5;
  for (let n = 0; n < cloudCount; n++) {
    const size = 5 + rand() * 3.5; // radius of the middle puff
    const radii = rand() < 0.5 ? [0.62, 1, 0.72] : [0.55, 0.88, 1, 0.66];
    const puffs: [number, number][] = []; // [centre x, radius]
    let x = 0;
    radii.forEach((k, i) => {
      const r = size * (k + (rand() - 0.5) * 0.12);
      if (i > 0) x += (r + puffs[i - 1][1]) * 0.62;
      puffs.push([x, r]);
    });
    const left = -puffs[0][1];
    const right = x + puffs[puffs.length - 1][1];
    const pixels = new Map<string, { dx: number; dy: number; tone: 0 | 1 | 2 }>();
    for (let px = Math.floor(left); px <= Math.ceil(right); px++)
      for (let py = -Math.ceil(size * 1.6); py <= 0; py++) {
        // Inside a puff (each sits with its centre a little above the base),
        // or in the flat band along the bottom between the outer puffs.
        const inPuff = puffs.some(([cx, r]) => Math.hypot(px - cx, py + r * 0.55) <= r);
        const inBase = py >= -2 && px >= left + 1 && px <= right - 1;
        if (!inPuff && !inBase) continue;
        // Shading: the bottom row shaded, the upper-left of each puff lit.
        const top = puffs.some(([cx, r]) => Math.hypot(px - cx + r * 0.25, py + r * 0.95) <= r * 0.55);
        pixels.set(`${px},${py}`, { dx: px - Math.floor(left), dy: py, tone: py === 0 ? 2 : top ? 0 : 1 });
      }
    clouds.push({
      x: (n / cloudCount) * (w + 60) + rand() * 20,
      // Below the top bar, above where the sky fades out.
      y: Math.round(h * (0.36 + rand() * 0.2)),
      speed: 0.8 + rand() * 1.2,
      pixels: [...pixels.values()],
      w: Math.ceil(right - left) + 1,
      alpha: 0.7 + rand() * 0.15,
    });
  }

  return { w, h, body, stars, clouds };
}

type Plan = ReturnType<typeof plan>;

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const MOON = { lit: [236, 240, 224] as RGB, shade: [200, 210, 198] as RGB, crater: [184, 194, 184] as RGB, glow: [190, 255, 220] as RGB };
// A low, red sun to suit the dusky sky: a peach core, a coral-red body, a
// deep red rim, and a rosy glow.
const SUN = {
  core: [255, 214, 176] as RGB,
  body: [246, 120, 90] as RGB,
  rim: [214, 70, 66] as RGB,
  ray: [244, 130, 110] as RGB,
  glow: [250, 130, 120] as RGB,
};
// Sunset clouds: lit peach on top, rose through the middle, lavender beneath.
const CLOUD = {
  top: [255, 228, 214] as RGB,
  body: [246, 200, 208] as RGB,
  shade: [222, 186, 214] as RGB,
};

function draw(ctx: CanvasRenderingContext2D, p: Plan, theme: Theme, t: number) {
  const put = (x: number, y: number, c: RGB, a = 1) => {
    ctx.fillStyle = rgb(c, a);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const { body } = p;
  const r = body.r;
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
    for (const [dx, dy, f] of glowOffsets(r * 4)) put(body.x + dx, body.y + dy, MOON.glow, f * 0.2 * breathe);

    // The moon: lit from the upper left, with a few craters.
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.hypot(dx, dy) > r - 0.3) continue;
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

  // Day: the sun's warm glow breathes.
  const breathe = 0.85 + 0.15 * Math.sin(t * 0.5);
  for (const [dx, dy, f] of glowOffsets(r * 4)) put(body.x + dx, body.y + dy, SUN.glow, f * 0.32 * breathe);

  // Rays: eight short spokes, alternating long and short, taking turns to
  // shimmer.
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * Math.PI * 2;
    const long = n % 2 === 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + n * 0.8);
    const len = (long ? 4 : 2) + Math.round(pulse * 1.5);
    for (let k = 0; k < len; k++) {
      const d = r + 2 + k;
      put(body.x + Math.cos(a) * d, body.y + Math.sin(a) * d, SUN.ray, 0.85 - (k / (len + 1)) * 0.6);
    }
  }

  // The sun: a bright core toward the upper left, a warm body and a coral rim.
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r - 0.3) continue;
      const c = d > r - 1.3 ? SUN.rim : Math.hypot(dx + r * 0.3, dy + r * 0.3) < r * 0.45 ? SUN.core : SUN.body;
      put(body.x + dx, body.y + dy, c);
    }

  // Clouds drift slowly right in front of the sun, wrapping round, a little
  // see-through.
  const tones = [CLOUD.top, CLOUD.body, CLOUD.shade];
  for (const c of p.clouds) {
    const span = p.w + c.w + 20;
    const x0 = Math.round((((c.x + t * c.speed) % span) + span) % span - c.w - 10);
    for (const px of c.pixels) put(x0 + px.dx, c.y + px.dy, tones[px.tone], c.alpha);
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
      if (layout) draw(ctx, layout, currentTheme(), still ? 0 : ((performance.now() - start) / 1000) * SPEED);
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
