const fg256 = n => `\x1b[38;5;${n}m`;

const THEME = {
  name: 'dark',
  accent: '\x1b[35m',
  accent2: '\x1b[36m',
  border: fg256(239),
};

export const getTheme = () => THEME;
