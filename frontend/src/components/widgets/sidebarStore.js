import { useState, useEffect } from 'react'
import { sidebar as sidebarApi } from '../../api/client'

/**
 * Global store for the shared navigation sidebar config. A single source of
 * truth so every SidebarWidget (on any page) and the designer's config editor
 * render the same buttons/style. Module-level (not a context) so it works
 * identically in the runtime monitor and the editor canvas without provider
 * plumbing.
 *
 *  - useSidebarConfig()   subscribe + lazy-load, for widgets
 *  - setLocalConfig(cfg)  live preview while editing (not persisted)
 *  - saveSidebarConfig()  persist to backend (admin) + broadcast
 *  - reloadSidebar()      force a re-fetch
 */

export const DEFAULT_SIDEBAR = {
  orientation: 'vertical', // 'vertical' | 'horizontal'
  bgColor: '#1e293b',
  textColor: '#e2e8f0',
  activeColor: '#1677ff',
  iconSize: 22,
  buttonSize: 56,          // extent along the bar's main axis (height if vertical, width if horizontal)
  showLabels: true,
  align: 'start',          // 'start' | 'center'
  buttons: [],
}

let config = null
let loaded = false
let inflight = null
const listeners = new Set()

function emit() { for (const fn of listeners) fn(config) }

export function getSidebarConfig() { return config || DEFAULT_SIDEBAR }

export function subscribeSidebar(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function ensureSidebarLoaded() {
  if (loaded) return Promise.resolve(config)
  if (inflight) return inflight
  inflight = sidebarApi.get()
    .then((c) => { config = { ...DEFAULT_SIDEBAR, ...c }; loaded = true; inflight = null; emit(); return config })
    .catch(() => { config = DEFAULT_SIDEBAR; loaded = true; inflight = null; emit(); return config })
  return inflight
}

// Live preview: update in-memory config and broadcast without persisting.
export function setLocalConfig(next) {
  config = next; loaded = true; emit()
}

// Persist to the backend and broadcast the saved config.
export async function saveSidebarConfig(next) {
  config = next; loaded = true; emit()
  const { config: saved } = await sidebarApi.save(next)
  if (saved) { config = { ...DEFAULT_SIDEBAR, ...saved }; emit() }
  return config
}

export function reloadSidebar() {
  loaded = false; inflight = null
  return ensureSidebarLoaded()
}

// Hook for widgets: subscribe to the store and trigger a lazy load.
export function useSidebarConfig() {
  const [cfg, setCfg] = useState(getSidebarConfig())
  useEffect(() => {
    const un = subscribeSidebar(setCfg)
    ensureSidebarLoaded()
    return un
  }, [])
  return cfg
}
