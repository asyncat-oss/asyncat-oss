// One search at a time: starting a search cancels the one before it, and a
// cancelled search's answer is dropped even if it still arrives, so a slow
// answer for an old query never replaces the results for a newer one.

/** start() cancels the running search and returns the new one's signal. */
export function latestSearch() {
  let controller = null;
  return {
    start() {
      controller?.abort();
      controller = new AbortController();
      return controller.signal;
    },
    cancel() {
      controller?.abort();
      controller = null;
    },
  };
}
