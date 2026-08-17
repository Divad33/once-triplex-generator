#!/usr/bin/env python3
"""
Pick3 Results Proxy + ONCE Triplex Proxy
"""

import asyncio
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Pick3 & ONCE Triplex Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Florida Lottery (existente) ────────────────────────────────
FLORIDA_URL = "https://www.flalottery.com/pick3"
LOTTERYUSA_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# ── ONCE Triplex ───────────────────────────────────────────────
ONCE_HEADERS = {
    "User-Agent": LOTTERYUSA_USER_AGENT,
    "Accept-Language": "es-ES,es;q=0.9",
}
ONCE_MONTHS = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
}
ONCE_SORTEO = {
    "primer": 1, "primero": 1, "segundo": 2,
    "tercer": 3, "tercero": 3, "cuarto": 4, "quinto": 5,
}

def _norm(m: str) -> str:
    return m.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")

def _once_url(d: datetime) -> str:
    return f"https://www.juegosonce.es/resultados-triplex-{d.day}-{_norm(ONCE_MONTHS[d.month])}-{d.year}"

def _parse_once(html: str, date: datetime) -> list:
    soup = BeautifulSoup(html, "html.parser")
    r = []
    pat = re.compile(r"N[uú]meros para el\s+(\w+)\s+sorteo del Triplex:\s*(\d)\s*,\s*(\d)\s*,\s*(\d)", re.I)
    for t in soup.find_all(text=True):
        m = pat.search(t)
        if m:
            s = ONCE_SORTEO.get(m.group(1).lower())
            if s is None:
                continue
            r.append({
                "id": f"{date.strftime('%Y-%m-%d')}-S{s}",
                "gameName": "Triplex",
                "number": f"{m.group(2)}{m.group(3)}{m.group(4)}",
                "sorteo": s,
                "drawDate": f"{date.strftime('%Y-%m-%d')}T00:00:00.000Z",
            })
    return r

async def _fetch_once(date: datetime) -> list:
    url = _once_url(date)
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, headers=ONCE_HEADERS)
            if resp.status_code == 404:
                return []
            return _parse_once(resp.text, date)
        except Exception:
            return []

# ── Endpoints ──────────────────────────────────────────────────

@app.get("/")
async def root() -> dict[str, str]:
    return {"status": "ok", "service": "pick3-once-proxy"}

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy"}

@app.get("/once/latest")
async def latest_once_triplex() -> dict[str, Any]:
    today = datetime.now()
    yesterday = datetime.fromtimestamp(today.timestamp() - 86400)
    draws = await _fetch_once(today)
    if not draws:
        draws = await _fetch_once(yesterday)
    return {
        "source": "JuegosONCE",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "results": draws,
    }

if name == "main":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
