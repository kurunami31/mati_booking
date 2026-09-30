import { describe, expect, it } from 'vitest'
import { computeFare, DEFAULT_RATES, findMatrixFare, hasMatrixRate, ratesFromSettings } from './fare'
import type { AppSettingRow, FareMatrixRow } from '../types/db'

const matrix: FareMatrixRow[] = [
  {
    id: 'm1',
    origin_zone: 'z1',
    dest_zone: 'z2',
    vehicle_type: 'tricycle',
    fare: 20,
    is_active: true,
  },
  {
    id: 'm2',
    origin_zone: 'z1',
    dest_zone: 'z2',
    vehicle_type: 'tuktuk',
    fare: 30,
    is_active: false,
  },
]

describe('findMatrixFare', () => {
  it('finds an active row', () => {
    expect(findMatrixFare(matrix, 'z1', 'z2', 'tricycle')).toBe(20)
  })

  it('ignores inactive rows', () => {
    expect(findMatrixFare(matrix, 'z1', 'z2', 'tuktuk')).toBeNull()
  })

  it('returns null when a zone is missing', () => {
    expect(findMatrixFare(matrix, null, 'z2', 'tricycle')).toBeNull()
  })
})

describe('computeFare', () => {
  const base = {
    matrix,
    vehicleType: 'tricycle' as const,
    origin: { lat: 6.955, lng: 126.2166 },
    dest: { lat: 6.957, lng: 126.2135 },
    discountType: null,
    rates: DEFAULT_RATES,
  }

  it('uses the matrix rate when available', () => {
    const fare = computeFare({ ...base, originZone: 'z1', destZone: 'z2' })
    expect(fare).toBe(20)
  })

  it('falls back to base + per-km when no matrix row exists', () => {
    const fare = computeFare({ ...base, originZone: 'z9', destZone: 'z2' })
    expect(fare).toBeGreaterThanOrEqual(DEFAULT_RATES.baseFare)
  })

  it('applies the discount', () => {
    const fare = computeFare({
      ...base,
      originZone: 'z1',
      destZone: 'z2',
      discountType: 'student',
    })
    expect(fare).toBe(16) // 20 * (1 - 0.20)
  })
})

describe('ratesFromSettings', () => {
  it('reads numeric settings and falls back for missing keys', () => {
    const settings: AppSettingRow[] = [
      { key: 'base_fare', value: 18, description: null, updated_at: '' },
      { key: 'discount_rate', value: 0.2, description: null, updated_at: '' },
    ]
    const rates = ratesFromSettings(settings)
    expect(rates.baseFare).toBe(18)
    expect(rates.discountRate).toBe(0.2)
    expect(rates.perKmRate).toBe(DEFAULT_RATES.perKmRate)
  })
})

describe('hasMatrixRate', () => {
  it('is true only when an approved rate exists', () => {
    expect(hasMatrixRate(matrix, 'z1', 'z2', 'tricycle')).toBe(true)
    expect(hasMatrixRate(matrix, 'z1', 'z2', 'tuktuk')).toBe(false)
  })
})
