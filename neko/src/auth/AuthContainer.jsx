// auth/AuthContainer.jsx — OS-style login screen
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SignIn from './SignIn';
import SignUp from './SignUp';
import { initializeTheme, setupThemeListener } from './utils';
import authService from '../services/authService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const soraFontBase = "font-sora";

const tips = [
  "The system runs on spite and caffeine.",
  "Procrastination is just the brain defragmenting. Probably.",
  "Your data is stored in a SQLite database in ~/.asyncat. Deal with it.",
  "The cat is always watching. The cat is always judging.",
  "If you forget your password, you're kinda stuck. Just so you know.",
  "Your session expires in 7 days. Unlike your problems, these are fixable.",
  "The Brain™ daemon is running. We have no idea what it does either.",
  "No cloud sync. No AI surveillance. No \"enterprise integration.\" Just files.",
  "The undo button doesn't exist. Neither does the meaning of life.",
  "If it breaks, it's a feature. File a report and wait 3-5 business never.",
  "Multitasking is a lie. Your CPU disagrees but it also can't count.",
  "The sidebar dock is not a Mac clone. It's a cat with opinions.",
  "Sleep is for the weak. Or for anyone, really. No judgment.",
  "Excellence is not a skill. It's a caffeine blood level.",
  "The system has no terms of service. You're on your own.",
];

const AuthContainer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const network = useNetworkStatus({ pollMs: 6000 });
  const [localEmail, setLocalEmail] = useState('admin@local');
  const [tip] = useState(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return tips[dayOfYear % tips.length];
  });

  // Initialize theme and set up listener on component mount
  useEffect(() => {
    initializeTheme();
    const cleanup = setupThemeListener();
    return cleanup;
  }, []);

  // Fetch local account metadata on mount; auto-redirect on first run
  useEffect(() => {
    let cancelled = false;
    authService.getAuthStatus()
      .then(async (status) => {
        if (cancelled) return;
        setLocalEmail(status.localEmail || authService.currentSession?.user?.email || 'admin@local');
        if (status.isFirstRun) {
          await authService.firstRunLogin();
          if (!cancelled) navigate('/', { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) setLocalEmail(authService.currentSession?.user?.email || 'admin@local');
      });
    if (location.pathname === '/signup') navigate('/auth');
    return () => {
      cancelled = true;
    };
  }, [location.pathname, navigate]);

  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === '/signup') return 'signup';
    return 'signin';
  };

  const currentPage = getCurrentPage();

  return (
    <div className={`min-h-screen w-full bg-slate-50 dark:bg-gray-900 midnight:bg-slate-950 flex flex-col ${soraFontBase}`}>

      {/* ── OS Login Card ── */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100 mb-1">
              asyncat
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              {localEmail}
            </p>
          </div>

          {/* Auth Form */}
          <div className="bg-white/95 dark:bg-gray-800/70 midnight:bg-slate-900/80 border border-gray-200/80 dark:border-gray-700/60 midnight:border-slate-700/60 rounded-2xl p-6 shadow-[0_16px_50px_rgba(15,23,42,0.10)] dark:shadow-[0_18px_60px_rgba(2,6,23,0.42)] midnight:shadow-[0_18px_60px_rgba(2,6,23,0.62)] backdrop-blur-sm">
            {!network.backendOnline && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200 midnight:border-amber-800/50 midnight:bg-amber-950/30 midnight:text-amber-200">
                Backend offline. The cached frontend is loaded, but local Asyncat services are not reachable.
              </div>
            )}
            {currentPage === 'signup' ? (
              <SignUp navigateToSignIn={() => navigate('/auth')} />
            ) : (
              <SignIn initialEmail={localEmail} backendOnline={network.backendOnline} />
            )}
          </div>

          {/* Local account hint */}
          {currentPage === 'signin' && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 midnight:text-slate-500 mt-4">
              Local account. You can change the name, email, and password during setup.
            </p>
          )}
        </div>
      </div>

      {/* ── Tip of the day ── */}
      <div className="px-6 pb-8 text-center">
        <p className="text-xs text-gray-400 dark:text-gray-600 midnight:text-slate-600">
          <span className="text-gray-500 dark:text-gray-500 midnight:text-slate-500">tip of the day — </span>
          {tip}
        </p>
      </div>

    </div>
  );
};

export default AuthContainer;
