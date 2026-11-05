// Sprite map: build a small sprite pixel by pixel in a map, add a 1-pixel outline around it, then draw it. Used by the cat and the fish. Pure.

export function createSpriteMap() {
  const S = new Map(); // "x,y" -> colour
  const key = (x, y) => x + ',' + y;
  return {
    set(x, y, c) {
      S.set(key(x, y), c);
    },
    /** Recolours a pixel only if it is already part of the sprite. */
    over(x, y, c) {
      if (S.has(key(x, y))) S.set(key(x, y), c);
    },
    /** Removes a pixel from the sprite. */
    del(x, y) {
      S.delete(key(x, y));
    },
    get: (x, y) => S.get(key(x, y)),
    has: (x, y) => S.has(key(x, y)),
    size: () => S.size,
    /** Bounding box of the sprite: { minX, minY, maxX, maxY } (null when empty). */
    bounds() {
      let b = null;
      for (const k of S.keys()) {
        const [a, c] = k.split(',').map(Number);
        if (!b) b = { minX: a, minY: c, maxX: a, maxY: c };
        else {
          b.minX = Math.min(b.minX, a);
          b.maxX = Math.max(b.maxX, a);
          b.minY = Math.min(b.minY, c);
          b.maxY = Math.max(b.maxY, c);
        }
      }
      return b;
    },
    /** Calls draw(x, y, colour) for the outline pixels (4-neighbours of the sprite), then for the sprite itself. */
    flush(draw, outlineColor) {
      if (outlineColor !== undefined) {
        const out = new Set();
        for (const k of S.keys()) {
          const [a, b] = k.split(',').map(Number);
          for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const kk = key(a + da, b + db);
            if (!S.has(kk)) out.add(kk);
          }
        }
        out.forEach((k) => {
          const [a, b] = k.split(',').map(Number);
          draw(a, b, outlineColor);
        });
      }
      for (const [k, c] of S) {
        const [a, b] = k.split(',').map(Number);
        draw(a, b, c);
      }
    },
  };
}
