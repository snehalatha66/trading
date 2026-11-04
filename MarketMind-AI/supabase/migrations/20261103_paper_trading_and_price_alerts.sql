-- Align the legacy user-owned transaction tables before the account-based
-- paper-trading schema is installed. Renames preserve the existing records.
do $$
begin
    if to_regclass('public.portfolios') is not null
       and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'portfolios'
             and column_name = 'user_id'
       )
       and not exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'portfolios'
             and column_name = 'owner_id'
       ) then
        alter table public.portfolios rename column user_id to owner_id;
    end if;

    if to_regclass('public.portfolio_transactions') is not null then
        if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'portfolio_transactions'
              and column_name = 'transaction_type'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'portfolio_transactions'
              and column_name = 'type'
        ) then
            alter table public.portfolio_transactions
                rename column transaction_type to type;
        end if;
        if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'portfolio_transactions'
              and column_name = 'transaction_date'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'portfolio_transactions'
              and column_name = 'executed_at'
        ) then
            alter table public.portfolio_transactions
                rename column transaction_date to executed_at;
        end if;
    end if;

    if to_regclass('public.paper_orders') is not null then
        if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'paper_orders'
              and column_name = 'order_type'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'paper_orders'
              and column_name = 'side'
        ) then
            alter table public.paper_orders rename column order_type to side;
        end if;
        if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'paper_orders'
              and column_name = 'order_price'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'paper_orders'
              and column_name = 'price'
        ) then
            alter table public.paper_orders rename column order_price to price;
        end if;
    end if;

    if to_regclass('public.paper_trading_transactions') is not null then
        if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'paper_trading_transactions'
              and column_name = 'transaction_type'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'paper_trading_transactions'
              and column_name = 'type'
        ) then
            alter table public.paper_trading_transactions
                rename column transaction_type to type;
        end if;
        if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'paper_trading_transactions'
              and column_name = 'execution_price'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'paper_trading_transactions'
              and column_name = 'price'
        ) then
            alter table public.paper_trading_transactions
                rename column execution_price to price;
        end if;
    end if;
end;
$$;

create table if not exists public.paper_trading_accounts (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null unique references auth.users(id) on delete cascade,
    initial_balance numeric not null default 1000000 check (initial_balance >= 0),
    cash_balance numeric not null default 1000000 check (cash_balance >= 0),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists public.paper_trading_holdings (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.paper_trading_accounts(id) on delete cascade,
    stock_id uuid not null references public.stocks(id) on delete cascade,
    quantity numeric not null check (quantity > 0),
    avg_price numeric not null check (avg_price > 0),
    updated_at timestamptz default now(),
    unique (account_id, stock_id)
);
create index if not exists paper_holdings_account_id_idx
    on public.paper_trading_holdings (account_id);

alter table public.paper_orders
    add column if not exists portfolio_id uuid
    references public.portfolios(id) on delete cascade;
alter table public.paper_orders alter column portfolio_id drop not null;
alter table public.paper_orders add column if not exists paper_account_id uuid
    references public.paper_trading_accounts(id) on delete cascade;
alter table public.paper_orders add column if not exists side text;
alter table public.paper_orders add column if not exists price numeric;
alter table public.paper_orders add column if not exists placed_at timestamptz;
alter table public.paper_orders add column if not exists executed_at timestamptz;
update public.paper_orders
set placed_at = coalesce(placed_at, created_at, now())
where placed_at is null;
update public.paper_orders
set executed_at = coalesce(executed_at, created_at, placed_at)
where status = 'filled' and executed_at is null;

alter table public.paper_trading_transactions
    add column if not exists type text;
alter table public.paper_trading_transactions
    add column if not exists price numeric;
alter table public.paper_trading_transactions
    add column if not exists executed_at timestamptz;
alter table public.paper_trading_transactions
    add column if not exists realized_pnl numeric;
update public.paper_trading_transactions
set executed_at = coalesce(executed_at, created_at, now())
where executed_at is null;

-- Older deployments require these ownership columns and enforced type checks;
-- account ownership and the server-side trade RPC now govern new records.
do $$
declare
    constraint_name text;
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'paper_orders'
          and column_name = 'user_id'
    ) then
        alter table public.paper_orders alter column user_id drop not null;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'paper_trading_transactions'
          and column_name = 'user_id'
    ) then
        alter table public.paper_trading_transactions alter column user_id drop not null;
    end if;
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'paper_trading_transactions'
          and column_name = 'stock_id'
    ) then
        alter table public.paper_trading_transactions alter column stock_id drop not null;
    end if;

    for constraint_name in
        select c.conname
        from pg_constraint c
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = any(c.conkey)
        where c.conrelid = 'public.paper_trading_transactions'::regclass
          and c.contype = 'c'
          and a.attname = 'type'
    loop
        execute format(
            'alter table public.paper_trading_transactions drop constraint %I',
            constraint_name
        );
    end loop;
