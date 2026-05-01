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
const WASM_INIT_TIMEOUT_MS = 30_000

// Indexer reconnect has its own timeout. Bumped to 30s because
// sia.storage is sometimes legitimately slow on cold cache. Short
// timeouts here cause the optimistic-render path to fall back to the
// "session unverified" banner unnecessarily often.
const INDEXER_TIMEOUT_MS = 30_000

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

// Track WASM init outside React state so it survives re-renders. Once
// this resolves successfully, we never re-attempt — WASM is initialized
// for the lifetime of the page.
let wasmReady: Promise<void> | null = null
function ensureWasmReady(): Promise<void> {
  if (!wasmReady) {
    wasmReady = withTimeout(initSia(), WASM_INIT_TIMEOUT_MS, 'WASM init').catch(
      (e) => {
        wasmReady = null
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
  const [retryNonce, setRetryNonce] = useState(0)
  const [wasmFailed, setWasmFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { storedKeyHex, setSdk, setStep, hydratePublicKey } = useAuthStore.getState()

      // ---- Phase 1: WASM init (must succeed before doing anything) ----
      try {
        await ensureWasmReady()
      } catch (e) {
        if (cancelled) return
        console.error('WASM init failed:', e)
        setWasmFailed(true)
        setError(
          "Vidway couldn't load. This usually fixes itself with a refresh — sometimes the page assets get out of sync.",
        )
        return
      }

      // Now that WASM is ready, derive the public key synchronously
      // from storedKeyHex if we have one. This unblocks the navbar's
      // identity badge and the /mine page from waiting on the indexer.
      // It's a local cryptographic derivation (ed25519 pubkey from
      // private key bytes), no network call.
      hydratePublicKey()

      // ---- Phase 2: route ----
      //
      // No stored key → user has never connected, send them to the
      // connect flow.
      if (!storedKeyHex) {
        if (!cancelled) setStep('connect')
        return
      }

      // We have a stored App Key. Trust it optimistically and unblock
      // the UI immediately. The actual `builder.connected()` call
      // happens in the background — if it succeeds we attach the SDK,
      // if it fails we surface a non-blocking banner.
      //
      // Why optimistic: `connected()` is an HTTP call to sia.storage's
      // /auth/check endpoint. It blocks every page load on a third
      // party's responsiveness — when sia.storage is slow, every fresh
      // tab looks broken. Routes that don't actually need an SDK
      // (Browse, Categories, /t/:tag, /u/:username) work fine without
      // one. Routes that DO need one (Upload, MyListings) gate their
      // action buttons on sdk being non-null and show a "verifying
      // session…" hint until it arrives.
      if (!cancelled) setStep('connected')

      try {
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
          // setSdk also bumps step to 'connected' — already there but
          // harmless. Clear any session-unverified banner left over.
          setError(null)
        } else {
          // Indexer doesn't recognize the key. The user can keep
          // browsing, but anything that needs to upload/pin/refresh
          // will fail. Surface a non-blocking banner with re-approve.
          setError(
            "Your session couldn't be verified — some features may not work until you reconnect. Sign out and back in to fix.",
          )
        }
      } catch (e) {
        if (cancelled) return
        console.error('Background indexer verification failed:', e)
        const message = e instanceof Error ? e.message : String(e)
        // Distinguish transient network errors from "indexer rejected
        // your key." Network errors → silent retry on next bootstrap;
        // explicit rejection → tell the user to re-approve. Without
        // distinguishing we'd nag everyone every time sia.storage is
        // slow.
        if (/timed out|fetch|network/i.test(message)) {
          // Don't show an error banner for transient failures — the
          // user can use most of the app fine, and the next page load
          // will retry. Just log it for debugging.
          console.warn('Indexer unreachable; running without SDK until next bootstrap.')
        } else {
          setError(`Couldn't verify your session: ${message}`)
        }
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
              ? () => window.location.reload()
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
