// CLI: removes a listing from the catalog. Usage:
//
//   pnpm --filter api admin:remove-listing -- <listingId> [--yes]
//
// Only deletes the catalog row and its flags (FK ON DELETE CASCADE).
// The video itself stays on Sia — the operator doesn't have access
// to anyone's App Key and couldn't unpin it even if they wanted to.

import 'dotenv/config'
import readline from 'node:readline'
import { openDb } from '../db.js'

type ListingRow = {
  id: string
  title: string
  uploader_pubkey: string
  share_url: string
  created_at: number
  valid_until: number
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes')
    })
  })
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const listingId = args.find((a) => !a.startsWith('--'))
  const yes = args.includes('--yes') || args.includes('-y')

  if (!listingId) {
    console.error('usage: admin:remove-listing <listingId> [--yes]')
    process.exit(1)
  }

  const db = openDb(process.env.DATABASE_PATH ?? './data/vidway.db')
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId) as
    | ListingRow
    | undefined
  if (!row) {
    console.error(`listing ${listingId} not found`)
    process.exit(1)
  }

  console.log(`Listing ${row.id}`)
  console.log(`  title:        ${row.title}`)
  console.log(`  uploader:     ${row.uploader_pubkey}`)
  console.log(`  created at:   ${new Date(row.created_at * 1000).toISOString()}`)
  console.log(`  valid until:  ${new Date(row.valid_until * 1000).toISOString()}`)

  const flagCount = (
    db.prepare('SELECT COUNT(*) AS n FROM flags WHERE listing_id = ?').get(listingId) as {
      n: number
    }
  ).n
  console.log(`  flags:        ${flagCount}`)
  console.log()

  if (!yes) {
    const ok = await confirm('Delete this listing from the catalog?')
    if (!ok) {
      console.log('Aborted.')
      return
    }
  }

  const deleted = db.prepare('DELETE FROM listings WHERE id = ?').run(listingId)
  if (deleted.changes === 0) {
    console.error('Delete failed (race?)')
    process.exit(1)
  }
  console.log(`✓ Removed catalog entry for ${listingId} (${flagCount} flag(s) cascaded).`)
  console.log('  The video itself is still on Sia — only the uploader can unpin it.')
}

void main()
