do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'watchlists'
          and column_name = 'user_id'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'watchlists'
          and column_name = 'owner_id'
    ) then
        alter table public.watchlists rename column user_id to owner_id;
    end if;
end;
$$;

create index if not exists watchlists_owner_id_idx
    on public.watchlists (owner_id);
create index if not exists watchlist_stocks_watchlist_id_idx
    on public.watchlist_stocks (watchlist_id);
create index if not exists watchlist_stocks_stock_id_idx
    on public.watchlist_stocks (stock_id);
create index if not exists market_snapshots_stock_latest_idx
    on public.market_snapshots (stock_id, snapshot_at desc);

grant select, insert, update, delete on public.watchlists,
    public.watchlist_stocks to authenticated;

create or replace function public.get_latest_market_snapshots(p_stock_ids uuid[])
returns setof public.market_snapshots
language sql
stable
security invoker
set search_path = public
as $$
    select distinct on (stock_id) *
    from public.market_snapshots
    where stock_id = any(p_stock_ids)
    order by stock_id, snapshot_at desc;
$$;

grant execute on function public.get_latest_market_snapshots(uuid[]) to authenticated;

notify pgrst, 'reload schema';
