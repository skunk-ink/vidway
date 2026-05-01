export function LoadingScreen({
  message,
  retry,
}: {
  message?: string
  /**
   * If provided, a retry button is rendered below the spinner. Used by
   * AuthFlow when the bootstrap request to the indexer times out — the
   * user gets an explicit "try again" instead of an indefinite spinner.
   */
  retry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4">
      <div className="w-8 h-8 border-2 border-neutral-300 dark:border-neutral-700 border-t-neutral-900 dark:border-t-neutral-100 rounded-full animate-spin" />
      <p className="text-neutral-500 dark:text-neutral-400 text-sm">
        {message || (retry ? 'Still trying to reach the indexer…' : 'Initializing…')}
      </p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="px-4 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}
