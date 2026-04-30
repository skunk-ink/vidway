// Theme state. A single Zustand store so all components see the same
// resolved theme. Boots from system preference at module-load time, then
// hydrates from per-user localStorage once the auth flow knows who the
// user is (App.tsx wires the hydrate call).

import { create } from 'zustand'
import { applyTheme, loadTheme, resolveTheme, saveTheme, type Theme } from '../lib/theme'

interface ThemeState {
  theme: Theme
  resolved: 'light' | 'dark'
  pubkey: string | null
  setTheme: (next: Theme) => void
  hydrate: (pubkey: string | null) => void
}

// Apply system default at module load so the very first paint is correct
// (no flash of wrong theme on load). We re-resolve on every store update.
const initialResolved = resolveTheme('system')
applyTheme(initialResolved)

// Listen for OS theme changes. If the user is on 'system', reflect them.
if (typeof window !== 'undefined') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', () => {
    const { theme } = useThemeStore.getState()
    if (theme === 'system') {
      const next = resolveTheme(theme)
      applyTheme(next)
      useThemeStore.setState({ resolved: next })
    }
  })
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  resolved: initialResolved,
  pubkey: null,

  setTheme(next) {
    saveTheme(get().pubkey, next)
    const resolved = resolveTheme(next)
    applyTheme(resolved)
    set({ theme: next, resolved })
  },

  hydrate(pubkey) {
    const loaded = loadTheme(pubkey)
    const resolved = resolveTheme(loaded)
    applyTheme(resolved)
    set({ theme: loaded, resolved, pubkey })
  },
}))
