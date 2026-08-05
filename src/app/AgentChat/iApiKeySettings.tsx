export interface KeyStatus {
  configured: boolean
  hint: string | null
}

export interface ModelOption {
  id: string
  label: string
  description: string
}

export interface ModelStatus {
  model: string
  options: ModelOption[]
}

// Keep in sync with AVAILABLE_MODELS in electron/modelStore.cjs.
export const ANTHROPIC_MODELS: ModelOption[] = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', description: 'Most capable — best for hard, multi-step work' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', description: 'Balanced speed and intelligence (default)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Fastest and cheapest' },
]

export interface SettingsAPI {
  getKeyStatus: (provider: string) => Promise<KeyStatus>
  setKey: (provider: string, key: string) => Promise<KeyStatus>
  clearKey: (provider: string) => Promise<KeyStatus>
  getModel: () => Promise<ModelStatus>
  setModel: (model: string) => Promise<string>
}

declare global {
  interface Window {
    settingsAPI?: SettingsAPI
  }
}

// No web-transport equivalent — BYOK keys only ever live in the Electron
// main process's encrypted local store (see electron/apiKeyStore.cjs).
export function isSettingsAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.settingsAPI
}
