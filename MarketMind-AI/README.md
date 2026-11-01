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

## Running the Full Stack
1. Start the backend (`uvicorn`).
2. In another terminal, start the frontend (`npm run dev`).
3. Open the frontend URL; it will communicate with the backend via `/api/v1/*`.

---
*Phase 1 complete – folder scaffolding and basic configuration.*
