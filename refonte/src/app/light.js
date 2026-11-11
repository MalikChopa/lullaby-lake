// Light glue: the numbers of logic/daylight.js (from the clock and the weather mix) applied to the sun, the fill, the fog, the sky dome,
// the cloud shadows, the glowing glass, the water, the wet look, the particles (fireflies at dusk and night, motes by day, smoke) and the
// post-processing.
// J9-B: also drives the look-polish layer of the static world (world/life.js): light shafts (high), lamp pools, butterflies,
// birds, the glow of the sign boards at night, fish rings at dusk and the sprites' shadows on the water.

import * as THREE from 'three';
import { shared } from '../world/shading.js';
import { MAX_SPRITE_SHADOWS } from '../world/water.js';
import { shaftAmount } from '../logic/look.js';

export function createLight(ctx, view, tiers) {
  const { sun, hemi, scene, renderer, water, sky, world } = view;
  const c = new THREE.Color();
  const linCol = (a) => c.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
  let cloudX = 0;
  const Lt = {
    last: null,
    apply(L, dt, elapsed) {
      Lt.last = L;
      sun.color.copy(linCol(L.sunColor));
      sun.intensity = L.sunI;
      sun.shadow.radius = tiers.tier.shadowRadius * L.shadowSoft;
      hemi.color.copy(linCol(L.sky));
      hemi.groundColor.copy(linCol(L.ground));
      hemi.intensity = L.hemiI;
      scene.fog.color.copy(linCol(L.fog));
      scene.fog.density = L.fogD;
      scene.background = scene.fog.color;
      renderer.toneMappingExposure = L.exposure;
      world.mats.glowLamp.color.setRGB(1, 0.85, 0.55).multiplyScalar(0.3 + L.lamp * 1.5);
      world.mats.glowWindow.color.setRGB(1, 0.78, 0.45).multiplyScalar(0.2 + L.window * 1.15);
      world.mats.spirit.color.setRGB(0.62, 0.86, 1).multiplyScalar(0.8 + L.lamp * 0.4); // art pass: small glowing blobs among real leaves, a peak near 1.4 (it was 2.5 on a big cloud = the white blast)
      // sky dome
      const S = sky.uniforms;
      S.uSkyTop.value.copy(linCol(L.skyTop));
      S.uSkyHor.value.copy(linCol(L.skyHor));
      S.uSkySun.value.set(L.sunDir[0], L.sunDir[1], L.sunDir[2]);
      S.uSkySunCol.value.copy(linCol(L.sunColor));
      S.uSkyBody.value = L.body === 'sun' ? 1 : L.body === 'moon' ? -1 : 0;
      S.uSkyDiscs.value = L.discs;
      S.uSkyStars.value = L.stars;
      S.uSkyClouds.value = 0.15 + 0.75 * L.clouds;
      S.uSkyCloudCol.value.copy(linCol(L.cloudColor));
      S.uSkyTime.value = ctx.reduced ? 0 : elapsed;
      // cloud shadows on the ground, drifting
      if (!ctx.reduced) cloudX += dt * 0.025;
      shared.uCloudOff.value.set(cloudX, cloudX * 0.4);
      shared.uCloudCover.value = L.clouds;
      shared.uCloudShadow.value = L.cloudShadow;
      shared.uWet.value = L.wet;
      shared.uSunW.value.set(L.sunDir[0], L.sunDir[1], L.sunDir[2]);
      // water
      const U = water.uniforms;
      U.uSky.value.copy(linCol(L.waterSky));
      U.uDeep.value.copy(linCol(L.waterDeep));
      U.uSunDir.value.set(L.sunDir[0], L.sunDir[1], L.sunDir[2]);
      U.uSunColor.value.copy(linCol(L.sunColor));
      U.uSunI.value = L.sunI / 2.5;
      U.uRain.value = L.rain;
      U.uShadowK.value = Math.min(0.55, (L.sunI / 3) * 0.6 + 0.12);
      U.uSkyMix.value = 0.55 + 0.35 * (1 - L.mist);
      // particles
      const night = L.phaseWeights.night + 0.7 * L.phaseWeights.dusk;
      const day = L.phaseWeights.day + 0.5 * L.phaseWeights.dawn;
      if (tiers.critters) {
        const C = tiers.critters;
        C.fly.uniforms.uAmount.value = ctx.reduced ? 0 : night * (1 - 0.85 * L.rain) * (1 - 0.4 * L.mist);
        C.mote.uniforms.uAmount.value = ctx.reduced ? 0 : day * (1 - L.rain) * (1 - 0.5 * L.clouds) * 0.9;
        C.fly.uniforms.uTime.value = elapsed;
        C.mote.uniforms.uTime.value = elapsed;
        const px = renderer.getPixelRatio();
        C.fly.uniforms.uPx.value = px;
        C.mote.uniforms.uPx.value = px;
        C.mote.mesh.visible = C.mote.uniforms.uAmount.value > 0.01;
        C.fly.mesh.visible = C.fly.uniforms.uAmount.value > 0.01;
      }
      view.smoke.uniforms.uTime.value = ctx.reduced ? 0 : elapsed;
      view.smoke.uniforms.uPx.value = renderer.getPixelRatio();
      view.smoke.uniforms.uColor.value.copy(linCol(L.fog)).lerp(new THREE.Color(0.9, 0.9, 0.92), 0.5);
      view.smoke.uniforms.uAmount.value = ctx.reduced ? 0.6 : 1 - 0.5 * L.rain;
      view.dust.uniforms.uPx.value = renderer.getPixelRatio();
      if (tiers.post) tiers.post.set({ bloom: L.bloom, grade: L.grade, sat: L.sat });
      Lt.life(L, elapsed, night, day);
    },
    /** J9-B layer: shafts, pools, butterflies, birds, signs, fish rings, sprite shadows on the water. */
    life(L, elapsed, night, day) {
      const life = world.life;
      if (!life) return;
      const tierName = tiers.name;
      const midUp = tierName !== 'low';
      const pl = view.player.root.position;
      const cam = view.camera.position;
      const yaw = Math.atan2(cam.x - pl.x, cam.z - pl.z);
      // shafts
      const sa = shaftAmount(L, tierName);
      const sh = life.shafts;
      sh.mesh.visible = sa > 0.01;
      sh.mesh.userData.amount = sa;
      if (sh.mesh.visible) {
        const U = sh.mesh.material.uniforms;
        U.uAmount.value = sa;
        U.uTime.value = ctx.reduced ? 0 : elapsed;
        U.uColor.value.copy(linCol(L.sunColor)).lerp(new THREE.Color(1, 1, 1), 0.25 + 0.4 * L.mist);
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        sh.place(pl.x + fx * 6, pl.z + fz * 6, pl.y, L.sunDir, yaw);
      }
      // lamp pools (every tier)
      const pu = life.pools.mesh.material.uniforms;
      pu.uLamp.value = L.lamp * (0.55 + 0.45 * night);
      pu.uWin.value = L.window * 0.8;
      life.pools.mesh.visible = life.pools.count > 0 && (L.lamp > 0.02 || L.window > 0.02);
      // butterflies by day, birds by day / dawn / dusk (not in rain, not with reduced motion)
      const bu = life.butterflies.mesh.material.uniforms;
      bu.uTime.value = elapsed;
      bu.uAmount.value = midUp && !ctx.reduced ? day * (1 - L.rain) * (1 - 0.6 * L.mist) : 0;
      bu.uLight.value = 0.65 + 0.35 * day;
      life.butterflies.mesh.visible = bu.uAmount.value > 0.02;
      const bi = life.birds.mesh.material.uniforms;
      bi.uTime.value = elapsed;
      bi.uCenter.value.set(pl.x, pl.z);
      bi.uAmount.value = midUp && !ctx.reduced ? Math.min(1, day + 0.8 * L.phaseWeights.dusk) * (1 - L.rain) : 0;
      life.birds.mesh.visible = bi.uAmount.value > 0.02;
      // signs glow a little at night (lit by their lantern): readable in the dark
      if (world.mats.sign) world.mats.sign.emissiveIntensity = 0.06 + 0.32 * Math.max(L.lamp, L.window) * night;
      // fish rings at dusk (and a few at dawn)
      water.uniforms.uFishRings.value = ctx.reduced ? 0 : Math.min(1, L.phaseWeights.dusk + 0.4 * L.phaseWeights.dawn) * (1 - L.rain);
      // shadows of the sprites on the water (those near the water only)
      const arr = water.uniforms.uSprites.value;
      let k = 0;
      const push = (b, h) => {
        if (!b || !b.root.visible || k >= MAX_SPRITE_SHADOWS) return;
        const p = b.root.position;
        if (Math.abs(p.x - pl.x) > 30 || Math.abs(p.z - pl.z) > 30) return;
        arr[k++].set(p.x, p.z, Math.max(0, p.y), h);
      };
      push(view.player, 1.9);
      push(view.cat, 0.8);
      push(view.catWalk, 0.7);
      for (const f of view.folk || []) push(f, 1.8);
      for (; k < MAX_SPRITE_SHADOWS; k++) arr[k].set(1e4, 1e4, 0, 0);
    },
  };
  return Lt;
}
