begin;

create extension if not exists pgcrypto;

-- =========================================================
-- FUNCAO PADRAO PARA ATUALIZAR updated_at
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- =========================================================
-- CONEXOES COM AGREGADORES OPEN FINANCE
-- Exemplos de provider: PLUGGY, BELVO, KLAVI, OTHER
-- =========================================================

create table if not exists public.open_finance_connections (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    provider text not null,
    provider_item_id text not null,

    institution_id text,
    institution_name text not null,
    institution_logo_url text,

    consent_id text,
    consent_status text not null default 'PENDING'
        check (
            consent_status in (
                'PENDING',
                'AWAITING_AUTHORIZATION',
                'AUTHORIZED',
                'REJECTED',
                'REVOKED',
                'EXPIRED',
                'ERROR'
            )
        ),

    consent_expires_at timestamptz,

    status text not null default 'ACTIVE'
        check (
            status in (
                'ACTIVE',
                'PAUSED',
                'DISCONNECTED',
                'ERROR'
            )
        ),

    sync_status text not null default 'NEVER'
        check (
            sync_status in (
                'NEVER',
                'PENDING',
                'RUNNING',
                'SUCCESS',
                'PARTIAL',
                'ERROR'
            )
        ),

    last_sync_at timestamptz,
    next_sync_at timestamptz,
    last_error text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (user_id, provider, provider_item_id)
);

create index if not exists idx_open_finance_connections_user
    on public.open_finance_connections (user_id, status);

create index if not exists idx_open_finance_connections_next_sync
    on public.open_finance_connections (next_sync_at)
    where status = 'ACTIVE';

-- =========================================================
-- CONTAS ENCONTRADAS PELO OPEN FINANCE
-- Vincula a conta externa a financial_accounts quando possivel.
-- =========================================================

create table if not exists public.open_finance_accounts (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    connection_id uuid not null
        references public.open_finance_connections(id)
        on delete cascade,

    financial_account_id uuid
        references public.financial_accounts(id)
        on delete set null,

    provider_account_id text not null,

    account_type text not null default 'OTHER'
        check (
            account_type in (
                'CHECKING',
                'SAVINGS',
                'PAYMENT',
                'INVESTMENT',
                'BROKERAGE',
                'CREDIT_CARD',
                'OTHER'
            )
        ),

    account_subtype text,
    account_name text,
    agency text,
    account_number text,
    currency text not null default 'BRL',

    current_balance numeric(18,2),
    available_balance numeric(18,2),
    overdraft_limit numeric(18,2),

    status text not null default 'ACTIVE'
        check (status in ('ACTIVE', 'INACTIVE', 'CLOSED', 'ERROR')),

    source_data jsonb not null default '{}'::jsonb,
    synced_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (connection_id, provider_account_id)
);

create index if not exists idx_open_finance_accounts_user
    on public.open_finance_accounts (user_id);

create index if not exists idx_open_finance_accounts_connection
    on public.open_finance_accounts (connection_id);

create index if not exists idx_open_finance_accounts_financial_account
    on public.open_finance_accounts (financial_account_id);

-- =========================================================
-- CARTOES DE CREDITO
-- =========================================================

create table if not exists public.credit_cards (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    connection_id uuid not null
        references public.open_finance_connections(id)
        on delete cascade,

    open_finance_account_id uuid
        references public.open_finance_accounts(id)
        on delete set null,

    financial_account_id uuid
        references public.financial_accounts(id)
        on delete set null,

    provider_card_id text not null,

    card_name text not null,
    brand text,
    last_four_digits text,

    closing_day smallint
        check (closing_day is null or closing_day between 1 and 31),

    due_day smallint
        check (due_day is null or due_day between 1 and 31),

    total_limit numeric(18,2),
    used_limit numeric(18,2),
    available_limit numeric(18,2),

    currency text not null default 'BRL',

    status text not null default 'ACTIVE'
        check (status in ('ACTIVE', 'BLOCKED', 'CANCELLED', 'EXPIRED', 'ERROR')),

    source_data jsonb not null default '{}'::jsonb,
    synced_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (connection_id, provider_card_id)
);

create index if not exists idx_credit_cards_user
    on public.credit_cards (user_id, status);

create index if not exists idx_credit_cards_connection
    on public.credit_cards (connection_id);

-- =========================================================
-- FATURAS DE CARTAO
-- record_key deve receber o ID do provedor ou um hash estavel.
-- =========================================================

create table if not exists public.credit_card_bills (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    credit_card_id uuid not null
        references public.credit_cards(id)
        on delete cascade,

    provider_bill_id text,
    record_key text not null,

    reference_month date,
    opening_date date,
    closing_date date,
    due_date date,
    paid_at timestamptz,

    total_amount numeric(18,2) not null default 0,
    minimum_amount numeric(18,2),
    paid_amount numeric(18,2) not null default 0,

    status text not null default 'OPEN'
        check (
            status in (
                'OPEN',
                'CLOSED',
                'PAID',
                'OVERDUE',
                'PARTIAL',
                'CANCELLED'
            )
        ),

    currency text not null default 'BRL',

    source_data jsonb not null default '{}'::jsonb,
    synced_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (credit_card_id, record_key)
);

