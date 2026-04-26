import { useEffect, useState } from "react";

const MAIN_URL = import.meta.env.VITE_MAIN_URL || "http://localhost:8716";

export function useNetworkStatus({ pollMs = 15000 } = {}) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [backendOnline, setBackendOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const updateBrowserStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateBrowserStatus);
    window.addEventListener("offline", updateBrowserStatus);

    const checkBackend = async () => {
      try {
        const res = await fetch(`${MAIN_URL}/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(2500),
        });
        if (!cancelled) setBackendOnline(res.ok);
      } catch {
        if (!cancelled) setBackendOnline(false);
      } finally {
        if (!cancelled) timer = setTimeout(checkBackend, pollMs);
      }
    };

    checkBackend();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", updateBrowserStatus);
      window.removeEventListener("offline", updateBrowserStatus);
    };
  }, [pollMs]);

  return {
    online,
    backendOnline,
    fullyOnline: online && backendOnline,
    needsNetworkMessage: !online
      ? "Network offline: cloud providers, web search, HuggingFace downloads, and provider tests need internet."
      : !backendOnline
        ? "Backend offline: local Asyncat services are unreachable."
        : "",
  };
}

export default useNetworkStatus;
