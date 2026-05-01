import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthFlow } from './components/auth/AuthFlow'
import { Navbar } from './components/Navbar'
import { Toasts } from './components/Toast'
import { Browse } from './routes/Browse'
import { Categories } from './routes/Categories'
import { MyListings } from './routes/MyListings'
import { Profile } from './routes/Profile'
import { TagRoute } from './routes/TagRoute'
import { Upload } from './routes/Upload'
import { UserProfileRoute } from './routes/UserProfileRoute'
import { Watch } from './routes/Watch'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'

export default function App() {
  const step = useAuthStore((s) => s.step)
  // Pubkey from the auth store — same source-of-truth the navbar uses.
  // Doesn't depend on the SDK being alive, so theme hydration runs as
  // soon as the user is identifiable, not when sia.storage responds.
  const pubkey = useAuthStore((s) => s.publicKey)
  const hydrateTheme = useThemeStore((s) => s.hydrate)

  // Hydrate the theme preference from localStorage as soon as we know
  // the user's pubkey. Pre-auth we sit on system default; post-auth we
  // load whatever this user previously picked. Re-runs on sign out,
  // resetting to system default for the next user.
  useEffect(() => {
    hydrateTheme(pubkey)
  }, [pubkey, hydrateTheme])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col">
        {step === 'connected' ? (
          <Routes>
            <Route path="/" element={<Browse />} />
            <Route path="/v/:id" element={<Watch />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/mine" element={<MyListings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/t/:tag" element={<TagRoute />} />
            <Route path="/u/:username" element={<UserProfileRoute />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        ) : (
          <AuthFlow />
        )}
      </main>
      <Toasts />
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex items-center justify-center flex-1 text-sm text-neutral-500 dark:text-neutral-400 dark:text-neutral-400">
      Not found.
    </div>
  )
}
