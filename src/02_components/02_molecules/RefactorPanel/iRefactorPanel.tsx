export interface RefactorPanelProps {
  /** Called after a successful apply so the mounting page can refresh its own tree/graph state. */
  onApplied?: () => void
}
