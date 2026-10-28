// How the app shell stacks, and how much room the bottom dock reserves.
//
// ── Why this file exists ───────────────────────────────────────────────────
//
// The bottom dock (Terminal, AI Chat, Problems, Run) is a fixed-position panel, and
// two independent facts had to stay true for it to behave. Both were spelled out
// in three separate files and one of them was simply wrong:
//
//   1. Its height must match the strip App.tsx reclaims from the layout above,
//      or the panel covers real content instead of landing in an empty gap.
//      Three components each hard-coded 320, App.tsx hard-coded it a fourth
//      time, and every toggle hard-coded 340 for "clear of the open panel".
//      Nothing tied them together.
//
//   2. It must sit BELOW dialogs. It did not: the dock painted at 999 while
//      every modal and popover in the app sits at 200, so an open terminal took
//      a 320px bite out of the bottom of any dialog you opened — including the
//      buttons you needed to dismiss it.
//
// Both are ordering facts about the shell as a whole, so they belong to the
// shell rather than to any one panel inside it.

/**
 * Height of an open dock panel, and of the strip App.tsx reclaims for it.
 *
 * One constant for both halves, because they are the same measurement: the
 * panel is only "in a gap" rather than "on top of your work" while they agree.
 */
export const DOCK_PANEL_HEIGHT = 320

/**
 * Height of the status bar along the bottom of the window — the docks'
 * toggles live there (see app/StatusBar), and an open dock panel sits
 * directly on top of it rather than covering it.
 */
export const STATUS_BAR_HEIGHT = 26

/**
 * The shell's stacking order, lowest first.
 *
 * The numbers are spaced so a tier can gain neighbours without renumbering the
 * ones around it. What matters is the ORDER, and one rule above all: a dialog
 * asks the user a question, so nothing the user did not just open may cover it.
 */
export const LAYER = {
  /** Chrome floating inside a view: a split-view close button, a canvas toolbar. */
  viewChrome: 10,
  /**
   * The bottom dock panels.
   *
   * Above a view's own chrome, below anything modal. It used to outrank both,
   * which is the bug this tier exists to prevent from coming back.
   */
  dock: 100,
  /**
   * Anchored popovers and modal dialogs, with their scrims — what the rest of
   * the app already passes as `z={200}`.
   */
  dialog: 200,
  /** The command palette, which opens over a dialog. */
  palette: 300,
  /** The title bar's own menus, which open over everything. */
  titleBarMenu: 2000,
} as const
