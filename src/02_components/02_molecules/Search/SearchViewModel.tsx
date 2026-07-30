import { useRef } from 'react';
import { SearchProps } from './iSearch';

export function useSearchViewModel({ onChange, onClear }: Pick<SearchProps, 'onChange' | 'onClear'>) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value);

  const handleClear = () => {
    onChange('');
    onClear?.();
    inputRef.current?.focus();
  };

  return { inputRef, handleChange, handleClear };
}
