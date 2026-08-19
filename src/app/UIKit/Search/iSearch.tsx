import { FrameProps } from '../Frame/Frame';

export interface SearchFilterOption {
  id: string;
  label: string;
  /** Optional section header this option is clustered under in the filter dropdown (e.g. "ASSET TYPE" vs "FILE TYPE"). Options sharing a group render together under one heading. */
  group?: string;
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

/**
 * The one sort dropdown every left-rail search shares (Workspace, Research,
 * Planning, Source Control, Analytics) — same two axes, same labels, so the
 * sort control reads identically on every page rather than each view inventing
 * its own. `'recent'` means "most-recent first", backed by whatever recency
 * signal each list actually has (file/node createdAt, git file mtime); callers
 * own the sort itself, this just fixes the option set and its labels.
 */
export type SearchSortId = 'name' | 'recent';
export const SEARCH_SORT_OPTIONS: SearchSortOption[] = [
  { id: 'name', label: 'Name' },
  { id: 'recent', label: 'Recently modified' },
];

/** Single-select sort control embedded in the search box (see the `sort` prop). */
export interface SearchSort {
  options: SearchSortOption[];
  active: string;
  onChange: (id: string) => void;
}

/** One selectable result in `listItems` — just enough to drive keyboard nav; the caller renders its own row and owns the visual highlight (see `onHighlightChange`). */
export interface SearchListItem {
  id: string;
  onSelect: () => void;
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
  /**
   * Flat, visually-ordered list of the current results (e.g. every visible
   * file row, node/plan row) — lets ↑/↓ move a keyboard highlight and Enter
   * activate the highlighted item's `onSelect`, all without leaving the
   * input. Search never renders these itself; the caller keeps rendering its
   * own list/tree and just mirrors the highlight (see `onHighlightChange`).
   */
  listItems?: SearchListItem[];
  /** Fires whenever the keyboard highlight moves — including to `null` when `listItems` is empty/undefined — so the caller can visually highlight the matching row (typically via ListRow's `connected` prop). */
  onHighlightChange?: (id: string | null) => void;
}
