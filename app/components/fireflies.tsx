"use client";

import { useEffect, useRef } from "react";

// The landing scene's pixel grid (see moon-falls.tsx).
const SCENE_W = 455;
const SCENE_H = 256;

// Pixel fireflies, like the ones in the landing scene (moon-falls.tsx): single
// bright pixels with a small stepped glow, wandering slowly and blinking.
//
// They draw on a canvas that fills its parent. Their pixel size matches the
// landing scene's grid: `grid` "cover" sizes it as the full-screen scene,
// "width" as a strip spanning the page; or `pixel` sets it outright, to share
// a grid with other pixel art (the plants at the bottom of posts). `zone`
// keeps them to a band of the canvas (fractions of its height).
//
// They pause while off screen or in a background tab, and hold still for
// people who prefer reduced motion.

type RGB = [number, number, number];
const COLORS: RGB[] = [
  [170, 255, 190],
  [210, 255, 150],
  [150, 240, 255],
];
const FPS_INTERVAL = 1000 / 20;
// Stepped glow around each firefly: [dx, dy, strength].
const GLOW: [number, number, number][] = [
  [-1, 0, 0.55], [1, 0, 0.55], [0, -1, 0.55], [0, 1, 0.55],
  [-1, -1, 0.25], [1, -1, 0.25], [-1, 1, 0.25], [1, 1, 0.25],
  [-2, 0, 0.2], [2, 0, 0.2], [0, -2, 0.2], [0, 2, 0.2],
];

type Fly = { x: number; y: number; phase: number; sx: number; sy: number; color: RGB };

type Props = {
  count?: number;
  zone?: [number, number];
  grid?: "cover" | "width";
  // Keep most flies in the outer edges (fraction of the width on each side),
  // where a centred sheet won't cover them.
  edges?: number;
  pixel?: number;
  className?: string;
};

export default function Fireflies({ count = 20, zone = [0, 1], grid = "width", edges, pixel, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [z0, z1] = zone;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let flies: Fly[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let visible = true;

    // Fit the canvas to its box on the scene's pixel grid, and scatter the
    // flies across it (positions are fractions, so a resize keeps the spread).
    const fit = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const px = pixel ?? (grid === "cover" ? Math.max(box.width / SCENE_W, box.height / SCENE_H) : box.width / SCENE_W);
      w = Math.ceil(box.width / px);
      h = Math.ceil(box.height / px);
      canvas.width = w;
      canvas.height = h;
      if (!flies.length) {
        const pickX = () => {
          if (!edges || Math.random() < 0.15) return Math.random();
          const x = Math.random() * edges;
          return Math.random() < 0.5 ? x : 1 - x;
        };
        flies = Array.from({ length: count }, (_, n) => ({
          x: pickX(),
          y: z0 + Math.random() * (z1 - z0),
          phase: (n * 2.39996) % 6.283, // golden-angle spread, so blinks don't sync
          sx: 0.15 + Math.random() * 0.35,
          sy: 0.2 + Math.random() * 0.4,
          color: COLORS[n % COLORS.length],
        }));
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const f of flies) {
        const X = Math.round(f.x * w + Math.sin(t * f.sx + f.phase) * 16);
        const Y = Math.round(f.y * h + Math.sin(t * f.sy + f.phase * 2) * 9);
        const blink = reduceMotion ? 0.8 : Math.max(0, Math.sin(t * 1.1 + f.phase * 3));
        if (blink < 0.15) continue;
        const [r, g, b] = f.color;
        for (const [dx, dy, k] of GLOW) {
          ctx.fillStyle = `rgb(${r} ${g} ${b} / ${k * blink * 0.8})`;
          ctx.fillRect(X + dx, Y + dy, 1, 1);
        }
        ctx.fillStyle = `rgb(${r} ${g} ${b} / ${0.5 + blink * 0.5})`;
        ctx.fillRect(X, Y, 1, 1);
      }
    };

    const start = performance.now();
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

    if (!reduceMotion) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
    };
  }, [count, z0, z1, grid, edges, pixel]);

  return <canvas ref={ref} className={["fireflies", className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
