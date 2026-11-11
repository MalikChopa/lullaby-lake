// Small living things, each ONE draw call of square pixel points:
//   fireflies at dusk and night (glowing, bloom), dust motes in the daylight, chimney smoke, footstep dust (reduced motion: none).
// Fireflies and motes live in a window around the view (like the grass) and sit at the ground height of the field texture.

import * as THREE from 'three';
import { mulberry32 } from '../../../src/core/rng.js';
import { GLSL_FIELD, fieldUniforms } from './grass.js';

function points(count, attrs, uniforms, vs, fs, blending = THREE.AdditiveBlending) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  for (const [name, size, arr] of attrs) g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending });
  const m = new THREE.Points(g, mat);
  m.frustumCulled = false;
  m.layers.set(1);
  return m;
}

const PIXEL_FS = /* glsl */ `
  varying vec4 vC;
  void main() { if ( vC.a <= 0.003 ) discard; gl_FragColor = vC; }`;

/**
 * Fireflies + motes in one builder (two meshes).
 * @param {number} nFly @param {number} nMote @param {THREE.Texture} fieldTex
 */
export function buildCritters(nFly, nMote, fieldTex) {
  const rng = mulberry32(99);
  const mk = (n, win, kind) => {
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seed.set([rng() * win, rng() * win, rng(), rng()], i * 4);
    const uniforms = {
      ...fieldUniforms(fieldTex),
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2() },
      uWin: { value: win },
      uAmount: { value: 0 },
      uPx: { value: 1 },
      uColor: { value: new THREE.Color(kind === 'fly' ? '#d8ff7a' : '#fff4d0') },
    };
    const vs = /* glsl */ `
      attribute vec4 seed;
      uniform float uTime; uniform vec2 uCenter; uniform float uWin; uniform float uAmount; uniform float uPx; uniform vec3 uColor;
      varying vec4 vC;
      ${GLSL_FIELD}
      void main() {
        vec2 root = seed.xy + uWin * floor( ( uCenter - seed.xy ) / uWin + 0.5 );
        float t = uTime * ${kind === 'fly' ? '0.35' : '0.12'} + seed.z * 40.0;
        root += vec2( sin( t * 1.3 + seed.w * 9.0 ), cos( t * 1.1 + seed.z * 7.0 ) ) * ${kind === 'fly' ? '1.2' : '2.0'};
        vec4 f = fieldAt( root );
        float y = max( f.r, 0.0 ) + ${kind === 'fly' ? '0.35 + 1.4 * seed.w + 0.3 * sin( t * 2.3 )' : '0.6 + 2.6 * seed.w + 0.2 * sin( t )'};
        vec4 mv = modelViewMatrix * vec4( root.x, y, root.y, 1.0 );
        gl_Position = projectionMatrix * mv;
        float edge = 1.0 - smoothstep( uWin * 0.35, uWin * 0.5, max( abs( root.x - uCenter.x ), abs( root.y - uCenter.y ) ) );
        ${
          kind === 'fly'
            ? `float blink = smoothstep( 0.2, 0.9, sin( uTime * ( 1.5 + seed.z * 2.0 ) + seed.w * 30.0 ) );
        float on = step( seed.z, uAmount ) * ( 0.25 + 0.6 * f.g + 0.6 * f.b + 0.4 * step( f.r, 0.05 ) );
        vC = vec4( uColor * ( 1.6 + 2.2 * blink ), clamp( on * blink * edge, 0.0, 1.0 ) );
        gl_PointSize = uPx * ( 2.0 + blink );`
            : `float on = step( seed.z, uAmount );
        vC = vec4( uColor, on * edge * ( 0.35 + 0.35 * sin( t * 5.0 + seed.w * 20.0 ) ) );
        gl_PointSize = uPx * 1.5;`
        }
      }`;
    const m = points(n, [['seed', 4, seed]], uniforms, vs, PIXEL_FS);
    m.name = kind === 'fly' ? 'fireflies' : 'motes';
    return { mesh: m, uniforms };
  };
  const fly = mk(nFly, 34, 'fly');
  const mote = mk(nMote, 26, 'mote');
  return {
    fly,
    mote,
    meshes: [fly.mesh, mote.mesh],
    dispose() {
      for (const m of [fly.mesh, mote.mesh]) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}

/** Chimney smoke: `per` puffs per chimney rising, swelling and fading, drifting with the wind. */
export function buildSmoke(chimneys, per) {
  const n = chimneys.length * per;
  const seed = new Float32Array(n * 4);
  const rng = mulberry32(5);
  chimneys.forEach(([x, y, z], c) => {
    for (let i = 0; i < per; i++) seed.set([x, y, z, i / per + rng() * 0.05], (c * per + i) * 4);
  });
  const uniforms = { uTime: { value: 0 }, uAmount: { value: 1 }, uPx: { value: 1 }, uColor: { value: new THREE.Color('#e8e4ec') }, uWindDir: { value: new THREE.Vector2(0.6, -0.2) } };
  const vs = /* glsl */ `
    attribute vec4 seed;
    uniform float uTime; uniform float uAmount; uniform float uPx; uniform vec3 uColor; uniform vec2 uWindDir;
    varying vec4 vC;
    void main() {
      float a = fract( uTime * 0.12 + seed.w );
      vec3 p = seed.xyz + vec3( uWindDir.x * a * 2.2 + 0.15 * sin( a * 9.0 + seed.w * 20.0 ), a * 3.2, uWindDir.y * a * 2.2 );
      vec4 mv = modelViewMatrix * vec4( p, 1.0 );
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uPx * ( 4.0 + a * 14.0 ) * ( 22.0 / -mv.z );
      vC = vec4( uColor, uAmount * 0.4 * ( 1.0 - a ) * smoothstep( 0.0, 0.08, a ) );
    }`;
  const m = points(n, [['seed', 4, seed]], uniforms, vs, PIXEL_FS, THREE.NormalBlending);
  m.name = 'smoke';
  return { mesh: m, uniforms, dispose: () => (m.geometry.dispose(), m.material.dispose()) };
}

/** Footstep dust: a small pool of puffs written by the CPU when the angler walks on dirt (reduced motion: never spawned). */
export function buildDust(n = 24) {
  const pos = new Float32Array(n * 3);
  const life = new Float32Array(n);
  const uniforms = { uPx: { value: 1 }, uColor: { value: new THREE.Color('#d8c0a0') } };
  const vs = /* glsl */ `
    attribute float life;
    uniform float uPx; uniform vec3 uColor;
    varying vec4 vC;
    void main() {
      vec4 mv = modelViewMatrix * vec4( position + vec3( 0.0, ( 1.0 - life ) * 0.35, 0.0 ), 1.0 );
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uPx * ( 3.0 + ( 1.0 - life ) * 8.0 ) * ( 22.0 / -mv.z );
      vC = vec4( uColor, 0.55 * life );
    }`;
  const m = points(n, [['life', 1, life]], uniforms, vs, PIXEL_FS, THREE.NormalBlending);
  m.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.name = 'dust';
  let next = 0;
  return {
    mesh: m,
    uniforms,
    spawn(x, y, z) {
      pos.set([x + (Math.random() - 0.5) * 0.2, y + 0.05, z + (Math.random() - 0.5) * 0.2], next * 3);
      life[next] = 1;
      next = (next + 1) % n;
      m.geometry.attributes.position.needsUpdate = true;
    },
    step(dt) {
      let any = false;
      for (let i = 0; i < n; i++)
        if (life[i] > 0) {
          life[i] = Math.max(0, life[i] - dt * 1.8);
          any = true;
        }
      if (any) m.geometry.attributes.life.needsUpdate = true;
      m.visible = any;
    },
    dispose: () => (m.geometry.dispose(), m.material.dispose()),
  };
}
