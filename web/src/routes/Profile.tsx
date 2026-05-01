import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { type UserProfile, type UsernameAvailability, api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'

type CheckState =
  | { status: 'idle' }
  | { status: 'checking'; username: string }
  | { status: 'result'; username: string; result: UsernameAvailability }
  | { status: 'error'; username: string; message: string }

/**
 * Own-profile editing page. Reads the current profile (if any),
 * provides a form to claim a username, and offers live availability
 * feedback debounced at 400ms.
 */
export function Profile() {
  const sdk = useAuthStore((s) => s.sdk)
  const addToast = useToastStore((s) => s.addToast)
  const pubkey = useMemo(() => {
    try {
      return sdk?.appKey().publicKey() ?? null
    } catch {
      return null
    }
  }, [sdk])

  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined)
  const [username, setUsername] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [check, setCheck] = useState<CheckState>({ status: 'idle' })

  // Initial load.
  useEffect(() => {
    if (!pubkey) return
    let cancelled = false
    api.getProfileByPubkey(pubkey).then((p) => {
      if (cancelled) return
      setProfile(p)
      if (p) setUsername(p.username)
    })
    return () => {
      cancelled = true
    }
  }, [pubkey])

  // Debounced availability check. We only check when the user types
  // something different from their current username (so the page
  // doesn't say "taken" about their own existing handle).
  useEffect(() => {
    const trimmed = username.trim()
    if (trimmed.length < 3) {
      setCheck({ status: 'idle' })
      return
    }
    if (profile && trimmed.toLowerCase() === profile.username.toLowerCase()) {
      setCheck({ status: 'idle' })
      return
    }

    setCheck({ status: 'checking', username: trimmed })
    let cancelled = false
    const handle = setTimeout(async () => {
      try {
        const result = await api.checkUsername(trimmed)
        if (cancelled) return
        setCheck({ status: 'result', username: trimmed, result })
      } catch (e) {
        if (cancelled) return
        setCheck({
          status: 'error',
          username: trimmed,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [username, profile])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sdk) return
    const trimmed = username.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const next = await api.setProfile({ username: trimmed }, sdk.appKey())
      setProfile(next)
      // Broadcast so the navbar updates immediately without a re-fetch.
      window.dispatchEvent(new CustomEvent('vidway:profile-updated', { detail: next }))
      addToast(
        profile ? `Username updated to @${next.username}` : `Welcome aboard, @${next.username}!`,
      )
    } catch (e) {
      addToast(
        `Could not save profile: ${e instanceof Error ? e.message : String(e)}`,
        'error',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Render — three states: loading, no-profile-yet, has-profile.
  if (!pubkey) return null
  if (profile === undefined) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-neutral-500 dark:text-neutral-400">
        Loading…
      </div>
    )
  }

  // The submit button stays disabled while the username is invalid,
  // unchanged from the existing one, or being checked. Coerce to a
  // strict boolean since && short-circuits to null when profile is null.
  const trimmed = username.trim()
  const unchanged = !!(profile && trimmed.toLowerCase() === profile.username.toLowerCase())
  const checkBlocks =
    check.status === 'checking' ||
    (check.status === 'result' && !check.result.available)
  const submitDisabled = submitting || trimmed.length < 3 || unchanged || checkBlocks

  return (
    <div className="max-w-md mx-auto px-6 py-8 w-full">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
        Profile
      </h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
        Pick a username so other people see <span className="font-mono">@you</span> instead of a
        long key.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="username"
            className="block text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1"
          >
            Username
          </label>
          <div className="flex items-stretch rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden focus-within:border-neutral-400 dark:focus-within:border-neutral-600 transition-colors">
            <span className="px-3 flex items-center text-neutral-500 dark:text-neutral-400 text-sm select-none border-r border-neutral-200 dark:border-neutral-800">
              @
            </span>
            <input
              id="username"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alice"
              maxLength={20}
              className="flex-1 px-3 py-2 text-sm bg-transparent text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none"
            />
          </div>

          {/* Live status — single line under the input. */}
          <div className="mt-1.5 min-h-5 text-xs">
            {check.status === 'checking' && (
              <span className="text-neutral-500 dark:text-neutral-400">Checking…</span>
            )}
            {check.status === 'result' && check.result.available && (
              <span className="text-green-600 dark:text-green-500">@{check.username} is available</span>
            )}
            {check.status === 'result' && !check.result.available && (
              <span className="text-red-600 dark:text-red-500">{check.result.reason}</span>
            )}
            {check.status === 'error' && (
              <span className="text-red-600 dark:text-red-500">{check.message}</span>
            )}
            {check.status === 'idle' && profile && unchanged && (
              <span className="text-neutral-500 dark:text-neutral-400">
                This is your current handle.
              </span>
            )}
            {check.status === 'idle' && !profile && trimmed.length === 0 && (
              <span className="text-neutral-500 dark:text-neutral-400">
                3–20 chars, letters / digits / <code>_</code> / <code>-</code>, starts with a letter.
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitDisabled}
            className="px-4 py-2 text-sm rounded-lg bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-300 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Saving…' : profile ? 'Update username' : 'Claim username'}
          </button>
          {profile && (
            <Link
              to={`/u/${profile.username}`}
              className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            >
              View public profile →
            </Link>
          )}
        </div>
      </form>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
        <p>
          <span className="text-neutral-400 dark:text-neutral-500">Public key</span>{' '}
          <span className="font-mono">{pubkey}</span>
        </p>
      </div>
    </div>
  )
}
