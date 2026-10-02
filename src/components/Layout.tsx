import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../stores/auth'
import { useOfflineSync } from '../hooks/useOfflineSync'
import { ROLE_LABELS } from '../lib/constants'
import { isLowData, isOnline, onConnectionChange } from '../lib/offline'
import { cn } from './UI'

interface NavItem {
  to: string
  label: string
  end?: boolean
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  passenger: [
    { to: '/', label: 'Book', end: true },
    { to: '/history', label: 'History' },
    { to: '/wallet', label: 'Wallet' },
  ],
  driver: [
    { to: '/driver', label: 'Drive', end: true },
    { to: '/driver/earnings', label: 'Earnings' },
  ],
  admin: [
    { to: '/admin', label: 'Live', end: true },
    { to: '/admin/verification', label: 'Verify' },
    { to: '/admin/sos', label: 'SOS' },
    { to: '/admin/fares', label: 'Fares' },
    { to: '/admin/reports', label: 'Reports' },
  ],
}

function ConnectionBanner({ pending }: { pending: number }) {
  const [online, setOnline] = useState(isOnline())
  const [lowData] = useState(isLowData())

  useEffect(() => onConnectionChange(setOnline), [])

  if (online && !lowData && pending === 0) return null

  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">
      {!online
        ? 'No connection. Your actions are saved on this phone and will send when signal returns.'
        : pending > 0
          ? `${pending} saved action${pending > 1 ? 's' : ''} waiting to send.`
          : 'Low data mode. Live map and automatic updates are reduced to save your load.'}
    </div>
  )
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { profile, role, signOut } = useAuth()
  const { pending } = useOfflineSync()
  const items = role ? (NAV_BY_ROLE[role] ?? []) : []

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <ConnectionBanner pending={pending} />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900">SakayTa</p>
              <p className="text-xs text-slate-500">
                {role ? ROLE_LABELS[role] : 'Not signed in'}
                {profile?.full_name ? ` · ${profile.full_name}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-28">{children ?? <Outlet />}</main>

      {items.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
          <ul className="mx-auto flex max-w-3xl">
            {items.map((item) => (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold',
                      isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-700',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
