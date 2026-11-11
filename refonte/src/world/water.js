// Stylised lake: one plane, one shader. Gentle animated waves (normals only), the SKY DOME reflected by Fresnel (stars, moon, clouds
// show in the lake), shallow tint and soft foam at the shore (depth read from the ground field texture), foam rings round the piles,
// sun / moon glitter, the reflections of the nearby lamps stretched toward the camera, the shadows of the decks and of the boat (cast
// along the real sun direction), float ripples and rain rings. (The planar reflection of the ultra tier was removed with that tier on 2026-11-10.)
// Snapped to the 16 px per metre grid for a pixel look.

import * as THREE from 'three';
import { WATER_Y, TEXEL } from '../data/params.js';
import { LAKE } from '../data/map.js';
import { GLSL_FIELD, fieldUniforms } from './grass.js';
import { GLSL_SKY, skyUniforms } from './sky.js';

export const MAX_RIPPLES = 4;
export const MAX_LAMPS = 4;
/** J9-B: sprites whose shadow falls on the water (angler, cat, villagers near the shore), set each frame by app/light.js. */
export const MAX_SPRITE_SHADOWS = 8;
const MAX_PILES = 48;
const MAX_SHADOWS = 12;

export function buildWater(fieldTex, piles, deckShadows) {
  const pileArr = Array.from({ length: MAX_PILES }, (_, i) => (piles[i] ? new THREE.Vector2(piles[i][0], piles[i][1]) : new THREE.Vector2(1e4, 1e4)));
  const sh = Array.from({ length: MAX_SHADOWS }, (_, i) => {
    const d = deckShadows[i];
    return d ? new THREE.Vector4(d.x0, d.z0, d.x1, d.z1) : new THREE.Vector4(1e4, 1e4, 1e4, 1e4);
  });
  const shY = Array.from({ length: MAX_SHADOWS }, (_, i) => (deckShadows[i] ? deckShadows[i].y + 0.05 : 0));
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uSky: { value: new THREE.Color('#f6ac8c') },
      uDeep: { value: new THREE.Color('#3d3784') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSunI: { value: 1 },
      uLamps: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, -100, 0, 0)) },
      uLampColor: { value: new THREE.Color('#ffc870') },
      uRain: { value: 0 },
      uWave: { value: 1 },
      uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 99, 0)) },
      uPiles: { value: pileArr },
      uShadows: { value: sh },
      uShadowY: { value: shY },
      uShadowK: { value: 0.5 },
      uSkyMix: { value: 0.75 },
      uSprites: { value: Array.from({ length: MAX_SPRITE_SHADOWS }, () => new THREE.Vector4(1e4, 1e4, 0, 0)) },
      uFishRings: { value: 0 },
    },
  ]);
  Object.assign(uniforms, fieldUniforms(fieldTex), skyUniforms);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uSky; uniform vec3 uDeep; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI;
      uniform vec4 uLamps[ ${MAX_LAMPS} ]; uniform vec3 uLampColor; uniform float uRain; uniform float uWave;
      uniform vec4 uRipples[ ${MAX_RIPPLES} ];
      uniform vec2 uPiles[ ${MAX_PILES} ];
      uniform vec4 uShadows[ ${MAX_SHADOWS} ]; uniform float uShadowY[ ${MAX_SHADOWS} ]; uniform float uShadowK;
      uniform float uSkyMix;
      uniform vec4 uSprites[ ${MAX_SPRITE_SHADOWS} ]; uniform float uFishRings;
      varying vec3 vWorld;
      ${GLSL_FIELD}
      ${GLSL_SKY}
      float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
      float inRect( vec2 p, vec4 r, float soft ) {
        vec2 d = max( r.xy - p, p - r.zw );
        return 1.0 - smoothstep( -soft, soft, max( d.x, d.y ) );
      }
      void main() {
        vec2 p = ( floor( vWorld.xz / ${TEXEL.toFixed(5)} ) + 0.5 ) * ${TEXEL.toFixed(5)};
        float t = uTime * uWave;
        vec2 g = vec2( 0.0 );
        g += vec2( 0.6, 0.8 ) * cos( dot( p, vec2( 0.6, 0.8 ) ) * 2.1 + t * 1.3 ) * 0.05;
        g += vec2( -0.8, 0.5 ) * cos( dot( p, vec2( -0.8, 0.5 ) ) * 3.3 + t * 1.7 ) * 0.035;
        g += vec2( 0.2, -1.0 ) * cos( dot( p, vec2( 0.2, -1.0 ) ) * 5.1 + t * 2.3 ) * 0.02;
        g *= 1.0 + uRain * 0.6;
        float depth = ${WATER_Y.toFixed(3)} - fieldAt( p ).r;
        if ( depth < -0.05 ) discard; // under the terrain anyway
        float ring = 0.0;
        for ( int i = 0; i < ${MAX_RIPPLES}; i ++ ) {
          vec4 r = uRipples[ i ];
          float age = r.z;
          float rad = 0.15 + age * 0.55;
          float dd = length( p - r.xy );
          ring += r.w * exp( - pow( ( dd - rad ) * 14.0, 2.0 ) ) * exp( - age * 1.1 );
          ring += r.w * 0.6 * exp( - pow( ( dd - rad * 0.6 ) * 16.0, 2.0 ) ) * exp( - age * 1.6 );
        }
        if ( uRain > 0.01 ) {
          vec2 cell = floor( p / 0.9 );
          vec2 f = fract( p / 0.9 ) - 0.5;
          float h = hash12( cell );
          float ph = fract( uTime * 0.9 + h );
          vec2 c = vec2( hash12( cell + 7.0 ), hash12( cell + 13.0 ) ) - 0.5;
          float dd = length( f - c * 0.5 ) * 0.9;
          ring += uRain * step( h, 0.45 ) * exp( - pow( ( dd - ph * 0.22 ) * 40.0, 2.0 ) ) * ( 1.0 - ph ) * 0.7;
        }
        // J9-B: fish rising at dusk: a few slow rings in open water (one chance per 7 m cell, each on its own 9 s period)
        if ( uFishRings > 0.01 ) {
          vec2 cell = floor( p / 7.0 );
          float h = hash12( cell + 41.0 );
          float ph = fract( uTime * 0.11 + h * 7.0 );
          vec2 c = ( cell + 0.25 + 0.5 * vec2( hash12( cell + 3.0 ), hash12( cell + 9.0 ) ) ) * 7.0;
          float dd = length( p - c );
          float rr = ph * 1.6;
          float k = step( 0.55, h ) * step( 0.9, depth ) * ( 1.0 - ph ) * uFishRings;
          ring += k * ( exp( - pow( ( dd - rr ) * 18.0, 2.0 ) ) + 0.6 * exp( - pow( ( dd - rr * 0.55 ) * 20.0, 2.0 ) ) );
        }
        vec3 n = normalize( vec3( - g.x, 1.0, - g.y ) );
        vec3 V = normalize( cameraPosition - vWorld );
        float fres = pow( 1.0 - max( dot( n, V ), 0.0 ), 3.0 );
        // the sky dome, reflected
        vec3 R = reflect( - V, n );
        R.y = abs( R.y );
        vec3 skyR = skyColor( normalize( R ), 1.0 );
        vec3 refl = mix( uSky, skyR, uSkyMix );
        vec3 col = mix( uDeep, refl, 0.18 + 0.75 * fres );
        float shallow = 1.0 - smoothstep( 0.0, 0.75, depth );
        col = mix( col, mix( vec3( 0.55, 0.52, 0.38 ), uSky, 0.45 ), shallow * 0.55 );
        float crest = smoothstep( 0.035, 0.07, g.x * 0.7 + g.y * 0.7 );
        col += uSky * crest * 0.12;
        // shadows of the decks and the boat: the point is in shadow if, going toward the sun up to the deck height, it is under the deck
        float shade = 0.0;
        vec2 toSun = uSunDir.xz / max( uSunDir.y, 0.15 );
        for ( int i = 0; i < ${MAX_SHADOWS}; i ++ ) {
          shade = max( shade, inRect( p + toSun * uShadowY[ i ], uShadows[ i ], 0.12 ) );
          shade = max( shade, inRect( p, uShadows[ i ], 0.05 ) * 0.7 ); // right under the deck
        }
        // J9-B: shadows of the sprites on the water: the segment from the feet to the head, cast along the sun onto the water plane
        for ( int i = 0; i < ${MAX_SPRITE_SHADOWS}; i ++ ) {
          vec4 sp = uSprites[ i ];
          if ( sp.w <= 0.0 ) continue;
          vec2 a = sp.xy - toSun * sp.z;
          vec2 b = sp.xy - toSun * ( sp.z + sp.w );
          vec2 ab = b - a;
          float tt = clamp( dot( p - a, ab ) / max( dot( ab, ab ), 1e-4 ), 0.0, 1.0 );
          float dd = length( p - ( a + ab * tt ) );
          shade = max( shade, ( 1.0 - smoothstep( 0.16, 0.3, dd ) ) * 0.85 );
        }
        col *= 1.0 - shade * uShadowK;
        // sun / moon glitter: sparse twinkling pixels
        vec3 Rs = reflect( - uSunDir, n );
        float spec = pow( max( dot( Rs, V ), 0.0 ), 200.0 );
        float tw = step( 0.88, hash12( floor( p * 8.0 ) + floor( uTime * 2.5 * uWave ) * 17.0 ) );
        col += uSunColor * ( step( 0.3, spec ) * tw * 0.9 + spec * 0.12 ) * uSunI * ( 1.0 - shade );
        // lamps: a wobbling column toward the camera (horizontal direction from the lamp to the camera) + a pool
        vec2 toCam = normalize( cameraPosition.xz - p + vec2( 1e-4 ) );
        for ( int i = 0; i < ${MAX_LAMPS}; i ++ ) {
          vec4 L = uLamps[ i ];
          if ( L.w <= 0.001 ) continue;
          vec2 d = p - L.xz;
          float along = dot( d, toCam );
          float side = dot( d, vec2( -toCam.y, toCam.x ) ) + 0.12 * sin( along * 5.0 + uTime * 2.2 ) * uWave;
          float col1 = exp( - side * side * 9.0 ) * exp( - pow( ( along - 1.6 ) / 1.7, 2.0 ) );
          float pool = exp( - dot( d, d ) * 0.35 ) * 0.35;
          col += uLampColor * L.w * ( col1 * 1.1 + pool ) * ( 0.55 + 0.45 * step( 0.5, fract( along * 2.0 + uTime * 0.7 ) ) );
        }
        // foam: at the shore line and round the piles
        float foam = 0.0;
        float edge = depth + 0.03 * sin( p.x * 3.0 + uTime * 1.5 );
        foam += 1.0 - smoothstep( 0.0, 0.07, edge );
        foam += 0.5 * ( 1.0 - smoothstep( 0.1, 0.13, abs( edge - 0.14 - 0.03 * sin( uTime * 0.8 ) ) ) ) * step( 0.0, edge );
        for ( int i = 0; i < ${MAX_PILES}; i ++ ) {
          vec2 q = uPiles[ i ] - p;
          if ( abs( q.x ) > 0.4 || abs( q.y ) > 0.4 ) continue;
          float dp = length( q );
          foam += 1.0 - smoothstep( 0.13, 0.2 + 0.03 * sin( uTime * 2.0 + float( i ) ), dp );
        }
        foam = clamp( foam + ring, 0.0, 1.0 );
        col = mix( col, vec3( 0.95, 0.95, 0.92 ) * ( 0.35 + 0.65 * max( uSky.r, max( uSky.g, uSky.b ) ) ), foam * 0.8 );
        gl_FragColor = vec4( col, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const W = LAKE.ax * 2 + 8;
  const H = LAKE.az * 2 + 8;
  const geo = new THREE.PlaneGeometry(W, H, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(LAKE.cx, WATER_Y, LAKE.cz);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.receiveShadow = false;
  mesh.layers.set(1); // not in its own reflection
  return { mesh, uniforms };
}
