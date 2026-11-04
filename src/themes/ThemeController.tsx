import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type Theme, applyTheme, getSavedTheme, DEFAULT_THEME } from './index';

interface AppThemeContextType {
  /** The user's currently selected app-wide theme. */
  theme: Theme;
  /** Switch the app theme — persists to localStorage and re-scopes every view. */
  setTheme: (theme: Theme) => void;
}

const AppThemeContext = createContext<AppThemeContextType>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

// The opaque hex value of a themed CSS custom property, read off the root after
// the theme class is applied. The native title-bar overlay needs a solid colour
// (no alpha), so an rgba() token like tactical's --bg-1 is flattened to rgb.
function opaqueTokenColor(cssVar: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (!raw) return fallback;
  const m = raw.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((s) => parseFloat(s));
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return raw.startsWith('#') ? raw : fallback;
}

/**
 * The single source of truth for the app-wide theme.
 *
 * Views don't hard-code a theme anymore; each reads `useAppTheme().theme` and
 * passes it to its root Frame (or the top-level ThemeProvider does it for the
 * shell). Selecting a theme in Settings → Appearance flows through here, which
 * both persists it and updates every subscribed view in one render.
 */
export const ThemeController: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => getSavedTheme());

  // Keep the document root's `theme-*` class (and localStorage) in sync, so
  // color-scheme, native scrollbars, and the body ground follow the selection
  // even outside any Frame subtree.
  useEffect(() => {
    applyTheme(theme);
    // The OS-drawn min/max/close overlay (Windows) can't see our CSS, so push
    // the just-applied --bg-1/--text-1 to the main process to recolor it —
    // otherwise light mode keeps the dark button strip. No-op off Electron/Win.
    window.electronAPI?.setTitleBarTheme?.({
      color: opaqueTokenColor('--bg-1', '#080808'),
      symbolColor: opaqueTokenColor('--text-1', '#e8e8e8'),
    });
  }, [theme]);

  return (
    <AppThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </AppThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(AppThemeContext);
