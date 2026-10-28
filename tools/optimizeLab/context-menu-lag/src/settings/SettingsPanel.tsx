import { useState } from 'react'

export function SettingsPanel() {
  const [dark, setDark] = useState(true)
  return (
    <label>
      <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> Dark theme
    </label>
  )
}
