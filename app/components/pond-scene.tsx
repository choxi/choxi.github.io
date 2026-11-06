"use client";

import { useEffect, useRef } from "react";

// The scene at the bottom of each post: a painted pond with a waterfall,
// rocks and plants (public/assets/pond-day.webp and pond-night.webp, both
// 2000x297 with transparent skies, so the footer is the same height in
// either theme), brought to life on a canvas.
//
// Each painting is sampled down to a grid 500 pixels wide (about the size of
// its art pixels) and scaled back up with crisp pixels. On load it's scanned
// for its water, waterfall and (at night) glowing plants; each frame copies
// that base and animates them:
//   - the pond's surface shimmers and catches glints,
//   - the waterfall's painted pixels pour downward, with foam at its foot,
//   - pixel fish (koi by day, glowing fish at night) swim back and forth,
//     slipping behind the rocks,
//   - at night the mushrooms, coral and painted fireflies pulse with a soft
//     stepped glow; by day dragonflies hover and dart over the pond.
// Fireflies drift over the night scene from posts/layout.tsx.
//
// The two paintings share a size but not a layout, so each has its own entry
// in LAYOUTS. The scene follows the theme on <html data-theme>. It
// pauses off screen and holds still for people who prefer reduced motion.

type RGB = [number, number, number];
type Theme = "day" | "night";

const W = 500;
const FPS_INTERVAL = 1000 / 15;
const SRC: Record<Theme, string> = {
  day: "/assets/pond-day.webp",
  night: "/assets/pond-night.webp",
};

