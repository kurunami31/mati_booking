import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTableSubscription } from '../../hooks/useRealtime'
import { SOS_STATUS_LABELS } from '../../lib/constants'
import { formatDateTime, formatRelative, shortId } from '../../lib/format'
import type { SosAlertRow, SosStatus } from '../../types/db'
import { Alert, Button, Card, EmptyState, PageHeader, Spinner, StatusPill } from '../../components/UI'
import { MapView } from '../../components/MapView'

function isoNow(): string {
  return new Date().toISOString()
}

export function AdminSOS() {
  const [alerts, setAlerts] = useState<SosAlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('sos_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setAlerts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useTableSubscription({ table: 'sos_alerts', onChange: load })

  async function update(alert: SosAlertRow, status: SosStatus) {
    setBusyId(alert.id)
    setError(null)
    const patch: Partial<SosAlertRow> = { status }
    if (status === 'acknowledged') patch.acknowledged_at = isoNow()
    if (status === 'closed_false_alarm' || status === 'closed_resolved') patch.closed_at = isoNow()

    const { error: updateError } = await supabase.from('sos_alerts').update(patch).eq('id', alert.id)
    setBusyId(null)
    if (updateError) setError(updateError.message)
    else await load()
  }

  const open = alerts.filter((a) => a.status === 'open')
  const markers = alerts
    .filter((a) => a.lat != null && a.lng != null && a.status !== 'closed_false_alarm' && a.status !== 'closed_resolved')
    .map((a) => ({ id: a.id, lat: a.lat as number, lng: a.lng as number, label: `SOS ${shortId(a.id)}`, kind: 'sos' as const }))

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8 text-brand-700" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Emergency response" subtitle="SOS alerts raised by passengers and drivers." />

      <Alert tone="warn">
        Who actually receives this alert and the response protocol must be confirmed with PNP Mati,
        MDRRMO, and 911 before a pilot. The app logs the alert; it does not guarantee a response time.
        [VERIFY]
      </Alert>

      {error && <Alert tone="bad">{error}</Alert>}

      {markers.length > 0 && <MapView markers={markers} zoom={13} />}

      {open.length > 0 && (
        <Card className="border-sos-500 bg-rose-50">
          <p className="font-semibold text-rose-800">{open.length} open alert{open.length > 1 ? 's' : ''} need action</p>
        </Card>
      )}

      {alerts.length === 0 ? (
        <EmptyState title="No SOS alerts" description="Alerts raised during trips appear here." />
      ) : (
        <ul className="space-y-3">
          {alerts.map((alert) => (
            <Card as="li" key={alert.id} className={alert.status === 'open' ? 'border-sos-500' : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">SOS {shortId(alert.id)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(alert.created_at)} · {formatRelative(alert.created_at)}
                    {alert.booking_id ? ` · trip ${shortId(alert.booking_id)}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {alert.lat != null && alert.lng != null
                      ? `Location ${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}`
                      : 'No location captured — likely a signal dead zone'}
                  </p>
                  {alert.acknowledged_at && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Acknowledged {formatRelative(alert.acknowledged_at)}
                    </p>
                  )}
                </div>
                <StatusPill tone={alert.status === 'open' ? 'bad' : alert.status === 'acknowledged' ? 'warn' : 'muted'}>
                  {SOS_STATUS_LABELS[alert.status]}
                </StatusPill>
              </div>

              {alert.status === 'open' && (
                <div className="mt-3 flex gap-2">
                  <Button block loading={busyId === alert.id} onClick={() => void update(alert, 'acknowledged')}>
                    Acknowledge
                  </Button>
                </div>
              )}
              {alert.status === 'acknowledged' && (
                <div className="mt-3 flex gap-2">
                  <Button block loading={busyId === alert.id} onClick={() => void update(alert, 'closed_resolved')}>
                    Close — resolved
                  </Button>
                  <Button
                    variant="secondary"
                    block
                    loading={busyId === alert.id}
                    onClick={() => void update(alert, 'closed_false_alarm')}
                  >
                    False alarm
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}
    </div>
  )
}
