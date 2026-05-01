import { AppKey, Builder, initSia } from '@siafoundation/sia-storage'
import { useEffect, useRef, useState } from 'react'
import { APP_META, INDEXER_URL } from '../../lib/constants'
import { useAuthStore } from '../../stores/auth'
import { ApproveScreen } from './ApproveScreen'
import { ConnectScreen } from './ConnectScreen'
import { LoadingScreen } from './LoadingScreen'
import { RecoveryScreen } from './RecoveryScreen'

// WASM init has a different failure mode than the indexer call. The
// SDK's `initSia()` caches its promise internally — if the very first
// call rejects (or hangs and we time it out), every subsequent call
// returns the same poisoned promise. That means retrying via the same
// JS module instance is hopeless. The only real fix is a hard page
// reload, which gives us a fresh module and a fresh `initPromise = null`.
const WASM_INIT_TIMEOUT_MS = 15_000

// The indexer call (builder.connected) is retryable in-place because
// each call makes a new HTTP request — no internal caching.
const INDEXER_TIMEOUT_MS = 15_000

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

// Track WASM init outside React state so it survives re-renders and
// so we can distinguish "first attempt hung" from "we got past WASM
// init but the indexer is slow." Once this resolves successfully, we
// never re-attempt — WASM is initialized for the lifetime of the page.
let wasmReady: Promise<void> | null = null
function ensureWasmReady(): Promise<void> {
  if (!wasmReady) {
    wasmReady = withTimeout(initSia(), WASM_INIT_TIMEOUT_MS, 'WASM init').catch(
      (e) => {
        // The SDK's internal `initPromise` is now poisoned. Clearing
        // our local cache wouldn't help because the next initSia()
        // call returns the same rejected promise. Surface this so
        // the UI can offer a hard reload.
        wasmReady = null // allow caller to retry, but it won't fix the SDK cache
        throw e
      },
    )
  }
  return wasmReady
}

export function AuthFlow() {
  const step = useAuthStore((s) => s.step)
  const error = useAuthStore((s) => s.error)
  const setError = useAuthStore((s) => s.setError)
  const builderRef = useRef<Builder | null>(null)

  // `retryNonce` triggers an in-place retry of the indexer call. WASM
  // init failures don't use this — they require a full reload.
  const [retryNonce, setRetryNonce] = useState(0)
  // `wasmFailed` flips on if the WASM module failed to initialize.
  // The retry button changes from "Retry" to "Reload" since in-place
  // retries don't help.
  const [wasmFailed, setWasmFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { storedKeyHex, setSdk, setStep } = useAuthStore.getState()

      // Phase 1: WASM init. If this fails, only a hard reload helps.
      try {
        await ensureWasmReady()
      } catch (e) {
        if (cancelled) return
        console.error('WASM init failed:', e)
        setWasmFailed(true)
        setError(
          "Vidway couldn't load. This usually fixes itself with a refresh — sometimes the page assets get out of sync.",
        )
        return // stay on 'loading' with the Reload button
      }

      // Phase 2: Indexer reconnect (only if we have a stored key).
      try {
        if (storedKeyHex) {
          const appKey = new AppKey(Uint8Array.fromHex(storedKeyHex))
          const builder = new Builder(INDEXER_URL, APP_META)
          const sdk = await withTimeout(
            builder.connected(appKey),
            INDEXER_TIMEOUT_MS,
            'reconnect with stored App Key',
          )

          if (cancelled) return
          if (sdk) {
            setSdk(sdk)
            return
          }
          // connected() returned null — indexer doesn't recognize the key.
          setError(
            "We couldn't reconnect using your stored App Key — the indexer didn't recognize it. You may need to approve again.",
          )
        }

        if (!cancelled) setStep('connect')
      } catch (e) {
        if (cancelled) return
        console.error('Indexer init error:', e)
        const message = e instanceof Error ? e.message : String(e)
        if (/timed out|fetch|network/i.test(message)) {
          setError("We couldn't reach the indexer. Check your connection and try again.")
          // Stay on 'loading' — user can hit Retry.
          return
        }
        // Anything else (corrupt stored key, etc) → connect screen.
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
          retry={
            wasmFailed
              ? // Hard reload: only way past a poisoned WASM init promise.
                () => window.location.reload()
              : error
                ? () => {
                    setError(null)
                    setRetryNonce((n) => n + 1)
                  }
                : undefined
          }
          retryLabel={wasmFailed ? 'Reload page' : 'Retry'}
        />
      )}
      {step === 'connect' && <ConnectScreen builder={builderRef} />}
      {step === 'approve' && <ApproveScreen builder={builderRef} />}
      {step === 'recovery' && <RecoveryScreen builder={builderRef} />}
    </div>
  )
}
