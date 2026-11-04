import unittest
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.dependencies import get_current_user
from app.main import app


USER_ID = "00000000-0000-0000-0000-000000000001"


class PortfolioQuery:
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
        self.filters.append(("eq", column, str(value)))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, {str(value) for value in values}))
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

    def upsert(self, payload, **_kwargs):
        self.operation = "upsert"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        schema = self.database.schemas[self.table_name]
        columns = [column for _, column, _ in self.filters]
        if self.sort_key:
            columns.append(self.sort_key)
        if self.payload:
            columns.extend(self.payload)
        for column in columns:
            if column not in schema:
                raise APIError({
                    "code": "42703",
                    "message": f"column {self.table_name}.{column} does not exist",
                })

        records = self.database.records[self.table_name]
        selected = [
            record for record in records
            if all(
                (record.get(column) == value if operation == "eq"
                 else str(record.get(column)) in value)
                for operation, column, value in self.filters
            )
        ]
        if self.operation == "insert":
            record = {"id": str(uuid4()), **self.payload}
            records.append(record)
            return SimpleNamespace(data=[record])
        if self.operation == "upsert":
            existing = next(
                (
                    record for record in records
                    if record.get("portfolio_id") == self.payload.get("portfolio_id")
                    and record.get("stock_id") == self.payload.get("stock_id")
                ),
                None,
            )
            if existing:
                existing.update(self.payload)
                return SimpleNamespace(data=[existing])
            record = {"id": str(uuid4()), **self.payload}
            records.append(record)
            return SimpleNamespace(data=[record])
        if self.operation == "update":
            for record in selected:
                record.update(self.payload)
            return SimpleNamespace(data=selected)
        if self.operation == "delete":
            self.database.records[self.table_name] = [
                record for record in records if record not in selected
            ]
            return SimpleNamespace(data=selected)
        if self.sort_key:
            selected.sort(
                key=lambda record: record.get(self.sort_key) or "",
                reverse=self.descending,
            )
        if self.max_rows is not None:
            selected = selected[:self.max_rows]
        return SimpleNamespace(data=selected)


class PortfolioDatabase:
    schemas = {
        "portfolios": {"id", "user_id", "name", "created_at"},
        "portfolio_holdings": {
            "id", "portfolio_id", "stock_id", "quantity", "avg_price",
            "created_at", "updated_at",
        },
        "portfolio_transactions": {
            "id", "portfolio_id", "stock_id", "type", "quantity", "price",
            "executed_at",
        },
        "stocks": {"id", "symbol", "name", "exchange"},
    }

    def __init__(self):
        portfolio_id = "00000000-0000-0000-0000-000000000002"
        stock_id = "00000000-0000-0000-0000-000000000003"
        self.records = {
            "portfolios": [
                {
                    "id": portfolio_id,
                    "user_id": USER_ID,
                    "name": "My portfolio",
                    "created_at": "2026-11-03T00:00:00+00:00",
                },
                {
                    "id": "00000000-0000-0000-0000-000000000004",
                    "user_id": "another-user",
                    "name": "Private portfolio",
                    "created_at": "2026-11-02T00:00:00+00:00",
                },
            ],
            "portfolio_holdings": [{
                "id": "holding-1",
                "portfolio_id": portfolio_id,
                "stock_id": stock_id,
                "quantity": 2,
                "avg_price": 120,
                "created_at": "2026-11-03T00:00:00+00:00",
            }],
            "portfolio_transactions": [],
            "stocks": [{
                "id": stock_id,
                "symbol": "ABC.NSE",
                "name": "ABC Limited",
                "exchange": "NSE",
            }],
        }

    def table(self, name):
        return PortfolioQuery(self, name)


class PortfolioSummaryApiTests(unittest.TestCase):
    def setUp(self):
        self.database = PortfolioDatabase()
        app.dependency_overrides[get_current_user] = lambda: {
            "id": USER_ID,
            "_db": self.database,
        }
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.pop(get_current_user, None)

    def test_portfolio_summary_lists_only_user_portfolios_and_joins_holdings(self):
        response = self.client.get("/api/v1/portfolios/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [portfolio["name"] for portfolio in response.json()],
            ["My portfolio"],
        )

        portfolio_id = self.database.records["portfolios"][0]["id"]
        response = self.client.get(f"/api/v1/portfolios/{portfolio_id}")

        self.assertEqual(response.status_code, 200)
        portfolio = response.json()
        self.assertEqual(portfolio["user_id"], USER_ID)
        self.assertEqual(portfolio["holdings"][0]["stock"]["symbol"], "ABC.NSE")
        self.assertEqual(portfolio["holdings"][0]["quantity"], 2)

    def test_portfolio_mutations_and_related_records_use_existing_user_id_schema(self):
        created = self.client.post(
            "/api/v1/portfolios/",
            json={"name": "New portfolio"},
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["user_id"], USER_ID)
        self.assertNotIn("owner_id", created.json())

        portfolio_id = self.database.records["portfolios"][0]["id"]
        updated = self.client.patch(
            f"/api/v1/portfolios/{portfolio_id}",
            json={"name": "Updated portfolio"},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["name"], "Updated portfolio")

        stock_id = self.database.records["stocks"][0]["id"]
        holding = self.client.put(
            f"/api/v1/portfolios/{portfolio_id}/holdings",
            json={"stock_id": stock_id, "quantity": 3, "avg_price": 125},
        )
        self.assertEqual(holding.status_code, 200)
        self.assertEqual(holding.json()["quantity"], 3)

        transaction = self.client.post(
            f"/api/v1/portfolios/{portfolio_id}/transactions",
            json={
                "stock_id": stock_id,
                "type": "buy",
                "quantity": 1,
                "price": 125,
                "executed_at": "2026-11-03T10:00:00Z",
            },
        )
        self.assertEqual(transaction.status_code, 201)
        self.assertEqual(transaction.json()["portfolio_id"], portfolio_id)
        self.assertEqual(
            self.client.get(f"/api/v1/portfolios/{portfolio_id}/transactions").status_code,
            200,
        )

        deleted = self.client.delete(f"/api/v1/portfolios/{portfolio_id}")
        self.assertEqual(deleted.status_code, 204)


if __name__ == "__main__":
    unittest.main()
