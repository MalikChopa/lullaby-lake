// Rarity as pips AND a word (never colour alone): four small squares, some filled, then "rare". Used by the catch card and the journal page.

/** @param {number} rarity 1..4  @param {{t:Function}} i18n  @returns {HTMLElement} */
export function rarityNode(rarity, i18n, total = 4) {
  const box = document.createElement('span');
  box.className = 'rar';
  const pips = document.createElement('span');
  pips.className = 'rp';
  pips.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < total; i++) {
    const p = document.createElement('i');
    if (i < rarity) p.className = 'on';
    pips.appendChild(p);
  }
  const word = document.createElement('span');
  word.textContent = i18n.t('rarity.' + rarity);
  box.append(pips, word);
  return box;
}

/** Plain text of the rarity for assistive technology. */
export function rarityText(rarity, i18n) {
  return i18n.t('book.rarityLabel', { rarity: i18n.t('rarity.' + rarity) });
}
