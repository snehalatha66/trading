import asyncio
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from app.routers import stocks, watchlist
from app.dependencies import get_current_user
from app.main import app
from postgrest.exceptions import APIError


class FakeQuery:
    def __init__(self, database, table):
        self.database = database
        self.table_name = table
        self.operation = "select"
        self.payload = None
        self.filters = []
        self.sort_key = None
        self.descending = False
        self.max_rows = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.filters.append(lambda row: str(row.get(column)) == str(value))
        return self

    def in_(self, column, values):
        normalized = {str(value) for value in values}
        self.filters.append(lambda row: str(row.get(column)) in normalized)
        return self

    def ilike(self, column, value):
        term = value.strip("%").casefold()
        self.filters.append(lambda row: term in str(row.get(column, "")).casefold())
        return self

    def or_(self, expression):
        term = expression.split("%", 2)[1].casefold()
        self.filters.append(
            lambda row: term in str(row.get("symbol", "")).casefold()
            or term in str(row.get("name", "")).casefold()
        )
        return self

    def order(self, column, desc=False, **_kwargs):
        self.sort_key = column
        self.descending = desc
        return self

    def limit(self, value):
        self.max_rows = value
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        rows = self.database.tables.setdefault(self.table_name, [])
        if self.operation == "insert":
            record = {
                "id": str(uuid4()),
                "created_at": datetime.now(timezone.utc).isoformat(),
                **self.payload,
            }
            rows.append(record)
            return SimpleNamespace(data=[record])

        selected = [
            row for row in rows
            if all(predicate(row) for predicate in self.filters)
        ]
        if self.operation == "update":
            for record in selected:
                record.update(self.payload)
            return SimpleNamespace(data=selected)
        if self.operation == "delete":
            self.database.tables[self.table_name] = [
                row for row in rows if row not in selected
            ]
            return SimpleNamespace(data=selected)
        if self.sort_key:
            selected.sort(
                key=lambda row: row.get(self.sort_key) or "",
                reverse=self.descending,
            )
        if self.max_rows is not None:
            selected = selected[:self.max_rows]
        return SimpleNamespace(data=selected)


class FakeDatabase:
    def __init__(self, tables):
        self.tables = tables
        self.query_count = 0

    def table(self, name):
        self.query_count += 1
        return FakeQuery(self, name)

    def rpc(self, name, params):
        self.query_count += 1
        if name != "get_latest_market_snapshots":
            raise AssertionError(f"Unexpected RPC: {name}")
        stock_ids = {str(stock_id) for stock_id in params["p_stock_ids"]}
        latest = {}
        for snapshot in self.tables.get("market_snapshots", []):
            stock_id = str(snapshot["stock_id"])
            if stock_id not in stock_ids:
                continue
            if stock_id not in latest or snapshot["snapshot_at"] > latest[stock_id]["snapshot_at"]:
                latest[stock_id] = snapshot
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=list(latest.values())))


class LegacyOwnerQuery(FakeQuery):
    def eq(self, column, value):
        if self.table_name == "watchlists" and column == "owner_id":
            raise APIError({
                "message": "Could not find the 'owner_id' column of 'watchlists' in the schema cache",
                "code": "PGRST204",
                "details": None,
                "hint": 'Perhaps you meant "watchlists.user_id".',
            })
        return super().eq(column, value)

    def execute(self):
        if (
            self.table_name == "watchlists"
            and self.operation == "insert"
            and "owner_id" in self.payload
        ):
            raise APIError({
                "message": "Could not find the 'owner_id' column of 'watchlists' in the schema cache",
                "code": "PGRST204",
                "details": None,
                "hint": 'Perhaps you meant "watchlists.user_id".',
            })
        return super().execute()


class LegacyOwnerDatabase(FakeDatabase):
    def table(self, name):
        self.query_count += 1
        return LegacyOwnerQuery(self, name)

    def rpc(self, name, params):
        if name == "get_latest_market_snapshots":
            raise APIError({
                "message": "Could not find the function in the schema cache",
                "code": "PGRST202",
                "details": None,
                "hint": None,
            })
        return super().rpc(name, params)


