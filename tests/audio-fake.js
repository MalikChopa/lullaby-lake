// A tiny fake AudioContext for the audio tests (Node has no Web Audio). It records the nodes, the connections and the scheduled
// parameter changes; `advance(s)` moves time forward and fires the `onended` callbacks of the sources whose stop time has passed.
// Not a test file (no .test.js): imported by tests/audio.test.js.

class Param {
  constructor(v = 0) {
    this.value = v;
    this.events = [];
    this.sched = []; // what a real engine keeps: [time, duration] (duration 0 for a point event); used to refuse the overlaps a browser refuses
    this.discontinuities = 0; // a cancelScheduledValues that cut a running curve
  }
  _add(t, dur = 0) {
    for (const [st, d] of this.sched) {
      if (d > 0 && t > st && t < st + d) throw new Error(`NotSupportedError: event at ${t} inside the curve ${st}..${st + d}`);
      if (dur > 0 && st > t && st < t + dur) throw new Error(`NotSupportedError: curve ${t}..${t + dur} overlaps the event at ${st}`);
      if (dur > 0 && d > 0 && st < t + dur && t < st + d) throw new Error('NotSupportedError: two curves overlap');
    }
    this.sched.push([t, dur]);
  }
  setValueAtTime(v, t) {
    this._add(t);
    this.events.push(['set', v, t]);
    return this;
  }
  linearRampToValueAtTime(v, t) {
    this._add(t);
    this.events.push(['lin', v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v, t) {
    if (!(v > 0)) throw new Error('exponential ramp to a non-positive value');
    this._add(t);
    this.events.push(['exp', v, t]);
    return this;
  }
  setTargetAtTime(v, t, tc) {
    if (!(tc > 0)) throw new Error('setTargetAtTime needs a positive time constant');
    this._add(t);
    this.events.push(['target', v, t, tc]);
    return this;
  }
  setValueCurveAtTime(curve, t, dur) {
    if (!(dur > 0) || !(curve.length >= 2)) throw new Error('setValueCurveAtTime needs a duration and 2+ values');
    this._add(t, dur);
    this.events.push(['curve', curve, t, dur]);
    return this;
  }
  cancelScheduledValues(t) {
    this.events.push(['cancel', t]);
    const keep = [];
    for (const [st, d] of this.sched) {
      if (st >= t) continue;
      if (d > 0 && st + d > t) this.discontinuities++;
      if (d > 0 && st + d > t) continue;
      keep.push([st, d]);
    }
    this.sched = keep;
    return this;
  }
}

export function createFakeContext({ sampleRate = 48000, state = 'running' } = {}) {
  const ctx = {
    sampleRate,
    state,
    currentTime: 0,
    nodes: [],
    created: {},
    calls: [],
    destination: { kind: 'destination', connections: [], disconnect() {} },
    resume() {
      ctx.state = 'running';
      ctx.calls.push('resume');
      return Promise.resolve();
    },
    suspend() {
      ctx.state = 'suspended';
      ctx.calls.push('suspend');
      return Promise.resolve();
    },
    close() {
      ctx.state = 'closed';
      return Promise.resolve();
    },
    createBuffer(ch, length, sr) {
      const data = Array.from({ length: ch }, () => new Float32Array(length));
      return { numberOfChannels: ch, length, sampleRate: sr, duration: length / sr, getChannelData: (i) => data[i] };
    },
    advance(s) {
      ctx.currentTime += s;
      for (const n of ctx.nodes) {
        if (n.started && !n.ended && n.stopAt !== null && n.stopAt <= ctx.currentTime) {
          n.ended = true;
          if (n.onended) n.onended();
        }
      }
    },
    live: () => ctx.nodes.filter((n) => !n.disconnected),
  };
  const make = (kind, extra = {}) => {
    const n = {
      kind,
      connections: [],
      disconnected: false,
      started: false,
      ended: false,
      stopAt: null,
      onended: null,
      connect(to) {
        n.connections.push(to);
        return to;
      },
      disconnect() {
        n.disconnected = true;
      },
      start(when) {
        n.started = true;
        n.startAt = when;
      },
      stop(t) {
        n.stopAt = t;
      },
      ...extra,
    };
    ctx.nodes.push(n);
    ctx.created[kind] = (ctx.created[kind] || 0) + 1;
    return n;
  };
  ctx.createGain = () => make('gain', { gain: new Param(1) });
  ctx.createBufferSource = () => make('source', { buffer: null, loop: false, start(when) { this.started = true; this.startAt = when; if (!this.loop && this.buffer && this.stopAt === null) this.stopAt = when + this.buffer.duration; } });
  ctx.createBiquadFilter = () => make('filter', { type: 'lowpass', frequency: new Param(350), Q: new Param(1) });
  ctx.createOscillator = () => make('osc', { type: 'sine', frequency: new Param(440) });
  ctx.createDelay = () => make('delay', { delayTime: new Param(0) });
  ctx.createDynamicsCompressor = () => make('comp', { threshold: new Param(-24), knee: new Param(30), ratio: new Param(12), attack: new Param(0.003), release: new Param(0.25) });
  ctx.createAnalyser = () => make('analyser', { fftSize: 2048 });
  return ctx;
}
