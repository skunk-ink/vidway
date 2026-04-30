// Per-user theme preference. Persisted in localStorage keyed on a prefix
// of the user's pubkey, like the auto-refresh feature, so the choice is
// scoped to the current Vidway user without bleeding across users sharing
// a browser.
//
// Three modes:
//   - 'light'  — force light
//   - 'dark'   — force dark
//   - 'system' — follow `prefers-color-scheme`
//
// Pre-auth (login screen, approval flow) there's no pubkey, so we fall
// back to system preference and don't persist anything.

export type Theme = 'light' | 'dark' | 'system'

function storageKey(pubkey: string): string {
  return `vidway-theme-${pubkey.slice(0, 16)}`
}

export function loadTheme(pubkey: string | null): Theme {
  if (!pubkey) return 'system'
  try {
    const raw = localStorage.getItem(storageKey(pubkey))
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // localStorage can throw in private mode or when full
  }
  return 'system'
}

export function saveTheme(pubkey: string | null, theme: Theme): void {
  if (!pubkey) return
  try {
    localStorage.setItem(storageKey(pubkey), theme)
  } catch {
    // Theme is a convenience — silently ignore storage failures
  }
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export function applyTheme(resolved: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (resolved === 'dark') html.classList.add('dark')
  else html.classList.remove('dark')
}
