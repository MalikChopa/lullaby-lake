// Gives the browser a turn between two slices of work (loading, J9-C). A MessageChannel message is a task that runs at once: setTimeout(0) is
// clamped to 4 ms after a few nested calls, which made a loading made of ~100 slices take 400 ms longer for nothing.
let chan = null;
const waiting = [];
export function pause() {
  if (typeof MessageChannel === 'undefined') return new Promise((r) => setTimeout(r, 0));
  if (!chan) {
    chan = new MessageChannel();
    chan.port1.onmessage = () => {
      const r = waiting.shift();
      if (!waiting.length && chan.port1.unref) chan.port1.unref(); // Node (tests): an idle port must not keep the process alive
      if (r) r();
    };
  }
  return new Promise((r) => {
    waiting.push(r);
    if (chan.port1.ref) chan.port1.ref();
    chan.port2.postMessage(0);
  });
}
