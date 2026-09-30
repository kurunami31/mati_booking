-- SakayTa — initial schema
-- Tricycle / tuk-tuk / bao-bao booking for Mati City, Davao Oriental.
--
-- Design notes:
--  * Fares are computed server-side (quote_fare / request_booking) so a client
--    cannot tamper with the fixed fare.
--  * Booking state changes go through transition_booking() so the state machine
--    is enforced in one place, not in whichever screen happens to call update.
--  * Driver positions are read only through find_nearby_drivers(), which returns
--    driver + distance, not a raw list of every driver's coordinates.
--  * Cross-table RLS checks go through SECURITY DEFINER helpers to avoid policy
--    recursion (bookings -> drivers -> bookings).
--  * "bao-bao" is kept as a vehicle_type value. [VERIFY: confirm the term used
--    in Mati; if tricycles legally cover it, retire the enum value.]
--
-- Not legal advice. Review against the Data Privacy Act (RA 10173) before
-- collecting ID images or sharing location with authorities.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('passenger', 'driver', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'vehicle_type') then
    create type vehicle_type as enum ('tricycle', 'tuktuk', 'baobao');
  end if;
  if not exists (select 1 from pg_type where typname = 'driver_status') then
    create type driver_status as enum ('pending', 'verified', 'suspended');
  end if;
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type booking_status as enum (
      'requested', 'assigned', 'arrived', 'in_progress',
      'completed', 'cancelled', 'no_show'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type payment_method as enum ('cash', 'ewallet');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('pending', 'collected', 'settled');
  end if;
  if not exists (select 1 from pg_type where typname = 'sos_status') then
    create type sos_status as enum ('open', 'acknowledged', 'closed_false_alarm', 'closed_resolved');
  end if;
  if not exists (select 1 from pg_type where typname = 'discount_type') then
    create type discount_type as enum ('senior', 'student', 'pwd');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'passenger',
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  license_no text,
  id_photo_url text,
  status driver_status not null default 'pending',
  rating numeric(3, 2),
  rating_count int not null default 0,
  is_online boolean not null default false,
  last_lat double precision,
  last_lng double precision,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  type vehicle_type not null,
  plate_no text,
  unit_no text,
  franchise_no text,
  photo_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.fare_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  centroid_lat double precision not null,
  centroid_lng double precision not null,
  is_active boolean not null default true
);

create table if not exists public.fare_matrix (
  id uuid primary key default gen_random_uuid(),
  origin_zone uuid not null references public.fare_zones (id) on delete cascade,
  dest_zone uuid not null references public.fare_zones (id) on delete cascade,
  vehicle_type vehicle_type not null,
  fare numeric(10, 2) not null check (fare >= 0),
  is_active boolean not null default true,
  unique (origin_zone, dest_zone, vehicle_type)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles (id) on delete restrict,
  driver_id uuid references public.drivers (id) on delete set null,
  vehicle_type vehicle_type not null,
  origin_zone uuid references public.fare_zones (id) on delete set null,
  dest_zone uuid references public.fare_zones (id) on delete set null,
  origin_lat double precision,
  origin_lng double precision,
  origin_label text,
  dest_lat double precision,
  dest_lng double precision,
  dest_label text,
  distance_km numeric(6, 2),
  fare numeric(10, 2) not null check (fare >= 0),
  discount_type discount_type,
  passenger_count int not null default 1 check (passenger_count between 1 and 12),
  has_luggage boolean not null default false,
  status booking_status not null default 'requested',
  payment_method payment_method not null default 'cash',
  notes text,
  requested_at timestamptz not null default now(),
  assigned_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  no_show_at timestamptz,
  cancel_reason text
);

create table if not exists public.trip_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  event_type text not null,
  actor_id uuid,
  lat double precision,
  lng double precision,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete set null,
  triggered_by uuid references public.profiles (id) on delete set null,
  lat double precision,
  lng double precision,
  status sos_status not null default 'open',
  note text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  closed_at timestamptz
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  method payment_method not null default 'cash',
  amount numeric(10, 2) not null,
  commission numeric(10, 2) not null default 0,
  driver_net numeric(10, 2) not null default 0,
  status payment_status not null default 'pending',
  collected_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  rater_role user_role not null,
  rater_id uuid not null,
  stars int not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (booking_id, rater_role)
);

