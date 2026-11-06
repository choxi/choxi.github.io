"use client";

import { useEffect, useRef } from "react";

// The scene at the bottom of each post: a painted pond with a waterfall,
// rocks and plants (public/assets/pond-day.webp and pond-night.webp, 2000x293
// with transparent skies), brought to life on a canvas.
//
// Each painting is sampled down to a 500x73 grid, about the size of its art
// pixels, and scaled back up with crisp pixels. On load it's scanned for its
// water, waterfall, fish and (at night) glowing plants; each frame copies
// that base and animates them:
//   - the pond's surface shimmers and catches glints,
//   - the waterfall's painted pixels pour downward, with foam at its foot,
//   - the painted fish are lifted off the water and swim back and forth,
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
const POND = { x0: 100, x1: 420, top: 53 }; // open water lies inside this, below `top`
const FALLS = { x0: 326, x1: 388, top: 38, bottom: 63 };
const FOAM = { x0: 330, x1: 392, top: 57, bottom: 64 };
// Boxes around each painted fish, roomy enough to hold it.
const FISH_BOXES: Record<Theme, [number, number, number, number][]> = {
  day: [
    [190, 60, 220, 69],
    [226, 61, 256, 71],
    [255, 61, 286, 70],
  ],
  night: [
    [180, 62, 205, 70],
    [213, 66, 240, 73],
    [266, 63, 292, 73],
  ],
};

const hash = (x: number, y: number, z = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

type Fish = { sprite: { dx: number; dy: number; c: RGB }[]; cx: number; cy: number; range: number; speed: number; phase: number; glow: RGB };
type Column = { idx: number[]; colors: RGB[]; speed: number; phase: number };

type Scene = {
  base: Uint8ClampedArray; // the painting with its fish lifted off
  water: Uint8Array; // open water: 1 where fish may swim and the surface shimmers
  waterIdx: number[];
  columns: Column[];
  foam: number[];
  fish: Fish[];
  glow: { i: number; phase: number }[]; // glowing pixels at night
  halo: Float32Array | null; // r, g, b, strength per pixel, around the glow
};

function buildScene(base: Uint8ClampedArray, theme: Theme): Scene {
  const at = (i: number): RGB => [base[i * 4], base[i * 4 + 1], base[i * 4 + 2]];
  const alpha = (i: number) => base[i * 4 + 3];
  const set = (i: number, c: RGB) => {
    base[i * 4] = c[0];
    base[i * 4 + 1] = c[1];
    base[i * 4 + 2] = c[2];
  };
  const isWaterColor = ([r, g, b]: RGB) => b > r + 40 && g > r + 30 && b > 70;
  const inFalls = (x: number, y: number) => x >= FALLS.x0 && x <= FALLS.x1 && y >= FALLS.top && y <= FALLS.bottom;

  // Open water: water-coloured pixels inside the pond, outside the falls.
  const water = new Uint8Array(W * H);
  for (let y = POND.top; y < H; y++)
    for (let x = POND.x0; x <= POND.x1; x++) {
      const i = y * W + x;
      if (alpha(i) > 200 && !inFalls(x, y) && isWaterColor(at(i))) water[i] = 1;
    }

  // Fish: inside each box, the pixels that aren't plain water (their outlines
  // included), plus, at night, the bright cyan of their glowing bodies. Lift
  // them off as a sprite and paint the water back in from either side.
  const fish: Fish[] = [];
  FISH_BOXES[theme].forEach(([x0, y0, x1, y1], n) => {
    const isFish = (r: number, g: number, b: number) =>
      !isWaterColor([r, g, b]) || (theme === "day" ? r + g + b > 560 : r + g + b > 330);
    const pts: { x: number; y: number; c: RGB }[] = [];
    for (let y = y0; y <= Math.min(y1, H - 1); y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const c = at(i);
        if (alpha(i) > 200 && isFish(...c)) pts.push({ x, y, c });
      }
    if (pts.length < 4) return;
    const cx = Math.round(pts.reduce((s, p) => s + p.x, 0) / pts.length);
    const cy = Math.round(pts.reduce((s, p) => s + p.y, 0) / pts.length);
    const taken = new Set(pts.map((p) => p.y * W + p.x));
    for (const p of pts) {
      // Nearest water on the left and right of this pixel, blended.
      let l: RGB | null = null;
      let r: RGB | null = null;
      for (let k = 1; k < 30 && (!l || !r); k++) {
        const li = p.y * W + p.x - k;
        const ri = p.y * W + p.x + k;
        if (!l && p.x - k >= 0 && !taken.has(li) && isWaterColor(at(li))) l = at(li);
        if (!r && p.x + k < W && !taken.has(ri) && isWaterColor(at(ri))) r = at(ri);
      }
      const fill = l && r ? ([(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2] as RGB) : (l ?? r);
      if (fill) set(p.y * W + p.x, fill);
      water[p.y * W + p.x] = 1;
    }
    const avg = pts.reduce((s, p) => [s[0] + p.c[0], s[1] + p.c[1], s[2] + p.c[2]], [0, 0, 0]).map((v) => v / pts.length) as RGB;
    fish.push({
      sprite: pts.map((p) => ({ dx: p.x - cx, dy: p.y - cy, c: p.c })),
      cx,
      cy,
      range: 14 + n * 5,
      speed: 0.22 + n * 0.05,
      phase: n * 2.1,
      glow: avg,
    });
  });

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
    const R = 6;
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
          const f = (Math.ceil((1 - d) ** 2 * 4) / 4) * 0.05;
          const j = (y * W + x) * 4;
          halo[j] += c[0] * f;
          halo[j + 1] += c[1] * f;
          halo[j + 2] += c[2] * f;
          halo[j + 3] += f;
        }
    }
  }

  return { base, water, waterIdx, columns, foam, fish, glow, halo };
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

  // Fish swim back and forth, drawn only over open water so they pass
  // behind the rocks. The paintings' fish face right.
  for (const f of s.fish) {
    const a = t * f.speed + f.phase;
    const X = Math.round(f.cx + Math.sin(a) * f.range);
    const Y = Math.round(f.cy + Math.sin(a * 1.7) * 0.8);
    const dir = Math.cos(a) >= 0 ? 1 : -1;
    if (night) {
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -6; dx <= 6; dx++) {
          const x = X + dx;
          const y = Y + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = y * W + x;
          if (!s.water[i]) continue;
          const k = Math.max(0, 1 - Math.hypot(dx / 6, dy / 3)) * 0.22;
          frame[i * 4] += f.glow[0] * k;
          frame[i * 4 + 1] += f.glow[1] * k;
          frame[i * 4 + 2] += f.glow[2] * k;
        }
    }
    for (const p of f.sprite) {
      const x = X + p.dx * dir;
      const y = Y + p.dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (s.water[i]) put(i, p.c);
    }
  }

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
        frame[j + 3] = Math.max(a, strength * 160);
      } else {
        frame[j] += halo[j] * k;
        frame[j + 1] += halo[j + 1] * k;
        frame[j + 2] += halo[j + 2] * k;
      }
    }
    // The glowing pixels themselves brighten and dim a little.
    for (const g of s.glow) {
      const k = 0.5 + 0.5 * Math.sin(t * 1.1 + g.phase);
      if (k > 0.6) lift(g.i, (k - 0.6) * 0.5);
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
