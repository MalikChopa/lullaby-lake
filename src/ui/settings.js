// Settings screen: language, text size, three volume sliders (ambience, effects, music, shown as numbers), mute, reduced motion,
// "let the fish wait", keyboard shortcuts. The home screen also has a FR / EN switch (same setting).
// The settings live in ONE object (keys = those of the save format, core/save.js): main.js fills it from the save at start
// and writes it back (debounced) on every change.

export { defaultSettings } from '../core/save.js';

const VOLUMES = [['ambience', 'volAmbience', 'outAmbience'], ['fx', 'volFx', 'outFx'], ['music', 'volMusic', 'outMusic']];

export function createSettingsUi({ root, homeLang, settings, systemReducedMotion, getLang, onChange }) {
  const segLang = root.querySelector('#segLang');
  const segSize = root.querySelector('#segSize');
  const segStyle = root.querySelector('#segStyle');
  const chkRm = root.querySelector('#chkRm');
  const chkWait = root.querySelector('#chkWait');
  const chkKeys = root.querySelector('#chkKeys');
  const chkMute = root.querySelector('#chkMute');

  function reflect() {
    for (const b of segLang.querySelectorAll('button')) {
      const v = b.dataset.lang === 'auto' ? null : b.dataset.lang;
      b.setAttribute('aria-pressed', String(v === settings.lang));
    }
    for (const b of segSize.querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.fs) === settings.textScale));
    for (const b of segStyle.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.style === settings.musicStyle));
    for (const b of homeLang.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.hl === getLang()));
    chkRm.checked = settings.reducedMotion === null ? systemReducedMotion() : settings.reducedMotion;
    chkWait.checked = settings.fishWaitsForever;
    chkKeys.checked = settings.shortcuts;
    chkMute.checked = settings.muted;
    for (const [key, id, out] of VOLUMES) {
      const input = root.querySelector('#' + id);
      input.value = String(settings[key]);
      input.setAttribute('aria-valuetext', String(settings[key]));
      root.querySelector('#' + out).textContent = String(settings[key]);
    }
  }
  for (const [key, id, out] of VOLUMES) {
    root.querySelector('#' + id).addEventListener('input', (ev) => {
      settings[key] = Number(ev.target.value);
      root.querySelector('#' + out).textContent = String(settings[key]);
      ev.target.setAttribute('aria-valuetext', String(settings[key]));
      onChange('volume', key);
    });
  }
  chkMute.addEventListener('change', () => {
    settings.muted = chkMute.checked;
    onChange('muted');
  });
  segLang.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    settings.lang = b.dataset.lang === 'auto' ? null : b.dataset.lang;
    onChange('lang');
    reflect();
  });
  homeLang.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    settings.lang = b.dataset.hl;
    onChange('lang');
    reflect();
  });
  segSize.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    settings.textScale = Number(b.dataset.fs);
    reflect();
    onChange('textScale');
  });
  segStyle.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    settings.musicStyle = b.dataset.style;
    reflect();
    onChange('musicStyle');
  });
  chkRm.addEventListener('change', () => {
    settings.reducedMotion = chkRm.checked;
    onChange('reducedMotion');
  });
  chkWait.addEventListener('change', () => {
    settings.fishWaitsForever = chkWait.checked;
    onChange('fishWaitsForever');
  });
  chkKeys.addEventListener('change', () => {
    settings.shortcuts = chkKeys.checked;
    onChange('shortcuts');
  });
  reflect();
  return { reflect };
}
