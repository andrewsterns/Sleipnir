import React, { createContext, useContext, ReactNode } from 'react';
import { Theme } from './index';

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

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ theme, children, className }) => {
  return (
    <ThemeContext.Provider value={{ theme }}>
      <div className={`theme-${theme} contents ${className || ''}`}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};
