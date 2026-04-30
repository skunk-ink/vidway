import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DB } from '../db.js'
import { SignatureError, type SignedBody, verifySignedBody } from '../lib/verify.js'
import { ShareUrlError, parseShareUrl } from '../lib/shareUrl.js'

// Year 9999 unix seconds — the conventional "max DATETIME" sentinel.
// The web UI's "Unlimited" expiry option encodes itself as exactly this
// value. Anything past it is treated as overflow / bogus.
const MAX_VALID_UNTIL_SECONDS = Math.floor(Date.UTC(9999, 11, 31, 23, 59, 59) / 1000)

// ---- Zod schemas ----

const SignedEnvelope = <T extends z.ZodTypeAny>(payload: T) =>
  z.object({
    payload,
    publicKey: z.string(),
    nonce: z.string().min(1),
    timestamp: z.string(),
    signature: z.string(),
  })

const CreateListingPayload = z.object({
  shareUrl: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(''),
  durationSec: z.number().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  thumbnailB64: z.string().min(1),
  validUntil: z.string(), // ISO 8601, must match share URL's sv param
})
type CreateListingPayloadT = z.infer<typeof CreateListingPayload>

const UpdateListingPayload = z
  .object({
    listingId: z.string().uuid(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    shareUrl: z.string().optional(),
    validUntil: z.string().optional(),
  })
  .refine(
    (v) => v.title !== undefined || v.description !== undefined || v.shareUrl !== undefined,
    { message: 'at least one of title, description, shareUrl must be provided' },
  )
  .refine((v) => (v.shareUrl === undefined) === (v.validUntil === undefined), {
    message: 'shareUrl and validUntil must be provided together',
  })
type UpdateListingPayloadT = z.infer<typeof UpdateListingPayload>

const DeleteListingPayload = z.object({
  listingId: z.string().uuid(),
})
type DeleteListingPayloadT = z.infer<typeof DeleteListingPayload>

const ListQuery = z.object({
  q: z.string().optional(),
  sort: z.enum(['recent', 'expiring', 'longest', 'shortest']).default('recent'),
  uploader: z.string().optional(),
  status: z.enum(['alive', 'all']).default('alive'),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.string().optional(),
})

// ---- Row shape ----

type ListingRow = {
  id: string
  share_url: string
  title: string
  description: string
  duration_sec: number
  width: number
  height: number
  thumbnail: Buffer
  thumbnail_mime: string
  uploader_pubkey: string
  valid_until: number
  created_at: number
  updated_at: number
  probe_status: 'alive' | 'dead' | 'unknown'
  probed_at: number | null
}

function rowToJson(row: ListingRow) {
  return {
    id: row.id,
    shareUrl: row.share_url,
    title: row.title,
    description: row.description,
    durationSec: row.duration_sec,
    width: row.width,
    height: row.height,
    thumbnailB64: row.thumbnail.toString('base64'),
    thumbnailMime: row.thumbnail_mime,
    uploaderPubkey: row.uploader_pubkey,
    validUntil: new Date(row.valid_until * 1000).toISOString(),
    createdAt: new Date(row.created_at * 1000).toISOString(),
    updatedAt: new Date(row.updated_at * 1000).toISOString(),
    probeStatus: row.probe_status,
  }
}

// ---- Helpers ----

function badRequest(msg: string, code = 'bad_request'): HTTPException {
  return new HTTPException(400, { message: JSON.stringify({ error: code, message: msg }) })
}

function unauthorized(msg: string, code = 'unauthorized'): HTTPException {
  return new HTTPException(401, { message: JSON.stringify({ error: code, message: msg }) })
}

function notFound(msg = 'listing not found'): HTTPException {
  return new HTTPException(404, { message: JSON.stringify({ error: 'not_found', message: msg }) })
}

// ---- Router ----

export function listingsRouter(db: DB) {
  const app = new Hono()

  // GET /listings
  app.get('/', (c) => {
    const parsed = ListQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams))
    if (!parsed.success) throw badRequest(parsed.error.message)
    const { q, sort, uploader, status, limit, cursor } = parsed.data

    const where: string[] = []
    const params: (string | number)[] = []

    if (status === 'alive') {
      where.push("probe_status != 'dead'")
      where.push('valid_until > ?')
      params.push(Math.floor(Date.now() / 1000))
    }
    if (uploader) {
      where.push('uploader_pubkey = ?')
      params.push(uploader)
    }

    let rowidJoin = ''
    if (q && q.trim()) {
      rowidJoin = 'JOIN listings_fts ON listings_fts.rowid = listings.rowid'
      where.push('listings_fts MATCH ?')
      params.push(q.trim())
    }

    const orderBy =
      sort === 'recent'
        ? 'created_at DESC'
        : sort === 'expiring'
        ? 'valid_until ASC'
        : sort === 'longest'
        ? 'duration_sec DESC'
        : 'duration_sec ASC'

    // Cursor: opaque base64 of {createdAt:int, id:string}. For Phase 1
    // we only support cursor on `recent`. Other sorts use offset pagination
    // until Phase 3.
    if (cursor && sort === 'recent') {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'))
        if (typeof decoded.createdAt !== 'number' || typeof decoded.id !== 'string') {
          throw new Error()
        }
        where.push('(created_at < ? OR (created_at = ? AND id > ?))')
        params.push(decoded.createdAt, decoded.createdAt, decoded.id)
      } catch {
        throw badRequest('invalid cursor')
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sql = `
      SELECT listings.* FROM listings
      ${rowidJoin}
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ?
    `
    params.push(limit + 1)

    const rows = db.prepare(sql).all(...params) as ListingRow[]

    let nextCursor: string | null = null
    if (rows.length > limit) {
      const last = rows[limit - 1]
      rows.length = limit
      if (sort === 'recent') {
        nextCursor = Buffer.from(
          JSON.stringify({ createdAt: last.created_at, id: last.id }),
        ).toString('base64url')
      }
    }

    return c.json({ items: rows.map(rowToJson), nextCursor })
  })

  // GET /listings/:id
  app.get('/:id', (c) => {
    const id = c.req.param('id')
    const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as ListingRow | undefined
    if (!row) throw notFound()
    return c.json(rowToJson(row))
  })

  // POST /listings (signed)
  app.post('/', async (c) => {
    const raw = await c.req.json()
    const parsed = SignedEnvelope(CreateListingPayload).safeParse(raw)
    if (!parsed.success) throw badRequest(parsed.error.message)
    const body = parsed.data as SignedBody<CreateListingPayloadT>

    try {
      await verifySignedBody(db, 'create-listing', body)
    } catch (e) {
      if (e instanceof SignatureError) throw unauthorized(e.message, e.code)
      throw e
    }

    const p = body.payload

    // Parse share URL and confirm the validUntil matches what the client claims.
    let parsedUrl: ReturnType<typeof parseShareUrl>
    try {
      parsedUrl = parseShareUrl(p.shareUrl)
    } catch (e) {
      if (e instanceof ShareUrlError) throw badRequest(e.message, e.code)
      throw e
    }

    const claimedTs = Math.floor(Date.parse(p.validUntil) / 1000)
    if (Number.isNaN(claimedTs)) throw badRequest('validUntil is not a valid ISO 8601 date')
    if (claimedTs !== parsedUrl.validUntil) {
      throw badRequest('claimed validUntil does not match share URL sv', 'sv_mismatch')
    }

    const now = Math.floor(Date.now() / 1000)
    if (parsedUrl.validUntil <= now) {
      throw badRequest('share URL has already expired', 'already_expired')
    }
    // Sanity cap at year 9999 (the conventional "max DATETIME" sentinel).
    // The UI's "Unlimited" option encodes itself as exactly this value, and
    // rejecting anything past it catches obvious bogus / overflow inputs.
    if (parsedUrl.validUntil > MAX_VALID_UNTIL_SECONDS) {
      throw badRequest('share URL validUntil is past year 9999', 'too_far')
    }

    // Decode + bound-check the thumbnail.
    let thumbnail: Buffer
    try {
      thumbnail = Buffer.from(p.thumbnailB64, 'base64')
    } catch {
      throw badRequest('thumbnailB64 is not valid base64')
    }
    if (thumbnail.length === 0) throw badRequest('thumbnail is empty')
    if (thumbnail.length > 256 * 1024) throw badRequest('thumbnail exceeds 256 KB cap')

    const id = randomUUID()
    db.prepare(
      `INSERT INTO listings (
        id, share_url, title, description, duration_sec, width, height,
        thumbnail, thumbnail_mime, uploader_pubkey, valid_until, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      p.shareUrl,
      p.title,
      p.description,
      p.durationSec,
      p.width,
      p.height,
      thumbnail,
      'image/jpeg',
      body.publicKey,
      parsedUrl.validUntil,
      now,
      now,
    )

    return c.json({ id }, 201)
  })

  // PATCH /listings/:id (signed)
  app.patch('/:id', async (c) => {
    const id = c.req.param('id')
    const raw = await c.req.json()
    const parsed = SignedEnvelope(UpdateListingPayload).safeParse(raw)
    if (!parsed.success) throw badRequest(parsed.error.message)
    const body = parsed.data as SignedBody<UpdateListingPayloadT>

    if (body.payload.listingId !== id) {
      throw badRequest('listingId in payload does not match URL', 'id_mismatch')
    }

    try {
      await verifySignedBody(db, 'update-listing', body)
    } catch (e) {
      if (e instanceof SignatureError) throw unauthorized(e.message, e.code)
      throw e
    }

    const existing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as
      | ListingRow
      | undefined
    if (!existing) throw notFound()
    if (existing.uploader_pubkey !== body.publicKey) {
      throw unauthorized('not the original uploader', 'wrong_uploader')
    }

    const now = Math.floor(Date.now() / 1000)
    const sets: string[] = []
    const params: (string | number)[] = []

    if (body.payload.title !== undefined) {
      sets.push('title = ?')
      params.push(body.payload.title)
    }
    if (body.payload.description !== undefined) {
      sets.push('description = ?')
      params.push(body.payload.description)
    }
    if (body.payload.shareUrl !== undefined && body.payload.validUntil !== undefined) {
      let parsedUrl: ReturnType<typeof parseShareUrl>
      try {
        parsedUrl = parseShareUrl(body.payload.shareUrl)
      } catch (e) {
        if (e instanceof ShareUrlError) throw badRequest(e.message, e.code)
        throw e
      }
      // The new URL must reference the same Object ID as the old one.
      const oldParsed = parseShareUrl(existing.share_url)
      if (parsedUrl.objectId !== oldParsed.objectId) {
        throw badRequest('new share URL references a different Object ID', 'object_id_changed')
      }
      const claimedTs = Math.floor(Date.parse(body.payload.validUntil) / 1000)
      if (Number.isNaN(claimedTs) || claimedTs !== parsedUrl.validUntil) {
        throw badRequest('claimed validUntil does not match share URL sv', 'sv_mismatch')
      }
      if (parsedUrl.validUntil <= now) {
        throw badRequest('new share URL has already expired', 'already_expired')
      }
      if (parsedUrl.validUntil > MAX_VALID_UNTIL_SECONDS) {
        throw badRequest('new share URL validUntil is past year 9999', 'too_far')
      }
      sets.push('share_url = ?')
      params.push(body.payload.shareUrl)
      sets.push('valid_until = ?')
      params.push(parsedUrl.validUntil)
      // Reset probe state — it's a new URL.
      sets.push("probe_status = 'unknown'")
      sets.push('probed_at = NULL')
    }

    sets.push('updated_at = ?')
    params.push(now)
    params.push(id)

    db.prepare(`UPDATE listings SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    const updated = db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as ListingRow
    return c.json(rowToJson(updated))
  })

  // DELETE /listings/:id (signed)
  app.delete('/:id', async (c) => {
    const id = c.req.param('id')
    const raw = await c.req.json()
    const parsed = SignedEnvelope(DeleteListingPayload).safeParse(raw)
    if (!parsed.success) throw badRequest(parsed.error.message)
    const body = parsed.data as SignedBody<DeleteListingPayloadT>

    if (body.payload.listingId !== id) {
      throw badRequest('listingId in payload does not match URL', 'id_mismatch')
    }

    try {
      await verifySignedBody(db, 'delete-listing', body)
    } catch (e) {
      if (e instanceof SignatureError) throw unauthorized(e.message, e.code)
      throw e
    }

    const existing = db.prepare('SELECT uploader_pubkey FROM listings WHERE id = ?').get(id) as
      | { uploader_pubkey: string }
      | undefined
    if (!existing) throw notFound()
    if (existing.uploader_pubkey !== body.publicKey) {
      throw unauthorized('not the original uploader', 'wrong_uploader')
    }

    db.prepare('DELETE FROM listings WHERE id = ?').run(id)
    return c.body(null, 204)
  })

  return app
}
