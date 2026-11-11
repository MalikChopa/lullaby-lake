// The dialogue box (J12-A): a pixel-art box at the bottom of the screen with the speaker's name, a gentle typewriter reveal (instant in reduced motion; any key or tap
// finishes the line), the choices as big buttons (arrows + Enter, touch, >= 44 px), "Suite" / "Plus tard" / "Historique". The logic is story/dialogue.js (pure);
// this file only draws it. Nothing is carried by colour or sound alone, the live region announces "name: line", nothing presses the player (no timer but the reveal).
//   Keyboard: Enter / Space = finish the line, then next; arrows Up / Down = choices; Escape (the shell's router) = later. Touch: tap the box finishes a line.

import { drawEco } from '../art/ecoIcons.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const CPS = 55; // characters per second of the reveal
const ICONS = { biscotte: 'cat', dormeur: 'spirit', narr: 'quill' };

/**
 * @param {{ root: HTMLElement, t: Function, runner: object, say: (s: string) => void, reduced: () => boolean, face: (canvas: HTMLCanvasElement, speaker: string) => boolean,
 *   onEnded: (info: { id: string, reason: string }) => void, sfx?: (n: string) => void }} o
 */
export function createDialogueUi({ root, t, runner, say, reduced, face, onEnded }) {
  const $ = (sel) => root.querySelector(sel);
  const box = $('#dlgBox');
  const nameEl = $('#dlgName');
  const shown = $('#dlgShown');
  const rest = $('#dlgRest');
  const choicesEl = $('#dlgChoices');
  const nextB = $('#dlgNext');
  const histB = $('#dlgHist');
  const laterB = $('#dlgLater');
  const histBox = $('#dlgHistory');
  const faceC = $('#dlgFace');
  const iconC = $('#dlgIcon');
  let open = false;
  let view = null;
  let full = '';
  let n = 0;
  let raf = 0;
  let last = 0;
  let typing = false;

  const nameOf = (speaker) => (speaker === 'narr' ? '' : t('story.char.' + speaker));
  const textOf = (v) => t(v.textKey, v.vars);

  function stopTyping() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    typing = false;
  }
  function paint() {
    shown.textContent = full.slice(0, n);
    rest.textContent = full.slice(n);
  }
  function settle() {
    // the line is complete: the choices or "Suite" wake up and take the focus
    typing = false;
    n = full.length;
    paint();
    choicesEl.hidden = !view.choices.length;
    nextB.hidden = view.choices.length > 0;
    nextB.textContent = t(view.last ? 'story.ui.end' : 'story.ui.next');
    const first = view.choices.length ? choicesEl.querySelector('button') : nextB;
    if (first && open) first.focus({ preventScroll: true });
  }
  function tick(now) {
    raf = 0;
    if (!typing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    n = Math.min(full.length, n + Math.max(1, Math.round(CPS * dt)));
    paint();
    if (n >= full.length) settle();
    else raf = requestAnimationFrame(tick);
  }
  function finishLine() {
    if (!typing) return false;
    stopTyping();
    settle();
    return true;
  }
  function render() {
    const name = nameOf(view.speaker);
    nameEl.textContent = name;
    nameEl.hidden = !name;
    // brief 33: the dialog is named by the speaker; the narrator has no name, so the dialog says "Conversation" (never an unnamed dialog)
    if (name) {
      root.setAttribute('aria-labelledby', 'dlgName');
      root.removeAttribute('aria-label');
    } else {
      root.removeAttribute('aria-labelledby');
      root.setAttribute('aria-label', t('story.ui.dialogue'));
    }
    const icon = ICONS[view.speaker];
    faceC.hidden = true;
    iconC.hidden = true;
    if (icon) {
      drawEco(iconC, icon, '#ffd987');
      iconC.hidden = false;
    } else faceC.hidden = !face(faceC, view.speaker);
    full = textOf(view);
    say(name ? t('story.ui.say', { name, text: full }) : t('story.ui.sayNarr', { text: full }));
    choicesEl.textContent = '';
    for (const c of view.choices) {
      const b = el('button', 'btn alt dlg-choice', t(c.textKey, view.vars));
      b.type = 'button';
      b.dataset.i = String(c.i);
      b.addEventListener('click', () => choose(c.i));
      choicesEl.append(b);
    }
    choicesEl.hidden = true;
    nextB.hidden = true;
    n = 0;
    stopTyping();
    if (reduced()) {
      settle();
      return;
    }
    typing = true;
    paint();
    last = performance.now();
    raf = requestAnimationFrame(tick);
    box.focus({ preventScroll: true }); // the box holds the focus while the line appears; a button gets it when the line is complete
  }
  function go(choiceIndex) {
    const r = runner.advance(choiceIndex);
    if (!r || r.ended) {
      open = false;
      stopTyping();
      onEnded({ id: null, reason: (r && r.reason) || 'done' });
      return;
    }
    view = r;
    render();
    if (!histBox.hidden) renderHistory();
  }
  const choose = (i) => go(i);
  function renderHistory() {
    const list = $('#dlgHistList');
    list.textContent = '';
    for (const h of runner.history().slice(-10)) {
      const p = el('p', 'dlg-h');
      const nm = nameOf(h.speaker);
      if (nm) p.append(el('b', '', nm + ' : '));
      p.append(document.createTextNode(t(h.textKey, h.vars)));
      list.append(p);
    }
    list.scrollTop = list.scrollHeight;
  }
  nextB.addEventListener('click', () => {
    if (!finishLine()) go();
  });
  laterB.addEventListener('click', () => {
    runner.close();
    open = false;
    stopTyping();
    onEnded({ id: null, reason: 'later' });
  });
  histB.addEventListener('click', () => {
    histBox.hidden = !histBox.hidden;
    histB.setAttribute('aria-expanded', String(!histBox.hidden));
    if (!histBox.hidden) renderHistory();
  });
  $('#dlgHistClose').addEventListener('click', () => {
    histBox.hidden = true;
    histB.setAttribute('aria-expanded', 'false');
    histB.focus({ preventScroll: true });
  });
  // a tap on the box (not on a button) finishes the line
  box.addEventListener('pointerdown', (ev) => {
    if (typing && !ev.target.closest('button')) finishLine();
  });
  document.addEventListener(
    'keydown',
    (ev) => {
      if (!open || ev.ctrlKey || ev.altKey || ev.metaKey) return;
      const k = ev.key;
      if (k === 'Enter' || k === ' ' || k === 'ArrowRight') {
        if (typing) {
          ev.preventDefault();
          ev.stopPropagation();
          if (!ev.repeat) finishLine();
          return;
        }
        if (ev.target && ev.target.closest && ev.target.closest('button')) return; // a focused button keeps its own Enter / Space
        if (view && !view.choices.length) {
          ev.preventDefault();
          ev.stopPropagation();
          if (!ev.repeat) go();
        }
      } else if (k === 'ArrowDown' || k === 'ArrowUp') {
        const bs = [...choicesEl.querySelectorAll('button')];
        if (!bs.length || typing) return;
        ev.preventDefault();
        const i = bs.indexOf(document.activeElement);
        const j = i < 0 ? (k === 'ArrowDown' ? 0 : bs.length - 1) : Math.max(0, Math.min(bs.length - 1, i + (k === 'ArrowDown' ? 1 : -1)));
        bs[j].focus();
      }
    },
    true,
  );

  return {
    /** Shows the first view of a started dialogue (the shell already switched the screen). */
    open(v) {
      open = true;
      view = v;
      histBox.hidden = true;
      histB.setAttribute('aria-expanded', 'false');
      render();
    },
    /** The screen closed (Escape, a button, the end): stops the reveal; the runner is closed by the caller. */
    close() {
      open = false;
      stopTyping();
      histBox.hidden = true;
    },
    /** The language changed: the same line in the new language (the reveal is not replayed). */
    applyLang() {
      $('#dlgHistTitle').textContent = t('story.ui.historyTitle');
      $('#dlgHistClose').textContent = t('story.ui.historyClose');
      histB.textContent = t('story.ui.history');
      laterB.textContent = t('story.ui.later');
      $('#dlgHelp').textContent = t('story.ui.help');
      $('#dlgBox').setAttribute('aria-label', t('story.ui.dialogue'));
      if (!root.hasAttribute('aria-labelledby')) root.setAttribute('aria-label', t('story.ui.dialogue'));
      if (open && view) {
        const was = typing;
        stopTyping();
        full = textOf(view);
        nameEl.textContent = nameOf(view.speaker);
        n = full.length;
        paint();
        [...choicesEl.querySelectorAll('button')].forEach((b, i) => (b.textContent = t(view.choices[i].textKey, view.vars)));
        nextB.textContent = t(view.last ? 'story.ui.end' : 'story.ui.next');
        if (was) settle();
        if (!histBox.hidden) renderHistory();
      }
    },
    finishLine,
    isOpen: () => open,
    state: () => ({ open, typing, name: nameEl.hidden ? '' : nameEl.textContent, text: full, shown: shown.textContent, choices: [...choicesEl.querySelectorAll('button')].map((b) => b.textContent), next: nextB.hidden ? '' : nextB.textContent, speaker: view ? view.speaker : null, node: view ? view.node : null, history: !histBox.hidden }),
  };
}
