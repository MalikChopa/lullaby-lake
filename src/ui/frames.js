// Pixel frames of the interface: draws the 9-slice images (art/framePaint.js) and hands them to CSS as custom properties
// (--bi-panel, --bi-slot, --bi-btn, --bi-btn2), used by border-image in styles.css. No image file.

import { FRAMES } from '../art/framePaint.js';

export function installFrames(el) {
  for (const [name, f] of Object.entries(FRAMES)) {
    const c = document.createElement('canvas');
    c.width = f.size;
    c.height = f.size;
    c.getContext('2d').putImageData(new ImageData(f.build(), f.size, f.size), 0, 0);
    el.style.setProperty('--bi-' + name, `url(${c.toDataURL()})`);
  }
}
