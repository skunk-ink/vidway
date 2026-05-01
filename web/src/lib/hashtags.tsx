import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Mirror of the server-side regex in api/src/lib/tags.ts. Must be
// preceded by start-of-string or whitespace so URL fragments
// (https://example.com/page#anchor) don't match.
const TAG_RE = /(?:^|\s)#([a-z0-9_-]{2,50})/gi

/**
 * Render a description string, turning recognized hashtags into
 * clickable links to the `/t/:tag` page. Other text is rendered
 * verbatim, preserving whitespace and line breaks (callers should
 * use `whitespace-pre-wrap` on the container).
 *
 * Hashtag links display the original-cased tag the user wrote,
 * but route to the lowercase canonical tag so `#Biking` and
 * `#biking` both go to /t/biking.
 */
export function renderDescription(text: string): ReactNode {
  if (!text) return null
  const out: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  TAG_RE.lastIndex = 0
  while ((match = TAG_RE.exec(text)) !== null) {
    // The regex includes a leading whitespace char (or 0-length
    // start-of-string) in the match. The hashtag itself starts at
    // `match[0].lastIndexOf('#') + match.index`, but easier: the
    // captured group is at `match.index + match[0].indexOf('#')`.
    const hashOffset = match[0].indexOf('#')
    const tagStart = match.index + hashOffset
    const tagEnd = match.index + match[0].length

    if (tagStart > lastIndex) {
      out.push(<Fragment key={`t-${lastIndex}`}>{text.slice(lastIndex, tagStart)}</Fragment>)
    }

    const original = match[1]
    const canonical = original.toLowerCase()
    out.push(
      <Link
        key={`h-${tagStart}`}
        to={`/t/${canonical}`}
        className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline transition-colors"
      >
        #{original}
      </Link>,
    )
    lastIndex = tagEnd
  }

  if (lastIndex < text.length) {
    out.push(<Fragment key={`t-${lastIndex}`}>{text.slice(lastIndex)}</Fragment>)
  }
  return out
}
