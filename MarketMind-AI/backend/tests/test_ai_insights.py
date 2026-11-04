import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.routers import ai_insights


class FakeGeminiResponse:
    is_error = False
    status_code = 200

    @staticmethod
    def json():
        return {
            "candidates": [{
                "content": {"parts": [{"text": "Evidence-based market summary."}]}
            }]
        }


class FakeGeminiClient:
    def __init__(self):
        self.request = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, url, *, params, json):
        self.request = {"url": url, "params": params, "body": json}
        return FakeGeminiResponse()


class AIInsightsTests(unittest.TestCase):
    def test_generate_content_uses_configured_model_and_real_provider_context(self):
        client = FakeGeminiClient()
        with (
            patch.object(ai_insights.settings, "GEMINI_API_KEY", "test-key"),
            patch.object(ai_insights.settings, "GEMINI_MODEL", "gemini-3.5-flash"),
            patch.object(ai_insights.settings, "GEMINI_API_VERSION", "v1beta"),
            patch.object(
                ai_insights,
                "get_indices",
                new=AsyncMock(return_value=[{
                    "symbol": "NSEI.INDX",
                    "value": 25000,
                    "timestamp": "2026-11-03T10:00:00Z",
                }]),
            ),
            patch.object(
                ai_insights,
                "get_index_history",
                new=AsyncMock(return_value=[
                    {"time": "2026-11-02", "value": 24900},
                    {"time": "2026-11-03", "value": 25000},
                ]),
            ),
            patch.object(ai_insights, "get_news", new=AsyncMock(return_value=[])),
            patch.object(
                ai_insights.httpx,
                "AsyncClient",
                return_value=client,
            ),
        ):
            result = asyncio.run(ai_insights.generate_market_insights(symbol=None))

        self.assertIn(
            "/v1beta/models/gemini-3.5-flash:generateContent",
            client.request["url"],
        )
        self.assertEqual(client.request["params"], {"key": "test-key"})
        prompt = client.request["body"]["contents"][0]["parts"][0]["text"]
        self.assertIn("25000", prompt)
        self.assertIn("SENSEX data is unavailable", prompt)
        self.assertEqual(result["insight"], "Evidence-based market summary.")
        self.assertEqual(result["data_sources"]["nifty_50"]["quote"]["value"], 25000)

    def test_generate_content_reports_the_configured_model_when_unavailable(self):
        class ErrorResponse:
            is_error = True
            status_code = 404

        class ErrorClient(FakeGeminiClient):
            async def post(self, *_args, **_kwargs):
                return ErrorResponse()

        with (
            patch.object(ai_insights.settings, "GEMINI_API_KEY", "test-key"),
            patch.object(ai_insights.settings, "GEMINI_MODEL", "unavailable-model"),
            patch.object(ai_insights.settings, "GEMINI_API_VERSION", "v1beta"),
            patch.object(
                ai_insights,
                "get_indices",
                new=AsyncMock(return_value=[{
                    "symbol": "NSEI.INDX",
                    "value": 25000,
                    "timestamp": "2026-11-03T10:00:00Z",
                }]),
            ),
            patch.object(
                ai_insights,
                "get_index_history",
                new=AsyncMock(return_value=[
                    {"time": "2026-11-02", "value": 24900},
                    {"time": "2026-11-03", "value": 25000},
                ]),
            ),
            patch.object(ai_insights, "get_news", new=AsyncMock(return_value=[])),
            patch.object(
                ai_insights.httpx,
                "AsyncClient",
                return_value=ErrorClient(),
            ),
        ):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(ai_insights.generate_market_insights(symbol=None))

        self.assertIn("unavailable-model", error.exception.detail)
        self.assertIn("HTTP 404", error.exception.detail)


if __name__ == "__main__":
    unittest.main()
