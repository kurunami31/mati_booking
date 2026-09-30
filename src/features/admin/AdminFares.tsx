import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useReferenceData } from '../../hooks/useReferenceData'
import { VEHICLE_LABELS } from '../../lib/constants'
import { formatPeso } from '../../lib/format'
import type { AppSettingRow, FareMatrixRow, VehicleType } from '../../types/db'
import { Alert, Button, Card, Field, Input, PageHeader, Select, Spinner } from '../../components/UI'

interface EditableRow extends FareMatrixRow {
  draftFare: string
}

const SETTING_KEYS = ['base_fare', 'per_km_rate', 'commission_rate', 'discount_rate'] as const

export function AdminFares() {
  const { zones, matrix, settings, loading, reload } = useReferenceData()
  const [rows, setRows] = useState<EditableRow[]>([])
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newOrigin, setNewOrigin] = useState('')
  const [newDest, setNewDest] = useState('')
  const [newType, setNewType] = useState<VehicleType>('tricycle')
  const [newFare, setNewFare] = useState('')

  const zoneName = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones])

  useEffect(() => {
    setRows(matrix.map((m) => ({ ...m, draftFare: String(Number(m.fare)) })))
  }, [matrix])

  useEffect(() => {
    const draft: Record<string, string> = {}
    for (const key of SETTING_KEYS) {
      const row = settings.find((s) => s.key === key)
      draft[key] = row ? String(typeof row.value === 'number' ? row.value : Number(row.value)) : ''
    }
    setSettingsDraft(draft)
  }, [settings])

  const updateDraft = useCallback((id: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, draftFare: value } : r)))
  }, [])

  async function saveMatrix() {
    setBusy(true)
    setError(null)
    setNotice(null)
    const changed = rows.filter((r) => Number(r.draftFare) !== Number(r.fare))
    for (const row of changed) {
      const fare = Number(row.draftFare)
      if (!Number.isFinite(fare) || fare < 0) {
        setError(`Invalid fare for ${zoneName.get(row.origin_zone)} → ${zoneName.get(row.dest_zone)}`)
        setBusy(false)
        return
      }
      const { error: updateError } = await supabase.from('fare_matrix').update({ fare }).eq('id', row.id)
      if (updateError) {
        setError(updateError.message)
        setBusy(false)
        return
      }
    }
    setBusy(false)
    setNotice(`${changed.length} fare${changed.length === 1 ? '' : 's'} saved.`)
    await reload()
  }

  async function saveSettings() {
    setBusy(true)
    setError(null)
    setNotice(null)
    for (const key of SETTING_KEYS) {
      const raw = settingsDraft[key]
      if (raw === '' || raw == null) continue
      const numeric = Number(raw)
      if (!Number.isFinite(numeric)) {
        setError(`Invalid value for ${key}`)
        setBusy(false)
        return
      }
      const { error: updateError } = await supabase
        .from('app_settings')
        .update({ value: numeric as AppSettingRow['value'], updated_at: new Date().toISOString() })
        .eq('key', key)
      if (updateError) {
        setError(updateError.message)
        setBusy(false)
        return
      }
    }
    setBusy(false)
    setNotice('Settings saved.')
    await reload()
  }

  async function addPair() {
    if (!newOrigin || !newDest) {
      setError('Choose an origin and a destination zone.')
      return
    }
    const fare = Number(newFare)
    if (!Number.isFinite(fare) || fare < 0) {
      setError('Enter a valid fare.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error: insertError } = await supabase.from('fare_matrix').insert({
      origin_zone: newOrigin,
      dest_zone: newDest,
      vehicle_type: newType,
      fare,
    })
    setBusy(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewFare('')
    setNotice('Fare pair added.')
    await reload()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8 text-brand-700" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fare matrix & settings"
        subtitle="Values must match the LGU-approved matrix. [VERIFY ordinance and rates]"
      />

      {error && <Alert tone="bad">{error}</Alert>}
      {notice && <Alert tone="good">{notice}</Alert>}

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Platform settings</p>
        <div className="grid grid-cols-2 gap-3">
          {SETTING_KEYS.map((key) => (
            <Field key={key} label={key.replace(/_/g, ' ')} htmlFor={`setting-${key}`}>
              <Input
                id={`setting-${key}`}
                type="number"
                step="0.01"
                min="0"
                value={settingsDraft[key] ?? ''}
                onChange={(e) => setSettingsDraft((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        <Button block loading={busy} onClick={() => void saveSettings()}>
          Save settings
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Add a fare pair</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From zone" htmlFor="newOrigin">
            <Select id="newOrigin" value={newOrigin} onChange={(e) => setNewOrigin(e.target.value)}>
              <option value="">Select</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To zone" htmlFor="newDest">
            <Select id="newDest" value={newDest} onChange={(e) => setNewDest(e.target.value)}>
              <option value="">Select</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vehicle type" htmlFor="newType">
            <Select id="newType" value={newType} onChange={(e) => setNewType(e.target.value as VehicleType)}>
              <option value="tricycle">{VEHICLE_LABELS.tricycle}</option>
              <option value="tuktuk">{VEHICLE_LABELS.tuktuk}</option>
              <option value="baobao">{VEHICLE_LABELS.baobao}</option>
            </Select>
          </Field>
          <Field label="Fare (PHP)" htmlFor="newFare">
            <Input id="newFare" type="number" min="0" value={newFare} onChange={(e) => setNewFare(e.target.value)} />
          </Field>
        </div>
        <Button variant="secondary" block loading={busy} onClick={() => void addPair()}>
          Add fare pair
        </Button>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Existing fares</p>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No fare rows yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="py-1">Route</th>
                  <th className="py-1">Vehicle</th>
                  <th className="py-1 text-right">Fare</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 pr-2 text-slate-700">
                      {zoneName.get(row.origin_zone) ?? row.origin_zone} → {zoneName.get(row.dest_zone) ?? row.dest_zone}
                    </td>
                    <td className="py-2 pr-2 text-slate-500">{VEHICLE_LABELS[row.vehicle_type]}</td>
                    <td className="py-2 text-right">
                      <Input
                        aria-label={`Fare for ${zoneName.get(row.origin_zone)} to ${zoneName.get(row.dest_zone)}`}
                        type="number"
                        min="0"
                        value={row.draftFare}
                        onChange={(e) => updateDraft(row.id, e.target.value)}
                        className="w-24 text-right"
                      />
                      <span className="ml-1 text-xs text-slate-400">{formatPeso(Number(row.fare))}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button block loading={busy} onClick={() => void saveMatrix()}>
          Save fare changes
        </Button>
      </Card>
    </div>
  )
}