create index if not exists idx_drivers_online on public.drivers (is_online) where is_online;
create index if not exists idx_vehicles_driver on public.vehicles (driver_id);
create index if not exists idx_bookings_passenger on public.bookings (passenger_id, requested_at desc);
create index if not exists idx_bookings_driver on public.bookings (driver_id, requested_at desc);
create index if not exists idx_bookings_open on public.bookings (vehicle_type) where status = 'requested';
create index if not exists idx_trip_events_booking on public.trip_events (booking_id, created_at);
create index if not exists idx_sos_open on public.sos_alerts (status) where status = 'open';

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER: bypass RLS on purpose, safe search_path)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.current_driver_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.drivers where profile_id = auth.uid();
$$;

create or replace function public.setting_numeric(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_settings where key = p_key), p_default);
$$;

-- Is the current user a verified driver who operates this vehicle type?
create or replace function public.driver_operates(p_vehicle_type vehicle_type)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.drivers d
    join public.vehicles v on v.driver_id = d.id
    where d.profile_id = auth.uid()
      and d.status = 'verified'
      and v.verified
      and v.type = p_vehicle_type
  );
$$;

-- Is the current user the passenger or assigned driver of this booking?
create or replace function public.current_user_is_participant(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and (b.passenger_id = auth.uid() or b.driver_id = public.current_driver_id())
  );
$$;

create or replace function public.booking_is_completed(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings b where b.id = p_booking_id and b.status = 'completed');
$$;

-- Does the current user have a booking with this driver?
create or replace function public.passenger_rides_with_driver(p_driver_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.driver_id = p_driver_id and b.passenger_id = auth.uid()
  );
$$;

-- Is this passenger on a current booking with the signed-in driver?
create or replace function public.driver_has_passenger(p_passenger_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.passenger_id = p_passenger_id
      and b.driver_id = public.current_driver_id()
      and b.status in ('assigned', 'arrived', 'in_progress')
  );
$$;

create or replace function public.haversine_km(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
)
returns double precision language sql immutable as $$
  select 6371 * acos(
    least(1, greatest(-1,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2) - radians(lon1))
      + sin(radians(lat1)) * sin(radians(lat2))
    ))
  );
$$;

-- Quote a fare. Prefers the LGU fare matrix; falls back to base + per-km.
create or replace function public.quote_fare(
  p_vehicle_type vehicle_type,
  p_origin_zone uuid,
  p_dest_zone uuid,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_discount_type discount_type default null
)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_fare numeric;
  v_distance double precision;
  v_base numeric := public.setting_numeric('base_fare', 15);
  v_per_km numeric := public.setting_numeric('per_km_rate', 10);
  v_discount numeric := public.setting_numeric('discount_rate', 0.20);
begin
  if p_origin_zone is not null and p_dest_zone is not null then
    select fare into v_fare
    from public.fare_matrix
    where origin_zone = p_origin_zone
      and dest_zone = p_dest_zone
      and vehicle_type = p_vehicle_type
      and is_active
    limit 1;
  end if;

  if v_fare is null then
    if p_origin_lat is not null and p_dest_lat is not null then
      v_distance := public.haversine_km(p_origin_lat, p_origin_lng, p_dest_lat, p_dest_lng);
    else
      v_distance := 0;
    end if;
    v_fare := v_base + v_per_km * v_distance;
  end if;

  if p_discount_type is not null then
    v_fare := v_fare * (1 - v_discount);
  end if;

  return round(v_fare, 0);
end;
$$;

-- Public quote entry point (used by the passenger screen before booking).
create or replace function public.public_quote(
  p_vehicle_type vehicle_type,
  p_origin_zone uuid,
  p_dest_zone uuid,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_discount_type discount_type default null
)
returns numeric language sql stable security definer set search_path = public as $$
  select public.quote_fare(
    p_vehicle_type, p_origin_zone, p_dest_zone,
    p_origin_lat, p_origin_lng, p_dest_lat, p_dest_lng, p_discount_type
  );
$$;

