// Per-user auto-refresh preferences. Stored in localStorage as a single
// JSON object keyed on a prefix of the user's public key, so the value is
// scoped to the current Vidway user without bleeding across users sharing
// a browser. Survives reloads; doesn't survive a localStorage clear or a
// switch to a different browser/profile.
//
// Schema in storage: a JSON array of listing IDs that have auto-refresh on.
// Set semantics — presence means "on", absence means "off."

function storageKey(pubkey: string): string {
  // Same 16-char prefix the auth store uses, just under a different
  // namespace. Long enough to be unambiguous, short enough that the key
  // stays human-skimmable in devtools.
  return `vidway-autorefresh-${pubkey.slice(0, 16)}`
}

export function loadPrefs(pubkey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(pubkey))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((s): s is string => typeof s === 'string'))
  } catch {
    return new Set()
  }
}

export function savePrefs(pubkey: string, prefs: Set<string>): void {
  try {
    localStorage.setItem(storageKey(pubkey), JSON.stringify([...prefs]))
  } catch {
    // localStorage can throw in private mode or when full. Auto-refresh
    // is a convenience feature; silently giving up is the right move.
  }
}

export function setAutoRefresh(
  pubkey: string,
  listingId: string,
  on: boolean,
): Set<string> {
  const prefs = loadPrefs(pubkey)
  if (on) prefs.add(listingId)
  else prefs.delete(listingId)
  savePrefs(pubkey, prefs)
  return prefs
}
