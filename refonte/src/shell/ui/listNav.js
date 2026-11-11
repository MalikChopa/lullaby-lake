// Keyboard moves inside a list, a row of tabs or a grid (brief 27). `nextIndex` is pure (unit-tested); `wireNav` is the small DOM part.
//   vertical list : Up / Down (Left / Right do nothing unless `horizontal`), Home / End, PageUp / PageDown jump by 5
//   row of tabs   : Left / Right (wrap), Home / End
//   grid (cols)   : the four arrows, Home / End

/** The index to focus after `key`, or null when the key is not a move. `o`: { cols = 1, horizontal = false, wrap = false, page = 5 }. */
export function nextIndex(i, n, key, o = {}) {
  if (n <= 0) return null;
  const { cols = 1, horizontal = false, wrap = false, page = 5 } = o;
  const last = n - 1;
  const clamp = (v) => (wrap ? ((v % n) + n) % n : Math.max(0, Math.min(last, v)));
  const cur = Math.max(0, Math.min(last, i < 0 ? 0 : i));
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'PageUp':
      return horizontal || cols > 1 ? null : clamp(cur - page);
    case 'PageDown':
      return horizontal || cols > 1 ? null : clamp(cur + page);
    case 'ArrowUp':
      return horizontal ? null : clamp(cur - cols);
    case 'ArrowDown':
      return horizontal ? null : clamp(cur + cols);
    case 'ArrowLeft':
      return horizontal || cols > 1 ? clamp(cur - 1) : null;
    case 'ArrowRight':
      return horizontal || cols > 1 ? clamp(cur + 1) : null;
    default:
      return null;
  }
}

/** Arrow-key movement among the elements of `container` matching `selector` (re-queried at every key: lists are redrawn). Returns a function that removes it. */
export function wireNav(container, selector, o = {}) {
  const onKey = (ev) => {
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const items = [...container.querySelectorAll(selector)].filter((n) => !n.disabled && n.offsetParent !== null);
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const j = nextIndex(i, items.length, ev.key, o);
    if (j === null || j === i) {
      if (j === i && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) ev.preventDefault();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    items[j].focus({ preventScroll: false });
    if (items[j].scrollIntoView) items[j].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}
