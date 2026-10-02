import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../stores/auth'
import { Button } from '../../components/UI'

/** Grab-style welcome screen shown when signed out. */
export function Welcome() {
  const { session } = useAuth()
  const navigate = useNavigate()

  if (session) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-full flex-col justify-between bg-gradient-to-b from-brand-800 to-brand-600 px-6 py-10 text-white">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="rounded-3xl bg-white p-4 shadow-lg">
          <img src="/logo-with-title.png" alt="SakayTa" className="h-28 w-auto" />
        </div>
        <p className="text-lg font-semibold">
          Book a tricycle or tuk-tuk/bao-bao in Mati City.
        </p>
        <p className="max-w-sm text-sm text-brand-100">
          Fixed fare before you ride. Track your driver live. Pay with cash or your
          SakayTa wallet.
        </p>
      </div>
      <div className="space-y-3">
        <Button
          block
          size="lg"
          variant="secondary"
          onClick={() => navigate('/signin')}
        >
          Get started
        </Button>
        <Button
          block
          size="lg"
          variant="ghost"
          className="text-white hover:bg-white/10"
          onClick={() => navigate('/signin')}
        >
          I already have an account
        </Button>
      </div>
    </div>
  )
}
