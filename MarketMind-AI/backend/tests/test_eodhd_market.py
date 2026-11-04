import asyncio
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import dependencies
from app.main import app
from app.routers import eodhd_market, paper_trading, portfolio, strategy


class FakeQuery:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.filters = []
        self.operation = None
        self.payload = None
        self.max_rows = None

    def select(self, *_args, **_kwargs):
        return self

    def upsert(self, payload, **_kwargs):
        self.operation = "upsert"
        self.payload = payload
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def eq(self, field, value):
        self.filters.append(("eq", field, value))
        return self

    def gte(self, field, value):
        self.filters.append(("gte", field, value))
        return self

    def lte(self, field, value):
        self.filters.append(("lte", field, value))
        return self

    def limit(self, value):
        self.max_rows = value
        return self

    def execute(self):
        records = self.client.records.setdefault(self.table, [])
        if self.operation == "insert":
            payloads = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for payload in payloads:
                record = {**payload, "id": f"{self.table}-{len(records) + 1}"}
                records.append(record)
                inserted.append(record)
            return SimpleNamespace(data=inserted)
        if self.operation == "upsert":
            payloads = self.payload if isinstance(self.payload, list) else [self.payload]
            saved = []
            key = {
                "stocks": "symbol",
                "news_articles": "url",
                "profiles": "auth_uid",
            }[self.table]
            for payload in payloads:
                existing = next(
                    (record for record in records if record.get(key) == payload[key]),
                    None,
                )
                if existing:
                    existing.update(payload)
                    saved.append(existing)
                else:
                    record = {**payload, "id": f"{self.table}-{len(records) + 1}"}
                    records.append(record)
                    saved.append(record)
            return SimpleNamespace(data=saved)

        result = records
        for operation, field, value in self.filters:
            if operation == "eq":
                result = [record for record in result if record.get(field) == value]
            elif operation == "gte":
                result = [record for record in result if record.get(field, "") >= value]
            elif operation == "lte":
                result = [record for record in result if record.get(field, "") <= value]
        if self.max_rows is not None:
            result = result[: self.max_rows]
        return SimpleNamespace(data=result)


class FakeSupabase:
    def __init__(self):
        self.records = {}

    def table(self, name):
        return FakeQuery(self, name)