class WatchlistApiTests(unittest.TestCase):
    def setUp(self):
        self.owner_id = str(uuid4())
        self.watchlist_id = str(uuid4())
        self.stock_id = str(uuid4())
        self.database = FakeDatabase({
            "watchlists": [{
                "id": self.watchlist_id,
                "owner_id": self.owner_id,
                "name": "Long-term",
                "created_at": "2026-11-03T00:00:00+00:00",
            }, {
                "id": str(uuid4()),
                "owner_id": str(uuid4()),
                "name": "Another user's list",
                "created_at": "2026-11-03T00:00:00+00:00",
            }],
            "watchlist_stocks": [{
                "id": str(uuid4()),
                "watchlist_id": self.watchlist_id,
                "stock_id": self.stock_id,
            }],
            "stocks": [{
                "id": self.stock_id,
                "symbol": "ABC",
                "name": "ABC Limited",
            }],
            "market_snapshots": [{
                "stock_id": self.stock_id,
                "price": 123.45,
                "snapshot_at": "2026-11-03T10:00:00+00:00",
            }],
        })
        self.user = {"id": self.owner_id, "_db": self.database}

    def test_list_loads_owner_watchlists_stocks_and_latest_saved_prices_in_batched_queries(self):
        result = asyncio.run(watchlist.list_watchlists(self.user))

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], self.watchlist_id)
        self.assertEqual(result[0]["stocks"][0]["id"], self.stock_id)
        self.assertEqual(result[0]["stocks"][0]["snapshot"]["price"], 123.45)
        self.assertLessEqual(self.database.query_count, 4)

    def test_create_add_remove_and_reload_persist_watchlist_data(self):
        created = asyncio.run(
            watchlist.create_watchlist(
                watchlist.WatchlistCreate(name="  Growth  "),
                {"id": self.owner_id, "_db": self.database},
            )
        )
        self.assertEqual(created["name"], "Growth")
        self.assertEqual(created["stocks"], [])

        asyncio.run(
            watchlist.add_watchlist_stock(
                UUID(created["id"]),
                watchlist.WatchlistStockCreate(stock_id=UUID(self.stock_id)),
                self.user,
            )
        )
        reloaded = asyncio.run(watchlist.get_watchlist(UUID(created["id"]), self.user))
        self.assertEqual([item["symbol"] for item in reloaded["stocks"]], ["ABC"])

        asyncio.run(
            watchlist.remove_watchlist_stock(
                UUID(created["id"]),
                UUID(self.stock_id),
                self.user,
            )
        )
        refreshed = asyncio.run(watchlist.get_watchlist(UUID(created["id"]), self.user))
        self.assertEqual(refreshed["stocks"], [])

    def test_stock_search_uses_local_stock_database_without_market_provider(self):
        original_database = stocks.supabase
        stocks.supabase = self.database
        try:
            result = asyncio.run(stocks.list_stocks(q="ABC", limit=10))
        finally:
            stocks.supabase = original_database
        self.assertEqual(result[0]["symbol"], "ABC")

    def test_stock_search_routes_do_not_require_trailing_slash_redirect(self):
        from app.main import app

        paths = app.openapi()["paths"]
        self.assertIn("/api/v1/stocks", paths)
        self.assertIn("/api/v1/stocks/", paths)

    def test_stock_search_database_query_runs_off_event_loop(self):
        import threading

        event_loop_thread = threading.get_ident()
        query_threads = []
        original_rows = stocks.rows

        def capture_query_thread(query):
            query_threads.append(threading.get_ident())
            return original_rows(query)

        original_database = stocks.supabase
        stocks.supabase = self.database
        stocks.rows = capture_query_thread
        try:
            asyncio.run(stocks.list_stocks(q="ABC", limit=10))
        finally:
            stocks.supabase = original_database
            stocks.rows = original_rows
        self.assertTrue(query_threads)
        self.assertNotEqual(query_threads[0], event_loop_thread)

    def test_existing_user_id_schema_remains_usable_until_alignment_migration(self):
        database = LegacyOwnerDatabase({
            "watchlists": [{
                "id": self.watchlist_id,
                "user_id": self.owner_id,
                "name": "Legacy list",
                "created_at": "2026-11-03T00:00:00+00:00",
            }],
            "watchlist_stocks": [],
            "stocks": [],
            "market_snapshots": [],
        })
        user = {"id": self.owner_id, "_db": database}

        lists = asyncio.run(watchlist.list_watchlists(user))
        created = asyncio.run(
            watchlist.create_watchlist(
                watchlist.WatchlistCreate(name="New list"),
                user,
            )
        )

        self.assertEqual(lists[0]["name"], "Legacy list")
        self.assertEqual(created["name"], "New list")
        self.assertEqual(created["user_id"], self.owner_id)

    def test_watchlist_api_handles_postgrest_missing_owner_column_response(self):
        database = LegacyOwnerDatabase({
            "watchlists": [{
                "id": self.watchlist_id,
                "user_id": self.owner_id,
                "name": "Legacy list",
                "created_at": "2026-11-03T00:00:00+00:00",
            }],
            "watchlist_stocks": [],
            "stocks": [],
            "market_snapshots": [],
        })
        app.dependency_overrides[get_current_user] = lambda: {
            "id": self.owner_id,
            "_db": database,
        }
        try:
            response = TestClient(app).get("/api/v1/watchlists/")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["name"], "Legacy list")


if __name__ == "__main__":
    unittest.main()
