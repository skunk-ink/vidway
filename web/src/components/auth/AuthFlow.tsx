import { AppKey, Builder, initSia } from '@siafoundation/sia-storage'
import { useEffect, useRef, useState } from 'react'
import { APP_META, INDEXER_URL } from '../../lib/constants'
import { useAuthStore } from '../../stores/auth'
import { ApproveScreen } from './ApproveScreen'
import { ConnectScreen } from './ConnectScreen'
import { LoadingScreen } from './LoadingScreen'
import { RecoveryScreen } from './RecoveryScreen'

// Maximum time to wait for `initSia()` + `builder.connected()` to settle
// before showing the user an escape hatch. The indexer call inside
// `connected()` has no built-in timeout, so a slow or unreachable
// indexer would otherwise hang the loading screen forever.
const INIT_TIMEOUT_MS = 15_000

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

export function AuthFlow() {
  const step = useAuthStore((s) => s.step)
  const error = useAuthStore((s) => s.error)
  const setError = useAuthStore((s) => s.setError)
  const builderRef = useRef<Builder | null>(null)

  // `nonce` lets the user trigger a retry by clicking the button on the
  // loading screen. Bumping it re-runs the init effect from scratch.
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { storedKeyHex, setSdk, setStep } = useAuthStore.getState()
      try {
        await withTimeout(initSia(), INIT_TIMEOUT_MS, 'WASM init')

        if (storedKeyHex) {
          const appKey = new AppKey(Uint8Array.fromHex(storedKeyHex))
          const builder = new Builder(INDEXER_URL, APP_META)
          // Wrap the indexer call in a timeout. If sia.storage is slow
          // or down, the user gets bumped to the connect screen with a
          // visible error rather than an indefinite spinner.
          const sdk = await withTimeout(
            builder.connected(appKey),
            INIT_TIMEOUT_MS,
            'reconnect with stored App Key',
          )

          if (cancelled) return
          if (sdk) {
            setSdk(sdk)
            return
          }
          // connected() returned null — the indexer doesn't recognize
          // this App Key anymore. Surface that explicitly so the user
          // knows why they're being asked to re-approve, instead of
          // silently dropping back to the connect screen.
          setError(
            "We couldn't reconnect using your stored App Key — the indexer didn't recognize it. You may need to approve again.",
          )
        }

        if (!cancelled) {
          setStep('connect')
        }
      } catch (e) {
        if (cancelled) return
        console.error('Init error:', e)
        // Don't auto-fall-through to 'connect' on a timeout/network
        // error — a slow indexer can recover on retry, and bouncing
        // the user to the recovery-phrase screen on a transient
        // failure is a terrible experience. Stay on 'loading' but
        // mark the error so the LoadingScreen can show a Retry CTA.
        const message = e instanceof Error ? e.message : String(e)
        if (/timed out|fetch|network/i.test(message)) {
          setError(
            "We couldn't reach the indexer. Check your connection and try again.",
          )
          // Stay on 'loading' so the user sees the retry button.
          return
        }
        // Anything else (bad stored key, etc) → connect screen.
        setError(`Initialization failed: ${message}`)
        setStep('connect')
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [retryNonce])

  return (
    <div className="flex-1 flex flex-col">
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-800 dark:text-red-300 text-sm max-w-md text-center shadow-sm">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-red-600 hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {step === 'loading' && (
        <LoadingScreen
          // If we have an error AND we're still on 'loading', it means
          // the timeout path was hit. Show the retry CTA.
          retry={error ? () => {
            setError(null)
            setRetryNonce((n) => n + 1)
          } : undefined}
        />
      )}
      {step === 'connect' && <ConnectScreen builder={builderRef} />}
      {step === 'approve' && <ApproveScreen builder={builderRef} />}
      {step === 'recovery' && <RecoveryScreen builder={builderRef} />}
    </div>
  )
}