create unique index if not exists uq_credit_card_bills_provider_id
    on public.credit_card_bills (credit_card_id, provider_bill_id)
    where provider_bill_id is not null;

create index if not exists idx_credit_card_bills_user_due
    on public.credit_card_bills (user_id, due_date);

create index if not exists idx_credit_card_bills_card_status
    on public.credit_card_bills (credit_card_id, status);

-- =========================================================
-- TRANSACOES DO CARTAO
-- Compras e tarifas podem ser positivas; estornos podem ser negativos.
-- =========================================================

create table if not exists public.credit_card_transactions (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    credit_card_id uuid not null
        references public.credit_cards(id)
        on delete cascade,

    bill_id uuid
        references public.credit_card_bills(id)
        on delete set null,

    category_id uuid
        references public.categories(id)
        on delete set null,

    linked_transaction_id uuid
        references public.transactions(id)
        on delete set null,

    provider_transaction_id text,
    record_key text not null,

    transaction_date date not null,
    transaction_time time,
    posted_date date,

    original_description text not null,
    normalized_description text,
    merchant text,
    authorization_code text,

    transaction_kind text not null default 'PURCHASE'
        check (
            transaction_kind in (
                'PURCHASE',
                'REFUND',
                'FEE',
                'INTEREST',
                'PAYMENT',
                'ADJUSTMENT',
                'CASH_WITHDRAWAL',
                'OTHER'
            )
        ),

    amount numeric(18,2) not null
        check (amount <> 0),

    currency text not null default 'BRL',
    original_amount numeric(18,2),
    original_currency text,

    installment_number integer
        check (installment_number is null or installment_number >= 1),

    installment_total integer
        check (installment_total is null or installment_total >= 1),

    status text not null default 'POSTED'
        check (
            status in (
                'PENDING',
                'POSTED',
                'CANCELLED',
                'REFUNDED'
            )
        ),

    needs_review boolean not null default false,
    reviewed boolean not null default false,

    source_data jsonb not null default '{}'::jsonb,
    synced_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (credit_card_id, record_key),

    check (
        installment_number is null
        or installment_total is null
        or installment_number <= installment_total
    )
);

create unique index if not exists uq_credit_card_transactions_provider_id
    on public.credit_card_transactions (
        credit_card_id,
        provider_transaction_id
    )
    where provider_transaction_id is not null;

create index if not exists idx_credit_card_transactions_user_date
    on public.credit_card_transactions (
        user_id,
        transaction_date desc
    );

create index if not exists idx_credit_card_transactions_bill
    on public.credit_card_transactions (bill_id);

create index if not exists idx_credit_card_transactions_status
    on public.credit_card_transactions (credit_card_id, status);

create index if not exists idx_credit_card_transactions_category
    on public.credit_card_transactions (category_id);

-- =========================================================
-- PARCELAS FUTURAS DE CARTAO
-- Podem vir do agregador ou ser projetadas pelo sistema.
-- =========================================================

create table if not exists public.credit_card_installments (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    credit_card_id uuid not null
        references public.credit_cards(id)
        on delete cascade,

    original_transaction_id uuid not null
        references public.credit_card_transactions(id)
        on delete cascade,

    expected_bill_id uuid
        references public.credit_card_bills(id)
        on delete set null,

    provider_installment_id text,
    record_key text not null,

    description text not null,

    installment_number integer not null
        check (installment_number >= 1),

    installment_total integer not null
        check (installment_total >= 1),

    expected_date date not null,
    expected_amount numeric(18,2) not null
        check (expected_amount <> 0),

    source text not null default 'GENERATED'
        check (source in ('OPEN_FINANCE', 'PROVIDER', 'GENERATED', 'MANUAL')),

    status text not null default 'EXPECTED'
        check (
            status in (
                'EXPECTED',
                'POSTED',
                'PAID',
                'CANCELLED'
            )
        ),

    source_data jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (credit_card_id, record_key),
    unique (original_transaction_id, installment_number),

    check (installment_number <= installment_total)
);

create index if not exists idx_credit_card_installments_user_date
    on public.credit_card_installments (
        user_id,
        expected_date
    );

create index if not exists idx_credit_card_installments_card_status
    on public.credit_card_installments (
        credit_card_id,
        status
    );

-- =========================================================
-- TRIGGERS DE updated_at
-- =========================================================

drop trigger if exists trg_open_finance_connections_updated_at
    on public.open_finance_connections;
create trigger trg_open_finance_connections_updated_at
before update on public.open_finance_connections
for each row execute function public.set_updated_at();

drop trigger if exists trg_open_finance_accounts_updated_at
    on public.open_finance_accounts;
create trigger trg_open_finance_accounts_updated_at
before update on public.open_finance_accounts
for each row execute function public.set_updated_at();

drop trigger if exists trg_credit_cards_updated_at
    on public.credit_cards;
