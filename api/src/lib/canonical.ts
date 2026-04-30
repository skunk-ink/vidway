// Canonical message format for signed requests. The exact byte sequence
// produced here MUST match the one produced by web/src/lib/signing.ts —
// any divergence breaks signature verification.
//
// The signed message is five lines joined by \n:
//
//   vidway/v1
//   <operation>
//   <nonce>
//   <timestamp>
//   <sha256-hex of canonicalize(payload)>
//
// Canonical JSON: object keys sorted lexicographically, no whitespace,
// arrays preserve order. Recursive.

import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

export const PROTOCOL_VERSION = 'vidway/v1'

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']'
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const entries = keys.map((k) => {
    const v = (value as Record<string, unknown>)[k]
    return JSON.stringify(k) + ':' + canonicalize(v)
  })
  return '{' + entries.join(',') + '}'
}

export function payloadHash(payload: unknown): string {
  const bytes = new TextEncoder().encode(canonicalize(payload))
  return bytesToHex(sha256(bytes))
}

export function buildMessage(operation: string, nonce: string, timestamp: string, payload: unknown): Uint8Array {
  const lines = [PROTOCOL_VERSION, operation, nonce, timestamp, payloadHash(payload)]
  return new TextEncoder().encode(lines.join('\n'))
}
