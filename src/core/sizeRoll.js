// Fish size: triangular distribution (min, mode, max) by inverse CDF, rounded to the cm, plus the personal record. Pure.

/** @param {{min:number,mode:number,max:number}} s @param {number} u uniform in [0,1) */
export function rollSize(s, u) {
  const { min, mode, max } = s;
  if (max <= min) return Math.round(min);
  const fc = (mode - min) / (max - min);
  const x = u < fc
    ? min + Math.sqrt(u * (max - min) * (mode - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  return Math.round(x);
}

/**
 * Personal record of a species. `previous` = best size so far (undefined/null = first catch).
 * "Record!" is never announced for the first catch of a species (it is "NEW" then).
 * @returns {{recordCm:number, isRecord:boolean}}
 */
export function updateRecord(previous, sizeCm) {
  if (previous === undefined || previous === null) return { recordCm: sizeCm, isRecord: false };
  return sizeCm > previous ? { recordCm: sizeCm, isRecord: true } : { recordCm: previous, isRecord: false };
}
