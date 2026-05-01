// Hashtag extraction. Tags are case-insensitive on the wire, always
// stored lowercase. The '#' is presentation-only; we strip it.
//
// Rules:
//   - Must be preceded by start-of-string or whitespace. This stops
//     URL fragments (e.g. `https://x/page#about`) from matching.
//   - Must be followed by 2–50 characters from [a-z0-9_-].
//   - Case-insensitive at the regex level; lowercased on output.
//   - Same tag in a description multiple times → one entry.

const TAG_RE = /(?:^|\s)#([a-z0-9_-]{2,50})/gi

/**
 * Extract unique hashtags from a description. Returns an array of
 * lowercase tag strings without the leading '#'. Order: first
 * appearance.
 */
export function extractTags(description: string): string[] {
  if (!description) return []
  const seen = new Set<string>()
  const out: string[] = []
  let match: RegExpExecArray | null
  TAG_RE.lastIndex = 0
  while ((match = TAG_RE.exec(description)) !== null) {
    const tag = match[1].toLowerCase()
    if (!seen.has(tag)) {
      seen.add(tag)
      out.push(tag)
    }
  }
  return out
}
