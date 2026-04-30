import type { Listing } from '../lib/api'
import { ListingCard } from './ListingCard'

export function ListingGrid({
  listings,
  empty,
}: {
  listings: Listing[]
  empty?: React.ReactNode
}) {
  if (listings.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-neutral-500 dark:text-neutral-400">
        {empty ?? 'Nothing here yet.'}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
      {listings.map((l) => (
        <ListingCard key={l.id} listing={l} />
      ))}
    </div>
  )
}
