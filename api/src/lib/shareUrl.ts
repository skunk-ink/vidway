// Server-side share URL parsing. The Vidway API doesn't decrypt anything —
// it just needs to:
//
//   1. Confirm the URL is a well-formed sia:// share URL,
//   2. Extract the validUntil timestamp from the `sv` query param,
//   3. Extract the Object ID from the path (`/objects/<id>/shared`),
//   4. (Phase 3) probe the rewritten https:// URL for liveness.
//
// The encryption key is in the URL fragment (#encryption_key=...). We don't
// touch it here.

export class ShareUrlError extends Error {
  constructor(public code: string, msg: string) {
    super(msg)
  }
}

export type ParsedShareUrl = {
  /** Hex-encoded 32-byte Object ID. */
  objectId: string
  /** Unix seconds. */
  validUntil: number
  /** Indexer host (e.g. "sia.storage"). */
  indexerHost: string
  /** The original URL string, for storage. */
  raw: string
}

const PATH_RE = /^\/objects\/([0-9a-fA-F]{64})\/shared$/

export function parseShareUrl(raw: string): ParsedShareUrl {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ShareUrlError('malformed', 'share URL is not a valid URL')
  }

  if (url.protocol !== 'sia:') {
    throw new ShareUrlError('wrong_scheme', 'share URL must use the sia:// scheme')
  }

  const m = PATH_RE.exec(url.pathname)
  if (!m) {
    throw new ShareUrlError('bad_path', 'share URL path must be /objects/<id>/shared with a 64-hex object ID')
  }
  const objectId = m[1].toLowerCase()

  const sv = url.searchParams.get('sv')
  if (!sv) {
    throw new ShareUrlError('missing_sv', 'share URL is missing the sv (validUntil) query param')
  }
  const validUntil = Number.parseInt(sv, 10)
  if (!Number.isFinite(validUntil) || validUntil <= 0) {
    throw new ShareUrlError('bad_sv', 'share URL sv must be a positive unix timestamp')
  }

  if (!url.host) {
    throw new ShareUrlError('no_host', 'share URL has no host')
  }

  return { objectId, validUntil, indexerHost: url.host, raw }
}

/**
 * Rewrite a sia:// share URL to its https:// fetchable form, dropping the
 * fragment (which contains the encryption key — irrelevant to the server,
 * and we don't want to send it on the wire if we ever fetch).
 */
export function shareUrlToHttps(raw: string): string {
  const u = new URL(raw)
  u.protocol = 'https:'
  u.hash = ''
  return u.toString()
}

/**
 * Probe a share URL for liveness. Tries HEAD first, falls back to a
 * single-byte ranged GET on 405/501. Returns 'alive' / 'dead' / 'unknown'.
 *
 * Used by the Phase 3 background probe worker.
 */
export async function probeShareUrl(raw: string): Promise<'alive' | 'dead' | 'unknown'> {
  const url = shareUrlToHttps(raw)
  try {
    let res = await fetch(url, { method: 'HEAD' })
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
    }
    if (res.ok || res.status === 206) return 'alive'
    if (res.status === 404 || res.status === 410) return 'dead'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
