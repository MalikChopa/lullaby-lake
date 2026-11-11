// The name of a place in a language, never "undefined" (brief 29): the HUD banner and the hints only show text that exists. Pure.
export const placeName = (o, lang) => (o && o.name && (o.name[lang] || o.name.fr || o.name.en)) || '';
