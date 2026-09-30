import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../stores/auth'
import { useReferenceData } from '../../hooks/useReferenceData'
import { useActiveBooking } from '../../hooks/useActiveBooking'
import { useGeolocation } from '../../hooks/useGeolocation'
import { computeFare, hasMatrixRate } from '../../lib/fare'
import { nearestZone } from '../../lib/geo'
import { enqueue, isOnline } from '../../lib/offline'
import { DISCOUNT_OPTIONS, VEHICLE_OPTIONS } from '../../lib/constants'
import { formatPeso } from '../../lib/format'
import type { DiscountType, VehicleType } from '../../types/db'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatusPill,
} from '../../components/UI'
import { supabase } from '../../lib/supabase'

export function PassengerHome() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { zones, matrix, rates, loading: refLoading, error: refError } = useReferenceData()
  const { position, error: geoError, loading: geoLoading, request: requestLocation } = useGeolocation()
  const { booking: activeBooking } = useActiveBooking({ passengerId: profile?.id })

  const [vehicleType, setVehicleType] = useState<VehicleType>('tricycle')
  const [originZone, setOriginZone] = useState('')
  const [destZone, setDestZone] = useState('')
  const [originLabel, setOriginLabel] = useState('')
  const [discount, setDiscount] = useState<DiscountType | ''>('')
  const [passengerCount, setPassengerCount] = useState(1)
  const [hasLuggage, setHasLuggage] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queued, setQueued] = useState(false)

  // Prefill the origin zone from GPS once.
  const gpsZone = useMemo(() => {
    if (!position || zones.length === 0) return null
    return nearestZone(position, zones)
  }, [position, zones])

  const effectiveOriginZone = originZone || gpsZone?.id || ''
  const origin = useMemo(() => {
    const zone = zones.find((z) => z.id === effectiveOriginZone)
    if (position && gpsZone?.id === effectiveOriginZone) return { lat: position.lat, lng: position.lng }
    return zone ? { lat: zone.centroid_lat, lng: zone.centroid_lng } : null
  }, [zones, effectiveOriginZone, position, gpsZone])

  const dest = useMemo(() => {
    const zone = zones.find((z) => z.id === destZone)
    return zone ? { lat: zone.centroid_lat, lng: zone.centroid_lng } : null
  }, [zones, destZone])

  const fare = useMemo(() => {
    if (!effectiveOriginZone || !destZone) return null
    return computeFare({
      matrix,
      vehicleType,
      originZone: effectiveOriginZone,
      destZone,
      origin,
      dest,
      discountType: discount || null,
      rates,
    })
  }, [matrix, vehicleType, effectiveOriginZone, destZone, origin, dest, discount, rates])

  const approvedRate = hasMatrixRate(matrix, effectiveOriginZone, destZone || null, vehicleType)

  if (activeBooking) {
    return (
      <div className="space-y-4">
        <PageHeader title="You have an active ride" subtitle="Finish or cancel it before booking another." />
        <Button block size="lg" onClick={() => navigate('/trip')}>
          View my ride
        </Button>
      </div>
    )
  }

  async function handleBook() {
    if (!profile) return
    if (!effectiveOriginZone || !destZone) {
      setError('Choose a pickup and a dropoff point.')
      return
    }
    setSubmitting(true)
    setError(null)
    setQueued(false)

    const originZoneRow = zones.find((z) => z.id === effectiveOriginZone)
    const destZoneRow = zones.find((z) => z.id === destZone)
    const payload = {
      p_vehicle_type: vehicleType,
      p_origin_zone: effectiveOriginZone,
      p_dest_zone: destZone,
      p_origin_lat: origin?.lat ?? null,
      p_origin_lng: origin?.lng ?? null,
      p_origin_label: originLabel.trim() || originZoneRow?.name || null,
      p_dest_lat: dest?.lat ?? null,
      p_dest_lng: dest?.lng ?? null,
      p_dest_label: destZoneRow?.name ?? null,
      p_discount_type: discount || null,
      p_passenger_count: passengerCount,
      p_has_luggage: hasLuggage,
    }

    if (!isOnline()) {
      enqueue('request_booking', payload)
      setQueued(true)
      setSubmitting(false)
      return
    }

    const { error: rpcError } = await supabase.rpc('request_booking', payload)
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    navigate('/trip')
  }

  if (refLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8 text-brand-700" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Book a ride" subtitle="Fixed fare is shown before you confirm. Cash on board." />

      {refError && <Alert tone="bad">{refError}</Alert>}
      {queued && (
        <Alert tone="warn">
          No connection. Your booking is saved on this phone and will be sent automatically when
          signal returns.
        </Alert>
      )}
      {error && <Alert tone="bad">{error}</Alert>}

      <Card className="space-y-4">
        <Field label="Vehicle type" htmlFor="vehicle" required>
          <Select
            id="vehicle"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleType)}
          >
            {VEHICLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.hint}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Pickup point"
          htmlFor="origin"
          required
          hint={gpsZone ? `Nearest zone from GPS: ${gpsZone.name} [VERIFY zone boundaries]` : undefined}
        >
          <Select id="origin" value={effectiveOriginZone} onChange={(e) => setOriginZone(e.target.value)}>
            <option value="">Choose a pickup zone</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" loading={geoLoading} onClick={() => void requestLocation()}>
            Use my exact location
          </Button>
          {position && <StatusPill tone="good">GPS locked</StatusPill>}
        </div>
        {geoError && <p className="text-xs text-amber-700">{geoError}</p>}

        <Field label="Pickup note (optional)" htmlFor="originLabel" hint="Example: tapat ng palengke gate.">
          <Input
            id="originLabel"
            value={originLabel}
            onChange={(e) => setOriginLabel(e.target.value)}
            placeholder="Tapat ng palengke, likod ng simbahan…"
          />
        </Field>

        <Field label="Dropoff point" htmlFor="dest" required>
          <Select id="dest" value={destZone} onChange={(e) => setDestZone(e.target.value)}>
            <option value="">Choose a dropoff zone</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="space-y-3">
        <Field label="Discount" htmlFor="discount" hint="ID is checked by the driver on board.">
          <Select
            id="discount"
            value={discount}
            onChange={(e) => setDiscount(e.target.value as DiscountType | '')}
          >
            <option value="">None</option>
            {DISCOUNT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Passengers" htmlFor="pax">
          <Input
            id="pax"
            type="number"
            min={1}
            max={12}
            value={passengerCount}
            onChange={(e) => setPassengerCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
          />
        </Field>

        <Checkbox
          label="I have luggage or market goods (may need a tuk-tuk/bao-bao)"
          checked={hasLuggage}
          onChange={(e) => setHasLuggage(e.target.checked)}
        />
      </Card>

      <Card className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Your fare</p>
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-extrabold text-slate-900">
            {fare == null ? '—' : formatPeso(fare)}
          </span>
          {discount && <StatusPill tone="warn">Discounted</StatusPill>}
        </div>
        {fare != null && !approvedRate && (
          <p className="text-xs text-amber-700">
            No approved fare matrix for this pair yet. Showing a computed fare. [VERIFY with LGU fare
            matrix]
          </p>
        )}
        <p className="text-xs text-slate-500">
          This is the fixed fare. It will not change on the street. Pay the driver in cash, or by
          e-wallet if offered.
        </p>
      </Card>

      <Button block size="lg" onClick={() => void handleBook()} loading={submitting} disabled={fare == null}>
        Confirm booking
      </Button>
    </div>
  )
}
