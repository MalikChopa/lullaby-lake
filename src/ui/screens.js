// The five screens of the mock-up: home, game, book, settings, photo.
// Shows one at a time, keeps the focus inside the open panel, gives the focus back to the scene on closing.

const NAMES = ['home', 'game', 'book', 'settings', 'photo'];
const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),[href],select,textarea,[tabindex]:not([tabindex="-1"])';

export function createScreens({ stage, canvas, onChange }) {
  let current = 'home';
  const el = (n) => stage.querySelector('#s-' + n);

  function focusIn(name) {
    if (name === 'game') {
      canvas.focus({ preventScroll: true });
      return;
    }
    const first = el(name).querySelector(FOCUSABLE);
    if (first) first.focus({ preventScroll: true });
  }

  function show(name) {
    if (!NAMES.includes(name)) return;
    current = name;
    for (const n of NAMES) el(n).classList.toggle('on', n === name);
    if (name !== 'home') focusIn(name);
    onChange(name);
  }

  // Tab stays inside the open panel
  stage.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab' || current === 'game' || current === 'home') return;
    const items = [...el(current).querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });

  stage.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-go]');
    if (b) show(b.dataset.go);
  });

  return { show, current: () => current };
}
