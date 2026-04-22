import { useState, useEffect, useCallback } from 'react';
import { SlidersHorizontal, Lock, Moon, Sun } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';

import GeneralSection from './GeneralSection';
import SecuritySection from './SecuritySection';
import AppearanceSection from './AppearanceSection';

const soraFontBase = "font-sora";

const SettingsModal = ({ isOpen, onClose, session, initialTab = 'general' }) => {
  const { currentWorkspace, refreshWorkspaces, updateCurrentWorkspace } = useWorkspace();

  const [activeTab, setActiveTab] = useState(initialTab);
  const [theme,     setTheme]     = useState('light');
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // sync theme from localStorage
  useEffect(() => {
    const stored = localStorage.theme;
    if (stored === 'dark' || stored === 'midnight' || stored === 'light') {
      setTheme(stored);
    } else {
      setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      if (!('theme' in localStorage)) setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setThemeMode = (mode) => {
    document.documentElement.classList.remove('dark', 'midnight');
    if (mode === 'dark')     { localStorage.theme = 'dark';     document.documentElement.classList.add('dark'); }
    else if (mode === 'midnight') { localStorage.theme = 'midnight'; document.documentElement.classList.add('midnight'); }
    else                    { localStorage.theme = 'light'; }
    setTheme(mode);
  };

  const handleWorkspaceDeleted = () => { refreshWorkspaces(); onClose(); };
  const handleWorkspaceLeft    = () => { refreshWorkspaces(); onClose(); };

  const tabs = [
    {
      id: 'general',
      label: 'General',
      icon: <SlidersHorizontal size={16} />,
      description: 'Profile, avatar and workspace settings',
    },
    {
      id: 'security',
      label: 'Security',
      icon: <Lock size={16} />,
      description: 'Password and account security',
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: theme === 'midnight'
        ? <Moon size={16} className="text-indigo-400" />
        : theme === 'dark'
          ? <Moon size={16} />
          : <Sun size={16} />,
      description: 'Theme and display preferences',
    },
  ];

  const activeTabInfo = tabs.find(t => t.id === activeTab) || tabs[0];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <GeneralSection
            session={session}
            workspace={currentWorkspace}
            onWorkspaceUpdated={updateCurrentWorkspace}
            onWorkspaceDeleted={handleWorkspaceDeleted}
            onWorkspaceLeft={handleWorkspaceLeft}
          />
        );
      case 'security':    return <SecuritySection />;
      case 'appearance':  return <AppearanceSection theme={theme} setThemeMode={setThemeMode} />;
      default:
        return (
          <GeneralSection
            session={session}
            workspace={currentWorkspace}
            onWorkspaceUpdated={updateCurrentWorkspace}
            onWorkspaceDeleted={handleWorkspaceDeleted}
            onWorkspaceLeft={handleWorkspaceLeft}
          />
        );
    }
  };

  const handleClose = useCallback((e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setIsLeaving(true);
    setTimeout(() => { setIsLeaving(false); onClose(); }, 200);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isOpen) handleClose(); };
    if (isOpen) {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 backdrop-blur-sm bg-black/20 dark:bg-black/50 midnight:bg-black/60 ${soraFontBase}`}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(e); }}
    >
      <div
        className={`w-11/12 max-w-5xl h-5/6 max-h-[88vh] bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl shadow-2xl flex overflow-hidden transition-all duration-200 ease-in-out ${isLeaving ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0 bg-white dark:bg-gray-900 midnight:bg-gray-950 flex flex-col border-r border-gray-200 dark:border-gray-800 midnight:border-gray-800">
          <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
              Settings
            </h2>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors
                  ${activeTab === t.id
                    ? 'bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-100 font-medium'
                    : 'text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100/60 dark:hover:bg-gray-800/60 midnight:hover:bg-gray-800/60 hover:text-gray-800 dark:hover:text-gray-200 midnight:hover:text-gray-200'
                  }`}
              >
                <span className={activeTab === t.id ? 'text-indigo-500 dark:text-indigo-400' : ''}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800 midnight:bg-gray-900">
          {/* Header */}
          <div className="px-7 py-5 border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                {activeTabInfo.label}
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-500 mt-0.5">
                {activeTabInfo.description}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 transition-colors"
              aria-label="Close settings"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-7 py-7">
            <div className="max-w-2xl">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
