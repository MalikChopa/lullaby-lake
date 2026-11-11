// Focus rules of the panels (brief 33), pure (unit-tested): where Tab goes at the edge of an open panel, and where the focus returns when a panel closes.
//   wrapTab     Tab on the last control goes to the first, Shift+Tab on the first goes to the last (the panel keeps the focus: a modal dialog); anywhere else the
//               browser moves it. When the focus is not inside the panel at all (a click on the dim layer), Tab brings it back to the first control.
//   returnTo    when a panel closes, the focus goes back to the control that had it when the panel opened (a capsule of the HUD, the context button...), if it is
//               still there and usable; otherwise to the game picture. Never to the Menu button or an entry of the menu: a focused button would take Space away
//               from casting (brief 27), and the menu has closed.

/** Index to focus after Tab (or Shift+Tab) among `n` controls, the focus being on `i` (-1 = outside the panel). null = let the browser move it. */
export function wrapTab(i, n, shift) {
  if (n <= 0) return null;
  if (i < 0) return shift ? n - 1 : 0;
  if (shift && i === 0) return n - 1;
  if (!shift && i === n - 1) return 0;
  return null;
}

/** Which element gets the focus back when a panel closes. `opener`: what had it when the panel opened; `usable(el)`: still on screen and focusable. */
export function returnTo(opener, { usable, fallback, never = [] }) {
  if (opener && opener !== fallback && !never.some((x) => x === opener || (typeof x === 'function' && x(opener))) && usable(opener)) return opener;
  return fallback;
}
