// Input: mouse / touch / keyboard -> abstract actions
// primaryDown, primaryUp, book, settings, photo, mute, back.
// createRouter() is plain logic (no DOM) and is unit-tested; attachDom() wires it to the page.

const PRIMARY_KEYS = new Set(['space', 'enter']);

function normKey(key) {
  if (key === ' ' || key === 'Spacebar') return 'space';
  if (key === 'Enter') return 'enter';
  if (key === 'Escape' || key === 'Esc') return 'escape';
  return typeof key === 'string' ? key.toLowerCase() : '';
}

/**
 * @param {(action:string)=>void} emit
 * @param {()=>{screen:string, blocked:boolean, shortcuts:boolean}} getContext
 *   screen: 'home' | 'game' | 'book' | 'settings' | 'photo'; blocked: the portrait banner covers the game.
 */
export function createRouter(emit, getContext) {
  const held = new Set(); // sources that currently hold the primary button: 'key' or 'ptr:<id>'

  function press(source) {
    if (held.has(source)) return;
    const wasEmpty = held.size === 0;
    held.add(source);
    if (wasEmpty) emit('primaryDown');
  }
  function release(source) {
    if (!held.delete(source)) return;
    if (held.size === 0) emit('primaryUp');
  }

  return {
    /** @param {{type:'down'|'up', key:string, repeat?:boolean, target?:'canvas'|'body'|'control'|'field', mod?:boolean}} e @returns {boolean} true if the event was consumed (caller may preventDefault) */
    key(e) {
      const k = normKey(e.key);
      const ctx = getContext();
      const target = e.target || 'body';
      if (e.type === 'up') {
        if (PRIMARY_KEYS.has(k)) {
          release('key');
          return held.size === 0 && target !== 'control' && target !== 'field'; // a key-up on a button or a box keeps its native effect (Space toggles a checkbox on key-up)
        }
        return false;
      }
      if (e.repeat) return PRIMARY_KEYS.has(k) && target !== 'control' && target !== 'field'; // swallowed, never a second press
      if (PRIMARY_KEYS.has(k)) {
        if (target === 'control' || target === 'field') return false; // native click / typing keeps its effect
        if (ctx.screen !== 'game' || ctx.blocked) return false;
        press('key');
        return true;
      }
      if (k === 'escape') {
        if (ctx.screen === 'home' || ctx.blocked) return false;
        emit('back');
        return true;
      }
      if (e.mod || target === 'field' || !ctx.shortcuts || ctx.screen === 'home' || ctx.blocked) return false;
      const map = { c: 'book', r: 'settings', p: 'photo', m: 'mute' };
      if (map[k]) {
        emit(map[k]);
        return true;
      }
      return false;
    },
    /** @param {{type:'down'|'up'|'cancel', id:number, onScene?:boolean}} e */
    pointer(e) {
      const src = 'ptr:' + e.id;
      if (e.type === 'down') {
        const ctx = getContext();
        if (!e.onScene || ctx.screen !== 'game' || ctx.blocked) return;
        if ([...held].some((h) => h.startsWith('ptr:'))) return; // one finger only
        press(src);
      } else {
        release(src);
      }
    },
    /** Window blur or hidden tab: nothing stays held. */
    blur() {
      if (held.size > 0) {
        held.clear();
        emit('primaryUp');
      }
    },
    heldCount: () => held.size,
  };
}

function targetKind(el, canvas) {
  if (!el || !el.closest) return 'body';
  if (el.closest('input,select,textarea,[contenteditable="true"]')) return 'field';
  if (el.closest('button,a,summary,[role="button"]')) return 'control';
  return el === canvas ? 'canvas' : 'body';
}

/** Wires the router to the page. `sceneEl` is the game screen element (touch/mouse area). */
export function attachDom(router, { sceneEl, canvasEl }) {
  const onKey = (type) => (ev) => {
    const consumed = router.key({
      type,
      key: ev.key,
      repeat: ev.repeat,
      target: targetKind(ev.target, canvasEl),
      mod: ev.ctrlKey || ev.altKey || ev.metaKey,
    });
    if (consumed) ev.preventDefault();
  };
  document.addEventListener('keydown', onKey('down'));
  document.addEventListener('keyup', onKey('up'));
  sceneEl.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const onScene = !ev.target.closest('button,.card,a,input,label');
    router.pointer({ type: 'down', id: ev.pointerId, onScene });
    if (onScene) {
      ev.preventDefault();
      if (canvasEl && canvasEl.focus) canvasEl.focus({ preventScroll: true });
    }
  });
  window.addEventListener('pointerup', (ev) => router.pointer({ type: 'up', id: ev.pointerId }));
  window.addEventListener('pointercancel', (ev) => router.pointer({ type: 'cancel', id: ev.pointerId }));
  sceneEl.addEventListener('contextmenu', (ev) => ev.preventDefault());
  window.addEventListener('blur', () => router.blur());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) router.blur();
  });
}
