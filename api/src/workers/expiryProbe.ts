// Background worker that runs every 5 minutes:
//
//   1. Mark anything with valid_until <= now() as 'dead'. No network call —
//      we trust the timestamp on the URL itself.
//   2. Probe a small batch of stale listings (probed_at older than 1 hour
//      and still 'alive' or 'unknown'). Update probe_status accordingly.
//   3. Prune used_nonces older than 24 hours.
//
// Single in-process worker, started by index.ts. No queue, no Redis.
// Hackathon-grade.

import type pino from 'pino'
import type { DB } from '../db.js'
import { probeShareUrl } from '../lib/shareUrl.js'

const TICK_MS = 5 * 60 * 1000 // every 5 minutes
const PROBE_BATCH = 8 // how many listings to probe per tick
const PROBE_AGE_SECONDS = 60 * 60 // re-probe at most every hour
const NONCE_RETENTION_SECONDS = 24 * 60 * 60

type ProbeRow = { id: string; share_url: string }

export function startExpiryProbe(db: DB, log: pino.Logger): { stop: () => void } {
  let stopped = false
  let running = false

  // Prepare statements once. better-sqlite3 caches them; this avoids
  // re-parsing SQL on every tick.
  const markExpired = db.prepare(
    "UPDATE listings SET probe_status = 'dead' WHERE valid_until <= ? AND probe_status != 'dead'",
  )
  const pickStale = db.prepare<[number, number, number]>(
    `SELECT id, share_url FROM listings
     WHERE probe_status != 'dead'
       AND valid_until > ?
       AND (probed_at IS NULL OR probed_at < ?)
     ORDER BY probed_at IS NULL DESC, probed_at ASC
     LIMIT ?`,
  )
  const updateProbe = db.prepare(
    'UPDATE listings SET probe_status = ?, probed_at = ? WHERE id = ?',
  )
  const pruneNonces = db.prepare('DELETE FROM used_nonces WHERE used_at < ?')

  async function tick(): Promise<void> {
    if (running || stopped) return
    running = true
    try {
      const now = Math.floor(Date.now() / 1000)

      // 1. Sweep TTL-expired listings.
      const expired = markExpired.run(now)
      if (expired.changes > 0) log.info({ count: expired.changes }, 'probe: marked expired')

      // 2. Pick a batch and probe each. Run in parallel within the batch
      //    but cap parallelism by keeping batch size modest.
      const stale = pickStale.all(now, now - PROBE_AGE_SECONDS, PROBE_BATCH) as ProbeRow[]
      if (stale.length > 0) {
        const results = await Promise.allSettled(
          stale.map(async (r) => ({ id: r.id, status: await probeShareUrl(r.share_url) })),
        )
        const ts = Math.floor(Date.now() / 1000)
        for (const r of results) {
          if (r.status === 'fulfilled') {
            // 'unknown' means we couldn't tell — don't bump probed_at.
            // That keeps the row eligible for retry on the next tick.
            if (r.value.status !== 'unknown') {
              updateProbe.run(r.value.status, ts, r.value.id)
            }
          }
        }
        log.info({ probed: stale.length }, 'probe: liveness check')
      }

      // 3. Prune stale nonces.
      const pruned = pruneNonces.run(now - NONCE_RETENTION_SECONDS)
      if (pruned.changes > 0) log.info({ count: pruned.changes }, 'probe: pruned nonces')
    } catch (err) {
      log.error({ err }, 'probe: tick failed')
    } finally {
      running = false
    }
  }

  // Run an initial tick after the server has had a moment to settle, then
  // every TICK_MS. The first tick is async so it doesn't delay startup.
  setTimeout(() => {
    void tick()
  }, 5_000).unref?.()
  const handle = setInterval(() => {
    void tick()
  }, TICK_MS)
  handle.unref?.()

  return {
    stop() {
      stopped = true
      clearInterval(handle)
    },
  }
}
