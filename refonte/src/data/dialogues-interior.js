// Dialogues of the interior rooms (brief 29): the bed's gentle question, and the three villagers that had no words outside (the forager, the walker, the repairer).
// Same data format as data/story.js (read by story/dialogue.js). Kept apart so the story data stays as it was; shell.js merges these with DIALOGUES, CHARACTERS and AMBIENT.
const L = (char, id) => ({ id, key: `story.a.${char}.${id}` });
const say = (char) => ({ start: 'a', nodes: { a: { speaker: char, ambient: char, end: true } } });

export const ROOM_CHARACTERS = Object.freeze({
  forager: { kind: 'villager', villager: 'forager', talkR: 2.3 },
  walker: { kind: 'villager', villager: 'walker', talkR: 2.3 },
  repairer: { kind: 'villager', villager: 'repairer', talkR: 2.3 },
});

export const ROOM_AMBIENT = Object.freeze({
  forager: [L('forager', 'a1'), L('forager', 'a2'), L('forager', 'a3'), L('forager', 'a4')],
  walker: [L('walker', 'a1'), L('walker', 'a2'), L('walker', 'a3'), L('walker', 'a4')],
  repairer: [L('repairer', 'a1'), L('repairer', 'a2'), L('repairer', 'a3'), L('repairer', 'a4')],
});

export const ROOM_DIALOGUES = Object.freeze({
  forager: say('forager'),
  walker: say('walker'),
  repairer: say('repairer'),
  // The bed of the cabin: a soft question with three answers; the sleep itself is the shell's job (interior/sleep.js), the effect says which one.
  bed: {
    start: 'q',
    nodes: {
      q: {
        speaker: 'narr',
        text: 'int.sleep.ask',
        choices: [
          { text: 'int.sleep.dawn', effects: [{ sleep: 'dawn' }] },
          { text: 'int.sleep.dusk', effects: [{ sleep: 'dusk' }] },
          { text: 'int.sleep.no' },
        ],
      },
    },
  },
});
