import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';

const UiPreferencesContext = createContext(null);

const DEFAULT_NAV_ITEMS = {
  projects: true,
  tasks: true,
  workflows: true,
  schedules: true,
  activity: true,
  models: true,
  tools: true,
  agent: true,
  training: true,
  trash: true,
};

const DEFAULT_WORKBENCH_PREFERENCES = {
  restoreOpenPanels: true,
  terminalPosition: 'bottom',
  terminalShell: 'auto',
  terminalStartDirectory: 'working',
  terminalFontSize: 13,
  terminalConfirmClose: true,
  rightDockWidth: 420,
  bottomDockHeight: 280,
  browserSearchEngine: 'brave',
  browserRestoreTabs: true,
  browserProfile: 'incognito',
  browserOpenLinks: 'internal',
  browserDeveloperTools: false,
  browserHistoryEnabled: true,
};

const WORKBENCH_ENUMS = {
  terminalPosition: ['bottom', 'right'],
  terminalShell: ['auto', 'pwsh', 'powershell', 'cmd', 'zsh', 'bash'],
  terminalStartDirectory: ['working', 'home'],
  browserSearchEngine: ['brave', 'google', 'duckduckgo', 'bing'],
  browserProfile: ['incognito', 'persistent'],
  browserOpenLinks: ['internal', 'system'],
};

const normalizeWorkbenchPreferences = (value = {}) => {
  const next = { ...DEFAULT_WORKBENCH_PREFERENCES, ...(value && typeof value === 'object' ? value : {}) };
  // Migrate the first implementation's "private" label to the clearer,
  // stricter incognito mode without losing any other saved preferences.
  if (next.browserProfile === 'private') next.browserProfile = 'incognito';
  Object.entries(WORKBENCH_ENUMS).forEach(([key, allowed]) => {
    if (!allowed.includes(next[key])) next[key] = DEFAULT_WORKBENCH_PREFERENCES[key];
  });
  next.terminalFontSize = Math.min(20, Math.max(10, Number(next.terminalFontSize) || 13));
  next.rightDockWidth = Math.min(900, Math.max(320, Number(next.rightDockWidth) || 420));
  next.bottomDockHeight = Math.min(600, Math.max(180, Number(next.bottomDockHeight) || 280));
  ['restoreOpenPanels', 'terminalConfirmClose', 'browserRestoreTabs', 'browserDeveloperTools', 'browserHistoryEnabled']
    .forEach((key) => { next[key] = Boolean(next[key]); });
  return next;
};

const loadWorkbenchPreferences = () => {
  try {
    const stored = localStorage.getItem('workbenchPreferences');
    return normalizeWorkbenchPreferences(stored ? JSON.parse(stored) : {});
  } catch {
    return { ...DEFAULT_WORKBENCH_PREFERENCES };
  }
};

const loadTheme = () => {
  const stored = localStorage.getItem('theme');
  return ['light', 'dark', 'midnight'].includes(stored) ? stored : 'system';
};

const loadNavItems = () => {
  try {
    const stored = localStorage.getItem('navItemsVisibility');
    return stored
      ? { ...DEFAULT_NAV_ITEMS, ...JSON.parse(stored) }
      : { ...DEFAULT_NAV_ITEMS };
  } catch {
    return { ...DEFAULT_NAV_ITEMS };
  }
};

const applyTheme = (mode) => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.remove('dark', 'midnight');

  if (mode === 'midnight') {
    document.documentElement.classList.add('midnight');
  } else if (mode === 'dark' || (mode === 'system' && prefersDark)) {
    document.documentElement.classList.add('dark');
  }
};

