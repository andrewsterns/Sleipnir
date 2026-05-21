import { useState, useCallback, useRef, useEffect } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
}

export const useDropdownViewModel = (options: DropdownOption[], initialValue?: string) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(initialValue || options[0]?.value);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const close = useCallback(() => setIsOpen(false), []);

  const selectOption = useCallback((value: string) => {
    setSelectedValue(value);
    setIsOpen(false);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [close]);

  const selectedLabel = options.find(opt => opt.value === selectedValue)?.label || 'Select...';

  return {
    isOpen,
    selectedValue,
    selectedLabel,
    toggle,
    close,
    selectOption,
    dropdownRef
  };
};
