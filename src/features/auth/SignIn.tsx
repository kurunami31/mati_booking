import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../stores/auth'
import { Alert, Button, Card, Field, Input, Select } from '../../components/UI'
import { MATI_CENTER } from '../../lib/constants'

type Mode = 'signin' | 'signup'

export function SignIn() {
  const { session, signIn, signUp, error, clearError } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'passenger' | 'driver'>('passenger')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    clearError()
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
      } else {
        const { needsConfirmation } = await signUp({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          phone: phone.trim(),
          role,
        })
        if (needsConfirmation) {
          setNotice('Account created. Check your email to confirm, then sign in.')
          setMode('signin')
        }
      }
    } catch {
      // error already surfaced through context
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <img src="/logo-with-title.png" alt="SakayTa" className="mx-auto h-24 w-auto" />
        <p className="mt-3 text-sm text-slate-500">
          Book a tricycle or tuk-tuk/bao-bao in Mati City. Fixed fare before you ride.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Demo center pin: {MATI_CENTER.lat.toFixed(4)}, {MATI_CENTER.lng.toFixed(4)} [VERIFY]
        </p>
      </div>

      <Card>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setNotice(null)
                clearError()
              }}
              className={
                'min-h-9 rounded-lg text-sm font-semibold transition ' +
                (mode === m ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500')
              }
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <Field label="Full name" htmlFor="fullName" required>
                <Input
                  id="fullName"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan Dela Cruz"
                />
              </Field>
              <Field label="Mobile number" htmlFor="phone" hint="Used for trip contact.">
                <Input
                  id="phone"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09xx xxx xxxx"
                />
              </Field>
              <Field label="I am a" htmlFor="role" required>
                <Select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'passenger' | 'driver')}
                >
                  <option value="passenger">Passenger</option>
                  <option value="driver">Driver (needs verification before rides)</option>
                </Select>
              </Field>
            </>
          )}

          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            required
            hint={mode === 'signup' ? 'At least 6 characters.' : undefined}
          >
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && <Alert tone="bad">{error}</Alert>}
          {notice && <Alert tone="good">{notice}</Alert>}

          <Button type="submit" block size="lg" loading={busy}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-xs text-slate-400">
        Admin / LGU accounts are created by setting the profile role to &quot;admin&quot; in the
        database. Self-signup cannot create an admin.
      </p>
    </div>
  )
}
