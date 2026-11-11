// The screens of the shell as a small state machine (pure, unit-tested): home -> game -> (book | settings | photo | shop) -> game.
//   state  { screen: 'home' | 'game' | 'book' | 'settings' | 'photo' | 'shop' | ... | 'interior', started: boolean, inside?: true }
//   action 'begin' (the Start buttons) | 'book' | 'settings' | 'photo' (a key or a button: opens, or closes when already open) | 'shop' (J10: opens from the game
//          only - walking to the Boutique door - and closes when open; the C / R / P keys do nothing inside the shop) | 'back' (Escape, Back, Close)
//   J11: 'repair' (the Atelier, and the cabin's emergency string) and 'quests' (the notice board and the quest log) open from the game like the shop; 'quests' also
//   opens from the journal (its button) and the O key; they close with Escape or their own button; the C / R / P keys do nothing inside them.
//   UI redesign (brief 27): 'bag' (Sac et matériel: the purse, the bucket, the gear and its wear; read-only) opens from the game like the shop and closes with Escape, its button or its key (B).
//   J12-A: 'dialogue' (a conversation: opens from the game only, by talking to someone or by the story; closes with Escape = "later", its own buttons or the end of the talk;
//   the C / R / P / O keys do nothing inside it). The journal can also open on its Letters page from the cabin desk (the shell sets the page, the screen is still 'book').
//   Brief 29: 'enterRoom' / 'leaveRoom' put the player inside a building: the screen becomes 'interior' (the walking base of the game while `inside`), and every layer that opens
//   from the game also opens from the interior and closes back to it (the `inside` flag is the base: `base(state)`). The menu, the journal, the settings, the photo mode and the
//   dialogue all work inside. Entering or leaving while a layer is open (the fade takes a moment) keeps the layer and only changes the base.
// The game clock and the fishing core run only while `playing(state)`: on the base screen (game or interior), after "Commencer". Everything else freezes them.

export const SCREENS = Object.freeze(['home', 'game', 'book', 'settings', 'photo', 'shop', 'repair', 'quests', 'dialogue', 'bag', 'interior']);
export const initialState = () => ({ screen: 'home', started: false });
/** The screen a closed layer goes back to: the interior while inside a building, the game otherwise. */
export const base = (s) => (s.inside ? 'interior' : 'game');
export const atBase = (s) => s.screen === base(s);
export const playing = (s) => s.started && atBase(s);

export function reduce(state, action) {
  switch (action) {
    case 'begin':
      return { screen: 'game', started: true };
    case 'book':
    case 'settings':
    case 'photo':
      if (!state.started) return state; // nothing opens over the start screen
      if (state.screen === 'shop' || state.screen === 'repair' || state.screen === 'quests' || state.screen === 'dialogue' || state.screen === 'bag') return state; // these close with Escape or their own button
      return { ...state, screen: state.screen === action ? base(state) : action };
    case 'shop':
    case 'repair':
    case 'bag':
      if (!state.started) return state;
      if (state.screen === action) return { ...state, screen: base(state) };
      return atBase(state) ? { ...state, screen: action } : state;
    case 'dialogue':
      if (!state.started) return state;
      if (state.screen === 'dialogue') return { ...state, screen: base(state) };
      return atBase(state) ? { ...state, screen: 'dialogue' } : state;
    case 'quests':
      if (!state.started) return state;
      if (state.screen === 'quests') return { ...state, screen: base(state) };
      return atBase(state) || state.screen === 'book' ? { ...state, screen: 'quests' } : state;
    case 'back':
      return state.started && !atBase(state) && state.screen !== 'home' ? { ...state, screen: base(state) } : state;
    case 'enterRoom': {
      if (!state.started || state.inside) return state;
      return state.screen === 'game' ? { ...state, screen: 'interior', inside: true } : { ...state, inside: true };
    }
    case 'leaveRoom': {
      if (!state.started || !state.inside) return state;
      const next = { screen: state.screen === 'interior' ? 'game' : state.screen, started: state.started };
      return next;
    }
    default:
      return state;
  }
}

/** The screen the debug skip (?debug=1 without &home=1) goes to: straight into the game, started, without any sound. */
export const skipped = () => ({ screen: 'game', started: true });
