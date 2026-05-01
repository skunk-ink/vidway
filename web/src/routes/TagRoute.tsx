import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ListingGrid } from '../components/ListingGrid'
import { type Listing, api } from '../lib/api'

/**
 * Tag detail page at /t/:tag. Shows all alive listings tagged with
 * the given hashtag. The route param is lowercased before querying,
 * so /t/Biking and /t/biking show the same content.
 */
export function TagRoute() {
  const { tag = '' } = useParams<{ tag: string }>()
  const canonical = tag.toLowerCase()

  const [listings, setListings] = useState<Listing[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setListings(null)
    setError(null)
    api
      .listListings({ tag: canonical, status: 'alive', sort: 'recent', limit: 48 })
      .then((res) => {
        if (!cancelled) setListings(res.items)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [canonical])

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 w-full">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          #{canonical}
        </h1>
        <Link
          to="/categories"
          className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          ← All categories
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300 mb-6">
          {error}
        </div>
      )}

      {listings === null ? (
        <div className="flex items-center justify-center py-16 text-sm text-neutral-500 dark:text-neutral-400">
          Loading…
        </div>
      ) : (
        <ListingGrid
          listings={listings}
          empty={
            <span>
              No videos tagged <span className="font-mono">#{canonical}</span> yet.
            </span>
          }
        />
      )}
    </div>
  )
}
