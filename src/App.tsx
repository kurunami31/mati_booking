import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/Layout'
import { RequireAuth, RoleOutlet } from './components/Guards'
import { SignIn } from './features/auth/SignIn'
import { PassengerHome } from './features/passenger/PassengerHome'
import { PassengerTrip } from './features/passenger/PassengerTrip'
import { PassengerHistory } from './features/passenger/PassengerHistory'
import { DriverHome } from './features/driver/DriverHome'
import { DriverActiveTrip } from './features/driver/DriverActiveTrip'
import { DriverEarnings } from './features/driver/DriverEarnings'
import { AdminLive } from './features/admin/AdminLive'
import { AdminVerification } from './features/admin/AdminVerification'
import { AdminSOS } from './features/admin/AdminSOS'
import { AdminFares } from './features/admin/AdminFares'
import { AdminReports } from './features/admin/AdminReports'
import { isSupabaseConfigured } from './lib/supabase'

function SetupScreen() {
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Mati Ride is not configured yet</h1>
      <p className="text-sm text-slate-600">
        Add your Supabase project values to <code className="rounded bg-slate-200 px-1">.env.local</code>,
        then restart the dev server.
      </p>
      <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key`}
      </pre>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>Create a Supabase project.</li>
        <li>Run supabase/migrations/0001_init.sql in the SQL editor.</li>
        <li>Run supabase/seed.sql.</li>
        <li>Paste the URL and anon key above, then reload.</li>
      </ol>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupScreen />

  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<RoleOutlet allow={['passenger']} />}>
          <Route index element={<PassengerHome />} />
          <Route path="trip" element={<PassengerTrip />} />
          <Route path="history" element={<PassengerHistory />} />
        </Route>

        <Route path="/driver" element={<RoleOutlet allow={['driver']} />}>
          <Route index element={<DriverHome />} />
          <Route path="trip" element={<DriverActiveTrip />} />
          <Route path="earnings" element={<DriverEarnings />} />
        </Route>

        <Route path="/admin" element={<RoleOutlet allow={['admin']} />}>
          <Route index element={<AdminLive />} />
          <Route path="verification" element={<AdminVerification />} />
          <Route path="sos" element={<AdminSOS />} />
          <Route path="fares" element={<AdminFares />} />
          <Route path="reports" element={<AdminReports />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
