begin;

-- =========================================================
-- ATIVOS
-- =========================================================
create table if not exists public.assets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ticker text not null,
    asset_name text,
    asset_type text not null check (
        asset_type in (
            'STOCK',
            'FII',
            'ETF',
            'BDR',
            'FIXED_INCOME',
            'TREASURY',
            'FUND',
            'CRYPTO',
            'OTHER'
        )
    ),
    market text not null default 'B3',
    currency text not null default 'BRL',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, ticker, market)
);

create index if not exists idx_assets_user_ticker
    on public.assets (user_id, ticker);

-- =========================================================
-- OPERAÇÕES DE INVESTIMENTO
-- =========================================================
create table if not exists public.investment_operations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    asset_id uuid not null references public.assets(id) on delete restrict,
    account_id uuid references public.financial_accounts(id) on delete set null,
    import_id uuid references public.imports(id) on delete set null,

    operation_date date not null,
    operation_type text not null check (
        operation_type in (
            'BUY',
            'SELL',
            'TRANSFER_IN',
            'TRANSFER_OUT',
            'BONUS'
        )
    ),
    trade_type text not null default 'NORMAL' check (
        trade_type in ('NORMAL', 'DAY_TRADE')
    ),

    quantity numeric(20,8) not null check (quantity > 0),
    unit_price numeric(20,8) not null default 0 check (unit_price >= 0),

    brokerage_fee numeric(18,2) not null default 0 check (brokerage_fee >= 0),
    exchange_fee numeric(18,2) not null default 0 check (exchange_fee >= 0),
    taxes numeric(18,2) not null default 0 check (taxes >= 0),
    other_costs numeric(18,2) not null default 0 check (other_costs >= 0),

    gross_value numeric(18,2) not null check (gross_value >= 0),
    net_value numeric(18,2) not null,

    notes text,
    record_hash text not null,
    source_data jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (user_id, record_hash)
);

create index if not exists idx_investment_operations_user_date
    on public.investment_operations (user_id, operation_date desc);

create index if not exists idx_investment_operations_asset_date
    on public.investment_operations (asset_id, operation_date, created_at);

-- =========================================================
-- COTAÇÕES
-- =========================================================
create table if not exists public.market_quotes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    asset_id uuid not null references public.assets(id) on delete cascade,
    quote_date date not null,
    close_price numeric(20,8) not null check (close_price > 0),
    source text,
    created_at timestamptz not null default now(),
    unique (user_id, asset_id, quote_date)
);

create index if not exists idx_market_quotes_asset_date
    on public.market_quotes (asset_id, quote_date desc);

-- =========================================================
-- PROVENTOS
-- =========================================================
create table if not exists public.investment_income (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    asset_id uuid not null references public.assets(id) on delete restrict,
    account_id uuid references public.financial_accounts(id) on delete set null,
    import_id uuid references public.imports(id) on delete set null,

    payment_date date not null,
    income_type text not null check (
        income_type in (
            'DIVIDEND',
            'INTEREST_ON_EQUITY',
            'FII_INCOME',
            'RENTAL',
            'AMORTIZATION',
            'OTHER'
        )
    ),
    quantity_reference numeric(20,8),
    gross_value numeric(18,2) not null check (gross_value >= 0),
    withholding_tax numeric(18,2) not null default 0 check (withholding_tax >= 0),
    net_value numeric(18,2) not null check (net_value >= 0),

    notes text,
    record_hash text not null,
    source_data jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    unique (user_id, record_hash)
);

create index if not exists idx_investment_income_user_date
    on public.investment_income (user_id, payment_date desc);

create index if not exists idx_investment_income_asset_date
    on public.investment_income (asset_id, payment_date desc);

-- =========================================================
-- RLS
-- =========================================================
alter table public.assets enable row level security;
alter table public.investment_operations enable row level security;
alter table public.market_quotes enable row level security;
alter table public.investment_income enable row level security;

-- ATIVOS
DROP POLICY IF EXISTS "Users manage own assets" ON public.assets;
CREATE POLICY "Users manage own assets"
ON public.assets
FOR ALL
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- OPERAÇÕES
DROP POLICY IF EXISTS "Users select own investment operations" ON public.investment_operations;
CREATE POLICY "Users select own investment operations"
ON public.investment_operations
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own investment operations" ON public.investment_operations;
CREATE POLICY "Users insert own investment operations"
ON public.investment_operations
FOR INSERT
TO authenticated
WITH CHECK (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.assets a
        where a.id = asset_id
          and a.user_id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "Users update own investment operations" ON public.investment_operations;
CREATE POLICY "Users update own investment operations"
ON public.investment_operations
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.assets a
        where a.id = asset_id
          and a.user_id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "Users delete own investment operations" ON public.investment_operations;
CREATE POLICY "Users delete own investment operations"
ON public.investment_operations
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- COTAÇÕES
DROP POLICY IF EXISTS "Users manage own market quotes" ON public.market_quotes;
CREATE POLICY "Users manage own market quotes"
ON public.market_quotes
FOR ALL
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.assets a
        where a.id = asset_id
          and a.user_id = (select auth.uid())
    )
);

-- PROVENTOS
DROP POLICY IF EXISTS "Users select own investment income" ON public.investment_income;
CREATE POLICY "Users select own investment income"
ON public.investment_income
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own investment income" ON public.investment_income;
CREATE POLICY "Users insert own investment income"
ON public.investment_income
FOR INSERT
TO authenticated
WITH CHECK (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.assets a
        where a.id = asset_id
          and a.user_id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "Users update own investment income" ON public.investment_income;
CREATE POLICY "Users update own investment income"
ON public.investment_income
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.assets a
        where a.id = asset_id
          and a.user_id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "Users delete own investment income" ON public.investment_income;
CREATE POLICY "Users delete own investment income"
ON public.investment_income
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

revoke all on public.assets,
              public.investment_operations,
              public.market_quotes,
              public.investment_income
from anon;

grant select, insert, update, delete
on public.assets,
   public.investment_operations,
   public.market_quotes,
   public.investment_income
to authenticated;

commit;
