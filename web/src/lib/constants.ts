import type { AppMetadata } from '@siafoundation/sia-storage'

// 32-byte App ID (64 hex chars). This is the app's stable identity to the
// indexer — same value forever, baked into every build of the app.
//
// To regenerate for a fresh deployment:
//   crypto.getRandomValues(new Uint8Array(32)).toHex()
// (or `openssl rand -hex 32` from a shell).
export const APP_KEY = 'a7c5e8f3b9d2461078e9abcdef0123456789abcdef0123456789abcdef012345'
export const APP_NAME = 'Vidway'

// Hardcoded — every Vidway user goes through the same indexer.
// No editable input on the connect screen.
export const INDEXER_URL = 'https://sia.storage'

export const APP_META: AppMetadata = {
  appId: APP_KEY,
  name: APP_NAME,
  description: 'Video catalog backed by Sia',
  serviceUrl: 'https://vidway.example',
  logoUrl: undefined,
  callbackUrl: undefined,
}

// Vidway catalog backend
export const VIDWAY_API_URL = (import.meta.env.VITE_VIDWAY_API_URL as string | undefined) ?? 'http://localhost:8787'

// Erasure coding parameters — passed to sdk.upload() and encodedSize().
export const DATA_SHARDS = 10
export const PARITY_SHARDS = 20

// UI guards (Sia itself has no per-object cap)
export const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB

// Thumbnail constraints (stored as bytes in the catalog row)
export const THUMBNAIL_WIDTH = 640
export const THUMBNAIL_QUALITY = 0.7
export const MAX_THUMBNAIL_BYTES = 200 * 1024

// Share URL expiry choices. `days: null` means "unlimited" — encoded as a
// year-9999 sentinel date (the conventional SQL "max date"). The probe
// worker treats it like any other future timestamp; the UI renders it
// as "No expiry" and the badge stays neutral.
export type ExpiryOption = { days: number | null; label: string }

export const EXPIRY_OPTIONS: ExpiryOption[] = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
  { days: null, label: 'Unlimited' },
]
export const DEFAULT_EXPIRY_DAYS: number | null = 30

// Sentinel "forever" timestamp used when the user picks Unlimited.
// 9999-12-31T23:59:59Z — same value SQL Server / many other systems use
// as "max DATETIME". Comfortably within Number.MAX_SAFE_INTEGER as
// milliseconds (it's ~2.5×10^14, max safe is ~9×10^15) and within i64
// seconds (2.5×10^11 vs 9×10^18).
export const UNLIMITED_SENTINEL_DATE = new Date('9999-12-31T23:59:59.000Z')

/**
 * Compute the absolute expiry Date for a chosen option. `null` days means
 * unlimited and returns the sentinel date.
 */
export function computeValidUntil(days: number | null): Date {
  if (days === null) return UNLIMITED_SENTINEL_DATE
  return new Date(Date.now() + days * 86_400_000)
}

/**
 * Heuristic for whether a stored validUntil should be displayed as
 * "No expiry" rather than a real countdown. Anything more than 10 years
 * out is treated as effectively unlimited — the real expiry options top
 * out at 1 year, so 10 years is a safe boundary.
 */
const UNLIMITED_THRESHOLD_MS = 10 * 365 * 86_400_000
export function isEffectivelyUnlimited(validUntilIso: string): boolean {
  return Date.parse(validUntilIso) - Date.now() > UNLIMITED_THRESHOLD_MS
}
