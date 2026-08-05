// A slash command is handled entirely locally — it never reaches the LLM.
// Currently just `/plan`, which opens the same "Create Library" flow the
// Planning UI's "+ New Library" button does (see App.tsx's createLibraryModal
// state) — always opens blank, no args grammar (e.g. `/plan MyLib mvvm` isn't
// parsed) since that would mean inventing and documenting a mini command
// language for one command; simpler to just let the modal's own form do it.
export interface SlashCommand {
  command: string
  args: string
}

export function parseSlashCommand(text: string): SlashCommand | null {
  const m = /^\/(\w+)\s*(.*)$/s.exec(text.trim())
  return m ? { command: m[1], args: m[2] } : null
}
