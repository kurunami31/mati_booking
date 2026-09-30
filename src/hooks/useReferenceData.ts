import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppSettingRow, FareMatrixRow, FareZoneRow } from '../types/db'
import { ratesFromSettings, type FareRates } from '../lib/fare'

export interface ReferenceData {
  settings: AppSettingRow[]
  zones: FareZoneRow[]
  matrix: FareMatrixRow[]
  rates: FareRates
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/** Fare zones, matrix, and app settings. Loaded once and refreshed on demand. */
export function useReferenceData(): ReferenceData {
  const [settings, setSettings] = useState<AppSettingRow[]>([])
  const [zones, setZones] = useState<FareZoneRow[]>([])
  const [matrix, setMatrix] = useState<FareMatrixRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    const [settingsRes, zonesRes, matrixRes] = await Promise.all([
      supabase.from('app_settings').select('*'),
      supabase.from('fare_zones').select('*').eq('is_active', true).order('name'),
      supabase.from('fare_matrix').select('*').eq('is_active', true),
    ])

    const firstError = settingsRes.error ?? zonesRes.error ?? matrixRes.error
    if (firstError) setError(firstError.message)

    setSettings(settingsRes.data ?? [])
    setZones(zonesRes.data ?? [])
    setMatrix(matrixRes.data ?? [])
  }, [])

  useEffect(() => {
    void reload().finally(() => setLoading(false))
  }, [reload])

  return {
    settings,
    zones,
    matrix,
    rates: ratesFromSettings(settings),
    loading,
    error,
    reload,
  }
}
