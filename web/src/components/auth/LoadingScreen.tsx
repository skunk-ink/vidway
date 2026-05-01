export function LoadingScreen({
  message,
  retry,
  retryLabel = 'Retry',
}: {
  message?: string
  /**
   * If provided, a button is rendered below the spinner. Used by
   * AuthFlow when init times out — the user gets an explicit recovery
   * action instead of an indefinite spinner.
   *
   * For WASM init failures (poisoned promise) the action is a hard
   * page reload; for indexer failures it's an in-place retry.
   */
  retry?: () => void
  retryLabel?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4">
      <div className="w-8 h-8 border-2 border-neutral-300 dark:border-neutral-700 border-t-neutral-900 dark:border-t-neutral-100 rounded-full animate-spin" />
      <p className="text-neutral-500 dark:text-neutral-400 text-sm">
        {message || (retry ? 'Still trying…' : 'Initializing…')}
      </p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="px-4 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}
