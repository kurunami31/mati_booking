with checks as (
  select 'enum_booking_status_expired' as check_name,
         exists (
           select 1 from pg_enum e
           join pg_type t on t.oid = e.enumtypid
           where t.typname = 'booking_status' and e.enumlabel = 'expired'
         ) as ok
  union all select 'fn_expire_stale_requests',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'expire_stale_requests')
  union all select 'fn_expire_stale_presence',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'expire_stale_presence')
  union all select 'fn_apply_driver_rating',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'apply_driver_rating')
  union all select 'fn_apply_trip_event_counters',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'apply_trip_event_counters')
  union all select 'trigger_on_rating_insert',
    exists (select 1 from pg_trigger where tgname = 'on_rating_insert' and not tgisinternal)
  union all select 'trigger_on_trip_event_counters',
    exists (select 1 from pg_trigger where tgname = 'on_trip_event_counters' and not tgisinternal)
  union all select 'col_drivers_completed_count',
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'drivers' and column_name = 'completed_count')
  union all select 'col_profiles_no_show_count',
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'profiles' and column_name = 'no_show_count')
  union all select 'setting_request_expiry_minutes',
    exists (select 1 from public.app_settings where key = 'request_expiry_minutes')
  union all select 'setting_presence_expiry_minutes',
    exists (select 1 from public.app_settings where key = 'presence_expiry_minutes')
)
select check_name, ok from checks order by check_name;
