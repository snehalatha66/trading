"""FastAPI application entry point.
Sets up CORS, includes API routers under /api/v1, and provides the health check.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import auth, profile, stocks, watchlist, portfolio, paper_trading, strategy, news, indicators
from .routers import eodhd_market
from .routers import ai_insights
from .routers import price_alerts
from .routers import transactions

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    stop_event = asyncio.Event()
    monitor_task = None
    if (
        settings.EODHD_API_KEY
        and settings.SUPABASE_URL
        and settings.SUPABASE_SERVICE_ROLE_KEY
    ):
        monitor_task = asyncio.create_task(price_alerts.price_alert_monitor(stop_event))
    else:
        logger.info(
            "Price-alert background monitoring is disabled until EODHD_API_KEY, "
            "SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are configured."
        )
    try:
        yield
    finally:
        if monitor_task:
            stop_event.set()
            await monitor_task


app = FastAPI(title="MarketMind AI Backend", version="0.1.0", lifespan=lifespan)

# CORS – allow the frontend URL only
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(settings.FRONTEND_URL)],
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
app.include_router(eodhd_market.router, prefix="/api/v1/eodhd", tags=["eodhd"])
app.include_router(ai_insights.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(price_alerts.router, prefix="/api/v1/alerts", tags=["price-alerts"])
app.include_router(transactions.router, prefix="/api/v1/transactions", tags=["transactions"])
