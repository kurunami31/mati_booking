-- SakayTa — push notification plumbing (migration 0003)
--
-- Push is intentionally inert until configured. Nothing is sent while
-- push_config.enabled is false or push_config.url is null. This lets the
-- backend and clients ship before a Firebase project exists.
--
-- Setup once a Firebase project is ready:
--   1. Deploy the edge function:  supabase functions deploy send-push
--      with secrets FCM_SERVICE_ACCOUNT (service account JSON) and PUSH_SECRET.
--   2. Point the backend at it:
--        update public.push_config
--           set url = 'https://<ref>.functions.supabase.co/send-push',
--               secret = '<PUSH_SECRET>',
--               enabled = true;
--
-- push_config has RLS enabled with no policies, so it is only readable by
-- SECURITY DEFINER functions and the service role. The secret never leaks to
-- authenticated clients.

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Device tokens
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);

create index if not exists idx_push_tokens_profile on public.push_tokens (profile_id);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_self_read on public.push_tokens;
create policy push_tokens_self_read on public.push_tokens
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());

drop policy if exists push_tokens_self_insert on public.push_tokens;
create policy push_tokens_self_insert on public.push_tokens
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists push_tokens_self_update on public.push_tokens;
create policy push_tokens_self_update on public.push_tokens
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists push_tokens_self_delete on public.push_tokens;
create policy push_tokens_self_delete on public.push_tokens
  for delete to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Dispatch configuration (no policies: definer / service role only)
-- ---------------------------------------------------------------------------

create table if not exists public.push_config (
  id boolean primary key default true,
  url text,
  secret text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint push_config_single_row check (id = true)
);

insert into public.push_config (id) values (true) on conflict (id) do nothing;

alter table public.push_config enable row level security;

-- The secret is a shared value the edge function checks. Generate with:
--   openssl rand -hex 32
comment on table public.push_config is
  'Push dispatch endpoint. RLS enabled with no policies; definer-only.';

-- ---------------------------------------------------------------------------
-- Dispatch + notification functions
-- ---------------------------------------------------------------------------

create or replace function public.dispatch_push(
  p_profile_id uuid,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  v_enabled boolean;
begin
  select c.url, c.secret, c.enabled into v_url, v_secret, v_enabled
    from public.push_config c limit 1;

  if not coalesce(v_enabled, false) or v_url is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object(
      'profile_id', p_profile_id,
      'title', p_title,
      'body', p_body,
      'data', coalesce(p_data, '{}'::jsonb)
    )
  );
end;
$$;

-- Fan out a new request to verified, online drivers of the matching vehicle type.
create or replace function public.notify_drivers_of_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'requested' then
    perform public.dispatch_push(
      d.profile_id,
      'New ride request',
      coalesce(new.origin_label, 'Pickup') || ' → ' || coalesce(new.dest_label, 'Dropoff'),
      jsonb_build_object('booking_id', new.id, 'type', 'request')
    )
    from public.drivers d
    join public.vehicles v on v.driver_id = d.id
    where d.status = 'verified'
      and d.is_online
      and v.verified
      and v.type = new.vehicle_type;
  end if;
  return new;
end;
$$;

drop trigger if exists on_booking_request_notify on public.bookings;
create trigger on_booking_request_notify
  after insert on public.bookings
  for each row execute function public.notify_drivers_of_request();

-- Tell the passenger when their ride changes state.
create or replace function public.notify_passenger_on_booking_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  v_title := case new.status
    when 'assigned' then 'Driver on the way'
    when 'arrived' then 'Driver has arrived'
    when 'in_progress' then 'Trip started'
    when 'completed' then 'Trip completed'
    when 'cancelled' then 'Ride cancelled'
    when 'expired' then 'No driver accepted'
    when 'no_show' then 'Marked as no-show'
    else null
  end;

  if v_title is not null then
    perform public.dispatch_push(
      new.passenger_id,
      v_title,
      coalesce(new.origin_label, 'Pickup') || ' → ' || coalesce(new.dest_label, 'Dropoff'),
      jsonb_build_object('booking_id', new.id, 'status', new.status, 'type', 'status')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_booking_update_notify on public.bookings;
create trigger on_booking_update_notify
  after update on public.bookings
  for each row execute function public.notify_passenger_on_booking_update();
