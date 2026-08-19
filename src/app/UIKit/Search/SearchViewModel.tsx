import { useEffect, useRef, useState } from 'react';
import { SearchProps } from './iSearch';

export function useSearchViewModel({
  onChange,
  onClear,
  listItems,
  onHighlightChange,
}: Pick<SearchProps, 'onChange' | 'onClear' | 'listItems' | 'onHighlightChange'>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value);

  const handleClear = () => {
    onChange('');
    onClear?.();
    inputRef.current?.focus();
  };

  // Results reshape on every keystroke — snap the highlight back to the top
  // hit rather than pointing at whatever now sits at the old index.
  const idsKey = listItems?.map((item) => item.id).join('\u0000') ?? '';
  useEffect(() => {
    setHighlightedIndex(0);
  }, [idsKey]);

  useEffect(() => {
    onHighlightChange?.(listItems?.[highlightedIndex]?.id ?? null);
    // onHighlightChange is typically an inline setter; keying off idsKey +
    // highlightedIndex (not the callback identity) avoids firing every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!listItems || listItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % listItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + listItems.length) % listItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      listItems[highlightedIndex]?.onSelect();
    }
  };

  return { inputRef, handleChange, handleClear, handleKeyDown };
}
