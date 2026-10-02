select
  (select string_agg(extname, ', ' order by extname) from pg_extension) as enabled_extensions,
  (select string_agg(name, ', ' order by name)
     from pg_available_extensions
    where name in ('pg_cron', 'pg_net')) as scheduling_available;
