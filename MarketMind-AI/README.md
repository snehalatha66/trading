# MarketMind AI

A full‑stack Indian stock‑market intelligence and paper‑trading platform.

## Project Structure
```
MarketMind-AI/
├─ frontend/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ pages/
│  │  ├─ layouts/
│  │  ├─ services/
│  │  ├─ hooks/
│  │  └─ utils/
│  ├─ index.html
│  ├─ vite.config.js
│  ├─ tailwind.config.js
│  ├─ postcss.config.js
│  └─ package.json
├─ backend/
│  ├─ app/
│  │  ├─ api/
│  │  ├─ models/
│  │  ├─ schemas/
│  │  ├─ services/
│  │  ├─ market_data/
│  │  ├─ trading/
│  │  └─ main.py
│  ├─ tests/
│  └─ requirements.txt
├─ supabase/
│  └─ schema.sql
├─ docs/
├─ AGENTS.md
└─ README.md
```

## Setup
### Prerequisites
- **Node.js** (>=20) and **npm**
- **Python** (>=3.10) and **pip**
- **Supabase** account (for DB & Auth)

### Frontend
```bash
cd frontend
npm install   # installs React, Vite, Tailwind, Axios, Recharts
npm run dev   # start development server at http://localhost:5173
```

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # API available at http://localhost:8000
```

### Supabase
1. Create a new project on supabase.com.
2. Run the SQL in `supabase/schema.sql` to create tables.
3. Copy the `public-anon-key` and `url` into a `.env` file (see `.env.example`).
4. For authenticated API access, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `backend/.env` (the existing frontend values are also recognized).
5. To persist EODHD market data, set `EODHD_API_KEY` and the server-only `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`. Never put the service-role key in the frontend or expose it in browser requests.
6. Configure `GEMINI_API_KEY` on the backend. `GEMINI_MODEL` defaults to `gemini-3.5-flash` and `GEMINI_API_VERSION` defaults to `v1beta`; choose a model listed by the configured key that supports `generateContent`.

The authenticated Dashboard invokes `POST /api/v1/eodhd/sync` to save verified NIFTY 50 EOD/history, snapshots, and filtered market news into the existing tables. The market-data tables are read-only to the anon/authenticated roles in the existing schema, so ingestion returns a configuration error until the service-role key is provided. EODHD quota exhaustion is surfaced and provider requests are paused temporarily rather than retried on every Dashboard request.

For an existing Supabase project, apply `supabase/migrations/20261103_paper_trading_and_price_alerts.sql`; it aligns the legacy portfolio/paper-transaction column names and associates legacy paper orders with their original user's virtual account before installing alert policies. Review and apply migrations through Supabase's migration tooling; the backend service-role REST key cannot apply SQL migrations. A new project can use the updated `supabase/schema.sql`. Paper accounts start with ₹10,00,000 in virtual cash. Paper trades are priced by the backend and the atomic execution RPC is restricted to the server's service-role client. Configure `SUPABASE_SERVICE_ROLE_KEY` only in `backend/.env`; without it, paper trade execution and background alert monitoring are unavailable. The alert monitor checks active alerts once per minute when the EODHD and Supabase service-role settings are present.

For an existing project, also apply `supabase/migrations/20261104094900_profiles_access.sql` to grant the authenticated role access to the profile table and enforce ownership against the authenticated Supabase user. This migration changes grants and the RLS policy only; it does not recreate or alter the `profiles` table.

For an existing project whose `watchlists` table uses `user_id`, apply `supabase/migrations/20261103170000_watchlist_schema_alignment.sql` before using My Watchlist. It aligns the owner column, adds lookup indexes, and installs the batched latest-snapshot function. Watchlist loading returns saved lists and stocks without calling the market-data provider.

Authenticated sidebar pages remain mounted while the current user session is active, preserving page state during navigation. Successful GET responses are cached in browser memory per access token for 45 seconds and in-flight requests are shared; successful mutations and manual refreshes invalidate the cache. Errors are not cached.

The authenticated pages use `/api/v1/paper/account`, `/api/v1/paper/trades`, `/api/v1/alerts`, and `/api/v1/transactions`. Equity quote-dependent actions require an actual EODHD quote; if the configured subscription does not provide a symbol's quote, paper trades and new or edited alerts are rejected instead of using a fabricated price. Portfolio values may show timestamped saved snapshots as a clearly labeled fallback.

EODHD's published [Stock Screener API documentation](https://eodhd.com/financial-apis/stock-market-screener-api) lists the feature in the All-In-One and EOD+Intraday — All World Extended plans. NSE ranking requests also require NSE exchange coverage. The app attempts only the authorized `/api/screener` endpoint and reports provider rejection; it does not substitute partial lists. Sector-index performance requires an authorized sector-index/constituent feed and is not inferred from individual screener results. EODHD EOD observations are date-only; they are displayed as trading dates rather than converted to a misleading 05:30 Asia/Kolkata timestamp. NSE market status comes from its Capital Market status endpoint and is checked alongside its trading holiday calendar; an unavailable status is not guessed from weekdays.

## Running the Full Stack
1. Start the backend (`uvicorn`).
2. In another terminal, start the frontend (`npm run dev`).
3. Open the frontend URL; it will communicate with the backend via `/api/v1/*`.

---
*Phase 1 complete – folder scaffolding and basic configuration.*