export const UiPreferencesProvider = ({ children }) => {
  const [theme, setThemeState] = useState(loadTheme);
  const [sidebarState, setSidebarStateValue] = useState(
    () => localStorage.getItem('sidebarState') || 'expanded',
  );
  const [pageTransitionsEnabled, setPageTransitionsEnabledValue] = useState(
    () => localStorage.getItem('pageTransitions') !== 'off',
  );
  const [navItemsVisibility, setNavItemsVisibility] = useState(loadNavItems);
  const [workbenchPreferences, setWorkbenchPreferences] = useState(loadWorkbenchPreferences);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (theme === 'system') applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [theme]);

  useEffect(() => {
    // These permutations created several competing app shells. The simplified
    // navigation is always left-aligned and visible, with compact mode optional.
    localStorage.removeItem('sidebarPosition');
    localStorage.removeItem('sidebarVisibility');
    localStorage.removeItem('topMenuBarVisibility');
  }, []);

  useEffect(() => {
    const syncFromStorage = (event) => {
      if (!event.key || event.key === 'theme') setThemeState(loadTheme());
      if (!event.key || event.key === 'sidebarState') {
        setSidebarStateValue(localStorage.getItem('sidebarState') || 'expanded');
      }
      if (!event.key || event.key === 'pageTransitions') {
        setPageTransitionsEnabledValue(localStorage.getItem('pageTransitions') !== 'off');
      }
      if (!event.key || event.key === 'navItemsVisibility') {
        setNavItemsVisibility(loadNavItems());
      }
      if (!event.key || event.key === 'workbenchPreferences') {
        setWorkbenchPreferences(loadWorkbenchPreferences());
      }
    };

    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  const setTheme = useCallback((mode) => {
    const next = ['light', 'dark', 'midnight'].includes(mode) ? mode : 'system';
    if (next === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', next);
    setThemeState(next);
  }, []);

  const setSidebarState = useCallback((value) => {
    const next = value === 'collapsed' ? 'collapsed' : 'expanded';
    localStorage.setItem('sidebarState', next);
    setSidebarStateValue(next);
  }, []);

  const setPageTransitionsEnabled = useCallback((enabled) => {
    localStorage.setItem('pageTransitions', enabled ? 'on' : 'off');
    setPageTransitionsEnabledValue(Boolean(enabled));
  }, []);

  const toggleNavItem = useCallback((key) => {
    setNavItemsVisibility((current) => {
      const next = { ...current, [key]: !current[key] };
      localStorage.setItem('navItemsVisibility', JSON.stringify(next));
      return next;
    });
  }, []);

  const setWorkbenchPreference = useCallback((key, value) => {
    setWorkbenchPreferences((current) => {
      const next = normalizeWorkbenchPreferences({ ...current, [key]: value });
      localStorage.setItem('workbenchPreferences', JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('workbench-preferences-changed', { detail: next }));
      return next;
    });
  }, []);

  const resetWorkbenchLayout = useCallback(() => {
    setWorkbenchPreferences((current) => {
      const next = normalizeWorkbenchPreferences({
        ...current,
        terminalPosition: DEFAULT_WORKBENCH_PREFERENCES.terminalPosition,
        rightDockWidth: DEFAULT_WORKBENCH_PREFERENCES.rightDockWidth,
        bottomDockHeight: DEFAULT_WORKBENCH_PREFERENCES.bottomDockHeight,
      });
      localStorage.setItem('workbenchPreferences', JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('workbench-preferences-changed', { detail: next }));
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    theme,
    setTheme,
    sidebarState,
    setSidebarState,
    pageTransitionsEnabled,
    setPageTransitionsEnabled,
    navItemsVisibility,
    toggleNavItem,
    workbenchPreferences,
    setWorkbenchPreference,
    resetWorkbenchLayout,
  }), [
    navItemsVisibility,
    pageTransitionsEnabled,
    setPageTransitionsEnabled,
    setSidebarState,
    setTheme,
    sidebarState,
    theme,
    toggleNavItem,
    workbenchPreferences,
    setWorkbenchPreference,
    resetWorkbenchLayout,
  ]);

  return (
    <UiPreferencesContext.Provider value={value}>
      {children}
    </UiPreferencesContext.Provider>
  );
};

UiPreferencesProvider.propTypes = {
  children: PropTypes.node,
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUiPreferences = () => {
  const context = useContext(UiPreferencesContext);
  if (!context) {
    throw new Error('useUiPreferences must be used within a UiPreferencesProvider');
  }
  return context;
};
