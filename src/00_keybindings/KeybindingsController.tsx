import React, { createContext, useContext, useState, ReactNode } from 'react';
import { getSavedKeybindings, setKeybinding as persistKeybinding } from './index';

interface KeybindingsContextType {
  /** command id -> single key, e.g. { 'commandPalette.open': 'p' }. */
  bindings: Record<string, string>;
  setBinding: (id: string, key: string) => void;
}

const KeybindingsContext = createContext<KeybindingsContextType>({
  bindings: {},
  setBinding: () => {},
});

// Same shape as ThemeController: one Context, localStorage-persisted, so a
// remap in Settings applies live everywhere without a remount.
export const KeybindingsController: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [bindings, setBindings] = useState<Record<string, string>>(() => getSavedKeybindings());

  const setBinding = (id: string, key: string) => {
    setBindings(persistKeybinding(id, key));
  };

  return (
    <KeybindingsContext.Provider value={{ bindings, setBinding }}>
      {children}
    </KeybindingsContext.Provider>
  );
};

export const useKeybindings = () => useContext(KeybindingsContext);
