begin;

-- =========================================================
-- POSICOES DE INVESTIMENTOS IMPORTADAS PELO OPEN FINANCE
--
-- Essas tabelas representam o retrato recebido da instituicao.
-- Elas nao substituem as operacoes manuais nem o preco medio fiscal.
-- =========================================================
create table if not exists public.open_finance_investment_positions (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    connection_id uuid not null
        references public.open_finance_connections(id)
        on delete cascade,

    asset_id uuid
        references public.assets(id)
        on delete set null,

    provider_investment_id text not null,
    provider_item_id text,
    provider_id text,

    investment_name text not null,
    investment_code text,
    isin text,
    investment_number text,
    owner_name text,

    investment_type text not null,
    investment_subtype text,
    status text,
    is_current boolean not null default true,
    currency text not null default 'BRL',

    reference_date date,
    unit_value numeric(20,8),
    quantity numeric(20,8),
    gross_amount numeric(18,2),
    net_balance numeric(18,2),
    original_amount numeric(18,2),
    profit_amount numeric(18,2),
    withdrawal_amount numeric(18,2),

    income_taxes numeric(18,2),
    financial_taxes numeric(18,2),

    due_date date,
    issuer text,
    issue_date date,
    rate numeric(20,8),
    rate_type text,
    fixed_annual_rate numeric(20,8),
    last_month_rate numeric(20,8),
    last_twelve_months_rate numeric(20,8),
    annual_rate numeric(20,8),

    institution_name text,
    institution_number text,

    source_data jsonb not null default '{}'::jsonb,
    synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (connection_id, provider_investment_id)
);

create index if not exists idx_of_investment_positions_user_type
    on public.open_finance_investment_positions (
        user_id,
        investment_type,
        investment_subtype
    );

create index if not exists idx_of_investment_positions_connection
    on public.open_finance_investment_positions (
        connection_id,
        synced_at desc
    );

create index if not exists idx_of_investment_positions_asset
    on public.open_finance_investment_positions (asset_id)
    where asset_id is not null;

-- =========================================================
-- MOVIMENTACOES DAS POSICOES IMPORTADAS
-- =========================================================
create table if not exists public.open_finance_investment_transactions (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    connection_id uuid not null
        references public.open_finance_connections(id)
        on delete cascade,

    position_id uuid not null
        references public.open_finance_investment_positions(id)
        on delete cascade,

    provider_transaction_id text,
    record_key text not null,

    transaction_date date,
    trade_date date,
    transaction_type text not null check (
        transaction_type in (
            'BUY',
            'SELL',
            'TAX',
            'TRANSFER',
            'INTEREST',
            'AMORTIZATION',
            'OTHER'
        )
    ),

    description text,
    quantity numeric(20,8),
    unit_value numeric(20,8),
    gross_amount numeric(18,2),
    net_amount numeric(18,2),
    brokerage_number text,

    expenses jsonb not null default '{}'::jsonb,
    source_data jsonb not null default '{}'::jsonb,
    synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (position_id, record_key)
);

create index if not exists idx_of_investment_transactions_user_date
    on public.open_finance_investment_transactions (
        user_id,
        transaction_date desc
    );

create index if not exists idx_of_investment_transactions_position_date
    on public.open_finance_investment_transactions (
        position_id,
        transaction_date desc
    );

-- =========================================================
-- CONTADORES NO LOG DA SINCRONIZACAO MANUAL
-- =========================================================
alter table public.open_finance_sync_logs
    add column if not exists investments integer not null default 0;

alter table public.open_finance_sync_logs
    add column if not exists investment_transactions integer not null default 0;

-- =========================================================
-- RLS
-- =========================================================
alter table public.open_finance_investment_positions enable row level security;
alter table public.open_finance_investment_transactions enable row level security;

drop policy if exists "Users read their open finance investment positions"
    on public.open_finance_investment_positions;
create policy "Users read their open finance investment positions"
on public.open_finance_investment_positions
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users read their open finance investment transactions"
    on public.open_finance_investment_transactions;
create policy "Users read their open finance investment transactions"
on public.open_finance_investment_transactions
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all
on public.open_finance_investment_positions,
   public.open_finance_investment_transactions
from anon;

grant select
on public.open_finance_investment_positions
to authenticated;

grant select
on public.open_finance_investment_transactions
to authenticated;

commit;

notify pgrst, 'reload schema';
