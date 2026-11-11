// The dialogue runner (J12-A), pure: no DOM, no clock, no random of its own (an ambient line is chosen by the injected `ambient`), no eval.
// A dialogue is DATA (data/story.js): { start: nodeId, nodes: { id: node } }. A node:
//   speaker   character id (data/story.js CHARACTERS)        text   string key (default 'story.d.<dialogueId>.<nodeId>')       {names} in the text = env().vars
//   choices   [{ text: key, if?: cond, next: nodeId, effects?: [effect] }]    next   nodeId | [{ if?: cond, to: nodeId }]  (first true wins)
//   effects   [effect] applied when the node is entered     mark   id added to the "seen" list when entered     end   true = the talk ends after this line
//   ambient   character id: the text is picked by the injected `ambient(character, env)` (never the same line twice in a row)
//   a node without `text` and without `ambient` is a ROUTER: it only picks the next node (never shown, depth-guarded)
// Effects (applied through the injected `effect(e)`, in order): { set: flag } { unset: flag } { give: { pearls, bait: {id, n} } } { couplet: n } { letter: id }
//   { sting: name } { open: 'shop' | 'repair' | 'quests' | 'letters' } { lullaby: 'all' | n } { seen: id }
// The state the UI draws: { id, node, speaker, textKey, vars, choices: [{ i, textKey }], last, ended }. Nothing presses the player: the talk waits.

import { evalCond } from './cond.js';

const MAX_ROUTE = 24;

/**
 * @param {{ dialogues: object, env: () => object, effect?: (e: object) => void, ambient?: (character: string, env: object) => string|null,
 *   onEnd?: (info: {id: string, reason: 'done'|'later', seen: string[]}) => void }} deps
 */
export function createRunner({ dialogues, env, effect = () => {}, ambient = () => null, onEnd = () => {} }) {
  let cur = null; // { id, node, history: [{speaker, textKey, vars}], seen: [] }
  let view = null;

  const keyOf = (id, nodeId, node) => node.text || `story.d.${id}.${nodeId}`;
  const pick = (next, e) => {
    if (next === undefined || next === null) return null;
    if (typeof next === 'string') return next;
    if (Array.isArray(next)) for (const b of next) if (evalCond(b.if, e)) return b.to;
    return null;
  };

  function enter(nodeId) {
    const d = dialogues[cur.id];
    let id = nodeId;
    for (let guard = 0; guard < MAX_ROUTE; guard++) {
      const node = d.nodes[id];
      if (!node) return finish('done');
      const e = env();
      const isRouter = node.text === undefined && node.ambient === undefined && !node.choices && !node.speaker;
      if (node.mark) {
        cur.seen.push(node.mark);
        effect({ seen: node.mark });
      }
      if (node.effects) for (const f of node.effects) effect(f);
      if (isRouter) {
        const to = pick(node.next, env());
        if (to === null) return finish('done');
        id = to;
        continue;
      }
      let textKey = keyOf(cur.id, id, node);
      if (node.ambient !== undefined) {
        textKey = ambient(node.ambient, e);
        if (!textKey) {
          const to = pick(node.next, e);
          if (to === null) return finish('done');
          id = to;
          continue;
        }
      }
      const choices = (node.choices || []).filter((c) => evalCond(c.if, e)).map((c, i) => ({ i, textKey: c.text, ref: c }));
      cur.node = id;
      cur.choiceRefs = choices;
      const vars = e.vars || {};
      const last = choices.length === 0 && (node.end === true || pick(node.next, e) === null);
      view = { id: cur.id, node: id, speaker: node.speaker || 'narr', textKey, vars, choices: choices.map((c) => ({ i: c.i, textKey: c.textKey })), last, ended: false };
      cur.history.push({ speaker: view.speaker, textKey, vars });
      return view;
    }
    return finish('done');
  }

  function finish(reason) {
    const c = cur;
    cur = null;
    view = null;
    if (c) onEnd({ id: c.id, reason, seen: c.seen.slice() });
    return { ended: true, reason };
  }

  return {
    /** Starts a dialogue; returns the first view, or null when the id is unknown or it ended at once. */
    start(id) {
      if (cur || !Object.prototype.hasOwnProperty.call(dialogues, id)) return null;
      cur = { id, node: null, history: [], seen: [], choiceRefs: [] };
      const r = enter(dialogues[id].start);
      return r && !r.ended ? r : null;
    },
    /** Next line (no choice) or the chosen branch. Returns the next view, or { ended: true }. */
    advance(choiceIndex) {
      if (!cur) return { ended: true, reason: 'done' };
      const node = dialogues[cur.id].nodes[cur.node];
      if (cur.choiceRefs.length > 0) {
        const c = cur.choiceRefs.find((x) => x.i === choiceIndex);
        if (!c) return view; // a choice is needed: nothing moves
        if (c.ref.effects) for (const f of c.ref.effects) effect(f);
        if (c.ref.next === undefined || c.ref.next === null) return finish('done');
        return enter(c.ref.next);
      }
      const to = pick(node.next, env());
      if (node.end === true || to === null) return finish('done');
      return enter(to);
    },
    /** "Plus tard": closes at once, nothing is lost and nothing is given for the lines not read. */
    close() {
      return cur ? finish('later') : { ended: true, reason: 'later' };
    },
    view: () => view,
    active: () => cur !== null,
    history: () => (cur ? cur.history.slice() : []),
    id: () => (cur ? cur.id : null),
  };
}

/** Every text key a dialogue set uses (for the FR / EN parity test). */
export function dialogueKeys(dialogues) {
  const keys = new Set();
  for (const [id, d] of Object.entries(dialogues)) {
    for (const [nid, n] of Object.entries(d.nodes)) {
      if (n.text !== undefined || (n.ambient === undefined && (n.speaker || n.choices))) keys.add(n.text || `story.d.${id}.${nid}`);
      for (const c of n.choices || []) keys.add(c.text);
    }
  }
  return [...keys];
}

/**
 * Ambient lines of a character: the first of `lines` whose condition holds, picked with `r` in [0, 1) among the fitting ones, NEVER the same as `lastId`
 * (unless it is the only one that fits). Returns { id, key } or null. Pure: the caller keeps `lastId`.
 */
export function pickAmbient(lines, env, lastId, r) {
  const fit = lines.filter((l) => evalCond(l.if, env));
  const pool = fit.length > 1 ? fit.filter((l) => l.id !== lastId) : fit;
  if (pool.length === 0) return null;
  const l = pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
  return { id: l.id, key: l.key };
}
