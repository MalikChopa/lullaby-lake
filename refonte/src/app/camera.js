// Camera rig: perspective at ~45 degrees, damped follow and zoom, quarter turns (Q / E, smooth), the aimed point kept inside the world;
// what follows the view: the sun's shadow box (snapped to whole shadow texels: no shimmer), the sky dome, the rain box, the grass /
// flower / particle windows; chunk visibility (view distance, detail distance); the 4 point lights given to the nearest lamps and lit
// windows; the occluder fade (dithered) of the houses and trees that hide the angler.

import { CAMERA } from '../data/params.js';
import { BOUNDS } from '../data/map.js';
import { cameraOffset, followStep, dampFactor } from '../logic/camera.js';
import { hides, fadeStep, FADE_MAX } from '../logic/occlusion.js';
import { setFade, getFade, commitFades } from '../world/shading.js';
import { swayUniforms } from '../world/grass.js';

const DEG = Math.PI / 180;

export function createCameraRig(ctx, view, tiers, input, walk) {
  const { camera, sun } = view;
  const R = {
    target: walk.aim(),
    zoom: CAMERA.distance,
    yaw: CAMERA.yawDeg * DEG, // current heading (radians)
    yawGoal: CAMERA.yawDeg * DEG,
    turns: 0,
    override: null, // [x, y, z]: look here instead of at the angler (the view behind the start screen); the follow damping glides back when it is cleared
    pitch: CAMERA.pitchDeg, // degrees below the horizon (the start screen looks lower, a 3/4 view; eased back in the game)
    pitchGoal: CAMERA.pitchDeg,
    yawBias: 0, // radians added to the heading (the start screen's 3/4 angle)
    drift: 0, // radians added to the heading: the slow sway behind the start screen (0 in the game; the damping eases it back)
    faded: new Set(),
    lightsOn: [],
    /** Quarter turn: +1 = Q (counter-clockwise), -1 = E. */
    turn(dir) {
      R.turns += dir;
      R.yawGoal = (CAMERA.yawDeg + R.turns * CAMERA.yawStepDeg) * DEG;
    },
    snap() {
      R.target = R.override ? R.override.slice() : walk.aim();
      R.yaw = R.yawGoal + R.yawBias + R.drift;
      R.pitch = R.pitchGoal;
    },
    step(dt, fy, L) {
      const pl = walk.pl;
      const goal = R.override ? R.override.slice() : walk.aim();
      const m = CAMERA.edgeMargin;
      goal[0] = Math.max(BOUNDS.x0 + m, Math.min(BOUNDS.x1 - m, goal[0]));
      goal[2] = Math.max(BOUNDS.z0 + m, Math.min(BOUNDS.z1 - m, goal[2]));
      R.target = followStep(R.target, goal, dt, CAMERA.followRate);
      R.zoom += (input.zoomGoal - R.zoom) * dampFactor(CAMERA.zoomRate, dt);
      R.pitch += (R.pitchGoal - R.pitch) * (ctx.reduced ? 1 : dampFactor(CAMERA.yawRate * 0.5, dt));
      const goalYaw = R.yawGoal + R.yawBias + R.drift;
      R.yaw += (goalYaw - R.yaw) * (ctx.reduced ? 1 : dampFactor(dt > 0 && R.drift !== 0 ? CAMERA.yawRate * 0.15 : CAMERA.yawRate, dt));
      if (Math.abs(goalYaw - R.yaw) < 1e-4) R.yaw = goalYaw;
      const off = cameraOffset(R.pitch, R.yaw / DEG, R.zoom);
      const t = R.target;
      camera.position.set(t[0] + off[0], t[1] + off[1], t[2] + off[2]);
      camera.lookAt(t[0], t[1], t[2]);
      // the view centre on the ground: a little beyond the target, in the looking direction
      const fx = -Math.sin(R.yaw);
      const fz = -Math.cos(R.yaw);
      const cx = t[0] + fx * 4;
      const cz = t[2] + fz * 4;
      swayUniforms.uCenter.value.set(cx, cz);
      if (tiers.critters) {
        tiers.critters.fly.uniforms.uCenter.value.set(cx, cz);
        tiers.critters.mote.uniforms.uCenter.value.set(cx, cz);
      }
      tiers.rain.uniforms.uCenter.value.set(t[0], t[1], t[2]);
      view.sky.mesh.position.copy(camera.position);
      // the sun follows the angler (a bit toward the view); its shadow box moves in whole shadow texels
      const H = tiers.tier.shadowHalf;
      const texel = (2 * H) / sun.shadow.mapSize.x;
      const sx = Math.round((pl.x + fx * H * 0.35) / texel) * texel;
      const sz = Math.round((pl.z + fz * H * 0.35) / texel) * texel;
      const d = L.sunDir;
      sun.target.position.set(sx, 0, sz);
      sun.position.set(sx + d[0] * 45, d[1] * 45, sz + d[2] * 45);
      // chunks: hidden beyond the view distance; details beyond the detail distance
      const vd = tiers.tier.viewDist;
      const dd = tiers.tier.detailDist;
      for (const ch of view.world.chunks) {
        const dist = Math.hypot(ch.cx - cx, ch.cz - cz) - 17; // chunk half diagonal
        const vis = dist < vd;
        for (const mm of ch.meshes) mm.visible = vis;
        for (const mm of ch.detail) mm.visible = dist < dd;
      }
      for (const mm of view.terrain.chunks) mm.visible = Math.hypot(mm.userData.centre[0] - cx, mm.userData.centre[1] - cz) - (mm.userData.radius || 17) < vd;
      // point lights: the 4 nearest light sources that shine now
      const lights = view.world.lights;
      const scored = [];
      for (const s of lights) {
        const k = s.kind === 'window' ? L.window : s.kind === 'spirit' ? Math.max(0.15, L.lamp) : L.lamp;
        if (k <= 0.02) continue;
        scored.push({ s, k, d: Math.hypot(s.x - t[0], s.z - t[2]) });
      }
      // J10: the fishing lantern the angler carries is one more light source (the nearest, d = 0), at night only (it follows the lamp level)
      if (R.carried && L.lamp > 0.02) scored.push({ s: { x: R.carried.x, y: R.carried.y, z: R.carried.z, kind: 'carried' }, k: Math.min(1, L.lamp * R.carried.k), d: 0 });
      scored.sort((a, b) => a.d - b.d);
      R.lightsOn = scored.slice(0, view.pool.length);
      view.pool.forEach((pt, i) => {
        const e = R.lightsOn[i];
        if (!e) {
          pt.intensity = 0;
          return;
        }
        pt.position.set(e.s.x, e.s.y, e.s.z);
        const kind = e.s.kind;
        pt.color.setRGB(kind === 'spirit' ? 0.6 : 1, kind === 'spirit' ? 0.85 : 0.75, kind === 'spirit' ? 1 : 0.45);
        pt.distance = kind === 'window' ? 8 : kind === 'spirit' ? 14 : 11;
        pt.intensity = e.k * (kind === 'window' ? 6 : kind === 'lantern' ? 5 : 9) * Math.min(1, Math.max(0, (34 - e.d) / 8));
      });
      // occluders between the camera and the angler fade (dither); only those near the angler are tested
      const cam = [camera.position.x, camera.position.y, camera.position.z];
      const head = [pl.x, fy + 1.0, pl.z];
      let changed = false;
      const occ = view.world.occluders;
      for (let i = 1; i < occ.length; i++) {
        const o = occ[i];
        const near = Math.abs(o.c[0] - pl.x) < 16 && Math.abs(o.c[2] - pl.z) < 16;
        const want = near && hides(cam, head, o) ? FADE_MAX : 0;
        const cur = getFade(o.id);
        if (want === 0 && cur === 0) continue;
        const n = fadeStep(cur, want, dt);
        if (setFade(o.id, n)) changed = true;
        if (n > 0.05) R.faded.add(o.name);
      }
      if (changed) commitFades();
      R.faded = new Set(occ.filter((o) => o && getFade(o.id) > 0.05).map((o) => o.name));
    },
  };
  return R;
}
