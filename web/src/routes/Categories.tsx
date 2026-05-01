import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { type Tag, api } from '../lib/api'

/**
 * Categories page. Two parts:
 *   1. A search input with `#` prefix glyph. As the user types,
 *      a dropdown appears with the top 10 matching hashtags by
 *      video count.
 *   2. A full alphabetical list of every hashtag, with counts.
 *      The list filters live as the user types in the search.
 */
export function Categories() {
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [allTags, setAllTags] = useState<Tag[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Suggestions for the dropdown (top by count, prefix-matched).
  const [suggestions, setSuggestions] = useState<Tag[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Initial load of the alphabetical list.
  useEffect(() => {
    let cancelled = false
    api
      .listTags({ sort: 'alpha', limit: 200 })
      .then((res) => {
        if (!cancelled) setAllTags(res.items)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced suggestion fetch as the user types.
  useEffect(() => {
    // Strip leading '#' for matching; the API does this too but we
    // also filter out the no-op case (empty query).
    const trimmed = query.replace(/^#/, '').trim()
    if (trimmed.length === 0) {
      setSuggestions([])
      return
    }

    let cancelled = false
    const handle = setTimeout(async () => {
      try {
        const res = await api.listTags({ q: trimmed, sort: 'count', limit: 10 })
        if (!cancelled) {
          setSuggestions(res.items)
          setHighlight(0)
        }
      } catch {
        if (!cancelled) setSuggestions([])
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query])

  // Close the dropdown on outside click.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (
        inputRef.current?.contains(t) ||
        dropdownRef.current?.contains(t)
      ) {
        return
      }
      setSuggestionsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  function gotoTag(tag: string) {
    navigate(`/t/${tag.toLowerCase()}`)
    setSuggestionsOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestionsOpen || suggestions.length === 0) {
      if (e.key === 'Enter') {
        const trimmed = query.replace(/^#/, '').trim()
        if (trimmed) gotoTag(trimmed)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = suggestions[highlight]
      if (target) gotoTag(target.tag)
    } else if (e.key === 'Escape') {
      setSuggestionsOpen(false)
    }
  }

  // Filter the alphabetical list by the search prefix. Same matching
  // rules as the server's autocomplete (case-insensitive prefix).
  const filteredTags = useMemo(() => {
    if (!allTags) return null
    const trimmed = query.replace(/^#/, '').toLowerCase().trim()
    if (!trimmed) return allTags
    return allTags.filter((t) => t.tag.startsWith(trimmed))
  }, [allTags, query])

  // Group the filtered tags by first letter so the page reads like an
  // index. Letters with no tags are omitted entirely. Tags whose first
  // character isn't a letter (e.g. starts with a digit or underscore)
  // get bucketed under '#' — small catchall at the end.
  const groupedTags = useMemo(() => {
    if (!filteredTags) return null
    const groups = new Map<string, Tag[]>()
    for (const t of filteredTags) {
      const first = t.tag.charAt(0).toUpperCase()
      const bucket = /^[A-Z]$/.test(first) ? first : '#'
      const arr = groups.get(bucket)
      if (arr) {
        arr.push(t)
      } else {
        groups.set(bucket, [t])
      }
    }
    // Sort the bucket labels: A–Z first, '#' last. Tags inside each
    // bucket already arrive alphabetical from the server.
    const labels = Array.from(groups.keys()).sort((a, b) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })
    return labels.map((label) => ({ label, tags: groups.get(label)! }))
  }, [filteredTags])

  const dropdownVisible = suggestionsOpen && suggestions.length > 0

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 w-full">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Categories
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Browse videos by hashtag. Add <code>#tags</code> to your video&apos;s description and
          they&apos;ll show up here automatically.
        </p>
      </div>

      {/* Search + autocomplete */}
      <div className="relative mb-8">
        <div className="flex items-stretch rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden focus-within:border-neutral-400 dark:focus-within:border-neutral-600 transition-colors">
          <span className="px-3 flex items-center text-neutral-500 dark:text-neutral-400 text-sm select-none border-r border-neutral-200 dark:border-neutral-800">
            #
          </span>
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/^#/, ''))}
            onFocus={() => setSuggestionsOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search hashtags…"
            className="flex-1 px-3 py-2 text-sm bg-transparent text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none"
          />
        </div>

        {dropdownVisible && (
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

      {/* Alphabetical list */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300 mb-6">
          {error}
        </div>
      )}

      {filteredTags === null ? (
        <div className="flex items-center justify-center py-16 text-sm text-neutral-500 dark:text-neutral-400">
          Loading…
        </div>
      ) : filteredTags.length === 0 ? (
        <div className="text-sm text-neutral-500 dark:text-neutral-400 py-8 text-center">
          {query.trim()
            ? 'No hashtags match that.'
            : 'No hashtags yet. Add some to your video descriptions to get started.'}
        </div>
      ) : (
        <div className="space-y-8">
          {groupedTags?.map(({ label, tags }) => (
            <section key={label}>
              {/*
                Letter heading. The grid below has a wide left gutter
                that the heading slots into for an indexed-glossary feel.
                On narrow viewports the heading just sits above the grid.
              */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
                <h2
                  className="sm:w-12 shrink-0 text-2xl font-semibold tracking-tight text-neutral-400 dark:text-neutral-500 leading-none sm:pt-2"
                  aria-label={`Hashtags starting with ${label}`}
                >
                  {label}
                </h2>
                <ul className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {tags.map((t) => (
                    <li key={t.tag}>
                      <Link
                        to={`/t/${t.tag}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                      >
                        <span className="text-sm text-neutral-900 dark:text-neutral-100">
                          #{t.tag}
                        </span>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                          {t.count}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
