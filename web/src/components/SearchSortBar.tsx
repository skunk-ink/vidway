import { useEffect, useState } from 'react'
import type { ListListingsParams } from '../lib/api'

type Sort = NonNullable<ListListingsParams['sort']>
type Status = NonNullable<ListListingsParams['status']>

const SORT_OPTIONS: Array<{ value: Sort; label: string }> = [
  { value: 'recent', label: 'Newest' },
  { value: 'expiring', label: 'Expiring soon' },
  { value: 'longest', label: 'Longest' },
  { value: 'shortest', label: 'Shortest' },
]

export function SearchSortBar({
  q,
  sort,
  status,
  onChange,
  rightSlot,
}: {
  q: string
  sort: Sort
  status: Status
  onChange: (next: { q: string; sort: Sort; status: Status }) => void
  rightSlot?: React.ReactNode
}) {
  // Debounce the query so we don't hit the API on every keystroke.
  const [draftQ, setDraftQ] = useState(q)
  useEffect(() => {
    setDraftQ(q)
  }, [q])
  useEffect(() => {
    if (draftQ === q) return
    const t = setTimeout(() => onChange({ q: draftQ, sort, status }), 250)
    return () => clearTimeout(t)
  }, [draftQ, q, sort, status, onChange])

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="relative flex-1 min-w-[200px]">
        <input
          type="search"
          placeholder="Search title or description"
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100"
        />
        <span
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500 text-sm pointer-events-none"
        >
          ⌕
        </span>
      </div>
      <select
        value={sort}
        onChange={(e) => onChange({ q, sort: e.target.value as Sort, status })}
        className="px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100"
        title="Sort"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={status === 'all'}
          onChange={(e) => onChange({ q, sort, status: e.target.checked ? 'all' : 'alive' })}
          className="accent-neutral-900 dark:accent-neutral-100"
        />
        Show expired
      </label>
      {rightSlot}
    </div>
  )
}
