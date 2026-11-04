import React, { useState } from 'react'
import { Dropdown } from '../UIKit/Dropdown/Dropdown'
import type { DropdownOption } from '../UIKit/Dropdown/iDropdown'
import { modelRef } from './iApiKeySettings'
import type { useAiSettings } from './useAiSettings'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

const CONNECT_VALUE = '__connect__'

interface ModelPickerProps {
  ai: ReturnType<typeof useAiSettings>
  /** Opens the Connect panel — offered at the bottom of the list. Omit where the panel is already on screen. */
  onConnect?: () => void
}

// Every connected provider's models in one grouped list. The chat uses
// whichever is picked from its next message on (history is plain text, so
// switching mid-conversation works).
export function ModelPicker({ ai, onConnect }: ModelPickerProps) {
  const [error, setError] = useState<string | null>(null)

  const options: DropdownOption[] = []
  for (const g of ai.groups ?? []) {
    const group = g.error ? `${g.label} (list unavailable)` : g.label
    for (const m of g.models) {
      options.push({ value: modelRef(g.provider, m.id), label: m.recommended ? `${m.label} ★` : m.label, group })
    }
  }
  if (onConnect) {
    options.push({
      value: CONNECT_VALUE,
      label: ai.anyCloudConnected ? 'Connect another provider…' : 'Connect Claude, ChatGPT or Gemini…',
      group: 'More',
    })
  }

  const change = async (value: string | string[]) => {
    const v = value as string
    if (v === CONNECT_VALUE) {
      onConnect?.()
      return
    }
    setError(await ai.selectModel(v))
  }

  const label = ai.activeLabel ?? (ai.loadingModels ? 'Loading models…' : 'Pick a model')

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <Dropdown
        options={options}
        value={ai.active?.ref}
        onChange={change}
        variant="none"
        trigger={
          <span
            title={ai.active?.fallback ? 'Your chosen model’s provider isn’t connected — using this one instead.' : 'Model used by the AI chat'}
            style={{
              fontSize: 10,
              letterSpacing: '0.03em',
              color: ai.active?.fallback ? '#e0a040' : 'var(--text-2)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 280,
              ...UI_FONT,
            }}
          >
            {label} ▾
          </span>
        }
      />
      {error && <span style={{ fontSize: 10, color: '#e07a7a', ...UI_FONT }}>{error}</span>}
    </span>
  )
}
