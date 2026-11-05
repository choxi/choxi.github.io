"use client";

import { useEffect, useRef } from "react";

// Full-viewport animated pixel-art background built on a painted scene: a
// waterfall glowing mint under a full moon, spilling from a mossy cliff into a
// pool beside a stone bridge, framed by lavender blossom trees.
//
// The 16:9 painting is sampled down to a small canvas (455x256) and scaled
// back up with nearest-neighbour sampling, so every effect lands on the same
// coarse pixel grid as the art. On load the image is scanned for its water,
// blossoms, stars and sky; each frame copies that base and animates the falls
// (their painted pixels scroll down), the pool, the blossoms and the stars,
// then adds the moon's glow, mist, drifting petals, fireflies and the odd
// shooting star on top.

const SRC = "/assets/moon-falls.webp";
const W = 455;
const H = 256;
const FPS_INTERVAL = 1000 / 20;

type RGB = [number, number, number];

const MINT: RGB = [150, 255, 210];
const MINT_PALE: RGB = [215, 255, 235];
const MOON_GLOW: RGB = [190, 255, 220];
const FOAM: RGB = [225, 255, 240];
const STAR: RGB = [255, 255, 245];
const PETALS: RGB[] = [[214, 196, 240], [190, 170, 230], [245, 236, 255]];
const FIREFLIES: RGB[] = [[170, 255, 190], [210, 255, 150], [150, 240, 255]];

// Positions in canvas pixels (455x256).
const MOON = { x: 279, y: 37, r: 17 };
// The thin stream pouring from beneath the moon.
const STREAM = { x0: 270, x1: 290, top: 52, bottom: 90 };
// The main fall: its left edge widens from x 250 at the top to x 199 at its
// foot; its right edge runs straight down the cliff.
const FALL = { top: 88, foot: 212, x1: 302 };
const fallLeft = (y: number) => 250 - (y - FALL.top) * 0.41;
// The pool below the fall, and the little cascade below the pool.
const POOL = { x0: 188, x1: 352, top: 213, bottom: 238 };
const CASCADE = { x0: 220, x1: 322, top: 238 };
// Where the fall lands in the pool.
const IMPACT = { x: 238, y: 216 };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

const hash = (x: number, y: number, z = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Glow footprints, quantized into a few bands so halos read as pixel art.
const glowCache = new Map<number, { dx: number; dy: number; f: number }[]>();
function glowOffsets(r: number) {
  let list = glowCache.get(r);
  if (list) return list;
  list = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d >= 1) continue;
      list.push({ dx, dy, f: Math.ceil((1 - d) ** 2 * 5) / 5 });
    }
  glowCache.set(r, list);
  return list;
}

type Light = { x: number; y: number; r: number; color: RGB; phase: number; speed: number; strength: number };
// A column of falling water: its pixels top to bottom and their painted colours.
type Column = { idx: number[]; colors: RGB[]; phase: number; speed: number };

type Scene = {
  base: Uint8ClampedArray;
  columns: Column[]; // the stream, the main fall and the cascade below the pool
  foot: number[]; // white water where the fall lands
  pool: number[];
  blossom: number[]; // blossom pixels and their neighbours, which sway
  blossomCore: number[]; // blossom pixels that can catch a glint
  stars: { i: number; phase: number; speed: number }[]; // painted star pixels
  extraStars: { i: number; phase: number; speed: number; big: boolean }[];
  lights: Light[];
  petals: { x: number; y: number; vy: number; phase: number; color: RGB }[];
  flies: { x: number; y: number; phase: number; sx: number; sy: number; color: RGB }[];
  sky: [number, number][]; // where a shooting star may start
};

const isBlossom = (r: number, g: number, b: number) => r > 120 && b > 140 && g > 100 && b > g && b - g > 12;
const isFallWater = (r: number, g: number, b: number) => g > 80 && g > r + 30 && b > 70;