-- Nearest verified, online drivers for a vehicle type.
-- Returns driver + vehicle + distance only; never raw coordinates.
create or replace function public.find_nearby_drivers(
  p_lat double precision,
  p_lng double precision,
  p_vehicle_type vehicle_type,
  p_limit int default 5
)
returns table (
  driver_id uuid,
  vehicle_id uuid,
  distance_km double precision,
  plate_no text,
  unit_no text,
  rating numeric
)
language sql stable security definer set search_path = public as $$
  select d.id, v.id,
         public.haversine_km(p_lat, p_lng, d.last_lat, d.last_lng) as distance_km,
         v.plate_no, v.unit_no, d.rating
  from public.drivers d
  join public.vehicles v on v.driver_id = d.id and v.verified
  where d.status = 'verified'
    and d.is_online
    and d.last_lat is not null
    and v.type = p_vehicle_type
  order by distance_km asc
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone),
    case
      when new.raw_user_meta_data ->> 'role' = 'driver' then 'driver'::user_role
      else 'passenger'::user_role
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Booking RPCs
-- ---------------------------------------------------------------------------

-- Passenger creates a booking. Fare is computed here, not by the client.
create or replace function public.request_booking(
  p_vehicle_type vehicle_type,
  p_origin_zone uuid,
  p_dest_zone uuid,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_origin_label text,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_dest_label text,
  p_discount_type discount_type default null,
  p_passenger_count int default 1,
  p_has_luggage boolean default false
)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
  v_distance numeric(6, 2);
  v_fare numeric(10, 2);
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if p_origin_lat is not null and p_dest_lat is not null then
    v_distance := round(public.haversine_km(p_origin_lat, p_origin_lng, p_dest_lat, p_dest_lng)::numeric, 2);
  end if;

  v_fare := public.quote_fare(
    p_vehicle_type, p_origin_zone, p_dest_zone,
    p_origin_lat, p_origin_lng, p_dest_lat, p_dest_lng, p_discount_type
  );

  insert into public.bookings (
    passenger_id, vehicle_type, origin_zone, dest_zone,
    origin_lat, origin_lng, origin_label, dest_lat, dest_lng, dest_label,
    distance_km, fare, discount_type, passenger_count, has_luggage, status
  ) values (
    auth.uid(), p_vehicle_type, p_origin_zone, p_dest_zone,
    p_origin_lat, p_origin_lng, p_origin_label, p_dest_lat, p_dest_lng, p_dest_label,
    v_distance, v_fare, p_discount_type,
    greatest(1, coalesce(p_passenger_count, 1)), coalesce(p_has_luggage, false), 'requested'
  )
  returning * into v_booking;

  insert into public.trip_events (booking_id, event_type, actor_id, lat, lng)
  values (v_booking.id, 'requested', auth.uid(), p_origin_lat, p_origin_lng);

  return v_booking;
end;
$$;

-- Driver claims a requested booking. Atomic: first accept wins.
create or replace function public.accept_booking(p_booking_id uuid)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  v_driver uuid := public.current_driver_id();
  v_booking public.bookings;
begin
  if v_driver is null then
    raise exception 'Not a registered driver';
  end if;

  if not exists (select 1 from public.drivers where id = v_driver and status = 'verified') then
    raise exception 'Driver is not verified yet';
  end if;

  update public.bookings
    set driver_id = v_driver, status = 'assigned', assigned_at = now()
    where id = p_booking_id and status = 'requested' and driver_id is null
    returning * into v_booking;

  if v_booking is null then
    raise exception 'Ride already taken or no longer available';
  end if;

  insert into public.trip_events (booking_id, event_type, actor_id)
  values (p_booking_id, 'assigned', auth.uid());

  return v_booking;
end;
$$;

