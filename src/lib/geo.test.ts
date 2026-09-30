import { describe, expect, it } from 'vitest'
import { haversineKm, nearestZone, etaMinutes } from './geo'

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineKm({ lat: 6.955, lng: 126.2166 }, { lat: 6.955, lng: 126.2166 })).toBeCloseTo(0, 5)
  })

  it('is symmetric', () => {
    const a = { lat: 6.955, lng: 126.2166 }
    const b = { lat: 6.942, lng: 126.268 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9)
  })

  it('matches the known distance for one degree of latitude', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1)
  })
})

describe('nearestZone', () => {
  const zones = [
    { id: 'a', centroid_lat: 6.955, centroid_lng: 126.2166 },
    { id: 'b', centroid_lat: 6.942, centroid_lng: 126.268 },
  ]

  it('picks the closest centroid', () => {
    expect(nearestZone({ lat: 6.95, lng: 126.22 }, zones)?.id).toBe('a')
    expect(nearestZone({ lat: 6.94, lng: 126.27 }, zones)?.id).toBe('b')
  })

  it('returns null for an empty list', () => {
    expect(nearestZone({ lat: 0, lng: 0 }, [])).toBeNull()
  })
})

describe('etaMinutes', () => {
  it('never returns less than one minute for a positive distance', () => {
    expect(etaMinutes(0.01)).toBe(1)
  })

  it('returns 0 for no distance', () => {
    expect(etaMinutes(0)).toBe(0)
  })
})
