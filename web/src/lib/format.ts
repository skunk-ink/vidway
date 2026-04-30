export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '–:–'
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatRelative(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const diffMs = then - Date.now()
  const abs = Math.abs(diffMs)
  const sign = diffMs >= 0 ? 'in' : 'ago'

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  let amount: number
  let unit: string
  if (abs < hour) {
    amount = Math.max(1, Math.round(abs / minute))
    unit = `minute${amount === 1 ? '' : 's'}`
  } else if (abs < day) {
    amount = Math.round(abs / hour)
    unit = `hour${amount === 1 ? '' : 's'}`
  } else {
    amount = Math.round(abs / day)
    unit = `day${amount === 1 ? '' : 's'}`
  }

  return sign === 'in' ? `in ${amount} ${unit}` : `${amount} ${unit} ago`
}
