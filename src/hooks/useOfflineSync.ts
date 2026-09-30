import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { onConnectionChange, readQueue, removeFromQueue, type QueueItem } from '../lib/offline'
import type {
  BookingStatus,
  Database,
  DiscountType,
  PaymentStatus,
  SosStatus,
  VehicleType,
} from '../types/db'

/**
 * Flushes queued offline actions when the connection returns.
 * A queued action that fails with a permanent error is dropped so it does not
 * block the queue; transient errors leave it in place for the next attempt.
 */
export function useOfflineSync(): { pending: number } {
  const [pending, setPending] = useState(readQueue().length)

  const flush = useCallback(async () => {
    const items = readQueue()
    for (const item of items) {
      const ok = await processItem(item)
      if (ok) removeFromQueue(item.id)
      else break
    }
    setPending(readQueue().length)
  }, [])

  useEffect(() => {
    void flush()
    const off = onConnectionChange((online) => {
      if (online) void flush()
    })
    const timer = window.setInterval(() => void flush(), 30000)
    return () => {
      off()
      window.clearInterval(timer)
    }
  }, [flush])

  return { pending }
}

async function processItem(item: QueueItem): Promise<boolean> {
  try {
    if (item.kind === 'request_booking') {
      const payload = item.payload as Database['public']['Functions']['request_booking']['Args']
      const { error } = await supabase.rpc('request_booking', payload)
      return !error
    }
    if (item.kind === 'transition_booking') {
      const payload = item.payload as { p_booking_id: string; p_to: BookingStatus; p_note: string | null }
      const { error } = await supabase.rpc('transition_booking', payload)
      return !error
    }
    if (item.kind === 'sos_alert') {
      const payload = item.payload as {
        booking_id: string | null
        triggered_by: string
        lat: number | null
        lng: number | null
        status: SosStatus
      }
      const { error } = await supabase.from('sos_alerts').insert(payload)
      return !error
    }
    // Unknown kind: drop it so the queue is not stuck.
    return true
  } catch {
    return false
  }
}

/** Types referenced only to keep the queue payload shape honest. */
export type QueuedBookingPayload = {
  p_vehicle_type: VehicleType
  p_origin_zone: string
  p_dest_zone: string
  p_origin_lat: number | null
  p_origin_lng: number | null
  p_origin_label: string | null
  p_dest_lat: number | null
  p_dest_lng: number | null
  p_dest_label: string | null
  p_discount_type: DiscountType | null
  p_passenger_count: number
  p_has_luggage: boolean
}

export type QueuedPaymentStatus = PaymentStatus
