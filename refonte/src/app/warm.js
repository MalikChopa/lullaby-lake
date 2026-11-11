// Warm-up behind the loading bar (J9-C): uploads the geometry of every ground and building chunk to the GPU one chunk per task, instead of the first time
// the player walks toward it (a big merged chunk is a long task on a slow CPU: the cause of the rare "long task while walking" of the J8 check).
// How: each chunk is drawn alone, with culling off, into a tiny render target; everything else of the scene stays hidden meanwhile (the lights stay,
// so the shader variants are the real ones). Everything is put back afterwards. Failure of any kind = nothing warmed, nothing broken.

import * as THREE from 'three';
import { pause } from '../world/pause.js';

export async function warmChunks(view) {
  const { scene, camera, renderer, world, terrain } = view;
  const groups = [];
  for (const ch of world.chunks) groups.push([...ch.meshes, ...ch.detail]);
  for (const m of terrain.chunks) groups.push([m]);
  const all = groups.flat();
  const savedAll = all.map((m) => [m, m.visible, m.frustumCulled]);
  const others = scene.children.filter((c) => c !== world.group && c !== terrain.group && !c.isLight);
  const savedOthers = others.map((c) => [c, c.visible]);
  const prevRT = renderer.getRenderTarget();
  const rt = new THREE.WebGLRenderTarget(16, 9);
  const prevAuto = renderer.shadowMap.autoUpdate;
  let n = 0;
  try {
    renderer.shadowMap.autoUpdate = false; // the shadow pass is not needed to upload buffers (and costs the most)
    for (const c of others) c.visible = false;
    for (const m of all) {
      m.visible = false;
      m.frustumCulled = false;
    }
    renderer.setRenderTarget(rt);
    for (const g of groups) {
      for (const m of g) m.visible = true;
      renderer.render(scene, camera);
      for (const m of g) m.visible = false;
      n++;
      await pause();
    }
  } catch {
    /* nothing more to warm */
  } finally {
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevAuto;
    for (const [m, v, f] of savedAll) {
      m.visible = v;
      m.frustumCulled = f;
    }
    for (const [c, v] of savedOthers) c.visible = v;
    rt.dispose();
    renderer.info.reset();
  }
  return n;
}
