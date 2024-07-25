import * as THREE from 'three'
import React, { useRef, useMemo, useEffect } from 'react'
import { extend, useThree, useFrame } from '@react-three/fiber'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass";

extend({ EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, SMAAPass })

const vertexShader = `
varying vec2 vUv;

void main() {

  vUv = uv;

  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

}
`

const fragmentShader = `
uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;

varying vec2 vUv;

void main() {

  gl_FragColor = ( texture2D( baseTexture, vUv ) + texture2D( bloomTexture, vUv ) );

}
`

// SelectiveUnrealBloom
//
// Non-React implementation: // http://jsfiddle.net/oc04sk5v/3/
// This doesn't work because the bloom effect is always rendered in the background.
//
// Based off of official ThreeJS example:
// https://github.com/mrdoob/three.js/blob/dev/examples/webgl_postprocessing_unreal_bloom_selective.html
// Playground: https://codesandbox.io/s/unreal-selective-bloom-h0frd
//
// Recipes: https://github.com/pmndrs/react-three-fiber/blob/master/markdown/recipes.md
//
// TODO: Fix transparency issue: https://github.com/mrdoob/three.js/issues/14104
// Another implementation: https://codesandbox.io/s/r3f-selective-bloom-1bult
// Another great example: https://spectrum.chat/react-three-fiber/general/using-ssaopass~03a4bc56-56c9-4bc5-a397-4e3249c73ce1
export default function SelectiveUnrealBloom({
  layers,
  play = false,
  strength = 2,
}) {
  const { gl, scene, camera, size } = useThree()
  const composer = useRef()
  const finalComposer = useRef()
  const bloomPass = useRef()
  const bloomLayers = useMemo(() => {
    const l = new THREE.Layers()
    l.disableAll()
    layers.forEach(layer => l.enable(layer))
    return l
  }, [layers])

  useEffect(() => void composer.current.setSize(size.width, size.height), [size])
  useFrame(({ clock }) => {
    if (!play) {
      return
    }
    // const factor = ((Math.sin(clock.getElapsedTime()) + 1) / 2)
    // bloomPass.current.strength = factor * 2 + 5
    // bloomPass.current.radius = factor * 0.15 + 1
    scene.traverse(object => {
      if (object.isMesh && !bloomLayers.test(object.layers)) {
        object.material.colorWrite = false
      }
    })
    composer.current.renderToScreen = false;
    composer.current.render();
    scene.traverse(object => {
      if (object.isMesh) {
        object.material.colorWrite = true
      }
    })

    finalComposer.current.render()
  }, 1)

  const shaderArgs = (composer) => {
    return [ new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: composer.current?.renderTarget2.texture }
      },
      vertexShader,
      fragmentShader,
    }), "baseTexture"]
  }

  return (
    <>
      <effectComposer ref={composer} args={[gl]}>
        <renderPass attachArray="passes" args={[scene, camera]} />
        <unrealBloomPass ref={bloomPass} attachArray="passes" strength={strength} renderToScreen={false} />
      </effectComposer>
      <effectComposer ref={finalComposer} args={[gl]}>
        <renderPass attachArray="passes" args={[scene, camera]} />
        { composer.current && (
          <shaderPass attachArray="passes" args={shaderArgs(composer)} needsSwap={true} />
        )}
      </effectComposer>
    </>
  )
}

// Recipes: https://github.com/pmndrs/react-three-fiber/blob/master/markdown/recipes.md
function Camera(props) {
  const ref = useRef()
  const set = useThree(state => state.set)
  // Make the camera known to the system
  useEffect(() => void set({ camera: ref.current }), [])
  // Update it every frame
  useFrame(() => ref.current.updateMatrixWorld())
  return <perspectiveCamera ref={ref} {...props} />
}