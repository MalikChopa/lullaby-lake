// The context hint of the HUD (brief 27): ONE line at the bottom centre that shows only when it helps and then fades, instead of two permanent help bars.
// Pure (unit-tested): the HUD gives it, every frame, the line the game would say and what KIND of line it is; it answers whether to show it.
//   kind   'none'    nothing to say
//          'walk'    how to walk (shown for a few seconds when the walking starts, then it fades; never in the calm interface)
//          'near'    a door, a person, the boat: the thing you can do here (shown while you stay close, fades after a while, back when you come again)
//          'spot'    a fishing spot (the cast hint)
//          'phase'   the line is out: wait / reel / release (shown for a few seconds at each change)
//          'urgent'  a bite, a fight: shown for as long as it lasts
// Toasts and hints never show together: slot() decides which of the two is on screen (a toast wins; the hint comes back after it).

export const HOLD_S = Object.freeze({ walk: 7, near: 14, spot: 14, phase: 6, urgent: Infinity });

export function createHintState({ hold = HOLD_S } = {}) {
  let kind = 'none';
  let text = '';
  let age = 0;
  return {
    /** dt in seconds; returns { show, text, kind }. `calm` = the "interface discrète" option. */
    step(dt, line, lineKind, calm = false) {
      const k = line ? lineKind || 'near' : 'none';
      if (k !== kind || (k !== 'none' && line !== text)) {
        kind = k;
        age = 0;
      } else age += dt;
      text = line || '';
      if (kind === 'none') return { show: false, text: '', kind };
      if (calm && kind === 'walk') return { show: false, text, kind };
      return { show: age < (hold[kind] ?? 6), text, kind };
    },
    reset() {
      kind = 'none';
      text = '';
      age = 0;
    },
    kind: () => kind,
  };
}

/** Which of the two messages is on screen: a toast first, else the hint when it shows, else nothing. */
export function slot({ toast, hint }) {
  if (toast) return { which: 'toast', text: toast };
  if (hint && hint.show && hint.text) return { which: 'hint', text: hint.text };
  return { which: 'none', text: '' };
}
