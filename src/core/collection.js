// Fishing book: per species { count, recordCm, firstDay }. Pure.

import { updateRecord } from './sizeRoll.js';

export function emptyBook() {
  return {};
}

/**
 * Records a catch. Returns { book, isNew, isRecord } (a record is never announced for the first catch of a species).
 * @param {number} [day] day number of the catch, kept as `firstDay` for a new species
 */
export function recordCatch(book, speciesId, sizeCm, day) {
  const prev = book[speciesId];
  const isNew = !prev;
  const rec = updateRecord(prev ? prev.recordCm : null, sizeCm);
  const entry = { count: (prev ? prev.count : 0) + 1, recordCm: rec.recordCm };
  entry.firstDay = prev ? prev.firstDay : day;
  if (entry.firstDay === undefined) delete entry.firstDay;
  return { book: { ...book, [speciesId]: entry }, isNew, isRecord: rec.isRecord };
}

/** Number of different species in the book (only ids of `speciesList` when given, so an unknown saved id never inflates the count). */
export function distinctCount(book, speciesList) {
  if (!speciesList) return Object.keys(book).length;
  return speciesList.filter((s) => book[s.id]).length;
}

export function totalCatches(book) {
  return Object.values(book).reduce((a, e) => a + e.count, 0);
}

export function isComplete(book, speciesList) {
  return speciesList.length > 0 && distinctCount(book, speciesList) === speciesList.length;
}

/** Pity counters after a catch: the caught species goes back to 0 (kept absent). */
export function resetPity(pity, speciesId) {
  if (!pity || !(speciesId in pity)) return pity || {};
  const next = { ...pity };
  delete next[speciesId];
  return next;
}
