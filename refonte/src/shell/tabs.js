// Two tabs (J9-A): the FIRST tab keeps writing the save, the SECOND one stays read-only and says so. A tab that has started its game answers the
// 'hello' a new tab sends at load with 'busy'; a tab that has not started and hears 'busy' goes read-only (persist.otherTab()). The storage event
// (another tab wrote the save) is the second guard, wired in shell.js. `channel` = a BroadcastChannel (injected: tests use a fake pair).
export function createTabGuard({ channel, isStarted, onOther }) {
  channel.onmessage = (e) => {
    if (e.data === 'hello' && isStarted()) channel.postMessage('busy');
    else if (e.data === 'busy' && !isStarted()) onOther();
  };
  channel.postMessage('hello');
  return { close: () => channel.close && channel.close() };
}
