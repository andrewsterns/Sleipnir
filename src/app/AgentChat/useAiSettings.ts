import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActiveModel, ModelGroup, ProviderId, ProviderStatus } from './iApiKeySettings'
import { ipcErrorMessage } from './iApiKeySettings'

/**
 * Model providers, the models they offer, and which one the chat will use —
 * shared by the AI dock header, the Connect panel and the Settings page, and
 * kept in step across all of them (and every window) by the main process's
 * `settings:aiChanged` broadcast.
 */
export function useAiSettings() {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null)
  const [active, setActive] = useState<ActiveModel | null>(null)
  const [groups, setGroups] = useState<ModelGroup[] | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const mounted = useRef(true)

  const refresh = useCallback(async (opts?: { refreshModels?: boolean }) => {
    const api = window.settingsAPI
    if (!api) return
    const [nextProviders, nextActive] = await Promise.all([
      api.listProviders().catch(() => null),
      api.getActiveModel().catch(() => null),
    ])
    if (!mounted.current) return
    if (nextProviders) setProviders(nextProviders)
    if (nextActive) setActive(nextActive)

    setLoadingModels(true)
    try {
      const nextGroups = await api.listModels({ refresh: opts?.refreshModels })
      if (mounted.current) setGroups(nextGroups)
    } catch {
      // Keep whatever list was already showing.
    } finally {
      if (mounted.current) setLoadingModels(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    const unsubscribe = window.settingsAPI?.onAiSettingsChanged?.(() => refresh())
    return () => {
      mounted.current = false
      unsubscribe?.()
    }
  }, [refresh])

  // Each returns an error message, or null on success — callers show it
  // next to whatever was clicked.
  const connect = async (key: string, providerId?: ProviderId): Promise<string | null> => {
    try {
      await window.settingsAPI!.connectProvider(key, providerId)
      return null
    } catch (e) {
      return ipcErrorMessage(e)
    }
  }

  const disconnect = async (providerId: ProviderId): Promise<string | null> => {
    try {
      await window.settingsAPI!.disconnectProvider(providerId)
      return null
    } catch (e) {
      return ipcErrorMessage(e)
    }
  }

  const selectModel = async (ref: string): Promise<string | null> => {
    try {
      await window.settingsAPI!.setModel(ref)
      return null
    } catch (e) {
      return ipcErrorMessage(e)
    }
  }

  const activeLabel = (() => {
    if (!active) return null
    const group = groups?.find((g) => g.provider === active.provider)
    const model = group?.models.find((m) => m.id === active.model)
    return `${model?.label ?? active.model} · ${active.providerLabel}`
  })()

  const anyCloudConnected = !!providers?.some((p) => p.needsKey && p.connected)

  return { providers, active, activeLabel, groups, loadingModels, anyCloudConnected, refresh, connect, disconnect, selectModel }
}
