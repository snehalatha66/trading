# MarketMind AI – Supabase Database

This folder contains the **exact** SQL schema that has already been applied to your Supabase project.  It is provided for reference, version‑control and local documentation only – **do not execute it again** unless you intend to create a fresh database.

---

## Tables Overview
| Table | Purpose | Key columns |
|-------|---------|-------------|
| `profiles` | One‑to‑one user profile (stores full name, email, timestamps). | `id`, `auth_uid`, `email` |
| `stocks` | Reference data for all tradable symbols. | `id`, `symbol`, `name`, `exchange` |
| `market_snapshots` | Real‑time snapshot of price/volume for a stock. | `stock_id`, `price`, `snapshot_at` |
| `historical_candles` | OHLCV candles for a stock over a period. | `stock_id`, `open`, `high`, `low`, `close`, `period_start` |
| `news_articles` | News items linked to symbols. | `title`, `url`, `published_at` |
| `watchlists` | User‑owned named lists of favourite stocks. | `owner_id`, `name` |
| `watchlist_stocks` | Junction table linking watchlists ↔ stocks. | `watchlist_id`, `stock_id` |
| `portfolios` | User‑owned portfolios (paper or live). | `owner_id`, `name` |
| `portfolio_holdings` | Current holdings per portfolio. | `portfolio_id`, `stock_id`, `quantity`, `avg_price` |
| `portfolio_transactions` | All trades (buy, sell, dividend, split). | `portfolio_id`, `stock_id`, `type`, `quantity`, `price` |
| `strategies` | Stored trading strategies (JSON config). | `owner_id`, `name`, `config` |
| `backtest_results` | Results of strategy back‑tests. | `strategy_id`, `start_date`, `end_date`, `performance` |
| `paper_orders` | Simulated orders for paper trading. | `portfolio_id`, `stock_id`, `side`, `quantity`, `price`, `status` |
| `paper_trading_transactions` | Execution details for paper orders. | `order_id`, `type`, `quantity`, `price` |
| `ai_conversations` | Chat history for AI assistant per user. | `owner_id`, `title` |
| `ai_messages` | Individual messages in a conversation. | `conversation_id`, `role`, `content` |

## Relationships & Constraints
- All tables use **UUID** primary keys (`gen_random_uuid()`).
- Foreign keys cascade on delete where appropriate (e.g., deleting a `stock` removes related snapshots, candles, watchlist links, etc.).
- Unique indexes on natural keys: `stocks.symbol`, `news_articles.url`, `watchlist_stocks` composite, `portfolio_holdings` composite, `paper_orders` composite, etc.

## Row‑Level Security (RLS)
RLS is enabled on every table that contains user‑specific data. Policies ensure **each user can only access their own rows** (`auth.uid()`).
- `profiles` – can read/write only its own row.
- `watchlists`, `watchlist_stocks` – scoped to the watchlist owner.
- `portfolios`, `portfolio_holdings`, `portfolio_transactions` – scoped to the portfolio owner.
- `strategies`, `backtest_results` – scoped to the strategy owner.
- `paper_orders`, `paper_trading_transactions` – scoped to the portfolio owner.
- `ai_conversations`, `ai_messages` – scoped to the conversation owner.

Public read permissions are granted for reference tables (`stocks`, `market_snapshots`, `historical_candles`, `news_articles`) so any authenticated or anonymous client can fetch market data without RLS restrictions.

---

## Setup / Deployment Instructions
1. **Do NOT run this file** against an existing Supabase project – the schema is already live.
2. When creating a new Supabase environment (e.g., a staging project), copy the content of `schema.sql` into the Supabase SQL editor and execute it.
3. After the schema is applied, enable **Database > RLS** for each table (the SQL already creates the policies, but you can double‑check in the Supabase console).
4. Add the following environment variables to your backend (or any service that needs DB access):
   ```
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # keep secret – never expose to frontend
   ```
5. The frontend should only use the **anon key** (see `.env` in the frontend folder) – the service‑role key is for backend privileged operations only.

For an existing project, apply `migrations/20261104094900_profiles_access.sql` to grant the authenticated role access to its own profile rows. The migration only changes table privileges and the RLS policy; it does not recreate or alter `profiles`.

---

## Version Control
- Keep this `README.md` and `schema.sql` together in version control.
- If you need to evolve the schema, create a new migration file (e.g., `20231102_add_new_table.sql`) rather than editing this file directly.

---

*Generated on 2026‑11‑01 by Antigravity AI.*
