# backend/app/routers/eodhd.py
"""EODHD connectivity test router.
Provides a simple endpoint that fetches real‑time quotes for a few NSE symbols
using the EODHD API key defined in ``backend/.env`` (exposed via Settings).
The endpoint never logs or returns the API key itself.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import httpx
from datetime import datetime

from ..config import settings

router = APIRouter()

SYMBOLS = ["RELIANCE.NSE", "TCS.NSE", "INFY.NSE"]

class SymbolResult(BaseModel):
    symbol: str
    supported: bool
    data: dict | None = None
    error: str | None = None
    timestamp: str | None = None

@router.get("/api/v1/eodhd-test", response_model=list[SymbolResult])
async def eodhd_test():
    """Fetch real‑time quotes for a handful of NSE symbols.
    Returns a list with per‑symbol status, data and fetch timestamp.
    """
    api_key = settings.EODHD_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="EODHD_API_KEY not configured")

    results: list[SymbolResult] = []
    async with httpx.AsyncClient() as client:
        for sym in SYMBOLS:
            url = f"https://eodhistoricaldata.com/api/real-time/{sym}?api_token={api_key}&fmt=json"
            try:
                resp = await client.get(url, timeout=10.0)
                ts = datetime.utcnow().isoformat() + "Z"
                if resp.status_code == 200:
                    data = resp.json()
                    # If the API returns an error field, treat as unsupported / auth issue
                    if data.get("code"):
                        results.append(
                            SymbolResult(
                                symbol=sym,
                                supported=False,
                                data=None,
                                error=data.get("message", "Unknown error"),
                                timestamp=ts,
                            )
                        )
                    else:
                        # Determine if data is real‑time or delayed based on provider flag
                        realtime = data.get("timestamp") is not None
                        results.append(
                            SymbolResult(
                                symbol=sym,
                                supported=True,
                                data=data,
                                error=None,
                                timestamp=ts,
                            )
                        )
                else:
                    # Non‑200 status – could be auth, subscription or exchange coverage issue
                    results.append(
                        SymbolResult(
                            symbol=sym,
                            supported=False,
                            data=None,
                            error=f"HTTP {resp.status_code}: {resp.text}",
                            timestamp=ts,
                        )
                    )
            except httpx.RequestError as exc:
                results.append(
                    SymbolResult(
                        symbol=sym,
                        supported=False,
                        data=None,
                        error=str(exc),
                        timestamp=datetime.utcnow().isoformat() + "Z",
                    )
                )
    return results
