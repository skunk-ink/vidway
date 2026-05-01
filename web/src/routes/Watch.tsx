import type { PinnedObject } from '@siafoundation/sia-storage'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { FlagModal } from '../components/FlagModal'
import { UploaderName } from '../components/UploaderName'
import { VideoPlayer } from '../components/VideoPlayer'
import { type Listing, api } from '../lib/api'
import { formatDuration } from '../lib/format'
import { useAuthStore } from '../stores/auth'

export function Watch() {
  const { id } = useParams<{ id: string }>()
  const sdk = useAuthStore((s) => s.sdk)

  const [listing, setListing] = useState<Listing | null>(null)
  const [obj, setObj] = useState<PinnedObject | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flagOpen, setFlagOpen] = useState(false)

  // 1) Fetch listing metadata from the catalog.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .getListing(id)
      .then((l) => {
        if (!cancelled) setListing(l)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // 2) Once we have the listing and an SDK, hydrate a PinnedObject
  //    from the share URL. The encryption key lives in the URL
  //    fragment — never sent to the indexer.
  useEffect(() => {
    if (!listing || !sdk) return
    let cancelled = false
    sdk
      .sharedObject(listing.shareUrl)
      .then((o) => {
        if (!cancelled) setObj(o)
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(
            `Couldn't load this video from Sia. The share URL may have expired. (${msg})`,
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [listing, sdk])

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 w-full">
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
        <Link to="/" className="inline-block mt-4 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
          ← Back to browse
        </Link>
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-neutral-500 dark:text-neutral-400">
        Loading…
      </div>
    )
  }

  const thumbSrc = `data:${listing.thumbnailMime};base64,${listing.thumbnailB64}`

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 w-full space-y-6">
      <Link to="/" className="inline-block text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
        ← Back to browse
      </Link>

      {obj && sdk ? (
        <VideoPlayer obj={obj} sdk={sdk} poster={thumbSrc} />
      ) : (
        <div className="relative aspect-video bg-neutral-900 rounded-lg overflow-hidden flex items-center justify-center">
          <img
            src={thumbSrc}
            alt={listing.title}
            className="absolute inset-0 w-full h-full object-cover opacity-50"
          />
          <div className="relative text-white/80 text-sm flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Connecting to Sia…
          </div>
        </div>
      )}

      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{listing.title}</h1>
          <button
            type="button"
            onClick={() => setFlagOpen(true)}
            className="shrink-0 px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-900 dark:hover:border-neutral-100 transition-colors"
            title="Report this listing"
          >
            ⚑ Flag
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
          <span className="text-xs">
            <UploaderName
              pubkey={listing.uploaderPubkey}
              username={listing.uploaderUsername}
            />
          </span>
          <span>·</span>
          <span>{formatDuration(listing.durationSec)}</span>
          <span>·</span>
          <span>
            {listing.width}×{listing.height}
          </span>
          <ExpiryBadge validUntil={listing.validUntil} status={listing.probeStatus} />
        </div>
      </div>

      {listing.description && (
        <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">
          {listing.description}
        </p>
      )}

      <details className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 group">
        <summary className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide cursor-pointer select-none">
          Streaming details
        </summary>
        <div className="mt-3 space-y-2 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          <p>
            Playback streams ranged downloads directly from Sia hosts to this browser. Each chunk
            is fetched in 4 MB increments via{' '}
            <code className="font-mono text-neutral-900 dark:text-neutral-100">
              sdk.download(obj, &#123; offset, length &#125;)
            </code>
            , decrypted locally, and fed into a <code className="font-mono">MediaSource</code>{' '}
            buffer.
          </p>
          <p>
            Vidway&apos;s catalog never touches the video bytes — it only stores the share URL,
            which contains the decryption key in its fragment.
          </p>
        </div>
      </details>

      {flagOpen && (
        <FlagModal
          listingId={listing.id}
          listingTitle={listing.title}
          onClose={() => setFlagOpen(false)}
        />
      )}
    </div>
  )
}
