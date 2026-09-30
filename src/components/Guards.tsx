import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import type { UserRole } from '../types/db'
import { Spinner } from './UI'

/** Full-page loading state while the session and profile are restored. */
export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-slate-100 text-slate-500">
      <Spinner className="size-8 text-brand-700" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/signin" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

export function roleHome(role: UserRole | null): string {
  if (role === 'driver') return '/driver'
  if (role === 'admin') return '/admin'
  return '/'
}

/** Redirects a signed-in user away from routes their role cannot use. */
export function RequireRole({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { role, loading } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!role || !allow.includes(role)) return <Navigate to={roleHome(role)} replace />
  return <>{children}</>
}

/** Route element wrapper used inside nested routes. */
export function RoleOutlet({ allow }: { allow: UserRole[] }) {
  return (
    <RequireRole allow={allow}>
      <Outlet />
    </RequireRole>
  )
}
