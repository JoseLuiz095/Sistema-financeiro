begin;

-- =========================================================
-- AGENDAMENTOS FINANCEIROS
-- =========================================================
create table if not exists public.scheduled_transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    account_id uuid not null references public.financial_accounts(id) on delete restrict,
    category_id uuid references public.categories(id) on delete set null,

    title text not null,
    description text not null,
    counterparty text,

    transaction_type text not null check (
        transaction_type in (
            'INCOME',
            'EXPENSE',
            'OWN_TRANSFER_IN',
            'OWN_TRANSFER_OUT',
            'INVESTMENT_CONTRIBUTION',
            'INVESTMENT_REDEMPTION',
            'DIVIDEND',
            'INTEREST_ON_EQUITY',
            'FII_INCOME',
            'REFUND',
            'REVERSAL',
            'ADJUSTMENT'
        )
    ),

    amount numeric(18,2) not null check (amount <> 0),

    recurrence_type text not null check (
        recurrence_type in ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')
    ),
    recurrence_interval integer not null default 1 check (recurrence_interval between 1 and 120),

    start_date date not null,
    end_date date,
    day_of_month integer check (day_of_month between 1 and 31),
    weekday integer check (weekday between 0 and 6),

    auto_post boolean not null default false,
    reminder_days integer not null default 3 check (reminder_days between 0 and 365),
    active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    check (end_date is null or end_date >= start_date)
);

create index if not exists idx_scheduled_transactions_user_active
    on public.scheduled_transactions (user_id, active, start_date);

create index if not exists idx_scheduled_transactions_account
    on public.scheduled_transactions (account_id);

-- =========================================================
-- OCORRÊNCIAS FUTURAS GERADAS
-- =========================================================
create table if not exists public.scheduled_occurrences (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    schedule_id uuid not null references public.scheduled_transactions(id) on delete cascade,

    due_date date not null,
    amount numeric(18,2) not null check (amount <> 0),

    status text not null default 'PENDING' check (
        status in ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'SKIPPED')
    ),

    actual_transaction_id uuid references public.transactions(id) on delete set null,
    generated_at timestamptz not null default now(),
    paid_at timestamptz,
    updated_at timestamptz not null default now(),

    unique (schedule_id, due_date)
);

create index if not exists idx_scheduled_occurrences_user_due
    on public.scheduled_occurrences (user_id, due_date, status);

create index if not exists idx_scheduled_occurrences_schedule
    on public.scheduled_occurrences (schedule_id, due_date);

-- =========================================================
-- CONEXÕES E HISTÓRICO DE SINCRONIZAÇÃO
-- =========================================================
create table if not exists public.bank_connections (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    account_id uuid not null references public.financial_accounts(id) on delete cascade,

    provider text not null check (
        provider in ('CUSTOM_WEBHOOK', 'BELVO', 'PLUGGY', 'OTHER')
    ),
    connection_name text not null,
    institution text,
    external_connection_id text,

    status text not null default 'PENDING' check (
        status in ('PENDING', 'ACTIVE', 'ERROR', 'EXPIRED', 'DISABLED')
    ),

    webhook_token_hash text,
    consent_expires_at timestamptz,
    last_sync_at timestamptz,
    next_sync_at timestamptz,
    sync_enabled boolean not null default true,

    settings jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (user_id, provider, connection_name)
);

create unique index if not exists idx_bank_connections_webhook_token_hash
    on public.bank_connections (webhook_token_hash)
    where webhook_token_hash is not null;

create index if not exists idx_bank_connections_user_status
    on public.bank_connections (user_id, status, sync_enabled);

create table if not exists public.bank_sync_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    connection_id uuid not null references public.bank_connections(id) on delete cascade,

    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null check (
        status in ('RUNNING', 'SUCCESS', 'WARNING', 'ERROR')
    ),

    imported_records integer not null default 0,
    skipped_records integer not null default 0,
    error_message text,
    details jsonb not null default '{}'::jsonb
);

