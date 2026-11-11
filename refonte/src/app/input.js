// Input: keyboard (arrows / WASD, physical keys so ZQSD on AZERTY; Q / E physical keys turn the view = A / E on AZERTY), mouse wheel
// zoom, mouse click = walk there; touch: a floating stick (drag on the left 60 % of the screen), a TAP anywhere = walk there (path on
// the navigation grid), pinch zoom; the "Fish" button, the turn buttons, the card's release button; an optional gamepad (left stick,
// A = fish, shoulders = turn). Holds the primary-button edges for the fishing core.

import { CAMERA } from '../data/params.js';
import { zoomBy } from '../logic/camera.js';
import { toLocal, viewSize } from './viewport.js';

export const MOVE_CODES = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

export function createInput(ctx, view) {
  const { $ } = ctx;
  const canvas = view.canvas;
  // J9-A: the shell decides when the game listens (game screen, after Start); otherwise keys, taps and the stick do nothing
  const live = () => (ctx.playing ? ctx.playing() : true) && !I.frozen;
  const I = {
    frozen: false, // brief 29: true during a door's fade (keys, stick and taps wait; a key still held counts again only after a new press)
    keys: new Set(),
    primaryDown: false,
    pending: { down: false, up: false },
    zoomGoal: CAMERA.distance,
    stick: { id: null, x0: 0, y0: 0, dx: 0, dz: 0 },
    touchUsed: false,
    onFirstTouch: null,
    onTap: null, // (x, y) in the picture box -> walk there
    onTurn: null, // (+1 | -1)
    pad: { x: 0, z: 0, a: false, l: false, r: false },
    /** Summed walking intent (keys + stick), in screen axes: x right, z down. */
    axes() {
      if (I.frozen) return [0, 0];
      let ix = 0;
      let iz = 0;
      for (const k of I.keys) {
        ix += MOVE_CODES[k][0];
        iz += MOVE_CODES[k][1];
      }
      return [ix + I.stick.dx + I.pad.x, iz + I.stick.dz + I.pad.z];
    },
    /** Gamepad: polled once per frame (left stick, A = fish, LB / RB = turn). */
    pollPad() {
      const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
      if (!gp) {
        I.pad.x = 0;
        I.pad.z = 0;
        return;
      }
      const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
      I.pad.x = dz(gp.axes[0] || 0);
      I.pad.z = dz(gp.axes[1] || 0);
      const a = !!(gp.buttons[0] && gp.buttons[0].pressed);
      if (a !== I.pad.a) pressPrimary(a);
      I.pad.a = a;
      const l = !!(gp.buttons[4] && gp.buttons[4].pressed);
      const r = !!(gp.buttons[5] && gp.buttons[5].pressed);
      if (l && !I.pad.l && I.onTurn) I.onTurn(1);
      if (r && !I.pad.r && I.onTurn) I.onTurn(-1);
      I.pad.l = l;
      I.pad.r = r;
    },
  };
  const pressPrimary = (down) => {
    if (down && !I.primaryDown) {
      I.primaryDown = true;
      I.pending.down = true;
    } else if (!down && I.primaryDown) {
      I.primaryDown = false;
      I.pending.up = true;
    }
  };
  I.pressPrimary = pressPrimary;
  /** Nothing stays held (a screen opened, the tab hid): keys, stick, the primary button. An unfinished charge is released so the line is cast. */
  I.reset = () => {
    I.keys.clear();
    I.stick.id = null;
    I.stick.dx = 0;
    I.stick.dz = 0;
    $('stick').hidden = true;
    if (I.primaryDown) pressPrimary(false);
  };
  addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || !live()) return;
    if (MOVE_CODES[e.code]) {
      I.keys.add(e.code);
      e.preventDefault();
    } else if ((e.code === 'KeyQ' || e.code === 'KeyE') && !e.repeat) {
      if (I.onTurn) I.onTurn(e.code === 'KeyQ' ? 1 : -1);
    } else if (e.code === 'Space' || e.code === 'Enter') {
      if (tag === 'BUTTON' || tag === 'A') return; // a focused button keeps its own Space / Enter
      e.preventDefault();
      if (!e.repeat) pressPrimary(true);
    }
  });
  addEventListener('keyup', (e) => {
    I.keys.delete(e.code);
    if (e.code === 'Space' || e.code === 'Enter') pressPrimary(false);
  });
  addEventListener('blur', () => {
    I.keys.clear();
    pressPrimary(false);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    I.zoomGoal = zoomBy(I.zoomGoal, Math.sign(e.deltaY) * 0.12, CAMERA.minDistance, CAMERA.maxDistance);
  }, { passive: false });
  // touch: a floating stick where the thumb lands on the left 60 % of the screen; two fingers = pinch zoom
  const stick = I.stick;
  const pinch = { d: 0 };
  const taps = new Map(); // touch id -> where / when it started (tap = short and still)
  const stickEl = $('stick');
  const knob = $('stickKnob');
  canvas.addEventListener('touchstart', (e) => {
    if (e.cancelable) e.preventDefault(); // (a touch that cannot be cancelled - a scroll already under way - is left alone: no console warning)
    if (!live()) return;
    if (!I.touchUsed) {
      I.touchUsed = true;
      for (const id of ['fishBtn', 'turnL', 'turnR']) if ($(id)) $(id).hidden = false;
      $('app').dataset.touch = '1'; // the touch cluster (styles.css): the big Fish button, the small context button above it, the turn buttons
    }
    if (e.touches.length === 2) {
      pinch.d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      stick.id = null;
      stickEl.hidden = true;
      return;
    }
    const tt = e.changedTouches[0];
    taps.set(tt.identifier, { x: tt.clientX, y: tt.clientY, t: performance.now(), moved: false });
    const [lx, ly] = toLocal(tt.clientX, tt.clientY); // the box may be turned a quarter turn ("Play anyway")
    if (stick.id === null && lx < viewSize().w * 0.6) {
      stick.id = tt.identifier;
      stick.x0 = tt.clientX;
      stick.y0 = tt.clientY;
      stick.dx = 0;
      stick.dz = 0;
      stick.on = false; // shown once the thumb drags (a tap never shows it)
      stickEl.style.left = lx + 'px';
      stickEl.style.top = ly + 'px';
      knob.style.transform = '';
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault();
    if (!live()) return;
    if (e.touches.length === 2 && pinch.d) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      I.zoomGoal = zoomBy(I.zoomGoal, Math.log(pinch.d / d), CAMERA.minDistance, CAMERA.maxDistance);
      pinch.d = d;
      return;
    }
    for (const tt of e.changedTouches) {
      const tp = taps.get(tt.identifier);
      if (tp && Math.hypot(tt.clientX - tp.x, tt.clientY - tp.y) > 12) tp.moved = true;
      if (tt.identifier !== stick.id) continue;
      let dx = tt.clientX - stick.x0;
      let dy = tt.clientY - stick.y0;
      const l = Math.hypot(dx, dy);
      if (!stick.on && l > 12) {
        stick.on = true;
        stickEl.hidden = false;
      }
      if (!stick.on) continue;
      const R = 50;
      if (l > R) {
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      // the screen drag (dx, dy) in the box: a turned box swaps the axes (box x = screen y, box y = -screen x)
      const [bx, by] = toLocal(dx, dy).map((v, i) => v - toLocal(0, 0)[i]);
      stick.dx = l < 8 ? 0 : bx / R;
      stick.dz = l < 8 ? 0 : by / R;
      knob.style.transform = `translate(${bx}px, ${by}px)`;
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const tt of e.changedTouches) {
      const tp = taps.get(tt.identifier);
      taps.delete(tt.identifier);
      if (e.type === 'touchend' && tp && !tp.moved && performance.now() - tp.t < 350 && e.touches.length === 0 && !pinch.d && I.onTap && live()) I.onTap(...toLocal(tt.clientX, tt.clientY));
      if (tt.identifier === stick.id) {
        stick.id = null;
        stick.dx = 0;
        stick.dz = 0;
        stickEl.hidden = true;
      }
    }
    if (e.touches.length < 2) pinch.d = 0;
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);
  // the thumb cluster (brief 27): the big "Fish" button (hold to cast, reel, fight) and the small context button above it (Talk / Enter / Climb): the same press, two places
  for (const id of ['fishBtn', 'ctxBtn']) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (live()) pressPrimary(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => pressPrimary(false));
    // brief 33: a keyboard (or switch / screen-reader) activation of the same button is one short press (a click with detail 0 has no pointer before it)
    b.addEventListener('click', (e) => {
      if (e.detail !== 0 || !live()) return;
      pressPrimary(true);
      requestAnimationFrame(() => requestAnimationFrame(() => pressPrimary(false)));
    });
  }
  // brief 33: a long press on the picture or on a held button never opens the browser's menu (Android shows one on a canvas: "save image")
  for (const el of [canvas, $('fishBtn'), $('ctxBtn'), $('fightHold')]) if (el) el.addEventListener('contextmenu', (e) => e.preventDefault());
  // mouse: a click on the world walks there (touch taps are handled above)
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' && e.button === 0 && I.onTap && live()) I.onTap(...toLocal(e.clientX, e.clientY));
  });
  for (const [id, dir] of [['turnL', 1], ['turnR', -1]]) {
    const el = $(id);
    if (el) el.addEventListener('click', () => I.onTurn && I.onTurn(dir));
  }
  $('cardRelease').addEventListener('click', () => {
    I.pending.down = true;
  });
  return I;
}
