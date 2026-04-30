import { createHash, randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { DB } from '../db.js'
import { rateLimit } from '../lib/rateLimit.js'

const FlagPayload = z.object({
  reason: z.enum(['illegal', 'spam', 'broken', 'other']),
  detail: z.string().max(2000).optional(),
})

// Daily-rotating salt so ip_hash isn't trivially correlatable with raw IPs
// across days. Lives in memory; rotation happens at midnight UTC. For a
// hackathon this is fine — operators can compare hashes within a day to
// spot abuse without storing actual IPs.
let salt = randomBytes(32)
let saltDay = Math.floor(Date.now() / 86_400_000)
function ipHash(ip: string): string {
  const today = Math.floor(Date.now() / 86_400_000)
  if (today !== saltDay) {
    salt = randomBytes(32)
    saltDay = today
  }
  return createHash('sha256').update(salt).update(ip).digest('hex')
}

function badRequest(msg: string, code = 'bad_request'): HTTPException {
  return new HTTPException(400, { message: JSON.stringify({ error: code, message: msg }) })
}

function notFound(msg = 'listing not found'): HTTPException {
  return new HTTPException(404, { message: JSON.stringify({ error: 'not_found', message: msg }) })
}

export function flagsRouter(db: DB) {
  const app = new Hono()

  // 10 flags per hour per IP. Token bucket — refills smoothly so a
  // legitimate burst of a few flags isn't blocked.
  app.post(
    '/:id/flag',
    rateLimit({
      refillPerSecond: 10 / 3600,
      capacity: 10,
      scope: 'flag',
    }),
    async (c) => {
      const id = c.req.param('id')

      const existing = db.prepare('SELECT id FROM listings WHERE id = ?').get(id)
      if (!existing) throw notFound()

      let raw: unknown
      try {
        raw = await c.req.json()
      } catch {
        throw badRequest('body must be JSON')
      }
      const parsed = FlagPayload.safeParse(raw)
      if (!parsed.success) throw badRequest(parsed.error.message)

      const ip =
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
        c.req.header('x-real-ip') ??
        'unknown'

      db.prepare(
        `INSERT INTO flags (listing_id, reason, detail, created_at, ip_hash)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        id,
        parsed.data.reason,
        parsed.data.detail ?? null,
        Math.floor(Date.now() / 1000),
        ipHash(ip),
      )

      return c.json({ ok: true }, 201)
    },
  )

  return app
}
