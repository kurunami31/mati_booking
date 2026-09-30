import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTableSubscription } from './useRealtime'
import type { BookingRow, DriverRow, ProfileRow, VehicleRow } from '../types/db'

export interface BookingDetails {
  booking: BookingRow
  driver: DriverRow | null
  driverProfile: ProfileRow | null
  vehicle: VehicleRow | null
  passengerProfile: ProfileRow | null
}

export interface BookingDetailsResult {
  details: BookingDetails | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/** Full picture of a booking: the trip, the driver, the vehicle, and both names. */
export function useBookingDetails(bookingId: string | null | undefined): BookingDetailsResult {
  const [details, setDetails] = useState<BookingDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!bookingId) {
      setDetails(null)
      setLoading(false)
      return
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingError) setError(bookingError.message)
    if (!booking) {
      setDetails(null)
      setLoading(false)
      return
    }

    const { data: passengerProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', booking.passenger_id)
      .maybeSingle()

    let driver: DriverRow | null = null
    let driverProfile: ProfileRow | null = null
    let vehicle: VehicleRow | null = null

    if (booking.driver_id) {
      const { data: driverRow } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', booking.driver_id)
        .maybeSingle()
      driver = driverRow ?? null

      if (driverRow) {
        const [profileRes, vehicleRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', driverRow.profile_id).maybeSingle(),
          supabase
            .from('vehicles')
            .select('*')
            .eq('driver_id', driverRow.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        driverProfile = profileRes.data ?? null
        vehicle = vehicleRes.data ?? null
      }
    }

    setDetails({
      booking,
      driver,
      driverProfile,
      vehicle,
      passengerProfile: passengerProfile ?? null,
    })
    setLoading(false)
  }, [bookingId])

  useEffect(() => {
    void reload()
  }, [reload])

  useTableSubscription({
    table: 'bookings',
    enabled: Boolean(bookingId),
    filter: bookingId ? `id=eq.${bookingId}` : undefined,
    onChange: reload,
  })

  return { details, loading, error, reload }
}
