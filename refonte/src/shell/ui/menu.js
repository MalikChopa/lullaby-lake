// The game menu (brief 27): ONE clearly labelled "Menu" button (top right) opens a short list with words, an icon and the key of each entry: Carnet (C), Histoire et
// commandes (O), Sac et matériel (B), Photo (P), Réglages (R). It replaces the four unlabeled icon buttons. Keyboard: Up / Down / Home / End move, Tab stays inside,
// Escape closes (the panel stack of panelStack.js) and the focus goes back to `returnTo()` (the game canvas: a focused Menu button would take Space away from casting). The game is paused while it is open (a quiet moment, nothing is lost).

import { wireNav } from './listNav.js';

export function createMenu({ wrap, button, stack, onOpen, onClose, returnTo }) {
  const nav = wrap.querySelector('#menu');
  const items = () => [...nav.querySelectorAll('button:not([disabled])')].filter((n) => !n.hidden);
  let isOpen = false;
  function open() {
    if (isOpen) return;
    isOpen = true;
    wrap.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    stack.open('menu', () => close(true, true));
    if (onOpen) onOpen();
    const first = items()[0];
    if (first) first.focus({ preventScroll: true });
  }
  /** `fromStack`: the stack already removed the layer. `focusBack`: the focus returns to the Menu button (not when an entry opened another screen). */
  function close(focusBack = true, fromStack = false) {
    if (!isOpen) return;
    isOpen = false;
    wrap.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (!fromStack) stack.drop('menu');
    if (onClose) onClose();
    if (focusBack) (returnTo ? returnTo() : button).focus({ preventScroll: true });
  }
  button.addEventListener('click', () => (isOpen ? close() : open()));
  wrap.querySelector('#menuBackdrop').addEventListener('click', () => close());
  wireNav(nav, 'button', { wrap: true });
  nav.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab') return;
    const list = items();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });
  return { open, close, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen };
}
