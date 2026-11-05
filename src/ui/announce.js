// Screen-reader announcements: one polite live region, text set once per event.

export function createAnnouncer(el) {
  let timer = null;
  return {
    say(text) {
      el.textContent = '';
      clearTimeout(timer);
      timer = setTimeout(() => {
        el.textContent = text;
      }, 30);
    },
    /** Last announced text (tests read it). */
    get text() {
      return el.textContent;
    },
  };
}
