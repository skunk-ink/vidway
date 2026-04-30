import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))

export type DB = ReturnType<typeof openDb>

export function openDb(path: string) {
  // Ensure the parent directory exists. Cheap, idempotent.
  mkdirSync(dirname(resolve(path)), { recursive: true })

  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Apply the schema. All statements are CREATE ... IF NOT EXISTS, so this
  // is safe to run on every startup.
  const schema = readFileSync(resolve(__dirname, 'schema.sql'), 'utf-8')
  db.exec(schema)

  return db
}
