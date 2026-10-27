import type { AgentMode } from './iAgentChat'

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama'

/** One model provider's connection state — see electron/chatProviders/index.cjs. */
export interface ProviderStatus {
  id: ProviderId
  /** Product name shown to people: Claude, ChatGPT, Gemini, Local Ollama. */
  label: string
  company: string
  keyUrl: string
  keyHint: string | null
  needsKey: boolean
  /** Key providers: a key is saved or found in the environment. Ollama: the local server answered. */
  connected: boolean
  source: 'saved' | 'env' | null
  /** Last 4 characters of the key in use. */
  hint: string | null
  /** Set when the key comes from an environment variable. */
  envVar: string | null
}

export interface ModelOption {
  id: string
  label: string
  description?: string
  recommended?: boolean
}

export interface ModelGroup {
  provider: ProviderId
  label: string
  models: ModelOption[]
  /** Set when the live listing failed — `models` may then be a known fallback list. */
  error?: string
}

export interface ActiveModel {
  provider: ProviderId
  providerLabel: string
  model: string
  /** "provider:model" */
  ref: string
  /** True when the saved choice's provider isn't connected and this one was picked instead. */
  fallback: boolean
  saved: string | null
}

export interface AgentSettings {
  defaultMode: AgentMode
  maxToolTurns: number
}

export interface SettingsAPI {
  listProviders: () => Promise<ProviderStatus[]>
  /** Which provider a pasted key looks like it belongs to, by prefix. */
  detectProvider: (key: string) => Promise<ProviderId | null>
  /** Checks the key live, then saves it encrypted. Rejects with a readable reason. */
  connectProvider: (key: string, providerId?: ProviderId) => Promise<ProviderStatus>
  disconnectProvider: (providerId: ProviderId) => Promise<ProviderStatus>
  openKeyPage: (providerId: ProviderId) => Promise<void>
  listModels: (opts?: { refresh?: boolean }) => Promise<ModelGroup[]>
  getActiveModel: () => Promise<ActiveModel>
  setModel: (ref: string) => Promise<string>
  /** Fired in every window after a key or model change. */
  onAiSettingsChanged: (callback: () => void) => () => void
  getAgentSettings: () => Promise<AgentSettings>
  setAgentSettings: (patch: Partial<AgentSettings>) => Promise<AgentSettings>
}

declare global {
  interface Window {
    settingsAPI?: SettingsAPI
  }
}

// No web-transport equivalent — keys only ever live in the Electron main
// process's encrypted local store (see electron/apiKeyStore.cjs).
export function isSettingsAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.settingsAPI
}

export function modelRef(provider: ProviderId, model: string): string {
  return `${provider}:${model}`
}

/** ipcRenderer.invoke wraps main-process errors as "Error invoking remote method '…': Error: <message>". */
export function ipcErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}