-- Single entry point for booking status changes.
create or replace function public.transition_booking(
  p_booking_id uuid,
  p_to booking_status,
  p_note text default null
)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
  v_from booking_status;
  v_driver_id uuid := public.current_driver_id();
  v_is_passenger boolean;
  v_is_driver boolean;
  v_is_admin boolean := public.is_admin();
  v_allowed boolean := false;
  v_commission_rate numeric := public.setting_numeric('commission_rate', 0.10);
  v_commission numeric(10, 2);
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;

  v_from := v_booking.status;
  v_is_passenger := v_booking.passenger_id = auth.uid();
  v_is_driver := v_driver_id is not null and v_booking.driver_id = v_driver_id;

  if not (v_is_passenger or v_is_driver or v_is_admin) then
    raise exception 'Not allowed for this booking';
  end if;

  if v_from = 'requested' and p_to = 'cancelled' and (v_is_passenger or v_is_admin) then
    v_allowed := true;
  elsif v_from = 'assigned' and p_to = 'arrived' and (v_is_driver or v_is_admin) then
    v_allowed := true;
  elsif v_from in ('assigned', 'arrived') and p_to = 'cancelled' then
    v_allowed := true;
  elsif v_from in ('assigned', 'arrived') and p_to = 'no_show' and (v_is_driver or v_is_admin) then
    v_allowed := true;
  elsif v_from = 'arrived' and p_to = 'in_progress' and (v_is_driver or v_is_admin) then
    v_allowed := true;
  elsif v_from = 'in_progress' and p_to = 'completed' and (v_is_driver or v_is_admin) then
    v_allowed := true;
  elsif v_from = 'in_progress' and p_to = 'cancelled' and v_is_admin then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'Cannot change status from % to %', v_from, p_to;
  end if;

  update public.bookings
    set status = p_to,
        arrived_at = case when p_to = 'arrived' then now() else arrived_at end,
        started_at = case when p_to = 'in_progress' then now() else started_at end,
        completed_at = case when p_to = 'completed' then now() else completed_at end,
        cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
        no_show_at = case when p_to = 'no_show' then now() else no_show_at end,
        cancel_reason = case when p_to in ('cancelled', 'no_show') then p_note else cancel_reason end
    where id = p_booking_id
    returning * into v_booking;

  insert into public.trip_events (booking_id, event_type, actor_id, meta)
  values (p_booking_id, p_to::text, auth.uid(),
          case when p_note is null then null else jsonb_build_object('note', p_note) end);

  if p_to = 'completed' then
    v_commission := round(v_booking.fare * v_commission_rate, 2);
    insert into public.payments (booking_id, method, amount, commission, driver_net, status)
    values (p_booking_id, v_booking.payment_method, v_booking.fare, v_commission,
            v_booking.fare - v_commission, 'pending')
    on conflict (booking_id) do nothing;
  end if;

  return v_booking;
end;
$$;

-- Driver toggles availability and publishes position.
create or replace function public.set_driver_presence(
  p_is_online boolean,
  p_lat double precision default null,
  p_lng double precision default null
)
returns public.drivers language plpgsql security definer set search_path = public as $$
declare
  v_driver public.drivers;
begin
  update public.drivers
    set is_online = p_is_online,
        last_lat = coalesce(p_lat, last_lat),
        last_lng = coalesce(p_lng, last_lng),
        last_seen = now()
    where profile_id = auth.uid()
    returning * into v_driver;

  if v_driver is null then
    raise exception 'No driver profile for this account';
  end if;

  return v_driver;
end;
$$;

-- Mark a cash payment collected (driver) or settled (admin).
create or replace function public.mark_payment(
  p_booking_id uuid,
  p_status payment_status
)
returns public.payments language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_driver_id uuid := public.current_driver_id();
  v_is_admin boolean := public.is_admin();
  v_owner uuid;
begin
  select b.driver_id into v_owner from public.bookings b where b.id = p_booking_id;

  if not (v_is_admin or (v_driver_id is not null and v_owner = v_driver_id)) then
    raise exception 'Not allowed';
  end if;

  if p_status = 'settled' and not v_is_admin then
    raise exception 'Only admin can settle';
  end if;

  update public.payments
    set status = p_status,
        collected_at = case when p_status = 'collected' then now() else collected_at end,
        settled_at = case when p_status = 'settled' then now() else settled_at end
    where booking_id = p_booking_id
    returning * into v_payment;

  if v_payment is null then
    raise exception 'Payment not found';
  end if;

  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.fare_zones enable row level security;
alter table public.fare_matrix enable row level security;
alter table public.bookings enable row level security;
alter table public.trip_events enable row level security;
alter table public.sos_alerts enable row level security;
alter table public.payments enable row level security;
alter table public.ratings enable row level security;

-- app_settings
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- A passenger must see the name of the driver on their ride.
drop policy if exists profiles_ride_counterpart on public.profiles;
create policy profiles_ride_counterpart on public.profiles
  for select to authenticated using (public.passenger_rides_with_driver(public.profiles.id));