class EODHDMarketTests(unittest.TestCase):
    def test_fundamentals_endpoint_uses_provider_data(self):
        payload = {"General": {"Name": "Example Company"}}

        async def fake_provider_get(path):
            self.assertEqual(path, "fundamentals/EXAMPLE.NSE")
            return payload

        original = eodhd_market._provider_get
        eodhd_market._provider_get = fake_provider_get
        try:
            result = asyncio.run(eodhd_market.fundamentals(" example.nse "))
        finally:
            eodhd_market._provider_get = original

        self.assertEqual(result, payload)

    def test_fundamentals_endpoint_rejects_invalid_symbols(self):
        async def unexpected_provider_call(*_args, **_kwargs):
            raise AssertionError("Invalid symbols must not reach the provider.")

        original = eodhd_market._provider_get
        eodhd_market._provider_get = unexpected_provider_call
        try:
            with self.assertRaises(HTTPException) as error:
                asyncio.run(eodhd_market.fundamentals("../secret"))
        finally:
            eodhd_market._provider_get = original

        self.assertEqual(error.exception.status_code, 400)

    def test_screener_requests_authorized_provider_endpoint(self):
        async def provider_response(path, params):
            self.assertEqual(path, "screener")
            self.assertEqual(params["limit"], "10")
            return {"data": []}

        with patch.object(eodhd_market, "_provider_get", new=AsyncMock(side_effect=provider_response)) as provider:
            result = asyncio.run(eodhd_market.get_market_movers("gainers"))

        self.assertEqual(result, [])
        provider.assert_awaited_once()

    def test_unknown_mover_kind_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(eodhd_market.get_market_movers("unknown"))
        self.assertEqual(error.exception.status_code, 400)

    def test_news_source_is_derived_from_article_url(self):
        self.assertEqual(
            eodhd_market._news_source("https://www.fxstreet.com/news/example"),
            "fxstreet.com",
        )
        self.assertIsNone(eodhd_market._news_source("not a URL"))

    def test_news_filter_keeps_indian_market_articles(self):
        article = {
            "title": "NIFTY 50 closes higher",
            "content": "The Indian equity market advanced.",
            "date": "2026-11-03T08:30:00+00:00",
            "link": "https://example.com/nifty",
            "symbols": [],
            "tags": [],
        }
        self.assertTrue(eodhd_market._valid_news_item(article))

    def test_news_filter_drops_unrelated_or_invalid_articles(self):
        unrelated = {
            "title": "XRP price forecast",
            "content": "Cryptocurrency markets rallied.",
            "date": "2026-11-03T08:30:00+00:00",
            "link": "https://example.com/crypto",
            "symbols": [],
            "tags": [],
        }
        invalid_link = {
            **unrelated,
            "title": "NIFTY 50 update",
            "link": "http://example.com/nifty",
        }
        invalid_date = {
            **unrelated,
            "title": "NIFTY 50 update",
            "date": "not-a-date",
        }
        self.assertFalse(eodhd_market._valid_news_item(unrelated))
        self.assertFalse(eodhd_market._valid_news_item(invalid_link))
        self.assertFalse(eodhd_market._valid_news_item(invalid_date))

    def test_indian_exchange_symbol_marks_article_relevant(self):
        article = {
            "title": "Company update",
            "date": "2026-11-03T08:30:00+00:00",
            "link": "https://example.com/notice",
            "symbols": ["ABC.NSE"],
            "tags": [],
        }
        self.assertTrue(eodhd_market._valid_news_item(article))

    def test_supported_nifty_symbol_is_used_for_history(self):
        self.assertEqual(eodhd_market.NIFTY_50_SYMBOL, "NSEI.INDX")

    def test_nifty_realtime_failure_falls_back_to_real_eod_values(self):
        async def fake_provider_get(path, _params=None):
            if path == "real-time/NSEI.INDX":
                raise HTTPException(status_code=502, detail="Real-time unavailable")
            if path == "eod/NSEI.INDX":
                return [
                    {"date": "2026-11-02", "close": 23440.8},
                    {"date": "2026-11-03", "close": 23667.35},
                ]
            raise AssertionError(f"Unexpected provider path: {path}")

        original = eodhd_market._provider_get
        eodhd_market._provider_get = fake_provider_get
        try:
            result = asyncio.run(eodhd_market.get_indices())
        finally:
            eodhd_market._provider_get = original

        self.assertEqual(result[0]["symbol"], "NSEI.INDX")
        self.assertEqual(result[0]["value"], 23667.35)
        self.assertAlmostEqual(result[0]["change"], 226.55)
        self.assertEqual(result[0]["status"], "end-of-day")

    def test_nifty_history_maps_provider_eod_rows(self):
        async def fake_provider_get(path, params):
            self.assertEqual(path, "eod/NSEI.INDX")
            self.assertEqual(params["period"], "d")
            return [
                {
                    "date": "2026-11-03",
                    "open": 23500.0,
                    "high": 23700.0,
                    "low": 23450.0,
                    "close": 23667.35,
                    "volume": 215371740,
                },
                {
                    "date": "2026-11-02",
                    "open": 23300.0,
                    "high": 23500.0,
                    "low": 23200.0,
                    "close": 23440.8,
                    "volume": 383377838,
                },
            ]

        original = eodhd_market._provider_get
        eodhd_market._provider_get = fake_provider_get
        try:
            result = asyncio.run(eodhd_market.get_index_history())
        finally:
            eodhd_market._provider_get = original

        self.assertEqual(
            result[0],
            {
                "time": "2026-11-02",
                "value": 23440.8,
                "open": 23300.0,
                "high": 23500.0,
                "low": 23200.0,
                "volume": 383377838,
            },
        )
        self.assertEqual(result[-1]["time"], "2026-11-03")

    def test_market_data_sync_persists_provider_rows_and_is_idempotent(self):
        database = FakeSupabase()
        quote = {
            "symbol": "NSEI.INDX",
            "name": "NIFTY 50",
            "value": 23667.35,
            "timestamp": "2026-11-03T10:00:00Z",
            "volume": 215371740,
            "status": "provider_quote",
        }
        history = [
            {
                "time": "2026-11-03",
                "value": 23667.35,
                "open": 23500.0,
                "high": 23700.0,
                "low": 23450.0,
                "volume": 215371740,
            }
        ]
        articles = [
            {
                "title": "NIFTY 50 closes higher",
                "source": "example.com",
                "timestamp": "2026-11-03T08:30:00Z",
                "url": "https://example.com/nifty",
            }
        ]

        async def fake_indices():
            return [quote]

        async def fake_history():
            return history

        async def fake_news(_limit):
            return articles

        with (
            patch.object(eodhd_market, "create_service_client", return_value=database),
            patch.object(eodhd_market, "get_indices", side_effect=fake_indices),
            patch.object(eodhd_market, "get_index_history", side_effect=fake_history),
            patch.object(eodhd_market, "get_news", side_effect=fake_news),
        ):
            first = asyncio.run(eodhd_market.sync_market_data({"id": "test-user"}))
            second = asyncio.run(eodhd_market.sync_market_data({"id": "test-user"}))

        self.assertTrue(first["market"]["snapshot_saved"])
        self.assertEqual(first["market"]["candles_saved"], 1)
        self.assertEqual(first["news"]["saved"], 1)
        self.assertEqual(first["market"]["quote"]["value"], 23667.35)
        self.assertEqual(first["market"]["history"][0]["open"], 23500.0)
        self.assertEqual(first["news"]["articles"][0]["url"], "https://example.com/nifty")
        self.assertFalse(second["market"]["snapshot_saved"])
        self.assertEqual(second["market"]["candles_saved"], 0)
        self.assertEqual(len(database.records["stocks"]), 1)
        self.assertEqual(len(database.records["market_snapshots"]), 1)
        self.assertEqual(len(database.records["historical_candles"]), 1)
        self.assertEqual(len(database.records["news_articles"]), 1)

    def test_market_data_sync_requires_service_role_before_provider_calls(self):
        error = HTTPException(
            status_code=503,
            detail="Market-data persistence is not configured.",
        )
        with (
            patch.object(
                eodhd_market,
                "create_service_client",
                side_effect=error,
            ),
            patch.object(eodhd_market, "get_indices") as get_indices,
        ):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(eodhd_market.sync_market_data({"id": "test-user"}))

        self.assertEqual(raised.exception.status_code, 503)
        get_indices.assert_not_called()

    def test_sync_api_reports_missing_service_role_without_calling_provider(self):
        dependency_overrides = app.dependency_overrides.copy()
        app.dependency_overrides[dependencies.get_current_user] = lambda: {
            "id": "test-user",
            "_db": FakeSupabase(),
        }
        try:
            with patch.object(
                eodhd_market,
                "create_service_client",
                side_effect=HTTPException(
                    status_code=503,
                    detail="Market-data persistence is not configured. Set SUPABASE_SERVICE_ROLE_KEY.",
                ),
            ):
                response = TestClient(app).post("/api/v1/eodhd/sync")
        finally:
            app.dependency_overrides.clear()
            app.dependency_overrides.update(dependency_overrides)

        self.assertEqual(response.status_code, 503)
        self.assertIn("SUPABASE_SERVICE_ROLE_KEY", response.json()["detail"])

    def test_quota_response_opens_provider_wide_cooldown(self):
        class FakeResponse:
            status_code = 429
            is_error = True
            text = "Daily API quota exhausted"

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, *_args, **_kwargs):
                return FakeResponse()

        previous_until = eodhd_market._provider_quota_until
        previous_cache = dict(eodhd_market._provider_cache)
        eodhd_market._provider_quota_until = 0
        eodhd_market._provider_cache.clear()
        try:
            with (
                patch.object(eodhd_market.settings, "EODHD_API_KEY", "test-key"),
                patch.object(
                    eodhd_market.httpx,
                    "AsyncClient",
                    return_value=FakeClient(),
                ),
            ):
                with self.assertRaises(HTTPException) as first_error:
                    asyncio.run(eodhd_market._provider_get("real-time/NSEI.INDX"))
                with patch.object(
                    eodhd_market.httpx,
                    "AsyncClient",
                    side_effect=AssertionError("Cooldown should prevent retries."),
                ):
                    with self.assertRaises(HTTPException) as next_error:
                        asyncio.run(eodhd_market._provider_get("news"))
        finally:
            eodhd_market._provider_quota_until = previous_until
            eodhd_market._provider_cache.clear()
            eodhd_market._provider_cache.update(previous_cache)

        self.assertEqual(first_error.exception.status_code, 429)
        self.assertEqual(next_error.exception.status_code, 429)
        self.assertIn("paused for one hour", next_error.exception.detail)

    def test_quota_error_payload_also_opens_cooldown(self):
        class FakeResponse:
            status_code = 200
            is_error = False

            @staticmethod
            def json():
                return {"error": "Daily API quota exhausted"}

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, *_args, **_kwargs):
                return FakeResponse()

        previous_until = eodhd_market._provider_quota_until
        previous_cache = dict(eodhd_market._provider_cache)
        eodhd_market._provider_quota_until = 0
        eodhd_market._provider_cache.clear()
        try:
            with (
                patch.object(eodhd_market.settings, "EODHD_API_KEY", "test-key"),
                patch.object(
                    eodhd_market.httpx,
                    "AsyncClient",
                    return_value=FakeClient(),
                ),
            ):
                with self.assertRaises(HTTPException) as error:
                    asyncio.run(eodhd_market._provider_get("news"))
        finally:
            eodhd_market._provider_quota_until = previous_until
            eodhd_market._provider_cache.clear()
            eodhd_market._provider_cache.update(previous_cache)

        self.assertEqual(error.exception.status_code, 429)
        self.assertIn("paused for one hour", error.exception.detail)

    def test_authenticated_user_uses_user_nested_in_supabase_response(self):
        database = FakeSupabase()
        user = SimpleNamespace(
            user=SimpleNamespace(
                id="00000000-0000-0000-0000-000000000001",
                email="user@example.com",
            )
        )
        with (
            patch.object(dependencies.supabase.auth, "get_user", return_value=user),
            patch.object(
                dependencies,
                "create_user_client",
                return_value=database,
            ),
        ):
            result = asyncio.run(dependencies.get_current_user("valid-token"))

        self.assertEqual(result["id"], user.user.id)
        self.assertEqual(result["email"], user.user.email)
        self.assertIs(result["_db"], database)

    def test_invalid_provider_candle_is_rejected_before_persistence(self):
        with self.assertRaises(HTTPException) as error:
            eodhd_market._validated_candles(
                [
                    {
                        "time": "2026-11-03",
                        "value": 23667.35,
                        "open": 23500.0,
                        "high": 23400.0,
                        "low": 23450.0,
                        "volume": 1,
                    }
                ]
            )
        self.assertEqual(error.exception.status_code, 502)

    def test_portfolio_creation_uses_authenticated_database_client(self):
        database = FakeSupabase()
        user = {"id": "owner-1", "_db": database}

        result = portfolio.create_portfolio(
            portfolio.PortfolioCreate(name="My portfolio"),
            user,
        )

        self.assertEqual(result["user_id"], "owner-1")
        self.assertEqual(result["name"], "My portfolio")
        self.assertEqual(len(database.records["portfolios"]), 1)

    def test_paper_order_creation_uses_authenticated_database_client(self):
        database = FakeSupabase()
        user_id = "00000000-0000-0000-0000-000000000001"
        portfolio_id = "00000000-0000-0000-0000-000000000002"
        stock_id = "00000000-0000-0000-0000-000000000003"
        database.records["portfolios"] = [
            {"id": portfolio_id, "user_id": user_id}
        ]
        database.records["stocks"] = [{"id": stock_id, "symbol": "NSEI.INDX"}]

        result = paper_trading.create_order(
            paper_trading.PaperOrderCreate(
                portfolio_id=UUID(portfolio_id),
                stock_id=UUID(stock_id),
                side="buy",
                quantity=1,
                price=23667.35,
            ),
            {"id": user_id, "_db": database},
        )

        self.assertEqual(result["status"], "pending")
        self.assertEqual(result["portfolio_id"], portfolio_id)
        self.assertEqual(len(database.records["paper_orders"]), 1)

    def test_backtest_result_uses_authenticated_database_client(self):
        database = FakeSupabase()
        user_id = "00000000-0000-0000-0000-000000000001"
        strategy_id = UUID("00000000-0000-0000-0000-000000000002")
        database.records["strategies"] = [
            {"id": str(strategy_id), "owner_id": user_id}
        ]

        result = asyncio.run(
            strategy.create_backtest_result(
                strategy_id,
                strategy.BacktestCreate(
                    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
                    end_date=datetime(2026, 2, 1, tzinfo=timezone.utc),
                    performance={"return_percent": 4.2},
                ),
                {"id": user_id, "_db": database},
            )
        )

        self.assertEqual(result["strategy_id"], str(strategy_id))
        self.assertEqual(result["performance"]["return_percent"], 4.2)
        self.assertEqual(len(database.records["backtest_results"]), 1)

    def test_news_query_is_india_tagged_and_filters_irrelevant_results(self):
        relevant = {
            "title": "NIFTY 50 closes higher",
            "content": "The benchmark index advanced during the session.",
            "date": "2026-11-03T08:30:00+00:00",
            "link": "https://example.com/nifty",
            "symbols": [],
            "tags": [],
        }
        unrelated = {
            "title": "Global crypto rally",
            "date": "2026-11-03T08:30:00+00:00",
            "link": "https://example.com/crypto",
            "symbols": [],
            "tags": [],
        }

        async def fake_provider_get(path, params):
            self.assertEqual(path, "news")
            self.assertEqual(params, {"t": "india", "limit": "50"})
            return [relevant, unrelated]

        original = eodhd_market._provider_get
        eodhd_market._provider_get = fake_provider_get
        try:
            result = asyncio.run(eodhd_market.get_news())
        finally:
            eodhd_market._provider_get = original

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["url"], relevant["link"])
        self.assertEqual(result[0]["source"], "example.com")
        self.assertEqual(
            result[0]["summary"],
            "The benchmark index advanced during the session.",
        )

    def test_news_endpoint_skips_malformed_provider_items_without_raising(self):
        relevant = {
            "title": "NIFTY 50 closes higher",
            "content": "The benchmark index advanced during the session.",
            "date": "2026-11-03T08:30:00+00:00",
            "link": "https://example.com/nifty",
            "symbols": [],
            "tags": [],
        }

        async def fake_provider_get(_path, _params):
            return [None, "malformed item", {"symbols": 17, "tags": 17}, relevant]

        with patch.object(
            eodhd_market,
            "_provider_get",
            new=AsyncMock(side_effect=fake_provider_get),
        ):
            response = TestClient(app).get("/api/v1/eodhd/news")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["title"] for item in response.json()], [relevant["title"]])

    def test_market_status_uses_verified_nse_capital_market_state(self):
        class FakeResponse:
            status_code = 200
            is_error = False

            @staticmethod
            def json():
                return {
                    "marketState": [
                        {
                            "market": "Capital Market",
                            "marketStatus": "Open",
                            "tradeDate": "03-Nov-2026 14:19",
                        }
                    ]
                }

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, *_args, **_kwargs):
                return FakeResponse()

        with (
            patch.object(
                eodhd_market,
                "_nse_holiday_calendar",
                new=AsyncMock(return_value={}),
            ),
            patch.object(eodhd_market.httpx, "AsyncClient", return_value=FakeClient()),
        ):
            result = asyncio.run(eodhd_market.market_status())

        self.assertEqual(result["status"], "Open")
        self.assertEqual(result["source"], "NSE Capital Market status")
