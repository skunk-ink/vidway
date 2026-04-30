import { Link } from 'react-router-dom'
import type { Listing } from '../lib/api'
import { formatDuration } from '../lib/format'
import { ExpiryBadge } from './ExpiryBadge'

export function ListingCard({ listing }: { listing: Listing }) {
  const thumbSrc = `data:${listing.thumbnailMime};base64,${listing.thumbnailB64}`

  return (
    <Link
      to={`/v/${listing.id}`}
      className="group flex flex-col gap-2 rounded-lg overflow-hidden hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors p-2 -m-2"
    >
      <div className="relative aspect-video bg-neutral-200 dark:bg-neutral-800 rounded-md overflow-hidden">
        <img
          src={thumbSrc}
          alt={listing.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[11px] font-medium tabular-nums">
          {formatDuration(listing.durationSec)}
        </div>
      </div>
      <div className="flex flex-col gap-1 px-1">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug">
          {listing.title}
        </h3>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-mono truncate" title={listing.uploaderPubkey}>
            {listing.uploaderPubkey.slice(8, 16)}…
          </span>
          <span>·</span>
          <ExpiryBadge validUntil={listing.validUntil} status={listing.probeStatus} />
        </div>
      </div>
    </Link>
  )
}
