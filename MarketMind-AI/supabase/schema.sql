-- Supabase database schema for MarketMind AI
-- This file reproduces the exact schema that has already been applied to your Supabase project.
-- Do NOT modify table names, column names, relationships or RLS policies unless you intend to
-- apply a new migration manually in Supabase.

-- Enable uuid generation
create extension if not exists "pgcrypto";

-- ==============================================================
-- 1. profiles
-- ==============================================================
create table profiles (
    id uuid primary key default gen_random_uuid(),
    auth_uid uuid not null unique,          -- Supabase auth UID
    email text not null,
    full_name text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- ==============================================================
-- 2. stocks
-- ==============================================================
create table stocks (
    id uuid primary key default gen_random_uuid(),
    symbol text not null,
    name text,
    exchange text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);
create unique index stocks_symbol_idx on stocks (symbol);

-- ==============================================================
-- 3. market_snapshots
-- ==============================================================
create table market_snapshots (
    id uuid primary key default gen_random_uuid(),
    stock_id uuid references stocks(id) on delete cascade,
    price numeric not null,
    volume numeric,
    snapshot_at timestamp with time zone not null,
    created_at timestamp with time zone default now()
);
create index market_snapshots_stock_id_idx on market_snapshots (stock_id);
create index market_snapshots_snapshot_at_idx on market_snapshots (snapshot_at);
create index market_snapshots_stock_latest_idx on market_snapshots (stock_id, snapshot_at desc);

-- ==============================================================
-- 4. historical_candles
-- ==============================================================
create table historical_candles (
    id uuid primary key default gen_random_uuid(),
    stock_id uuid references stocks(id) on delete cascade,
    open numeric not null,
    high numeric not null,
    low numeric not null,
    close numeric not null,
    volume numeric,
    period_start timestamp with time zone not null,
    period_end timestamp with time zone not null,
    created_at timestamp with time zone default now()
);
create index historical_candles_stock_id_idx on historical_candles (stock_id);
create index historical_candles_period_start_idx on historical_candles (period_start);

-- ==============================================================
-- 5. news_articles
-- ==============================================================
create table news_articles (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    url text not null,
    source text,
    published_at timestamp with time zone,
    created_at timestamp with time zone default now()
);
create unique index news_articles_url_idx on news_articles (url);

-- ==============================================================
-- 6. watchlists
-- ==============================================================
create table watchlists (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users (id) on delete cascade,
    name text not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);
create index watchlists_owner_id_idx on watchlists (owner_id);

-- ==============================================================
-- 7. watchlist_stocks (junction)
-- ==============================================================
create table watchlist_stocks (
    id uuid primary key default gen_random_uuid(),
    watchlist_id uuid references watchlists(id) on delete cascade,
    stock_id uuid references stocks(id) on delete cascade,
    created_at timestamp with time zone default now()
);
create unique index watchlist_stock_unique on watchlist_stocks (watchlist_id, stock_id);

-- ==============================================================
-- 8. portfolios
-- ==============================================================
create table portfolios (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users (id) on delete cascade,
    name text not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);
create index portfolios_owner_id_idx on portfolios (owner_id);

-- ==============================================================
-- 9. portfolio_holdings
-- ==============================================================
create table portfolio_holdings (
    id uuid primary key default gen_random_uuid(),
    portfolio_id uuid references portfolios(id) on delete cascade,
    stock_id uuid references stocks(id) on delete cascade,
    quantity numeric not null,
    avg_price numeric not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);
create unique index portfolio_holding_unique on portfolio_holdings (portfolio_id, stock_id);

-- ==============================================================
-- 10. portfolio_transactions
-- ==============================================================
create table portfolio_transactions (
    id uuid primary key default gen_random_uuid(),
    portfolio_id uuid references portfolios(id) on delete cascade,
    stock_id uuid references stocks(id) on delete cascade,
    type text not null check (type in ('buy','sell','dividend','split')),
    quantity numeric not null,
    price numeric not null,
    executed_at timestamp with time zone not null,
    created_at timestamp with time zone default now()
);
create index portfolio_transactions_portfolio_id_idx on portfolio_transactions (portfolio_id);
create index portfolio_transactions_executed_at_idx on portfolio_transactions (executed_at);

-- ==============================================================
-- 11. strategies
-- ==============================================================
create table strategies (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users (id) on delete cascade,
    name text not null,
    description text,
    config jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);
create index strategies_owner_id_idx on strategies (owner_id);

-- ==============================================================
-- 12. backtest_results
-- ==============================================================
create table backtest_results (
    id uuid primary key default gen_random_uuid(),
    strategy_id uuid references strategies(id) on delete cascade,
    start_date timestamp with time zone not null,
    end_date timestamp with time zone not null,
    performance jsonb,
    created_at timestamp with time zone default now()
);
create index backtest_results_strategy_id_idx on backtest_results (strategy_id);

-- ==============================================================
-- 13. paper_orders
-- ==============================================================
create table paper_orders (
    id uuid primary key default gen_random_uuid(),
    portfolio_id uuid references portfolios(id) on delete cascade,
    paper_account_id uuid,
    stock_id uuid references stocks(id) on delete cascade,
    side text not null check (side in ('buy','sell')),
    quantity numeric not null,
    price numeric not null,
    status text not null check (status in ('pending','filled','canceled')),
    placed_at timestamp with time zone default now(),
    executed_at timestamp with time zone
);
create index paper_orders_portfolio_id_idx on paper_orders (portfolio_id);
create index paper_orders_status_idx on paper_orders (status);

-- ==============================================================
-- 14. paper_trading_transactions
-- ==============================================================
create table paper_trading_transactions (
    id uuid primary key default gen_random_uuid(),
    order_id uuid references paper_orders(id) on delete cascade,
    type text not null check (type in ('fill','cancel')),
    quantity numeric not null,
    price numeric not null,
    realized_pnl numeric,
    executed_at timestamp with time zone not null,
    created_at timestamp with time zone default now()
);
create index paper_tx_order_id_idx on paper_trading_transactions (order_id);

-- ==============================================================
-- 14a. Paper trading accounts and holdings
-- ==============================================================
create table paper_trading_accounts (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null unique references auth.users(id) on delete cascade,
    initial_balance numeric not null default 1000000 check (initial_balance >= 0),
    cash_balance numeric not null default 1000000 check (cash_balance >= 0),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table paper_trading_holdings (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null references paper_trading_accounts(id) on delete cascade,
    stock_id uuid not null references stocks(id) on delete cascade,
    quantity numeric not null check (quantity > 0),
    avg_price numeric not null check (avg_price > 0),
    updated_at timestamp with time zone default now(),
    unique (account_id, stock_id)
);
create index paper_holdings_account_id_idx on paper_trading_holdings (account_id);

alter table paper_orders alter column portfolio_id drop not null;
alter table paper_orders add constraint paper_order_account_check
    check (
        (portfolio_id is not null and paper_account_id is null)
        or (portfolio_id is null and paper_account_id is not null)
    );
alter table paper_orders add constraint paper_order_account_fk
    foreign key (paper_account_id) references paper_trading_accounts(id) on delete cascade;

-- ==============================================================
-- 14b. Price alerts
-- ==============================================================
create table price_alerts (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    stock_id uuid not null references stocks(id) on delete cascade,
    condition text not null check (condition in ('above','below')),
    target_price numeric not null check (target_price > 0),
    current_price numeric,
    status text not null default 'active' check (status in ('active','triggered','paused')),
    triggered_at timestamp with time zone,
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);
create index price_alerts_owner_id_idx on price_alerts (owner_id);
create index price_alerts_status_idx on price_alerts (status);

-- ==============================================================
-- 15. ai_conversations
-- ==============================================================
create table ai_conversations (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users (id) on delete cascade,
    title text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);
create index ai_conversations_owner_id_idx on ai_conversations (owner_id);

-- ==============================================================
-- 16. ai_messages
-- ==============================================================
create table ai_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid references ai_conversations(id) on delete cascade,
    role text not null check (role in ('user','assistant','system')),
    content text not null,
    sent_at timestamp with time zone default now(),
    created_at timestamp with time zone default now()
);
create index ai_messages_conversation_id_idx on ai_messages (conversation_id);
create index ai_messages_sent_at_idx on ai_messages (sent_at);

-- ==============================================================
-- 17. Row Level Security (RLS) policies
-- ==============================================================
-- Enable RLS globally on tables that store user‑specific data
alter table profiles enable row level security;
alter table watchlists enable row level security;
alter table watchlist_stocks enable row level security;
alter table portfolios enable row level security;
alter table portfolio_holdings enable row level security;
alter table portfolio_transactions enable row level security;
alter table strategies enable row level security;
alter table backtest_results enable row level security;
alter table paper_orders enable row level security;
alter table paper_trading_transactions enable row level security;
alter table paper_trading_accounts enable row level security;
alter table paper_trading_holdings enable row level security;
alter table price_alerts enable row level security;
alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;

-- Helper function to obtain current auth UID
create or replace function auth_uid() returns uuid language sql stable as $$
    select auth.uid();
$$;

-- Profiles – users can only access their own profile
create policy "profile_owner" on profiles for all to authenticated
    using (auth_uid = (select auth.uid()))
    with check (auth_uid = (select auth.uid()));

-- Watchlists – owner can manage own watchlists and related stocks
create policy "watchlist_owner" on watchlists for all using (owner_id = auth_uid());
create policy "watchlist_stock_owner" on watchlist_stocks for all using (
    (select owner_id from watchlists where id = watchlist_id) = auth_uid()
);

-- Portfolios – only owner can access
create policy "portfolio_owner" on portfolios for all using (owner_id = auth_uid());
create policy "portfolio_holding_owner" on portfolio_holdings for all using (
    (select owner_id from portfolios where id = portfolio_id) = auth_uid()
);
create policy "portfolio_tx_owner" on portfolio_transactions for all using (
    (select owner_id from portfolios where id = portfolio_id) = auth_uid()
);

-- Strategies – owner only
create policy "strategy_owner" on strategies for all using (owner_id = auth_uid());
create policy "backtest_owner" on backtest_results for all using (
    (select owner_id from strategies where id = strategy_id) = auth_uid()
);

-- Paper orders & transactions – tied to portfolio owner
create policy "paper_order_owner" on paper_orders for all using (
    ((select owner_id from portfolios where id = portfolio_id) = auth_uid())
    or ((select owner_id from paper_trading_accounts where id = paper_account_id) = auth_uid())
);
create policy "paper_tx_owner" on paper_trading_transactions for select using (
    exists (
        select 1
        from paper_orders o
        left join portfolios p on p.id = o.portfolio_id
        left join paper_trading_accounts a on a.id = o.paper_account_id
        where o.id = order_id
          and (p.owner_id = auth_uid() or a.owner_id = auth_uid())
    )
);
create policy "paper_account_owner" on paper_trading_accounts for select using (owner_id = auth_uid());
create policy "paper_holding_owner" on paper_trading_holdings for select using (
    (select owner_id from paper_trading_accounts where id = account_id) = auth_uid()
);
create policy "price_alert_owner" on price_alerts for all
using (owner_id = auth_uid())
with check (owner_id = auth_uid());

-- AI conversations & messages – owner only
create policy "ai_conv_owner" on ai_conversations for all using (owner_id = auth_uid());
create policy "ai_msg_owner" on ai_messages for all using (
    (select owner_id from ai_conversations where id = conversation_id) = auth_uid()
);

-- Public read access to reference tables (stocks, market_snapshots, historical_candles, news_articles)
grant select on stocks, market_snapshots, historical_candles, news_articles to anon, authenticated;
grant select, insert, update on profiles to authenticated;
grant select, insert, update, delete on watchlists, watchlist_stocks to authenticated;

create or replace function get_latest_market_snapshots(p_stock_ids uuid[])
returns setof market_snapshots
language sql
stable
security invoker
set search_path = public
as $$
    select distinct on (stock_id) *
    from market_snapshots
    where stock_id = any(p_stock_ids)
    order by stock_id, snapshot_at desc;
$$;
grant execute on function get_latest_market_snapshots(uuid[]) to authenticated;

create or replace function get_or_create_paper_trading_account()
returns setof paper_trading_accounts
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication is required';
    end if;
    insert into paper_trading_accounts (owner_id)
    values (auth.uid())
    on conflict (owner_id) do nothing;
    return query
    select * from paper_trading_accounts where owner_id = auth.uid();
end;
$$;

drop function if exists execute_paper_trade(uuid, text, numeric, numeric);
create or replace function execute_paper_trade(
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
    account_row paper_trading_accounts%rowtype;
    holding_row paper_trading_holdings%rowtype;
    order_row paper_orders%rowtype;
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
    from paper_trading_accounts
    where owner_id = p_owner_id
    for update;
    if not found then
        raise exception 'Paper trading account not found';
    end if;
    perform 1 from stocks where id = p_stock_id;
    if not found then
        raise exception 'Stock not found';
    end if;

    trade_total := p_quantity * p_price;
    select * into holding_row
    from paper_trading_holdings
    where account_id = account_row.id and stock_id = p_stock_id
    for update;

    if p_side = 'buy' then
        if account_row.cash_balance < trade_total then
            raise exception 'Insufficient virtual cash';
        end if;
        if found then
            update paper_trading_holdings
            set avg_price = ((holding_row.quantity * holding_row.avg_price) + trade_total)
                            / (holding_row.quantity + p_quantity),
                quantity = holding_row.quantity + p_quantity,
                updated_at = now()
            where id = holding_row.id;
        else
            insert into paper_trading_holdings (account_id, stock_id, quantity, avg_price)
            values (account_row.id, p_stock_id, p_quantity, p_price);
        end if;
        update paper_trading_accounts
        set cash_balance = cash_balance - trade_total, updated_at = now()
        where id = account_row.id
        returning * into account_row;
    else
        if not found or holding_row.quantity < p_quantity then
            raise exception 'Insufficient paper holdings to sell';
        end if;
        realized := (p_price - holding_row.avg_price) * p_quantity;
        if holding_row.quantity = p_quantity then
            delete from paper_trading_holdings where id = holding_row.id;
        else
            update paper_trading_holdings
            set quantity = holding_row.quantity - p_quantity, updated_at = now()
            where id = holding_row.id;
        end if;
        update paper_trading_accounts
        set cash_balance = cash_balance + trade_total, updated_at = now()
        where id = account_row.id
        returning * into account_row;
    end if;

    insert into paper_orders (
        paper_account_id, stock_id, side, quantity, price, status, executed_at
    ) values (
        account_row.id, p_stock_id, p_side, p_quantity, p_price, 'filled', now()
    ) returning * into order_row;

    insert into paper_trading_transactions (
        order_id, type, quantity, price, realized_pnl, executed_at
    ) values (
        order_row.id, 'fill', p_quantity, p_price, realized, now()
    );

    return jsonb_build_object(
        'order', to_jsonb(order_row),
        'account', to_jsonb(account_row),
        'realized_pnl', realized
    );
end;
$$;

revoke all on function get_or_create_paper_trading_account() from public, anon;
grant execute on function get_or_create_paper_trading_account() to authenticated;
revoke all on function execute_paper_trade(uuid, uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function execute_paper_trade(uuid, uuid, text, numeric, numeric) to service_role;

grant select on paper_trading_accounts, paper_trading_holdings,
    paper_trading_transactions to authenticated;
grant select, insert, update on paper_orders to authenticated;
grant select, insert, update, delete on price_alerts to authenticated;