function buildScene(base: Uint8ClampedArray): Scene {
  const rand = mulberry32(5);
  const N = W * H;
  const at = (i: number): RGB => [base[i * 4], base[i * 4 + 1], base[i * 4 + 2]];

  const blossomMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) blossomMask[i] = isBlossom(...at(i)) ? 1 : 0;

  const blossom: number[] = [];
  const blossomCore: number[] = [];
  const stars: Scene["stars"] = [];
  const skyDark: number[] = [];
  const pool: number[] = [];
  const foot: number[] = [];
  const petalOrigins: [number, number][] = [];

  for (let y = 0; y < H; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const [r, g, b] = at(i);
      if (blossomMask[i] || blossomMask[i - 1] || blossomMask[i + 1]) blossom.push(i);
      if (blossomMask[i]) {
        blossomCore.push(i);
        if (hash(x, y, 2) > 0.95) petalOrigins.push([x, y]);
      }
      const offMoon = Math.hypot(x - MOON.x, y - MOON.y) > MOON.r + 6;
      // Painted stars: near-white specks in the sky.
      if (y < 110 && offMoon && r > 170 && g > 170 && b > 170 && !blossomMask[i]) stars.push({ i, phase: rand() * 6.28, speed: 0.8 + rand() * 2 });
      // Open night sky, for extra twinkling stars and shooting stars.
      if (y < 95 && x > 140 && offMoon && r < 40 && g < 70 && b < 90 && b > r) skyDark.push(i);
      if (y >= POOL.top && y < POOL.bottom && x >= POOL.x0 && x <= POOL.x1 && b > r + 20 && g > 70) pool.push(i);
      if (y >= FALL.foot - 8 && y < POOL.top + 2 && x >= fallLeft(y) && x <= FALL.x1 && isFallWater(r, g, b)) foot.push(i);
    }

  // Falling water, one column at a time: the stream below the moon, the main
  // fall above where it lands, and the cascade below the pool.
  const columns: Column[] = [];
  const addColumn = (x: number, y0: number, y1: number, speed: number, bright: boolean) => {
    const idx: number[] = [];
    for (let y = y0; y < y1; y++) {
      const i = y * W + x;
      const [r, g, b] = at(i);
      if (bright ? g > 120 && g > r + 40 && b > 100 : isFallWater(r, g, b)) idx.push(i);
    }
    if (idx.length >= 4) columns.push({ idx, colors: idx.map(at), phase: rand() * 40, speed: speed * (0.8 + rand() * 0.4) });
  };
  for (let x = STREAM.x0; x <= STREAM.x1; x++) addColumn(x, STREAM.top, STREAM.bottom, 22, true);
  for (let x = Math.floor(fallLeft(FALL.foot)); x <= FALL.x1; x++) {
    let y0 = FALL.top;
    while (y0 < FALL.foot && x < fallLeft(y0)) y0++;
    addColumn(x, y0, FALL.foot - 8, 26, false);
  }
  for (let x = CASCADE.x0; x <= CASCADE.x1; x++) addColumn(x, CASCADE.top, H, 18, true);

  const extraStars: Scene["extraStars"] = [];
  for (let n = 0; n < 45 && skyDark.length; n++)
    extraStars.push({ i: skyDark[Math.floor(rand() * skyDark.length)], phase: rand() * 6.28, speed: 0.5 + rand() * 1.5, big: rand() < 0.2 });
  const sky = skyDark.filter((i) => ((i / W) | 0) < 50).map((i): [number, number] => [i % W, (i / W) | 0]);

  const lights: Light[] = [];
  const addLight = (x: number, y: number, r: number, color: RGB, strength: number, speed: number) =>
    lights.push({ x, y, r, color, phase: rand() * 6.28, speed, strength });
  addLight(IMPACT.x + 8, IMPACT.y - 6, 30, MINT, 0.6, 0.35); // mist where the fall lands
  addLight(150, 200, 26, MINT, 0.35, 0.25); // the glow behind the bridge
  addLight(262, 130, 22, MINT, 0.25, 0.3); // the face of the fall
  addLight(280, 70, 10, MINT_PALE, 0.35, 0.6); // the stream below the moon

  const petals: Scene["petals"] = [];
  for (let n = 0; n < 40; n++) {
    const [x, y] = petalOrigins[Math.floor(rand() * petalOrigins.length)] ?? [rand() * W, 30];
    petals.push({ x, y: y + rand() * (H - y), vy: 5 + rand() * 6, phase: rand() * 6.28, color: PETALS[Math.floor(rand() * PETALS.length)] });
  }

  const flies: Scene["flies"] = [];
  for (let n = 0; n < 30; n++) {
    // Mostly over the undergrowth either side, some in the mist by the pool.
    const zone = rand();
    const x = zone < 0.4 ? rand() * 170 : zone < 0.8 ? 320 + rand() * 135 : 170 + rand() * 150;
    flies.push({ x, y: 150 + rand() * 100, phase: rand() * 6.28, sx: 0.15 + rand() * 0.35, sy: 0.2 + rand() * 0.4, color: FIREFLIES[Math.floor(rand() * FIREFLIES.length)] });
  }

  return { base, columns, foot, pool, blossom, blossomCore, stars, extraStars, lights, petals, flies, sky };
}

