export interface CommandBinding {
  id: string;
  label: string;
  /** A single lowercase key, e.g. 'p' — always paired with both ctrl and meta modifiers for cross-platform parity, same as CommandPalette's own hardcoded Ctrl+P/Cmd+P today. Deliberately not a full modifier-remapping system (see ROADMAP.md's Phase 2) — just enough to remap the one real hotkey that exists. */
  key: string;
}

// The one real hotkey registered anywhere today (CommandPalette.tsx's
// onHotkey). Add an entry here — and read it via useKeybindings() at the
// registration site — as more commands gain hotkeys later.
export const DEFAULT_KEYBINDINGS: CommandBinding[] = [
  { id: 'commandPalette.open', label: 'Quick Open (Go to File)', key: 'p' },
];

const STORAGE_KEY = 'sleipnir-keybindings';

type KeyMap = Record<string, string>;

function defaultKeyMap(): KeyMap {
  return Object.fromEntries(DEFAULT_KEYBINDINGS.map((b) => [b.id, b.key]));
}

export function getSavedKeybindings(): KeyMap {
  const defaults = defaultKeyMap();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as KeyMap) };
  } catch {
    return defaults;
  }
}

export function setKeybinding(id: string, key: string): KeyMap {
  const next = { ...getSavedKeybindings(), [id]: key };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
