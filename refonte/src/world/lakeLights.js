// The soft lights of the lake (J12-B): each couplet found adds a small permanent glow on the water, in its place (data/story.js COUPLETS[].spot). One THREE.Points
// object (ONE draw call, additive soft sprites, no real-time light at all, so the light budget of the scene is untouched). The finale blooms them: bigger and
// brighter, coming on one by one (reduced motion: all on, still). Hidden on the `low` tier; the journal's list of found couplets carries the same information in words.

import * as THREE from 'three';
import { COUPLETS, STORY_SPOTS } from '../data/story.js';
import { LAKE_LIGHT } from '../data/boat.js';

const TINTS = ['#ffb4c8', '#a8e8b8', '#ffe08a', '#b8c8ff', '#ffb890', '#8ad8ff', '#d8b8ff', '#fff0b0'];

/** World position [x, y, z] of the light of couplet n (the water in front of its place; neighbours at the same place are shifted a little). */
export function lightPosition(c) {
  const sp = STORY_SPOTS[c.spot];
  const k = (c.n * 0.37) % 1;
  return [sp.over[0] + (k - 0.5) * 2.2, LAKE_LIGHT.y, sp.over[1] + (((c.n * 0.61) % 1) - 0.5) * 2.2];
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createLakeLights() {
  const n = COUPLETS.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  COUPLETS.forEach((c, i) => positions.set(lightPosition(c), i * 3));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: LAKE_LIGHT.size, map: glowTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  points.name = 'lake-lights';
  points.frustumCulled = false;
  points.renderOrder = 5;
  points.visible = false;
  const tint = TINTS.map((h) => new THREE.Color(h));
  let shown = 0;
  return {
    points,
    /** found = couplet numbers found; finale = { lit (fraction of lights on), bloom (0..1) } while the finale plays or relaxes; low = hide (low tier). */
    update(elapsed, found, { lit = null, bloom = 0, reduced = false, low = false, afterFinale = false } = {}) {
      shown = 0;
      COUPLETS.forEach((c, i) => {
        let k = found.includes(c.n) ? 1 : 0;
        if (k && lit !== null) k = Math.max(0, Math.min(1, lit - i)); // coming on one by one during the finale
        const pulse = reduced ? 1 : 0.82 + 0.18 * Math.sin(elapsed * 0.9 + i * 1.7);
        const level = k * pulse * (0.5 + 0.35 * bloom + (afterFinale ? 0.1 : 0));
        colors[i * 3] = tint[i].r * level;
        colors[i * 3 + 1] = tint[i].g * level;
        colors[i * 3 + 2] = tint[i].b * level;
        if (k > 0) shown++;
      });
      geo.attributes.color.needsUpdate = true;
      mat.size = LAKE_LIGHT.size + (LAKE_LIGHT.bloomSize - LAKE_LIGHT.size) * bloom;
      points.visible = !low && shown > 0;
    },
    count: () => shown,
    dispose() {
      geo.dispose();
      mat.map.dispose();
      mat.dispose();
    },
  };
}
