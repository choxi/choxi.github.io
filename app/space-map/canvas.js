import React, { Suspense, useRef, useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import {
  render,
  events,
  unmountComponentAtNode,
  createRoot,
} from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";

import SelectiveUnrealBloom from "./selective-unreal-bloom";

const isBrowser = () => typeof window !== "undefined";

export default function Canvas({
  camera = [0, 0, 1],
  zoom = 1,
  size = { width: 800, height: 400 },
  orthographic = false,
  children,
  bloom = false,
  lookAt = [0, 0, 0],
  controls = false,
  bloomStrength = 2,
  fullscreen = false,
}) {
  const [inViewRef, inView] = useInView();
  const canvas = useRef();
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (isBrowser()) {
      setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    }
  }, []);

  useEffect(() => {
    const newChildren = (
      <group>
        {bloom && (
          <SelectiveUnrealBloom
            strength={bloomStrength}
            layers={[1]}
            play={inView}
          />
        )}
        {controls && <OrbitControls />}
        {children}
      </group>
    );

    createRoot(canvas.current)
      .configure({
        events,
        size: fullscreen ? screenSize : size,
        onCreated: ({ gl, camera }) => {
          gl.setClearColor(0x000000);
          gl.toneMapping = THREE.ReinhardToneMapping;
          camera.layers.enable(1);
          camera.lookAt(...lookAt);
        },
        dpr: isBrowser() ? window.devicePixelRatio : undefined,
        camera: { position: camera, zoom: zoom },
        orthographic: orthographic,
        alpha: true,
      })
      .render(<Suspense fallback={<group></group>}>{newChildren}</Suspense>);
  }, [camera, zoom, size, orthographic, children, inView, bloom, screenSize]);

  // unmount
  useEffect(() => {
    return () => {
      unmountComponentAtNode(canvas.current);
    };
  }, []);

  return (
    <div ref={inViewRef} className="canvas-wrapper">
      <canvas
        ref={canvas}
        className="canvas"
        style={{
          maxWidth: fullscreen ? screenSize.width : size.width,
          maxHeight: fullscreen ? screenSize.height : size.height,
        }}
      ></canvas>
    </div>
  );
}
