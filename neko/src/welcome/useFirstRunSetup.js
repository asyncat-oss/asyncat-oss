// Opens the first-run setup when a window starts on the chat home of a
// fresh install (GET /api/setup says so, and chats weren't sent to another
// agent such as Claude Code before). Asked once per window. Until the
// answer is in, and the setup has opened, it reports `pending` so the layout
// keeps its startup screen: the home page doesn't flash first, and its "/"
// → "/home" redirect can't run over the way to /welcome.

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { setupApi } from './setupApi.js';
import { isLandingPath, shouldOpenSetup } from './setupFlow.js';

let asked = false;

function lastEngine() {
  try { return localStorage.getItem('asyncat_engine'); } catch { return null; }
}

export function useFirstRunSetup(ready) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // asking → opening (on the way to /welcome) → settled
  const [stage, setStage] = useState(() => (!asked && isLandingPath(window.location.pathname) ? 'asking' : 'settled'));

  useEffect(() => {
    if (!ready || asked) return;
    asked = true;
    if (!isLandingPath(window.location.pathname)) {
      setStage('settled');
      return;
    }
    setupApi.get()
      .then((res) => {
        if (!shouldOpenSetup(res?.setup, window.location.pathname, lastEngine())) {
          setStage('settled');
          return;
        }
        setStage('opening');
        navigate('/welcome', { replace: true });
      })
      .catch(() => setStage('settled')); // no setup then; Models still offers everything
  }, [ready, navigate]);

  useEffect(() => {
    if (stage === 'opening' && pathname === '/welcome') setStage('settled');
  }, [stage, pathname]);

  return stage !== 'settled';
}

export default useFirstRunSetup;
