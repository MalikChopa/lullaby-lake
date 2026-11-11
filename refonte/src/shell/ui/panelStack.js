// The layers of the interface that Escape closes (brief 27): Escape closes the TOP layer only, never two, and never loses anything. A layer is anything that
// opens over the game or over another layer: the menu, a question in the shop, the history of a dialogue... (the full screens - journal, shop, settings... - are
// the machine's own `screen`, shell/machine.js; the stack sits above it). Pure (unit-tested): the shell registers each layer's close().

export function createPanelStack() {
  const layers = []; // bottom -> top: { id, close }
  const S = {
    /** Opens (or raises) a layer. */
    open(id, close) {
      const i = layers.findIndex((l) => l.id === id);
      if (i >= 0) layers.splice(i, 1);
      layers.push({ id, close });
    },
    /** Forgets a layer without calling its close() (it closed itself). */
    drop(id) {
      const i = layers.findIndex((l) => l.id === id);
      if (i >= 0) layers.splice(i, 1);
      return i >= 0;
    },
    top: () => (layers.length ? layers[layers.length - 1].id : null),
    size: () => layers.length,
    ids: () => layers.map((l) => l.id),
    /** Escape: closes the top layer. Returns its id, or null when there was none (the caller then does what Escape did before). */
    escape() {
      const l = layers.pop();
      if (!l) return null;
      if (l.close) l.close();
      return l.id;
    },
  };
  return S;
}
