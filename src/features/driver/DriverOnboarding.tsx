import { useState } from 'react'
import { useAuth } from '../../stores/auth'
import { supabase } from '../../lib/supabase'
import { VEHICLE_OPTIONS } from '../../lib/constants'
import type { VehicleType } from '../../types/db'
import { Alert, Button, Card, Field, Input, PageHeader, Select } from '../../components/UI'

/** Driver onboarding: create the driver record and the vehicle record. */
export function DriverOnboarding() {
  const { profile, refresh } = useAuth()
  const [licenseNo, setLicenseNo] = useState('')
  const [idPhotoUrl, setIdPhotoUrl] = useState('')
  const [vehicleType, setVehicleType] = useState<VehicleType>('tricycle')
  const [unitNo, setUnitNo] = useState('')
  const [plateNo, setPlateNo] = useState('')
  const [franchiseNo, setFranchiseNo] = useState('')
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [vehicleFile, setVehicleFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function uploadPhoto(profileId: string, kind: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${profileId}/${kind}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('driver-photos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) throw uploadError
    return path
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)

    let selfiePath: string | null = null
    let vehiclePath: string | null = null
    try {
      if (selfieFile) selfiePath = await uploadPhoto(profile.id, 'profile', selfieFile)
      if (vehicleFile) vehiclePath = await uploadPhoto(profile.id, 'vehicle', vehicleFile)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo upload failed.')
      setBusy(false)
      return
    }

    const { data: driverRow, error: driverError } = await supabase
      .from('drivers')
      .insert({
        profile_id: profile.id,
        license_no: licenseNo.trim(),
        id_photo_url: idPhotoUrl.trim() || null,
        photo_url: selfiePath,
      })
      .select('id')
      .single()

    if (driverError || !driverRow) {
      setError(driverError?.message ?? 'Could not save your driver record.')
      setBusy(false)
      return
    }

    const { error: vehicleError } = await supabase.from('vehicles').insert({
      driver_id: driverRow.id,
      type: vehicleType,
      unit_no: unitNo.trim() || null,
      plate_no: plateNo.trim() || null,
      franchise_no: franchiseNo.trim() || null,
      photo_url: vehiclePath,
    })

    if (vehicleError) {
      setError(vehicleError.message)
      setBusy(false)
      return
    }

    await refresh()
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Driver onboarding"
        subtitle="Your details are recorded and must be verified by the LGU desk before you can take rides."
      />

      <Alert tone="warn">
        Verification is manual. An admin reviews your license and franchise number against the LGU
        list. Add clear photos below.
      </Alert>

      {error && <Alert tone="bad">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4">
          <Field label="Driver's license number" htmlFor="license" required>
            <Input id="license" required value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} />
          </Field>
          <Field label="ID photo link" htmlFor="idPhoto" hint="Link to your license or a clear photo. [VERIFY storage policy with NPC]">
            <Input
              id="idPhoto"
              type="url"
              value={idPhotoUrl}
              onChange={(e) => setIdPhotoUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </Card>

        <Card className="space-y-4">
          <Field label="Vehicle type" htmlFor="vtype" required>
            <Select id="vtype" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType)}>
              {VEHICLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit / body number" htmlFor="unit">
            <Input id="unit" value={unitNo} onChange={(e) => setUnitNo(e.target.value)} placeholder="e.g. 123" />
          </Field>
          <Field label="Plate number" htmlFor="plate">
            <Input id="plate" value={plateNo} onChange={(e) => setPlateNo(e.target.value)} />
          </Field>
          <Field label="Franchise / registration number" htmlFor="franchise" hint="From your LGU franchise. [VERIFY format]">
            <Input id="franchise" value={franchiseNo} onChange={(e) => setFranchiseNo(e.target.value)} />
          </Field>
          <Field label="Driver selfie" htmlFor="selfie" hint="Shown to passengers during the ride.">
            <input
              id="selfie"
              type="file"
              accept="image/*"
              onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600"
            />
          </Field>
          <Field label="Vehicle photo" htmlFor="vehiclePhoto" hint="Shown to passengers so they can spot your unit.">
            <input
              id="vehiclePhoto"
              type="file"
              accept="image/*"
              onChange={(e) => setVehicleFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600"
            />
          </Field>
        </Card>

        <Button type="submit" block size="lg" loading={busy}>
          Submit for verification
        </Button>
      </form>
    </div>
  )
}

export function DriverPending() {
  const { driver, vehicle, refresh } = useAuth()
  return (
    <div className="space-y-4">
      <PageHeader title="Verification pending" subtitle="The LGU desk has not approved your unit yet." />
      <Alert tone="warn">
        You cannot accept rides until an admin marks your driver record and vehicle as verified.
      </Alert>
      <Card>
        <p className="text-sm text-slate-600">
          License: {driver?.license_no ?? '—'}
          <br />
          Vehicle: {vehicle ? `${vehicle.type} · Unit ${vehicle.unit_no ?? '—'} · Plate ${vehicle.plate_no ?? '—'}` : '—'}
          <br />
          Franchise: {vehicle?.franchise_no ?? '—'}
        </p>
      </Card>
      <Button variant="secondary" block onClick={() => void refresh()}>
        Check status again
      </Button>
    </div>
  )
}

export function DriverSuspended() {
  return (
    <div className="space-y-4">
      <PageHeader title="Account suspended" subtitle="Your driver account is on hold." />
      <Alert tone="bad">
        Contact the LGU desk or the operator to resolve this. Suspended accounts cannot go online.
      </Alert>
    </div>
  )
}
