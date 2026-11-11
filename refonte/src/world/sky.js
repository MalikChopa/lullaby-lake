// Sky dome: gradient from the horizon to the top (from logic/daylight.js), sun disc and glow, moon disc, stars at night (hidden by
// clouds and rain), a soft moving cloud layer. The same GLSL function colours the dome AND the lake's reflection (the 45-degree camera
// mostly sees the sky in the water). Pixelated directions for the pixel look. One draw call.

import * as THREE from 'three';
import { GLSL_CLOUD } from './shading.js';

export const skyUniforms = {
  uSkyTop: { value: new THREE.Color('#5aa0e8') },
  uSkyHor: { value: new THREE.Color('#cfe8f4') },
  uSkySun: { value: new THREE.Vector3(0, 1, 0) },
  uSkySunCol: { value: new THREE.Color(1, 1, 1) },
  uSkyBody: { value: 1 }, // 1 = sun, -1 = moon, 0 = none
  uSkyDiscs: { value: 1 },
  uSkyStars: { value: 0 },
  uSkyClouds: { value: 0.1 },
  uSkyCloudCol: { value: new THREE.Color(1, 1, 1) },
  uSkyTime: { value: 0 },
};

export const GLSL_SKY = /* glsl */ `
uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform vec3 uSkySun; uniform vec3 uSkySunCol; uniform float uSkyBody; uniform float uSkyDiscs;
uniform float uSkyStars; uniform float uSkyClouds; uniform vec3 uSkyCloudCol; uniform float uSkyTime;
#ifndef LL_CLOUD
${GLSL_CLOUD.replace(/ll_/g, 'sk_')}
#endif
vec3 skyColor( vec3 d, float discs ) {
  float e = clamp( d.y, 0.0, 1.0 );
  vec3 c = mix( uSkyHor, uSkyTop, pow( e, 0.6 ) );
  // stars: sparse pixels on a direction grid, twinkling
  vec2 sp = floor( d.xz / ( d.y + 0.35 ) * 90.0 );
  float h = sk_hash( sp );
  float star = step( 0.985, h ) * ( 0.6 + 0.4 * sin( uSkyTime * 2.0 + h * 50.0 ) ) * smoothstep( 0.05, 0.3, e );
  c += vec3( 0.95, 0.95, 1.0 ) * star * uSkyStars;
  // sun or moon
  float cosA = dot( d, normalize( uSkySun ) );
  if ( uSkyBody > 0.5 ) {
    c += uSkySunCol * ( smoothstep( 0.9994, 0.9997, cosA ) * 2.5 + pow( max( cosA, 0.0 ), 60.0 ) * 0.35 ) * uSkyDiscs * discs;
  } else if ( uSkyBody < -0.5 ) {
    float disc = smoothstep( 0.9993, 0.9996, cosA );
    c = mix( c, vec3( 0.95, 0.94, 0.86 ) * 1.6, disc * uSkyDiscs * discs );
    c += vec3( 0.6, 0.65, 0.9 ) * pow( max( cosA, 0.0 ), 200.0 ) * 0.25 * uSkyDiscs;
  }
  // clouds on a plane above: soft fbm, drifting
  vec2 cp = d.xz / ( d.y + 0.12 ) * 2.2 + vec2( uSkyTime * 0.012, uSkyTime * 0.004 );
  float n = sk_fbm( cp );
  float m = smoothstep( 1.0 - uSkyClouds - 0.15, 1.0 - uSkyClouds + 0.25, n ) * smoothstep( 0.0, 0.15, e );
  vec3 cc = uSkyCloudCol * ( 0.85 + 0.25 * sk_noise( cp * 3.0 ) );
  c = mix( c, cc, m * 0.9 );
  return c;
}
`;

export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position = p.xyww; // on the far plane
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${GLSL_SKY}
      void main() {
        vec3 d = normalize( vDir );
        d = normalize( floor( d * 220.0 ) / 220.0 ); // pixel look
        gl_FragColor = vec4( skyColor( d, 1.0 ), 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms: skyUniforms };
}