function renderFrame(s: Scene, frame: Uint8ClampedArray, t: number) {
  const { base } = s;
  frame.set(base);
  const put = (i: number, c: RGB) => {
    frame[i * 4] = c[0];
    frame[i * 4 + 1] = c[1];
    frame[i * 4 + 2] = c[2];
  };
  const add = (i: number, c: RGB, k: number) => {
    if (i < 0 || i >= W * H) return;
    frame[i * 4] += c[0] * k;
    frame[i * 4 + 1] += c[1] * k;
    frame[i * 4 + 2] += c[2] * k;
  };
  const glow = (x: number, y: number, r: number, c: RGB, k: number) => {
    for (const o of glowOffsets(r)) {
      const X = Math.floor(x) + o.dx;
      const Y = Math.floor(y) + o.dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      add(Y * W + X, c, o.f * k);
    }
  };
  const tick = Math.floor(t * 3);
  const fast = Math.floor(t * 12);

  // Blossoms sway in the breeze: rows slide a pixel side to side, with gusts
  // rolling across the scene; a few florets catch the moonlight.
  const gust = 0.5 + 0.5 * Math.sin(t * 0.3);
  for (const i of s.blossom) {
    const x = i % W;
    const y = (i / W) | 0;
    const dx = Math.round(Math.sin(t * 1.1 - x * 0.03 + y * 0.2) * gust * 0.9);
    if (dx === 0) continue;
    const j = i - dx;
    frame[i * 4] = base[j * 4];
    frame[i * 4 + 1] = base[j * 4 + 1];
    frame[i * 4 + 2] = base[j * 4 + 2];
  }
  for (const i of s.blossomCore) if (hash(i, tick) > 0.994) put(i, PETALS[2]);

  // Falling water: each column's painted pixels scroll downward, so the water
  // keeps its painted look but pours.
  for (const col of s.columns) {
    const n = col.idx.length;
    const shift = Math.floor(t * col.speed + col.phase);
    for (let j = 0; j < n; j++) put(col.idx[j], col.colors[(((j - shift) % n) + n) % n]);
  }
  // White water churning where the fall lands.
  for (const i of s.foot) {
    const h = hash(i, fast);
    if (h > 0.8) put(i, FOAM);
    else if (h > 0.55) add(i, MINT_PALE, 0.25);
  }

  // Pool: slow glints drifting across, and rings spreading from the fall.
  for (const i of s.pool) {
    const x = i % W;
    const y = (i / W) | 0;
    const w = Math.sin(x * 0.12 + t * 0.6 + Math.sin(y * 0.8) * 2) * Math.sin(y * 1.2 - t * 0.9);
    if (w > 0.8) add(i, MINT, 0.25);
    const d = Math.hypot(x - IMPACT.x, (y - IMPACT.y) * 2.8);
    for (let k = 0; k < 3; k++) {
      const r = (t * 7 + k * 10) % 30;
      if (Math.abs(d - r) < 0.7) add(i, MINT_PALE, 0.4 * (1 - r / 30));
    }
    if (hash(x, y, fast) > 0.996) put(i, FOAM);
  }
  // Spray rising off the foot of the fall.
  for (let n = 0; n < 14; n++) {
    const life = (t * 0.5 + n / 14) % 1;
    const X = Math.round(IMPACT.x + (hash(n, 4) - 0.3) * 40 + Math.sin(t + n) * 2);
    const Y = Math.round(IMPACT.y - 2 - life * 16);
    if (life < 0.85) add(Y * W + X, FOAM, 0.5 * (1 - life));
  }

  // Stars twinkle: painted ones dim and flare, and fainter ones come and go.
  for (const st of s.stars) {
    const k = 0.5 + 0.5 * Math.sin(t * st.speed + st.phase);
    if (k < 0.3) {
      frame[st.i * 4] *= 0.6;
      frame[st.i * 4 + 1] *= 0.6;
      frame[st.i * 4 + 2] *= 0.6;
    }
  }
  for (const st of s.extraStars) {
    const k = Math.max(0, Math.sin(t * st.speed + st.phase));
    add(st.i, STAR, k * 0.55);
    if (st.big && k > 0.8) for (const o of [-1, 1, -W, W]) add(st.i + o, STAR, 0.25);
  }

  // A shooting star every so often, streaking down and to the left.
  const period = 11;
  const cycle = Math.floor(t / period);
  const life = (t % period) / 0.9; // the streak lasts 0.9s
  if (life < 1 && s.sky.length) {
    const [sx, sy] = s.sky[Math.floor(hash(cycle, 1) * s.sky.length)];
    const hx = sx - life * 40;
    const hy = sy + life * 18;
    for (let k = 0; k < 9; k++) {
      const X = Math.round(hx + k * 2.2);
      const Y = Math.round(hy - k * 1);
      if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
      add(Y * W + X, STAR, (1 - k / 9) * (1 - life) * 0.9);
    }
  }

  // The moon breathes a soft halo, and the mist glows and pulses.
  glow(MOON.x, MOON.y, 34, MOON_GLOW, 0.12 + 0.05 * Math.sin(t * 0.7));
  for (const l of s.lights) glow(l.x, l.y, l.r, l.color, (0.6 + 0.4 * Math.sin(t * l.speed + l.phase)) * l.strength * 0.4);

  // Petals drift down from the blossoms, fluttering as they fall.
  for (const p of s.petals) {
    const span = H + 10;
    const fall = (p.y + t * p.vy) % span;
    const Y = Math.floor(fall) - 5;
    const X = Math.floor(p.x + Math.sin(t * 1.3 + p.phase) * 5 + fall * 0.15 + Math.sin(t * 0.2) * 4);
    if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
    put(Y * W + X, Math.sin(t * 3 + p.phase * 3) > -0.5 ? p.color : PETALS[2]);
  }

  // Fireflies wander, blinking on and off.
  for (const f of s.flies) {
    const X = Math.round(f.x + Math.sin(t * f.sx + f.phase) * 16);
    const Y = Math.round(f.y + Math.sin(t * f.sy + f.phase * 2) * 9);
    const blink = Math.max(0, Math.sin(t * 1.1 + f.phase * 3));
    if (blink < 0.15 || X < 3 || Y < 3 || X >= W - 3 || Y >= H - 3) continue;
    put(Y * W + X, f.color);
    for (const o of glowOffsets(3)) add((Y + o.dy) * W + X + o.dx, f.color, o.f * blink * 0.3);
  }

  // A faint dither of mist over the pool's far edge, drifting sideways.
  for (let x = POOL.x0; x <= POOL.x1; x++)
    for (let y = POOL.top - 6; y < POOL.top + 2; y++)
      if (Math.sin(x * 0.08 - t * 0.4 + y) > 0.3 && bayer(x, y) > 0.6) add(y * W + x, MINT, 0.06);
}

export default function MoonFalls() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current!;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    Object.assign(canvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      imageRendering: "pixelated",
    });
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let scene: Scene | null = null;
    let image: ImageData | null = null;
    let raf = 0;
    let last = 0;
    let cancelled = false;

    const draw = (now: number) => {
      if (!scene || !image) return;
      renderFrame(scene, image.data, (now - start) / 1000);
      ctx.putImageData(image, 0, 0);
    };

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, W, H);
      image = ctx.getImageData(0, 0, W, H);
      scene = buildScene(new Uint8ClampedArray(image.data));
      draw(performance.now());
      canvas.style.opacity = "1";
    };
    img.src = SRC;

    // Fade the scene in once the painting has loaded.
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 600ms ease-out";

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
      cancelled = true;
      cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, []);

  return <div ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "#0a1a1c" }} />;
}
