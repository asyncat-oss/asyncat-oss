// Theme handling utilities
export const initializeTheme = () => {
  // Check if theme is explicitly set in localStorage
  if (localStorage.theme === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('midnight');
  } else if (localStorage.theme === 'midnight') {
    document.documentElement.classList.add('midnight');
    document.documentElement.classList.remove('dark');
  } else if (localStorage.theme === 'light') {
    document.documentElement.classList.remove('dark', 'midnight');
  } else {
    // Respect system preference if no theme is explicitly set
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
    document.documentElement.classList.remove('midnight');
  }
};

// Set up system theme preference listener
export const setupThemeListener = () => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = (e) => {
    if (!('theme' in localStorage)) {
      document.documentElement.classList.toggle('dark', e.matches);
      document.documentElement.classList.remove('midnight');
    }
  };
  
  mediaQuery.addEventListener('change', handleChange);
  return () => mediaQuery.removeEventListener('change', handleChange);
};

// API base URL for self-hosted build
export const AUTH_URL = import.meta.env.VITE_API_URL || 'http://localhost:8716';
