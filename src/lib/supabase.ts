import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/db'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when .env.local has not been filled in. The app shows a setup screen. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// A syntactically valid placeholder keeps createClient from throwing at import
// time. It is never called when isSupabaseConfigured is false.
const fallbackUrl = 'https://placeholder.supabase.co'
const fallbackKey = 'placeholder-anon-key'

export const supabase = createClient<Database>(
  isSupabaseConfigured ? url : fallbackUrl,
  isSupabaseConfigured ? anonKey : fallbackKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
