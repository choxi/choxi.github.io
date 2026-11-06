"use client";

import { useEffect, useRef } from "react";

// The scene at the bottom of each post: a painted pond with a waterfall,
// rocks and plants (public/assets/pond-day.webp and pond-night.webp, about
// 2000x295 with transparent skies), brought to life on a canvas.
//
// Each painting is sampled down to a 500x73 grid, about the size of its art
// pixels, and scaled back up with crisp pixels. On load it's scanned for its
// water, waterfall and (at night) glowing plants; each frame copies that base
// and animates them:
//   - the pond's surface shimmers and catches glints,
//   - the waterfall's painted pixels pour downward, with foam at its foot,
//   - pixel fish (koi by day, glowing fish at night) swim back and forth,
//     slipping behind the rocks,
//   - at night the mushrooms, coral and painted fireflies pulse with a soft
//     stepped glow; by day a dragonfly hovers and darts over the pond.
// Fireflies drift over the night scene from posts/layout.tsx.
//
// The scene follows the theme on <html data-theme>. It pauses off screen and
// holds still for people who prefer reduced motion.

type RGB = [number, number, number];
type Theme = "day" | "night";

const W = 500;
const H = 73;
const FPS_INTERVAL = 1000 / 15;
const SRC: Record<Theme, string> = { day: "/assets/pond-day.webp", night: "/assets/pond-night.webp" };

// Where things are in the paintings, in grid pixels. The two share a layout.
const POND = { x0: 100, x1: 420, top: 52 }; // open water lies inside this, below `top`
const FALLS = { x0: 326, x1: 388, top: 38, bottom: 63 };
const FOAM = { x0: 330, x1: 392, top: 57, bottom: 64 };

