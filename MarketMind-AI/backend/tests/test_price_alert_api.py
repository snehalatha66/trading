import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

from app.routers import price_alerts


class AlertQuery:
    def __init__(self, database, table):
        self.database = database
        self.table_name = table
        self.filters = []
        self.operation = "select"
        self.payload = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, {str(value) for value in values}))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, _limit):
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
        records = self.database.tables.setdefault(self.table_name, [])
        if self.operation == "insert":
            record = {**self.payload, "id": str(uuid4())}
            records.append(record)
            return SimpleNamespace(data=[record])

        selected = records
        for operation, column, value in self.filters:
            if operation == "eq":
                selected = [record for record in selected if record.get(column) == value]
            else:
                selected = [
                    record for record in selected if str(record.get(column)) in value
                ]

        if self.operation == "update":
            for record in selected:
                record.update(self.payload)
            return SimpleNamespace(data=selected)
        if self.operation == "delete":
            for record in selected:
                records.remove(record)
            return SimpleNamespace(data=[{"id": record["id"]} for record in selected])
        return SimpleNamespace(data=selected)


class AlertDatabase:
    def __init__(self, stock):
        self.tables = {"stocks": [stock], "price_alerts": []}

    def table(self, table_name):
        return AlertQuery(self, table_name)


class PriceAlertApiTests(unittest.TestCase):
    def test_create_list_update_and_delete_alert(self):
        stock_id = uuid4()
        stock = {
            "id": str(stock_id),
            "symbol": "ABC",
            "name": "ABC Limited",
            "exchange": "NSE",
        }
        database = AlertDatabase(stock)
        current_user = {"id": "owner-id", "_db": database}
        quote = {"price": 90, "timestamp": "2026-11-03T10:00:00Z"}

        with patch.object(
            price_alerts,
            "_quote_for_stock",
            new=AsyncMock(return_value=quote),
        ):
            created = asyncio.run(price_alerts.create_alert(
                price_alerts.AlertCreate(
                    stock_id=stock_id,
                    condition="above",
                    target_price=100,
                ),
                current_user,
            ))
            listed = price_alerts.list_alerts(current_user)
            updated = asyncio.run(price_alerts.update_alert(
                UUID(listed[0]["id"]),
                price_alerts.AlertUpdate(target_price=110),
                current_user,
            ))
            asyncio.run(price_alerts.delete_alert(
                UUID(created["id"]),
                current_user,
            ))

        self.assertEqual(created["status"], "active")
        self.assertEqual(created["current_price"], 90)
        self.assertEqual(listed[0]["stock"]["symbol"], "ABC")
        self.assertEqual(updated["target_price"], 110)
        self.assertEqual(price_alerts.list_alerts(current_user), [])


if __name__ == "__main__":
    unittest.main()
