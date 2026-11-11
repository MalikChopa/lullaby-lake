// The fight in the game loop (J11): starts when the player reels a bite, steps the fight with the real frame time, hands the result back to the fishing glue.
// The fishing core is NOT stepped during a fight (the lake's clock rests; the fish's 8 s patience is frozen), so the rules of src/core/ stay untouched.
// Result: 'won' (the glue then sends the reel to the core: the normal catch flow), 'lost' / 'left' (the fish swims off and comes back: no penalty at all).

import { fork } from '../../../src/core/rng.js';
import { createFight, fightParams } from '../challenge/fight.js';

export function createFightFlow(ctx, { input, ui }) {
  const { game } = ctx;
  let F = null;
  let started = 0; // attempts so far (a different stream of luck each time)
  let info = null;
  const fx = { active: false, tension: 0, inBand: true, t: 0 };
  const flow = {
    fx,
    get active() {
      return !!F;
    },
    fight: () => F,
    info: () => info,
    ui,
    /** Begins a fight with the fish that bites (species id, size in cm). Returns false when the species is unknown. */
    begin(speciesId, cm, { auto } = {}) {
      const sp = game.speciesById(speciesId);
      if (!sp) return false;
      const params = fightParams(sp, cm, ctx.chal.gear(), { reduced: ctx.reduced, patienceMul: ctx.fightTune.patienceMul });
      const rng = fork(ctx.seed, 'fight#' + started++);
      F = createFight(params, rng, { auto: auto !== undefined ? auto : ctx.chal.autoFight() });
      info = { speciesId, cm, rarity: sp.rarity, params };
      fx.active = true;
      fx.tension = 0.3;
      fx.t = 0;
      ui.show(F.auto);
      return true;
    },
    /** One frame. Returns null while the fight goes on, else { status, perfect, speciesId, cm }. */
    step(dt) {
      if (!F) return null;
      const live = ctx.playing ? ctx.playing() : true;
      if (live && !game.isPaused() && !ctx.frozen) {
        F.step(dt, input.primaryDown || ui.held);
        fx.t += dt;
      }
      const goal = F.auto ? 0.45 : F.cue === 'in' ? 0.4 : 0.85;
      fx.tension += (goal - fx.tension) * Math.min(1, dt * 6);
      fx.inBand = F.cue === 'in';
      ui.update(F, dt, ctx.reduced);
      if (F.status === 'run') return null;
      const r = { status: F.status, perfect: F.perfect, speciesId: info.speciesId, cm: info.cm };
      flow.end();
      return r;
    },
    /** The player lets the fish go (Esc, the button). */
    leave() {
      if (F) F.giveUp();
    },
    toggleAuto() {
      if (!F) return;
      const v = !F.auto;
      F.setAuto(v);
      ui.setAuto(v);
      ctx.chal.setAuto(v);
    },
    end() {
      F = null;
      fx.active = false;
      ui.hide();
    },
  };
  ui.onLet = () => flow.leave();
  ui.onAuto = () => flow.toggleAuto();
  addEventListener('keydown', (e) => {
    if (F && e.key === 'Escape') {
      e.preventDefault();
      flow.leave();
    }
  });
  return flow;
}
