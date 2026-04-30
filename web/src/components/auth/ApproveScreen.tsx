import type { Builder } from '@siafoundation/sia-storage'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/auth'
import { CopyButton } from '../CopyButton'

export function ApproveScreen({
  builder,
}: {
  builder: React.RefObject<Builder | null>
}) {
  const { approvalUrl, setStep, setError } = useAuthStore()
  const [polling, setPolling] = useState(true)
  const [pollError, setPollError] = useState(false)
  const [manualChecking, setManualChecking] = useState(false)
  const pollStarted = useRef(false)

  useEffect(() => {
    // Guard against React strict mode double-mount — waitForApproval()
    // consumes the builder's state and cannot be called twice.
    if (pollStarted.current) return
    pollStarted.current = true

    async function poll() {
      const b = builder.current
      if (!b) return
      try {
        await b.waitForApproval()
        setStep('recovery')
      } catch {
        setPolling(false)
        setPollError(true)
      }
    }

    poll()
  }, [builder, setStep])

  async function handleManualCheck() {
    const b = builder.current
    if (!b) {
      setError('No builder instance')
      return
    }
    setManualChecking(true)
    setPollError(false)
    setPolling(true)
    try {
      await b.waitForApproval()
      setStep('recovery')
    } catch (e) {
      setPolling(false)
      setPollError(true)
      setError(e instanceof Error ? e.message : 'Approval check failed')
    } finally {
      setManualChecking(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Approve Connection</h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">
            Open the link below to approve Vidway on sia.storage, then return here.
          </p>
        </div>

        {approvalUrl && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg">
              <span className="flex-1 text-sm font-mono text-neutral-600 dark:text-neutral-400 truncate">
                {approvalUrl}
              </span>
              <CopyButton value={approvalUrl} label="URL copied" />
            </div>
            <a
              href={approvalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 font-medium rounded-lg transition-colors"
            >
              Open Approval Link
            </a>
          </div>
        )}

        <button
          type="button"
          onClick={handleManualCheck}
          disabled={manualChecking}
          className="w-full py-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 disabled:bg-neutral-200 dark:disabled:bg-neutral-700 disabled:text-neutral-400 dark:disabled:text-neutral-500 text-neutral-900 dark:text-neutral-100 font-medium rounded-lg transition-colors"
        >
          {manualChecking ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-neutral-300 dark:border-neutral-700 border-t-neutral-900 rounded-full animate-spin" />
              Checking…
            </span>
          ) : (
            'Check Approval'
          )}
        </button>

        <div className="flex items-center justify-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          {polling ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-600" />
              </span>
              Polling for approval…
            </>
          ) : pollError ? (
            <span>Auto-polling stopped</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
