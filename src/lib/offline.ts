/**
 * Offline / low-data support.
 *
 * Bookings and trip events that cannot reach Supabase are queued in
 * localStorage and flushed when the connection returns. Kept deliberately small:
 * no background sync worker in the MVP.
 */

const QUEUE_KEY = 'mati-ride.queue.v1'

export interface QueueItem {
  id: string
  kind: string
  payload: unknown
  createdAt: string
}

function safeParse(raw: string | null): QueueItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueueItem[]) : []
  } catch {
    return []
  }
}

export function readQueue(): QueueItem[] {
  if (typeof localStorage === 'undefined') return []
  return safeParse(localStorage.getItem(QUEUE_KEY))
}

function writeQueue(items: QueueItem[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
}

export function enqueue(kind: string, payload: unknown): QueueItem {
  const item: QueueItem = {
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: new Date().toISOString(),
  }
  writeQueue([...readQueue(), item])
  return item
}

export function removeFromQueue(id: string): void {
  writeQueue(readQueue().filter((item) => item.id !== id))
}

export function clearQueue(): void {
  writeQueue([])
}

export function isOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true
  return navigator.onLine
}

/** Non-standard Network Information API, used only as a hint. */
interface NetworkInformation {
  effectiveType?: string
  saveData?: boolean
}

export function isLowData(): boolean {
  if (typeof navigator === 'undefined') return false
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection
  if (!conn) return false
  if (conn.saveData) return true
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g'
}

export function onConnectionChange(callback: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
