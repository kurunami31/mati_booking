import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../stores/auth'
import { supabase } from '../../lib/supabase'
import { useActiveBooking } from '../../hooks/useActiveBooking'
import { useBookingDetails } from '../../hooks/useBookingDetails'
import { getCurrentPosition } from '../../lib/geo'
import { enqueue, isOnline } from '../../lib/offline'
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TONE,
  DRIVER_CANCEL_REASONS,
  NO_SHOW_WAIT_MINUTES,
  VEHICLE_LABELS,
} from '../../lib/constants'
import { formatPeso, formatDistanceKm, minutesSince, shortId } from '../../lib/format'
import type { BookingStatus, PaymentRow } from '../../types/db'
import { Alert, Button, Card, Field, PageHeader, Select, Spinner, StatusPill, Textarea } from '../../components/UI'
import { MapView } from '../../components/MapView'
import { SOSButton } from '../../components/SOSButton'

export function DriverActiveTrip() {
  const { driver, session } = useAuth()
  const navigate = useNavigate()
  const { booking, loading } = useActiveBooking({ driverId: driver?.id, enabled: Boolean(driver) })
  const [lastId, setLastId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState<string>(DRIVER_CANCEL_REASONS[0])
  const [cancelNote, setCancelNote] = useState('')
  const [payment, setPayment] = useState<PaymentRow | null>(null)
  const [sosSent, setSosSent] = useState(false)

  useEffect(() => {
    if (booking) setLastId(booking.id)
  }, [booking])

  const targetId = booking?.id ?? lastId
  const { details, loading: detailsLoading } = useBookingDetails(targetId)

  const loadPayment = useCallback(async () => {
    if (!targetId) return
    const { data } = await supabase.from('payments').select('*').eq('booking_id', targetId).maybeSingle()
    setPayment(data ?? null)
  }, [targetId])

  useEffect(() => {
    void loadPayment()
  }, [loadPayment])

  const transition = useCallback(
    async (to: BookingStatus, note?: string | null) => {
      if (!targetId) return
      setBusy(true)
      setError(null)
      if (!isOnline()) {
        enqueue('transition_booking', { p_booking_id: targetId, p_to: to, p_note: note ?? null })
        setBusy(false)
        setError('No connection. The action is saved and will send when signal returns.')
        return
      }
      const { error: rpcError } = await supabase.rpc('transition_booking', {
        p_booking_id: targetId,
        p_to: to,
        p_note: note ?? null,
      })
      setBusy(false)
      if (rpcError) {
        setError(rpcError.message)
        return
      }
      await loadPayment()
    },
    [targetId, loadPayment],
  )

  async function collected() {
    if (!targetId) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('mark_payment', {
      p_booking_id: targetId,
      p_status: 'collected',
    })
    setBusy(false)
    if (rpcError) setError(rpcError.message)
    else await loadPayment()
  }

  async function sendSos() {
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
    const { error: insertError } = await supabase.from('sos_alerts').insert(payload)
    if (insertError) throw insertError
    setSosSent(true)
  }

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
        <PageHeader title="No active trip" subtitle="Accepted rides appear here." />
        <Button block size="lg" onClick={() => navigate('/driver')}>
          Back to dashboard
        </Button>
      </div>
    )
  }

  const { booking: b, driverProfile, passengerProfile } = details
  const waitMinutes = minutesSince(b.arrived_at ?? b.assigned_at)
  const canNoShow = (b.status === 'assigned' || b.status === 'arrived') && (waitMinutes ?? 0) >= NO_SHOW_WAIT_MINUTES
  const markers = []
  if (b.origin_lat != null && b.origin_lng != null) {
    markers.push({ id: 'origin', lat: b.origin_lat, lng: b.origin_lng, label: `Pickup: ${b.origin_label ?? ''}`, kind: 'pickup' as const })
  }
  if (b.dest_lat != null && b.dest_lng != null) {
    markers.push({ id: 'dest', lat: b.dest_lat, lng: b.dest_lng, label: `Dropoff: ${b.dest_label ?? ''}`, kind: 'dropoff' as const })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={BOOKING_STATUS_LABELS[b.status]}
        subtitle={`Trip ${shortId(b.id)} · ${VEHICLE_LABELS[b.vehicle_type]}`}
        action={<StatusPill tone={BOOKING_STATUS_TONE[b.status]}>{b.status}</StatusPill>}
      />

      {error && <Alert tone="warn">{error}</Alert>}

      <MapView markers={markers} center={markers[0]} />

      <Card className="space-y-1">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Passenger</p>
        <p className="text-lg font-bold text-slate-900">{passengerProfile?.full_name || 'Passenger'}</p>
        <p className="text-sm text-slate-600">
          {b.passenger_count} passenger{b.passenger_count > 1 ? 's' : ''}
          {b.has_luggage ? ' · with luggage or market goods' : ''}
        </p>
        <p className="text-xs text-slate-500">
          Pickup: {b.origin_label ?? 'point'} · Dropoff: {b.dest_label ?? 'point'}
          {b.distance_km ? ` · ${formatDistanceKm(Number(b.distance_km))}` : ''}
        </p>
      </Card>

      <Card className="flex items-center justify-between">
        <span className="text-sm text-slate-500">Fixed fare to collect</span>
        <span className="text-2xl font-extrabold text-slate-900">{formatPeso(b.fare)}</span>
      </Card>

      {['assigned', 'arrived', 'in_progress'].includes(b.status) && (
        <Card>
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Driver safety
          </p>
          <SOSButton onActivate={sendSos} disabled={sosSent} label="Hold for driver SOS" />
        </Card>
      )}

      <div className="space-y-2">
        {b.status === 'assigned' && (
          <Button block size="lg" loading={busy} onClick={() => void transition('arrived')}>
            I have arrived at pickup
          </Button>
        )}
        {b.status === 'arrived' && (
          <Button block size="lg" loading={busy} onClick={() => void transition('in_progress')}>
            Start trip
          </Button>
        )}
        {b.status === 'in_progress' && (
          <Button block size="lg" loading={busy} onClick={() => void transition('completed')}>
            Complete trip
          </Button>
        )}

        {b.status === 'completed' && (
          <Card className="space-y-3">
            <p className="font-semibold text-slate-800">
              {payment?.status === 'paid'
                ? `Paid via ${payment.provider ?? 'e-wallet'}`
                : payment?.status === 'collected'
                  ? 'Cash collected'
                  : 'Collect cash from passenger'}
            </p>
            {payment && (
              <p className="text-sm text-slate-600">
                Fare {formatPeso(Number(payment.amount))} · commission {formatPeso(Number(payment.commission))} · your net{' '}
                <strong>{formatPeso(Number(payment.driver_net))}</strong>
              </p>
            )}
            <div className="flex gap-2">
              {payment?.status !== 'collected' && payment?.status !== 'paid' && (
                <Button block loading={busy} onClick={() => void collected()}>
                  Mark cash collected
                </Button>
              )}
              <Button variant="secondary" block onClick={() => navigate('/driver')}>
                Back to dashboard
              </Button>
            </div>
          </Card>
        )}

        {canNoShow && (
          <Button
            variant="danger"
            block
            loading={busy}
            onClick={() => void transition('no_show', `Waited ${NO_SHOW_WAIT_MINUTES} minutes`)}
          >
            Passenger did not show (waited {NO_SHOW_WAIT_MINUTES} min)
          </Button>
        )}

        {['assigned', 'arrived'].includes(b.status) &&
          (!showCancel ? (
            <Button variant="ghost" block onClick={() => setShowCancel(true)}>
              Cancel this ride
            </Button>
          ) : (
            <Card className="space-y-3">
              <Field label="Reason" htmlFor="cancelReason">
                <Select id="cancelReason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
                  {DRIVER_CANCEL_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes (optional)" htmlFor="cancelNote">
                <Textarea id="cancelNote" value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  block
                  loading={busy}
                  onClick={() => void transition('cancelled', `${cancelReason}${cancelNote ? ` — ${cancelNote}` : ''}`)}
                >
                  Confirm cancel
                </Button>
                <Button variant="ghost" block onClick={() => setShowCancel(false)}>
                  Keep ride
                </Button>
              </div>
            </Card>
          ))}
      </div>

      <p className="text-center text-xs text-slate-400">
        Driver on record: {driverProfile?.full_name || '—'}
      </p>
    </div>
  )
}
