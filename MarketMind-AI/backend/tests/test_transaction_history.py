import unittest
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

from postgrest.exceptions import APIError

from app.routers.transactions import list_transactions


class LegacyQuery:
    def __init__(self, database, table):
        self.database = database
        self.table_name = table
        self.filters = []
        self.order_by = None
        self.max_rows = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, {str(value) for value in values}))
        return self

    def order(self, column, desc=False):
        self.order_by = (column, desc)
        return self

    def limit(self, value):
        self.max_rows = value
        return self

    def gte(self, column, value):
        self.filters.append(("gte", column, value))
        return self

    def lte(self, column, value):
        self.filters.append(("lte", column, value))
        return self

    def execute(self):
        schema = self.database.schemas.get(self.table_name)
        if schema is None:
            raise APIError({
                "code": "PGRST205",
                "message": f"Could not find the table public.{self.table_name}.",
            })
        for _, column, _ in self.filters:
            if column not in schema:
                raise APIError({
                    "code": "42703",
                    "message": f"column {self.table_name}.{column} does not exist",
                })
        if self.order_by and self.order_by[0] not in schema:
            raise APIError({
                "code": "42703",
                "message": f"column {self.table_name}.{self.order_by[0]} does not exist",
            })

        result = list(self.database.records.get(self.table_name, []))
        for operation, column, value in self.filters:
            if operation == "eq":
                result = [record for record in result if record.get(column) == value]
            elif operation == "in":
                result = [record for record in result if str(record.get(column)) in value]
            elif operation == "gte":
                result = [record for record in result if record.get(column, "") >= value]
            elif operation == "lte":
                result = [record for record in result if record.get(column, "") <= value]
        if self.order_by:
            column, descending = self.order_by
            result.sort(key=lambda record: record.get(column) or "", reverse=descending)
        if self.max_rows is not None:
            result = result[: self.max_rows]
        return SimpleNamespace(data=result)


class LegacyDatabase:
    schemas = {
        "portfolios": {"id", "user_id"},
        "portfolio_transactions": {
            "id", "portfolio_id", "stock_id", "transaction_type",
            "quantity", "price", "transaction_date",
        },
        "paper_trading_transactions": {
            "id", "user_id", "order_id", "stock_id", "transaction_type",
            "quantity", "execution_price", "created_at",
        },
        "stocks": {"id", "symbol", "name"},
    }

    def __init__(self, owner_id, portfolio_id, stock_id):
        self.records = {
            "portfolios": [
                {"id": portfolio_id, "user_id": owner_id},
                {"id": "other-portfolio", "user_id": "other-user"},
            ],
            "portfolio_transactions": [{
                "id": "portfolio-tx",
                "portfolio_id": portfolio_id,
                "stock_id": stock_id,
                "transaction_type": "buy",
                "quantity": 2,
                "price": 120,
                "transaction_date": "2026-11-02T10:00:00+00:00",
            }],
            "paper_trading_transactions": [{
                "id": "paper-tx",
                "user_id": owner_id,
                "order_id": "paper-order",
                "stock_id": stock_id,
                "transaction_type": "sell",
                "quantity": 3,
                "execution_price": 15,
                "created_at": "2026-11-03T10:00:00+00:00",
            }],
            "stocks": [{
                "id": stock_id,
                "symbol": "ABC.NSE",
                "name": "ABC Limited",
            }],
        }

    def table(self, table_name):
        return LegacyQuery(self, table_name)


class TransactionHistoryTests(unittest.TestCase):
    def setUp(self):
        self.owner_id = str(uuid4())
        self.portfolio_id = str(uuid4())
        self.stock_id = str(uuid4())
        self.database = LegacyDatabase(self.owner_id, self.portfolio_id, self.stock_id)
        self.current_user = {"id": self.owner_id, "_db": self.database}

    def test_reads_legacy_portfolio_and_paper_transactions_separately(self):
        portfolio = list_transactions(
            self.current_user, "portfolio", None, None, None, None, 1000
        )
        paper = list_transactions(
            self.current_user, "paper", None, None, None, None, 1000
        )

        self.assertEqual(len(portfolio), 1)
        self.assertEqual(portfolio[0]["scope"], "portfolio")
        self.assertEqual(portfolio[0]["type"], "buy")
        self.assertEqual(portfolio[0]["executed_at"], "2026-11-02T10:00:00+00:00")
        self.assertEqual(portfolio[0]["total"], 240)
        self.assertEqual(len(paper), 1)
        self.assertEqual(paper[0]["scope"], "paper")
        self.assertEqual(paper[0]["type"], "sell")
        self.assertEqual(paper[0]["price"], 15)
        self.assertEqual(paper[0]["total"], 45)

    def test_legacy_filters_apply_to_each_transaction_source(self):
        start = datetime.fromisoformat("2026-11-03T00:00:00+00:00")
        end = datetime.fromisoformat("2026-11-03T23:59:59+00:00")
        portfolio = list_transactions(
            self.current_user, "portfolio", None, "buy", start, end, 1000
        )
        paper = list_transactions(
            self.current_user, "paper", None, "sell", start, end, 1000
        )

        self.assertEqual(portfolio, [])
        self.assertEqual(len(paper), 1)
        self.assertEqual(paper[0]["id"], "paper-tx")


if __name__ == "__main__":
    unittest.main()
