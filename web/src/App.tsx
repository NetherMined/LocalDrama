import { Navigate, Route, Routes, Link, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { UpstreamBanner } from './components/UpstreamBanner'
import { ErrorPanel, Spinner, buttonClass } from './components/ui'
import { DownloadsProvider } from './downloads'
import { useStatus } from './status'
import { Browse } from './pages/Browse'
import { Downloads } from './pages/Downloads'
import { Favourites } from './pages/Favourites'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { LibraryShow } from './pages/LibraryShow'
import { Login } from './pages/Login'
import { ChangePassword } from './pages/ChangePassword'
import { Profiles } from './pages/Profiles'
import { Search } from './pages/Search'
import { Settings } from './pages/Settings'
import { Setup } from './pages/Setup'
import { Show } from './pages/Show'
import { Watch } from './pages/Watch'

function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-5xl font-extrabold text-accent-hi">404</p>
      <p className="mt-2 text-muted">That page does not exist.</p>
      <Link to="/" className={`${buttonClass()} mt-6`}>
        Back to home
      </Link>
    </div>
  )
}

export default function App() {
  const { status, loading, error, reload } = useStatus()
  const location = useLocation()

  if (!status) {
    if (loading) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <Spinner label="Starting Dramabox" />
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-lg p-6 pt-16">
        <ErrorPanel
          title="Cannot reach the Dramabox server"
          message={error ?? 'Unknown error'}
          onRetry={() => void reload()}
        />
      </div>
    )
  }

  if (status.needsBootstrap) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Login />
      </main>
    )
  }

  if (!status.configured) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </main>
    )
  }

  if (status.authRequired && !status.authenticated) {
    const next = `${location.pathname}${location.search}`
    return (
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />} />
        </Routes>
      </main>
    )
  }

  if (status.account?.mustChangePassword) {
    return (
      <main className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-8">
        <ChangePassword />
      </main>
    )
  }

  if (status.profileRequired) {
    const next = `${location.pathname}${location.search}`
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Routes>
          <Route path="/profiles" element={<Profiles />} />
          <Route path="*" element={<Navigate to={`/profiles?next=${encodeURIComponent(next)}`} replace />} />
        </Routes>
      </main>
    )
  }

  return (
    <DownloadsProvider>
      <Nav />
      <UpstreamBanner />
      <main className={location.pathname === '/' ? undefined : 'mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8'}>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Home />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/search" element={<Search />} />
          <Route path="/show/:bookId" element={<Show />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:bookId" element={<LibraryShow />} />
          <Route path="/favourites" element={<Favourites />} />
          <Route path="/watch/:bookId/:downloadId" element={<Watch />} />
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </DownloadsProvider>
  )
}
