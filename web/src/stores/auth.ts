import { AppKey, type Sdk } from '@siafoundation/sia-storage'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { APP_KEY, INDEXER_URL } from '../lib/constants'

export type AuthStep = 'loading' | 'connect' | 'approve' | 'recovery' | 'connected'

type AuthState = {
  sdk: Sdk | null
  storedKeyHex: string | null
  /**
   * The user's public key, derived synchronously from `storedKeyHex`
   * once WASM is ready. Kept separately from `sdk` because identity
   * (who is the user?) doesn't depend on whether the indexer is
   * reachable — the App Key alone is enough to derive a pubkey via
   * ed25519, no network round-trip needed. Anything that needs to
   * display the user's identity (navbar badge, MyListings query)
   * should read from here, NOT from `sdk?.appKey().publicKey()`.
   * That way the navbar and `/mine` keep working even when the
   * background `connected()` call to sia.storage hasn't returned yet.
   */
  publicKey: string | null
  /** Hardcoded to INDEXER_URL — kept on the store so AuthFlow can reference it uniformly. */
  indexerUrl: string
  step: AuthStep
  error: string | null
  approvalUrl: string | null
  setSdk: (sdk: Sdk) => void
  setStep: (step: AuthStep) => void
  setError: (error: string | null) => void
  setStoredKeyHex: (hex: string) => void
  setApprovalUrl: (url: string | null) => void
  /**
   * Derive `publicKey` from the stored hex. Must be called only after
   * `initSia()` has resolved — the AppKey constructor needs WASM. A
   * silent no-op if no stored key, since the user hasn't connected yet.
   */
  hydratePublicKey: () => void
  reset: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      sdk: null,
      storedKeyHex: null,
      publicKey: null,
      indexerUrl: INDEXER_URL,
      step: 'loading',
      error: null,
      approvalUrl: null,
      setSdk: (sdk) => {
        // Bonus: when the SDK lands we can also refresh publicKey from
        // it. They should match, but keep the source-of-truth path
        // consistent: hydratePublicKey from storedKeyHex is canonical,
        // SDK-derived is a sanity check.
        try {
          const fromSdk = sdk.appKey().publicKey()
          set({ sdk, publicKey: fromSdk, step: 'connected', error: null })
        } catch {
          set({ sdk, step: 'connected', error: null })
        }
      },
      setStep: (step) => set({ step, error: null }),
      setError: (error) => set({ error }),
      setStoredKeyHex: (hex) => set({ storedKeyHex: hex }),
      setApprovalUrl: (url) => set({ approvalUrl: url }),
      hydratePublicKey: () => {
        const hex = get().storedKeyHex
        if (!hex) return
        try {
          const appKey = new AppKey(Uint8Array.fromHex(hex))
          set({ publicKey: appKey.publicKey() })
        } catch (e) {
          // Stored hex is corrupt — nothing we can do here. AuthFlow
          // will surface this when it tries to use the key for real.
          console.error('Failed to derive pubkey from stored hex:', e)
        }
      },
      reset: () =>
        set({
          sdk: null,
          storedKeyHex: null,
          publicKey: null,
          step: 'loading',
          error: null,
          approvalUrl: null,
        }),
    }),
    {
      name: `vidway-auth-${APP_KEY.slice(0, 16)}`,
      // Only the user's App Key seed is persisted. Indexer URL is hardcoded.
      // publicKey is intentionally NOT persisted — it's derived state and
      // hydrated synchronously from storedKeyHex once WASM is ready.
      partialize: (state) => ({ storedKeyHex: state.storedKeyHex }),
    },
  ),
)
