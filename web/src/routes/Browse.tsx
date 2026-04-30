import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListingGrid } from '../components/ListingGrid'
import { SearchSortBar } from '../components/SearchSortBar'
import { type Listing, type ListListingsParams, api } from '../lib/api'

const PAGE_SIZE = 24

export function Browse() {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<NonNullable<ListListingsParams['sort']>>('recent')
  const [status, setStatus] = useState<NonNullable<ListListingsParams['status']>>('alive')

  const [listings, setListings] = useState<Listing[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // Reload whenever the filters change. cursor is reset.
  useEffect(() => {
    let cancelled = false
    setListings(null)
    setError(null)
    setCursor(null)
    api
      .listListings({ q, sort, status, limit: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return
        setListings(res.items)
        setCursor(res.nextCursor)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [q, sort, status])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await api.listListings({ q, sort, status, limit: PAGE_SIZE, cursor })
      setListings((prev) => [...(prev ?? []), ...res.items])
      setCursor(res.nextCursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, q, sort, status])

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 w-full">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Browse</h1>
        <Link
          to="/upload"
          className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          Upload a video →
        </Link>
      </div>

      <SearchSortBar
        q={q}
        sort={sort}
        status={status}
        onChange={(next) => {
          setQ(next.q)
          setSort(next.sort)
          setStatus(next.status)
        }}
      />

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300 mb-6">
          {error}
        </div>
      )}

      {listings === null ? (
        <div className="flex items-center justify-center py-24 text-sm text-neutral-500 dark:text-neutral-400">
          Loading…
        </div>
      ) : (
        <>
          <ListingGrid
            listings={listings}
            empty={
              <span>
                {q.trim() ? (
                  <>No videos match &ldquo;{q}&rdquo;.</>
                ) : (
                  <>
                    No videos yet.{' '}
                    <Link to="/upload" className="underline hover:text-neutral-900 dark:hover:text-neutral-100">
                      Upload the first one
                    </Link>
                    .
                  </>
                )}
              </span>
            }
          />
          {cursor && (
            <div className="flex justify-center mt-8">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-secondary"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