const hash = (x: number, y: number, z = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------------------------------------------------------------------------
// Fish: pixel sprites drawn over the water (the paintings have none of their
// own). Facing right; mirrored when swimming left. Each letter is a colour
// role; the tail has two frames so it flicks.
//   f fin   b body   s spot   h head   e eye   w belly   t tail
// ---------------------------------------------------------------------------

const FISH_SHAPE = [
  "....ff....",
  "..bbbbbhh.",
  ".bbssbbhhe",
  "..wwwwwhh.",
];
// Tail pixels, [column, row] in the shape's grid: spread, then closed.
const TAIL_FRAMES: [number, number][][] = [
  [[0, 2], [-1, 1], [-2, 1], [-1, 3], [-2, 3]],
  [[0, 2], [-1, 2], [-2, 1], [-2, 3]],
];
const FISH_ANCHOR = { col: 5, row: 2 }; // the shape's centre

type FishLook = Record<"f" | "b" | "s" | "h" | "e" | "w" | "t", RGB>;
const FISH_LOOKS: Record<Theme, FishLook[]> = {
  day: [
    // Orange koi with white patches.
    { f: [222, 96, 40], b: [244, 120, 46], s: [250, 244, 232], h: [248, 140, 64], e: [40, 28, 28], w: [252, 236, 214], t: [226, 102, 42] },
    // White koi with orange patches.
    { f: [236, 228, 216], b: [250, 246, 238], s: [242, 126, 50], h: [246, 140, 70], e: [40, 28, 28], w: [255, 252, 246], t: [232, 224, 212] },
    // Golden koi.
    { f: [214, 156, 40], b: [242, 190, 60], s: [250, 222, 120], h: [246, 204, 90], e: [40, 28, 28], w: [252, 236, 186], t: [220, 164, 46] },
  ],
  night: [
    // Glowing fish, like the landing scene's.
    { f: [90, 210, 230], b: [120, 240, 255], s: [210, 255, 255], h: [170, 250, 255], e: [12, 40, 60], w: [190, 255, 255], t: [90, 220, 240] },
    { f: [150, 120, 230], b: [180, 160, 255], s: [235, 225, 255], h: [210, 195, 255], e: [20, 20, 50], w: [225, 215, 255], t: [160, 130, 240] },
    { f: [80, 200, 170], b: [120, 250, 210], s: [210, 255, 240], h: [170, 255, 230], e: [10, 40, 40], w: [200, 255, 240], t: [90, 220, 190] },
  ],
};

// Each fish swims back and forth along its own lane of the pond.
const FISH_LANES = [
  { cx: 205, cy: 64, range: 26, speed: 0.2, phase: 0 },
  { cx: 262, cy: 68, range: 30, speed: 0.16, phase: 2.4 },
  { cx: 300, cy: 61, range: 18, speed: 0.25, phase: 4.1 },
];

type Column = { idx: number[]; colors: RGB[]; speed: number; phase: number };

type Scene = {
  base: Uint8ClampedArray; // the painting, sampled down
  water: Uint8Array; // open water: 1 where fish may swim and the surface shimmers
  waterIdx: number[];
  columns: Column[];
  foam: number[];
  glow: { i: number; phase: number }[]; // glowing pixels at night
  halo: Float32Array | null; // r, g, b, strength per pixel, around the glow
};

function buildScene(base: Uint8ClampedArray, theme: Theme): Scene {
  const at = (i: number): RGB => [base[i * 4], base[i * 4 + 1], base[i * 4 + 2]];
  const alpha = (i: number) => base[i * 4 + 3];
  // The night pond is much darker, so it gets a looser test.
  const isWaterColor = ([r, g, b]: RGB) =>
    theme === "day" ? b > r + 40 && g > r + 30 && b > 70 : b > r + 25 && g > r + 15 && b > 40;
  const inFalls = (x: number, y: number) => x >= FALLS.x0 && x <= FALLS.x1 && y >= FALLS.top && y <= FALLS.bottom;

  // Open water: water-coloured pixels inside the pond, outside the falls.
  const water = new Uint8Array(W * H);
  for (let y = POND.top; y < H; y++)
    for (let x = POND.x0; x <= POND.x1; x++) {
      const i = y * W + x;
      if (alpha(i) > 200 && !inFalls(x, y) && isWaterColor(at(i))) water[i] = 1;
    }

  const waterIdx: number[] = [];
  for (let i = 0; i < W * H; i++) if (water[i]) waterIdx.push(i);

  // The waterfall: in each column, its light, watery pixels top to bottom.
  const columns: Column[] = [];
  for (let x = FALLS.x0; x <= FALLS.x1; x++) {
    const idx: number[] = [];
    for (let y = FALLS.top; y <= FALLS.bottom; y++) {
      const i = y * W + x;
      const [r, g, b] = at(i);
      if (alpha(i) > 200 && b > 100 && g > 80 && b > r + 20) idx.push(i);
    }
    if (idx.length >= 5) columns.push({ idx, colors: idx.map(at), speed: 16 + hash(x, 1) * 10, phase: hash(x, 2) * 40 });
  }
  const foam: number[] = [];
  for (let y = FOAM.top; y < Math.min(FOAM.bottom, H); y++)
    for (let x = FOAM.x0; x <= FOAM.x1; x++) {
      const i = y * W + x;
      if (alpha(i) > 200 && isWaterColor(at(i))) foam.push(i);
    }

  // Night glow: bright blue-white pixels in the plants (not the water or the
  // falls), plus the painted fireflies' yellow specks.
  const glow: Scene["glow"] = [];
  let halo: Float32Array | null = null;
  if (theme === "night") {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (alpha(i) < 200 || water[i] || inFalls(x, y)) continue;
        const [r, g, b] = at(i);
        const blue = r + g + b > 400 && b > 170;
        const speck = r > 180 && g > 160 && b < 150;
        if (blue || speck) glow.push({ i, phase: Math.floor(x / 24) * 1.7 + (speck ? 3 : 0) });
      }
    // A stepped halo around the glowing pixels, built once.
    halo = new Float32Array(W * H * 4);
    const R = 8;
    for (const { i } of glow) {
      const gx = i % W;
      const gy = (i / W) | 0;
      const c = at(i);
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy) / R;
          if (d >= 1) continue;
          const x = gx + dx;
          const y = gy + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const f = (Math.ceil((1 - d) ** 2 * 4) / 4) * 0.08;
          const j = (y * W + x) * 4;
          halo[j] += c[0] * f;
          halo[j + 1] += c[1] * f;
          halo[j + 2] += c[2] * f;
          halo[j + 3] += f;
        }
    }
  }

  return { base, water, waterIdx, columns, foam, glow, halo };
}

