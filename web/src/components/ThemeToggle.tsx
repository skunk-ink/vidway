import type { Theme } from '../lib/theme'
import { useThemeStore } from '../stores/theme'

const OPTIONS: Array<{ value: Theme; icon: string; label: string }> = [
  { value: 'light', icon: '☀', label: 'Light' },
  { value: 'system', icon: '✦', label: 'System' },
  { value: 'dark', icon: '☾', label: 'Dark' },
]

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex items-center rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-0.5 dark:bg-neutral-900 dark:border-neutral-700"
    >
      {OPTIONS.map((o) => {
        const active = theme === o.value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => setTheme(o.value)}
            title={`${o.label} theme`}
            className={`px-1.5 py-0.5 rounded text-[12px] leading-none transition-colors ${
              active
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-100'
            }`}
          >
            <span aria-hidden>{o.icon}</span>
            <span className="sr-only">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
