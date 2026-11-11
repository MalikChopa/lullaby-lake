// Quality tier glue: applies a tier (pixel ratio, shadow map and box, grass and flowers window, rain, fireflies / motes, view and detail
// distances, sprite shadows, post-processing) and holds the auto-quality state machine of logic/quality.js.

import { TIERS } from '../data/params.js';
import { createQuality, parseTier } from '../logic/quality.js';
import { buildGrass } from '../world/grass.js';
import { buildRain } from '../world/rain.js';
import { buildCritters } from '../world/particles.js';
import { createPost } from '../world/post.js';
import { viewSize } from './viewport.js';

export function createTiers(ctx, view) {
  const { renderer, scene, camera, sun } = view;
  // the choice lives in the HD-2D save's settings (J9-A); ?q= overrides it for this visit only (tests, screenshots)
  const qMode = parseTier(ctx.query.get('q') || ctx.settings.quality || 'auto');
  const T = {
    qMode,
    name: null,
    tier: null,
    quality: createQuality({ mode: qMode }),
    grass: null,
    rain: null,
    critters: null,
    post: null,
    /** Applies a tier now (rebuilds the instanced layers and the post chain; drops the shadow map so it is re-created at the new size). */
    apply(name) {
      name = TIERS[name] ? name : 'high'; // (an unknown name, e.g. the old 'ultra' given to force(): the top tier)
      const tier = TIERS[name];
      T.name = name;
      T.tier = tier;
      const dpr = devicePixelRatio || 1;
      renderer.setPixelRatio(Math.min(tier.maxPixelRatio, Math.max(dpr, tier.minPixelRatio || 0)));
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
      sun.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
      sun.shadow.radius = tier.shadowRadius;
      const H = tier.shadowHalf;
      Object.assign(sun.shadow.camera, { left: -H, right: H, top: H, bottom: -H });
      sun.shadow.camera.updateProjectionMatrix();
      if (T.grass) {
        scene.remove(T.grass.grass, T.grass.flowers);
        T.grass.dispose();
      }
      performance.mark('j9-apply-start');
      T.grass = buildGrass(tier.grass, tier.flowers, tier.grassWin, view.fieldTex);
      scene.add(T.grass.grass, T.grass.flowers);
      if (T.rain) {
        scene.remove(T.rain.mesh);
        T.rain.dispose();
      }
      performance.mark('j9-apply-grass');
      T.rain = buildRain(tier.rain);
      scene.add(T.rain.mesh);
      if (T.critters) {
        scene.remove(...T.critters.meshes);
        T.critters.dispose();
      }
      T.critters = buildCritters(tier.fireflies, tier.motes, view.fieldTex);
      scene.add(...T.critters.meshes);
      performance.mark('j9-apply-critters');
      for (const s of view.sprites()) s.setShadowMode(tier.spriteShadows);
      // round 2: on the lightest tier the foliage and the small props of the models do not cast shadows (fewer draws in the shadow pass; the 1024 map showed them as noise)
      if (view.world && view.world.chunks)
        for (const ch of view.world.chunks)
          for (const m of [...ch.meshes, ...ch.detail]) if (m.name === 'dflat' || m.name === 'mleaf' || m.name === 'foliage') m.castShadow = tier.foliageShadows !== false;
      camera.far = tier.viewDist + 40;
      camera.updateProjectionMatrix();
      if (T.post) T.post.dispose();
      const vs = viewSize();
      T.post = createPost(renderer, scene, camera, tier, vs.w, vs.h);
      renderer.setSize(vs.w, vs.h, false);
      performance.mark('j9-apply-post');
      ctx.$('quality').value = T.qMode === 'auto' ? 'auto' : name;
      ctx.onTier && ctx.onTier(name);
    },
    /** The page selector: a fixed tier (saved), or auto (which restarts its probe from the current tier). */
    select(v) {
      v = parseTier(v);
      T.qMode = v;
      ctx.settings.quality = v; // saved with the other settings by the shell
      T.quality = createQuality({ mode: v === 'auto' ? 'auto' : v, start: T.name });
      if (v !== 'auto') T.apply(v);
      else ctx.$('quality').value = 'auto';
      ctx.onTier && ctx.onTier(T.name);
    },
    /** Debug: force a fixed tier. */
    force(name) {
      T.quality = createQuality({ mode: name });
      T.apply(name);
    },
  };
  T.apply(T.quality.tier());
  return T;
}