end;
$$;

-- Preserve legacy paper orders by attaching them to their original user's
-- virtual account before enforcing the one-owner relation.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'paper_orders'
          and column_name = 'user_id'
    ) then
        insert into public.paper_trading_accounts (owner_id)
        select distinct user_id
        from public.paper_orders
        where user_id is not null
        on conflict (owner_id) do nothing;

        update public.paper_orders o
        set paper_account_id = a.id
        from public.paper_trading_accounts a
        where o.paper_account_id is null
          and o.portfolio_id is null
          and o.user_id = a.owner_id;
    end if;

    if exists (
        select 1 from public.paper_orders
        where portfolio_id is null and paper_account_id is null
    ) then
        raise exception
            'Paper orders without a portfolio or verified owner cannot be migrated safely.';
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint c
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = any(c.conkey)
        where c.conrelid = 'public.paper_orders'::regclass
          and c.contype = 'f'
          and a.attname = 'paper_account_id'
    ) then
        alter table public.paper_orders
            add constraint paper_order_account_fk
            foreign key (paper_account_id)
            references public.paper_trading_accounts(id) on delete cascade;
    end if;
end;
$$;
alter table public.paper_orders drop constraint if exists paper_order_account_check;
alter table public.paper_orders add constraint paper_order_account_check
    check (
        (portfolio_id is not null and paper_account_id is null)
        or (portfolio_id is null and paper_account_id is not null)
    );

