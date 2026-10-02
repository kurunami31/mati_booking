-- SakayTa — feature migration 0004
--
-- Adds the Grab-style feature set:
--   * route_cache        — cached OpenRouteService results
--   * saved_places       — Home / Work / other saved destinations
--   * wallets / wallet_transactions — mock in-app wallet (GrabPay-style)
--   * payments columns    — provider / provider_ref / checkout_url / paid_at
--   * drivers.photo_url   — driver selfie (vehicle photo uses vehicles.photo_url)
--   * storage bucket      — driver-photos (private, signed URLs)
--   * RPCs                — wallet_topup, wallet_pay_booking, mock_ewallet_pay
--
-- Payment is simulated in this phase. A real gateway (PayMongo/Xendit) can
-- replace mock_ewallet_pay later without schema or UI changes.

-- New payment statuses. Each enum value must be added in its own transaction.
alter type payment_status add value if not exists 'awaiting_payment';
--;;;
alter type payment_status add value if not exists 'paid';
--;;;
alter type payment_status add value if not exists 'failed';
--;;;

-- ---------------------------------------------------------------------------
-- Route cache (service-role / definer only; no client access)
-- ---------------------------------------------------------------------------

create table if not exists public.route_cache (
  id uuid primary key default gen_random_uuid(),
  origin_key text not null,
  dest_key text not null,
  distance_m integer not null,
  duration_s integer not null,
  geometry jsonb not null,
  created_at timestamptz not null default now(),
  unique (origin_key, dest_key)
);

alter table public.route_cache enable row level security;

-- ---------------------------------------------------------------------------
-- Saved places
-- ---------------------------------------------------------------------------

create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'other' check (kind in ('home', 'work', 'other')),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

alter table public.saved_places enable row level security;

drop policy if exists saved_places_read on public.saved_places;
create policy saved_places_read on public.saved_places
  for select to authenticated using (passenger_id = auth.uid() or public.is_admin());

drop policy if exists saved_places_insert on public.saved_places;
create policy saved_places_insert on public.saved_places
  for insert to authenticated with check (passenger_id = auth.uid());

drop policy if exists saved_places_update on public.saved_places;
create policy saved_places_update on public.saved_places
  for update to authenticated using (passenger_id = auth.uid()) with check (passenger_id = auth.uid());

drop policy if exists saved_places_delete on public.saved_places;
create policy saved_places_delete on public.saved_places
  for delete to authenticated using (passenger_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Mock wallet
-- ---------------------------------------------------------------------------

create table if not exists public.wallets (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  balance numeric(10, 2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('topup', 'ride_payment', 'refund')),
  amount numeric(10, 2) not null,
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists wallets_read on public.wallets;
create policy wallets_read on public.wallets
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());

drop policy if exists wallet_tx_read on public.wallet_transactions;
create policy wallet_tx_read on public.wallet_transactions
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());

-- Writes happen only through the SECURITY DEFINER RPCs below.

-- ---------------------------------------------------------------------------
-- Payments + driver photo columns
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists provider text,
  add column if not exists provider_ref text,
  add column if not exists checkout_url text,
  add column if not exists paid_at timestamptz;

alter table public.drivers
  add column if not exists photo_url text;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Create or refresh a payment row for a booking, computed like transition_booking.
create or replace function public.upsert_payment_paid(
  p_booking_id uuid,
  p_provider text,
  p_provider_ref text
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_rate numeric := public.setting_numeric('commission_rate', 0.10);
  v_commission numeric(10, 2);
  v_payment public.payments;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;

  v_commission := round(v_booking.fare * v_rate, 2);

  insert into public.payments (booking_id, method, amount, commission, driver_net, status,
                               provider, provider_ref, paid_at)
  values (p_booking_id, 'ewallet', v_booking.fare, v_commission, v_booking.fare - v_commission,
          'paid', p_provider, p_provider_ref, now())
  on conflict (booking_id) do update
    set method = 'ewallet',
        amount = excluded.amount,
        commission = excluded.commission,
        driver_net = excluded.driver_net,
        status = 'paid',
        provider = excluded.provider,
        provider_ref = excluded.provider_ref,
        paid_at = now()
  returning * into v_payment;

  update public.bookings set payment_method = 'ewallet' where id = p_booking_id;

  return v_payment;
end;
$$;

-- Mock wallet top-up (no real money moves).
create or replace function public.wallet_topup(p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(10, 2);
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Top-up amount must be positive';
  end if;

  insert into public.wallets (profile_id, balance)
  values (auth.uid(), p_amount)
  on conflict (profile_id) do update
    set balance = public.wallets.balance + excluded.balance,
        updated_at = now()
  returning balance into v_balance;

  insert into public.wallet_transactions (profile_id, kind, amount)
  values (auth.uid(), 'topup', p_amount);

  return v_balance;
end;
$$;

-- Pay a booking from the in-app wallet.
create or replace function public.wallet_pay_booking(p_booking_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_balance numeric(10, 2);
  v_payment public.payments;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.passenger_id <> auth.uid() then
    raise exception 'Not your booking';
  end if;
  if v_booking.status in ('cancelled', 'expired', 'no_show') then
    raise exception 'Booking is closed';
  end if;

  select balance into v_balance from public.wallets where profile_id = auth.uid();
  if v_balance is null or v_balance < v_booking.fare then
    raise exception 'Insufficient wallet balance';
  end if;

  update public.wallets
     set balance = balance - v_booking.fare,
         updated_at = now()
   where profile_id = auth.uid();

  insert into public.wallet_transactions (profile_id, kind, amount, booking_id)
  values (auth.uid(), 'ride_payment', v_booking.fare, p_booking_id);

  v_payment := public.upsert_payment_paid(p_booking_id, 'wallet', 'WALLET-' || p_booking_id::text);

  return v_payment;
end;
$$;

-- Mock external e-wallet payment (stands in for GCash/Maya until a gateway is wired).
create or replace function public.mock_ewallet_pay(p_booking_id uuid, p_provider text)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_payment public.payments;
  v_provider text := coalesce(nullif(trim(p_provider), ''), 'gcash');
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found';
  end if;
  if v_booking.passenger_id <> auth.uid() then
    raise exception 'Not your booking';
  end if;

  v_payment := public.upsert_payment_paid(
    p_booking_id,
    v_provider,
    'MOCK-' || upper(v_provider) || '-' || substr(md5(random()::text), 1, 10)
  );

  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: driver-photos (private; clients use signed URLs)
-- Path convention: {profile_id}/profile.<ext>, {profile_id}/vehicle.<ext>
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('driver-photos', 'driver-photos', false)
on conflict (id) do nothing;

drop policy if exists driver_photos_read on storage.objects;
create policy driver_photos_read on storage.objects
  for select to authenticated using (
    bucket_id = 'driver-photos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1
        from public.drivers d
        join public.bookings b on b.driver_id = d.id
        where d.profile_id::text = (storage.foldername(name))[1]
          and b.passenger_id = auth.uid()
      )
    )
  );

drop policy if exists driver_photos_insert on storage.objects;
create policy driver_photos_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'driver-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists driver_photos_update on storage.objects;
create policy driver_photos_update on storage.objects
  for update to authenticated using (
    bucket_id = 'driver-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists driver_photos_delete on storage.objects;
create policy driver_photos_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'driver-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
