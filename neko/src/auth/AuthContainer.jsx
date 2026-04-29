// auth/AuthContainer.jsx — OS-style login screen
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SignIn from './SignIn';
import SignUp from './SignUp';
import { initializeTheme, setupThemeListener } from './utils';
import authService from '../services/authService';

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

  // Fetch local account metadata on mount
  useEffect(() => {
    let cancelled = false;
    authService.getAuthStatus()
      .then((status) => {
        if (!cancelled) setLocalEmail(status.localEmail || authService.currentSession?.user?.email || 'admin@local');
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
    <div className={`min-h-screen w-full bg-white dark:bg-[#0d0d0f] midnight:bg-[#08080a] flex flex-col ${soraFontBase}`}>

      {/* ── OS Login Card ── */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-[#e8e8ec] midnight:text-[#dcdce4] mb-1">
              asyncat
            </h1>
            <p className="text-sm text-gray-500 dark:text-[#6b6b78] midnight:text-[#52525e]">
              {localEmail}
            </p>
          </div>

          {/* Auth Form */}
          <div className="bg-white dark:bg-[#131316] midnight:bg-[#0e0e12] border border-gray-200 dark:border-[#222228] midnight:border-[#1a1a20] rounded-2xl p-6 shadow-[0_8px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.5)] midnight:shadow-[0_8px_40px_rgba(0,0,0,0.7)]">
            {currentPage === 'signup' ? (
              <SignUp navigateToSignIn={() => navigate('/auth')} />
            ) : (
              <SignIn initialEmail={localEmail} />
            )}
          </div>

          {/* Local account hint */}
          {currentPage === 'signin' && (
            <p className="text-center text-xs text-gray-400 dark:text-[#44444e] midnight:text-[#33333c] mt-4">
              Local account. You can change the name, email, and password during setup.
            </p>
          )}
        </div>
      </div>

      {/* ── Tip of the day ── */}
      <div className="px-6 pb-8 text-center">
        <p className="text-xs text-gray-400 dark:text-[#3a3a48] midnight:text-[#2a2a36]">
          <span className="text-gray-500 dark:text-[#55555e] midnight:text-[#40404c]">tip of the day — </span>
          {tip}
        </p>
      </div>

    </div>
  );
};

export default AuthContainer;
