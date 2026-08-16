
# ── ONCE Triplex Endpoint ──────────────────────────────────────
import re as _re
from datetime import datetime as _dt, timezone as _tz

_ONCE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "es-ES,es;q=0.9",
}
_ONCE_MONTHS = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril", 5: "mayo", 6: "junio",
    7: "julio", 8: "agosto", 9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
}
_ONCE_SORTEO = {
    "primer": 1, "primero": 1, "segundo": 2,
    "tercer": 3, "tercero": 3, "cuarto": 4, "quinto": 5,
}

def _norm(m: str) -> str:
    return m.replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u")

def _once_url(d: _dt) -> str:
    return f"https://www.juegosonce.es/resultados-triplex-{d.day}-{_norm(_ONCE_MONTHS[d.month])}-{d.year}"

def _parse_once(html: str, date: _dt) -> list:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    r = []
    pat = _re.compile(r"N[uú]meros para el\s+(\w+)\s+sorteo del Triplex:\s*(\d)\s*,\s*(\d)\s*,\s*(\d)", _re.I)
    for t in soup.find_all(text=True):
        m = pat.search(t)
        if m:
            s = _ONCE_SORTEO.get(m.group(1).lower())
            if s is None: continue
            r.append({
                "id": f"{date.strftime('%Y-%m-%d')}-S{s}",
                "gameName": "Triplex",
                "number": f"{m.group(2)}{m.group(3)}{m.group(4)}",
                "sorteo": s,
                "drawDate": f"{date.strftime('%Y-%m-%d')}T00:00:00.000Z",
            })
    return r

async def _fetch_once(date: _dt) -> list:
    url = _once_url(date)
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, headers=_ONCE_HEADERS)
            if resp.status_code == 404: return []
            return _parse_once(resp.text, date)
        except Exception: return []

@app.get("/once/latest")
async def latest_once_triplex() -> dict[str, Any]:
    today = _dt.now()
    yesterday = _dt.fromtimestamp(today.timestamp() - 86400)
    draws = await _fetch_once(today)
    if not draws: draws = await _fetch_once(yesterday)
    return {
        "source": "JuegosONCE",
        "updatedAt": _dt.now(_tz.utc).isoformat(),
        "results": draws,
    }
