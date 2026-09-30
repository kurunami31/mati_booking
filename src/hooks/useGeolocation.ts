import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentPosition, watchPosition, type PositionResult } from '../lib/geo'

interface GeolocationState {
  position: PositionResult | null
  error: string | null
  loading: boolean
  request: () => Promise<PositionResult | null>
}

/** One-shot/refreshable current position for booking and presence updates. */
export function useGeolocation(): GeolocationState {
  const [position, setPosition] = useState<PositionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const request = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await getCurrentPosition()
      setPosition(next)
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get your location.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { position, error, loading, request }
}

/** Continuous position watching, used while a driver is online or on a trip. */
export function useWatchPosition(enabled: boolean): {
  position: PositionResult | null
  error: string | null
} {
  const [position, setPosition] = useState<PositionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled) {
      stopRef.current?.()
      stopRef.current = null
      return
    }
    stopRef.current = watchPosition(setPosition, setError)
    return () => {
      stopRef.current?.()
      stopRef.current = null
    }
  }, [enabled])

  return { position, error }
}
