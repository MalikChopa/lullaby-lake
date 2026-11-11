// The three.js side that is built once: renderer, scene, camera, the sun / fill lights and a pool of 4 point lights (the nearest lamps
// and lit windows), the sky dome, the static world (terrain chunks + merged props), the water, the sprites (angler, cat, villagers,
// float, "!" bubble), the rod, the line, the fish held up after a catch, the destination marker of tap-to-walk.
// createView is async: the ground field and the world are built in slices (no long freeze of the page).

import * as THREE from 'three';
import { FISH_W, FISH_H } from '../../../src/art/fishPaint.js';
import { LAYOUT, DECK_Y, TEXEL } from '../data/params.js';
import { VILLAGERS } from '../data/map.js';
import { anglerSheet, catSheet, propSheet, ANGLER, CAT, PROPS } from '../art/sheets.js';
import { folkSheet, catWalkSheet, FOLK, CAT_WALK } from '../art/folk.js';
import { fieldBuilder } from '../logic/field.js';
import { buildTerrainAsync } from '../world/terrain3d.js';
import { buildStaticAsync } from '../world/build.js';
import { buildWater } from '../world/water.js';
import { buildSky } from '../world/sky.js';
import { fieldTexture } from '../world/grass.js';
import { buildSmoke, buildDust } from '../world/particles.js';
import { createBillboard, sheetTexture } from '../world/sprites.js';

/** Half size of the sun's shadow box (metres) at the start; each tier sets its own (TIERS[t].shadowHalf). */
export const SHADOW_HALF = 15;
export const LIGHT_POOL = 4;
import { pause as yieldFrame } from '../world/pause.js';

