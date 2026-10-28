import React, { createContext, useContext, type ReactNode } from 'react';
import type { Theme } from './index';

interface ThemeContextType {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'default' });

export const useTheme = () => useContext(ThemeContext);

interface ThemeProviderProps {
  theme: Theme;
  children: ReactNode;
  className?: string;
}

/**
 * Applies a theme to its subtree by adding the `theme-{name}` CSS class.
 * All CSS custom properties (--bg-1, --text-0, --primary-*, etc.) are scoped
 * to this class, so multiple ThemeProviders can coexist on the same page.
 *
 * The wrapper is display:contents — it has no layout impact and adds no box.
 * CSS custom properties cascade through display:contents elements normally.
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ theme, children, className }) => {
  return (
    <ThemeContext.Provider value={{ theme }}>
      <div
        className={[`theme-${theme}`, className].filter(Boolean).join(' ')}
        style={{ display: 'contents' }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
};
