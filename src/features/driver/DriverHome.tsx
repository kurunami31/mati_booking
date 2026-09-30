import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../stores/auth'
import { supabase } from '../../lib/supabase'
import { useWatchPosition } from '../../hooks/useGeolocation'
import { useActiveBooking } from '../../hooks/useActiveBooking'
import { useTableSubscription } from '../../hooks/useRealtime'
import { haversineKm, etaMinutes } from '../../lib/geo'
import { isOnline } from '../../lib/offline'
import { TUKTUK_CLASS_LABEL, VEHICLE_LABELS } from '../../lib/constants'
import { formatPeso, formatDistanceKm, shortId, formatRelative } from '../../lib/format'
import type { BookingRow } from '../../types/db'
import { Alert, Button, Card, EmptyState, PageHeader, Spinner, StatusPill } from '../../components/UI'
import { DriverOnboarding, DriverPending, DriverSuspended } from './DriverOnboarding'

export function DriverHome() {
  const { profile, driver, vehicle, loading, refresh } = useAuth()
  const navigate = useNavigate()

  const [requests, setRequests] = useState<BookingRow[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [presenceBusy, setPresenceBusy] = useState(false)

  const verified = driver?.status === 'verified'
  const { position } = useWatchPosition(Boolean(verified && driver?.is_online))
  const { booking: active } = useActiveBooking({ driverId: driver?.id, enabled: verified })

  const pushPresence = useCallback(
    async (online: boolean) => {
      if (!driver) return
      const lat = position?.lat ?? driver.last_lat
      const lng = position?.lng ?? driver.last_lng
      if (!isOnline()) return
      await supabase.rpc('set_driver_presence', {
        p_is_online: online,
        p_lat: lat ?? null,
        p_lng: lng ?? null,
      })
    },
    [driver, position],
  )

  // Publish position on an interval while online.
  useEffect(() => {
    if (!verified || !driver?.is_online) return
    void pushPresence(true)
    const timer = window.setInterval(() => void pushPresence(true), 15000)
    return () => window.clearInterval(timer)
  }, [verified, driver?.is_online, pushPresence])

  const loadRequests = useCallback(async () => {
    if (!verified || !vehicle) {
      setRequests([])
      return
    }
    setRequestsLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('status', 'requested')
      .eq('vehicle_type', vehicle.type)
      .order('requested_at', { ascending: true })
      .limit(20)
    setRequests(data ?? [])
    setRequestsLoading(false)
  }, [verified, vehicle])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  useTableSubscription({
    table: 'bookings',
    enabled: Boolean(verified && vehicle),
    onChange: loadRequests,
  })

  const withDistance = useMemo(() => {
    const from = position
      ? { lat: position.lat, lng: position.lng }
      : driver?.last_lat != null && driver.last_lng != null
        ? { lat: driver.last_lat, lng: driver.last_lng }
        : null

    return requests.map((request) => {
      const pickup =
        request.origin_lat != null && request.origin_lng != null
          ? { lat: request.origin_lat, lng: request.origin_lng }
          : null
      const distanceKm = from && pickup ? haversineKm(from, pickup) : null
      return { request, distanceKm }
    })
  }, [requests, position, driver])

  async function toggleOnline() {
    setPresenceBusy(true)
    setError(null)
    const next = !driver?.is_online
    await pushPresence(next)
    await refresh()
    setPresenceBusy(false)
  }

  async function accept(bookingId: string) {
    setAcceptingId(bookingId)
    setError(null)
    const { error: rpcError } = await supabase.rpc('accept_booking', { p_booking_id: bookingId })
    setAcceptingId(null)
    if (rpcError) {
      setError(rpcError.message)
      await loadRequests()
      return
    }
    navigate('/driver/trip')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8 text-brand-700" />
      </div>
    )
  }

  if (!driver) return <DriverOnboarding />
  if (driver.status === 'suspended') return <DriverSuspended />
  if (driver.status === 'pending') return <DriverPending />

  return (
    <div className="space-y-4">
      <PageHeader
        title="Driver dashboard"
        subtitle={profile?.full_name ? `${profile.full_name} · ${vehicle ? VEHICLE_LABELS[vehicle.type] : ''}` : undefined}
        action={
          <StatusPill tone={driver.is_online ? 'good' : 'muted'}>
            {driver.is_online ? 'Online' : 'Offline'}
          </StatusPill>
        }
      />

      {error && <Alert tone="bad">{error}</Alert>}

      {active && (
        <Card className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Active ride</p>
          <p className="font-semibold text-slate-900">
            {active.origin_label ?? 'Pickup'} → {active.dest_label ?? 'Dropoff'}
          </p>
          <Button block onClick={() => navigate('/driver/trip')}>
            Open trip {shortId(active.id)}
          </Button>
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-900">Go online</p>
            <p className="text-xs text-slate-500">
              Stop doing tuyok-tuyok. The app sends ride requests to you.
            </p>
          </div>
          <Button
            variant={driver.is_online ? 'secondary' : 'primary'}
            loading={presenceBusy}
            onClick={() => void toggleOnline()}
          >
            {driver.is_online ? 'Go offline' : 'Go online'}
          </Button>
        </div>
        {position && (
          <p className="text-xs text-slate-500">
            Location sharing is active. Accuracy about {Math.round(position.accuracy)} m.
          </p>
        )}
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Ride requests
          </h2>
          {requestsLoading && <Spinner className="size-4 text-slate-400" />}
        </div>

        {!driver.is_online ? (
          <EmptyState title="You are offline" description="Go online to receive ride requests." />
        ) : withDistance.length === 0 ? (
          <EmptyState
            title="No requests right now"
            description="Stay online. Requests for your vehicle type will show up here."
          />
        ) : (
          <ul className="space-y-3">
            {withDistance.map(({ request, distanceKm }) => (
              <Card as="li" key={request.id} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {request.origin_label ?? 'Pickup'} → {request.dest_label ?? 'Dropoff'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Requested {formatRelative(request.requested_at)} · {shortId(request.id)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {distanceKm != null
                        ? `~${formatDistanceKm(Number(distanceKm.toFixed(2)))} away · about ${etaMinutes(distanceKm)} min`
                        : 'Distance unknown — location off'}
                      {request.has_luggage ? ' · with luggage' : ''}
                      {request.discount_type ? ` · ${request.discount_type} discount` : ''}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-slate-900">{formatPeso(request.fare)}</p>
                </div>
                <Button block loading={acceptingId === request.id} onClick={() => void accept(request.id)}>
                  Accept this ride
                </Button>
              </Card>
            ))}
          </ul>
        )}
      </div>

      <Card>
        <p className="text-xs text-slate-500">
          {vehicle
            ? `Your unit: ${vehicle.type === 'tuktuk' || vehicle.type === 'baobao' ? TUKTUK_CLASS_LABEL : VEHICLE_LABELS[vehicle.type]} · Unit ${vehicle.unit_no ?? '—'} · Plate ${vehicle.plate_no ?? '—'}`
            : 'No vehicle on record.'}
        </p>
      </Card>
    </div>
  )
}
