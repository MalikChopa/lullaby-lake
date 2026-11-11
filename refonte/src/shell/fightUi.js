// The fight overlay (J11): a pixel frame with the bar, the fish's zone (a BRACKETED band: shape + text, never colour alone), the marker, the text cue
// ("Dans la zone ! / Trop haut / Trop bas"), the catch percentage, a big "hold" button (mouse, touch), the auto-mode switch and "Let it go".
// Keyboard: the action key (Space / Enter) is read by the input module (held = rise); Escape lets the fish go (the flow listens). Pure DOM, no rules.

export function createFightUi({ $, t, say }) {
  const root = $('fight');
  const hold = $('fightHold');
  const autoBtn = $('fightAuto');
  const letBtn = $('fightLet');
  const band = $('fightBand');
  const mark = $('fightMark');
  const prog = $('fightProg');
  const U = { held: false, onAuto: null, onLet: null, shown: false };
  let lastCue = '';
  let lastSayAt = -1e9;
  let wall = 0;
  let autoOn = false;
  let lastPct = -1;

  function texts() {
    $('fightTitle').textContent = t('chal.fight.title');
    $('fightHelp').textContent = t('chal.fight.help');
    hold.textContent = t('chal.fight.hold');
    letBtn.textContent = t('chal.fight.let');
    autoBtn.textContent = t(autoOn ? 'chal.fight.autoOn' : 'chal.fight.autoOff');
    autoBtn.setAttribute('aria-pressed', String(autoOn));
    prog.setAttribute('aria-label', t('chal.fight.title'));
  }
  const press = (v) => {
    U.held = v;
    hold.classList.toggle('down', v);
  };
  hold.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      hold.setPointerCapture(e.pointerId);
    } catch {
      /* no capture: the leave event releases it */
    }
    press(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) hold.addEventListener(ev, () => press(false));
  hold.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) press(true);
    }
  });
  hold.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      press(false);
    }
  });
  hold.addEventListener('blur', () => press(false));
  autoBtn.addEventListener('click', () => U.onAuto && U.onAuto());
  letBtn.addEventListener('click', () => U.onLet && U.onLet());
  // keep a keyboard / mouse user on the game: the focus stays on the canvas unless they go to a button
  return Object.assign(U, {
    applyLang: texts,
    /** Shows the overlay for a new fight. */
    show(auto) {
      U.shown = true;
      autoOn = !!auto;
      lastCue = '';
      lastPct = -1;
      lastSayAt = wall;
      texts();
      root.hidden = false;
      $('app').dataset.fight = '1';
      press(false);
      say(t(auto ? 'chal.fight.autoRun' : 'chal.fight.live'));
    },
    hide() {
      U.shown = false;
      root.hidden = true;
      delete $('app').dataset.fight;
      press(false);
      if (document.activeElement && root.contains(document.activeElement)) $('scene').focus({ preventScroll: true });
    },
    setAuto(v) {
      autoOn = !!v;
      texts();
    },
    /** One frame: the bar, the band, the marker, the cue, the percentage (the live region hears a change of cue at most every 2.5 s). */
    update(F, dt, reduced) {
      wall += dt;
      band.style.bottom = ((F.c - F.w / 2) * 100).toFixed(2) + '%';
      band.style.height = (F.w * 100).toFixed(2) + '%';
      mark.style.bottom = (F.pos * 100).toFixed(2) + '%';
      const cue = F.auto ? 'in' : F.cue;
      root.dataset.cue = cue;
      const pct = Math.round(F.progress * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        prog.firstElementChild.style.width = pct + '%';
        prog.setAttribute('aria-valuenow', String(pct));
        $('fightPct').textContent = t('chal.fight.progress', { n: pct });
      }
      if (cue !== lastCue) {
        lastCue = cue;
        $('fightCue').textContent = t('chal.cue.' + cue);
        if (!F.auto && wall - lastSayAt > 2.5) {
          lastSayAt = wall;
          say(t('chal.cue.' + cue));
        }
      }
      root.classList.toggle('calm', !!reduced);
    },
    /** Text of the cue now (for the checks). */
    cueText: () => $('fightCue').textContent,
  });
}
