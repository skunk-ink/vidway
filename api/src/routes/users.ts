import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { DB } from '../db.js'
import { usernameErrorMessage, validateUsername } from '../lib/validation.js'
import { SignatureError, verifySignedBody } from '../lib/verify.js'

// ---- Zod schemas ----

const SignedEnvelope = <T extends z.ZodTypeAny>(payload: T) =>
  z.object({
    payload,
    publicKey: z.string(),
    nonce: z.string().min(1),
    timestamp: z.string(),
    signature: z.string(),
  })

const SetProfilePayload = z.object({
  username: z.string().min(1).max(64),
})

// ---- Row shape ----

type UserRow = {
  pubkey: string
  username: string
  created_at: number
  updated_at: number
}

function rowToJson(row: UserRow) {
  return {
    pubkey: row.pubkey,
    username: row.username,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    updatedAt: new Date(row.updated_at * 1000).toISOString(),
  }
}

// Throws an HTTPException-shaped error. Same JSON wire format the
// listings router uses, so the frontend can unwrap consistently.
function httpError(status: 400 | 401 | 403 | 404 | 409 | 422, code: string, message: string) {
  return new HTTPException(status, { message: JSON.stringify({ error: code, message }) })
}

export function usersRouter(db: DB) {
  const r = new Hono()

  // ---- POST /users — set or update own profile (signed) ----
  //
  // Idempotent: same pubkey + same username = no-op (just updates
  // updated_at). Different username for the same pubkey = renames.
  // Trying to claim someone else's username = 409.
  r.post('/', async (c) => {
    const raw = await c.req.json().catch(() => null)
    if (!raw) throw httpError(400, 'invalid_json', 'invalid JSON body')

    const env = SignedEnvelope(SetProfilePayload).safeParse(raw)
    if (!env.success) {
      throw httpError(400, 'invalid_payload', env.error.errors[0]?.message ?? 'invalid payload')
    }

    // Verify the signature before doing anything else. operation must
    // exactly match what the frontend signs in `set-profile`.
    try {
      await verifySignedBody(db, 'set-profile', env.data)
    } catch (e) {
      if (e instanceof SignatureError) {
        throw httpError(401, e.code, e.message)
      }
      throw e
    }

    const validated = validateUsername(env.data.payload.username)
    if (!validated.ok) {
      throw httpError(422, `invalid_username:${validated.error}`, usernameErrorMessage(validated.error))
    }

    const pubkey = env.data.publicKey
    const username = validated.username
    const now = Math.floor(Date.now() / 1000)

    // Conflict check: another pubkey owns this username (case-insensitive).
    const existingByName = db
      .prepare('SELECT pubkey FROM users WHERE username = ? COLLATE NOCASE')
      .get(username) as { pubkey: string } | undefined
    if (existingByName && existingByName.pubkey !== pubkey) {
      throw httpError(409, 'username_taken', 'That username is already taken')
    }

    // Upsert. SQLite ON CONFLICT lets us handle insert + rename cleanly.
    db.prepare(
      `INSERT INTO users (pubkey, username, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(pubkey) DO UPDATE SET
         username = excluded.username,
         updated_at = excluded.updated_at`,
    ).run(pubkey, username, now, now)

    const row = db.prepare('SELECT * FROM users WHERE pubkey = ?').get(pubkey) as UserRow
    return c.json(rowToJson(row))
  })

  // ---- GET /users/check?username=alice — availability check ----
  //
  // Public. Used by the profile form for live feedback. Returns
  // {available: bool, reason?: string}. Doesn't leak whether the
  // username is owned by the requester themself; that's intentional
  // since the form just submits with the same value either way.
  r.get('/check', (c) => {
    const username = c.req.query('username') ?? ''
    const validated = validateUsername(username)
    if (!validated.ok) {
      return c.json({ available: false, reason: usernameErrorMessage(validated.error) })
    }
    const existing = db
      .prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE')
      .get(validated.username)
    if (existing) {
      return c.json({ available: false, reason: 'That username is already taken' })
    }
    return c.json({ available: true })
  })

  // ---- GET /users/by-pubkey/:pubkey — lookup own or peer profile ----
  //
  // Public. Returns 404 if the pubkey has never set a profile. Used
  // by the navbar to show a username badge for the logged-in user,
  // and by the watch page to resolve uploader pubkey → username.
  r.get('/by-pubkey/:pubkey', (c) => {
    const pubkey = c.req.param('pubkey')
    const row = db.prepare('SELECT * FROM users WHERE pubkey = ?').get(pubkey) as
      | UserRow
      | undefined
    if (!row) throw httpError(404, 'not_found', 'no profile for that pubkey')
    return c.json(rowToJson(row))
  })

  // ---- GET /users/:username — public profile lookup ----
  //
  // Public. Returns 404 if no such username exists. Case-insensitive
  // match. Used by the /u/:username profile page.
  r.get('/:username', (c) => {
    const username = c.req.param('username')
    const row = db
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
      .get(username) as UserRow | undefined
    if (!row) throw httpError(404, 'not_found', 'no such user')
    return c.json(rowToJson(row))
  })

  return r
}
