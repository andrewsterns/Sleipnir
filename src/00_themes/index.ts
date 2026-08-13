export type Theme = 'default' | 'houseplant' | 'dark' | 'tactical' | 'light';

// Every theme class applyTheme knows how to clear off the root. Anything not
// in this list would linger when switching away from it.
const ALL_THEME_CLASSES = ['theme-default', 'theme-houseplant', 'theme-dark', 'theme-tactical', 'theme-light'];

const STORAGE_KEY = 'sleipnir-theme';

// Tactical is the app's real house style — every view renders in it today, so
// it's the default a fresh install (or a cleared localStorage) lands on.
export const DEFAULT_THEME: Theme = 'tactical';

// The polished, user-selectable themes shown in Settings → Appearance. The
// legacy default/houseplant/dark palettes aren't listed: they predate the
// tactical-tuned UI and aren't maintained against it. Adding a new theme here
// (plus its CSS) is all the switcher needs.
export interface ThemeOption {
  id: Theme;
  label: string;
  description: string;
}
export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'tactical', label: 'Tactical', description: 'The default dark HUD — near-black panels, mono type.' },
  { id: 'light',    label: 'Light',    description: 'A crisp cool-neutral light surface with dark ink.' },
];

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  root.classList.remove(...ALL_THEME_CLASSES);
  root.classList.add(`theme-${theme}`);
  localStorage.setItem(STORAGE_KEY, theme);
};

export const getSavedTheme = (): Theme => {
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return saved && ALL_THEME_CLASSES.includes(`theme-${saved}`) ? saved : DEFAULT_THEME;
};
