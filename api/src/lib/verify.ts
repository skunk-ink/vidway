import * as ed25519 from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { hexToBytes } from '@noble/hashes/utils'
import type { DB } from '../db.js'
import { buildMessage } from './canonical.js'

// @noble/ed25519 ships hashless by default — sha512 has to be wired up.
// The setter location moved between v2 (etc.sha512Async) and v3
// (hashes.sha512). Try both so the code works against whatever's in
// node_modules.
{
  const e = ed25519 as unknown as {
    hashes?: { sha512?: (m: Uint8Array) => Uint8Array }
    etc?: {
      sha512Async?: (...m: Uint8Array[]) => Promise<Uint8Array>
      concatBytes?: (...arrs: Uint8Array[]) => Uint8Array
    }
  }
  if (e.hashes) {
    e.hashes.sha512 = sha512
  } else if (e.etc?.concatBytes) {
    e.etc.sha512Async = (...m) =>
      Promise.resolve(sha512(e.etc!.concatBytes!(...m)))
  }
}

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000 // ±5 minutes

export class SignatureError extends Error {
  constructor(
    public code: string,
    msg: string,
  ) {
    super(msg)
  }
}

export type SignedBody<P> = {
  payload: P
  publicKey: string
  nonce: string
  timestamp: string
  signature: string
}

/**
 * Public key strings are formatted as "ed25519:<hex>". Returns the raw
 * 32-byte key. Throws on malformed input.
 */
export function parsePublicKey(s: string): Uint8Array {
  if (!s.startsWith('ed25519:')) {
    throw new SignatureError('invalid_pubkey', 'public key must start with "ed25519:"')
  }
  const hex = s.slice('ed25519:'.length)
  if (hex.length !== 64) {
    throw new SignatureError('invalid_pubkey', 'public key must be 32 bytes (64 hex chars)')
  }
  return hexToBytes(hex)
}

/**
 * Verifies a signed body. Throws SignatureError on any failure (bad shape,
 * expired timestamp, replay, bad signature). Inserts the nonce into
 * used_nonces on success — call once per request.
 */
export async function verifySignedBody<P>(
  db: DB,
  operation: string,
  body: SignedBody<P>,
): Promise<void> {
  if (!body.publicKey || !body.nonce || !body.timestamp || !body.signature) {
    throw new SignatureError('missing_fields', 'missing publicKey/nonce/timestamp/signature')
  }

  // Timestamp window check first — cheapest, fails fastest.
  const ts = Date.parse(body.timestamp)
  if (Number.isNaN(ts)) {
    throw new SignatureError('invalid_timestamp', 'timestamp is not a valid ISO 8601 date')
  }
  if (Math.abs(Date.now() - ts) > TIMESTAMP_WINDOW_MS) {
    throw new SignatureError('expired_timestamp', 'timestamp outside ±5 minute window')
  }

  // Nonce replay check. We insert with INSERT OR IGNORE and verify rowcount;
  // a unique-constraint hit means the nonce was already used.
  const insert = db
    .prepare('INSERT OR IGNORE INTO used_nonces (nonce, pubkey, used_at) VALUES (?, ?, ?)')
    .run(body.nonce, body.publicKey, Math.floor(Date.now() / 1000))
  if (insert.changes === 0) {
    throw new SignatureError('replay', 'nonce has already been used')
  }

  // Construct the message and verify.
  const message = buildMessage(operation, body.nonce, body.timestamp, body.payload)
  let pubKeyBytes: Uint8Array
  let sigBytes: Uint8Array
  try {
    pubKeyBytes = parsePublicKey(body.publicKey)
    sigBytes = hexToBytes(body.signature)
  } catch (e) {
    throw new SignatureError('invalid_keymat', e instanceof Error ? e.message : 'bad keymat')
  }
  if (sigBytes.length !== 64) {
    throw new SignatureError('invalid_signature', 'signature must be 64 bytes')
  }

  const ok = await ed25519.verifyAsync(sigBytes, message, pubKeyBytes)
  if (!ok) {
    throw new SignatureError('invalid_signature', 'ed25519 signature verification failed')
  }
}

/**
 * Prune nonces older than 24h. Called periodically (Phase 3 worker), or
 * on demand from a startup cleanup.
 */
export function pruneOldNonces(db: DB): number {
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 3600
  return db.prepare('DELETE FROM used_nonces WHERE used_at < ?').run(cutoff).changes
}
