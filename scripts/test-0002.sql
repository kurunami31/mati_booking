-- Behavioral test for migration 0002. Wrapped in a transaction that is rolled
-- back, so it leaves no data behind.
begin;

create temp table _t (name text, value text) on commit drop;

do $$
declare
  v_passenger uuid;
  v_driver uuid;
  v_booking uuid;
  v_status text;
  v_online boolean;
  v_before integer;
  v_after integer;
  v_rating text;
  v_count text;
  v_completed_booking uuid;
  v_completed_driver uuid;
begin
  select id into v_passenger from public.profiles where role = 'passenger' limit 1;
  select id into v_driver from public.drivers limit 1;

  -- 1. stale request expires
  insert into public.bookings (passenger_id, vehicle_type, fare, status, requested_at)
  values (v_passenger, 'tricycle', 15, 'requested', now() - interval '30 minutes')
  returning id into v_booking;

  perform public.expire_stale_requests();
  select status::text into v_status from public.bookings where id = v_booking;
  insert into _t values ('1_expired_status', v_status);

  -- 2. stale presence goes offline
  update public.drivers set is_online = true, last_seen = now() - interval '30 minutes'
   where id = v_driver;
  perform public.expire_stale_presence();
  select is_online into v_online from public.drivers where id = v_driver;
  insert into _t values ('2_online_after_expiry', v_online::text);

  -- 3. completed event increments driver counter
  update public.bookings set driver_id = v_driver where id = v_booking;
  select completed_count into v_before from public.drivers where id = v_driver;
  insert into public.trip_events (booking_id, event_type, actor_id)
  values (v_booking, 'completed', null);
  select completed_count into v_after from public.drivers where id = v_driver;
  insert into _t values ('3_driver_completed_before', v_before::text);
  insert into _t values ('3_driver_completed_after', v_after::text);

  -- 4. rating aggregation updates the driver
  select b.id, b.driver_id into v_completed_booking, v_completed_driver
    from public.bookings b
   where b.status = 'completed' and b.driver_id is not null
   limit 1;

  if v_completed_booking is not null then
    delete from public.ratings
     where booking_id = v_completed_booking and rater_role = 'passenger';
    insert into public.ratings (booking_id, rater_role, rater_id, stars)
    values (v_completed_booking, 'passenger', v_passenger, 4);
    select rating::text, rating_count::text into v_rating, v_count
      from public.drivers where id = v_completed_driver;
    insert into _t values ('4_driver_rating', coalesce(v_rating, 'null'));
    insert into _t values ('4_driver_rating_count', coalesce(v_count, 'null'));
  else
    insert into _t values ('4_driver_rating', 'no completed booking to test');
  end if;
end $$;

select name, value from _t order by name;

rollback;
