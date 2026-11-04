import asyncio
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.main import app
from app.routers import eodhd_market, paper_trading, price_alerts
from app.routers._database import storage_error


class FakeRPCClient:
    def __init__(self, account=None, trade=None):
        self.account = account
        self.trade = trade
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        value = self.account if name == "get_or_create_paper_trading_account" else self.trade
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=value))


class TableQuery:
    def __init__(self, database, table):
        self.database = database
        self.table_name = table
        self.filters = []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        accepted = {str(value) for value in values}
        self.filters.append((column, accepted))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, _limit):
        return self

    def execute(self):
        self.database.query_threads.append(threading.get_ident())
        result = self.database.tables.get(self.table_name, [])
        for column, value in self.filters:
            if isinstance(value, set):
                result = [record for record in result if str(record.get(column)) in value]
            else:
                result = [record for record in result if record.get(column) == value]
        return SimpleNamespace(data=result)


class TableDatabase:
    def __init__(self, tables):
        self.tables = tables
        self.query_threads = []

    def table(self, name):
        return TableQuery(self, name)


class TradingIntegrationTests(unittest.TestCase):
    def test_paper_and_alert_routes_are_registered(self):
        openapi = app.openapi()
        registered = {
            (path, method.upper())
            for path, methods in openapi["paths"].items()
            for method in methods
        }
        expected = {
            ("/api/v1/paper/account", "GET"),
            ("/api/v1/paper/holdings", "GET"),
            ("/api/v1/paper/transactions", "GET"),
            ("/api/v1/paper/trades", "POST"),
            ("/api/v1/alerts/", "GET"),
            ("/api/v1/alerts/status", "GET"),
            ("/api/v1/alerts/triggered", "GET"),
        }
        self.assertTrue(expected.issubset(registered))

    def test_alert_status_reports_owner_scoped_triggered_alerts(self):
        stock_id = str(uuid4())
        database = TableDatabase({
            "price_alerts": [
                {"id": "active", "owner_id": "owner", "stock_id": stock_id, "status": "active"},
                {
                    "id": "triggered",
                    "owner_id": "owner",
                    "stock_id": stock_id,
                    "status": "triggered",
                    "current_price": 101,
                    "target_price": 100,
                },
                {"id": "paused", "owner_id": "owner", "stock_id": stock_id, "status": "paused"},
                {"id": "other-owner", "owner_id": "other", "stock_id": stock_id, "status": "triggered"},
            ],
            "stocks": [{"id": stock_id, "symbol": "ABC", "name": "ABC Limited"}],
        })

        result = price_alerts.alert_status({"id": "owner", "_db": database})

        self.assertEqual(result["counts"], {"active": 1, "paused": 1, "triggered": 1, "total": 3})
        self.assertEqual(result["triggered"][0]["stock"]["symbol"], "ABC")

    def test_missing_supabase_schema_returns_migration_instruction(self):
        error = storage_error(
            SimpleNamespace(code="PGRST205", message="table missing from schema cache"),
            "paper-trading",
            "20261103_paper_trading_and_price_alerts.sql",
        )
        self.assertEqual(error.status_code, 503)
        self.assertIn("20261103_paper_trading_and_price_alerts.sql", error.detail)

    def test_alert_monitor_runs_blocking_database_query_off_event_loop(self):
        database = TableDatabase({"price_alerts": []})
        event_loop_thread = threading.get_ident()

        result = asyncio.run(price_alerts.monitor_price_alerts_once(database))

        self.assertEqual(result, 0)
        self.assertTrue(database.query_threads)
        self.assertNotEqual(database.query_threads[0], event_loop_thread)

    def test_end_of_day_date_is_not_treated_as_utc_instant(self):
        self.assertEqual(
            eodhd_market._display_provider_timestamp("2026-11-03"),
            "2026-11-03",
        )

    def test_screener_maps_real_provider_rows(self):
        async def fake_provider_get(path, params):
            self.assertEqual(path, "screener")
            self.assertEqual(params["sort"], "refund_1d_p.desc")
            self.assertIn('"NSE"', params["filters"])
            return {
                "data": [{
                    "code": "ABC",
                    "name": "ABC Ltd",
                    "exchange": "NSE",
                    "adjusted_close": 125.5,
                    "refund_1d": 2.5,
                    "refund_1d_p": 2.0,
                    "last_day_data_date": "2026-11-02",
                }]
            }

        with patch.object(eodhd_market, "_provider_get", new=AsyncMock(side_effect=fake_provider_get)):
            result = asyncio.run(eodhd_market.get_market_movers("gainers"))

        self.assertEqual(result[0]["symbol"], "ABC.NSE")
        self.assertEqual(result[0]["price"], 125.5)
        self.assertEqual(result[0]["timestamp"], "2026-11-02")
        self.assertEqual(result[0]["status"], "end-of-day")

    def test_screener_forbidden_response_is_reported_as_entitlement_requirement(self):
        with patch.object(
            eodhd_market,
            "_provider_get",
            new=AsyncMock(side_effect=HTTPException(
                status_code=502,
                detail="EODHD screener returned HTTP 403: forbidden",
            )),
        ):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(eodhd_market.get_market_movers("gainers"))

        self.assertEqual(error.exception.status_code, 503)
        self.assertIn("All-In-One", error.exception.detail)
        self.assertIn("NSE exchange coverage", error.exception.detail)

    def test_sector_performance_does_not_infer_values_from_stock_screener(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(eodhd_market.get_sector_performance())
        self.assertEqual(error.exception.status_code, 503)
        self.assertIn("sector-index", error.exception.detail)

    def test_nse_pre_open_status_is_normalized_and_calendar_checked(self):
        class FakeResponse:
            status_code = 200
            is_error = False

            @staticmethod
            def json():
                return {
                    "marketState": [{
                        "market": "Capital Market",
                        "marketStatus": "Pre-Open",
                        "tradeDate": "03-Nov-2026 09:00",
                    }]
                }

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, *_args, **_kwargs):
                return FakeResponse()

        with (
            patch.object(eodhd_market, "_nse_holiday_calendar", new=AsyncMock(return_value={})),
            patch.object(eodhd_market.httpx, "AsyncClient", return_value=FakeClient()),
        ):
            result = asyncio.run(eodhd_market.market_status())

        self.assertEqual(result["status"], "Pre-open")
        self.assertFalse(result["is_trading_holiday"])
        self.assertEqual(result["regular_trading_hours"], "09:15–15:30 IST")

    def test_stock_quote_uses_provider_price_and_timestamp(self):
        async def fake_provider_get(path):
            self.assertEqual(path, "real-time/ABC.NSE")
            return {"price": "123.45", "timestamp": "2026-11-03T10:00:00Z"}

        with patch.object(eodhd_market, "_provider_get", new=AsyncMock(side_effect=fake_provider_get)):
            quote = asyncio.run(eodhd_market.get_stock_quote("abc.nse"))

        self.assertEqual(quote["price"], 123.45)
        self.assertEqual(quote["timestamp"], "2026-11-03T10:00:00+00:00")
        self.assertEqual(quote["status"], "provider_quote")

    def test_stock_quote_rejects_non_positive_provider_price(self):
        with patch.object(
            eodhd_market,
            "_provider_get",
            new=AsyncMock(return_value={"price": 0, "timestamp": "2026-11-03"}),
        ):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(eodhd_market.get_stock_quote("ABC.NSE"))

        self.assertEqual(error.exception.status_code, 502)

    def test_paper_trade_uses_server_quote_and_service_role_rpc(self):
        stock_id = uuid4()
        user_database = FakeRPCClient(account=[{"id": "paper-account"}])
        service_database = FakeRPCClient(
            trade={
                "order": {"id": "paper-order"},
                "account": {"cash_balance": 999_000},
                "realized_pnl": 0,
            }
        )
        current_user = {"id": "owner-id", "_db": user_database}

        with (
            patch.object(
                paper_trading,
                "stock_record",
                return_value={"id": str(stock_id), "symbol": "ABC", "exchange": "NSE"},
            ),
            patch.object(
                paper_trading,
                "get_stock_quote",
                new=AsyncMock(return_value={"price": 1000, "timestamp": "2026-11-03T10:00:00Z"}),
            ),
            patch.object(paper_trading, "create_service_client", return_value=service_database),
        ):
            result = asyncio.run(
                paper_trading.execute_paper_trade(
                    paper_trading.PaperTradeCreate(
                        stock_id=stock_id,
                        side="buy",
                        quantity=1,
                    ),
                    current_user,
                )
            )

        self.assertEqual(result["quote"]["price"], 1000)
        self.assertEqual(user_database.calls[0][0], "get_or_create_paper_trading_account")
        self.assertEqual(service_database.calls[0][0], "execute_paper_trade")
        self.assertEqual(service_database.calls[0][1]["p_owner_id"], "owner-id")
        self.assertEqual(service_database.calls[0][1]["p_price"], 1000)
        self.assertNotIn("price", service_database.calls[0][1])

    def test_alert_crossing_uses_inclusive_target_comparison(self):
        self.assertTrue(price_alerts._crossed("above", 100, 100))
        self.assertTrue(price_alerts._crossed("below", 100, 100))
        self.assertTrue(price_alerts._crossed("above", 101, 100))
        self.assertFalse(price_alerts._crossed("below", 101, 100))


if __name__ == "__main__":
    unittest.main()
