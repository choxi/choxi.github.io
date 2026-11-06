"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

// A card whose rim refracts the scene behind it, like the edge of a thick
// glass slab: the backdrop bends inward near the border and splits slightly
// into its colours. Modelled on the rim lens from Glasswork
// (github.com/kubai087/glasswork, lens.js), rewritten here rather than loaded
// from a CDN.
//
// An SVG displacement map drives the bend through `backdrop-filter: url(#…)`.
// Only Chromium draws that; elsewhere the card keeps its CSS-only glass. The
// card's CSS must end its backdrop-filter with `var(--glass-lens,)`.

const RIM = 40; // widest the rim gets, in CSS px
const EDGE = 1.1; // how far inward the outer edge samples, in rim widths
const POWER = 2.6; // falloff of the bend across the rim
const DISPERSION = 0.15; // red bends this much further, blue this much less

const SVG = "http://www.w3.org/2000/svg";

const lensSupported = () =>
  typeof CSS !== "undefined" &&
  CSS.supports("backdrop-filter", "url(#a)") &&
  /Chrome\//.test(navigator.userAgent) &&
  !/Firefox\//.test(navigator.userAgent);

// Displacement map for a rounded rectangle: red is the sideways bend, green
// the vertical one, 128 for none. Only the rim bends; the middle stays flat.
function lensMap(width: number, height: number, radius: number, rim: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const d = image.data;
  const hx = width / 2;
  const hy = height / 2;
  const r = Math.min(radius, hx, hy);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - hx;
      const py = y + 0.5 - hy;
      // Signed distance to the rounded rectangle's outline (negative inside).
      const qx = Math.abs(px) - (hx - r);
      const qy = Math.abs(py) - (hy - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const dist = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
      const depth = -dist / rim; // 0 at the outline, 1 at the rim's inner edge
      let dx = 0;
      let dy = 0;
      if (depth < 1) {
        const strength = (1 - Math.max(0, depth)) ** POWER;
        // Inward normal: toward the corner's centre on the curves, straight
        // in along the sides.
        let nx = 0;
        let ny = 0;
        if (qx > 0 && qy > 0) {
          const len = Math.hypot(qx, qy) || 1;
          nx = qx / len;
          ny = qy / len;
        } else if (qx > qy) nx = 1;
        else ny = 1;
        dx = -Math.sign(px) * nx * strength;
        dy = -Math.sign(py) * ny * strength;
      }
      const i = (y * width + x) * 4;
      d[i] = Math.round(128 + dx * 127);
      d[i + 1] = Math.round(128 + dy * 127);
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

let filterCount = 0;

const node = (tag: string, attrs: Record<string, string | number>, parent?: Element) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.append(el);
  return el;
};

// The backdrop is displaced once per colour channel, each by its own share of
// the bend, and the three are added back together.
function buildFilter(width: number, height: number, map: string, rim: number) {
  const id = `glass-lens-${++filterCount}`;
  const host = node("svg", {
    "aria-hidden": "true",
    width: 0,
    height: 0,
    style: "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none",
  });
  const filter = node(
    "filter",
    { id, filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB", x: 0, y: 0, width, height },
    host,
  );
  node("feImage", { href: map, x: 0, y: 0, width, height, preserveAspectRatio: "none", result: "map" }, filter);
  const scale = 2 * EDGE * rim;
  ["r", "g", "b"].forEach((name, channel) => {
    node(
      "feDisplacementMap",
      {
        in: "SourceGraphic",
        in2: "map",
        xChannelSelector: "R",
        yChannelSelector: "G",
        scale: (scale * (1 + (1 - channel) * DISPERSION)).toFixed(1),
      },
      filter,
    );
    const keep = Array.from({ length: 20 }, (_, cell) => Number(cell === channel * 6 || cell === 18)).join(" ");
    node("feColorMatrix", { type: "matrix", values: keep, result: name }, filter);
  });
  node("feBlend", { in: "r", in2: "g", mode: "screen" }, filter);
  node("feBlend", { in2: "b", mode: "screen" }, filter);
  document.body.append(host);
  return { id, host };
}

// Gives an element the refracting rim: builds a lens filter to fit it and
// sets --glass-lens on it, rebuilding when it resizes (including when it
// first appears, e.g. a dialog opening). Its CSS must end its backdrop-filter
// with `var(--glass-lens,)`.
export function useGlassLens(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !lensSupported()) return;
    let current: { id: string; host: Element; key: string } | null = null;
    let timer = 0;

    const fit = () => {
      const width = Math.round(el.offsetWidth);
      const height = Math.round(el.offsetHeight);
      const radius = Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
      const rim = Math.round(Math.max(4, Math.min(RIM, Math.min(width, height) / 3.5)));
      const key = `${width}x${height}:${radius}:${rim}`;
      if (current?.key === key || width < 32 || height < 32) return;
      const next = { ...buildFilter(width, height, lensMap(width, height, radius, rim), rim), key };
      el.style.setProperty("--glass-lens", `url(#${next.id})`);
      // Let the new filter draw before the old one goes.
      const old = current;
      if (old) requestAnimationFrame(() => requestAnimationFrame(() => old.host.remove()));
      current = next;
    };

    // Rebuild once the card has stopped resizing.
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(fit, current ? 120 : 0);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
      el.style.removeProperty("--glass-lens");
      current?.host.remove();
    };
  }, [ref]);
}

export default function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGlassLens(ref);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
