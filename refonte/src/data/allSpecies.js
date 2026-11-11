// The 24 species of the 2D game + the dream fish of the story (J12-A), in one place: the list the game core draws from, the sprites, the requirements.
// `species` / `fishSprites` / `NEEDS` themselves are never edited (the first two belong to src/, the third is tested as "24 entries").
import species from '../../../src/data/species.js';
import fishSprites from '../../../src/data/fishSprites.js';
import { NEEDS } from './economy.js';
import { DREAM_SPECIES, DREAM_SPRITES, DREAM_NEEDS } from './dream.js';
import { FISH_OVERRIDES, SPECIES_TEXT_OVERRIDES } from './fishOverrides.js';

// the 24 species with the refonte's text overrides (data/fishOverrides.js): the SAME objects in BASE_SPECIES and SPECIES_ALL (the carnet reads the first, the core the second)
export const BASE_SPECIES = Object.freeze(species.map((s) => (SPECIES_TEXT_OVERRIDES[s.id] ? Object.freeze({ ...s, ...SPECIES_TEXT_OVERRIDES[s.id] }) : s)));
export const SPECIES_ALL = Object.freeze([...BASE_SPECIES, ...DREAM_SPECIES]);
export const SPRITES_ALL = Object.freeze(Object.fromEntries(Object.entries({ ...fishSprites, ...DREAM_SPRITES }).map(([k, v]) => [k, FISH_OVERRIDES[k] ? { ...v, ...FISH_OVERRIDES[k] } : v])));
export const NEEDS_ALL = Object.freeze({ ...NEEDS, ...DREAM_NEEDS });
export { DREAM_SPECIES };
export const isDream = (id) => DREAM_SPECIES.some((s) => s.id === id);
