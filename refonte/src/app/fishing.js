// Fishing glue: feeds the button edges to the EXISTING core (src/core/game.js, fixed 1/60 s steps), turns its events into ripples, the
// toast and the catch card, and draws the rod, the float, the line, the "!" bubble and the fish held up. The rules stay in the core.

import * as THREE from 'three';
import { WATER_Y } from '../data/params.js';
import { gearMods } from '../economy/draw.js';

export function createFishing(ctx, view, hud, input, ripples, flow = null, sfx = () => {}) {
  const { game } = ctx;
  const { config } = ctx.data;
  const { rod, float, bubble, line, heldFish, LINE_N } = view;
  const fish = { land: new THREE.Vector3(), biteRipple: 0 };
  let acc = 0;
  const tmpV = new THREE.Vector3();
  const cue = () => (ctx.eco ? gearMods(ctx.eco.get()).cue : 1); // a float makes the bite cue (ripples, bob, bubble bounce) gentler
  let floatKey = '';
  let rodKey = '';

  return {
    fish,
    /**
     * Steps the core. `spot` = the fishing spot the angler stands on (or null): the core only hears the button at a spot, or while a
     * line is out / a fish is shown. `cast(u)` returns where the float lands for a cast power u (0..1).
     */
    stepCore(dt, atSpot, castTarget) {
      const fs = game.getState().fishing;
      const pending = input.pending;
      let actions = {};
      const events = [];
      let lostLine = null; // the fish swam off after a fight: the toast is the fight's, not the core's generic one
      if (flow && flow.active) {
        // J11: during a fight the button edges belong to the fight (it reads the held state) and the core rests (the lake's clock too, for a few seconds)
        pending.down = false;
        pending.up = false;
        const r = flow.step(dt);
        if (!r) return events;
        ctx.chal.fightEnded(r);
        const inBite = fs.phase === 'bite';
        if (r.status === 'won') {
          sfx('reel');
          hud.showToast(ctx.tx[r.perfect ? 'chal.fight.perfect' : 'chal.fight.won'], 1.6);
          if (inBite) actions = { down: true }; // now the normal reel -> catch flow
          if (navigator.vibrate && input.touchUsed) navigator.vibrate(18);
        } else if (inBite) {
          const hold = game.getState().holdS;
          if (hold != null) {
            lostLine = ctx.tx[r.status === 'lost' ? 'chal.fight.lost' : 'chal.fight.left'];
            events.push(...game.step(hold + 0.01, {})); // the 8 s are over: the core makes the fish swim off and come back by its own rule
          } else lostLine = ctx.tx['chal.fight.leftWait']; // "let the fish wait": it simply waits for another try
          hud.showToast(lostLine, config.bite.escapedMsgS);
        }
      } else if (flow && fs.phase === 'bite' && pending.down && (ctx.playing ? ctx.playing() : true)) {
        pending.down = false;
        pending.up = false;
        if (flow.begin(fs.fish.id, fs.fish.sizeCm)) {
          sfx('splash');
          return events;
        }
      }
      if (!actions.down && (pending.down || pending.up)) {
        if (atSpot || fs.phase !== 'idle') actions = { down: pending.down, up: pending.up };
        pending.down = false;
        pending.up = false;
      }
      acc += dt * ctx.speed;
      let first = true;
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        events.push(...game.step(1 / 60, first ? actions : {}));
        first = false;
      }
      if (first && (actions.down || actions.up)) events.push(...game.step(0, actions)); // never lose a press
      for (const ev of events) {
        if (ev.type === 'cast') {
          const u = Math.max(0, Math.min(1, (ev.distPx - config.cast.minDistPx) / (config.cast.maxDistPx - config.cast.minDistPx)));
          castTarget(u, fish.land);
        } else if (ev.type === 'landed') ripples.add(fish.land.x, fish.land.z, 1);
        else if (ev.type === 'bite') {
          ripples.add(fish.land.x, fish.land.z, 1.2 * cue());
        } else if (ev.type === 'escaped') {
          if (!lostLine) hud.showToast(ctx.tx['hud.escaped'], config.bite.escapedMsgS);
        }
        else if (ev.type === 'caught') {
          const near = castTarget(0, tmpV, true);
          ripples.add(near.x, near.z, 1.4);
          hud.showCard(ev);
        } else if (ev.type === 'released') {
          hud.hideCard();
          heldFish.visible = false;
        }
      }
      return events;
    },
    /**
     * Rod, float, line, bubble, held fish. `pose` = { x, y, z (feet), ax, az (unit facing on the ground), showRod }.
     * The rod points the way the angler faces; `near` = where the reeled float comes back to.
     */
    draw(dt, elapsed, pose, near) {
      const F = game.getState().fishing;
      const reduced = ctx.reduced;
      const { ax, az } = pose;
      // hand: a little to the right of the facing and forward
      const rx = -az;
      const rz = ax;
      const hand = new THREE.Vector3(pose.x + rx * 0.3 + ax * 0.1, pose.y + 1.05, pose.z + rz * 0.3 + az * 0.1);
      const fishing = F.phase !== 'idle';
      const fx = flow ? flow.fx : null;
      const fighting = !!(fx && fx.active && F.phase === 'bite');
      rod.visible = pose.showRod;
      if (pose.rodColor !== undefined && rodKey !== String(pose.rodColor)) {
        rodKey = String(pose.rodColor);
        rod.material.color.setHex(pose.rodColor);
      }
      if (pose.floatStyle && floatKey !== pose.floatStyle.key) {
        floatKey = pose.floatStyle.key;
        float.mesh.material.color.setHex(pose.floatStyle.color);
        float.root.scale.setScalar(pose.floatStyle.scale);
      }
      let tip = null;
      if (pose.showRod) {
        let lean = 0; // 0 = rest, -1 = leaned back, +1 = forward
        if (F.phase === 'charging') lean = -0.4 - 0.6 * F.power;
        else if (F.phase === 'casting') lean = F.t < config.cast.swingS ? -1 + (2 * F.t) / config.cast.swingS : 1 - Math.min(1, (F.t - config.cast.swingS) / 0.6);
        else if (F.phase === 'reeling') lean = -0.5 + 0.2 * Math.sin(F.t * 20) * (reduced ? 0 : 1);
        else if (F.phase === 'bite') lean = fighting ? 0.3 + 0.55 * fx.tension - (reduced ? 0 : 0.07 * fx.tension * Math.sin(elapsed * 14)) : 0.2 + (reduced ? 0 : 0.15 * Math.sin(elapsed * 18));
        if (!fishing) lean = 0.15;
        const ang = 0.9 - lean * 0.55; // angle of the rod above the horizontal
        const L = pose.rodLen || 2.0;
        const h = Math.cos(ang) * L;
        tip = new THREE.Vector3(hand.x + rx * 0.25 + ax * h, hand.y + Math.sin(ang) * L, hand.z + rz * 0.25 + az * h);
        rod.position.copy(hand).add(tip).multiplyScalar(0.5);
        rod.scale.set(1, 1, L);
        rod.lookAt(tip);
      }
      float.root.visible = false;
      line.visible = false;
      bubble.root.visible = F.phase === 'bite' && !fighting;
      heldFish.visible = F.phase === 'caught';
      if (heldFish.visible) heldFish.position.set(pose.x, pose.y + 2.35 + (reduced ? 0 : 0.05 * Math.sin(elapsed * 3)), pose.z + 0.05);
      let fp = null;
      if (F.phase === 'casting' && tip) {
        const c = config.cast;
        if (F.t >= c.releaseAtS) {
          const u = Math.min(1, (F.t - c.releaseAtS) / c.flightS);
          fp = new THREE.Vector3().lerpVectors(tip, fish.land, u);
          fp.y += Math.sin(Math.PI * u) * 1.6;
        }
      } else if (F.phase === 'waiting' || F.phase === 'bite') {
        fp = fish.land.clone();
        if (!reduced) fp.y += 0.025 * Math.sin(elapsed * 2.2);
        if (F.phase === 'bite' && fighting) {
          // the fish pulls: the float shakes and dips, small splashes (calmer in reduced motion), the line is tight
          fp.y -= (reduced ? 0.05 : 0.04 + 0.05 * Math.abs(Math.sin(elapsed * 11))) * (0.5 + fx.tension);
          if (!reduced) {
            fp.x += 0.035 * fx.tension * Math.sin(elapsed * 31);
            fp.z += 0.03 * fx.tension * Math.cos(elapsed * 27);
          }
          fish.biteRipple -= dt;
          if (fish.biteRipple <= 0) {
            ripples.add(fp.x, fp.z, 0.7 + 0.5 * fx.tension);
            fish.biteRipple = reduced ? 1.6 : 0.55 - 0.25 * fx.tension;
          }
        } else if (F.phase === 'bite') {
          fp.y -= (reduced ? 0.06 : 0.07 * Math.abs(Math.sin(elapsed * 9))) * cue();
          fish.biteRipple -= dt;
          if (fish.biteRipple <= 0) {
            ripples.add(fish.land.x, fish.land.z, 0.8 * cue());
            fish.biteRipple = reduced ? 2 : 0.8;
          }
        }
      } else if (F.phase === 'reeling') {
        const u = Math.min(1, F.t / config.reel.durationS);
        fp = new THREE.Vector3().lerpVectors(fish.land, new THREE.Vector3(near.x, WATER_Y + 0.02, near.z), u);
      } else if (F.phase === 'retracting') {
        const u = Math.min(1, F.t / 0.6);
        fp = new THREE.Vector3().lerpVectors(fish.land, tip || fish.land, u);
      }
      if (fp && tip) {
        float.root.visible = true;
        float.root.position.copy(fp);
        line.visible = true;
        const a = line.geometry.attributes.position;
        const sag = F.phase === 'casting' ? 0.1 : fighting ? 0.03 : F.phase === 'bite' || F.phase === 'reeling' ? 0.15 : 0.5;
        for (let i = 0; i < LINE_N; i++) {
          const u = i / (LINE_N - 1);
          a.setXYZ(i, tip.x + (fp.x - tip.x) * u, tip.y + (fp.y + 0.12 - tip.y) * u - Math.sin(Math.PI * u) * sag, tip.z + (fp.z - tip.z) * u);
        }
        a.needsUpdate = true;
      }
      if (bubble.root.visible) bubble.root.position.set(pose.x, pose.y + 2.15 + (reduced ? 0 : 0.06 * cue() * Math.abs(Math.sin(elapsed * 6))), pose.z + 0.05);
    },
  };
}
