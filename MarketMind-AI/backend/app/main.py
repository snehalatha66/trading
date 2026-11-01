"""FastAPI application entry point.
Sets up CORS, includes API routers under /api/v1, and provides the health check.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import auth, profile, stocks, watchlist, portfolio, paper_trading, strategy, news, indicators

app = FastAPI(title="MarketMind AI Backend", version="0.1.0")

# CORS – allow the frontend URL only
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root health check (already existed, keep for compatibility)
@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok"}

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(profile.router, prefix="/api/v1/profile", tags=["profile"])
app.include_router(stocks.router, prefix="/api/v1/stocks", tags=["stocks"])
app.include_router(watchlist.router, prefix="/api/v1/watchlists", tags=["watchlist"])
app.include_router(portfolio.router, prefix="/api/v1/portfolios", tags=["portfolio"])
app.include_router(paper_trading.router, prefix="/api/v1/paper", tags=["paper-trading"])
app.include_router(strategy.router, prefix="/api/v1/strategies", tags=["strategies"])
app.include_router(news.router, prefix="/api/v1/news", tags=["news"])
app.include_router(indicators.router, prefix="/api/v1/indicators", tags=["indicators"])
