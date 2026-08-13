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

export interface SearchSortOption {
  id: string;
  label: string;
}

/** Single-select sort control embedded in the search box (see the `sort` prop). */
export interface SearchSort {
  options: SearchSortOption[];
  active: string;
  onChange: (id: string) => void;
}

export interface SearchProps extends Omit<FrameProps, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
  /** Optional filter-icon dropdown rendered next to the input (multi-select checklist). */
  filters?: SearchFilters;
  /** Optional sort-icon dropdown rendered next to the input (single-select). Lives inside the search box so sorting travels with the search field everywhere it's used, rather than being a separate control. */
  sort?: SearchSort;
}
