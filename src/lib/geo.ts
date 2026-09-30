/**
 * Geo helpers. These must match the SQL haversine_km / quote_fare logic so the
 * client preview equals the server-computed fare.
 */

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Distance in metres between a driver's last fix and a pickup point. */
export function metresBetween(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000
}

/** Rough ETA for a tricycle in city traffic. [VERIFY: average speed in Mati] */
export function etaMinutes(distanceKm: number, speedKph = 18): number {
  if (distanceKm <= 0) return 0
  return Math.max(1, Math.round((distanceKm / speedKph) * 60))
}

export interface PositionResult extends LatLng {
  accuracy: number
}

export function getCurrentPosition(timeoutMs = 8000): Promise<PositionResult> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device does not support location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(new Error(geoErrorMessage(err))),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    )
  })
}

export function watchPosition(
  onUpdate: (pos: PositionResult) => void,
  onError?: (message: string) => void,
): () => void {
  if (!('geolocation' in navigator)) {
    onError?.('This device does not support location.')
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
    (err) => onError?.(geoErrorMessage(err)),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}

function geoErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location access was denied. Allow it in your browser settings, or type a landmark instead.'
    case err.POSITION_UNAVAILABLE:
      return 'Your location is unavailable right now. Check signal, or type a landmark.'
    case err.TIMEOUT:
      return 'Getting your location took too long. Try again, or type a landmark.'
    default:
      return 'Could not get your location.'
  }
}

/** Nearest fare zone by centroid distance. Used to derive origin/dest zones. */
export function nearestZone<T extends { id: string; centroid_lat: number; centroid_lng: number }>(
  point: LatLng,
  zones: T[],
): T | null {
  let best: T | null = null
  let bestKm = Infinity
  for (const zone of zones) {
    const km = haversineKm(point, { lat: zone.centroid_lat, lng: zone.centroid_lng })
    if (km < bestKm) {
      bestKm = km
      best = zone
    }
  }
  return best
}
