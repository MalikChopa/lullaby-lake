// What a click or a tap in a room points at (brief 33, after the rooms review of brief 31), pure (unit-tested in tests/refonte-a11y.test.js):
//   - on the object itself (the ray hits the furniture mesh): the nearest thing that can be used around the hit point (a click on a table reaches the book on it);
//   - on the label of the thing the angler stands by: that thing;
//   - on the bare FLOOR: a walk, always; only a tap right under the object's own spot (its footprint, ON_SPOT metres) still uses it. Before, a floor tap up to
//     0.75 m away picked the object, so a tap just in front of a tall piece (the carnet stand of the cabin) used it instead of walking there.

export const PIECE_REACH = 1.9; // metres around a hit on the furniture
export const ON_SPOT = 0.3; // metres: a floor tap this close to an object's spot is a tap on the object
export const LABEL_BOX = Object.freeze({ halfW: 60, above: 30, below: 6 }); // px around the label anchor (the label sits above its anchor point)

/**
 * @param {{ kind: 'pieces' | 'floor' | 'none', x?: number, z?: number }} hit  where the ray landed (world metres)
 * @param {Array<{ id: string, x: number, z: number }>} items  the things of the room that can be used
 * @param {{ label?: { id: string, sx: number, sy: number } | null, cx?: number, cy?: number }} [o]  the label on screen now (its anchor in px) and the tap (px)
 * @returns {{ use: object } | { walk: [number, number] } | null}
 */
export function roomPick(hit, items, o = {}) {
  const { label = null, cx = NaN, cy = NaN } = o;
  if (label && Math.abs(cx - label.sx) <= LABEL_BOX.halfW && cy >= label.sy - LABEL_BOX.above && cy <= label.sy + LABEL_BOX.below) {
    const it = items.find((q) => q.id === label.id);
    if (it) return { use: it };
  }
  if (!hit || hit.kind === 'none') return null;
  const reach = hit.kind === 'pieces' ? PIECE_REACH : ON_SPOT;
  let best = null;
  let bd = reach;
  for (const it of items) {
    const d = Math.hypot(hit.x - it.x, hit.z - it.z);
    if (d < bd) [bd, best] = [d, it];
  }
  if (best) return { use: best };
  return { walk: [hit.x, hit.z] };
}