-- A driver must see the name of the passenger they are picking up.
drop policy if exists profiles_driver_sees_passenger on public.profiles;
create policy profiles_driver_sees_passenger on public.profiles
  for select to authenticated using (public.driver_has_passenger(public.profiles.id));

-- drivers
drop policy if exists drivers_read on public.drivers;
create policy drivers_read on public.drivers
  for select to authenticated using (
    profile_id = auth.uid()
    or public.is_admin()
    or public.passenger_rides_with_driver(public.drivers.id)
  );
drop policy if exists drivers_insert_self on public.drivers;
create policy drivers_insert_self on public.drivers
  for insert to authenticated with check (profile_id = auth.uid());
drop policy if exists drivers_update_self on public.drivers;
create policy drivers_update_self on public.drivers
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists drivers_admin_all on public.drivers;
create policy drivers_admin_all on public.drivers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- vehicles
drop policy if exists vehicles_read on public.vehicles;
create policy vehicles_read on public.vehicles
  for select to authenticated using (
    public.is_admin()
    or driver_id = public.current_driver_id()
    or verified = true
  );
drop policy if exists vehicles_driver_insert on public.vehicles;
create policy vehicles_driver_insert on public.vehicles
  for insert to authenticated with check (driver_id = public.current_driver_id());
drop policy if exists vehicles_driver_update on public.vehicles;
create policy vehicles_driver_update on public.vehicles
  for update to authenticated using (driver_id = public.current_driver_id() or public.is_admin())
  with check (driver_id = public.current_driver_id() or public.is_admin());

-- fare_zones / fare_matrix: public read, admin write.
drop policy if exists fare_zones_read on public.fare_zones;
create policy fare_zones_read on public.fare_zones for select to authenticated using (true);
drop policy if exists fare_zones_admin on public.fare_zones;
create policy fare_zones_admin on public.fare_zones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists fare_matrix_read on public.fare_matrix;
create policy fare_matrix_read on public.fare_matrix for select to authenticated using (true);
drop policy if exists fare_matrix_admin on public.fare_matrix;
create policy fare_matrix_admin on public.fare_matrix
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- bookings
drop policy if exists bookings_read on public.bookings;
create policy bookings_read on public.bookings
  for select to authenticated using (
    passenger_id = auth.uid()
    or driver_id = public.current_driver_id()
    or public.is_admin()
    or (status = 'requested' and public.driver_operates(public.bookings.vehicle_type))
  );
drop policy if exists bookings_passenger_insert on public.bookings;
create policy bookings_passenger_insert on public.bookings
  for insert to authenticated with check (passenger_id = auth.uid());

-- trip_events
drop policy if exists trip_events_read on public.trip_events;
create policy trip_events_read on public.trip_events
  for select to authenticated using (
    public.is_admin() or public.current_user_is_participant(public.trip_events.booking_id)
  );

-- sos_alerts
drop policy if exists sos_read on public.sos_alerts;
create policy sos_read on public.sos_alerts
  for select to authenticated using (
    public.is_admin()
    or triggered_by = auth.uid()
    or public.current_user_is_participant(public.sos_alerts.booking_id)
  );
drop policy if exists sos_insert on public.sos_alerts;
create policy sos_insert on public.sos_alerts
  for insert to authenticated with check (
    triggered_by = auth.uid()
    and public.current_user_is_participant(public.sos_alerts.booking_id)
  );
drop policy if exists sos_admin_update on public.sos_alerts;
create policy sos_admin_update on public.sos_alerts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- payments
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select to authenticated using (
    public.is_admin() or public.current_user_is_participant(public.payments.booking_id)
  );

-- ratings
drop policy if exists ratings_read on public.ratings;
create policy ratings_read on public.ratings
  for select to authenticated using (
    public.is_admin() or public.current_user_is_participant(public.ratings.booking_id)
  );
drop policy if exists ratings_insert on public.ratings;
create policy ratings_insert on public.ratings
  for insert to authenticated with check (
    rater_id = auth.uid()
    and public.current_user_is_participant(public.ratings.booking_id)
    and public.booking_is_completed(public.ratings.booking_id)
  );
