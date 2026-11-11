// Post-processing per quality tier (vendor/three/postprocessing):
//   low  : none (the renderer draws to the screen, tone mapping included)
//   mid  : scene (no MSAA) -> bloom -> output (tone mapping + sRGB)
//   high : scene (MSAA x4 render target) -> bloom -> output -> "finish" pass (tilt-shift blur at the top and bottom + colour grade)
// (2026-11-10: the "ultra" chain - GTAO, SMAA, depth of field - was removed with the ultra tier, at the owner's request.)
// The bloom works at half resolution (UnrealBloomPass halves internally). The sprites in focus are never blurred.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinishShader = () => ({
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uBlur: { value: 3.5 },
    uGrade: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uBlur; uniform vec3 uGrade; uniform float uSat;
    varying vec2 vUv;
    void main() {
      // tilt-shift: blur grows toward the top and the bottom of the screen (top a bit more: farther away)
      float dy = vUv.y - 0.47;
      float k = smoothstep( 0.16, 0.5, abs( dy ) ) * ( dy > 0.0 ? 1.0 : 0.75 );
      float r = k * uBlur;
      vec4 c = texture2D( tDiffuse, vUv );
      if ( r > 0.05 ) {
        vec2 px = r / uRes;
        vec4 acc = c * 2.0;
        float wsum = 2.0;
        const int N = 10;
        for ( int i = 0; i < N; i ++ ) {
          float a = float( i ) * 2.39996;
          float rr = sqrt( ( float( i ) + 0.5 ) / float( N ) );
          vec2 o = vUv + vec2( cos( a ), sin( a ) ) * rr * px;
          acc += texture2D( tDiffuse, o ); wsum += 1.0;
        }
        c = acc / wsum;
      }
      vec3 g = c.rgb * uGrade;
      float l = dot( g, vec3( 0.299, 0.587, 0.114 ) );
      g = mix( vec3( l ), g, uSat );
      gl_FragColor = vec4( clamp( g, 0.0, 1.0 ), 1.0 );
    }`,
});

/**
 * @param {THREE.WebGLRenderer} renderer   @param {object} tier one of data/params.js TIERS
 * @returns {null | { render(), setSize(w, h, pr), set({bloom, grade, sat, blur}), dispose(), extraBytesPerPx, passes }}
 */
export function createPost(renderer, scene, camera, tier, w, h) {
  if (!tier.post) return null;
  const pr = renderer.getPixelRatio();
  const W = Math.round(w * pr);
  const H = Math.round(h * pr);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: tier.msaa || 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.55, 0.82);
  composer.addPass(bloom);
  const output = new OutputPass();
  output.material.depthTest = false;
  output.material.depthWrite = false;
  composer.addPass(output);
  let finish = null;
  if (tier.tilt) {
    finish = new ShaderPass(FinishShader());
    finish.material.depthTest = false;
    finish.material.depthWrite = false;
    composer.addPass(finish);
  }
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  const setRes = (ww, hh, p) => finish && finish.uniforms.uRes.value.set(ww * p, hh * p);
  setRes(w, h, pr);
  return {
    composer,
    passes: composer.passes.map((p) => p.constructor.name),
    extraBytesPerPx: 0, // (the ultra chain's extra targets are gone; kept for the GPU memory estimate of app/hooks.js)
    render(dt) {
      composer.render(dt);
    },
    setSize(ww, hh, p) {
      composer.setPixelRatio(p);
      composer.setSize(ww, hh);
      setRes(ww, hh, p);
    },
    set({ bloom: b, grade, sat, blur }) {
      if (b !== undefined) bloom.strength = b;
      if (finish) {
        if (grade) finish.uniforms.uGrade.value.set(grade[0], grade[1], grade[2]);
        if (sat !== undefined) finish.uniforms.uSat.value = sat;
        if (blur !== undefined) finish.uniforms.uBlur.value = blur;
      }
    },
    dispose() {
      composer.dispose();
      bloom.dispose();
      rt.dispose();
      if (finish) finish.material.dispose();
    },
  };
}
