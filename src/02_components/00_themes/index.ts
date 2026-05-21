export type Theme = 'default' | 'houseplant' | 'dark';

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  
  // Remove all theme classes
  root.classList.remove('theme-houseplant', 'theme-dark', 'theme-default');
  
  // Add current theme class
  root.classList.add(`theme-${theme}`);
  
  // Persist if needed
  localStorage.setItem('sleipnir-theme', theme);
};

export const getSavedTheme = (): Theme => {
  return (localStorage.getItem('sleipnir-theme') as Theme) || 'default';
};
