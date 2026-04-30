import { isEffectivelyUnlimited } from '../lib/constants'
import { formatRelative } from '../lib/format'

export function ExpiryBadge({
  validUntil,
  status,
}: {
  validUntil: string
  status?: 'alive' | 'dead' | 'unknown'
}) {
  const now = Date.now()
  const expiresAt = Date.parse(validUntil)
  const isExpired = status === 'dead' || expiresAt <= now
  const isUnlimited = !isExpired && isEffectivelyUnlimited(validUntil)
  const isWarning = !isExpired && !isUnlimited && expiresAt - now < 24 * 60 * 60 * 1000

  const klass = isExpired
    ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
    : isWarning
    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 border-amber-200 dark:border-amber-900'
    : isUnlimited
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800'

  const label = isExpired
    ? 'Expired'
    : isUnlimited
    ? 'No expiry'
    : `Expires ${formatRelative(validUntil)}`

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] border ${klass}`}>
      {label}
    </span>
  )
}