create index if not exists idx_bank_sync_logs_user_started
    on public.bank_sync_logs (user_id, started_at desc);

create index if not exists idx_bank_sync_logs_connection_started
    on public.bank_sync_logs (connection_id, started_at desc);

-- =========================================================
-- FUNÇÃO INTERNA: GERA OCORRÊNCIAS PARA UM USUÁRIO
-- =========================================================
create or replace function public.generate_scheduled_occurrences_internal(
    p_user_id uuid,
    p_horizon_days integer default 365
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_schedule record;
    v_date date;
    v_limit date;
    v_last_day integer;
    v_month_diff integer;
    v_year_diff integer;
    v_due boolean;
    v_inserted integer := 0;
    v_row_count integer := 0;
begin
    if p_user_id is null then
        return 0;
    end if;

    if p_horizon_days < 1 or p_horizon_days > 3650 then
        raise exception 'O horizonte deve estar entre 1 e 3650 dias.';
    end if;

    v_limit := current_date + p_horizon_days;

    for v_schedule in
        select *
        from public.scheduled_transactions
        where user_id = p_user_id
          and active = true
          and start_date <= v_limit
          and (end_date is null or end_date >= current_date - 365)
    loop
        v_date := v_schedule.start_date;

        while v_date <= v_limit
          and (v_schedule.end_date is null or v_date <= v_schedule.end_date)
        loop
            v_due := false;

            case v_schedule.recurrence_type
                when 'ONCE' then
                    v_due := v_date = v_schedule.start_date;

                when 'DAILY' then
                    v_due := mod(
                        (v_date - v_schedule.start_date),
                        v_schedule.recurrence_interval
                    ) = 0;

                when 'WEEKLY' then
                    v_due := mod(
                        (v_date - v_schedule.start_date),
                        7 * v_schedule.recurrence_interval
                    ) = 0;

                when 'MONTHLY' then
                    v_month_diff :=
                        (extract(year from v_date)::integer - extract(year from v_schedule.start_date)::integer) * 12
                        + (extract(month from v_date)::integer - extract(month from v_schedule.start_date)::integer);

                    v_last_day := extract(
                        day from (date_trunc('month', v_date) + interval '1 month - 1 day')
                    )::integer;

                    v_due :=
                        v_month_diff >= 0
                        and mod(v_month_diff, v_schedule.recurrence_interval) = 0
                        and extract(day from v_date)::integer = least(
                            coalesce(v_schedule.day_of_month, extract(day from v_schedule.start_date)::integer),
                            v_last_day
                        );

                when 'YEARLY' then
                    v_year_diff :=
                        extract(year from v_date)::integer
                        - extract(year from v_schedule.start_date)::integer;

                    v_last_day := extract(
                        day from (date_trunc('month', v_date) + interval '1 month - 1 day')
                    )::integer;

                    v_due :=
                        v_year_diff >= 0
                        and mod(v_year_diff, v_schedule.recurrence_interval) = 0
                        and extract(month from v_date)::integer = extract(month from v_schedule.start_date)::integer
                        and extract(day from v_date)::integer = least(
                            extract(day from v_schedule.start_date)::integer,
                            v_last_day
                        );
            end case;

            if v_due then
                insert into public.scheduled_occurrences (
                    user_id,
                    schedule_id,
                    due_date,
                    amount,
                    status
                ) values (
                    v_schedule.user_id,
                    v_schedule.id,
                    v_date,
                    v_schedule.amount,
                    case when v_date < current_date then 'OVERDUE' else 'PENDING' end
                )
                on conflict (schedule_id, due_date) do nothing;

                get diagnostics v_row_count = row_count;
                v_inserted := v_inserted + v_row_count;
            end if;

            if v_schedule.recurrence_type = 'ONCE' then
                exit;
            end if;

            v_date := v_date + 1;
        end loop;
    end loop;

    return v_inserted;
end;
$$;

revoke all on function public.generate_scheduled_occurrences_internal(uuid, integer)
from public, anon, authenticated;

-- =========================================================
-- FUNÇÃO PÚBLICA: ATUALIZA AS OCORRÊNCIAS DO USUÁRIO LOGADO
-- =========================================================
create or replace function public.refresh_my_scheduled_occurrences(
    p_horizon_days integer default 365
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Usuário não autenticado.';
    end if;

    return public.generate_scheduled_occurrences_internal(auth.uid(), p_horizon_days);
end;
$$;

grant execute on function public.refresh_my_scheduled_occurrences(integer)
to authenticated;

-- =========================================================
-- FUNÇÃO: CONFIRMA UMA OCORRÊNCIA E CRIA O LANÇAMENTO REAL
-- =========================================================
create or replace function public.settle_scheduled_occurrence(
    p_occurrence_id uuid,
    p_payment_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_occurrence record;
    v_transaction_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Usuário não autenticado.';
    end if;

    select
        o.*,
        s.account_id,
        s.category_id,
        s.description,
        s.counterparty,
        s.transaction_type,
        s.title
    into v_occurrence
    from public.scheduled_occurrences o
    join public.scheduled_transactions s on s.id = o.schedule_id
    where o.id = p_occurrence_id
      and o.user_id = auth.uid()
    for update;

    if not found then
        raise exception 'Ocorrência não encontrada.';
    end if;

    if v_occurrence.actual_transaction_id is not null then
        return v_occurrence.actual_transaction_id;
    end if;

    if v_occurrence.status in ('CANCELLED', 'SKIPPED') then
        raise exception 'A ocorrência não pode ser confirmada no status atual.';
    end if;

    insert into public.transactions (
        user_id,
        account_id,
        category_id,
        transaction_date,
        original_description,
        normalized_description,
        counterparty,
        transaction_type,
        amount,
        record_hash,
        needs_review,
        reviewed,
        confidence,
        source_data
    ) values (
        auth.uid(),
        v_occurrence.account_id,
        v_occurrence.category_id,
        coalesce(p_payment_date, v_occurrence.due_date),
        v_occurrence.description,
        v_occurrence.description,
        v_occurrence.counterparty,
        v_occurrence.transaction_type,
        v_occurrence.amount,
        'scheduled:' || v_occurrence.id::text,
        false,
        true,
        100,
        jsonb_build_object(
            'source', 'SCHEDULED',
            'schedule_id', v_occurrence.schedule_id,
            'occurrence_id', v_occurrence.id,
            'due_date', v_occurrence.due_date,
            'title', v_occurrence.title
        )
    )
    returning id into v_transaction_id;

    update public.scheduled_occurrences
    set status = 'PAID',
        actual_transaction_id = v_transaction_id,
        paid_at = now(),
        updated_at = now()
    where id = v_occurrence.id;

    return v_transaction_id;
end;
$$;

grant execute on function public.settle_scheduled_occurrence(uuid, date)
to authenticated;

-- =========================================================
-- FUNÇÃO DO CRON: GERA E PROCESSA TODOS OS AGENDAMENTOS
-- =========================================================
create or replace function public.process_all_scheduled_transactions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user record;
    v_occurrence record;
    v_generated integer := 0;
    v_auto_posted integer := 0;
    v_transaction_id uuid;
begin
    for v_user in
        select distinct user_id
        from public.scheduled_transactions
        where active = true
    loop
        v_generated := v_generated
            + public.generate_scheduled_occurrences_internal(v_user.user_id, 365);
    end loop;

    update public.scheduled_occurrences
    set status = 'OVERDUE',
        updated_at = now()
    where status = 'PENDING'
      and due_date < current_date;

    for v_occurrence in
        select
            o.*,
            s.account_id,
            s.category_id,
            s.description,
            s.counterparty,
            s.transaction_type,
            s.title
        from public.scheduled_occurrences o
        join public.scheduled_transactions s on s.id = o.schedule_id
        where s.active = true
          and s.auto_post = true
          and o.status in ('PENDING', 'OVERDUE')
          and o.due_date <= current_date
          and o.actual_transaction_id is null
        for update of o skip locked
    loop
        insert into public.transactions (
            user_id,
            account_id,
            category_id,
            transaction_date,
            original_description,
            normalized_description,
            counterparty,
            transaction_type,
            amount,
            record_hash,
            needs_review,
            reviewed,
            confidence,
            source_data
        ) values (
            v_occurrence.user_id,
            v_occurrence.account_id,
            v_occurrence.category_id,
            v_occurrence.due_date,
            v_occurrence.description,
            v_occurrence.description,
            v_occurrence.counterparty,
            v_occurrence.transaction_type,
            v_occurrence.amount,
            'scheduled:' || v_occurrence.id::text,
            false,
            true,
            100,
            jsonb_build_object(
                'source', 'SCHEDULED_AUTO',
                'schedule_id', v_occurrence.schedule_id,
                'occurrence_id', v_occurrence.id,
                'due_date', v_occurrence.due_date,
                'title', v_occurrence.title
            )
        )
        on conflict (user_id, record_hash) do update
            set updated_at = now()
        returning id into v_transaction_id;

        update public.scheduled_occurrences
        set status = 'PAID',
            actual_transaction_id = v_transaction_id,
            paid_at = now(),
            updated_at = now()
        where id = v_occurrence.id;

        v_auto_posted := v_auto_posted + 1;
    end loop;

    return jsonb_build_object(
        'generated', v_generated,
        'auto_posted', v_auto_posted,
        'processed_at', now()
    );
end;
$$;

revoke all on function public.process_all_scheduled_transactions()
from public, anon, authenticated;

-- =========================================================
-- RLS
-- =========================================================
alter table public.scheduled_transactions enable row level security;
alter table public.scheduled_occurrences enable row level security;
alter table public.bank_connections enable row level security;
alter table public.bank_sync_logs enable row level security;

-- AGENDAMENTOS
DROP POLICY IF EXISTS "Users manage own scheduled transactions" ON public.scheduled_transactions;
CREATE POLICY "Users manage own scheduled transactions"
ON public.scheduled_transactions
FOR ALL
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.financial_accounts a
        where a.id = account_id
          and a.user_id = (select auth.uid())
    )
    and (
        category_id is null
        or exists (
            select 1
            from public.categories c
            where c.id = category_id
              and c.user_id = (select auth.uid())
        )
    )
);

-- OCORRÊNCIAS
DROP POLICY IF EXISTS "Users select own scheduled occurrences" ON public.scheduled_occurrences;
CREATE POLICY "Users select own scheduled occurrences"
ON public.scheduled_occurrences
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users update own scheduled occurrences" ON public.scheduled_occurrences;
CREATE POLICY "Users update own scheduled occurrences"
ON public.scheduled_occurrences
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- CONEXÕES
DROP POLICY IF EXISTS "Users manage own bank connections" ON public.bank_connections;
CREATE POLICY "Users manage own bank connections"
ON public.bank_connections
FOR ALL
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.financial_accounts a
        where a.id = account_id
          and a.user_id = (select auth.uid())
    )
);

-- LOGS
DROP POLICY IF EXISTS "Users select own bank sync logs" ON public.bank_sync_logs;
CREATE POLICY "Users select own bank sync logs"
ON public.bank_sync_logs
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

revoke all on public.scheduled_transactions,
              public.scheduled_occurrences,
              public.bank_connections,
              public.bank_sync_logs
from anon;

grant select, insert, update, delete
on public.scheduled_transactions,
   public.bank_connections
to authenticated;

grant select, update
on public.scheduled_occurrences
to authenticated;

grant select
on public.bank_sync_logs
to authenticated;

commit;