const DRAGONFLY = { body: [34, 132, 146] as RGB, head: [22, 86, 100] as RGB, wing: [214, 236, 244] as RGB };
const DRAGONFLY_SPOTS: [number, number][] = [
  [205, 47],
  [262, 44],
  [300, 49],
  [355, 33],
  [95, 28],
  [430, 30],
  [240, 40],
];

function renderFrame(s: Scene, frame: Uint8ClampedArray, theme: Theme, t: number) {
  const { base } = s;
  frame.set(base);
  const put = (i: number, c: RGB, a = 255) => {
    frame[i * 4] = c[0];
    frame[i * 4 + 1] = c[1];
    frame[i * 4 + 2] = c[2];
    frame[i * 4 + 3] = Math.max(frame[i * 4 + 3], a);
  };
  const lift = (i: number, k: number) => {
    frame[i * 4] += (255 - frame[i * 4]) * k;
    frame[i * 4 + 1] += (255 - frame[i * 4 + 1]) * k;
    frame[i * 4 + 2] += (255 - frame[i * 4 + 2]) * k;
  };
  const night = theme === "night";
  const tick = Math.floor(t * 4);

  // The surface shimmers: each row's colours slide a pixel side to side.
  for (const i of s.waterIdx) {
    const x = i % W;
    const y = (i / W) | 0;
    const dx = Math.round(Math.sin(t * 0.8 + y * 0.9 + x * 0.04) * 1.1);
    if (dx === 0) continue;
    const j = i - dx;
    if (!s.water[j]) continue;
    frame[i * 4] = base[j * 4];
    frame[i * 4 + 1] = base[j * 4 + 1];
    frame[i * 4 + 2] = base[j * 4 + 2];
  }
  // Glints come and go.
  for (const i of s.waterIdx) if (hash(i, tick) > 0.996) lift(i, night ? 0.45 : 0.6);

  // The falls pour: each column's painted pixels scroll down.
  for (const col of s.columns) {
    const n = col.idx.length;
    const shift = Math.floor(t * col.speed + col.phase);
    for (let j = 0; j < n; j++) {
      const c = col.colors[(((j - shift) % n) + n) % n];
      put(col.idx[j], c, frame[col.idx[j] * 4 + 3]);
    }
  }
  for (const i of s.foam) if (hash(i, Math.floor(t * 10)) > 0.9) lift(i, 0.5);

  // Fish swim back and forth along their lanes, turning at each end, drawn
  // only over open water so they pass behind the rocks.
  FISH_LANES.forEach((lane, n) => {
    const look = FISH_LOOKS[theme][n % FISH_LOOKS[theme].length];
    const a = t * lane.speed + lane.phase;
    const X = Math.round(lane.cx + Math.sin(a) * lane.range);
    const Y = Math.round(lane.cy + Math.sin(a * 1.7) * 0.8);
    const dir = Math.cos(a) >= 0 ? 1 : -1;
    const water = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H && s.water[y * W + x] ? y * W + x : -1);

    if (night) {
      // A soft glow on the water around the fish.
      for (let dy = -5; dy <= 5; dy++)
        for (let dx = -10; dx <= 10; dx++) {
          const i = water(X + dx, Y + dy);
          if (i < 0) continue;
          const d = Math.hypot(dx / 10, dy / 5);
          if (d >= 1) continue;
          const k = (1 - d) ** 2 * 0.6;
          frame[i * 4] += look.b[0] * k;
          frame[i * 4 + 1] += look.b[1] * k;
          frame[i * 4 + 2] += look.b[2] * k;
        }
    }

    const px = (col: number, row: number, c: RGB) => {
      const i = water(X + (col - FISH_ANCHOR.col) * dir, Y + row - FISH_ANCHOR.row);
      if (i >= 0) put(i, c);
    };
    FISH_SHAPE.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        const role = line[col] as keyof FishLook;
        if (role in look) px(col, row, look[role]);
      }
    });
    const flick = Math.floor(t * 5 + n) % 2;
    for (const [col, row] of TAIL_FRAMES[flick]) px(col, row, look.t);
  });

  if (night && s.halo) {
    // The plants' glow breathes, each patch on its own rhythm.
    const pulse = (x: number) => 0.55 + 0.45 * Math.sin(t * 0.7 + Math.floor(x / 120) * 2.3);
    const halo = s.halo;
    for (let i = 0; i < W * H; i++) {
      const j = i * 4;
      const f = halo[j + 3];
      if (f <= 0) continue;
      const k = pulse(i % W);
      const a = frame[j + 3];
      if (a < 40) {
        // Over the transparent sky the glow is its own colour.
        const strength = Math.min(1, f * k);
        frame[j] = halo[j] / f;
        frame[j + 1] = halo[j + 1] / f;
        frame[j + 2] = halo[j + 2] / f;
        frame[j + 3] = Math.max(a, strength * 220);
      } else {
        frame[j] += halo[j] * k;
        frame[j + 1] += halo[j + 1] * k;
        frame[j + 2] += halo[j + 2] * k;
      }
    }
    // The glowing pixels themselves brighten and dim a little.
    for (const g of s.glow) {
      const k = 0.5 + 0.5 * Math.sin(t * 1.1 + g.phase);
      if (k > 0.6) lift(g.i, (k - 0.6) * 0.8);
      else {
        const dim = 0.85 + k * 0.25;
        frame[g.i * 4] *= dim;
        frame[g.i * 4 + 1] *= dim;
        frame[g.i * 4 + 2] *= dim;
      }
    }
    return;
  }

  // Day: a dragonfly hovers, then darts to its next spot.
  const STEP = 3.2;
  const DART = 0.45;
  const k = t / STEP;
  const n = Math.floor(k);
  const from = DRAGONFLY_SPOTS[(n * 3) % DRAGONFLY_SPOTS.length];
  const to = DRAGONFLY_SPOTS[((n + 1) * 3) % DRAGONFLY_SPOTS.length];
  const phaseT = (k - n) * STEP;
  const m = phaseT < STEP - DART ? 0 : (phaseT - (STEP - DART)) / DART;
  const ease = m * m * (3 - 2 * m);
  const dx = Math.round(from[0] + (to[0] - from[0]) * ease);
  const dy = Math.round(from[1] + (to[1] - from[1]) * ease + Math.sin(t * 5) * 0.6);
  const facing = to[0] >= from[0] ? 1 : -1;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1);
  for (let q = -4; q <= 1; q++) {
    const i = at(dx + q * facing, dy);
    if (i >= 0) put(i, q === 1 ? DRAGONFLY.head : DRAGONFLY.body);
  }
  const up = Math.floor(t * 14) % 2 === 0;
  for (const wx of [-1, 0]) {
    const a = at(dx + wx * facing, dy - 1);
    const b = at(dx + (wx - 1) * facing, dy + (up ? -2 : 1));
    if (a >= 0) put(a, DRAGONFLY.wing, 230);
    if (b >= 0) put(b, DRAGONFLY.wing, 190);
  }
}

