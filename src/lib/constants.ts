import type { BookingStatus, DiscountType, SosStatus, UserRole, VehicleType } from '../types/db'

/**
 * Vehicle labels.
 * "bao-bao" is kept as a separate value. [VERIFY: if locals in Mati use only one
 * of these terms, collapse the two options in the UI.]
 */
export const VEHICLE_LABELS: Record<VehicleType, string> = {
  tricycle: 'Tricycle',
  tuktuk: 'Tuk-tuk',
  baobao: 'Bao-bao',
}

export const VEHICLE_SHORT: Record<VehicleType, string> = {
  tricycle: 'Tricycle',
  tuktuk: 'Tuk-tuk',
  baobao: 'Bao-bao',
}

/** Combined label used where the user is choosing the auto-rickshaw class. */
export const TUKTUK_CLASS_LABEL = 'Tuk-tuk/bao-bao'

export const VEHICLE_OPTIONS: { value: VehicleType; label: string; hint: string }[] = [
  { value: 'tricycle', label: 'Tricycle', hint: 'Short trips, up to 3 passengers' },
  { value: 'tuktuk', label: 'Tuk-tuk', hint: 'Flat runs, more room for luggage' },
  { value: 'baobao', label: 'Bao-bao', hint: 'Local auto-rickshaw, same class as tuk-tuk' },
]

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  requested: 'Looking for a driver',
  assigned: 'Driver on the way',
  arrived: 'Driver has arrived',
  in_progress: 'On the trip',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
}

export const BOOKING_STATUS_TONE: Record<BookingStatus, 'info' | 'good' | 'warn' | 'bad' | 'muted'> = {
  requested: 'warn',
  assigned: 'info',
  arrived: 'info',
  in_progress: 'good',
  completed: 'good',
  cancelled: 'muted',
  no_show: 'bad',
}

export const DISCOUNT_OPTIONS: { value: DiscountType; label: string }[] = [
  { value: 'senior', label: 'Senior citizen' },
  { value: 'student', label: 'Student' },
  { value: 'pwd', label: 'PWD' },
]

export const DISCOUNT_LABELS: Record<DiscountType, string> = {
  senior: 'Senior',
  student: 'Student',
  pwd: 'PWD',
}

export const SOS_STATUS_LABELS: Record<SosStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  closed_false_alarm: 'Closed — false alarm',
  closed_resolved: 'Closed — resolved',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  passenger: 'Passenger',
  driver: 'Driver',
  admin: 'Admin / LGU',
}

/** Cancellation and no-show reasons offered to drivers. */
export const DRIVER_CANCEL_REASONS = [
  'Passenger not at pickup point',
  'Passenger did not show up',
  'Unit broke down',
  'Road closed or flooded',
  'Passenger asked to cancel',
] as const

/** Default map center for Mati City proper. [VERIFY: exact city center pin] */
export const MATI_CENTER = { lat: 6.955, lng: 126.2166 }

/** How long a driver waits before a no-show can be recorded. [VERIFY with drivers] */
export const NO_SHOW_WAIT_MINUTES = 5

/** Peso rounding step used to display fares. */
export const FARE_ROUND_TO = 1
