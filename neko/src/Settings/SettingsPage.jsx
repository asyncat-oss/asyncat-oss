import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { SlidersHorizontal, Lock, Moon, Sun, Search } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';

// Import our components
import GeneralSection from './GeneralSection';
import SecuritySection from './SecuritySection';
import AppearanceSection from './AppearanceSection';
import WebSearchSection from './WebSearchSection';

const SettingsPage = () => {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { session } = useOutletContext() || {};

  // Workspace context
  const { currentWorkspace, refreshWorkspaces, updateCurrentWorkspace } = useWorkspace();

  // UI state
  const [theme, setTheme] = useState('light');

  const activeTab = tab || 'general';

  // Load saved theme from localStorage on component mount
  useEffect(() => {
    if (localStorage.theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('midnight');
      setTheme('dark');
    } else if (localStorage.theme === 'midnight') {
      document.documentElement.classList.add('midnight');
      document.documentElement.classList.remove('dark');
      setTheme('midnight');
    } else if (localStorage.theme === 'light') {
      document.documentElement.classList.remove('dark', 'midnight');
      setTheme('light');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
      document.documentElement.classList.remove('midnight');
      setTheme(prefersDark ? 'dark' : 'light');
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (!('theme' in localStorage)) {
        document.documentElement.classList.toggle('dark', e.matches);
        document.documentElement.classList.remove('midnight');
        setTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Set theme function
  const setThemeMode = (mode) => {
    document.documentElement.classList.remove('dark', 'midnight');

    if (mode === 'dark') {
      localStorage.theme = 'dark';
      document.documentElement.classList.add('dark');
    } else if (mode === 'midnight') {
      localStorage.theme = 'midnight';
      document.documentElement.classList.add('midnight');
    } else {
      localStorage.theme = 'light';
    }

    setTheme(mode);
  };

  // Handle workspace deletion
  const handleWorkspaceDeleted = () => {
    refreshWorkspaces();
    navigate('/home');
  };

  // Handle leaving workspace
  const handleWorkspaceLeft = () => {
    refreshWorkspaces();
    navigate('/home');
  };

  const allTabs = useMemo(() => [
    {
      id: 'general',
      label: 'General',
      icon: <SlidersHorizontal className="w-4 h-4" />,
    },
    {
      id: 'security',
      label: 'Security',
      icon: <Lock className="w-4 h-4" />,
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon:
        theme === 'dark' ? (
          <Moon className="w-4 h-4" />
        ) : theme === 'midnight' ? (
          <Moon className="w-4 h-4 text-indigo-400" />
        ) : (
          <Sun className="w-4 h-4" />
        ),
    },
    {
      id: 'web-search',
      label: 'Web Search',
      icon: <Search className="w-4 h-4" />,
    },
  ], [theme]);

  const activeTabInfo = allTabs.find((t) => t.id === activeTab) || allTabs[0];

  // Render tab content
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
      case 'web-search':  return <WebSearchSection />;
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

  const handleTabChange = (tabId) => {
    navigate(`/settings/${tabId}`);
  };

  return (
    <div className="flex h-full w-full bg-white dark:bg-gray-900 midnight:bg-gray-950 font-sans">
      {/* Left Sidebar - Navigation */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r border-gray-200/70 dark:border-gray-800/80 midnight:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/50 midnight:bg-gray-950/50">
        <div className="p-4 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            Settings
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pt-2 pb-4">
          <div className="space-y-0.5">
            {allTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`w-full flex items-center px-3 py-1.5 rounded-lg text-left transition-all duration-150
                  ${
                    activeTab === tab.id
                      ? 'bg-white dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-200 shadow-sm ring-1 ring-gray-200/50 dark:ring-gray-700/50'
                      : 'text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 active:scale-[0.98]'
                  }`}
              >
                <div className="flex items-center gap-2.5 w-full">
                  <div
                    className={`flex-shrink-0 ${
                      activeTab === tab.id
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {tab.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{tab.label}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 midnight:bg-gray-950">
        {/* Content Header */}
        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800/60 midnight:border-gray-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400">
              {activeTabInfo?.icon}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                {activeTabInfo?.label}
              </h3>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto w-full flex justify-center">
          <div className="max-w-3xl w-full px-8 py-8">
            <div className="bg-white dark:bg-gray-900 midnight:bg-gray-950">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
