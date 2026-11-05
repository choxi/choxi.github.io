"use client";

import { useEffect, useRef } from "react";

// Full-viewport animated pixel-art background built on a painted scene: a
// night forest under golden canopies, a stream winding out of a misty clearing,
// and a glowing ring standing on a mossy rock.
//
// The painting is sampled down to a small canvas (384x256) and scaled back up
// with nearest-neighbour sampling, so every effect lands on the same coarse
// pixel grid as the art. On load the image is scanned for its golden leaves,
// stream and misty clearing; each frame copies the base and animates those
// regions, then adds drifting leaves, fireflies and the ring's glow on top.

const SRC = "/assets/golden-forest.webp";
const W = 384;
const H = 256;
const FPS_INTERVAL = 1000 / 20;

type RGB = [number, number, number];

const GOLD: RGB = [255, 206, 60];
const GOLD_PALE: RGB = [255, 240, 160];
const AMBER: RGB = [240, 160, 20];
const MIST: RGB = [120, 200, 220];
const FOAM: RGB = [190, 232, 255];
const FIREFLY: RGB = [255, 226, 120];

// The ring on the left, in canvas pixels.
const RING = { x: 62, y: 93, r: 4 };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

const hash = (x: number, y: number, z = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// Smooth 2D value noise, used for the drifting mist.
const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, 1);
  const b = hash(xi + 1, yi, 1);
  const c = hash(xi, yi + 1, 1);
  const d = hash(xi + 1, yi + 1, 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
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

type Scene = {
  base: Uint8ClampedArray;
  canopy: number[]; // pixels in and around the golden canopy that sway
  leaves: number[]; // golden leaf pixels that can catch a glint
  water: number[];
  mist: number[];
  ringPx: number[];
  falling: { x: number; y: number; vy: number; phase: number; big: boolean; color: RGB }[];
  motes: { a: number; r: number; speed: number; rise: number; phase: number }[];
  flies: { x: number; y: number; phase: number; sx: number; sy: number }[];
  leafOrigins: [number, number][];
};

const isGold = (r: number, g: number, b: number) => r > 160 && g > 100 && b < 110 && r - b > 100;

function buildScene(base: Uint8ClampedArray): Scene {
  const rand = mulberry32(7);
  const gold = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) gold[i] = isGold(base[i * 4], base[i * 4 + 1], base[i * 4 + 2]) ? 1 : 0;

  const canopy: number[] = [];
  const leaves: number[] = [];
  const water: number[] = [];
  const mist: number[] = [];
  const ringPx: number[] = [];
  const leafOrigins: [number, number][] = [];

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const r = base[i * 4];
      const g = base[i * 4 + 1];
      const b = base[i * 4 + 2];
      const nearRing = Math.hypot(x - RING.x, y - RING.y) < RING.r + 2.5;
      // The canopy fills the top of the painting; the bushes below are left still.
      if (y < 105 && x > 0 && x < W - 1 && (gold[i] || gold[i - 1] || gold[i + 1])) canopy.push(i);
      if (gold[i] && !nearRing) {
        leaves.push(i);
        if (y < 90 && hash(x, y, 2) > 0.93) leafOrigins.push([x, y]);
      }
      // The stream: saturated blue in the lower middle, down to the bottom edge.
      if (y > 188 && x > 175 && x < 315 && b > 110 && b > g + 25 && b > r + 70) water.push(i);
      // The misty clearing behind the stream: pale cyan between the near trunks.
      else if (y > 70 && y < 200 && x > 140 && x < 250 && b > r + 30 && g > 40) mist.push(i);
      if (nearRing && gold[i]) ringPx.push(i);
    }

  const falling: Scene["falling"] = [];
  for (let n = 0; n < 34; n++) {
    const [x, y] = leafOrigins[Math.floor(rand() * leafOrigins.length)] ?? [rand() * W, 20];
    falling.push({
      x,
      y: y + rand() * (H - y),
      vy: 5 + rand() * 7,
      phase: rand() * 6.28,
      big: rand() < 0.35,
      color: rand() < 0.6 ? GOLD : AMBER,
    });
  }

  const motes: Scene["motes"] = [];
  for (let n = 0; n < 16; n++)
    motes.push({ a: rand() * 6.28, r: 5 + rand() * 9, speed: 0.3 + rand() * 0.6, rise: 2 + rand() * 4, phase: rand() });

  const flies: Scene["flies"] = [];
  for (let n = 0; n < 26; n++)
    flies.push({ x: rand() * W, y: 125 + rand() * 125, phase: rand() * 6.28, sx: 0.15 + rand() * 0.35, sy: 0.2 + rand() * 0.4 });

  return { base, canopy, leaves, water, mist, ringPx, falling, motes, flies, leafOrigins };
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
  const tick = Math.floor(t * 3);

  // Canopy sways in the wind: rows of leaves slide a pixel side to side,
  // with gusts rolling across from left to right.
  const gust = 0.55 + 0.45 * Math.sin(t * 0.35);
  for (const i of s.canopy) {
    const x = i % W;
    const y = (i / W) | 0;
    const dx = Math.round(Math.sin(t * 1.3 - x * 0.04 + y * 0.18) * gust * (0.6 + (1 - y / 105) * 0.7));
    if (dx === 0) continue;
    const j = i - dx;
    frame[i * 4] = base[j * 4];
    frame[i * 4 + 1] = base[j * 4 + 1];
    frame[i * 4 + 2] = base[j * 4 + 2];
  }

  // A few leaves at a time catch the light and glint.
  for (const i of s.leaves) {
    const x = i % W;
    const y = (i / W) | 0;
    if (hash(x, y, tick) > 0.992) put(i, GOLD_PALE);
  }

  // Stream: ripples travel toward the viewer, cresting into bright highlights.
  for (const i of s.water) {
    const x = i % W;
    const y = (i / W) | 0;
    const flow = y * 0.9 - x * 0.35 + hash(x >> 1, 3) * 3;
    const w = Math.sin(flow * 0.9 - t * 3.2) + Math.sin(flow * 0.37 + x * 0.2 - t * 1.7) * 0.6;
    if (w > 1.25) put(i, FOAM);
    else if (w > 0.9) add(i, FOAM, 0.22);
    else if (w < -1.2) {
      frame[i * 4] *= 0.8;
      frame[i * 4 + 1] *= 0.85;
      frame[i * 4 + 2] *= 0.88;
    }
    if (hash(x, y, Math.floor(t * 8)) > 0.995) put(i, [235, 250, 255]);
  }

  // Mist drifts slowly through the clearing, dithered into soft bands.
  for (const i of s.mist) {
    const x = i % W;
    const y = (i / W) | 0;
    const n = vnoise(x * 0.045 + t * 0.12, y * 0.09 - t * 0.03) * 0.65 + vnoise(x * 0.11 - t * 0.2, y * 0.17) * 0.35;
    const k = Math.max(0, n - 0.45) * 1.6;
    if (k > bayer(x, y) * 0.5) add(i, MIST, 0.07 + k * 0.12);
  }

  // The ring pulses, its gold brightening and a halo breathing around it.
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
  for (const i of s.ringPx) add(i, GOLD_PALE, 0.15 + pulse * 0.35);
  for (const o of glowOffsets(18)) add((RING.y + o.dy) * W + RING.x + o.dx, GOLD, o.f * (0.06 + pulse * 0.08));

  // Gold dust rises in a slow spiral around the ring and fades out.
  for (const m of s.motes) {
    const life = (t * 0.12 * m.speed * 2 + m.phase) % 1;
    const a = m.a + t * m.speed;
    const X = Math.round(RING.x + Math.cos(a) * m.r * (1 - life * 0.4));
    const Y = Math.round(RING.y + 6 + Math.sin(a) * m.r * 0.5 - life * m.rise * 6);
    const k = Math.sin(life * Math.PI);
    if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
    add(Y * W + X, GOLD, 0.4 + k * 0.6);
  }

  // Leaves drift down from the canopy, swinging as they fall.
  for (const p of s.falling) {
    const span = H + 10;
    const fall = (p.y + t * p.vy) % span;
    const Y = Math.floor(fall) - 5;
    const sway = Math.sin(t * 1.4 + p.phase) * 5;
    const X = Math.floor(p.x + sway - fall * 0.18 + Math.sin(t * 0.2) * 4);
    if (X < 1 || X >= W - 1 || Y < 0 || Y >= H - 1) continue;
    const turn = Math.sin(t * 2.8 + p.phase * 3);
    const c = turn > 0.3 ? p.color : turn < -0.6 ? GOLD_PALE : AMBER;
    put(Y * W + X, c);
    if (p.big) put(Y * W + X + (turn > 0 ? 1 : -1), c);
  }

  // Fireflies wander over the undergrowth, blinking on and off.
  for (const f of s.flies) {
    const X = Math.round(f.x + Math.sin(t * f.sx + f.phase) * 16);
    const Y = Math.round(f.y + Math.sin(t * f.sy + f.phase * 2) * 9);
    const blink = Math.max(0, Math.sin(t * 1.1 + f.phase * 3));
    if (blink < 0.15 || X < 2 || Y < 2 || X >= W - 2 || Y >= H - 2) continue;
    put(Y * W + X, FIREFLY);
    for (const o of glowOffsets(3)) add((Y + o.dy) * W + X + o.dx, FIREFLY, o.f * blink * 0.3);
  }
}

export default function GoldenForest() {
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

  return <div ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "#07131a" }} />;
}
