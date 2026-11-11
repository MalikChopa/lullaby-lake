// Shared shading of the world materials (MeshLambertMaterial patched with onBeforeCompile; three.js does the lights, shadows and fog):
//   - occluder fade: each vertex carries an occluder id (aOcc); a small R8 texture holds the fade of every occluder (logic/occlusion.js);
//     the fragment is dropped by a 4x4 ordered dither (pixel-art friendly, no transparency sorting, the shadow stays);
//   - cloud shadows: soft moving patches that dim the sun light only (cloudy weather);
//   - wet look: rain darkens the ground and the props a little;
//   - wind: vertices with a sway weight (aSway) move with the gusts (foliage, reeds);
//   - sprites: they RECEIVE the shadow sampled at their feet, nudged toward the sun (no self-shadow acne on the leaned plane).

import * as THREE from 'three';

export const OCC_SIZE = 64; // fade texture is 64 x 64 = 4096 occluders max
const fadeData = new Uint8Array(OCC_SIZE * OCC_SIZE);
const fadeTex = new THREE.DataTexture(fadeData, OCC_SIZE, OCC_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
fadeTex.magFilter = THREE.NearestFilter;
fadeTex.minFilter = THREE.NearestFilter;
fadeTex.needsUpdate = true;

/** Uniforms shared by every patched material (one object, updated once per frame). */
export const shared = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uCloudCover: { value: 0 },
  uCloudShadow: { value: 0 },
  uCloudOff: { value: new THREE.Vector2() },
  uWet: { value: 0 },
  uFadeTex: { value: fadeTex },
  uSunW: { value: new THREE.Vector3(0, 1, 0) },
};

/** Sets the fade (0..1) of occluder `id` (1..4095); returns true when the value changed. */
export function setFade(id, f) {
  const v = Math.round(Math.max(0, Math.min(1, f)) * 255);
  if (fadeData[id] === v) return false;
  fadeData[id] = v;
  return true;
}
export function getFade(id) {
  return fadeData[id] / 255;
}
export function commitFades() {
  fadeTex.needsUpdate = true;
}

export const GLSL_CLOUD = /* glsl */ `
float ll_hash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float ll_noise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( ll_hash( i ), ll_hash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( ll_hash( i + vec2( 0.0, 1.0 ) ), ll_hash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float ll_fbm( vec2 p ) { return ll_noise( p ) * 0.55 + ll_noise( p * 2.07 + 3.1 ) * 0.3 + ll_noise( p * 4.3 + 7.7 ) * 0.15; }
// 1 = full sun, lower = under a cloud
float ll_cloudShade( vec2 xz, vec2 off, float cover, float strength ) {
  if ( strength <= 0.001 ) return 1.0;
  float n = ll_fbm( xz * 0.035 + off );
  float m = smoothstep( 1.0 - cover - 0.12, 1.0 - cover + 0.18, n );
  return 1.0 - strength * m;
}
`;

const BAYER = /* glsl */ `
float ll_bayer( vec2 fc ) {
  ivec2 p = ivec2( mod( fc, 4.0 ) );
  int i = p.x + p.y * 4;
  int b[ 16 ] = int[ 16 ]( 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 );
  return ( float( b[ i ] ) + 0.5 ) / 16.0;
}
`;

/**
 * Patches a MeshLambertMaterial.
 * @param {THREE.Material} mat
 * @param {{fade?: boolean, sway?: number, wet?: number, sprite?: boolean, key?: string}} o sway = metres of gust at weight 1
 */
export function patchMaterial(mat, o = {}) {
  const fade = o.fade !== false;
  const sway = o.sway || 0;
  const wet = o.wet ?? 0.28;
  const sprite = !!o.sprite;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    vs = vs.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime; uniform float uWind; uniform sampler2D uFadeTex; uniform vec3 uSunW;
      ${fade ? 'attribute float aOcc; varying float vFade;' : ''}
      ${sway ? 'attribute float aSway;' : ''}
      varying vec3 vWP;`
    );
    vs = vs.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec4 wq = modelMatrix * vec4( transformed, 1.0 );
        ${sway ? `float ph = wq.x * 0.31 + wq.z * 0.23;
        float gust = sin( uTime * 1.1 + ph ) + 0.4 * sin( uTime * 2.3 + ph * 1.9 );
        transformed.xz += vec2( gust, 0.45 * cos( uTime * 0.9 + ph ) ) * ${sway.toFixed(3)} * aSway * uWind;` : ''}
        vWP = wq.xyz;
      }
      ${fade ? 'vFade = texelFetch( uFadeTex, ivec2( int( aOcc ) % ' + OCC_SIZE + ', int( aOcc ) / ' + OCC_SIZE + ' ), 0 ).r;' : ''}`
    );
    if (sprite) {
      // the shadow of the sprite is the shadow at its feet, 0.35 m toward the sun and 0.5 m up (not on its own leaned plane)
      vs = vs.replace(
        '#include <shadowmap_vertex>',
        `#ifdef USE_SHADOWMAP
        {
          vec4 keepWP = worldPosition;
          vec3 feet = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          vec2 toSun = normalize( uSunW.xz + vec2( 1e-4 ) );
          worldPosition = vec4( feet + vec3( toSun.x * 0.35, 0.5, toSun.y * 0.35 ), 1.0 );
          #include <shadowmap_vertex>
          worldPosition = keepWP;
        }
        #else
        #include <shadowmap_vertex>
        #endif`
      );
    }
    fs = fs.replace(
      '#include <common>',
      `#include <common>
      uniform vec2 uCloudOff; uniform float uCloudCover; uniform float uCloudShadow; uniform float uWet;
      ${fade ? 'varying float vFade;' : ''}
      varying vec3 vWP;
      ${GLSL_CLOUD}
      ${BAYER}`
    );
    fs = fs.replace(
      'void main() {',
      `void main() {
      ${fade ? 'if ( vFade > 0.002 && ll_bayer( gl_FragCoord.xy ) < vFade ) discard;' : ''}
      float llCloud = ll_cloudShade( vWP.xz, uCloudOff, uCloudCover, uCloudShadow );`
    );
    fs = fs.replace(
      '#include <lights_fragment_begin>',
      THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= llCloud;')
    );
    if (wet) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n      diffuseColor.rgb *= 1.0 - ${wet.toFixed(3)} * uWet;`);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'll' + (fade ? 'f' : '') + sway + '/' + wet + (sprite ? 's' : '') + (o.key || '');
  return mat;
}
