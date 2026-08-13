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
  workflows: true,
  activity: true,
  models: true,
  tools: true,
  agent: true,
  training: true,
  trash: true,
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

  const value = useMemo(() => ({
    theme,
    setTheme,
    sidebarState,
    setSidebarState,
    pageTransitionsEnabled,
    setPageTransitionsEnabled,
    navItemsVisibility,
    toggleNavItem,
  }), [
    navItemsVisibility,
    pageTransitionsEnabled,
    setPageTransitionsEnabled,
    setSidebarState,
    setTheme,
    sidebarState,
    theme,
    toggleNavItem,
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
