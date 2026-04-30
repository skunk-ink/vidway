import { Builder } from '@siafoundation/sia-storage'
import { useState } from 'react'
import { APP_META, INDEXER_URL } from '../../lib/constants'
import { useAuthStore } from '../../stores/auth'

export function ConnectScreen({
  builder,
}: {
  builder: React.RefObject<Builder | null>
}) {
  const { setStep, setError, setApprovalUrl } = useAuthStore()
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    setLoading(true)
    setError(null)
    try {
      const b = new Builder(INDEXER_URL, APP_META)
      builder.current = b
      try {
        await b.requestConnection()
        const approvalUrl = b.responseUrl()
        setApprovalUrl(approvalUrl)
        setStep('approve')
      } catch (e) {
        setError(
          e instanceof Error
            ? `Connection failed: ${e.message}.`
            : 'Connection failed. The indexer may be unreachable.',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Vidway</h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">
            Sign in with your Sia account to browse and upload videos.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-1">
          <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Indexer</p>
          <p className="font-mono text-sm text-neutral-900 dark:text-neutral-100">{INDEXER_URL}</p>
        </div>

        <button
          type="button"
          onClick={handleConnect}
          disabled={loading}
          className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:text-neutral-500 dark:disabled:text-neutral-400 text-white dark:text-neutral-900 font-medium rounded-lg transition-colors"
        >
          {loading ? 'Connecting…' : 'Connect to sia.storage'}
        </button>

        <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
          Don&apos;t have an account yet?{' '}
          <a
            href={INDEXER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Sign up at sia.storage
          </a>
          .
        </p>
      </div>
    </div>
  )
}
