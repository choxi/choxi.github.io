"use client";

import { useEffect, useRef } from "react";

// Full-viewport animated pixel-art background: a night grove with a waterfall
// feeding a river, bioluminescent plants and trees. The scene is drawn into a
// tiny canvas (180px tall) and scaled up with nearest-neighbour sampling.
//
// Rough layout pass: static layers are painted once into a base buffer; each
// frame copies it, then animates the water, the plant glow, stars and
// fireflies on top.

const H = 180;
const FPS_INTERVAL = 1000 / 20;

type RGB = [number, number, number];

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const C = {
  skyTop: hex("#070a1f"),
  skyMid: hex("#141640"),
  skyLow: hex("#25306a"),
  moon: hex("#e9e4c4"),
  moonShade: hex("#b9b494"),
  farHill: hex("#1c2352"),
  nearHill: hex("#131a40"),
  rock: hex("#161a3a"),
  rockLit: hex("#262c5a"),
  ground: hex("#0b1626"),
  groundDark: hex("#070e1a"),
  grass: hex("#12263a"),
  pine: hex("#0c1730"),
  pineLit: hex("#13213f"),
  trunk: hex("#0a0812"),
  bark: hex("#231a33"),
  canopy: hex("#071a22"),
  canopyLit: hex("#14404a"),
  fallDark: hex("#24558a"),
  fallMid: hex("#3b88bd"),
  fallLight: hex("#a4e4f2"),
  foam: hex("#dff6fb"),
  river: hex("#0e2b45"),
  riverMid: hex("#1d5476"),
  riverLight: hex("#5cb4cf"),
  bank: hex("#1f4a5a"),
  stem: hex("#6f8c9a"),
  cyan: hex("#5ff5e6"),
  magenta: hex("#ff5fd2"),
  violet: hex("#a77bff"),
  lime: hex("#b8ff6a"),
  firefly: hex("#e3ff8a"),
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
      const f = Math.ceil((1 - d) ** 2 * 4) / 4;
      list.push({ dx, dy, f });
    }
  }
  glowCache.set(r, list);
  return list;
}

type Scene = {
  W: number;
  base: Uint8ClampedArray;
  fall: number[]; // pixel indices of the waterfall
  river: number[]; // pixel indices of the pool + river
  fallX0: number;
  fallW: number;
  poolY: number;
  lights: Light[];
  stars: { i: number; phase: number; speed: number }[];
  flies: { x: number; y: number; phase: number; sx: number; sy: number }[];
};

