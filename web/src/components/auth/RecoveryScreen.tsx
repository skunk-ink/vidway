import {
  type Builder,
  generateRecoveryPhrase,
  validateRecoveryPhrase,
} from '@siafoundation/sia-storage'
import { useState } from 'react'
import { useAuthStore } from '../../stores/auth'
import { CopyButton } from '../CopyButton'

export function RecoveryScreen({
  builder,
}: {
  builder: React.RefObject<Builder | null>
}) {
  const { setSdk, setStoredKeyHex, setError } = useAuthStore()
  const [mode, setMode] = useState<'choose' | 'generate' | 'import'>('choose')
  const [phrase, setPhrase] = useState('')
  const [generatedPhrase, setGeneratedPhrase] = useState('')
  const [loading, setLoading] = useState(false)
  const [phraseError, setPhraseError] = useState<string | null>(null)

  function handleGenerate() {
    const mnemonic = generateRecoveryPhrase()
    setGeneratedPhrase(mnemonic)
    setPhrase(mnemonic)
    setMode('generate')
  }

  function handleValidatePhrase(value: string) {
    setPhrase(value)
    setPhraseError(null)
    if (value.trim()) {
      try {
        validateRecoveryPhrase(value.trim())
      } catch {
        setPhraseError('Invalid recovery phrase')
      }
    }
  }

  async function handleRegister() {
    const b = builder.current
    if (!b) {
      setError('No builder instance')
      return
    }
    const mnemonic = phrase.trim()
    try {
      validateRecoveryPhrase(mnemonic)
    } catch {
      setPhraseError('Invalid recovery phrase')
      return
    }
    setLoading(true)
    try {
      const sdk = await b.register(mnemonic)
      setStoredKeyHex(sdk.appKey().export().toHex())
      setSdk(sdk)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'choose') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Recovery Phrase</h1>
            <p className="text-neutral-600 dark:text-neutral-400 text-sm">
              Generate a new recovery phrase or enter an existing one.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGenerate}
              className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 font-medium rounded-lg transition-colors"
            >
              Generate New Phrase
            </button>
            <button
              type="button"
              onClick={() => setMode('import')}
              className="w-full py-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-neutral-900 dark:text-neutral-100 font-medium rounded-lg transition-colors"
            >
              Enter Existing Phrase
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {mode === 'generate' ? 'Save Your Recovery Phrase' : 'Enter Recovery Phrase'}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">
            {mode === 'generate'
              ? 'Write down these 12 words in order. You will need them to recover your account.'
              : 'Enter your 12-word recovery phrase.'}
          </p>
        </div>

        {mode === 'generate' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 p-4 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-300 dark:border-neutral-700">
              {generatedPhrase.split(' ').map((word, i) => (
                <div
                  key={`${word}-${i}`}
                  className="text-center py-2 bg-neutral-100 dark:bg-neutral-800 rounded text-sm"
                >
                  <span className="text-neutral-400 dark:text-neutral-500 mr-1">{i + 1}.</span>
                  <span className="text-neutral-900 dark:text-neutral-100">{word}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <CopyButton value={generatedPhrase} label="Recovery phrase copied" />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={phrase}
              onChange={(e) => handleValidatePhrase(e.target.value)}
              placeholder="Enter your 12-word recovery phrase…"
              rows={3}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100"
            />
            {phraseError && <p className="text-red-600 text-sm">{phraseError}</p>}
          </div>
        )}

        <button
          type="button"
          onClick={handleRegister}
          disabled={loading || !phrase.trim()}
          className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white disabled:bg-neutral-200 dark:disabled:bg-neutral-700 disabled:text-neutral-400 dark:disabled:text-neutral-500 text-white dark:text-neutral-900 font-medium rounded-lg transition-colors"
        >
          {loading ? 'Registering…' : 'Complete Setup'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('choose')
            setPhrase('')
            setGeneratedPhrase('')
            setPhraseError(null)
          }}
          className="w-full py-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 text-sm transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  )
}
