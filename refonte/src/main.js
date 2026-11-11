// Entry of the HD-2D game. Reads the save and the settings (shell/boot.js), builds the context and the shell (start screen, settings, journal, photo,
// sound, save: no 3D needed), checks WebGL 2 BEFORE loading three.js (without it: a short FR/EN message and a link to the 2D game, never a blank page),
// then loads the 3D app and joins it to the shell.
// Offline (brief 34, offline.js): FIRST, if this script runs on a page that is not the HD-2D page (the 2D game's worker answered this address with
// its own page), nothing of the game runs: offline.js installs this game's worker and reloads. Once the 3D game has started, the worker is
// registered (https; on this machine only with ?sw=1; never on debug pages) or removed (?nosw=1).

import { rescueForeignPage, setupOffline } from './offline.js';
import { FRAMES } from '../../src/art/framePaint.js';
import { pickLang } from '../../src/core/lang.js';
import S from './data/strings.js';
import { boot as bootSave } from './shell/boot.js';
import { createContext } from './app/settings.js';
import { createShell } from './shell/shell.js';

const t0 = performance.now();
const q = new URLSearchParams(location.search);
let session = null;
try {
  session = window.sessionStorage;
} catch {
  session = null; // storage refused: the rescue simply does not count its tries
}
const foreign = rescueForeignPage({ doc: document, nav: navigator, loc: location, store: session, reload: () => location.reload() });

function installFrames(el) {
  for (const [name, f] of Object.entries(FRAMES)) {
    const c = document.createElement('canvas');
    c.width = f.size;
    c.height = f.size;
    c.getContext('2d').putImageData(new ImageData(f.build(), f.size, f.size), 0, 0);
    el.style.setProperty('--bi-' + name, `url(${c.toDataURL()})`);
  }
}

function fallback(lang, reason) {
  const t = S[lang];
  document.getElementById('fbTitle').textContent = t['r.noWebgl.title'];
  document.getElementById('fbBody').textContent = t['r.noWebgl.body'];
  document.getElementById('fbLink').textContent = t['r.noWebgl.link'];
  document.getElementById('fallback').hidden = false;
  document.getElementById('scene').hidden = true;
  document.getElementById('app').dataset.screen = 'fallback'; // no screen of the shell shows over the message
  window.__j7 = { fallback: true, reason: String(reason || '') };
}

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ok = !!gl;
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

if (!foreign) {
  const boot = bootSave({ search: location.search, getBackend: () => window.localStorage, randomSeed: () => crypto.getRandomValues(new Uint32Array(1))[0] });
  const lang = q.get('lang') === 'en' || q.get('lang') === 'fr' ? q.get('lang') : pickLang(navigator.language, boot.settings.lang);
  document.documentElement.lang = lang;
  installFrames(document.getElementById('app'));
  const offline = () => {
    try {
      setupOffline({ win: window, nav: navigator, loc: location, query: q });
    } catch {
      /* the game never depends on the worker */
    }
  };
  if (!hasWebGL2()) {
    fallback(lang, 'no webgl2');
    if (q.get('nosw') === '1') offline(); // the escape still works on the fallback page; nothing is registered there
  } else {
    const ctx = createContext({ lang, query: q, t0, boot });
    const shell = createShell(ctx);
    import('./app.js')
      .then((m) => m.start({ ctx, shell }))
      .then(offline, (e) => {
        console.error(e);
        fallback(lang, e && e.message);
      });
  }
}
