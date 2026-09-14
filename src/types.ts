// Legacy page union. The real tab registry is App.tsx's NAV_ITEMS, whose ids
// are plain strings — this is kept only for older consumers and is updated
// alongside NAV_ITEMS when a tab is added or renamed.
export type Page = 'planning' | 'canvas' | 'workspace' | 'validation' | 'source-control' | 'settings';
