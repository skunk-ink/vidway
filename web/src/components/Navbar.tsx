import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { type UserProfile, api } from '../lib/api'
import { APP_NAME } from '../lib/constants'
import { useAuthStore } from '../stores/auth'
import { CopyButton } from './CopyButton'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

export function Navbar() {
  const step = useAuthStore((s) => s.step)
  const sdk = useAuthStore((s) => s.sdk)
  const reset = useAuthStore((s) => s.reset)
  const isConnected = step === 'connected'

  const publicKey = useMemo(() => {
    try {
      return sdk?.appKey().publicKey() ?? null
    } catch {
      return null
    }
  }, [sdk])

  // Fetch the user's own profile (if any) once after connect. We poll
  // the user's profile from /profile after edits via a custom event so
  // the navbar updates without a full reload.
  const [profile, setProfile] = useState<UserProfile | null>(null)
  useEffect(() => {
    if (!publicKey) {
      setProfile(null)
      return
    }
    let cancelled = false
    api.getProfileByPubkey(publicKey).then((p) => {
      if (!cancelled) setProfile(p)
    })

    // Listen for profile updates from the Profile route. Sent with
    // `window.dispatchEvent(new CustomEvent('vidway:profile-updated', {detail}))`.
    function onUpdate(e: Event) {
      const detail = (e as CustomEvent<UserProfile | null>).detail
      setProfile(detail)
    }
    window.addEventListener('vidway:profile-updated', onUpdate)
    return () => {
      cancelled = true
      window.removeEventListener('vidway:profile-updated', onUpdate)
    }
  }, [publicKey])

  function handleSignOut() {
    reset()
    window.location.reload()
  }

  return (
    <header className="border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/70 dark:bg-neutral-900/70 backdrop-blur sticky top-0 z-30">
      <div className="flex items-center justify-between px-6 py-3 max-w-6xl mx-auto gap-4">
        <Link to="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          <Logo className="h-5 w-5" />
          {APP_NAME}
        </Link>

        {isConnected && (
          <nav className="flex items-center gap-4 flex-1 justify-center text-sm">
            <NavLink to="/" end className={navClass}>
              Browse
            </NavLink>
            <NavLink to="/categories" className={navClass}>
              Categories
            </NavLink>
            <NavLink to="/upload" className={navClass}>
              Upload
            </NavLink>
            <NavLink to="/mine" className={navClass}>
              My Listings
            </NavLink>
          </nav>
        )}

        {isConnected && publicKey && (
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
            </span>
            {/*
              Identity badge: @username if claimed (linked to own profile
              edit page), else truncated pubkey + "Set username" CTA.
            */}
            {profile ? (
              <Link
                to="/profile"
                className="text-xs text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
                title={publicKey}
              >
                @{profile.username}
              </Link>
            ) : (
              <>
                <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400" title={publicKey}>
                  {publicKey.slice(0, 8)}…{publicKey.slice(-6)}
                </span>
                <Link
                  to="/profile"
                  className="text-[11px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors underline-offset-2 hover:underline"
                >
                  Set username
                </Link>
              </>
            )}
            <CopyButton value={publicKey} label="Public key copied" />
            <ThemeToggle />
            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors ml-1"
            >
              Sign Out
            </button>
          </div>
        )}
        {!isConnected && (
          <ThemeToggle />
        )}
      </div>
    </header>
  )
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'text-neutral-900 dark:text-neutral-100 font-medium'
    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors'
}
