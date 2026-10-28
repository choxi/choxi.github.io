"use client";

import { useEffect, useRef } from "react";

// Full-viewport WebGL background: slow, soft domain-warped noise in violet,
// teal and blue on near-black.

const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
out vec4 outColor;

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Two soft octaves instead of fbm: broad forms, no marbled veins.
float soft(vec3 p) {
  return 0.75 * snoise(p) + 0.25 * snoise(p * 2.0 + 11.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  // Scale by the long side so portrait phones see as much color as desktops.
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / max(u_res.x, u_res.y) * 0.8;
  float t = u_time * 0.025;

  vec2 q = vec2(soft(vec3(p, t)), soft(vec3(p + vec2(5.2, 1.3), t)));
  vec2 r = vec2(
    soft(vec3(p + 0.7 * q + vec2(1.7, 9.2), t * 1.2)),
    soft(vec3(p + 0.7 * q + vec2(8.3, 2.8), t * 1.2))
  );
  float f = 0.5 + 0.75 * soft(vec3(p + 0.6 * r, t * 0.7));

  vec3 ink = vec3(0.025, 0.035, 0.07);
  vec3 violet = vec3(0.16, 0.10, 0.30);
  vec3 lagoon = vec3(0.08, 0.42, 0.44);
  vec3 seafoam = vec3(0.42, 0.78, 0.68);

  vec3 col = mix(ink, violet, smoothstep(-0.2, 0.5, f));
  // Let the warp vector pick between teal and blue so hues drift apart.
  vec3 cool = mix(lagoon, vec3(0.12, 0.22, 0.52), smoothstep(0.0, 0.6, r.x));
  col = mix(col, cool, smoothstep(0.45, 0.9, f) * 0.8);
  col = mix(col, seafoam, smoothstep(0.82, 1.1, f) * 0.3);
  col *= 0.7 + 0.35 * uv.y;
  col += (hash12(gl_FragCoord.xy + fract(u_time * 7.13) * 431.0) - 0.5) * 0.03;
  outColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
  }
  return shader;
}

export default function NightMesh() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current!;
    // A fresh canvas per mount: a canvas whose WebGL context was lost can't
    // hand out a new one, which matters under StrictMode's double effects.
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.appendChild(canvas);

    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) return () => canvas.remove();

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);

    // One oversized triangle covers the viewport.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");

    // The image is soft, so rendering at 1x keeps it cheap without visible loss.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      if (reduceMotion) draw(start);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    if (!reduceMotion) {
      // The motion is slow enough that 30fps looks identical and saves battery.
      let last = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (document.hidden || now - last < 32) return;
        last = now;
        draw(now);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, []);

  return <div ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "#06090f" }} />;
}
