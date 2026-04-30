import { useState } from 'react'
import { api } from '../lib/api'
import { useToastStore } from '../stores/toast'

type Reason = 'illegal' | 'spam' | 'broken' | 'other'

const REASONS: Array<{ value: Reason; label: string; hint: string }> = [
  { value: 'illegal', label: 'Illegal content', hint: 'Copyright, CSAM, or other illegal material.' },
  { value: 'spam', label: 'Spam or scam', hint: 'Misleading title, phishing, repeated low-quality posts.' },
  { value: 'broken', label: "Doesn't play", hint: 'Share URL is dead or the video errors on playback.' },
  { value: 'other', label: 'Other', hint: 'Something else worth flagging — explain below.' },
]

export function FlagModal({
  listingId,
  listingTitle,
  onClose,
}: {
  listingId: string
  listingTitle: string
  onClose: () => void
}) {
  const [reason, setReason] = useState<Reason>('illegal')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  async function handleSubmit() {
    setError(null)
    setBusy(true)
    try {
      await api.flagListing(listingId, { reason, detail: detail.trim() || undefined })
      addToast('Flag submitted')
      onClose()
    } catch (e) {
      console.error('[flag]', e)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Flag listing</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Flagging <span className="font-medium text-neutral-900 dark:text-neutral-100">{listingTitle}</span>. Flags are
          reviewed manually — there&apos;s no automatic takedown.
        </p>

        <fieldset className="space-y-2">
          <legend className="sr-only">Reason</legend>
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex gap-3 items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                reason === r.value
                  ? 'border-neutral-900 bg-neutral-50 dark:bg-neutral-900'
                  : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600'
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="mt-0.5 accent-neutral-900 dark:accent-neutral-100"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{r.label}</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.hint}</div>
              </div>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="flag-detail" className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
            Detail (optional)
          </label>
          <textarea
            id="flag-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={busy}
            className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100 resize-y"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={busy} className="btn-primary">
            {busy ? 'Submitting…' : 'Submit flag'}
          </button>
        </div>
      </div>
    </div>
  )
}
