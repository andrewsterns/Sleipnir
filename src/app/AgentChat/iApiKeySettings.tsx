import type { AgentMode } from './iAgentChat'

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

// Sentinel "model" id meaning "use the local Ollama provider" — keep in sync
// with OLLAMA_MODEL_ID in electron/modelStore.cjs.
export const OLLAMA_MODEL_ID = 'ollama:local'

// Keep in sync with AVAILABLE_MODELS in electron/modelStore.cjs.
export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'claude-opus-5', label: 'AI Opus 5', description: 'Most capable — best for hard, multi-step work' },
  { id: 'claude-sonnet-5', label: 'AI Sonnet 5', description: 'Balanced speed and intelligence (default)' },
  { id: 'claude-haiku-4-5', label: 'AI Haiku 4.5', description: 'Fastest and cheapest' },
  { id: OLLAMA_MODEL_ID, label: 'Local Ollama', description: 'Runs on your machine via ollama serve — free, no API key, no cloud' },
]

export interface AgentSettings {
  defaultMode: AgentMode
  maxToolTurns: number
}

export interface SettingsAPI {
  getKeyStatus: (provider: string) => Promise<KeyStatus>
  setKey: (provider: string, key: string) => Promise<KeyStatus>
  clearKey: (provider: string) => Promise<KeyStatus>
  getModel: () => Promise<ModelStatus>
  setModel: (model: string) => Promise<string>
  getAgentSettings: () => Promise<AgentSettings>
  setAgentSettings: (patch: Partial<AgentSettings>) => Promise<AgentSettings>
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
