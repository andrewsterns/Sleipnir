export function MenuItem({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <button role="menuitem" onClick={onSelect}>
      {label}
    </button>
  )
}
