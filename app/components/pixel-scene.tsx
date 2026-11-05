"use client";

import { useEffect, useRef } from "react";

// A still crop of the Moon Falls painting, on the same 455x256 pixel grid the
// landing page animates (see moon-falls.tsx), scaled up with crisp pixels.
// `rows` picks which rows of that grid to show, so one painting gives the
// night backdrop (all of it), the day theme's sky band and the footer strip.

export const SCENE_W = 455;
export const SCENE_H = 256;
const SRC = "/assets/moon-falls.webp";

// The painting is decoded and sampled down once, then shared.
let scene: Promise<HTMLCanvasElement> | null = null;
function loadScene() {
  scene ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = SCENE_W;
      canvas.height = SCENE_H;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, SCENE_W, SCENE_H);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = SRC;
  });
  return scene;
}

type Props = {
  rows?: [number, number];
  className?: string;
};

export default function PixelScene({ rows = [0, SCENE_H], className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [y0, y1] = rows;

  useEffect(() => {
    let cancelled = false;
    loadScene().then((source) => {
      const canvas = ref.current;
      if (cancelled || !canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, 0, y0, SCENE_W, y1 - y0, 0, 0, SCENE_W, y1 - y0);
      canvas.dataset.ready = "";
    });
    return () => {
      cancelled = true;
    };
  }, [y0, y1]);

  return <canvas ref={ref} width={SCENE_W} height={y1 - y0} className={["pixel-scene", className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
