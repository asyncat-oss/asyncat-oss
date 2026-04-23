// Global singleton for race condition prevention
export const GlobalRaceConditionManager = (() => {
  let isBlocked = false;
  let blockTimeout = null;
  let listeners = new Set();
  let interceptorsSetup = false;

  const activateBlocking = (duration = 300) => {
    if (blockTimeout) clearTimeout(blockTimeout);

    const wasBlocked = isBlocked;
    isBlocked = true;

    if (!wasBlocked) {
      console.log('🔒 GLOBAL: Activating Enter blocking for all editors');
    }

    blockTimeout = setTimeout(() => {
      isBlocked = false;
      console.log('🔓 GLOBAL: Deactivating Enter blocking for all editors');
    }, duration);
  };

  const setupGlobalInterceptors = () => {
    if (interceptorsSetup) return;

    const globalKeyboardInterceptor = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        console.log(`🔍 GLOBAL: Enter event detected, blocked:`, isBlocked);
      }

      if (isBlocked) {
        console.log(`🚫 GLOBAL: Blocking keyboard event:`, e.key, 'Target:', e.target);
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };

    const events = ['keydown', 'keypress', 'keyup'];
    events.forEach(eventType => {
      document.addEventListener(eventType, globalKeyboardInterceptor, {
        capture: true,
        passive: false
      });
      window.addEventListener(eventType, globalKeyboardInterceptor, {
        capture: true,
        passive: false
      });
    });

    interceptorsSetup = true;
    console.log('🎯 GLOBAL: Race condition interceptors setup complete');
  };

  const subscribe = (callback) => {
    listeners.add(callback);
    if (!interceptorsSetup) {
      setupGlobalInterceptors();
    }
    return () => listeners.delete(callback);
  };

  const deactivateBlocking = () => {
    if (blockTimeout) {
      clearTimeout(blockTimeout);
      blockTimeout = null;
    }
    if (isBlocked) {
      isBlocked = false;
      console.log('🔓 GLOBAL: Manually deactivating Enter blocking');
    }
  };

  return {
    activateBlocking,
    deactivateBlocking,
    subscribe,
    isBlocked: () => isBlocked
  };
})();