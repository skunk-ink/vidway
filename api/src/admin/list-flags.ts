// CLI: prints recent flags grouped by listing, oldest-first within each
// group. Usage:
//
//   pnpm --filter api admin:list-flags             # last 7 days, all reasons
//   pnpm --filter api admin:list-flags -- --since 24h
//   pnpm --filter api admin:list-flags -- --reason illegal
//
// No automated takedown — operator decides what (if anything) to do.

import 'dotenv/config'
import { openDb } from '../db.js'

type FlagRow = {
  id: number
  listing_id: string
  reason: string
  detail: string | null
  created_at: number
  ip_hash: string
  title: string
  uploader_pubkey: string
  share_url: string
}

function parseSince(s: string): number {
  const m = s.match(/^(\d+)([smhd])$/)
  if (!m) {
    console.error(`invalid --since: ${s}. Use e.g. 24h, 7d, 30m.`)
    process.exit(1)
  }
  const n = Number.parseInt(m[1], 10)
  const mult = { s: 1, m: 60, h: 3600, d: 86_400 }[m[2] as 's' | 'm' | 'h' | 'd']
  return n * mult
}

function main(): void {
  const args = process.argv.slice(2)
  let sinceSeconds = 7 * 86_400
  let reasonFilter: string | null = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--since' && args[i + 1]) {
      sinceSeconds = parseSince(args[i + 1])
      i++
    } else if (args[i] === '--reason' && args[i + 1]) {
      reasonFilter = args[i + 1]
      i++
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('usage: admin:list-flags [--since 24h] [--reason illegal|spam|broken|other]')
      return
    }
  }

  const db = openDb(process.env.DATABASE_PATH ?? './data/vidway.db')
  const cutoff = Math.floor(Date.now() / 1000) - sinceSeconds

  const where: string[] = ['flags.created_at >= ?']
  const params: (string | number)[] = [cutoff]
  if (reasonFilter) {
    where.push('flags.reason = ?')
    params.push(reasonFilter)
  }

  const rows = db
    .prepare(
      `SELECT flags.*, listings.title, listings.uploader_pubkey, listings.share_url
       FROM flags
       LEFT JOIN listings ON listings.id = flags.listing_id
       WHERE ${where.join(' AND ')}
       ORDER BY flags.listing_id, flags.created_at ASC`,
    )
    .all(...params) as FlagRow[]

  if (rows.length === 0) {
    console.log('No flags in the selected window.')
    return
  }

  // Group by listing.
  const grouped = new Map<string, FlagRow[]>()
  for (const r of rows) {
    const list = grouped.get(r.listing_id) ?? []
    list.push(r)
    grouped.set(r.listing_id, list)
  }

  const sorted = Array.from(grouped.entries()).sort(([, a], [, b]) => b.length - a.length)

  for (const [listingId, flags] of sorted) {
    const first = flags[0]
    console.log()
    console.log(`▶ Listing ${listingId}  (${flags.length} flag${flags.length > 1 ? 's' : ''})`)
    console.log(`  title:    ${first.title ?? '<deleted>'}`)
    console.log(`  uploader: ${first.uploader_pubkey ?? '<deleted>'}`)
    console.log()
    for (const f of flags) {
      const dt = new Date(f.created_at * 1000).toISOString()
      const detail = f.detail ? ` — ${f.detail.replace(/\s+/g, ' ').slice(0, 200)}` : ''
      console.log(`    ${dt}  [${f.reason}]  ip=${f.ip_hash.slice(0, 12)}…${detail}`)
    }
  }
  console.log()
  console.log(`Total: ${rows.length} flags across ${grouped.size} listings`)
}

main()
