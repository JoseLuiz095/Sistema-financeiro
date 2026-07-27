begin;

-- =========================================================
-- HISTORICO DE SINCRONIZACOES MANUAIS DO OPEN FINANCE
-- =========================================================
create table if not exists public.open_finance_sync_logs (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    connection_id uuid not null
        references public.open_finance_connections(id)
        on delete cascade,

    started_at timestamptz not null default now(),
    finished_at timestamptz,

    status text not null default 'RUNNING'
        check (status in ('RUNNING', 'SUCCESS', 'PARTIAL', 'ERROR')),

    period_from date,
    period_to date,

    accounts_received integer not null default 0,
    bank_accounts integer not null default 0,
    credit_cards integer not null default 0,
    bank_transactions integer not null default 0,
    card_transactions integer not null default 0,
    bills integer not null default 0,
    pending_card_transactions integer not null default 0,

    error_message text,
    details jsonb not null default '{}'::jsonb
);

create index if not exists idx_open_finance_sync_logs_user_started
    on public.open_finance_sync_logs (user_id, started_at desc);

create index if not exists idx_open_finance_sync_logs_connection_started
    on public.open_finance_sync_logs (connection_id, started_at desc);

alter table public.open_finance_sync_logs enable row level security;

drop policy if exists "Users read their open finance sync logs"
    on public.open_finance_sync_logs;
create policy "Users read their open finance sync logs"
on public.open_finance_sync_logs
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Logs sao gravados pela Edge Function usando a chave administrativa.
-- O frontend autenticado recebe somente SELECT.
revoke all on public.open_finance_sync_logs from anon;
grant select on public.open_finance_sync_logs to authenticated;

-- Marca as conexoes atuais como sincronizacao manual durante esta fase.
update public.open_finance_connections
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'sync_mode', 'MANUAL',
    'automatic_sync_enabled', false
)
where provider = 'PLUGGY';

commit;

notify pgrst, 'reload schema';
