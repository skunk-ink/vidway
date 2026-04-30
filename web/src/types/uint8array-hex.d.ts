// Ambient declarations for TC39 Stage 3 Uint8Array hex/base64 helpers.
// TypeScript's lib.dom.d.ts hasn't shipped these yet (as of TS 5.9).
// The starter template uses these in a few places; preserved here.

interface Uint8ArrayConstructor {
  fromHex(hex: string): Uint8Array
  fromBase64(b64: string, options?: { alphabet?: 'base64' | 'base64url' }): Uint8Array
}

interface Uint8Array {
  toHex(): string
  toBase64(options?: { alphabet?: 'base64' | 'base64url' }): string
}
