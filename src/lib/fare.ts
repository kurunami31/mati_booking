import type { AppSettingRow, DiscountType, FareMatrixRow, VehicleType } from '../types/db'
import { haversineKm, type LatLng } from './geo'

/**
 * Client-side fare preview.
 * This mirrors public.quote_fare in SQL. The server value is the source of
 * truth; the booking row stores whatever the server computed.
 */

export interface FareRates {
  baseFare: number
  perKmRate: number
  discountRate: number
}

export const DEFAULT_RATES: FareRates = {
  baseFare: 15,
  perKmRate: 10,
  discountRate: 0.2,
}

export function findMatrixFare(
  rows: FareMatrixRow[],
  originZone: string | null,
  destZone: string | null,
  vehicleType: VehicleType,
): number | null {
  if (!originZone || !destZone) return null
  const row = rows.find(
    (r) =>
      r.is_active &&
      r.vehicle_type === vehicleType &&
      r.origin_zone === originZone &&
      r.dest_zone === destZone,
  )
  return row ? Number(row.fare) : null
}

export interface QuoteInput {
  matrix: FareMatrixRow[]
  vehicleType: VehicleType
  originZone: string | null
  destZone: string | null
  origin: LatLng | null
  dest: LatLng | null
  discountType: DiscountType | null
  rates: FareRates
}

export function computeFare(input: QuoteInput): number {
  let fare = findMatrixFare(input.matrix, input.originZone, input.destZone, input.vehicleType)

  if (fare == null) {
    const distance =
      input.origin && input.dest ? haversineKm(input.origin, input.dest) : 0
    fare = input.rates.baseFare + input.rates.perKmRate * distance
  }

  if (input.discountType) {
    fare = fare * (1 - input.rates.discountRate)
  }

  return Math.round(fare)
}

export function ratesFromSettings(settings: AppSettingRow[]): FareRates {
  const read = (key: string, fallback: number): number => {
    const row = settings.find((s) => s.key === key)
    if (!row) return fallback
    const value = typeof row.value === 'number' ? row.value : Number(row.value)
    return Number.isFinite(value) ? value : fallback
  }
  return {
    baseFare: read('base_fare', DEFAULT_RATES.baseFare),
    perKmRate: read('per_km_rate', DEFAULT_RATES.perKmRate),
    discountRate: read('discount_rate', DEFAULT_RATES.discountRate),
  }
}

export function commissionRateFromSettings(settings: AppSettingRow[]): number {
  const row = settings.find((s) => s.key === 'commission_rate')
  if (!row) return 0.1
  const value = typeof row.value === 'number' ? row.value : Number(row.value)
  return Number.isFinite(value) ? value : 0.1
}

/** True when a specific origin/dest pair has an approved matrix rate. */
export function hasMatrixRate(
  rows: FareMatrixRow[],
  originZone: string | null,
  destZone: string | null,
  vehicleType: VehicleType,
): boolean {
  return findMatrixFare(rows, originZone, destZone, vehicleType) != null
}
