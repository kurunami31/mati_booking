with checks as (
  select 'table_route_cache' as name,
         exists (select 1 from information_schema.tables where table_schema='public' and table_name='route_cache') ok
  union all select 'table_saved_places',
    exists (select 1 from information_schema.tables where table_schema='public' and table_name='saved_places')
  union all select 'table_wallets',
    exists (select 1 from information_schema.tables where table_schema='public' and table_name='wallets')
  union all select 'table_wallet_transactions',
    exists (select 1 from information_schema.tables where table_schema='public' and table_name='wallet_transactions')
  union all select 'payments.provider',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='provider')
  union all select 'payments.provider_ref',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='provider_ref')
  union all select 'payments.paid_at',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='paid_at')
  union all select 'drivers.photo_url',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='drivers' and column_name='photo_url')
  union all select 'fn_upsert_payment_paid',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='upsert_payment_paid')
  union all select 'fn_wallet_topup',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='wallet_topup')
  union all select 'fn_wallet_pay_booking',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='wallet_pay_booking')
  union all select 'fn_mock_ewallet_pay',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='mock_ewallet_pay')
  union all select 'enum_paid',
    exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='payment_status' and e.enumlabel='paid')
  union all select 'enum_awaiting_payment',
    exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='payment_status' and e.enumlabel='awaiting_payment')
  union all select 'bucket_driver_photos',
    exists (select 1 from storage.buckets where id='driver-photos')
  union all select 'storage_policies_driver_photos',
    ((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'driver_photos%') > 0)
)
select name, ok from checks order by name;