function buildScene(W: number): Scene {
  const rand = mulberry32(7);
  const noise = makeNoise(rand);
  const base = new Uint8ClampedArray(W * H * 4);
  const kind = new Uint8Array(W * H); // 0 solid, 1 waterfall, 2 river

  const px = (x: number, y: number, c: RGB, k = 0) => {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    base[i * 4] = c[0];
    base[i * 4 + 1] = c[1];
    base[i * 4 + 2] = c[2];
    base[i * 4 + 3] = 255;
    kind[i] = k;
  };
  const dither = (x: number, y: number, a: RGB, b: RGB, t: number) => (t > bayer(x, y) ? b : a);
  const disc = (cx: number, cy: number, r: number, fill: (x: number, y: number) => RGB) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(x, y, fill(x, y));
  };

  const cx = Math.round(W * 0.5);
  const horizon = 112;
  const poolY = 114;

  // Sky: three-stop dithered gradient.
  for (let y = 0; y < horizon; y++) {
    const t = y / horizon;
    for (let x = 0; x < W; x++) {
      px(x, y, t < 0.5 ? dither(x, y, C.skyTop, C.skyMid, t * 2) : dither(x, y, C.skyMid, C.skyLow, (t - 0.5) * 2));
    }
  }

  const stars: Scene["stars"] = [];
  for (let n = 0; n < W * 0.35; n++) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * 70);
    stars.push({ i: y * W + x, phase: rand() * 6.28, speed: 0.5 + rand() * 2 });
  }

  // Moon with a dithered halo.
  const mx = Math.round(W * 0.74);
  const my = 28;
  for (let y = my - 22; y <= my + 22; y++)
    for (let x = mx - 22; x <= mx + 22; x++) {
      const d = Math.hypot(x - mx, y - my);
      if (d > 10 && d < 22 && (1 - (d - 10) / 12) * 0.5 > bayer(x, y)) px(x, y, C.skyLow);
    }
  disc(mx, my, 9, (x, y) => (Math.hypot(x - mx + 3, y - my - 2) < 3 || hash(x, y) > 0.9 ? C.moonShade : C.moon));

  // Distant ridges.
  for (let x = 0; x < W; x++) {
    const far = 66 + noise(x * 0.025) * 26;
    const near = 86 + noise(x * 0.04 + 100) * 18;
    for (let y = Math.floor(far); y < horizon; y++) px(x, y, C.farHill);
    for (let y = Math.floor(near); y < horizon; y++) px(x, y, C.nearHill);
  }

  // Cliff the waterfall drops from.
  const cliffHW = Math.max(28, Math.round(W * 0.11));
  for (let x = cx - cliffHW - 12; x <= cx + cliffHW + 12; x++) {
    const dx = Math.abs(x - cx);
    const shoulder = Math.max(0, dx - cliffHW) * 1.6;
    const top = 78 + dx * 0.08 + shoulder + noise(x * 0.3 + 300) * 4;
    for (let y = Math.floor(top); y < horizon; y++) {
      const lit = y - top < 2 || hash(x, y) > 0.93;
      px(x, y, lit ? C.rockLit : dither(x, y, C.rock, C.nearHill, (y - top) / 40));
    }
  }

  // Waterfall.
  const fallW = 12;
  const fallX0 = cx - fallW / 2;
  const fallTop = 80;
  for (let y = fallTop; y < poolY + 1; y++)
    for (let x = fallX0; x < fallX0 + fallW; x++) px(x, y, C.fallMid, 1);

  // Ground plane.
  for (let y = horizon; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = (y - horizon) / (H - horizon);
      px(x, y, hash(x, y) > 0.92 ? C.grass : dither(x, y, C.ground, C.groundDark, t * 0.8));
    }

  // River: widens and meanders toward the viewer.
  const riverC = (y: number) => {
    const t = (y - poolY) / (H - poolY);
    return cx + Math.sin(t * 3.4) * W * 0.07 * t;
  };
  const riverHW = (y: number) => 7 + ((y - poolY) / (H - poolY)) ** 1.3 * W * 0.17;
  const inRiver = (x: number, y: number) => {
    if (y < poolY - 1) return false;
    if (((x - cx) / 17) ** 2 + ((y - poolY - 1) / 4) ** 2 <= 1) return true; // pool
    return y >= poolY && Math.abs(x - riverC(y)) <= riverHW(y);
  };

  // Back row of pines along the horizon, kept clear of the waterfall.
  for (let x = 0; x < W; x += 3 + Math.floor(rand() * 4)) {
    if (Math.abs(x - cx) < 12) continue;
    const h = 12 + rand() * 22;
    const by = horizon + 1 + Math.floor(rand() * 4);
    pine(x, by, h);
  }
  function pine(x: number, by: number, h: number) {
    const maxW = h * 0.3;
    for (let r = 0; r < h; r++) {
      const tier = (r % 6) / 6;
      const w = Math.round(maxW * (r / h) * 0.7 + maxW * tier * 0.35 * (r / h + 0.3));
      for (let dx = -w; dx <= w; dx++) {
        const X = x + dx;
        const Y = by - h + r;
        if (inRiver(X, Y)) continue;
        px(X, Y, dx < 0 && hash(X, Y) > 0.6 ? C.pineLit : C.pine);
      }
    }
    px(x, by, C.trunk);
  }

  // Carve the river.
  for (let y = poolY - 1; y < H; y++)
    for (let x = 0; x < W; x++)
      if (inRiver(x, y)) px(x, y, C.river, 2);
      else if (y > poolY && (inRiver(x - 1, y) || inRiver(x + 1, y))) px(x, y, C.bank);

  const lights: Light[] = [];
  const addLight = (x: number, y: number, r: number, color: RGB, strength = 1) =>
    lights.push({ x, y, r, color, phase: rand() * 6.28, speed: 0.6 + rand() * 1.2, strength });

  // Round midground trees with glowing fruit.
  const roundTree = (x: number, by: number, s: number) => {
    for (let y = by - s; y <= by; y++) px(x, y, C.trunk), px(x + 1, y, C.trunk);
    const blobs = [
      [0, -s - 4, s * 0.55],
      [-s * 0.4, -s - 1, s * 0.4],
      [s * 0.45, -s, s * 0.42],
    ];
    for (const [ox, oy, r] of blobs)
      disc(x + ox, by + oy, r, (X, Y) => (Y < by + oy - r * 0.3 && hash(X, Y) > 0.5 ? C.canopyLit : C.canopy));
    for (let n = 0; n < 4; n++) {
      const fx = x + (rand() - 0.5) * s * 1.2;
      const fy = by - s - 4 + (rand() - 0.2) * s * 0.8;
      px(fx, fy, C.magenta);
      addLight(fx, fy, 5, C.magenta, 0.7);
    }
  };
  roundTree(Math.round(W * 0.27), 124, 14);
  roundTree(Math.round(W * 0.79), 126, 16);

  // Bioluminescent plants scattered along the banks; bigger toward the viewer.
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
  const tuft = (x: number, y: number, color: RGB) => {
    for (let b = -2; b <= 2; b++) {
      const h = 2 + Math.floor(rand() * 3);
      for (let d = 0; d < h; d++) px(x + b, y - d, d === h - 1 ? color : C.grass);
    }
    addLight(x, y - 3, 4, color, 0.6);
  };

  const palette = [C.cyan, C.cyan, C.magenta, C.violet, C.lime];
  for (let n = 0; n < 34; n++) {
    const y = poolY + 4 + Math.floor(rand() * (H - poolY - 4));
    const t = (y - poolY) / (H - poolY);
    const side = rand() < 0.5 ? -1 : 1;
    const x = Math.round(riverC(y) + side * (riverHW(y) + 3 + rand() * W * 0.14));
    if (inRiver(x, y)) continue;
    const color = palette[Math.floor(rand() * palette.length)];
    const pick = rand();
    if (pick < 0.4) mushroom(x, y, 1 + Math.round(t * 3), color);
    else if (pick < 0.7) stalk(x, y, 6 + Math.round(t * 16 * rand() + 4), color);
    else tuft(x, y, color);
  }
  // A few on the cliff ledges beside the falls.
  mushroom(cx - 12, 92, 1, C.cyan);
  mushroom(cx + 14, 96, 1, C.violet);
  tuft(cx - 20, 104, C.lime);

  // Foreground trees framing the scene, with glowing hanging vines.
  const bigTree = (x: number, tw: number, flip: number) => {
    for (let y = 0; y < H; y++) {
      const flare = y > H - 20 ? (y - (H - 20)) * 0.5 : 0;
      const sway = Math.sin(y * 0.03) * 3 * flip;
      for (let dx = -tw / 2 - flare; dx <= tw / 2 + flare; dx++) {
        const X = x + dx + sway;
        px(X, y, dx * flip > tw / 2 - 3 - flare && hash(X, y) > 0.35 ? C.bark : C.trunk);
      }
    }
    for (let n = 0; n < 12; n++) {
      const ox = (rand() - 0.3) * 70 * flip;
      const oy = rand() * 30 - 8;
      const r = 10 + rand() * 13;
      // Leaves catch glow on the underside of each clump.
      disc(x + ox, oy, r, (X, Y) => (Y > oy + r * 0.4 && hash(X, Y) > 0.45 ? C.canopyLit : C.canopy));
    }
    for (let n = 0; n < 5; n++) {
      const vx = Math.round(x + (8 + rand() * 40) * flip);
      const len = 10 + Math.floor(rand() * 30);
      for (let d = 0; d < len; d++) px(vx + Math.round(Math.sin(d * 0.3) * 0.6), 20 + d, C.canopy);
      px(vx, 20 + len, C.cyan);
      addLight(vx, 20 + len, 5, C.cyan, 0.8);
    }
  };
  bigTree(Math.round(W * 0.06), 12, 1);
  bigTree(Math.round(W * 0.95), 14, -1);

  // Fireflies drift around the lower half.
  const flies: Scene["flies"] = [];
  for (let n = 0; n < Math.round(W * 0.08); n++)
    flies.push({ x: rand() * W, y: 90 + rand() * 80, phase: rand() * 6.28, sx: 0.2 + rand() * 0.4, sy: 0.3 + rand() * 0.5 });

  const fall: number[] = [];
  const river: number[] = [];
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] === 1) fall.push(i);
    else if (kind[i] === 2) river.push(i);
  }

  return { W, base, fall, river, fallX0, fallW, poolY, lights, stars, flies };
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
    frame[i * 4] += c[0] * k;
    frame[i * 4 + 1] += c[1] * k;
    frame[i * 4 + 2] += c[2] * k;
  };

  // Waterfall: per-column streaks scrolling down, foam at the bottom.
  for (const i of s.fall) {
    const x = i % W;
    const y = (i / W) | 0;
    const col = x - s.fallX0;
    const speed = 30 + hash(col, 1) * 20;
    const v = (y + hash(col, 2) * 20 - t * speed) / 7;
    const stripe = v - Math.floor(v);
    let c = stripe < 0.18 ? C.fallLight : stripe < 0.55 ? C.fallMid : C.fallDark;
    if (col === 0 || col === s.fallW - 1) c = C.fallDark;
    if (y > s.poolY - 6 && hash(x, y, Math.floor(t * 12)) > 0.45) c = C.foam;
    put(i, c);
  }

  // River: horizontal ripples sliding toward the viewer.
  const tick = Math.floor(t * 10);
  for (const i of s.river) {
    const x = i % W;
    const y = (i / W) | 0;
    const n =
      Math.sin((y - t * 9) * 0.9 + Math.sin(x * 0.18 + t * 0.7) * 1.6) * 0.6 +
      Math.sin(x * 0.11 - y * 0.25 + t * 1.2) * 0.4;
    let c = n > 0.82 ? C.riverLight : n > 0.45 ? C.riverMid : C.river;
    if (y <= s.poolY + 4 && hash(x, y, tick) > 0.7) c = C.foam;
    put(i, c);
  }

  // Twinkling stars.
  for (const st of s.stars) {
    const k = 0.5 + 0.5 * Math.sin(t * st.speed + st.phase);
    add(st.i, [200, 210, 255], k * 0.8);
  }

  // Pulsing glow from the plants.
  for (const l of s.lights) {
    const k = (0.55 + 0.45 * Math.sin(t * l.speed + l.phase)) * l.strength * 0.45;
    for (const o of glowOffsets(l.r)) {
      const X = l.x + o.dx;
      const Y = l.y + o.dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      add((Y | 0) * W + (X | 0), l.color, o.f * k);
    }
  }

  // Fireflies.
  for (const f of s.flies) {
    const X = Math.round(f.x + Math.sin(t * f.sx + f.phase) * 14);
    const Y = Math.round(f.y + Math.sin(t * f.sy + f.phase * 2) * 8);
    const blink = Math.max(0, Math.sin(t * 1.3 + f.phase * 3));
    if (blink < 0.1 || X < 1 || Y < 1 || X >= W - 1 || Y >= H - 1) continue;
    const i = Y * W + X;
    put(i, C.firefly);
    for (const o of glowOffsets(3)) {
      const j = (Y + o.dy) * W + X + o.dx;
      if (j >= 0 && j < W * H) add(j, C.firefly, o.f * blink * 0.25);
    }
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
      const W = Math.min(480, Math.max(120, Math.round((H * width) / Math.max(1, height))));
      if (scene?.W === W) return;
      canvas.width = W;
      canvas.height = H;
      scene = buildScene(W);
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

  return <div ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "#070a1f" }} />;
}
