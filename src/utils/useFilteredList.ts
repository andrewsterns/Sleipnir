import { useMemo } from 'react';

export function useFilteredList<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => getText(item).toLowerCase().includes(q));
  }, [items, query, getText]);
}
