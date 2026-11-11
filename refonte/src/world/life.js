// J9-B: cheap atmosphere and life, each ONE draw call, built once with the static world (world/build.js) and driven by app/light.js:
//   - light shafts: a few additive slanted planes falling from a low sun (dawn, dusk) or through mist; high tier only
//     (logic/look.js shaftAmount / shaftPlan); hidden on low and mid, so they cost nothing there;
//   - lamp pools: soft stepped pools of warm light on the ground under every lamp, lantern and lit window (all tiers: on low, without
//     bloom or many point lights, they are what makes the night readable);
//   - butterflies by day over the flower beds (mid and up);
//   - a small flock of birds crossing the view now and then (dawn, day, dusk; mid and up), with their shadows left out (too small).
// Reduced motion: the shafts stay still, butterflies and birds are not drawn.

import * as THREE from 'three';
import { mulberry32 } from '../../../src/core/rng.js';
import { AREAS } from '../data/map.js';
import { SHAFTS } from '../data/params.js';
import { shaftPlan } from '../logic/look.js';

// ------------------------------------------------------------------ light shafts
function buildShafts() {
  const n = SHAFTS.count;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, -0.5, 0); // hangs down from its top edge (the top is up toward the sun)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uAmount: { value: 0 }, uColor: { value: new THREE.Color(1, 0.85, 0.6) }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vSeed;
      void main() {
        vUv = uv; vSeed = float( gl_InstanceID );
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount; uniform vec3 uColor; uniform float uTime;
      varying vec2 vUv; varying float vSeed;
      void main() {
        // soft sides, strong near the top (the light enters there), fading to nothing at the bottom; slow flicker of the dust
        float side = smoothstep( 0.0, 0.45, vUv.x ) * smoothstep( 1.0, 0.55, vUv.x );
        float fall = smoothstep( 0.05, 0.7, vUv.y ) * ( 0.4 + 0.6 * vUv.y );
        float flick = 0.8 + 0.2 * sin( uTime * 0.6 + vSeed * 2.3 + vUv.y * 3.0 );
        // stepped (pixel-art friendly) bands
        float a = floor( side * fall * flick * 6.0 ) / 6.0;
        gl_FragColor = vec4( uColor * a * uAmount * 0.16, 1.0 );
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'shafts';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 3;
  mesh.layers.set(1); // not in the water's mirror render
  mesh.userData.amount = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let lastKey = '';
  return {
    mesh,
    /** Places the planes around (cx, cz) for the light direction; only when the plan changes (cheap). */
    place(cx, cz, groundY, sunDir, camYaw) {
      // snap the centre to 4 m so the shafts stay put in the world while walking (no swimming), update on a new cell or a new sun
      const sx = Math.round(cx / 4) * 4;
      const sz = Math.round(cz / 4) * 4;
      const key = sx + ',' + sz + ',' + sunDir.map((v) => v.toFixed(2)).join(',') + ',' + camYaw.toFixed(2);
      if (key === lastKey) return;
      lastKey = key;
      const plan = shaftPlan(sx, sz, sunDir);
      plan.forEach((s, i) => {
        // each plane faces the camera's heading (a billboard turned around y) and leans along the light
        e.set(-s.tilt * 0.6, camYaw, 0, 'YXZ');
        q.setFromEuler(e);
        pos.set(s.x, groundY + s.h, s.z);
        sc.set(s.w, s.h, 1);
        m4.compose(pos, q, sc);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ lamp pools on the ground
function buildPools(lights, groundAt) {
  const list = lights.filter((l) => l.kind === 'lamp' || l.kind === 'lantern' || l.kind === 'window');
  const n = Math.max(1, list.length);
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const kind = new Float32Array(n);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLamp: { value: 0 }, uWin: { value: 0 }, uColor: { value: new THREE.Color(1, 0.72, 0.4) } },
    vertexShader: /* glsl */ `
      attribute float aKind; varying vec2 vUv; varying float vKind;
      void main() { vUv = uv; vKind = aKind; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uLamp; uniform float uWin; uniform vec3 uColor;
      varying vec2 vUv; varying float vKind;
      void main() {
        // pixel-stepped radial falloff, 16 px per metre on a pool of a few metres
        float r = length( vUv - 0.5 ) * 2.0;
        float k = vKind > 0.5 ? uWin : uLamp;
        float a = pow( max( 0.0, 1.0 - r ), 1.6 );
        a = floor( a * 5.0 + 0.5 ) / 5.0;
        gl_FragColor = vec4( uColor * a * k * 0.34, 1.0 );
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'lampPools';
  const m4 = new THREE.Matrix4();
  list.forEach((l, i) => {
    const r = l.kind === 'lamp' ? 6.5 : l.kind === 'lantern' ? 4.2 : 3.4;
    m4.makeScale(r, 1, r);
    m4.setPosition(l.x, groundAt(l.x, l.z) + 0.04, l.z);
    mesh.setMatrixAt(i, m4);
    kind[i] = l.kind === 'window' ? 1 : 0;
  });
  if (!list.length) mesh.count = 0;
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.visible = false;
  return { mesh, count: list.length };
}

// ------------------------------------------------------------------ butterflies over the flower beds
function buildButterflies(groundAt) {
  const beds = AREAS.filter((a) => a.kind === 'flowers' || a.kind === 'clearing');
  const rng = mulberry32(4242);
  const per = 3;
  const n = beds.length * per;
  const seeds = new Float32Array(n * 4);
  const base = new Float32Array(n * 3);
  const cols = ['#fff0a0', '#f6a0b8', '#a8c8ff', '#ffffff', '#ffb070'].map((h) => new THREE.Color(h));
  const colArr = new Float32Array(n * 3);
  beds.forEach((b, j) => {
    for (let k = 0; k < per; k++) {
      const i = j * per + k;
      const a = rng() * Math.PI * 2;
      const r = rng() * b.r * 0.7;
      const x = b.x + Math.cos(a) * r;
      const z = b.z + Math.sin(a) * r;
      base.set([x, groundAt(x, z) + 0.6, z], i * 3);
      seeds.set([rng(), rng(), rng(), b.r * 0.6], i * 4);
      const c = cols[Math.floor(rng() * cols.length)];
      colArr.set([c.r, c.g, c.b], i * 3);
    }
  });
  // two wings = two small quads hinged on the body (x = 0)
  const P = [];
  for (const sgn of [-1, 1]) {
    const w = 0.16 * sgn;
    P.push(0, 0, -0.06, w, 0, -0.07, w, 0, 0.06, 0, 0, -0.06, w, 0, 0.06, 0, 0, 0.05);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(colArr, 3));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uLight: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aBase; attribute vec4 aSeed; attribute vec3 aCol;
      uniform float uTime; uniform float uAmount; uniform float uLight;
      varying vec3 vCol;
      void main() {
        float t = uTime * ( 0.25 + 0.15 * aSeed.x ) + aSeed.y * 30.0;
        vec3 c = aBase + vec3( sin( t * 1.3 ) * aSeed.w, 0.25 * sin( t * 3.1 ) + 0.3 * aSeed.z, cos( t * 0.9 + aSeed.z * 5.0 ) * aSeed.w );
        float flap = 0.25 + 1.1 * abs( sin( uTime * ( 9.0 + 4.0 * aSeed.x ) + aSeed.y * 40.0 ) );
        vec3 p = position;
        float s = sign( p.x );
        p.y = abs( p.x ) * sin( flap ) * 1.0;
        p.x = s * abs( p.x ) * cos( flap );
        float heading = t * 1.3 + aSeed.y * 6.0;
        p.xz = mat2( cos( heading ), -sin( heading ), sin( heading ), cos( heading ) ) * p.xz;
        p *= step( aSeed.x, uAmount );
        vCol = aCol * uLight;
        gl_Position = projectionMatrix * viewMatrix * vec4( c + p, 1.0 );
      }`,
    fragmentShader: /* glsl */ `varying vec3 vCol; void main() { gl_FragColor = vec4( vCol, 1.0 ); }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'butterflies';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.layers.set(1);
  return { mesh };
}

// ------------------------------------------------------------------ birds crossing the view
function buildBirds() {
  const n = 7;
  const P = [];
  // a V: two thin wings from the body
  for (const sgn of [-1, 1]) P.push(0, 0, 0.05, 0.42 * sgn, 0, -0.06, 0.42 * sgn, 0, 0.04, 0, 0, 0.05, 0.42 * sgn, 0, 0.04, 0, 0, 0.14);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const off = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const row = Math.ceil(i / 2);
    const side = i === 0 ? 0 : i % 2 ? -1 : 1;
    off.set([side * row * 0.9, (i % 3) * 0.15, row * 0.8], i * 3);
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uAmount: { value: 0 }, uCol: { value: new THREE.Color('#2a2438') } },
    vertexShader: /* glsl */ `
      attribute vec3 aOff; uniform float uTime; uniform vec2 uCenter; uniform float uAmount;
      varying float vA;
      void main() {
        // one pass every 46 s: the flock crosses 70 m in ~14 s, then nothing; the heading changes from pass to pass
        float cyc = floor( uTime / 46.0 );
        float ph = fract( uTime / 46.0 ) * 46.0;
        float ang = fract( sin( cyc * 91.7 ) * 4375.85 ) * 6.2832;
        vec2 dir = vec2( cos( ang ), sin( ang ) );
        vec2 side = vec2( -dir.y, dir.x );
        float along = -35.0 + ph * 5.0;
        vec2 c = uCenter + dir * along + side * ( fract( sin( cyc * 13.1 ) * 977.3 ) - 0.5 ) * 16.0;
        vec3 p = position;
        float flap = sin( uTime * 7.0 + aOff.z * 2.0 ) * 0.5;
        p.y = abs( p.x ) * flap;
        p.xz += aOff.xz;
        p.y += aOff.y;
        // turn the V to fly along dir (the V points along +z)
        vec2 d = dir;
        p.xz = vec2( p.x * d.y + p.z * d.x, -p.x * d.x + p.z * d.y );
        vec3 w = vec3( c.x, 9.0 + aOff.y * 3.0, c.y ) + p;
        vA = step( ph, 14.0 ) * uAmount;
        gl_Position = projectionMatrix * viewMatrix * vec4( w * step( 0.001, vA ) + vec3( 0.0, -999.0, 0.0 ) * ( 1.0 - step( 0.001, vA ) ), 1.0 );
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uCol; varying float vA; void main() { if ( vA <= 0.001 ) discard; gl_FragColor = vec4( uCol, 1.0 ); }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'birds';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.layers.set(1);
  return { mesh };
}

/**
 * @param {Array} lights the light sources of the static world (kind lamp | lantern | window | spirit)
 * @param {(x:number, z:number) => number} groundAt ground / deck height
 */
export function buildLife(lights, groundAt) {
  const shafts = buildShafts();
  const pools = buildPools(lights, groundAt);
  const butterflies = buildButterflies(groundAt);
  const birds = buildBirds();
  const group = new THREE.Group();
  group.name = 'life';
  group.add(shafts.mesh, pools.mesh, butterflies.mesh, birds.mesh);
  return { group, shafts, pools, butterflies, birds };
}