create trigger trg_credit_cards_updated_at
before update on public.credit_cards
for each row execute function public.set_updated_at();

drop trigger if exists trg_credit_card_bills_updated_at
    on public.credit_card_bills;
create trigger trg_credit_card_bills_updated_at
before update on public.credit_card_bills
for each row execute function public.set_updated_at();

drop trigger if exists trg_credit_card_transactions_updated_at
    on public.credit_card_transactions;
create trigger trg_credit_card_transactions_updated_at
before update on public.credit_card_transactions
for each row execute function public.set_updated_at();

drop trigger if exists trg_credit_card_installments_updated_at
    on public.credit_card_installments;
create trigger trg_credit_card_installments_updated_at
before update on public.credit_card_installments
for each row execute function public.set_updated_at();

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.open_finance_connections enable row level security;
alter table public.open_finance_accounts enable row level security;
alter table public.credit_cards enable row level security;
alter table public.credit_card_bills enable row level security;
alter table public.credit_card_transactions enable row level security;
alter table public.credit_card_installments enable row level security;

-- CONEXOES

drop policy if exists "Users manage their open finance connections"
    on public.open_finance_connections;
create policy "Users manage their open finance connections"
on public.open_finance_connections
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- CONTAS OPEN FINANCE

drop policy if exists "Users manage their open finance accounts"
    on public.open_finance_accounts;
create policy "Users manage their open finance accounts"
on public.open_finance_accounts
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.open_finance_connections connection
        where connection.id = connection_id
          and connection.user_id = (select auth.uid())
    )
    and (
        financial_account_id is null
        or exists (
            select 1
            from public.financial_accounts account
            where account.id = financial_account_id
              and account.user_id = (select auth.uid())
        )
    )
);

-- CARTOES

drop policy if exists "Users manage their credit cards"
    on public.credit_cards;
create policy "Users manage their credit cards"
on public.credit_cards
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.open_finance_connections connection
        where connection.id = connection_id
          and connection.user_id = (select auth.uid())
    )
    and (
        open_finance_account_id is null
        or exists (
            select 1
            from public.open_finance_accounts account
            where account.id = open_finance_account_id
              and account.user_id = (select auth.uid())
        )
    )
    and (
        financial_account_id is null
        or exists (
            select 1
            from public.financial_accounts account
            where account.id = financial_account_id
              and account.user_id = (select auth.uid())
        )
    )
);

-- FATURAS

drop policy if exists "Users manage their credit card bills"
    on public.credit_card_bills;
create policy "Users manage their credit card bills"
on public.credit_card_bills
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.credit_cards card
        where card.id = credit_card_id
          and card.user_id = (select auth.uid())
    )
);

-- TRANSACOES DO CARTAO

drop policy if exists "Users manage their credit card transactions"
    on public.credit_card_transactions;
create policy "Users manage their credit card transactions"
on public.credit_card_transactions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.credit_cards card
        where card.id = credit_card_id
          and card.user_id = (select auth.uid())
    )
    and (
        bill_id is null
        or exists (
            select 1
            from public.credit_card_bills bill
            where bill.id = bill_id
              and bill.user_id = (select auth.uid())
              and bill.credit_card_id = credit_card_id
        )
    )
    and (
        category_id is null
        or exists (
            select 1
            from public.categories category
            where category.id = category_id
              and category.user_id = (select auth.uid())
        )
    )
    and (
        linked_transaction_id is null
        or exists (
            select 1
            from public.transactions transaction_record
            where transaction_record.id = linked_transaction_id
              and transaction_record.user_id = (select auth.uid())
        )
    )
);

-- PARCELAS FUTURAS

drop policy if exists "Users manage their credit card installments"
    on public.credit_card_installments;
create policy "Users manage their credit card installments"
on public.credit_card_installments
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.credit_cards card
        where card.id = credit_card_id
          and card.user_id = (select auth.uid())
    )
    and exists (
        select 1
        from public.credit_card_transactions card_transaction
        where card_transaction.id = original_transaction_id
          and card_transaction.user_id = (select auth.uid())
          and card_transaction.credit_card_id = credit_card_id
    )
    and (
        expected_bill_id is null
        or exists (
            select 1
            from public.credit_card_bills bill
            where bill.id = expected_bill_id
              and bill.user_id = (select auth.uid())
              and bill.credit_card_id = credit_card_id
        )
    )
);

-- =========================================================
-- PERMISSOES PARA O FRONTEND AUTENTICADO
-- A service_role usada nas Edge Functions ignora RLS.
-- =========================================================

revoke all
on public.open_finance_connections,
   public.open_finance_accounts,
   public.credit_cards,
   public.credit_card_bills,
   public.credit_card_transactions,
   public.credit_card_installments
from anon;

grant select, insert, update, delete
on public.open_finance_connections,
   public.open_finance_accounts,
   public.credit_cards,
   public.credit_card_bills,
   public.credit_card_transactions,
   public.credit_card_installments
to authenticated;

commit;

notify pgrst, 'reload schema';
