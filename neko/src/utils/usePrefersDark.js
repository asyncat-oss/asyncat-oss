import { useEffect, useState } from 'react';

export function usePrefersDark() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark') ||
    document.documentElement.classList.contains('midnight')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(
        document.documentElement.classList.contains('dark') ||
        document.documentElement.classList.contains('midnight')
      );
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
