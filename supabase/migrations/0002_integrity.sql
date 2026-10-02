-- SakayTa — integrity migration 0002
--
-- Fixes four gaps found in the MVP:
--   1. Unaccepted requests never expired and stayed open forever.
--   2. Drivers who closed the app stayed "online" with a stale last_seen.
--   3. Ratings were stored but drivers.rating / rating_count never updated.
--   4. No reliability counters for completed / cancelled / no-show trips.
--
-- Split marker `--;;;` tells scripts/migrate.mjs to run the next chunk in its
-- own transaction. Needed because a new enum value cannot be used in the same
-- transaction that adds it.

-- Booking requests that nobody accepts must not stay open forever.
alter type booking_status add value if not exists 'expired';
--;;;

-- Expiry windows in minutes. [VERIFY with drivers and the LGU]
insert into public.app_settings (key, value, description) values
  ('request_expiry_minutes', '5'::jsonb, 'Unaccepted requests expire after this many minutes [VERIFY]'),
  ('presence_expiry_minutes', '3'::jsonb, 'Drivers are marked offline after this many minutes without a ping [VERIFY]')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Expire stale ride requests
-- ---------------------------------------------------------------------------

create or replace function public.expire_stale_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes integer := greatest(1, public.setting_numeric('request_expiry_minutes', 5)::int);
  v_count integer := 0;
begin
  with expired as (
    update public.bookings
       set status = 'expired',
           cancelled_at = now(),
           cancel_reason = 'No driver accepted in time'
     where status = 'requested'
       and requested_at < now() - make_interval(mins => v_minutes)
    returning id
  )
  insert into public.trip_events (booking_id, event_type, meta)
  select id, 'expired', jsonb_build_object('reason', 'no driver accepted') from expired;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expire stale driver presence
-- ---------------------------------------------------------------------------

create or replace function public.expire_stale_presence()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes integer := greatest(1, public.setting_numeric('presence_expiry_minutes', 3)::int);
  v_count integer := 0;
begin
  update public.drivers
     set is_online = false
   where is_online = true
     and (last_seen is null or last_seen < now() - make_interval(mins => v_minutes));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rating aggregation: keep drivers.rating / rating_count in sync
-- ---------------------------------------------------------------------------

create or replace function public.apply_driver_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver uuid;
  v_avg numeric(3, 2);
  v_count integer;
begin
  if new.rater_role <> 'passenger' then
    return new;
  end if;

  select driver_id into v_driver from public.bookings where id = new.booking_id;
  if v_driver is null then
    return new;
  end if;

  select round(avg(r.stars)::numeric, 2), count(*)
    into v_avg, v_count
    from public.ratings r
    join public.bookings b on b.id = r.booking_id
   where b.driver_id = v_driver
     and r.rater_role = 'passenger';

  update public.drivers
     set rating = v_avg,
         rating_count = v_count
   where id = v_driver;

  return new;
end;
$$;

drop trigger if exists on_rating_insert on public.ratings;
create trigger on_rating_insert
  after insert on public.ratings
  for each row execute function public.apply_driver_rating();

-- ---------------------------------------------------------------------------
-- Reliability counters
-- Driven by trip_events, so the actor of each change is known without
-- touching transition_booking().
-- ---------------------------------------------------------------------------

alter table public.drivers
  add column if not exists completed_count integer not null default 0,
  add column if not exists cancelled_count integer not null default 0;

alter table public.profiles
  add column if not exists completed_count integer not null default 0,
  add column if not exists cancelled_count integer not null default 0,
  add column if not exists no_show_count integer not null default 0;

create or replace function public.apply_trip_event_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_driver_profile uuid;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  if v_booking is null then
    return new;
  end if;

  select profile_id into v_driver_profile
    from public.drivers where id = v_booking.driver_id;

  if new.event_type = 'completed' then
    if v_booking.driver_id is not null then
      update public.drivers
         set completed_count = completed_count + 1
       where id = v_booking.driver_id;
    end if;
    update public.profiles
       set completed_count = completed_count + 1
     where id = v_booking.passenger_id;

  elsif new.event_type = 'cancelled' then
    if new.actor_id is not null and new.actor_id = v_booking.passenger_id then
      update public.profiles
         set cancelled_count = cancelled_count + 1
       where id = v_booking.passenger_id;
    elsif new.actor_id is not null
          and v_booking.driver_id is not null
          and new.actor_id = v_driver_profile then
      update public.drivers
         set cancelled_count = cancelled_count + 1
       where id = v_booking.driver_id;
    end if;

  elsif new.event_type = 'no_show' then
    update public.profiles
       set no_show_count = no_show_count + 1
     where id = v_booking.passenger_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_trip_event_counters on public.trip_events;
create trigger on_trip_event_counters
  after insert on public.trip_events
  for each row execute function public.apply_trip_event_counters();

-- ---------------------------------------------------------------------------
-- Scheduling (best effort: skipped if pg_cron is unavailable)
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    null;
  end;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sakayta_expire_requests', '* * * * *',
                          'select public.expire_stale_requests()');
    perform cron.schedule('sakayta_expire_presence', '* * * * *',
                          'select public.expire_stale_presence()');
  end if;
exception when others then
  null;
end $$;
