import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { type Listing, type UserProfile as UserProfileT, api } from '../lib/api'
import { formatDuration } from '../lib/format'

type State =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'ok'; profile: UserProfileT; listings: Listing[] }
  | { kind: 'error'; message: string }

/**
 * Public profile page at /u/:username. Shows the user's handle, when
 * they joined, and the listings they've published.
 */
export function UserProfileRoute() {
  const { username = '' } = useParams<{ username: string }>()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    ;(async () => {
      try {
        const profile = await api.getProfileByUsername(username)
        if (cancelled) return
        if (!profile) {
          setState({ kind: 'not_found' })
          return
        }
        const list = await api.listListings({
          uploader: profile.pubkey,
          status: 'all',
          sort: 'recent',
          limit: 48,
        })
        if (cancelled) return
        setState({ kind: 'ok', profile, listings: list.items })
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [username])

  const joinedLabel = useMemo(() => {
    if (state.kind !== 'ok') return null
    return new Date(state.profile.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
    })
  }, [state])

  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-neutral-500 dark:text-neutral-400">
        Loading…
      </div>
    )
  }

  if (state.kind === 'not_found') {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          No such user
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Nobody is using <span className="font-mono">@{username}</span> yet.
        </p>
        <Link
          to="/"
          className="inline-block mt-6 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          ← Back to browse
        </Link>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          {state.message}
        </div>
      </div>
    )
  }

  const { profile, listings } = state

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          @{profile.username}
        </h1>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {joinedLabel && <>Joined {joinedLabel} · </>}
          <span className="font-mono" title={profile.pubkey}>
            {profile.pubkey.slice(0, 12)}…{profile.pubkey.slice(-6)}
          </span>
        </p>
      </div>

      {listings.length === 0 ? (
        <div className="text-sm text-neutral-500 dark:text-neutral-400 py-8 text-center">
          No listings yet.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((l) => (
            <li key={l.id}>
              <Link
                to={`/v/${l.id}`}
                className="block rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
              >
                <img
                  src={`data:${l.thumbnailMime};base64,${l.thumbnailB64}`}
                  alt={l.title}
                  className="w-full aspect-video object-cover bg-neutral-200 dark:bg-neutral-800"
                  loading="lazy"
                />
                <div className="p-3">
                  <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2">
                    {l.title}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                    <span>{formatDuration(l.durationSec)}</span>
                    <span>·</span>
                    <ExpiryBadge validUntil={l.validUntil} status={l.probeStatus} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
