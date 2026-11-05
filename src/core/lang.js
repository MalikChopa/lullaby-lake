// Language choice. Pure.

/** 'fr' | 'en'. A saved manual choice ('fr' or 'en') wins; otherwise any fr* locale is French, the rest English. */
export function pickLang(navigatorLanguage, saved) {
  if (saved === 'fr' || saved === 'en') return saved;
  const l = typeof navigatorLanguage === 'string' ? navigatorLanguage.trim().toLowerCase() : '';
  return l === 'fr' || l.startsWith('fr-') || l.startsWith('fr_') ? 'fr' : 'en';
}
