import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { DB } from '../db.js'

const TagsQuery = z.object({
  // Optional case-insensitive prefix match. The frontend strips any
  // leading '#' before sending; we strip again defensively.
  q: z.string().optional(),
  // 'count' — by video count, descending (used for autocomplete and
  // "trending" displays). 'alpha' — by tag name, ascending (used for
  // the full categories listing).
  sort: z.enum(['count', 'alpha']).default('alpha'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  // Whether to include tags whose only listings are dead/expired.
  // Defaults to false — same convention as the listings endpoint's
  // status='alive' default.
  includeDead: z.coerce.boolean().default(false),
})

function badRequest(msg: string): HTTPException {
  return new HTTPException(400, {
    message: JSON.stringify({ error: 'bad_request', message: msg }),
  })
}

export function tagsRouter(db: DB) {
  const r = new Hono()

  // GET /tags
  //
  // Returns: [{ tag: string, count: number }]
  //
  // Counts only include alive listings (probe_status != 'dead', not
  // expired) by default. Pass ?includeDead=true to count everything.
  r.get('/', (c) => {
    const parsed = TagsQuery.safeParse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    )
    if (!parsed.success) throw badRequest(parsed.error.message)
    const { q, sort, limit, includeDead } = parsed.data

    const where: string[] = []
    const params: (string | number)[] = []

    if (!includeDead) {
      where.push("listings.probe_status != 'dead'")
      where.push('listings.valid_until > ?')
      params.push(Math.floor(Date.now() / 1000))
    }

    if (q) {
      // Strip a leading '#' if the user passed one, then lowercase.
      const trimmed = q.replace(/^#/, '').toLowerCase().trim()
      if (trimmed.length > 0) {
        where.push('listing_tags.tag LIKE ? || \'%\'')
        params.push(trimmed)
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const orderBy =
      sort === 'count'
        ? 'count DESC, listing_tags.tag ASC'
        : 'listing_tags.tag ASC'

    const sql = `
      SELECT listing_tags.tag AS tag, COUNT(*) AS count
      FROM listing_tags
      JOIN listings ON listings.id = listing_tags.listing_id
      ${whereSql}
      GROUP BY listing_tags.tag
      ORDER BY ${orderBy}
      LIMIT ?
    `
    params.push(limit)

    const rows = db.prepare(sql).all(...params) as { tag: string; count: number }[]
    return c.json({ items: rows })
  })

  return r
}
