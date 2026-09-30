import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/db'

type PublicTable = keyof Database['public']['Tables']

interface SubscriptionOptions {
  table: PublicTable
  /** Refetch callback, throttled to one call per 300ms. */
  onChange: () => void
  /** Optional Postgres filter, e.g. `passenger_id=eq.<uuid>`. */
  filter?: string
  enabled?: boolean
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
}

/**
 * Subscribe to changes on a table and refetch.
 * Row visibility still follows RLS: a driver only receives rows they may read.
 */
export function useTableSubscription({
  table,
  onChange,
  filter,
  enabled = true,
  event = '*',
}: SubscriptionOptions): void {
  const handlerRef = useRef(onChange)

  useEffect(() => {
    handlerRef.current = onChange
  })

  useEffect(() => {
    if (!enabled) return

    let timer: number | null = null
    const schedule = () => {
      if (timer != null) return
      timer = window.setTimeout(() => {
        timer = null
        handlerRef.current()
      }, 300)
    }

    const channel = supabase
      .channel(`rt:${table}:${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        { event, schema: 'public', table, filter },
        schedule,
      )
      .subscribe()

    return () => {
      if (timer != null) window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [table, filter, enabled, event])
}
