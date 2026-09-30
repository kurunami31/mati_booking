/** Formatting helpers. Peso amounts are shown as whole numbers unless cents exist. */

export function formatPeso(amount: number | null | undefined): string {
  const value = Number(amount ?? 0)
  const hasCents = Math.round(value * 100) % 100 !== 0
  return `PHP ${value.toLocaleString('en-PH', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

export function formatDistanceKm(km: number | null | undefined): string {
  if (km == null) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (Math.abs(mins) < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.round(hours / 24)} d ago`
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / 60000
}
