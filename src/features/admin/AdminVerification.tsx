import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTableSubscription } from '../../hooks/useRealtime'
import { VEHICLE_LABELS } from '../../lib/constants'
import { formatDateTime, shortId } from '../../lib/format'
import type { DriverRow, ProfileRow, VehicleRow } from '../../types/db'
import { Alert, Button, Card, EmptyState, PageHeader, Spinner, StatusPill } from '../../components/UI'

interface Candidate {
  driver: DriverRow
  vehicle: VehicleRow | null
  profile: ProfileRow | null
}

const FILTERS = ['pending', 'verified', 'suspended'] as const
type Filter = (typeof FILTERS)[number]

export function AdminVerification() {
  const [filter, setFilter] = useState<Filter>('pending')
  const [rows, setRows] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: drivers } = await supabase
      .from('drivers')
      .select('*')
      .eq('status', filter)
      .order('created_at', { ascending: false })

    const list = drivers ?? []
    if (list.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    const [vehiclesRes, profilesRes] = await Promise.all([
      supabase.from('vehicles').select('*').in('driver_id', list.map((d) => d.id)),
      supabase.from('profiles').select('*').in('id', list.map((d) => d.profile_id)),
    ])

    const vehicleByDriver = new Map((vehiclesRes.data ?? []).map((v) => [v.driver_id, v]))
    const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]))

    setRows(
      list.map((driver) => ({
        driver,
        vehicle: vehicleByDriver.get(driver.id) ?? null,
        profile: profileById.get(driver.profile_id) ?? null,
      })),
    )
    setLoading(false)
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  useTableSubscription({ table: 'drivers', onChange: load })

  async function setStatus(driverId: string, vehicleId: string | null, status: 'verified' | 'suspended') {
    setBusyId(driverId)
    setError(null)

    const { error: driverError } = await supabase
      .from('drivers')
      .update({ status })
      .eq('id', driverId)
    if (driverError) {
      setError(driverError.message)
      setBusyId(null)
      return
    }

    if (vehicleId) {
      const { error: vehicleError } = await supabase
        .from('vehicles')
        .update({ verified: status === 'verified' })
        .eq('id', vehicleId)
      if (vehicleError) setError(vehicleError.message)
    }

    setBusyId(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Driver & vehicle verification"
        subtitle="Check the license and franchise number against the LGU list before approving."
      />

      <Alert tone="warn">
        Photo and ID checks are manual. This MVP records a link only. [VERIFY document requirements
        and retention with the LGU and NPC]
      </Alert>

      {error && <Alert tone="bad">{error}</Alert>}

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              'min-h-9 flex-1 rounded-lg text-sm font-semibold capitalize ' +
              (filter === f ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500')
            }
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-7 text-brand-700" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={`No ${filter} drivers`} />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ driver, vehicle, profile }) => (
            <Card as="li" key={driver.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{profile?.full_name || 'Unnamed driver'}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {shortId(driver.id)} · applied {formatDateTime(driver.created_at)}
                  </p>
                </div>
                <StatusPill tone={driver.status === 'verified' ? 'good' : driver.status === 'suspended' ? 'bad' : 'warn'}>
                  {driver.status}
                </StatusPill>
              </div>

              <dl className="grid grid-cols-2 gap-1 text-xs text-slate-600">
                <dt className="text-slate-400">License</dt>
                <dd>{driver.license_no ?? '—'}</dd>
                <dt className="text-slate-400">Vehicle</dt>
                <dd>{vehicle ? VEHICLE_LABELS[vehicle.type] : '—'}</dd>
                <dt className="text-slate-400">Unit / Plate</dt>
                <dd>
                  {vehicle?.unit_no ?? '—'} / {vehicle?.plate_no ?? '—'}
                </dd>
                <dt className="text-slate-400">Franchise</dt>
                <dd>{vehicle?.franchise_no ?? '—'}</dd>
                {driver.id_photo_url && (
                  <>
                    <dt className="text-slate-400">ID photo</dt>
                    <dd>
                      <a className="text-brand-700 underline" href={driver.id_photo_url} target="_blank" rel="noreferrer">
                        Open link
                      </a>
                    </dd>
                  </>
                )}
              </dl>

              <div className="flex gap-2">
                <Button
                  block
                  loading={busyId === driver.id}
                  onClick={() => void setStatus(driver.id, vehicle?.id ?? null, 'verified')}
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  block
                  loading={busyId === driver.id}
                  onClick={() => void setStatus(driver.id, vehicle?.id ?? null, 'suspended')}
                >
                  Suspend
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  )
}
