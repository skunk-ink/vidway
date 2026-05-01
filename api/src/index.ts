import { serve } from '@hono/node-server'
import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPException } from 'hono/http-exception'
import pino from 'pino'
import { openDb } from './db.js'
import { rateLimit } from './lib/rateLimit.js'
import { extractTags } from './lib/tags.js'
import { flagsRouter } from './routes/flags.js'
import { listingsRouter } from './routes/listings.js'
import { tagsRouter } from './routes/tags.js'
import { usersRouter } from './routes/users.js'
import { startExpiryProbe } from './workers/expiryProbe.js'

const log = pino({
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
})

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10)
const DB_PATH = process.env.DATABASE_PATH ?? './data/vidway.db'
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173'

const db = openDb(DB_PATH)

// One-time backfill: if Phase 5 was deployed onto a database that
// already has listings, the listing_tags table will be empty. Walk
// the existing descriptions and populate tags. Cheap (descriptions
// are short) and idempotent — only runs when listing_tags is empty.
{
  const tagCount = db.prepare('SELECT COUNT(*) AS n FROM listing_tags').get() as { n: number }
  const listingCount = db.prepare('SELECT COUNT(*) AS n FROM listings').get() as { n: number }
  if (tagCount.n === 0 && listingCount.n > 0) {
    const rows = db.prepare('SELECT id, description FROM listings').all() as {
      id: string
      description: string
    }[]
    const insertTag = db.prepare(
      'INSERT OR IGNORE INTO listing_tags (listing_id, tag) VALUES (?, ?)',
    )
    const backfill = db.transaction((entries: { id: string; description: string }[]) => {
      for (const r of entries) {
        for (const tag of extractTags(r.description)) insertTag.run(r.id, tag)
      }
    })
    backfill(rows)
    log.info({ listings: rows.length }, 'backfilled listing_tags from existing descriptions')
  }
}

const app = new Hono()

app.use('*', logger((m) => log.info(m)))

app.use(
  '*',
  cors({
    origin: CORS_ORIGIN.split(',').map((s) => s.trim()),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 600,
  }),
)

app.get('/healthz', (c) => c.json({ ok: true }))

// Rate limit POST /listings: 20/hour per IP. Doesn't apply to GET/PATCH/DELETE
// since those are signed and have their own anti-replay protection (nonces).
//
// IMPORTANT: hoist rateLimit() out of the handler so the bucket map is
// shared across requests. Calling it inside the handler would re-create
// a fresh map every time and never actually rate limit anything.
const createListingRateLimit = rateLimit({
  refillPerSecond: 20 / 3600,
  capacity: 20,
  scope: 'create',
})
app.use('/listings', async (c, next) => {
  if (c.req.method !== 'POST') return next()
  return createListingRateLimit(c, next)
})

// Rate limit POST /users: 5/hour per IP. Profile changes shouldn't
// happen often; this is mainly to make squatting on names tedious.
const setProfileRateLimit = rateLimit({
  refillPerSecond: 5 / 3600,
  capacity: 5,
  scope: 'set-profile',
})
app.use('/users', async (c, next) => {
  if (c.req.method !== 'POST') return next()
  return setProfileRateLimit(c, next)
})

app.route('/listings', listingsRouter(db))
// Flags are under /listings/:id/flag — mounted as a sibling router so the
// rate limit is applied per-route inside flagsRouter and doesn't collide
// with the listings router's own routes.
app.route('/listings', flagsRouter(db))
app.route('/users', usersRouter(db))
app.route('/tags', tagsRouter(db))

// Errors come through as JSON. We use HTTPException with a JSON-stringified
// body in route handlers; this normalizes the response shape.
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    try {
      const parsed = JSON.parse(err.message)
      return c.json(parsed, err.status)
    } catch {
      return c.json({ error: 'http_error', message: err.message }, err.status)
    }
  }
  log.error(err, 'unhandled error')
  return c.json({ error: 'internal', message: 'internal server error' }, 500)
})

// Background worker — single in-process timer, started after the server
// is listening so the first tick doesn't block startup.
const probe = startExpiryProbe(db, log)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  log.info(`Vidway API listening on http://localhost:${info.port}`)
  log.info(`Database: ${DB_PATH}`)
  log.info(`CORS origin: ${CORS_ORIGIN}`)
  log.info('Expiry probe worker started (5min cadence)')
})

// Graceful shutdown so the worker doesn't keep the event loop alive.
const shutdown = (sig: string) => {
  log.info({ sig }, 'shutting down')
  probe.stop()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
