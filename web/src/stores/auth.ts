import type { Sdk } from '@siafoundation/sia-storage'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { APP_KEY, INDEXER_URL } from '../lib/constants'

export type AuthStep = 'loading' | 'connect' | 'approve' | 'recovery' | 'connected'

type AuthState = {
  sdk: Sdk | null
  storedKeyHex: string | null
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
  reset: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      sdk: null,
      storedKeyHex: null,
      indexerUrl: INDEXER_URL,
      step: 'loading',
      error: null,
      approvalUrl: null,
      setSdk: (sdk) => set({ sdk, step: 'connected', error: null }),
      setStep: (step) => set({ step, error: null }),
      setError: (error) => set({ error }),
      setStoredKeyHex: (hex) => set({ storedKeyHex: hex }),
      setApprovalUrl: (url) => set({ approvalUrl: url }),
      reset: () =>
        set({
          sdk: null,
          storedKeyHex: null,
          step: 'loading',
          error: null,
          approvalUrl: null,
        }),
    }),
    {
      name: `vidway-auth-${APP_KEY.slice(0, 16)}`,
      // Only the user's App Key seed is persisted. Indexer URL is hardcoded.
      partialize: (state) => ({ storedKeyHex: state.storedKeyHex }),
    },
  ),
)