// Each painting is decoded and scanned once, when its theme first shows.
const scenes: Partial<Record<Theme, Promise<Scene>>> = {};
function loadScene(theme: Theme) {
  scenes[theme] ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, W, H);
      resolve(buildScene(ctx.getImageData(0, 0, W, H).data, theme));
    };
    img.onerror = reject;
    img.src = SRC[theme];
  });
  return scenes[theme]!;
}

const currentTheme = (): Theme => (document.documentElement.dataset.theme === "day" ? "day" : "night");

export default function PondScene({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(W, H);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let theme = currentTheme();
    let scene: Scene | null = null;
    let raf = 0;
    let last = 0;
    let visible = true;
    let cancelled = false;

    const draw = () => {
      if (!scene) return;
      renderFrame(scene, image.data, theme, still ? 0 : (performance.now() - start) / 1000);
      ctx.putImageData(image, 0, 0);
    };

    const show = (next: Theme) => {
      theme = next;
      loadScene(next).then((s) => {
        if (cancelled || theme !== next) return;
        scene = s;
        draw();
        canvas.dataset.ready = "";
      });
    };
    show(theme);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < FPS_INTERVAL) return;
      last = now;
      draw();
    };
    if (!still) raf = requestAnimationFrame(loop);

    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    seen.observe(canvas);

    const themeWatch = new MutationObserver(() => {
      const next = currentTheme();
      if (next !== theme) show(next);
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      seen.disconnect();
      themeWatch.disconnect();
    };
  }, []);

  return <canvas ref={ref} width={W} height={H} className={["pond-scene", className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
