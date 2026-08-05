export interface RefactorPanelProps {
  /** Called after a successful apply so the mounting page can refresh its own tree/graph state. */
  onApplied?: () => void
  /** Which component library to open with initially — a picker inside the panel can still switch it. Defaults to the original default library. */
  libraryId?: string
  /** Shows the "Refactor" text label next to the trigger icon. Defaults to true; set false in cramped contexts (e.g. LeftRailing's header row, inside its ScrollWindow) where the icon alone is enough and the word would crowd the row. */
  showLabel?: boolean
}
