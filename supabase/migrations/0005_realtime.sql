-- SakayTa — Realtime publication (migration 0005)
--
-- The client apps use Supabase Realtime streams for:
--   * new ride requests on the driver dashboard
--   * the accepted trip appearing on the driver trip screen
--   * passenger status changes and live driver tracking
--   * SOS alerts, payments, wallet balance and transactions
--
-- The supabase_realtime publication had no tables, so none of this updated
-- live. This adds the tables and sets REPLICA IDENTITY FULL so RLS checks work
-- for update/delete events (required when filtering on non-primary-key columns).

do $$
declare
  t text;
  tables text[] := array[
    'bookings',
    'drivers',
    'vehicles',
    'profiles',
    'sos_alerts',
    'payments',
    'wallets',
    'wallet_transactions'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
