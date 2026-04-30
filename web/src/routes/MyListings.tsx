import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { ListingActions } from '../components/ListingActions'
import { type Listing, api } from '../lib/api'
import { formatDuration } from '../lib/format'
import { useAuthStore } from '../stores/auth'

export function MyListings() {
  const sdk = useAuthStore((s) => s.sdk)
  const pubkey = useMemo(() => {
    try {
      return sdk?.appKey().publicKey() ?? null
    } catch {
      return null
    }
  }, [sdk])

  const [listings, setListings] = useState<Listing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!pubkey) return
    let cancelled = false
    api
      .listListings({ uploader: pubkey, status: 'all', sort: 'recent', limit: 48 })
      .then((res) => {
        if (!cancelled) setListings(res.items)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [pubkey, refreshTick])

  function handleChanged(id: string, next: Listing | null) {
    setListings((prev) => {
      if (!prev) return prev
      if (next === null) return prev.filter((l) => l.id !== id)
      return prev.map((l) => (l.id === id ? next : l))
    })
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 w-full">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">My Listings</h1>
        <div className="flex gap-4 text-sm">
          <button
            type="button"
            onClick={() => setRefreshTick((t) => t + 1)}
            className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
            title="Reload from the catalog"
          >
            Reload
          </button>
          <Link to="/upload" className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors">
            Upload a video →
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300 mb-6">
          {error}
        </div>
      )}

      {listings === null ? (
        <div className="flex items-center justify-center py-24 text-sm text-neutral-500 dark:text-neutral-400">
          Loading…
        </div>
      ) : listings.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-sm text-neutral-500 dark:text-neutral-400">
          You haven&apos;t uploaded anything yet.{' '}
          <Link to="/upload" className="underline hover:text-neutral-900 dark:hover:text-neutral-100 ml-1">
            Get started
          </Link>
          .
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 overflow-hidden">
          {listings.map((l) => (
            <li key={l.id} className="flex items-center gap-4 p-4">
              <Link to={`/v/${l.id}`} className="shrink-0">
                <img
                  src={`data:${l.thumbnailMime};base64,${l.thumbnailB64}`}
                  alt={l.title}
                  className="w-32 aspect-video object-cover rounded bg-neutral-200 dark:bg-neutral-800"
                  loading="lazy"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/v/${l.id}`} className="block">
                  <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate hover:underline">
                    {l.title}
                  </h3>
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                  <span>{formatDuration(l.durationSec)}</span>
                  <span>·</span>
                  <span>
                    {l.width}×{l.height}
                  </span>
                  <span>·</span>
                  <ExpiryBadge validUntil={l.validUntil} status={l.probeStatus} />
                </div>
              </div>
              {sdk && (
                <ListingActions
                  listing={l}
                  sdk={sdk}
                  onChanged={(next) => handleChanged(l.id, next)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
