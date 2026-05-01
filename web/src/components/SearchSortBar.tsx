import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ListListingsParams, type Tag, api } from '../lib/api'

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
  const navigate = useNavigate()

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

  // ---- Hashtag autocomplete ----
  //
  // When draftQ starts with `#` we show a dropdown of matching tags
  // sorted by usage count. Click or Enter on a row → navigate to
  // /t/:tag. Other keystrokes fall through so the regular debounced
  // FTS search still happens in parallel — that way if the user types
  // `#bik` and just keeps reading the live-filtered list below, they
  // still see results without having to commit to the dropdown.

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [suggestions, setSuggestions] = useState<Tag[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  // Whether the current input represents a hashtag query at all.
  const isTagQuery = draftQ.trimStart().startsWith('#')
  // The bare tag prefix without the leading `#`. Empty when user just
  // typed `#` alone — in which case we show top tags by count.
  const tagPrefix = draftQ.trimStart().replace(/^#/, '')

  useEffect(() => {
    if (!isTagQuery) {
      setSuggestions([])
      setDropdownOpen(false)
      return
    }
    let cancelled = false
    const handle = setTimeout(async () => {
      try {
        const res = await api.listTags({
          q: tagPrefix,
          sort: 'count',
          limit: 8,
        })
        if (cancelled) return
        setSuggestions(res.items)
        setHighlight(0)
        setDropdownOpen(res.items.length > 0)
      } catch {
        if (!cancelled) {
          setSuggestions([])
          setDropdownOpen(false)
        }
      }
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [isTagQuery, tagPrefix])

  // Close on outside click. Pointerdown rather than click so we
  // dismiss before focus moves anywhere unexpected.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (inputRef.current?.contains(t) || dropdownRef.current?.contains(t)) return
      setDropdownOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  function gotoTag(tag: string) {
    navigate(`/t/${tag.toLowerCase()}`)
    setDropdownOpen(false)
    // Clear the search input on the way out — landing on /t/:tag
    // shouldn't carry stale query state back to /browse.
    setDraftQ('')
    onChange({ q: '', sort, status })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isTagQuery) return // let regular debounced search handle it

    if (e.key === 'Escape') {
      setDropdownOpen(false)
      return
    }

    if (dropdownOpen && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const target = suggestions[highlight]
        if (target) gotoTag(target.tag)
        return
      }
    } else if (e.key === 'Enter') {
      // No dropdown, but the user typed `#something` and pressed Enter —
      // jump to the canonical tag URL. The tag page handles "no videos"
      // gracefully so this is safe even for unknown tags.
      const trimmed = tagPrefix.trim()
      if (trimmed) {
        e.preventDefault()
        gotoTag(trimmed)
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="relative flex-1 min-w-[200px]">
        <input
          ref={inputRef}
          type="search"
          placeholder="Search title or description (start with # for hashtags)"
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          onFocus={() => isTagQuery && suggestions.length > 0 && setDropdownOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100"
        />
        <span
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500 text-sm pointer-events-none"
        >
          ⌕
        </span>

        {dropdownOpen && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden"
          >
            <ul role="listbox">
              {suggestions.map((s, i) => (
                <li key={s.tag} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    onClick={() => gotoTag(s.tag)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                      i === highlight
                        ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                        : 'text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span>#{s.tag}</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                      {s.count} {s.count === 1 ? 'video' : 'videos'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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
