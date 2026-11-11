// "Sac et matériel" (brief 27): where the numbers that the HUD no longer keeps on screen live: the purse, the bucket and its value, the equipped gear and the wear of the
// line and the rod (an icon, a number, a word and a bar: never colour alone). Read-only: nothing here changes the game; it names the Atelier and the shop for what to do.
// Rows are plain elements; the panel scrolls when the text is big.

import { drawAny } from '../../art/uiIcons.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** Pure: the numbers of the bag from the economy and challenge states. */
export function bagData(eco, chal, bucketValue) {
  const q = eco.equipped;
  return {
    money: eco.money,
    fish: eco.bucket.length,
    value: bucketValue,
    rod: q.rod,
    bait: q.bait,
    baitCount: q.bait !== 'ver' ? eco.gear.baits[q.bait] || 0 : null,
    float: q.float || null,
    lantern: eco.gear.lantern ? !!q.lantern : null,
    wearLine: Math.round(chal.wear.line),
    wearRod: Math.round(chal.wear.rod),
  };
}

export function createBagView({ root, t, eco, chal, summary, condWord }) {
  const body = root.querySelector('#bagBody');
  const icon = (name) => {
    const c = el('canvas', 'ic s');
    c.setAttribute('aria-hidden', 'true');
    drawAny(c, name, '#fdf2dc');
    return c;
  };
  const row = (iconName, label, value, extra) => {
    const r = el('div', 'brow');
    r.append(icon(iconName), el('span', 'blabel', label), el('span', 'bval', value));
    if (extra) r.append(extra);
    return r;
  };
  const wearBar = (pct, label) => {
    const m = el('span', 'meter');
    m.setAttribute('role', 'progressbar');
    m.setAttribute('aria-label', label); // brief 33: a progress bar needs a name (the screen reader said only "progress bar, 40 %")
    m.setAttribute('aria-valuemin', '0');
    m.setAttribute('aria-valuemax', '100');
    m.setAttribute('aria-valuenow', String(pct));
    const i = el('i');
    i.style.width = pct + '%';
    m.append(i);
    return m;
  };
  function render() {
    const d = bagData(eco.get(), chal.get(), summary().value);
    body.textContent = '';
    const top = el('div', 'bsec');
    top.append(row('pearl', t('bag.purse'), String(d.money)));
    top.append(row('bucket', t('bag.bucket'), d.fish === 0 ? t('bag.bucketEmpty') : t(d.fish === 1 ? 'bag.bucketLine1' : 'bag.bucketLine', { n: d.fish, value: d.value })));
    const gear = el('div', 'bsec');
    gear.append(el('h3', 'qh', t('bag.gear')));
    gear.append(row('rod', t('bag.rod'), t('eco.rod.' + d.rod)));
    gear.append(row('bait', t('bag.bait'), t('eco.bait.' + d.bait) + (d.baitCount !== null ? ' × ' + d.baitCount : '')));
    gear.append(row('float', t('bag.float'), d.float ? t('eco.float.' + d.float) : t('eco.none')));
    gear.append(row('lantern', t('bag.lantern'), d.lantern === null ? t('eco.none') : d.lantern ? t('eco.on') : t('eco.off')));
    const wear = el('div', 'bsec');
    wear.append(el('h3', 'qh', t('bag.wear')));
    for (const [ic, key, pct] of [['line', 'bag.line', d.wearLine], ['rod', 'bag.rod', d.wearRod]]) {
      const r = row(ic, t(key), `${pct} % · ${condWord(t, pct)}`, wearBar(pct, `${t('bag.wear')} · ${t(key)}`));
      r.classList.add('bwear');
      wear.append(r);
    }
    const left = el('div', 'bcol');
    left.append(top, wear);
    const right = el('div', 'bcol');
    right.append(gear);
    body.append(left, right);
    const foot = el('p', 'note');
    foot.id = 'bagFoot';
    foot.textContent = t('bag.fix') + ' ' + t('bag.shop');
    body.append(foot);
  }
  return { render, open: render, refresh: render };
}
