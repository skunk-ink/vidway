// Username rules and reserved names. Used by the users route during
// validation; mirrored loosely on the frontend for live UX feedback,
// but the server is the source of truth.

// 3-20 chars total. Must start with a letter so usernames don't look
// like numbers or system identifiers. Lowercase letters, digits,
// underscores, hyphens are allowed. No whitespace, no dots (we don't
// want them to look like domains), no @-signs.
const USERNAME_RE = /^[a-z][a-z0-9_-]{2,19}$/

// Reserved handles. Some are operational (admin paths, API surfaces),
// some are protective against impersonation, some just look weird.
// Stored lowercase since we compare lowercased input.
const RESERVED = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'config',
  'help',
  'login',
  'logout',
  'me',
  'mine',
  'official',
  'profile',
  'register',
  'root',
  'settings',
  'signin',
  'signout',
  'signup',
  'staff',
  'sia',
  'support',
  'system',
  'team',
  'upload',
  'user',
  'users',
  'v',
  'vidway',
  'watch',
])

export type UsernameError =
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'must_start_with_letter'
  | 'reserved'

/**
 * Validate a candidate username. Returns the normalized lowercase form
 * on success, or an error code on failure. Note that the canonical
 * stored form is whatever the user submitted (preserving case for
 * display), but uniqueness/lookup is case-insensitive.
 */
export function validateUsername(
  raw: string,
): { ok: true; username: string } | { ok: false; error: UsernameError } {
  const trimmed = raw.trim()
  if (trimmed.length < 3) return { ok: false, error: 'too_short' }
  if (trimmed.length > 20) return { ok: false, error: 'too_long' }

  const lower = trimmed.toLowerCase()
  if (!/^[a-z]/.test(lower)) return { ok: false, error: 'must_start_with_letter' }
  if (!USERNAME_RE.test(lower)) return { ok: false, error: 'invalid_chars' }
  if (RESERVED.has(lower)) return { ok: false, error: 'reserved' }

  return { ok: true, username: trimmed }
}

/**
 * Human-readable message for a UsernameError. Used in API responses;
 * the frontend can also use this if it imports from a shared package
 * (we duplicate the strings on the web side since there's no shared
 * lib).
 */
export function usernameErrorMessage(e: UsernameError): string {
  switch (e) {
    case 'too_short':
      return 'Username must be at least 3 characters'
    case 'too_long':
      return 'Username must be at most 20 characters'
    case 'invalid_chars':
      return 'Username can only contain letters, digits, underscores, and hyphens'
    case 'must_start_with_letter':
      return 'Username must start with a letter'
    case 'reserved':
      return 'That username is reserved'
  }
}
