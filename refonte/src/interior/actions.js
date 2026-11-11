// What happens inside a room (brief 29), pure and testable under Node: who is home, what the angler can use from where, which one-liner an object says, the ambient lines,
// the door of each building in the world, the walking step on the room's grid. The runtime (DOM, renderer, input) is app/interiorMode.js; the shell opens the panels.
import { ROOMS, ACTIONS, SCHEDULE, TALK_OF, ROOM_OF_BUILDING } from '../data/interiors.js';
import { isFree, findPath, snap, atExit, exitPoint, buildInteriorNav } from './logic.js';

/** Is the villager home at this phase of the day? (data/interiors.js SCHEDULE; an unknown villager is treated as out.) */
export const isHome = (villagerId, phase) => {
  const sc = SCHEDULE[villagerId];
  return !!sc && (sc.always === true || (sc.home || []).includes(phase));
};

/** The characters of a room you can talk to now: { id: 'talk:<char>', kind: 'talk', char, villager, x, z, r }. The shopkeeper is talked to at the counter. */
export function residentsOf(room, phase) {
  const c = room.resident;
  if (!c || !isHome(c.id, phase) || !TALK_OF[c.id]) return [];
  return [{ id: 'talk:' + TALK_OF[c.id], kind: 'talk', char: TALK_OF[c.id], villager: c.id, x: c.x, z: c.z, r: 1.15 }];
}

/** The cat of the cabin (Biscotte) sits on its cushion when the story does not call it away: not while it is showing the way to the next couplet. */
export const catIsHome = (room, catState) => !!room.cat && room.id === 'cabin' && !(catState && (catState.leading || catState.perched));
/** The cat's marker (it can be talked to) when it is home. */
export function catTarget(room, catState) {
  if (!catIsHome(room, catState)) return null;
  return { id: 'talk:biscotte', kind: 'talk', char: 'biscotte', x: room.cat.x + 0.2, z: room.cat.z + 0.35, r: 0.75 };
}

/** Every thing the angler can use in this room now: the room's interactables, the residents at home, the cat. */
export const useTargets = (room, phase, catState) => [...room.interactables, ...residentsOf(room, phase), ...(catTarget(room, catState) ? [catTarget(room, catState)] : [])];

/**
 * What the action key would do from (x, z): the nearest target within its radius + `slack`, or null. The door counts: { id: 'exit', kind: 'exit' } within atExit.
 * The door only wins when no other target is nearer (the spawn stands near the door: what is right in front of the angler comes first).
 */
export function pickUse(room, phase, x, z, catState = null, slack = 0.35) {
  let best = null;
  let bd = Infinity;
  for (const it of useTargets(room, phase, catState)) {
    const d = Math.hypot(x - it.x, z - it.z);
    if (d < it.r + slack && d < bd) [best, bd] = [it, d];
  }
  if (atExit(room, x, z)) {
    const d = Math.hypot(x - room.door.x, z - 0.6);
    if (d < bd) [best, bd] = [{ id: 'exit', kind: 'exit', x: room.door.x, z: 0.6, r: room.door.w / 2 + 0.55 }, d];
  }
  return best;
}

export const actionOf = (id) => ACTIONS[id] || null;

/** The verb of the context button: the button's action key of data/strings-interior.js for a target. */
export function btnKey(target) {
  if (!target) return null;
  if (target.kind === 'exit') return 'int.btn.exit';
  if (target.kind === 'talk') return 'int.btn.talk';
  const a = ACTIONS[target.id];
  if (a && a.btn === 'talk') return 'int.btn.talk';
  return a && a.btn === 'use' ? 'int.btn.use' : 'int.btn.look';
}

/** Text key of a one-liner (`line` and the rods when the gear is not worn). `facts`: { worn, shelfAll }. */
export function lineKey(id, facts = {}) {
  if (id === 'cabin.rods' && facts.worn) return 'int.look.cabin.rods.worn';
  if (id === 'shop.shelf' && facts.shelfAll) return 'int.look.shop.shelf.all';
  return 'int.look.' + id;
}

/** All the ambient line keys of a room found in a string table (int.line.<room>.1, .2, ...). */
export function ambientKeys(table, roomId) {
  const out = [];
  for (let i = 1; table[`int.line.${roomId}.${i}`]; i++) out.push(`int.line.${roomId}.${i}`);
  return out;
}

/** An ambient line of the room, never the same as `last` (r in [0, 1)). */
export function pickLine(keys, last, r) {
  const pool = keys.length > 1 ? keys.filter((k) => k !== last) : keys;
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(r * pool.length))] : null;
}

// ---- the door of each building, in the world (the same local door position as the painter draws it: world/painters.js)
const DOOR_STEP = 1.0; // the angler stands this far in front of the wall
export const DOOR_RADIUS = Object.freeze({ cabin: 1.1, shop: 2.4, workshop: 2.4, house: 1.6 });
export const doorLocalX = (b) => (b.type === 'cabin' ? 1.1 : b.type === 'shop' ? 0 : b.type === 'workshop' ? -0.6 : b.w * 0.22);
export function doorPoint(b) {
  const lx = doorLocalX(b);
  const lz = b.d / 2 + DOOR_STEP;
  return { x: b.x + lx * Math.cos(b.rot) + lz * Math.sin(b.rot), z: b.z - lx * Math.sin(b.rot) + lz * Math.cos(b.rot) };
}
/** The world direction out of the building, the way the angler faces when she comes back out. */
export const awayFrom = (b) => [Math.sin(b.rot), Math.cos(b.rot)];
export const doorRadius = (b) => DOOR_RADIUS[b.type] ?? DOOR_RADIUS.house;

/** Room id of a building id (or null). */
export const roomOf = (buildingId) => ROOM_OF_BUILDING[buildingId] || null;

// ---- walking on the room's grid
/**
 * One walking step on the grid with sliding along what blocks it. (dx, dz) = the move in metres. Returns { x, z, blocked }: blocked is true when no part of the move was possible.
 */
export function roomStep(nav, x, z, dx, dz) {
  const tryAt = (nx, nz) => isFree(nav, nx, nz);
  if (tryAt(x + dx, z + dz)) return { x: x + dx, z: z + dz, blocked: false };
  if (dx && tryAt(x + dx, z)) return { x: x + dx, z, blocked: false };
  if (dz && tryAt(x, z + dz)) return { x, z: z + dz, blocked: false };
  return { x, z, blocked: !!(dx || dz) };
}

/** Standing in the doorway (toward the north, the wall of the door): the walking move that leaves the room. */
export function walkingOut(room, x, z, dz) {
  return dz < 0 && z < 0.55 && Math.abs(x - room.door.x) <= room.door.w / 2 + 0.05;
}

/** The route from (x, z) to a point: the path on the room grid or null when there is none. */
export function routeTo(room, nav, x, z, tx, tz) {
  return findPath(nav, [x, z], [tx, tz]);
}

/** Every room is walkable from its door (used by the tests): the exit point and each target's place are reachable. */
export function reachableAll(room, phase, catState) {
  const nav = buildInteriorNav(room);
  const out = [];
  const ok = (p) => {
    const s = snap(nav, p[0], p[1], 1.5);
    return !!s && !!findPath(nav, room.spawn, s);
  };
  if (!ok(exitPoint(room))) out.push('exit');
  for (const t of useTargets(room, phase, catState)) if (!ok([t.x, t.z])) out.push(t.id);
  return out;
}

export { ROOMS };
