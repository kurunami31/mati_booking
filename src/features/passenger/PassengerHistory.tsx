import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../stores/auth'
import { supabase } from '../../lib/supabase'
import { useTableSubscription } from '../../hooks/useRealtime'
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_TONE, VEHICLE_LABELS } from '../../lib/constants'
import { formatPeso, formatDateTime, shortId } from '../../lib/format'
import type { BookingRow } from '../../types/db'
import { Card, EmptyState, PageHeader, Spinner, StatusPill } from '../../components/UI'

export function PassengerHistory() {
  const { profile } = useAuth()
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('passenger_id', profile.id)
      .order('requested_at', { ascending: false })
      .limit(50)
    setBookings(data ?? [])
    setLoading(false)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  useTableSubscription({
    table: 'bookings',
    enabled: Boolean(profile),
    filter: profile ? `passenger_id=eq.${profile.id}` : undefined,
    onChange: load,
  })

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8 text-brand-700" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="My rides" subtitle="Past and cancelled bookings on this account." />

      {bookings.length === 0 ? (
        <EmptyState title="No rides yet" description="Your booked trips will appear here." />
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => (
            <Card as="li" key={b.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {b.origin_label ?? 'Pickup'} → {b.dest_label ?? 'Dropoff'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(b.requested_at)} · {VEHICLE_LABELS[b.vehicle_type]} · {shortId(b.id)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{formatPeso(b.fare)}</p>
                  <StatusPill tone={BOOKING_STATUS_TONE[b.status]}>
                    {BOOKING_STATUS_LABELS[b.status]}
                  </StatusPill>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  )
}
