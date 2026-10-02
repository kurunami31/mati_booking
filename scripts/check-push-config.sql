select enabled, (url is not null) as has_url,
       (select count(*) from public.push_tokens) as tokens
  from public.push_config;
