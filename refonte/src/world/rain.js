// Rain: N streaks as ONE LineSegments draw call. Positions are animated in the vertex shader (falling, wrapping inside a box that
// follows the camera target), so the CPU does nothing per frame but set three uniforms.

import * as THREE from 'three';

export function buildRain(count) {
  const pos = new Float32Array(count * 2 * 3);
  const seed = new Float32Array(count * 2 * 4);
  let s = 12345;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const a = [rnd(), rnd(), rnd(), 0.8 + rnd() * 0.5];
    for (let e = 0; e < 2; e++) {
      pos.set([0, e, 0], (i * 2 + e) * 3);
      seed.set(a, (i * 2 + e) * 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uAmount: { value: 0 },
    uColor: { value: new THREE.Color('#c8d4e8') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 seed;
      uniform float uTime; uniform vec3 uCenter; uniform float uAmount;
      varying float vA;
      void main() {
        float H = 9.0;
        vec3 p = uCenter + vec3( ( seed.x - 0.5 ) * 26.0, 0.0, ( seed.y - 0.5 ) * 22.0 - 2.0 );
        float y = mod( seed.z * H - uTime * 9.0 * seed.w, H );
        p.y += y - 0.3;
        p.y += position.y * 0.45;
        p.x += position.y * 0.06;
        vA = step( seed.z, uAmount ) * ( 0.25 + 0.5 * position.y );
        gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vA;
      void main() { if ( vA <= 0.0 ) discard; gl_FragColor = vec4( uColor, vA * 0.55 ); }`,
  });
  const mesh = new THREE.LineSegments(g, mat);
  mesh.frustumCulled = false;
  mesh.name = 'rain';
  mesh.visible = false;
  return {
    mesh,
    uniforms,
    count,
    dispose() {
      g.dispose();
      mat.dispose();
    },
  };
}
