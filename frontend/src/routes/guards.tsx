import { Navigate, Outlet, useLocation, Link } from 'react-router-dom'
import { useAuth, destinationFor } from '../auth/auth-context'
import { FullScreenLoader } from '../components/FullScreenLoader'

/**
 * Gate for authenticated, role-assigned routes. Unauthenticated users go to
 * /login; authenticated users without a role go to /register to finish.
 */
export function ProtectedRoute() {
  const { session, me, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (!me) return <FullScreenLoader />
  if (!me.role_set) return <Navigate to="/register" replace />

  return <Outlet />
}

/**
 * Gate for the seeker dashboard: authenticated + role === seeker +
 * onboarding_completed. Anyone else is sent where they belong (login, register,
 * onboarding, or the therapist placeholder).
 */
export function SeekerGuard() {
  const { session, me, loading } = useAuth()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace />
  if (!me) return <FullScreenLoader />
  if (me.role !== 'seeker' || !me.onboarding_completed) {
    return <Navigate to={destinationFor(me)} replace />
  }
  return <Outlet />
}

/**
 * Gate for the therapist dashboard: authenticated + role === therapist +
 * onboarding_completed.
 */
export function TherapistGuard() {
  const { session, me, loading } = useAuth()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace />
  if (!me) return <FullScreenLoader />
  if (me.role !== 'therapist' || !me.onboarding_completed) {
    return <Navigate to={destinationFor(me)} replace />
  }
  return <Outlet />
}

/**
 * Gate for public-only routes (/login, /register, /forgot-password). Sends an
 * authenticated user onward to where they belong — unless this route already IS
 * that destination (e.g. an authed, role-less user completing /register).
 */
export function PublicOnlyRoute() {
  const { session, me, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (session && me) {
    const dest = destinationFor(me)
    if (location.pathname !== dest) return <Navigate to={dest} replace />
  }
  return <Outlet />
}

/**
 * Gate for the admin dashboard: authenticated + role === admin.
 * Non-admins get a hard 403 access denied view.
 */
export function AdminGuard() {
  const { session, me, loading } = useAuth()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace />
  if (!me) return <FullScreenLoader />
  if (me.role !== 'admin') {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center bg-cream px-6 text-center select-none">
        <div className="space-y-4">
          <h1 className="font-display text-6xl text-ink font-normal leading-none">403</h1>
          <h2 className="font-display text-2xl text-ink font-normal">Access Denied</h2>
          <p className="text-sm text-ink-soft max-w-sm leading-relaxed mx-auto">
            This area is restricted to administrators. Your account does not have the required permissions.
          </p>
          <div className="pt-4">
            <Link
              to={destinationFor(me)}
              className="focus-ring inline-flex h-9 items-center justify-center rounded-full bg-ink px-6 text-xs font-semibold text-cream hover:bg-forest-deep transition-all cursor-pointer"
            >
              Go to Home
            </Link>
          </div>
        </div>
      </main>
    )
  }
  return <Outlet />
}