const hash = (x: number, y: number, z = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------------------------------------------------------------------------
// Where things are in each painting, in grid pixels (500 wide)
// ---------------------------------------------------------------------------

type Box = { x0: number; x1: number; top: number; bottom: number };
type Layout = {
  h: number; // grid height, from the painting's shape
  pond: Box; // open water lies inside this
  falls: Box;
  foam: Box; // where the falls hit the pond
  isWater: (x: number, y: number, c: RGB) => boolean;
  isFallWater: (c: RGB) => boolean;
  fishLanes: {
    cx: number;
    cy: number;
    range: number;
    speed: number;
    phase: number;
  }[];
  dragonflySpots: [number, number][]; // places a dragonfly may hover (day)
};

const LAYOUTS: Record<Theme, Layout> = {
  night: {
    h: 73,
    pond: { x0: 100, x1: 420, top: 52, bottom: 72 },
    falls: { x0: 326, x1: 388, top: 38, bottom: 63 },
    foam: { x0: 330, x1: 392, top: 57, bottom: 64 },
    // The night pond is dark, so the test is loose.
    isWater: (_x, _y, [r, g, b]) => b > r + 25 && g > r + 15 && b > 40,
    isFallWater: ([r, g, b]) => b > 100 && g > 80 && b > r + 20,
    fishLanes: [
      { cx: 205, cy: 64, range: 26, speed: 0.2, phase: 0 },
      { cx: 262, cy: 68, range: 30, speed: 0.16, phase: 2.4 },
      { cx: 300, cy: 61, range: 18, speed: 0.25, phase: 4.1 },
    ],
    dragonflySpots: [],
  },
  day: {
    h: 73,
    pond: { x0: 104, x1: 440, top: 59, bottom: 72 },
    falls: { x0: 348, x1: 421, top: 44, bottom: 65 },
    foam: { x0: 345, x1: 425, top: 60, bottom: 67 },
    // Blue-grey water (blue at least as strong as red, green not far behind,
    // which leaves out the purple and sunlit rocks), plus the golden streak
    // where the low sun reflects down the middle of the pond.
    isWater: (x, _y, [r, g, b]) =>
      (b >= r - 2 && g >= r - 6 && b > 90) ||
      (x >= 205 && x <= 290 && r > 190 && g / r > 0.78),
    // White-blue water; not the sunlit orange tops of the rocks between the
    // cascades, which are just as bright.
    isFallWater: ([r, g, b]) => b > 140 && b >= r - 8 && g >= r - 14,
    fishLanes: [
      { cx: 190, cy: 66, range: 28, speed: 0.18, phase: 0 },
      { cx: 250, cy: 69, range: 32, speed: 0.14, phase: 2.4 },
      { cx: 300, cy: 63, range: 18, speed: 0.23, phase: 4.1 },
    ],
    dragonflySpots: [
      [160, 50],
      [230, 52],
      [290, 54],
      [330, 44],
      [60, 40],
      [470, 38],
      [250, 46],
      [120, 48],
      [400, 42],
      [315, 56],
      [90, 34],
      [440, 46],
    ],
  },
};

// ---------------------------------------------------------------------------
// Fish: pixel sprites drawn over the water (the paintings have none of their
// own). Facing right; mirrored when swimming left. Each letter is a colour
// role; the tail has two frames so it flicks.
//   f fin   b body   s spot   h head   e eye   w belly   t tail
// ---------------------------------------------------------------------------

const FISH_SHAPE = ["....ff....", "..bbbbbhh.", ".bbssbbhhe", "..wwwwwhh."];
// Tail pixels, [column, row] in the shape's grid: spread, then closed.
const TAIL_FRAMES: [number, number][][] = [
  [
    [0, 2],
    [-1, 1],
    [-2, 1],
    [-1, 3],
    [-2, 3],
  ],
  [
    [0, 2],
    [-1, 2],
    [-2, 1],
    [-2, 3],
  ],
];
const FISH_ANCHOR = { col: 5, row: 2 }; // the shape's centre

type FishLook = Record<"f" | "b" | "s" | "h" | "e" | "w" | "t", RGB>;
const FISH_LOOKS: Record<Theme, FishLook[]> = {
  day: [
    // Orange koi with white patches.
    {
      f: [222, 96, 40],
      b: [244, 120, 46],
      s: [250, 244, 232],
      h: [248, 140, 64],
      e: [40, 28, 28],
      w: [252, 236, 214],
      t: [226, 102, 42],
    },
    // White koi with orange patches.
    {
      f: [236, 228, 216],
      b: [250, 246, 238],
      s: [242, 126, 50],
      h: [246, 140, 70],
      e: [40, 28, 28],
      w: [255, 252, 246],
      t: [232, 224, 212],
    },
    // Golden koi.
    {
      f: [214, 156, 40],
      b: [242, 190, 60],
      s: [250, 222, 120],
      h: [246, 204, 90],
      e: [40, 28, 28],
      w: [252, 236, 186],
      t: [220, 164, 46],
    },
  ],
  night: [
    // Glowing fish, like the landing scene's.
    {
      f: [90, 210, 230],
      b: [120, 240, 255],
      s: [210, 255, 255],
      h: [170, 250, 255],
      e: [12, 40, 60],
      w: [190, 255, 255],
      t: [90, 220, 240],
    },
    {
      f: [150, 120, 230],
      b: [180, 160, 255],
      s: [235, 225, 255],
      h: [210, 195, 255],
      e: [20, 20, 50],
      w: [225, 215, 255],
      t: [160, 130, 240],
    },
    {
      f: [80, 200, 170],
      b: [120, 250, 210],
      s: [210, 255, 240],
      h: [170, 255, 230],
      e: [10, 40, 40],
      w: [200, 255, 240],
      t: [90, 220, 190],
    },
  ],
};

// ---------------------------------------------------------------------------
// Scanning a painting
// ---------------------------------------------------------------------------

type Column = { idx: number[]; colors: RGB[]; speed: number; phase: number };

// One glowing thing (a mushroom cap, a coral sprig, a speck): its pixels, and
// its halo as r, g, b, strength per pixel in a box at (x0, y0). Each pulses on
// its own phase and speed.
type Glow = {
  pixels: number[];
  x0: number;
  y0: number;
  w: number;
  h: number;
  halo: Float32Array;
  phase: number;
  speed: number;
};

type Scene = {
  theme: Theme;
  h: number;
  base: Uint8ClampedArray; // the painting, sampled down
  water: Uint8Array; // open water: 1 where fish may swim and the surface shimmers
  waterIdx: number[];
  columns: Column[];
  foam: number[];
  glows: Glow[]; // at night, each glowing thing and its halo
};

function buildScene(base: Uint8ClampedArray, theme: Theme): Scene {
  const L = LAYOUTS[theme];
  const H = L.h;
  const at = (i: number): RGB => [
    base[i * 4],
    base[i * 4 + 1],
    base[i * 4 + 2],
  ];
  const alpha = (i: number) => base[i * 4 + 3];
  const inBox = (b: Box, x: number, y: number) =>
    x >= b.x0 && x <= b.x1 && y >= b.top && y <= b.bottom;

  // Open water: water-coloured pixels inside the pond, outside the falls.
  const water = new Uint8Array(W * H);
  for (let y = L.pond.top; y <= Math.min(L.pond.bottom, H - 1); y++)
    for (let x = L.pond.x0; x <= L.pond.x1; x++) {
      const i = y * W + x;
      if (alpha(i) > 200 && !inBox(L.falls, x, y) && L.isWater(x, y, at(i)))
        water[i] = 1;
    }
  const waterIdx: number[] = [];
  for (let i = 0; i < W * H; i++) if (water[i]) waterIdx.push(i);

  // The waterfall: in each column, its light, watery pixels top to bottom.
  const columns: Column[] = [];
  for (let x = L.falls.x0; x <= L.falls.x1; x++) {
    const idx: number[] = [];
    for (let y = L.falls.top; y <= Math.min(L.falls.bottom, H - 1); y++) {
      const i = y * W + x;
      if (alpha(i) > 200 && L.isFallWater(at(i))) idx.push(i);
    }
    if (idx.length >= 5)
      columns.push({
        idx,
        colors: idx.map(at),
        speed: 16 + hash(x, 1) * 10,
        phase: hash(x, 2) * 40,
      });
  }
  const foam: number[] = [];
  for (let y = L.foam.top; y <= Math.min(L.foam.bottom, H - 1); y++)
    for (let x = L.foam.x0; x <= L.foam.x1; x++) {
      const i = y * W + x;
      if (alpha(i) > 200 && (L.isWater(x, y, at(i)) || L.isFallWater(at(i))))
        foam.push(i);
    }

  // Night glow: bright blue-white pixels in the plants (not the water or the
  // falls), plus the painted fireflies' yellow specks. They're grouped into
  // separate glowing things (a mushroom cap, a coral sprig, a speck) so each
  // can pulse on its own rhythm instead of all together.
  const glows: Glow[] = [];
  if (theme === "night") {
    const lit = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (alpha(i) < 200 || water[i] || inBox(L.falls, x, y)) continue;
        const [r, g, b] = at(i);
        const blue = r + g + b > 400 && b > 170;
        const speck = r > 180 && g > 160 && b < 150;
        if (blue || speck) lit[i] = 1;
      }

    // Group lit pixels that are within 2px of each other.
    const seen = new Uint8Array(W * H);
    const R = 8; // halo radius
    for (let start = 0; start < W * H; start++) {
      if (!lit[start] || seen[start]) continue;
      const pixels: number[] = [];
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const i = stack.pop()!;
        pixels.push(i);
        const x = i % W;
        const y = (i / W) | 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (lit[j] && !seen[j]) {
              seen[j] = 1;
              stack.push(j);
            }
          }
      }

      // Its halo: a stepped glow around each of its pixels, kept in a box
      // just big enough to hold it.
      const xs = pixels.map((i) => i % W);
      const ys = pixels.map((i) => (i / W) | 0);
      const x0 = Math.max(0, Math.min(...xs) - R);
      const y0 = Math.max(0, Math.min(...ys) - R);
      const bw = Math.min(W - 1, Math.max(...xs) + R) - x0 + 1;
      const bh = Math.min(H - 1, Math.max(...ys) + R) - y0 + 1;
      const halo = new Float32Array(bw * bh * 4);
      for (const i of pixels) {
        const gx = i % W;
        const gy = (i / W) | 0;
        const c = at(i);
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            const d = Math.hypot(dx, dy) / R;
            if (d >= 1) continue;
            const x = gx + dx - x0;
            const y = gy + dy - y0;
            if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
            const f = (Math.ceil((1 - d) ** 2 * 4) / 4) * 0.08;
            const j = (y * bw + x) * 4;
            halo[j] += c[0] * f;
            halo[j + 1] += c[1] * f;
            halo[j + 2] += c[2] * f;
            halo[j + 3] += f;
          }
      }
      const n = glows.length;
      glows.push({
        pixels,
        x0,
        y0,
        w: bw,
        h: bh,
        halo,
        phase: hash(n, 7) * 6.28,
        speed: 0.45 + hash(n, 8) * 0.5,
      });
    }
  }

  return { theme, h: H, base, water, waterIdx, columns, foam, glows };
}

