// Canonical message format for signed Vidway API requests. The byte
// sequence produced here MUST match the one in api/src/lib/canonical.ts
// exactly — divergence breaks signature verification.
//
//   vidway/v1
//   <operation>
//   <nonce>
//   <timestamp>
//   <sha256-hex of canonicalize(payload)>
//
// joined by \n, UTF-8 encoded.

import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type { AppKey } from '@siafoundation/sia-storage'

export const PROTOCOL_VERSION = 'vidway/v1'

export type SignedBody<P> = {
  payload: P
  publicKey: string
  nonce: string
  timestamp: string
  signature: string
}

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

function payloadHash(payload: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalize(payload))))
}

function buildMessage(
  operation: string,
  nonce: string,
  timestamp: string,
  payload: unknown,
): Uint8Array {
  const lines = [PROTOCOL_VERSION, operation, nonce, timestamp, payloadHash(payload)]
  return new TextEncoder().encode(lines.join('\n'))
}

export function buildSignedRequest<P>(
  operation: string,
  payload: P,
  appKey: AppKey,
): SignedBody<P> {
  const nonce = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const message = buildMessage(operation, nonce, timestamp, payload)
  const signature = bytesToHex(appKey.sign(message))
  return {
    payload,
    publicKey: appKey.publicKey(),
    nonce,
    timestamp,
    signature,
  }
}
