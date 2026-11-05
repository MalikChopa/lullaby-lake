// Frame-time counters (?perf=1). "Work time" = duration of the animation-frame callback itself,
// "interval" = time between two frames. Keeps the last 600 frames.

const KEEP = 600;

export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

export function createPerf() {
  const work = [];
  const interval = [];
  let count = 0;
  return {
    frame(workMs, intervalMs) {
      work.push(workMs);
      interval.push(intervalMs);
      if (work.length > KEEP) {
        work.shift();
        interval.shift();
      }
      count++;
    },
    reset() {
      work.length = 0;
      interval.length = 0;
      count = 0;
    },
    stats() {
      const w = [...work].sort((a, b) => a - b);
      const iv = [...interval].sort((a, b) => a - b);
      const meanInt = interval.length ? interval.reduce((a, b) => a + b, 0) / interval.length : 0;
      return {
        frames: work.length,
        total: count,
        workP50: percentile(w, 50),
        workP95: percentile(w, 95),
        workMax: w.length ? w[w.length - 1] : 0,
        intervalP50: percentile(iv, 50),
        intervalP95: percentile(iv, 95),
        fps: meanInt > 0 ? 1000 / meanInt : 0,
        longTasks: work.filter((x) => x > 50).length,
      };
    },
  };
}
