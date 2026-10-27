import { useCallback, useEffect, useState } from 'react'

/** Gated features — keys match electron/license.cjs's GATE_MESSAGES. */
export type ProFeature = 'unlimitedProjects' | 'multiWindow' | 'mcpServers'

/** What Pro adds, in the order Settings ▸ License and UpgradePrompt list it. */
export const PRO_FEATURES: { id: ProFeature | 'commercial'; label: string }[] = [
  { id: 'unlimitedProjects', label: 'Unlimited projects' },
  { id: 'multiWindow', label: 'Multiple windows' },
  { id: 'mcpServers', label: 'MCP servers for the agent' },
  { id: 'commercial', label: 'Commercial-use license' },
]

/** Shown on every Buy button; the real price lives on the checkout page. */
export const FOUNDER_PRICE = '$39'

export type LicenseState = 'none' | 'active' | 'checking' | 'invalid' | 'dev'

export interface LicenseStatus {
  tier: 'free' | 'pro'
  state: LicenseState
  /** False while electron/licenseConfig.cjs's store/product ids are unset — activation refuses every key. */
  configured: boolean
  email?: string
  variant?: string
  /** Last 4 characters of the stored key — the full key never reaches the renderer. */
  keyHint?: string
  /** No successful check in 30+ days. Pro keeps working; Settings just says so. */
  stale?: boolean
  error?: string
  /** Project folders the free tier has claimed, at most `freeProjectLimit`. */
  freeProjects: string[]
  freeProjectLimit: number
}

export interface UpgradeNeeded {
  feature: ProFeature
  message: string
}

export interface LicenseAPI {
  getStatus: () => Promise<LicenseStatus>
  activate: (key: string) => Promise<{ ok: boolean; error?: string; status: LicenseStatus }>
  deactivate: () => Promise<LicenseStatus>
  revalidate: () => Promise<LicenseStatus>
  releaseProject: (projectPath: string) => Promise<LicenseStatus>
  openCheckout: () => Promise<void>
  onStatus: (callback: (status: LicenseStatus) => void) => () => void
  /** Fired when a main-process gate stops one of this window's actions. */
  onUpgradeNeeded: (callback: (info: UpgradeNeeded) => void) => () => void
}

declare global {
  interface Window {
    licenseAPI?: LicenseAPI
  }
}

// No web-transport equivalent — see electron/license.cjs.
export function isLicenseAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.licenseAPI
}

/** Live license status plus its actions. `status` is null until the first read (or always, on the web). */
export function useLicense() {
  const [status, setStatus] = useState<LicenseStatus | null>(null)

  useEffect(() => {
    const api = window.licenseAPI
    if (!api) return
    let alive = true
    api.getStatus().then((s) => alive && setStatus(s))
    const off = api.onStatus(setStatus)
    return () => {
      alive = false
      off()
    }
  }, [])

  const activate = useCallback(async (key: string) => {
    const api = window.licenseAPI
    if (!api) return { ok: false, error: 'Licensing is desktop-only.' }
    const result = await api.activate(key)
    setStatus(result.status)
    return result
  }, [])

  const deactivate = useCallback(async () => {
    const s = await window.licenseAPI?.deactivate()
    if (s) setStatus(s)
  }, [])

  const releaseProject = useCallback(async (projectPath: string) => {
    const s = await window.licenseAPI?.releaseProject(projectPath)
    if (s) setStatus(s)
  }, [])

  const openCheckout = useCallback(() => {
    window.licenseAPI?.openCheckout()
  }, [])

  return { status, isPro: status?.tier === 'pro', activate, deactivate, releaseProject, openCheckout }
}
