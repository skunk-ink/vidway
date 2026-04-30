/**
 * Vidway brand mark — a play triangle bracketed by `[ ]`.
 *
 * The brackets carry the "your scope" idea (the upload, the share window,
 * the audience are all bounded by what the uploader chooses); the play
 * triangle inside is the universal video signifier.
 *
 * Monochrome by default: brackets are stroked in `currentColor` and the
 * play triangle is filled in `currentColor`, so the mark inherits whatever
 * text color is in scope and flips automatically with dark mode.
 *
 * Sizing: the viewBox is square (24×24), so passing a Tailwind size class
 * like `h-5 w-5` produces a 20×20 mark that pairs naturally with text-base
 * type. Pass `h-9 w-9` for hero contexts (next to a text-3xl wordmark),
 * etc.
 */
type LogoProps = {
  className?: string
  /**
   * Optional accessible label. Defaults to "Vidway"; override when the
   * mark is purely decorative and should be ignored by screen readers
   * (pass empty string and add `aria-hidden` upstream).
   */
  title?: string
}

export function Logo({ className, title = 'Vidway' }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      {/* Brackets — stroked. Round caps/joins keep the corners soft so
          the mark reads as friendly rather than mechanical. */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 4 5 L 1 5 L 1 19 L 4 19" />
        <path d="M 20 5 L 23 5 L 23 19 L 20 19" />
      </g>
      {/* Play triangle — filled. Sized so the visual weight is balanced
          between the two brackets without crowding either. */}
      <path d="M 9 8 L 15 12 L 9 16 Z" fill="currentColor" />
    </svg>
  )
}
