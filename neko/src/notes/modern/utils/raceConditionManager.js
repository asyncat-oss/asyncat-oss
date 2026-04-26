// Global singleton to prevent keyboard race conditions when block type changes
export const GlobalRaceConditionManager = (() => {
  let isBlocked = false;
  let blockTimeout = null;
  let interceptorsSetup = false;

  const activateBlocking = (duration = 300) => {
    if (blockTimeout) clearTimeout(blockTimeout);
    isBlocked = true;
    blockTimeout = setTimeout(() => { isBlocked = false; }, duration);
  };

  const setupGlobalInterceptors = () => {
    if (interceptorsSetup) return;

    const globalKeyboardInterceptor = (e) => {
      if (isBlocked) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };

    const events = ['keydown', 'keypress', 'keyup'];
    events.forEach(eventType => {
      document.addEventListener(eventType, globalKeyboardInterceptor, { capture: true, passive: false });
      window.addEventListener(eventType, globalKeyboardInterceptor, { capture: true, passive: false });
    });

    interceptorsSetup = true;
  };

  const subscribe = (callback) => {
    const listeners = new Set();
    listeners.add(callback);
    if (!interceptorsSetup) setupGlobalInterceptors();
    return () => listeners.delete(callback);
  };

  const deactivateBlocking = () => {
    if (blockTimeout) { clearTimeout(blockTimeout); blockTimeout = null; }
    isBlocked = false;
  };

  return { activateBlocking, deactivateBlocking, subscribe, isBlocked: () => isBlocked };
})();
