import { FrameProps } from '../Frame/Frame';

export interface SearchFilterOption {
  id: string;
  label: string;
}

export interface SearchFilters {
  options: SearchFilterOption[];
  active: string[];
  onChange: (ids: string[]) => void;
}

export interface SearchProps extends Omit<FrameProps, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
  /** Optional filter-icon dropdown rendered next to the input (multi-select checklist). */
  filters?: SearchFilters;
}
