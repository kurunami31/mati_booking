select jobname, schedule, active from cron.job where jobname like 'sakayta%' order by jobname;
