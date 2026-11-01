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
    executed_at timestamp with time zone not null,
    created_at timestamp with time zone default now()
);
create index paper_tx_order_id_idx on paper_trading_transactions (order_id);

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
alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;

-- Helper function to obtain current auth UID
create or replace function auth_uid() returns uuid language sql stable as $$
    select auth.uid();
$$;

-- Profiles – users can only access their own profile
create policy "profile_owner" on profiles for all using (auth_uid() = auth_uid);

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
    (select owner_id from portfolios where id = portfolio_id) = auth_uid()
);
create policy "paper_tx_owner" on paper_trading_transactions for all using (
    (select owner_id from portfolios where id = (
        select portfolio_id from paper_orders where id = order_id
    )) = auth_uid()
);

-- AI conversations & messages – owner only
create policy "ai_conv_owner" on ai_conversations for all using (owner_id = auth_uid());
create policy "ai_msg_owner" on ai_messages for all using (
    (select owner_id from ai_conversations where id = conversation_id) = auth_uid()
);

-- Public read access to reference tables (stocks, market_snapshots, historical_candles, news_articles)
grant select on stocks, market_snapshots, historical_candles, news_articles to anon, authenticated;
