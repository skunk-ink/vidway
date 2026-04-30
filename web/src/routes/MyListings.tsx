import type { Sdk } from '@siafoundation/sia-storage'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { ListingActions } from '../components/ListingActions'
import { type Listing, api } from '../lib/api'
import {
  AUTOREFRESH_POLL_MS,
  AUTOREFRESH_RENEWAL_DAYS,
  AUTOREFRESH_TRIGGER_HOURS,
} from '../lib/constants'
import { formatDuration } from '../lib/format'
import { loadPrefs, setAutoRefresh } from '../lib/autoRefresh'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'

export function MyListings() {
  const sdk = useAuthStore((s) => s.sdk)
  const addToast = useToastStore((s) => s.addToast)
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
  const [autoRefreshPrefs, setAutoRefreshPrefs] = useState<Set<string>>(new Set())

  // Track refreshes currently in-flight (manual or auto) so the polling
  // tick doesn't double-fire and a manual refresh doesn't race the auto one.
  const inFlight = useRef<Set<string>>(new Set())

  // Hydrate prefs from localStorage once we know who the user is.
  useEffect(() => {
    if (!pubkey) return
    setAutoRefreshPrefs(loadPrefs(pubkey))
  }, [pubkey])

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

  function toggleAutoRefresh(listingId: string, on: boolean) {
    if (!pubkey) return
    const next = setAutoRefresh(pubkey, listingId, on)
    setAutoRefreshPrefs(new Set(next))
  }

  // The actual refresh call — same shape as ListingActions' RefreshDialog
  // but with no UI, fixed renewal duration, and concurrency guards. Used
  // by the auto-refresh polling tick.
  const autoRefreshOne = useCallback(
    async (listing: Listing, currentSdk: Sdk) => {
      if (inFlight.current.has(listing.id)) return
      inFlight.current.add(listing.id)
      try {
        const obj = await currentSdk.sharedObject(listing.shareUrl)
        const validUntil = new Date(Date.now() + AUTOREFRESH_RENEWAL_DAYS * 86_400_000)
        const newShareUrl = currentSdk.shareObject(obj, validUntil)
        const updated = await api.updateListing(
          {
            listingId: listing.id,
            shareUrl: newShareUrl,
            validUntil: validUntil.toISOString(),
          },
          currentSdk.appKey(),
        )
        handleChanged(listing.id, updated)
        addToast(`Auto-refreshed "${listing.title}"`)
        console.log('[auto-refresh] ✓', listing.id)
      } catch (e) {
        console.error('[auto-refresh] ✗', listing.id, e)
        addToast(
          `Auto-refresh failed for "${listing.title}" — will retry`,
          'error',
        )
        // Don't disable the preference. The next polling tick will try again.
      } finally {
        inFlight.current.delete(listing.id)
      }
    },
    [addToast],
  )

  // Polling tick: walk listings, find any with auto-refresh enabled that
  // are within the trigger window but not yet expired, and refresh them.
  useEffect(() => {
    if (!sdk || !listings) return

    const tick = () => {
      const now = Date.now()
      const triggerCutoff = now + AUTOREFRESH_TRIGGER_HOURS * 3600 * 1000
      for (const l of listings) {
        if (!autoRefreshPrefs.has(l.id)) continue
        const validUntilMs = Date.parse(l.validUntil)
        if (Number.isNaN(validUntilMs)) continue
        // Already expired — refresh would fail because sharedObject() can't
        // hydrate from a dead URL. User has to do something manual at that
        // point; we surface this once to make the situation clear.
        if (validUntilMs <= now) continue
        if (validUntilMs > triggerCutoff) continue
        void autoRefreshOne(l, sdk)
      }
    }

    // Run once on mount/listings-change, then on the polling cadence.
    tick()
    const handle = setInterval(tick, AUTOREFRESH_POLL_MS)
    return () => clearInterval(handle)
  }, [sdk, listings, autoRefreshPrefs, autoRefreshOne])

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
                  <span>·</span>
                  <label
                    className="flex items-center gap-1.5 cursor-pointer select-none hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
                    title={`Auto-extend by ${AUTOREFRESH_RENEWAL_DAYS} days when within ${AUTOREFRESH_TRIGGER_HOURS}h of expiry. Only runs while this page is open.`}
                  >
                    <input
                      type="checkbox"
                      checked={autoRefreshPrefs.has(l.id)}
                      onChange={(e) => toggleAutoRefresh(l.id, e.target.checked)}
                      className="accent-neutral-900 dark:accent-neutral-100"
                    />
                    Auto-refresh
                  </label>
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

      {listings && listings.length > 0 && (
        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
          Auto-refresh extends a listing by {AUTOREFRESH_RENEWAL_DAYS} days when its share URL is
          within {AUTOREFRESH_TRIGGER_HOURS} hours of expiry. It only runs while this page is open
          in your browser — close this tab and the schedule pauses until you come back.
        </p>
      )}
    </div>
  )
}
