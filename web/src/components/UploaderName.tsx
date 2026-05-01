import { Link } from 'react-router-dom'

type UploaderNameProps = {
  pubkey: string
  username: string | null
  /**
   * Whether to render as a link to the user's profile when a username
   * is set. Defaults to true. Set false in places where the entire
   * surrounding row is already linked to something else (avoids nested
   * anchors, which are invalid HTML).
   */
  linked?: boolean
  className?: string
}

/**
 * Display an uploader's identity. If they've claimed a username, shows
 * `@alice` linking to `/u/alice`. Otherwise falls back to a truncated
 * pubkey, monospaced.
 *
 * Used everywhere a listing's uploader appears: browse cards, the
 * watch page header, my listings rows, public profile pages.
 */
export function UploaderName({ pubkey, username, linked = true, className }: UploaderNameProps) {
  if (username) {
    const inner = <span className={className}>@{username}</span>
    if (linked) {
      return (
        <Link
          to={`/u/${username}`}
          className="hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline transition-colors"
          // stop bubbling so clicking the username inside a row that's
          // also linked (e.g. browse card) navigates to the profile,
          // not the listing.
          onClick={(e) => e.stopPropagation()}
        >
          {inner}
        </Link>
      )
    }
    return inner
  }

  // No profile: show truncated pubkey, monospaced. Title attribute
  // reveals the full key on hover.
  return (
    <span
      className={`font-mono text-xs ${className ?? ''}`.trim()}
      title={pubkey}
    >
      {pubkey.slice(0, 8)}…{pubkey.slice(-6)}
    </span>
  )
}
