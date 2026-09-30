import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../stores/auth'
import { supabase } from '../../lib/supabase'
import { useTableSubscription } from '../../hooks/useRealtime'
import { formatPeso, formatDateTime, shortId } from '../../lib/format'
import type { BookingRow, PaymentRow } from '../../types/db'
import { Card, EmptyState, PageHeader, Spinner, Stat, StatusPill } from '../../components/UI'

interface Row {
  booking: BookingRow
  payment: PaymentRow | null
}

export function DriverEarnings() {
  const { driver } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!driver) return
    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('driver_id', driver.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(100)

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
  }, [driver])

  useEffect(() => {
    void load()
  }, [load])

  useTableSubscription({
    table: 'payments',
    enabled: Boolean(driver),
    onChange: load,
  })

  const totals = useMemo(() => {
    let gross = 0
    let commission = 0
    let net = 0
    for (const row of rows) {
      if (!row.payment) continue
      gross += Number(row.payment.amount)
      commission += Number(row.payment.commission)
      net += Number(row.payment.driver_net)
    }
    return { gross, commission, net, count: rows.length }
  }, [rows])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8 text-brand-700" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Earnings" subtitle="Completed trips and your net after commission." />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Trips" value={totals.count} />
        <Stat label="Net pay" value={formatPeso(totals.net)} hint="After commission" />
        <Stat label="Gross fares" value={formatPeso(totals.gross)} />
        <Stat label="Commission" value={formatPeso(totals.commission)} />
      </div>

      <p className="text-xs text-slate-500">
        Settlement is manual in this MVP. Commission is recorded per trip; the office settles payouts
        separately. [VERIFY settlement cycle with the operator]
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No completed trips yet" description="Finish a trip to see earnings here." />
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
                    {formatDateTime(booking.completed_at)} · {shortId(booking.id)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{formatPeso(payment ? Number(payment.driver_net) : booking.fare)}</p>
                  <StatusPill tone={payment?.status === 'collected' ? 'good' : 'warn'}>
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