// ---------------------------------------------------------------------------
// Drawing a frame
// ---------------------------------------------------------------------------

const DRAGONFLY_WING: RGB = [214, 236, 244];
// Three dragonflies: teal, blue and a red one, each with its own pace (step:
// seconds per hover-and-dart) and route (start spot, and how far it skips).
const DRAGONFLIES = [
  {
    body: [34, 132, 146] as RGB,
    head: [22, 86, 100] as RGB,
    step: 3.2,
    offset: 0,
    start: 0,
    stride: 5,
  },
  {
    body: [48, 92, 196] as RGB,
    head: [28, 54, 130] as RGB,
    step: 4.1,
    offset: 1.3,
    start: 4,
    stride: 7,
  },
  {
    body: [208, 74, 52] as RGB,
    head: [140, 44, 34] as RGB,
    step: 3.7,
    offset: 2.6,
    start: 9,
    stride: 5,
  },
];

function renderFrame(s: Scene, frame: Uint8ClampedArray, t: number) {
  const { base, theme } = s;
  const H = s.h;
  const L = LAYOUTS[theme];
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
  for (const i of s.waterIdx)
    if (hash(i, tick) > 0.996) lift(i, night ? 0.45 : 0.6);

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
  const water = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && s.water[y * W + x] ? y * W + x : -1;
  L.fishLanes.forEach((lane, n) => {
    const look = FISH_LOOKS[theme][n % FISH_LOOKS[theme].length];
    const a = t * lane.speed + lane.phase;
    const X = Math.round(lane.cx + Math.sin(a) * lane.range);
    const Y = Math.round(lane.cy + Math.sin(a * 1.7) * 0.8);
    const dir = Math.cos(a) >= 0 ? 1 : -1;

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
      const i = water(
        X + (col - FISH_ANCHOR.col) * dir,
        Y + row - FISH_ANCHOR.row,
      );
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

  if (night) {
    // Each glowing thing breathes on its own rhythm, from a faint glow up to
    // a soft (not blazing) peak.
    for (const g of s.glows) {
      const wave = Math.sin(t * g.speed + g.phase); // -1..1
      const k = 0.5 + 0.32 * wave;
      for (let y = 0; y < g.h; y++)
        for (let x = 0; x < g.w; x++) {
          const l = (y * g.w + x) * 4;
          const f = g.halo[l + 3];
          if (f <= 0) continue;
          const j = ((g.y0 + y) * W + g.x0 + x) * 4;
          const a = frame[j + 3];
          if (a < 40) {
            // Over the transparent sky the glow is its own colour.
            frame[j] = g.halo[l] / f;
            frame[j + 1] = g.halo[l + 1] / f;
            frame[j + 2] = g.halo[l + 2] / f;
            frame[j + 3] = Math.max(a, Math.min(1, f * k) * 190);
          } else {
            frame[j] += g.halo[l] * k;
            frame[j + 1] += g.halo[l + 1] * k;
            frame[j + 2] += g.halo[l + 2] * k;
          }
        }
      // Its own pixels brighten a little toward the peak and dim in the trough.
      for (const i of g.pixels) {
        if (wave > 0.3) lift(i, (wave - 0.3) * 0.35);
        else {
          const dim = 0.9 + (wave + 1) * 0.077;
          frame[i * 4] *= dim;
          frame[i * 4 + 1] *= dim;
          frame[i * 4 + 2] *= dim;
        }
      }
    }
    return;
  }

  // Day: dragonflies hover, then dart to their next spot, each on its own
  // timing and route through the spots.
  const spots = L.dragonflySpots;
  if (!spots.length) return;
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1;
  const DART = 0.45;
  for (const d of DRAGONFLIES) {
    const k = (t + d.offset) / d.step;
    const n = Math.floor(k);
    const from = spots[(n * d.stride + d.start) % spots.length];
    const to = spots[((n + 1) * d.stride + d.start) % spots.length];
    const phaseT = (k - n) * d.step;
    const m = phaseT < d.step - DART ? 0 : (phaseT - (d.step - DART)) / DART;
    const ease = m * m * (3 - 2 * m);
    const dx = Math.round(from[0] + (to[0] - from[0]) * ease);
    const dy = Math.round(
      from[1] + (to[1] - from[1]) * ease + Math.sin(t * 5 + d.offset) * 0.6,
    );
    const facing = to[0] >= from[0] ? 1 : -1;
    for (let q = -4; q <= 1; q++) {
      const i = at(dx + q * facing, dy);
      if (i >= 0) put(i, q === 1 ? d.head : d.body);
    }
    const up = Math.floor(t * 14 + d.offset * 3) % 2 === 0;
    for (const wx of [-1, 0]) {
      const a = at(dx + wx * facing, dy - 1);
      const b = at(dx + (wx - 1) * facing, dy + (up ? -2 : 1));
      if (a >= 0) put(a, DRAGONFLY_WING, 230);
      if (b >= 0) put(b, DRAGONFLY_WING, 190);
    }
  }
}

// ---------------------------------------------------------------------------

// Each painting is decoded and scanned once, when its theme first shows.
const scenes: Partial<Record<Theme, Promise<Scene>>> = {};
function loadScene(theme: Theme) {
  scenes[theme] ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const H = LAYOUTS[theme].h;
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

const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === "day" ? "day" : "night";

export default function PondScene({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let theme = currentTheme();
    let scene: Scene | null = null;
    let image: ImageData | null = null;
    let raf = 0;
    let last = 0;
    let visible = true;
    let cancelled = false;

    const draw = () => {
      if (!scene || !image) return;
      renderFrame(
        scene,
        image.data,
        still ? 0 : (performance.now() - start) / 1000,
      );
      ctx.putImageData(image, 0, 0);
    };

    // Switch paintings: the canvas takes the painting's shape (its CSS height
    // follows from the width and height attributes).
    const show = (next: Theme) => {
      theme = next;
      loadScene(next).then((s) => {
        if (cancelled || theme !== next) return;
        if (canvas.height !== s.h) canvas.height = s.h;
        image = ctx.createImageData(W, s.h);
        scene = s;
        draw();
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
    themeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      seen.disconnect();
      themeWatch.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      width={W}
      height={LAYOUTS.night.h}
      className={["pond-scene", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
