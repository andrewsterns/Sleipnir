import { useState, useCallback, useRef, useEffect } from 'react';
import type { DropdownOption } from './iDropdown';

export const useDropdownViewModel = (
  options: DropdownOption[],
  initialValue?: string | string[],
  multiple?: boolean,
) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(
    (multiple ? undefined : (initialValue as string)) || options[0]?.value,
  );
  const [selectedValues, setSelectedValues] = useState<string[]>(
    (multiple ? (initialValue as string[]) : undefined) || [],
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  // The menu portals to document.body (see Dropdown.tsx) so it can escape
  // an ancestor ScrollWindow's clipping — it's no longer a DOM child of
  // dropdownRef, so click-outside must check this ref too, or clicking an
  // option would register as "outside" and close the menu before its own
  // onClick fires.
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Single-select: picks the value and closes the menu (unchanged behavior).
  const selectOption = useCallback((value: string) => {
    setSelectedValue(value);
    setIsOpen(false);
  }, []);

  // Multi-select: toggles the value in/out of the array; menu stays open so
  // several options can be picked in one interaction.
  const toggleOption = useCallback((value: string) => {
    setSelectedValues((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = !!dropdownRef.current?.contains(target);
      const insideMenu = !!menuRef.current?.contains(target);
      if (!insideTrigger && !insideMenu) close();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [close]);

  const selectedLabel = options.find(opt => opt.value === selectedValue)?.label || 'Select...';

  return {
    isOpen,
    selectedValue,
    selectedValues,
    selectedLabel,
    toggle,
    close,
    selectOption,
    toggleOption,
    dropdownRef,
    menuRef
  };
};
