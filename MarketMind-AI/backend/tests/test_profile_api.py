import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app import dependencies
from app.main import app


USER_ID = "00000000-0000-0000-0000-000000000001"
ACCESS_TOKEN = "test-access-token"


class ProfileQuery:
    def __init__(self, database):
        self.database = database
        self.operation = "select"
        self.payload = None
        self.filters = []
        self.conflict = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.filters.append((column, str(value)))
        return self

    def limit(self, _value):
        return self

    def upsert(self, payload, *, on_conflict):
        self.operation = "upsert"
        self.payload = payload
        self.conflict = on_conflict
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def execute(self):
        if self.database.error:
            raise self.database.error
        if self.operation == "upsert":
            if self.database.profile is None:
                self.database.profile = {
                    "id": "00000000-0000-0000-0000-000000000002",
                    **self.payload,
                }
                return SimpleNamespace(data=[self.database.profile])
            self.database.profile.update(self.payload)
            return SimpleNamespace(data=[self.database.profile])
        if not self.database.profile:
            return SimpleNamespace(data=[])
        if self.operation == "update":
            self.database.profile.update(self.payload)
        if self.database.profile["auth_uid"] != USER_ID:
            return SimpleNamespace(data=[])
        if any(
            self.database.profile.get(column) != value
            for column, value in self.filters
        ):
            return SimpleNamespace(data=[])
        return SimpleNamespace(data=[self.database.profile])


class ProfileDatabase:
    def __init__(self):
        self.profile = {
            "id": "00000000-0000-0000-0000-000000000002",
            "auth_uid": USER_ID,
            "email": "trader@example.com",
            "full_name": "Test Trader",
            "created_at": "2026-11-03T00:00:00+00:00",
            "updated_at": "2026-11-03T00:00:00+00:00",
        }
        self.error = None

    def table(self, name):
        if name != "profiles":
            raise AssertionError(f"Unexpected table: {name}")
        return ProfileQuery(self)


class ProfileApiTests(unittest.TestCase):
    def setUp(self):
        self.database = ProfileDatabase()
        self.auth_user = SimpleNamespace(id=USER_ID, email="trader@example.com")
        self.auth_get_user = patch.object(
            dependencies.supabase.auth,
            "get_user",
            return_value=SimpleNamespace(user=self.auth_user),
        )
        self.create_user_client = patch.object(
            dependencies,
            "create_user_client",
            return_value=self.database,
        )
        self.auth_get_user.start()
        self.create_user_client.start()
        self.url = patch.object(dependencies.settings, "SUPABASE_URL", "https://supabase.example")
        self.anon_key = patch.object(dependencies.settings, "SUPABASE_ANON_KEY", "test-anon-key")
        self.url.start()
        self.anon_key.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.anon_key.stop()
        self.url.stop()
        self.create_user_client.stop()
        self.auth_get_user.stop()

    def test_authenticated_profile_endpoint_returns_settings_data(self):
        response = self.client.get(
            "/api/v1/profile/me",
            headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "id": self.database.profile["id"],
                "auth_uid": USER_ID,
                "email": "trader@example.com",
                "full_name": "Test Trader",
                "created_at": "2026-11-03T00:00:00+00:00",
                "updated_at": "2026-11-03T00:00:00+00:00",
            },
        )
        dependencies.supabase.auth.get_user.assert_called_once_with(ACCESS_TOKEN)

    def test_profile_upsert_executes_once_and_uses_auth_uid_conflict_key(self):
        response = self.client.put(
            "/api/v1/profile/me",
            headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
            json={"email": "new@example.com", "full_name": "Updated Trader"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], "new@example.com")
        self.assertEqual(response.json()["full_name"], "Updated Trader")

    def test_profile_database_permission_errors_are_not_returned_as_http_500(self):
        self.database.error = APIError({
            "code": "42501",
            "message": "permission denied for table profiles",
            "details": None,
            "hint": None,
        })

        response = self.client.get(
            "/api/v1/profile/me",
            headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
        )

        self.assertEqual(response.status_code, 502)
        self.assertIn("permission denied for table profiles", response.json()["detail"])

    def test_missing_profile_row_remains_a_not_found_response(self):
        self.database.profile = None

        response = self.client.get(
            "/api/v1/profile/me",
            headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Profile not found")

    def test_profile_endpoint_requires_a_bearer_token(self):
        response = self.client.get("/api/v1/profile/me")

        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
