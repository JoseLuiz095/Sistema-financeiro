-- Execute este arquivo somente depois de habilitar o módulo Cron no Supabase:
-- Dashboard > Integrations > Cron > Enable.

create extension if not exists pg_cron;

-- Remove uma versão anterior do mesmo job, caso exista.
do $$
declare
    v_job_id bigint;
begin
    select jobid
      into v_job_id
      from cron.job
     where jobname = 'process-financial-schedules'
     limit 1;

    if v_job_id is not null then
        perform cron.unschedule(v_job_id);
    end if;
end;
$$;

-- 09:00 UTC corresponde a 06:00 no horário de Brasília (UTC-3).
select cron.schedule(
    'process-financial-schedules',
    '0 9 * * *',
    $$select public.process_all_scheduled_transactions();$$
);
