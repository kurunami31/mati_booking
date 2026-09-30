/**
 * Hand-written database types matching supabase/migrations/0001_init.sql.
 *
 * Row types are `type` aliases (not interfaces) so they satisfy Supabase's
 * `Record<string, unknown>` table constraint.
 *
 * Regenerate with `supabase gen types typescript` once the project is linked.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'passenger' | 'driver' | 'admin'
export type VehicleType = 'tricycle' | 'tuktuk' | 'baobao'
export type DriverStatus = 'pending' | 'verified' | 'suspended'
export type BookingStatus =
  | 'requested'
  | 'assigned'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
export type PaymentMethod = 'cash' | 'ewallet'
export type PaymentStatus = 'pending' | 'collected' | 'settled'
export type SosStatus = 'open' | 'acknowledged' | 'closed_false_alarm' | 'closed_resolved'
export type DiscountType = 'senior' | 'student' | 'pwd'

export type ProfileRow = {
  id: string
  role: UserRole
  full_name: string
  phone: string | null
  created_at: string
}

export type DriverRow = {
  id: string
  profile_id: string
  license_no: string | null
  id_photo_url: string | null
  status: DriverStatus
  rating: number | null
  rating_count: number
  is_online: boolean
  last_lat: number | null
  last_lng: number | null
  last_seen: string | null
  created_at: string
}

export type VehicleRow = {
  id: string
  driver_id: string
  type: VehicleType
  plate_no: string | null
  unit_no: string | null
  franchise_no: string | null
  photo_url: string | null
  verified: boolean
  created_at: string
}

export type FareZoneRow = {
  id: string
  name: string
  centroid_lat: number
  centroid_lng: number
  is_active: boolean
}

export type FareMatrixRow = {
  id: string
  origin_zone: string
  dest_zone: string
  vehicle_type: VehicleType
  fare: number
  is_active: boolean
}

export type BookingRow = {
  id: string
  passenger_id: string
  driver_id: string | null
  vehicle_type: VehicleType
  origin_zone: string | null
  dest_zone: string | null
  origin_lat: number | null
  origin_lng: number | null
  origin_label: string | null
  dest_lat: number | null
  dest_lng: number | null
  dest_label: string | null
  distance_km: number | null
  fare: number
  discount_type: DiscountType | null
  passenger_count: number
  has_luggage: boolean
  status: BookingStatus
  payment_method: PaymentMethod
  notes: string | null
  requested_at: string
  assigned_at: string | null
  arrived_at: string | null
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  no_show_at: string | null
  cancel_reason: string | null
}

export type TripEventRow = {
  id: number
  booking_id: string
  event_type: string
  actor_id: string | null
  lat: number | null
  lng: number | null
  meta: Json | null
  created_at: string
}

export type SosAlertRow = {
  id: string
  booking_id: string | null
  triggered_by: string | null
  lat: number | null
  lng: number | null
  status: SosStatus
  note: string | null
  created_at: string
  acknowledged_at: string | null
  closed_at: string | null
}

export type PaymentRow = {
  id: string
  booking_id: string
  method: PaymentMethod
  amount: number
  commission: number
  driver_net: number
  status: PaymentStatus
  collected_at: string | null
  settled_at: string | null
  created_at: string
}

export type RatingRow = {
  id: string
  booking_id: string
  rater_role: UserRole
  rater_id: string
  stars: number
  comment: string | null
  created_at: string
}

export type AppSettingRow = {
  key: string
  value: Json
  description: string | null
  updated_at: string
}

export type NearbyDriver = {
  driver_id: string
  vehicle_id: string
  distance_km: number
  plate_no: string | null
  unit_no: string | null
  rating: number | null
}

type Table<T> = {
  Row: T
  Insert: Partial<T>
  Update: Partial<T>
  Relationships: []
}
type Fn<A, R> = { Args: A; Returns: R }

export type Database = {
  public: {
    Tables: {
      app_settings: Table<AppSettingRow>
      profiles: Table<ProfileRow>
      drivers: Table<DriverRow>
      vehicles: Table<VehicleRow>
      fare_zones: Table<FareZoneRow>
      fare_matrix: Table<FareMatrixRow>
      bookings: Table<BookingRow>
      trip_events: Table<TripEventRow>
      sos_alerts: Table<SosAlertRow>
      payments: Table<PaymentRow>
      ratings: Table<RatingRow>
    }
    Views: { [_ in never]: never }
    Enums: {
      user_role: UserRole
      vehicle_type: VehicleType
      driver_status: DriverStatus
      booking_status: BookingStatus
      payment_method: PaymentMethod
      payment_status: PaymentStatus
      sos_status: SosStatus
      discount_type: DiscountType
    }
    CompositeTypes: { [_ in never]: never }
    Functions: {
      public_quote: Fn<
        {
          p_vehicle_type: VehicleType
          p_origin_zone: string | null
          p_dest_zone: string | null
          p_origin_lat: number | null
          p_origin_lng: number | null
          p_dest_lat: number | null
          p_dest_lng: number | null
          p_discount_type: DiscountType | null
        },
        number
      >
      request_booking: Fn<
        {
          p_vehicle_type: VehicleType
          p_origin_zone: string | null
          p_dest_zone: string | null
          p_origin_lat: number | null
          p_origin_lng: number | null
          p_origin_label: string | null
          p_dest_lat: number | null
          p_dest_lng: number | null
          p_dest_label: string | null
          p_discount_type: DiscountType | null
          p_passenger_count: number
          p_has_luggage: boolean
        },
        BookingRow
      >
      accept_booking: Fn<{ p_booking_id: string }, BookingRow>
      transition_booking: Fn<
        { p_booking_id: string; p_to: BookingStatus; p_note: string | null },
        BookingRow
      >
      set_driver_presence: Fn<
        { p_is_online: boolean; p_lat: number | null; p_lng: number | null },
        DriverRow
      >
      mark_payment: Fn<{ p_booking_id: string; p_status: PaymentStatus }, PaymentRow>
      find_nearby_drivers: Fn<
        { p_lat: number; p_lng: number; p_vehicle_type: VehicleType; p_limit: number },
        NearbyDriver[]
      >
      is_admin: Fn<Record<string, never>, boolean>
      current_driver_id: Fn<Record<string, never>, string | null>
    }
  }
}
