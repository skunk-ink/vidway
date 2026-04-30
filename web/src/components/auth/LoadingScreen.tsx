export function LoadingScreen({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4">
      <div className="w-8 h-8 border-2 border-neutral-300 dark:border-neutral-700 border-t-neutral-900 rounded-full animate-spin" />
      <p className="text-neutral-500 dark:text-neutral-400 text-sm">{message || 'Initializing…'}</p>
    </div>
  )
}
