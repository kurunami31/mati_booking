import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTableSubscription } from '../../hooks/useRealtime'
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_TONE, VEHICLE_LABELS } from '../../lib/constants'
import { formatPeso, formatRelative, shortId } from '../../lib/format'
import type { BookingRow, DriverRow, SosAlertRow } from '../../types/db'
import { Card, EmptyState, PageHeader, Spinner, Stat, StatusPill } from '../../components/UI'
import { MapView, type MapMarker } from '../../components/MapView'

const ACTIVE = ['requested', 'assigned', 'arrived', 'in_progress'] as const

export function AdminLive() {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [sos, setSos] = useState<SosAlertRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [bookingsRes, driversRes, sosRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .in('status', [...ACTIVE])
        .order('requested_at', { ascending: false }),
      supabase.from('drivers').select('*').eq('is_online', true),
      supabase.from('sos_alerts').select('*').eq('status', 'open'),
    ])
    setBookings(bookingsRes.data ?? [])
    setDrivers(driversRes.data ?? [])
    setSos(sosRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useTableSubscription({ table: 'bookings', onChange: load })
  useTableSubscription({ table: 'drivers', onChange: load })
  useTableSubscription({ table: 'sos_alerts', onChange: load })

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = []
    for (const b of bookings) {
      if (b.origin_lat != null && b.origin_lng != null) {
        list.push({ id: `o-${b.id}`, lat: b.origin_lat, lng: b.origin_lng, label: `Pickup ${shortId(b.id)}: ${b.origin_label ?? ''}`, kind: 'pickup' })
      }
      if (b.dest_lat != null && b.dest_lng != null) {
        list.push({ id: `d-${b.id}`, lat: b.dest_lat, lng: b.dest_lng, label: `Dropoff ${shortId(b.id)}: ${b.dest_label ?? ''}`, kind: 'dropoff' })
      }
    }
    for (const d of drivers) {
      if (d.last_lat != null && d.last_lng != null) {
        list.push({ id: `drv-${d.id}`, lat: d.last_lat, lng: d.last_lng, label: `Driver ${shortId(d.id)}`, kind: 'driver' })
      }
    }
    for (const s of sos) {
      if (s.lat != null && s.lng != null) {
        list.push({ id: `sos-${s.id}`, lat: s.lat, lng: s.lng, label: `SOS ${shortId(s.id)}`, kind: 'sos' })
      }
    }
    return list
  }, [bookings, drivers, sos])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8 text-brand-700" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Live operations" subtitle="Active trips, online drivers, and open SOS alerts." />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Active trips" value={bookings.length} />
        <Stat label="Drivers online" value={drivers.length} />
        <Stat label="Open SOS" value={sos.length} />
      </div>

      {sos.length > 0 && (
        <Card className="border-sos-500 bg-rose-50">
          <p className="font-semibold text-rose-800">{sos.length} open SOS alert{sos.length > 1 ? 's' : ''}</p>
          <p className="text-xs text-rose-700">Go to the SOS panel to acknowledge.</p>
        </Card>
      )}

      <MapView markers={markers} zoom={13} />

      <div>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">Active trips</h2>
        {bookings.length === 0 ? (
          <EmptyState title="No active trips" />
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
                      {shortId(b.id)} · {VEHICLE_LABELS[b.vehicle_type]} · {formatRelative(b.requested_at)}
                      {b.driver_id ? '' : ' · unassigned'}
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
    </div>
  )
}
