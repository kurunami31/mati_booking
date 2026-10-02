select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
 order by tablename;
