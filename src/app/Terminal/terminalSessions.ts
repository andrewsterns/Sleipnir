// Terminal sessions outlive the page: they run in the main process, so a page
// reload (the agent editing Sleipnir itself, say) reattaches to them instead of
// losing them. The two rules the page needs for that, kept pure.

/** One running session a reloaded page can reattach to. */
export interface TerminalSessionInfo {
  id: string
}

/** The dock's tabs for the sessions still running: each gets a fresh tab key, in order. */
export function tabsFromSessions(sessions: TerminalSessionInfo[], firstKey: number): { key: number; sessionId: string }[] {
  return sessions.map((s, i) => ({ key: firstKey + i, sessionId: s.id }))
}

/**
 * Whether a chunk that arrived while attaching is news. Each chunk carries how
 * much the session had printed once it was included, and so does the replay,
 * so anything the replay already covers is dropped rather than printed twice.
 */
export function isNewChunk(chunkEnd: number, replayEnd: number): boolean {
  return chunkEnd > replayEnd
}
