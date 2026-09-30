import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTableSubscription } from '../../hooks/useRealtime'
import { VEHICLE_LABELS } from '../../lib/constants'
import { formatDateTime, formatPeso, shortId } from '../../lib/format'
import type { BookingRow, PaymentRow } from '../../types/db'
import { Button, Card, EmptyState, PageHeader, Spinner, Stat, StatusPill } from '../../components/UI'

interface ReportRow {
  booking: BookingRow
  payment: PaymentRow | null
}

function toCsv(rows: ReportRow[]): string {
  const header = [
    'trip_id',
    'requested_at',
    'completed_at',
    'vehicle_type',
    'origin',
    'dropoff',
    'fare',
    'commission',
    'driver_net',
    'payment_status',
  ]
  const lines = rows.map(({ booking, payment }) =>
    [
      booking.id,
      booking.requested_at,
      booking.completed_at ?? '',
      booking.vehicle_type,
      booking.origin_label ?? '',
      booking.dest_label ?? '',
      booking.fare,
      payment?.commission ?? '',
      payment?.driver_net ?? '',
      payment?.status ?? '',
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

export function AdminReports() {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(200)

    const list = bookings ?? []
    if (list.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .in('booking_id', list.map((b) => b.id))

    const byBooking = new Map((payments ?? []).map((p) => [p.booking_id, p]))
    setRows(list.map((booking) => ({ booking, payment: byBooking.get(booking.id) ?? null })))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useTableSubscription({ table: 'bookings', onChange: load })

  const totals = useMemo(() => {
    let fares = 0
    let commission = 0
    for (const row of rows) {
      fares += Number(row.booking.fare)
      commission += Number(row.payment?.commission ?? 0)
    }
    return { fares, commission, count: rows.length }
  }, [rows])

  function download() {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mati-ride-trips-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
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
      <PageHeader title="Trip reports" subtitle="Completed trips for LGU review and operator settlement." />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Trips" value={totals.count} />
        <Stat label="Gross fares" value={formatPeso(totals.fares)} />
        <Stat label="Commission" value={formatPeso(totals.commission)} />
      </div>

      <Button variant="secondary" block onClick={download} disabled={rows.length === 0}>
        Export CSV
      </Button>

      {rows.length === 0 ? (
        <EmptyState title="No completed trips yet" />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ booking, payment }) => (
            <Card as="li" key={booking.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {booking.origin_label ?? 'Pickup'} → {booking.dest_label ?? 'Dropoff'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(booking.completed_at)} · {shortId(booking.id)} · {VEHICLE_LABELS[booking.vehicle_type]}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{formatPeso(booking.fare)}</p>
                  <StatusPill tone={payment?.status === 'settled' ? 'good' : 'warn'}>
                    {payment?.status ?? 'no payment'}
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
