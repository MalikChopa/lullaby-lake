// Grass and flowers around the view, ONE draw call each, whatever the size of the world: a fixed set of tufts scattered in a square
// window of side `win` metres; in the vertex shader each tuft jumps to its repetition nearest the view centre (so a blade never swims:
// the same world spot always gets the same tuft), reads the ground field texture (height, grass density, tall grass, flower beds) and
// is dropped where there is no grass. Two blade heights, colour variation, travelling gusts, the angler pushes the blades aside.
// MeshLambertMaterial patched: the sun, the shadows, the lamps, the fog and the cloud shadows light it like the rest of the world.

import * as THREE from 'three';
import { mulberry32 } from '../../../src/core/rng.js';
import { lin } from './geo.js';
import { shared, GLSL_CLOUD } from './shading.js';

/** Uniforms of the sway (shared by grass and flowers; J7 name kept). */
export const swayUniforms = {
  uTime: shared.uTime,
  uWind: shared.uWind,
  uPlayer: { value: new THREE.Vector3(0, -100, 0) },
  uCenter: { value: new THREE.Vector2() },
};

/** The ground field as a float texture: R = height, G = grass density, B = flower bed, A = tall grass. */
export function fieldTexture(F) {
  const data = new Float32Array(F.nx * F.nz * 4);
  for (let k = 0; k < F.nx * F.nz; k++) data.set([F.h[k], F.grass[k], F.flower[k], F.tall[k]], k * 4);
  const t = new THREE.DataTexture(data, F.nx, F.nz, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  t.userData = { x0: F.x0, z0: F.z0, cell: F.cell, nx: F.nx, nz: F.nz };
  return t;
}

/** GLSL: bilinear read of the field texture at a world point. */
export const GLSL_FIELD = /* glsl */ `
uniform sampler2D uField; uniform vec4 uFieldInfo; // x0, z0, cell, nx
uniform vec2 uFieldN;
vec4 fieldAt( vec2 p ) {
  vec2 f = clamp( ( p - uFieldInfo.xy ) / uFieldInfo.z, vec2( 0.0 ), uFieldN - 1.001 );
  ivec2 i = ivec2( floor( f ) ); vec2 u = fract( f );
  vec4 a = texelFetch( uField, i, 0 ); vec4 b = texelFetch( uField, i + ivec2( 1, 0 ), 0 );
  vec4 c = texelFetch( uField, i + ivec2( 0, 1 ), 0 ); vec4 d = texelFetch( uField, i + ivec2( 1, 1 ), 0 );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
`;

export function fieldUniforms(tex) {
  const I = tex.userData;
  return { uField: { value: tex }, uFieldInfo: { value: new THREE.Vector4(I.x0, I.z0, I.cell, I.nx) }, uFieldN: { value: new THREE.Vector2(I.nx, I.nz) } };
}

/** Tuft: 3 blades (5 vertices, 3 triangles each), 1 m tall (scaled per tuft), normals up, base darker than the tip. */
function tuftGeometry() {
  const pos = [];
  const col = [];
  const idx = [];
  const blades = [[0, 0, 0.0, 1.0], [0.07, 0.03, 2.1, 0.82], [-0.06, 0.05, 4.2, 0.9]];
  for (const [ox, oz, a, hk] of blades) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const w = 0.06;
    const lean = 0.12;
    const pts = [[-w, 0], [w, 0], [-w * 0.6, 0.45], [w * 0.6, 0.45], [0, 1]];
    const base = pos.length / 3;
    for (const [x, y] of pts) {
      const yy = y * hk;
      pos.push(ox + x * c + lean * y * s, yy, oz - x * s + lean * y * c);
      const k = 0.38 + 0.62 * y;
      col.push(k, k, k);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  return { pos, col, idx };
}

/** Flower: stem and a small square head (crossed quads), 0.32 m. */
function flowerGeometry() {
  const pos = [];
  const col = [];
  const idx = [];
  const quad = (a, b, c, d, k) => {
    const i = pos.length / 3;
    for (const p of [a, b, c, d]) {
      pos.push(...p);
      col.push(...k);
    }
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const stem = [0.35, 0.55, 0.3];
  quad([-0.012, 0, 0], [0.012, 0, 0], [0.012, 0.28, 0], [-0.012, 0.28, 0], stem);
  const s = 0.06;
  const y = 0.28;
  quad([-s, y - s, 0], [s, y - s, 0], [s, y + s, 0], [-s, y + s, 0], [1, 1, 1]);
  quad([0, y - s, -s], [0, y - s, s], [0, y + s, s], [0, y + s, -s], [1, 1, 1]);
  quad([-s, y, -s], [s, y, -s], [s, y, s], [-s, y, s], [1.15, 1.15, 1.15]);
  return { pos, col, idx };
}

const GRASS_TONES = ['#79c058', '#6ab450', '#8ccc62', '#9ac458', '#5ea84c', '#a8d06a', '#72b85a'].map((h) => lin(h));
const FLOWER_TONES = ['#ffd987', '#f08aa0', '#c9a0ff', '#fff3c4', '#ff9a6a', '#8ab8ff', '#ffffff'].map((h) => lin(h, 1.15));

function makeLayer(kind, count, win, fieldTex, seed) {
  const g = kind === 'grass' ? tuftGeometry() : flowerGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(g.pos.length / 3).fill([0, 1, 0]).flat(), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
  geo.setIndex(g.idx);
  const rng = mulberry32(seed);
  const a = new Float32Array(count * 4);
  const tone = new Float32Array(count * 3);
  const tones = kind === 'grass' ? GRASS_TONES : FLOWER_TONES;
  for (let i = 0; i < count; i++) {
    a.set([rng() * win, rng() * win, rng(), rng()], i * 4);
    const t = tones[Math.floor(rng() * tones.length)];
    const k = kind === 'grass' ? 0.85 + rng() * 0.3 : 1;
    tone.set([t[0] * k, t[1] * k, t[2] * k], i * 3);
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, 4));
  geo.setAttribute('aTone', new THREE.InstancedBufferAttribute(tone, 3));
  geo.instanceCount = count;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const fu = fieldUniforms(fieldTex);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, swayUniforms, fu, { uWin: { value: win } }, { uCloudOff: shared.uCloudOff, uCloudCover: shared.uCloudCover, uCloudShadow: shared.uCloudShadow, uWet: shared.uWet });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aSeed; attribute vec3 aTone;
        uniform float uTime; uniform float uWind; uniform vec3 uPlayer; uniform vec2 uCenter; uniform float uWin;
        varying vec3 vWP;
        ${GLSL_FIELD}`
      )
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb *= aTone;')
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
        // the repetition of this tuft nearest the view centre
        vec2 root = aSeed.xy + uWin * floor( ( uCenter - aSeed.xy ) / uWin + 0.5 );
        vec4 f = fieldAt( root );
        float edge = 1.0 - smoothstep( uWin * 0.36, uWin * 0.5, max( abs( root.x - uCenter.x ), abs( root.y - uCenter.y ) ) );
        ${
          kind === 'grass'
            ? `float keep = step( aSeed.z, f.g );
        float tall = step( aSeed.w, f.a );
        float hgt = mix( 0.34 + 0.18 * aSeed.w, 0.72 + 0.3 * aSeed.z, tall ) * keep * edge;`
            : `float keep = step( aSeed.z, f.b );
        float hgt = ( 0.8 + 0.5 * aSeed.w ) * keep * edge;`
        }
        float ang = aSeed.z * 37.0 + aSeed.w * 11.0;
        float ca = cos( ang ); float sa = sin( ang );
        transformed = vec3( transformed.x * ca - transformed.z * sa, transformed.y, transformed.x * sa + transformed.z * ca ) * vec3( ${kind === 'grass' ? '1.0 + aSeed.w * 0.6' : 'hgt'}, hgt, ${kind === 'grass' ? '1.0 + aSeed.w * 0.6' : 'hgt'} );
        float hk = clamp( position.y, 0.0, 1.0 ); hk *= hk;
        // travelling gusts + small flutter
        float ph = root.x * 0.35 + root.y * 0.22;
        float gust = sin( uTime * 0.9 - root.x * 0.08 - root.y * 0.05 );
        vec2 sway = vec2( sin( uTime * 1.3 + ph ) * 0.6 + 0.35 * sin( uTime * 2.7 + ph * 2.3 ) + gust * 0.9, 0.4 * cos( uTime * 1.1 + ph * 1.7 ) + gust * 0.3 );
        transformed.xz += sway * 0.07 * uWind * hk * ( 0.6 + hgt );
        vec2 away = root - uPlayer.xz;
        float dd = length( away );
        float push = ( 1.0 - smoothstep( 0.25, 0.9, dd ) ) * step( abs( f.r - uPlayer.y ), 0.6 );
        transformed.xz += normalize( away + vec2( 1e-4 ) ) * push * 0.25 * hk;
        transformed.y -= push * 0.15 * hk * hgt;
        transformed += vec3( root.x, f.r - 0.02, root.y );
        vWP = transformed;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec2 uCloudOff; uniform float uCloudCover; uniform float uCloudShadow; uniform float uWet;\nvarying vec3 vWP;\n${GLSL_CLOUD}`)
      .replace('void main() {', 'void main() {\nfloat llCloud = ll_cloudShade( vWP.xz, uCloudOff, uCloudCover, uCloudShadow );')
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= llCloud;'))
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.22 * uWet;');
  };
  mat.customProgramCacheKey = () => 'grass-' + kind;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = kind === 'grass' ? 'grass' : 'flowers';
  mesh.layers.set(1); // not drawn in the water reflection
  return mesh;
}

/**
 * @param {number} count tufts     @param {number} flowers flowers     @param {number} win window side (m)     @param {THREE.Texture} fieldTex
 * @returns {{ grass: THREE.Mesh, flowers: THREE.Mesh, dispose() }}
 */
export function buildGrass(count, flowers, win, fieldTex) {
  const grass = makeLayer('grass', count, win, fieldTex, 2026);
  const fm = makeLayer('flowers', flowers, win, fieldTex, 2027);
  grass.count = count;
  fm.count = flowers;
  return {
    grass,
    flowers: fm,
    dispose() {
      for (const m of [grass, fm]) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
