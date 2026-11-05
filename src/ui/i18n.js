// Translations: t(key, params), current language, <html lang>. The logic is plain and unit-tested;
// applyDom() only touches the page when called.

/** @param {{fr:object,en:object}} tables @param {'fr'|'en'} lang */
export function createI18n(tables, lang) {
  let current = tables[lang] ? lang : 'fr';
  const listeners = [];

  function t(key, params) {
    let s = tables[current][key];
    if (s === undefined) s = tables.fr[key]; // falls back on French
    if (s === undefined) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
    return s;
  }
  return {
    t,
    getLang: () => current,
    setLang(l) {
      if (!tables[l] || l === current) return;
      current = l;
      listeners.forEach((f) => f(current));
    },
    onChange(f) {
      listeners.push(f);
    },
  };
}

/** Fills data-i18n (text), data-i18n-aria (aria-label), data-i18n-title (title) inside `root` and sets <html lang>. */
export function applyDom(i18n, root = document) {
  document.documentElement.lang = i18n.getLang();
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = i18n.t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', i18n.t(el.dataset.i18nAria));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', i18n.t(el.dataset.i18nTitle));
  });
}