export async function createView(ctx) {
  const mark = (n) => performance.mark('j9-' + n);
  mark('view-start');
  const prog = (f) => ctx.onLoad && ctx.onLoad(f); // loading progress 0..1 for the start screen
  const canvas = ctx.$('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.info.autoReset = false; // the composer renders several passes: count the whole frame
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.01);
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 160);
  camera.layers.enable(1); // layer 1 = grass, water, particles (left out of the water reflection)

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  const SH = SHADOW_HALF;
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 90 });
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  const pool = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const L = new THREE.PointLight(0xffc070, 0, 11, 1.6);
    L.position.set(0, -50, 0);
    scene.add(L);
    pool.push(L);
  }

  // ---- ground field, in slices
  const fb = fieldBuilder(5);
  let fieldSteps = 0;
  for (const _ of fb.steps) {
    prog(0.2 * (1 - 1 / (1 + 0.15 * ++fieldSteps))); // the number of steps is not known: a curve that never reaches its end
    await yieldFrame();
  }
  mark('field');
  const field = fb.field;
  const fieldTex = fieldTexture(field);
  mark('fieldTex');
  const terrain = await buildTerrainAsync(field, yieldFrame);
  scene.add(terrain.group);
  mark('terrain');
  await yieldFrame();
  const world = await buildStaticAsync({ sliceMs: 8, onProgress: (f) => prog(0.25 + 0.6 * f) }); // the static world, in slices of 8 ms (J9-B)
  scene.add(world.group);
  mark('static');
  await yieldFrame();
  const sky = buildSky();
  scene.add(sky.mesh);
  const water = buildWater(fieldTex, world.piles, world.deckShadows);
  scene.add(water.mesh);
  const smoke = buildSmoke(world.chimneys, 8);
  scene.add(smoke.mesh);
  const dust = buildDust(24);
  scene.add(dust.mesh);

  mark('water-etc');
  // ---- sprites
  prog(0.86);
  await yieldFrame();
  const anglerTex = sheetTexture(anglerSheet());
  await yieldFrame();
  const catTex = sheetTexture(catSheet());
  const catWalkTex = sheetTexture(catWalkSheet());
  await yieldFrame();
  const propTex = sheetTexture(propSheet());
  await yieldFrame();
  const player = createBillboard(anglerTex, { sheetW: ANGLER.cellW * ANGLER.cols, sheetH: ANGLER.cellH * ANGLER.rows, cellW: ANGLER.cellW, cellH: ANGLER.cellH }, { blob: 0.42 });
  const cat = createBillboard(catTex, { sheetW: CAT.cellW * CAT.cols, sheetH: CAT.cellH, cellW: CAT.cellW, cellH: CAT.cellH }, { blob: 0.32 });
  const catWalk = createBillboard(catWalkTex, { sheetW: CAT_WALK.cellW * CAT_WALK.cols, sheetH: CAT_WALK.cellH, cellW: CAT_WALK.cellW, cellH: CAT_WALK.cellH }, { blob: 0.32 });
  const float = createBillboard(propTex, { sheetW: PROPS.w, sheetH: PROPS.h, cellW: PROPS.float.w, cellH: PROPS.float.h }, { lean: 0.6, receive: false });
  const bubble = createBillboard(propTex, { sheetW: PROPS.w, sheetH: PROPS.h, cellW: PROPS.bubble.w, cellH: PROPS.bubble.h }, { lean: 0.5, receive: false });
  float.rect(PROPS.float.x, PROPS.float.y);
  bubble.rect(PROPS.bubble.x, PROPS.bubble.y);
  float.mesh.castShadow = false;
  bubble.mesh.castShadow = false;
  bubble.mesh.material = new THREE.MeshBasicMaterial({ map: bubble.mesh.material.map, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(0.62, 0.62, 0.62) }); // below the bloom threshold: the "!" stays readable
  cat.root.position.set(LAYOUT.cat.x, DECK_Y, LAYOUT.cat.z);
  catWalk.root.visible = false;
  scene.add(player.root, cat.root, catWalk.root, float.root, bubble.root);
  float.root.visible = false;
  bubble.root.visible = false;
  const folk = [];
  for (const v of VILLAGERS) {
    const b = createBillboard(sheetTexture(folkSheet(v.look)), { sheetW: FOLK.cellW * FOLK.cols, sheetH: FOLK.cellH * FOLK.rows, cellW: FOLK.cellW, cellH: FOLK.cellH }, { blob: 0.38 });
    b.root.name = 'villager-' + v.id;
    scene.add(b.root);
    folk.push(b);
    await yieldFrame(); // one painted sheet per villager: a task of a few ms each
  }
  // rod and line
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1), new THREE.MeshLambertMaterial({ color: 0x6a4a3a }));
  rod.castShadow = true;
  rod.visible = false;
  scene.add(rod);
  const LINE_N = 18;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_N * 3), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf4ead0, transparent: true, opacity: 0.85 }));
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  // fish held up after a catch
  const fishCanvas = document.createElement('canvas');
  fishCanvas.width = FISH_W;
  fishCanvas.height = FISH_H;
  const fishTex = new THREE.CanvasTexture(fishCanvas);
  fishTex.magFilter = THREE.NearestFilter;
  fishTex.minFilter = THREE.NearestFilter;
  fishTex.generateMipmaps = false;
  fishTex.colorSpace = THREE.SRGBColorSpace;
  const heldFish = new THREE.Mesh(new THREE.PlaneGeometry(FISH_W * TEXEL * 0.6, FISH_H * TEXEL * 0.6), new THREE.MeshBasicMaterial({ map: fishTex, alphaTest: 0.5, side: THREE.DoubleSide }));
  heldFish.visible = false;
  scene.add(heldFish);
  // destination of tap-to-walk: a pixel ring on the ground
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 8, 1), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.renderOrder = 2;
  scene.add(ring);

  mark('view-end');
  return {
    canvas,
    renderer,
    scene,
    camera,
    sun,
    hemi,
    pool,
    field,
    fieldTex,
    terrain,
    world,
    sky,
    water,
    smoke,
    dust,
    player,
    cat,
    catWalk,
    folk,
    float,
    bubble,
    rod,
    line,
    LINE_N,
    fishCanvas,
    fishTex,
    heldFish,
    ring,
    sprites: () => [player, cat, catWalk, ...folk],
  };
}
