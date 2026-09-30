import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { DriverRow, ProfileRow, UserRole, VehicleRow } from '../types/db'

interface SignUpInput {
  email: string
  password: string
  fullName: string
  phone: string
  role: Extract<UserRole, 'passenger' | 'driver'>
}

interface AuthState {
  session: Session | null
  profile: ProfileRow | null
  driver: DriverRow | null
  vehicle: VehicleRow | null
  loading: boolean
  error: string | null
  role: UserRole | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [driver, setDriver] = useState<DriverRow | null>(null)
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadContext = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setProfile(null)
      setDriver(null)
      setVehicle(null)
      return
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', activeSession.user.id)
      .maybeSingle()

    if (profileError) {
      setError(profileError.message)
    }
    setProfile(profileRow ?? null)

    const { data: driverRow } = await supabase
      .from('drivers')
      .select('*')
      .eq('profile_id', activeSession.user.id)
      .maybeSingle()

    setDriver(driverRow ?? null)

    if (driverRow) {
      const { data: vehicleRow } = await supabase
        .from('vehicles')
        .select('*')
        .eq('driver_id', driverRow.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setVehicle(vehicleRow ?? null)
    } else {
      setVehicle(null)
    }
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session ?? null)
      await loadContext(data.session ?? null)
      if (active) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
      void loadContext(nextSession ?? null)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [loadContext])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session ?? null)
    await loadContext(data.session ?? null)
  }, [loadContext])

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      throw signInError
    }
  }, [])

  const signUp = useCallback(async (input: SignUpInput) => {
    setError(null)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          full_name: input.fullName,
          phone: input.phone,
          // Only passenger and driver are self-selectable. Admin is set in the DB.
          role: input.role,
        },
      },
    })
    if (signUpError) {
      setError(signUpError.message)
      throw signUpError
    }
    const needsConfirmation = !data.session
    return { needsConfirmation }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setDriver(null)
    setVehicle(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      driver,
      vehicle,
      loading,
      error,
      role: profile?.role ?? null,
      signIn,
      signUp,
      signOut,
      refresh,
      clearError: () => setError(null),
    }),
    [session, profile, driver, vehicle, loading, error, signIn, signUp, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