create table if not exists public.price_alerts (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    stock_id uuid not null references public.stocks(id) on delete cascade,
    condition text not null check (condition in ('above','below')),
    target_price numeric not null check (target_price > 0),
    current_price numeric,
    status text not null default 'active'
        check (status in ('active','triggered','paused')),
    triggered_at timestamptz,
    last_checked_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
create index if not exists price_alerts_owner_id_idx on public.price_alerts (owner_id);
create index if not exists price_alerts_status_idx on public.price_alerts (status);

alter table public.paper_trading_accounts enable row level security;
alter table public.paper_trading_holdings enable row level security;
alter table public.price_alerts enable row level security;
alter table public.paper_orders enable row level security;
alter table public.paper_trading_transactions enable row level security;

drop policy if exists paper_order_owner on public.paper_orders;
create policy paper_order_owner on public.paper_orders for all using (
    ((select owner_id from public.portfolios where id = portfolio_id) = auth.uid())
    or ((select owner_id from public.paper_trading_accounts where id = paper_account_id) = auth.uid())
);
drop policy if exists paper_tx_owner on public.paper_trading_transactions;
create policy paper_tx_owner on public.paper_trading_transactions for select using (
    exists (
        select 1
        from public.paper_orders o
        left join public.portfolios p on p.id = o.portfolio_id
        left join public.paper_trading_accounts a on a.id = o.paper_account_id
        where o.id = order_id
          and (p.owner_id = auth.uid() or a.owner_id = auth.uid())
    )
);
drop policy if exists paper_account_owner on public.paper_trading_accounts;
create policy paper_account_owner on public.paper_trading_accounts for select using (owner_id = auth.uid());
drop policy if exists paper_holding_owner on public.paper_trading_holdings;
create policy paper_holding_owner on public.paper_trading_holdings for select using (
    (select owner_id from public.paper_trading_accounts where id = account_id) = auth.uid()
);
drop policy if exists price_alert_owner on public.price_alerts;
create policy price_alert_owner on public.price_alerts for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create or replace function public.get_or_create_paper_trading_account()
returns setof public.paper_trading_accounts
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;
    insert into public.paper_trading_accounts (owner_id)
    values (auth.uid())
    on conflict (owner_id) do nothing;
    return query
    select * from public.paper_trading_accounts where owner_id = auth.uid();
end;
$$;

drop function if exists public.execute_paper_trade(uuid, text, numeric, numeric);
create or replace function public.execute_paper_trade(
    p_owner_id uuid,
    p_stock_id uuid,
    p_side text,
    p_quantity numeric,
    p_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    account_row public.paper_trading_accounts%rowtype;
    holding_row public.paper_trading_holdings%rowtype;
    order_row public.paper_orders%rowtype;
    trade_total numeric;
    realized numeric := 0;
begin
    if p_owner_id is null then
        raise exception 'Paper trading owner is required';
    end if;
    if p_side not in ('buy','sell') or p_quantity <= 0 or p_price <= 0 then
        raise exception 'Invalid paper trade parameters';
    end if;
    select * into account_row
    from public.paper_trading_accounts
    where owner_id = p_owner_id
    for update;
    if not found then
        raise exception 'Paper trading account not found';
    end if;
    perform 1 from public.stocks where id = p_stock_id;
    if not found then
        raise exception 'Stock not found';
    end if;

    trade_total := p_quantity * p_price;
    select * into holding_row
    from public.paper_trading_holdings
    where account_id = account_row.id and stock_id = p_stock_id
    for update;

    if p_side = 'buy' then
        if account_row.cash_balance < trade_total then
            raise exception 'Insufficient virtual cash';
        end if;
        if found then
            update public.paper_trading_holdings
            set avg_price = ((holding_row.quantity * holding_row.avg_price) + trade_total)
                            / (holding_row.quantity + p_quantity),
                quantity = holding_row.quantity + p_quantity,
                updated_at = now()
            where id = holding_row.id;
        else
            insert into public.paper_trading_holdings (account_id, stock_id, quantity, avg_price)
            values (account_row.id, p_stock_id, p_quantity, p_price);
        end if;
        update public.paper_trading_accounts
        set cash_balance = cash_balance - trade_total, updated_at = now()
        where id = account_row.id
        returning * into account_row;
    else
        if not found or holding_row.quantity < p_quantity then
            raise exception 'Insufficient paper holdings to sell';
        end if;
        realized := (p_price - holding_row.avg_price) * p_quantity;
        if holding_row.quantity = p_quantity then
            delete from public.paper_trading_holdings where id = holding_row.id;
        else
            update public.paper_trading_holdings
            set quantity = holding_row.quantity - p_quantity, updated_at = now()
            where id = holding_row.id;
        end if;
        update public.paper_trading_accounts
        set cash_balance = cash_balance + trade_total, updated_at = now()
        where id = account_row.id
        returning * into account_row;
    end if;

    insert into public.paper_orders (
        paper_account_id, stock_id, side, quantity, price, status, executed_at
    ) values (
        account_row.id, p_stock_id, p_side, p_quantity, p_price, 'filled', now()
    ) returning * into order_row;

    insert into public.paper_trading_transactions (
        order_id, type, quantity, price, realized_pnl, executed_at
    ) values (order_row.id, 'fill', p_quantity, p_price, realized, now());

    return jsonb_build_object(
        'order', to_jsonb(order_row),
        'account', to_jsonb(account_row),
        'realized_pnl', realized
    );
end;
$$;

revoke all on function public.get_or_create_paper_trading_account() from public, anon;
grant execute on function public.get_or_create_paper_trading_account() to authenticated;
revoke all on function public.execute_paper_trade(uuid, uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.execute_paper_trade(uuid, uuid, text, numeric, numeric) to service_role;

grant select on public.paper_trading_accounts, public.paper_trading_holdings,
    public.paper_trading_transactions to authenticated;
grant select on public.portfolios, public.portfolio_transactions to authenticated;
grant select, insert, update on public.paper_orders to authenticated;
grant select, insert, update, delete on public.price_alerts to authenticated;

notify pgrst, 'reload schema';
