// Tooltips for the HUD (brief 27): a small label that says in words what a capsule / an icon is. Shown on mouse hover, on keyboard focus and on a long press with a
// finger (never only on hover: a phone has none); it goes away by itself. The text comes from the element's `data-tip` (kept up to date by the HUD, in the
// language of the game); the same words are in its aria-label, so the screen reader does not need the tooltip.

const LONG_PRESS_MS = 450;
const TOUCH_SHOW_MS = 2600;

/** Pure: where to put a tooltip of size (w, h) for a target rect inside a (vw, vh) window: under the target, clamped inside with a margin; above if it would not fit below. */
export function placeTip(r, w, h, vw, vh, gap = 6, margin = 6) {
  let x = r.x + r.w / 2 - w / 2;
  let y = r.y + r.h + gap;
  if (y + h > vh - margin) y = r.y - h - gap;
  x = Math.max(margin, Math.min(vw - w - margin, x));
  y = Math.max(margin, Math.min(vh - h - margin, y));
  return { x: Math.round(x), y: Math.round(y) };
}

/** The rect of an element in the layout box of `root` (offset chain: not changed by the quarter-turn transform of "Play anyway"). */
export function localRect(el, root) {
  let x = 0;
  let y = 0;
  let n = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export function createTooltips({ host, tipEl, root = document.body }) {
  let target = null;
  let hideTimer = null;
  let pressTimer = null;
  function show(el) {
    const text = el.dataset.tip;
    if (!text) return;
    target = el;
    tipEl.textContent = text;
    tipEl.hidden = false;
    const p = placeTip(localRect(el, root), tipEl.offsetWidth, tipEl.offsetHeight, root.clientWidth, root.clientHeight);
    tipEl.style.left = p.x + 'px';
    tipEl.style.top = p.y + 'px';
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  function hide() {
    target = null;
    tipEl.hidden = true;
    clearTimeout(hideTimer);
    clearTimeout(pressTimer);
  }
  const owner = (ev) => (ev.target && ev.target.closest ? ev.target.closest('[data-tip]') : null);
  host.addEventListener('pointerover', (ev) => {
    const el = owner(ev);
    if (el && ev.pointerType === 'mouse') show(el);
  });
  host.addEventListener('pointerout', (ev) => {
    if (ev.pointerType === 'mouse' && owner(ev)) hide();
  });
  host.addEventListener('focusin', (ev) => {
    const el = owner(ev);
    if (el) show(el);
  });
  host.addEventListener('focusout', hide);
  host.addEventListener('pointerdown', (ev) => {
    const el = owner(ev);
    if (!el || ev.pointerType === 'mouse') return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      show(el);
      hideTimer = setTimeout(hide, TOUCH_SHOW_MS);
    }, LONG_PRESS_MS);
  });
  for (const t of ['pointerup', 'pointercancel']) host.addEventListener(t, () => clearTimeout(pressTimer));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && target) hide();
  });
  return { show, hide, shown: () => (target ? target.dataset.tip : null) };
}
