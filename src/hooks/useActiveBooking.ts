import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTableSubscription } from './useRealtime'
import type { BookingRow, BookingStatus } from '../types/db'

/** Statuses that count as "this passenger/driver is currently on a booking". */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  'requested',
  'assigned',
  'arrived',
  'in_progress',
]

interface Options {
  passengerId?: string | null
  driverId?: string | null
  enabled?: boolean
}

export interface ActiveBookingResult {
  booking: BookingRow | null
  loading: boolean
  reload: () => Promise<void>
}

/** The single active booking for a passenger or a driver, kept fresh by realtime. */
export function useActiveBooking({ passengerId, driverId, enabled = true }: Options): ActiveBookingResult {
  const [booking, setBooking] = useState<BookingRow | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!enabled || (!passengerId && !driverId)) {
      setBooking(null)
      setLoading(false)
      return
    }

    let query = supabase
      .from('bookings')
      .select('*')
      .in('status', ACTIVE_BOOKING_STATUSES)
      .order('requested_at', { ascending: false })
      .limit(1)

    if (passengerId) query = query.eq('passenger_id', passengerId)
    if (driverId) query = query.eq('driver_id', driverId)

    const { data } = await query.maybeSingle()
    setBooking(data ?? null)
    setLoading(false)
  }, [enabled, passengerId, driverId])

  useEffect(() => {
    void reload()
  }, [reload])

  const filter = passengerId ? `passenger_id=eq.${passengerId}` : driverId ? `driver_id=eq.${driverId}` : undefined

  useTableSubscription({
    table: 'bookings',
    enabled: enabled && Boolean(filter),
    filter,
    onChange: reload,
  })

  return { booking, loading, reload }
}
