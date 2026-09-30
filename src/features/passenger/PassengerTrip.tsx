import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../stores/auth'
import { useActiveBooking } from '../../hooks/useActiveBooking'
import { useBookingDetails } from '../../hooks/useBookingDetails'
import { useTableSubscription } from '../../hooks/useRealtime'
import { supabase } from '../../lib/supabase'
import { getCurrentPosition } from '../../lib/geo'
import { enqueue, isOnline } from '../../lib/offline'
import { VEHICLE_LABELS, BOOKING_STATUS_LABELS, BOOKING_STATUS_TONE } from '../../lib/constants'
import { formatPeso, formatDistanceKm, shortId } from '../../lib/format'
import { PageHeader, Button, Card, Spinner, StatusPill, Alert, Field, Textarea } from '../../components/UI'
import { MapView } from '../../components/MapView'
import { SOSButton } from '../../components/SOSButton'

export function PassengerTrip() {
  const { profile, session } = useAuth()
  const navigate = useNavigate()
  const { booking, loading } = useActiveBooking({ passengerId: profile?.id })
  const [lastBookingId, setLastBookingId] = useState<string | null>(null)
  const [sosSent, setSosSent] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stars, setStars] = useState(5)
  const [comment, setComment] = useState('')
  const [rated, setRated] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  useEffect(() => {
    if (booking) setLastBookingId(booking.id)
  }, [booking])

  const targetId = booking?.id ?? lastBookingId
  const { details, loading: detailsLoading } = useBookingDetails(targetId)

  // Keep the driver's position fresh while they are on the way.
  useTableSubscription({
    table: 'drivers',
    enabled: Boolean(details?.driver?.id),
    filter: details?.driver?.id ? `id=eq.${details.driver.id}` : undefined,
    onChange: () => {},
  })

  const runTransition = useCallback(
    async (to: 'cancelled', note?: string) => {
      if (!targetId) return
      setBusy(true)
      setActionError(null)
      if (!isOnline()) {
        enqueue('transition_booking', { p_booking_id: targetId, p_to: to, p_note: note ?? null })
        setBusy(false)
        setActionError('No connection. The action is saved and will send when signal returns.')
        return
      }
      const { error } = await supabase.rpc('transition_booking', {
        p_booking_id: targetId,
        p_to: to,
        p_note: note ?? null,
      })
      setBusy(false)
      if (error) setActionError(error.message)
    },
    [targetId],
  )

  const sendSos = useCallback(async () => {
    if (!targetId || !session) return
    const position = await getCurrentPosition().catch(() => null)
    const payload = {
      booking_id: targetId,
      triggered_by: session.user.id,
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      status: 'open' as const,
    }

    if (!isOnline()) {
      enqueue('sos_alert', payload)
      setSosSent(true)
      return
    }

    const { error } = await supabase.from('sos_alerts').insert(payload)
    if (error) throw error
    setSosSent(true)
  }, [targetId, session])

  const submitRating = useCallback(async () => {
    if (!targetId || !session) return
    setBusy(true)
    setActionError(null)
    const { error } = await supabase.from('ratings').insert({
      booking_id: targetId,
      rater_role: 'passenger',
      rater_id: session.user.id,
      stars,
      comment: comment.trim() || null,
    })
    setBusy(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setRated(true)
  }, [targetId, session, stars, comment])

  const markers = useMemo(() => {
    if (!details) return []
    const list = []
    if (details.booking.origin_lat != null && details.booking.origin_lng != null) {
      list.push({
        id: 'origin',
        lat: details.booking.origin_lat,
        lng: details.booking.origin_lng,
        label: `Pickup: ${details.booking.origin_label ?? 'point'}`,
        kind: 'pickup' as const,
      })
    }
    if (details.booking.dest_lat != null && details.booking.dest_lng != null) {
      list.push({
        id: 'dest',
        lat: details.booking.dest_lat,
        lng: details.booking.dest_lng,
        label: `Dropoff: ${details.booking.dest_label ?? 'point'}`,
        kind: 'dropoff' as const,
      })
    }
    if (details.driver?.last_lat != null && details.driver.last_lng != null) {
      list.push({
        id: 'driver',
        lat: details.driver.last_lat,
        lng: details.driver.last_lng,
        label: `Driver ${details.driverProfile?.full_name ?? ''}`,
        kind: 'driver' as const,
      })
    }
    return list
  }, [details])

  if (loading || detailsLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8 text-brand-700" />
      </div>
    )
  }

  if (!details) {
    return (
      <div className="space-y-4">
        <PageHeader title="No active ride" subtitle="Book a tricycle or tuk-tuk/bao-bao to get started." />
        <Button block size="lg" onClick={() => navigate('/')}>
          Book a ride
        </Button>
      </div>
    )
  }

  const { booking: b, driver, driverProfile, vehicle } = details
  const isFinished = b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show'
  const canSos = ['assigned', 'arrived', 'in_progress'].includes(b.status)

  return (
    <div className="space-y-4">
      <PageHeader
        title={BOOKING_STATUS_LABELS[b.status]}
        subtitle={`Trip ${shortId(b.id)} · ${VEHICLE_LABELS[b.vehicle_type]}`}
        action={<StatusPill tone={BOOKING_STATUS_TONE[b.status]}>{b.status}</StatusPill>}
      />

      {actionError && <Alert tone="warn">{actionError}</Alert>}

      <MapView markers={markers} center={markers[0]} respectLowData />

      {!isFinished && (
        <Card className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Fixed fare</span>
            <span className="text-2xl font-extrabold text-slate-900">{formatPeso(b.fare)}</span>
          </div>
          <p className="text-xs text-slate-500">
            {b.distance_km ? `${formatDistanceKm(Number(b.distance_km))} · ` : ''}
            {b.passenger_count} passenger{b.passenger_count > 1 ? 's' : ''}
            {b.has_luggage ? ' · with luggage' : ''}
            {b.discount_type ? ` · ${b.discount_type} discount` : ''}
          </p>
        </Card>
      )}

      {driver && (
        <Card>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Your driver</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{driverProfile?.full_name || 'Driver'}</p>
          <p className="text-sm text-slate-600">
            {vehicle ? `${VEHICLE_LABELS[vehicle.type]} · Unit ${vehicle.unit_no ?? '—'} · Plate ${vehicle.plate_no ?? '—'}` : 'Vehicle details pending'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {driver.rating ? `Rating ${Number(driver.rating).toFixed(1)} (${driver.rating_count})` : 'No ratings yet'}
            {driver.license_no ? ` · License ${driver.license_no}` : ''}
          </p>
        </Card>
      )}

      {b.status === 'requested' && (
        <Alert tone="warn">
          Waiting for a nearby driver to accept. Drivers online now get this request. Keep this screen
          open if you can.
        </Alert>
      )}

      {canSos && (
        <Card>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Emergency
          </p>
          <SOSButton onActivate={sendSos} disabled={sosSent} />
        </Card>
      )}

      {!isFinished && (
        <div className="space-y-2">
          {!showCancel ? (
            <Button variant="secondary" block onClick={() => setShowCancel(true)}>
              Cancel ride
            </Button>
          ) : (
            <Card className="space-y-3">
              <Field label="Reason for cancelling" htmlFor="cancelReason">
                <Textarea
                  id="cancelReason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Example: nauna na akong nakasakay, nagbago ang plano…"
                />
              </Field>
              <div className="flex gap-2">
                <Button variant="danger" block loading={busy} onClick={() => void runTransition('cancelled', cancelReason)}>
                  Confirm cancel
                </Button>
                <Button variant="ghost" block onClick={() => setShowCancel(false)}>
                  Keep ride
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {b.status === 'completed' && (
        <Card className="space-y-3">
          {rated ? (
            <Alert tone="good">Thanks. Your rating was recorded.</Alert>
          ) : (
            <>
              <p className="font-semibold text-slate-800">Rate your driver</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    className={
                      'size-11 rounded-xl border text-lg font-bold ' +
                      (stars >= n
                        ? 'border-amber-400 bg-amber-100 text-amber-800'
                        : 'border-slate-300 bg-white text-slate-400')
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional comment"
              />
              <Button block loading={busy} onClick={() => void submitRating()}>
                Submit rating
              </Button>
            </>
          )}
          <Button variant="secondary" block onClick={() => navigate('/')}>
            Book another ride
          </Button>
        </Card>
      )}

      {(b.status === 'cancelled' || b.status === 'no_show') && (
        <div className="space-y-2">
          <Alert tone="muted">
            {b.cancel_reason ? `Reason: ${b.cancel_reason}` : 'This trip was closed.'}
          </Alert>
          <Button block onClick={() => navigate('/')}>
            Book another ride
          </Button>
        </div>
      )}
    </div>
  )
}
