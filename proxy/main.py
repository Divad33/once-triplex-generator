import asyncio
import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import google.auth.transport.requests
import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.oauth2 import service_account
from pydantic import BaseModel, Field

PICK_3_GAME_ID = 104
PICK_4_GAME_ID = 108
LOTTERY_API_URL = "https://apim-website-prod-eastus.azure-api.net/drawgamesapp"
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
FCM_TOKEN_FILE = os.environ.get("FCM_TOKEN_FILE", "/data/pick3-fcm-tokens.json")
PUSH_STATE_FILE = os.environ.get("PUSH_STATE_FILE", "/data/pick3-push-state.json")
PUSH_POLL_SECONDS = int(os.environ.get("PUSH_POLL_SECONDS", "60"))
HOT_POLL_SECONDS = int(os.environ.get("HOT_POLL_SECONDS", "30"))
LOTTERYUSA_ENABLED = os.environ.get("LOTTERYUSA_ENABLED", "true").lower() != "false"
LOTTERYUSA_USER_AGENT = os.environ.get(
    "LOTTERYUSA_USER_AGENT",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
)
LOTTERYUSA_URLS: dict[tuple[int, str], str] = {
    (PICK_3_GAME_ID, "MIDDAY"): "https://www.lotteryusa.com/florida/midday-pick-3/",
    (PICK_3_GAME_ID, "EVENING"): "https://www.lotteryusa.com/florida/pick-3/",
    (PICK_4_GAME_ID, "MIDDAY"): "https://www.lotteryusa.com/florida/midday-pick-4/",
    (PICK_4_GAME_ID, "EVENING"): "https://www.lotteryusa.com/florida/pick-4/",
}
LOTTERYUSA_ET_ZONE = ZoneInfo("US/Eastern")
# Hot windows in Eastern Time: 5 min before draw to 60 min after.
LOTTERYUSA_HOT_WINDOWS_ET: list[tuple[int, int, int, int]] = [
    (13, 25, 14, 30),
    (21, 40, 22, 45),
]
DRAW_CARD_PATTERN = re.compile(
    r'<tr[^>]*class="[^"]*c-draw-card[^"]*"[^>]*>(.*?)</tr>',
    re.DOTALL,
)
LOTTERYUSA_DATE_PATTERN = re.compile(
    r'<span class="c-draw-card__draw-date-sub">([^<]+)</span>',
)
LOTTERYUSA_BALL_PATTERN = re.compile(
    r'<li class="c-ball c-ball--sm">(\d)</li>',
)
LOTTERYUSA_FIREBALL_PATTERN = re.compile(
    r'<span class="c-ball c-ball--fire c-ball--sm">(\d)</span>',
)
FIREBASE_SERVICE_ACCOUNT_ENV = "FIREBASE_SERVICE_ACCOUNT_JSON"
FIREBASE_SERVICE_ACCOUNT_FILE_ENV = "FIREBASE_SERVICE_ACCOUNT_FILE"
FIREBASE_SERVICE_ACCOUNT_FILE = os.environ.get(FIREBASE_SERVICE_ACCOUNT_FILE_ENV, "firebase-service-account.json")
FIREBASE_PROJECT_ID_ENV = "FIREBASE_PROJECT_ID"
PUSH_ADMIN_TOKEN_ENV = "PUSH_ADMIN_TOKEN"
SEND_EXISTING_DRAW_ON_STARTUP = os.environ.get("SEND_EXISTING_DRAW_ON_STARTUP") == "true"
MAX_PUSH_TOKENS = int(os.environ.get("MAX_PUSH_TOKENS", "5000"))
PUSH_TOKENS: dict[str, Any] = {}

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class Pick3Draw(BaseModel):
    id: str
    seed: str
    drawType: str
    drawDate: str
    fireball: str | None = None


class FloridaLatestResult(BaseModel):
    id: str
    gameId: int
    gameName: str
    number: str
    drawType: str
    drawDate: str
    fireball: str | None = None


class FloridaPushDraw(BaseModel):
    id: str
    drawType: str
    drawDate: str
    pick3: FloridaLatestResult
    pick4: FloridaLatestResult


class PushRegistration(BaseModel):
    token: str = Field(min_length=20, max_length=4096)
    platform: str = Field(default="android", max_length=32)


@app.get("/")
def health() -> dict[str, str]:
    return {"ok": "true"}


@app.get("/pick3/latest")
async def latest_pick3() -> dict[str, Any]:
    draws = await fetch_latest_pick3_draws()
    return {
        "source": "Florida Lottery",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "draws": [draw.model_dump() for draw in draws],
    }


@app.get("/florida/latest")
async def latest_florida() -> dict[str, Any]:
    results = await fetch_latest_florida_results()
    return {
        "source": "Florida Lottery",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "results": [result.model_dump() for result in results],
    }


@app.get("/florida/latest-fast")
async def latest_florida_fast() -> dict[str, Any]:
    results = await fetch_lotteryusa_results()
    return {
        "source": "LotteryUSA",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "results": [result.model_dump() for result in results],
    }


@app.on_event("startup")
async def start_push_scheduler() -> None:
    if firebase_is_configured():
        asyncio.create_task(push_scheduler_loop())


@app.post("/push/register")
def register_push_token(registration: PushRegistration) -> dict[str, Any]:
    tokens = load_push_tokens()
    if len(tokens) >= MAX_PUSH_TOKENS and registration.token not in tokens:
        return {"ok": False, "reason": "token-limit-reached", "pushConfigured": firebase_is_configured()}

    tokens[registration.token] = {
        "platform": registration.platform,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    save_push_tokens(tokens)
    return {"ok": True, "pushConfigured": firebase_is_configured()}


@app.get("/push/status")
def push_status() -> dict[str, Any]:
    return {
        "ok": True,
        "pushConfigured": firebase_is_configured(),
        "registeredDevices": len(load_push_tokens()),
    }


@app.post("/push/send-latest")
async def send_latest_push(x_push_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_push_admin(x_push_admin_token)
    if not firebase_is_configured():
        return {"ok": False, "reason": "firebase-not-configured", "sent": 0, "failed": 0}

    tokens = load_push_tokens()
    if not tokens:
        return {"ok": True, "sent": 0, "failed": 0}

    results = await fetch_latest_florida_results()
    latest_draw = latest_push_draw(results)
    if latest_draw is None:
        return {"ok": False, "reason": "no-draws", "sent": 0, "failed": 0}

    sent, failed = await send_push_to_tokens(list(tokens), latest_draw)
    return {"ok": failed == 0, "sent": sent, "failed": failed}


async def push_scheduler_loop() -> None:
    while True:
        try:
            await send_new_draw_push_if_needed()
        except (httpx.HTTPError, ValueError, KeyError, OSError, json.JSONDecodeError):
            pass
        await asyncio.sleep(current_poll_interval_seconds())


def current_poll_interval_seconds(now: datetime | None = None) -> int:
    return HOT_POLL_SECONDS if in_lotteryusa_hot_window(now) else PUSH_POLL_SECONDS


def in_lotteryusa_hot_window(now: datetime | None = None) -> bool:
    if not LOTTERYUSA_ENABLED:
        return False
    if now is None:
        now_et = datetime.now(LOTTERYUSA_ET_ZONE)
    else:
        now_et = now.astimezone(LOTTERYUSA_ET_ZONE) if now.tzinfo else now.replace(tzinfo=timezone.utc).astimezone(LOTTERYUSA_ET_ZONE)
    minute_of_day = now_et.hour * 60 + now_et.minute
    for sh, sm, eh, em in LOTTERYUSA_HOT_WINDOWS_ET:
        if sh * 60 + sm <= minute_of_day <= eh * 60 + em:
            return True
    return False


async def send_new_draw_push_if_needed() -> None:
    tokens = load_push_tokens()
    if not tokens or not firebase_is_configured():
        return

    latest_draw = await fetch_latest_push_draw_any_source()
    if latest_draw is None:
        return

    state = load_push_state()
    last_sent_id = state.get("lastSentDrawId")
    if last_sent_id in {latest_draw.id, latest_draw.pick3.id}:
        save_push_state(latest_draw.id)
        return

    if last_sent_id is None and not SEND_EXISTING_DRAW_ON_STARTUP:
        save_push_state(latest_draw.id)
        return

    await send_push_to_tokens(list(tokens), latest_draw)
    save_push_state(latest_draw.id)


async def fetch_latest_push_draw_any_source() -> FloridaPushDraw | None:
    if LOTTERYUSA_ENABLED:
        try:
            fast_results = await fetch_lotteryusa_results()
        except (httpx.HTTPError, ValueError, KeyError, OSError):
            fast_results = []
        fast_draw = latest_push_draw(fast_results) if fast_results else None
        if fast_draw is not None:
            return fast_draw
    results = await fetch_latest_florida_results()
    return latest_push_draw(results)


async def fetch_latest_pick3_draws() -> list[Pick3Draw]:
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=21)
    params = {
        "id": str(PICK_3_GAME_ID),
        "startDate": format_florida_date(start_date),
        "endDate": format_florida_date(end_date),
    }

    async with httpx.AsyncClient(timeout=15) as client:
        draws = await try_fetch_draws(client, f"{LOTTERY_API_URL}/searchgames", params=params)
        if draws:
            return draws
        return await try_fetch_draws(client, f"{LOTTERY_API_URL}/getLatestDrawGames")


async def fetch_latest_florida_results() -> list[FloridaLatestResult]:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{LOTTERY_API_URL}/getLatestDrawGames",
            headers={"Accept": "application/json", "x-partner": "web"},
        )
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            return []

        results = [
            result
            for item in data
            if (result := to_florida_latest_result(item)) is not None
        ]
        return sorted(results, key=latest_result_sort_key)


async def try_fetch_draws(
    client: httpx.AsyncClient,
    url: str,
    params: dict[str, str] | None = None,
) -> list[Pick3Draw]:
    try:
        return await fetch_draws(client, url, params=params)
    except (httpx.HTTPError, ValueError, AttributeError, TypeError, KeyError):
        return []


async def fetch_draws(
    client: httpx.AsyncClient,
    url: str,
    params: dict[str, str] | None = None,
) -> list[Pick3Draw]:
    response = await client.get(
        url,
        params=params,
        headers={"Accept": "application/json", "x-partner": "web"},
    )
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, list):
        return []

    draws = [draw for item in data if (draw := to_pick3_draw(item)) is not None]
    return sorted(draws, key=lambda draw: (draw.drawDate, draw.drawType == "EVENING"), reverse=True)


def to_pick3_draw(item: Any) -> Pick3Draw | None:
    if not isinstance(item, dict) or item.get("Id") != PICK_3_GAME_ID:
        return None

    numbers = item.get("DrawNumbers")
    if not isinstance(numbers, list):
        return None

    digits = []
    for number_type in ("wn1", "wn2", "wn3"):
        pick = next(
            (
                number
                for number in numbers
                if isinstance(number, dict) and number.get("NumberType") == number_type
            ),
            None,
        )
        if not isinstance(pick, dict) or not isinstance(pick.get("NumberPick"), int):
            return None
        digits.append(str(pick["NumberPick"]))

    fireball_pick = next(
        (
            number
            for number in numbers
            if isinstance(number, dict) and number.get("NumberType") == "fb"
        ),
        None,
    )
    fireball = None
    if isinstance(fireball_pick, dict) and isinstance(fireball_pick.get("NumberPick"), int):
        fireball = str(fireball_pick["NumberPick"])

    try:
        draw_date = parse_florida_date(str(item.get("DrawDate", "")))
    except ValueError:
        return None
    draw_type = str(item.get("DrawType") or "DRAW")
    date_part = draw_date.date().isoformat()

    return Pick3Draw(
        id=f"{date_part}-{draw_type}",
        seed="".join(digits),
        drawType=draw_type,
        drawDate=draw_date.isoformat().replace("+00:00", "Z"),
        fireball=fireball,
    )


async def fetch_lotteryusa_results() -> list[FloridaLatestResult]:
    if not LOTTERYUSA_ENABLED:
        return []
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": LOTTERYUSA_USER_AGENT}) as client:
        coroutines = [
            fetch_lotteryusa_latest(client, game_id, draw_type)
            for (game_id, draw_type) in LOTTERYUSA_URLS
        ]
        results = await asyncio.gather(*coroutines, return_exceptions=True)
    fetched: list[FloridaLatestResult] = []
    for entry in results:
        if isinstance(entry, FloridaLatestResult):
            fetched.append(entry)
    return sorted(fetched, key=latest_result_sort_key)


async def fetch_lotteryusa_latest(
    client: httpx.AsyncClient, game_id: int, draw_type: str
) -> FloridaLatestResult | None:
    url = LOTTERYUSA_URLS.get((game_id, draw_type))
    if not url:
        return None
    try:
        response = await client.get(url)
        response.raise_for_status()
    except (httpx.HTTPError, ValueError):
        return None
    return parse_lotteryusa_html(response.text, game_id, draw_type)


def parse_lotteryusa_html(html: str, game_id: int, draw_type: str) -> FloridaLatestResult | None:
    digits_needed = 3 if game_id == PICK_3_GAME_ID else 4 if game_id == PICK_4_GAME_ID else 0
    if digits_needed == 0:
        return None
    card_match = DRAW_CARD_PATTERN.search(html)
    if not card_match:
        return None
    card_html = card_match.group(1)
    date_match = LOTTERYUSA_DATE_PATTERN.search(card_html)
    if not date_match:
        return None
    draw_date = parse_lotteryusa_date(date_match.group(1).strip())
    if draw_date is None:
        return None
    balls = LOTTERYUSA_BALL_PATTERN.findall(card_html)
    if len(balls) < digits_needed:
        return None
    number = "".join(balls[:digits_needed])
    fireball_match = LOTTERYUSA_FIREBALL_PATTERN.search(card_html)
    fireball = fireball_match.group(1) if fireball_match else None
    game_name = "Pick 3" if game_id == PICK_3_GAME_ID else "Pick 4"
    return FloridaLatestResult(
        id=f"{game_id}-{draw_date.date().isoformat()}-{draw_type}",
        gameId=game_id,
        gameName=game_name,
        number=number,
        drawType=draw_type,
        drawDate=draw_date.isoformat().replace("+00:00", "Z"),
        fireball=fireball,
    )


def parse_lotteryusa_date(text: str) -> datetime | None:
    try:
        return datetime.strptime(text.strip(), "%B %d, %Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def to_florida_latest_result(item: Any) -> FloridaLatestResult | None:
    if not isinstance(item, dict):
        return None

    game_id = item.get("Id")
    digit_count = 3 if game_id == PICK_3_GAME_ID else 4 if game_id == PICK_4_GAME_ID else 0
    if digit_count == 0:
        return None

    numbers = item.get("DrawNumbers")
    if not isinstance(numbers, list):
        return None

    digits = []
    for index in range(digit_count):
        number_type = f"wn{index + 1}"
        pick = next(
            (
                number
                for number in numbers
                if isinstance(number, dict) and number.get("NumberType") == number_type
            ),
            None,
        )
        if not isinstance(pick, dict) or not isinstance(pick.get("NumberPick"), int):
            return None
        digits.append(str(pick["NumberPick"]))

    fireball_pick = next(
        (
            number
            for number in numbers
            if isinstance(number, dict) and number.get("NumberType") == "fb"
        ),
        None,
    )
    fireball = None
    if isinstance(fireball_pick, dict) and isinstance(fireball_pick.get("NumberPick"), int):
        fireball = str(fireball_pick["NumberPick"])

    try:
        draw_date = parse_florida_date(str(item.get("DrawDate", "")))
    except ValueError:
        return None

    draw_type = str(item.get("DrawType") or "DRAW")
    game_name = "Pick 3" if game_id == PICK_3_GAME_ID else "Pick 4"
    return FloridaLatestResult(
        id=f"{game_id}-{draw_date.date().isoformat()}-{draw_type}",
        gameId=game_id,
        gameName=game_name,
        number="".join(digits),
        drawType=draw_type,
        drawDate=draw_date.isoformat().replace("+00:00", "Z"),
        fireball=fireball,
    )


def draw_type_order(draw_type: str) -> int:
    if draw_type == "MIDDAY":
        return 1
    if draw_type == "EVENING":
        return 2
    return 0


def latest_result_sort_key(result: FloridaLatestResult) -> tuple[int, int, float]:
    return (
        result.gameId,
        draw_type_order(result.drawType),
        -datetime.fromisoformat(result.drawDate.replace("Z", "+00:00")).timestamp(),
    )


def latest_push_draw(results: list[FloridaLatestResult]) -> FloridaPushDraw | None:
    pick3_results = sorted(
        (result for result in results if result.gameId == PICK_3_GAME_ID),
        key=lambda result: (
            datetime.fromisoformat(result.drawDate.replace("Z", "+00:00")).timestamp(),
            draw_type_order(result.drawType),
        ),
        reverse=True,
    )
    pick4_by_period = {
        (result.drawDate, result.drawType.upper()): result
        for result in results
        if result.gameId == PICK_4_GAME_ID
    }

    for pick3 in pick3_results:
        pick4 = pick4_by_period.get((pick3.drawDate, pick3.drawType.upper()))
        if pick4 is None:
            continue
        return FloridaPushDraw(
            id=f"{pick3.drawDate}-{pick3.drawType}-p3-{pick3.number}-p4-{pick4.number}",
            drawType=pick3.drawType,
            drawDate=pick3.drawDate,
            pick3=pick3,
            pick4=pick4,
        )

    return None


def format_florida_date(date: datetime) -> str:
    return f"{date.day:02d}-{MONTHS[date.month - 1]}-{date.year}"


def parse_florida_date(value: str) -> datetime:
    try:
        return datetime.strptime(value.split()[0], "%m/%d/%Y").replace(tzinfo=timezone.utc)
    except (ValueError, IndexError):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))


def firebase_is_configured() -> bool:
    return bool(os.environ.get(FIREBASE_SERVICE_ACCOUNT_ENV) or os.path.exists(FIREBASE_SERVICE_ACCOUNT_FILE))


def require_push_admin(token: str | None) -> None:
    expected = os.environ.get(PUSH_ADMIN_TOKEN_ENV)
    if not expected or token != expected:
        raise HTTPException(status_code=403, detail="push-admin-token-required")


def load_push_tokens() -> dict[str, Any]:
    try:
        with open(FCM_TOKEN_FILE, encoding="utf-8") as token_file:
            data = json.load(token_file)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return PUSH_TOKENS


def save_push_tokens(tokens: dict[str, Any]) -> None:
    PUSH_TOKENS.clear()
    PUSH_TOKENS.update(tokens)
    directory = os.path.dirname(FCM_TOKEN_FILE)
    if directory:
        try:
            os.makedirs(directory, exist_ok=True)
        except OSError:
            return
    try:
        with open(FCM_TOKEN_FILE, "w", encoding="utf-8") as token_file:
            json.dump(tokens, token_file)
    except OSError:
        return


def load_push_state() -> dict[str, Any]:
    try:
        with open(PUSH_STATE_FILE, encoding="utf-8") as state_file:
            data = json.load(state_file)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def save_push_state(last_sent_draw_id: str) -> None:
    directory = os.path.dirname(PUSH_STATE_FILE)
    if directory:
        try:
            os.makedirs(directory, exist_ok=True)
        except OSError:
            return
    try:
        with open(PUSH_STATE_FILE, "w", encoding="utf-8") as state_file:
            json.dump(
                {
                    "lastSentDrawId": last_sent_draw_id,
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                },
                state_file,
            )
    except OSError:
        return


async def send_push_to_tokens(tokens: list[str], draw: FloridaPushDraw) -> tuple[int, int]:
    project_id, access_token = get_firebase_auth()
    url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    sent = 0
    failed = 0

    async with httpx.AsyncClient(timeout=15) as client:
        for token in tokens:
            payload = build_fcm_payload(token, draw)
            response = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if response.is_success:
                sent += 1
            else:
                failed += 1

    return sent, failed


def get_firebase_auth() -> tuple[str, str]:
    raw_service_account = os.environ.get(FIREBASE_SERVICE_ACCOUNT_ENV)
    if raw_service_account is None:
        with open(FIREBASE_SERVICE_ACCOUNT_FILE, encoding="utf-8") as account_file:
            raw_service_account = account_file.read()

    service_account_info = json.loads(raw_service_account)
    project_id = os.environ.get(FIREBASE_PROJECT_ID_ENV) or service_account_info["project_id"]
    credentials = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=[FCM_SCOPE],
    )
    request = google.auth.transport.requests.Request()
    credentials.refresh(request)
    return project_id, credentials.token


def build_fcm_payload(token: str, draw: FloridaPushDraw) -> dict[str, Any]:
    draw_type = "Día ☀️" if draw.drawType.upper() == "MIDDAY" else "Noche 🌙"
    pick3_fireball = f" FB {draw.pick3.fireball}" if draw.pick3.fireball else ""
    pick4_fireball = f" FB {draw.pick4.fireball}" if draw.pick4.fireball else ""
    pick3_text = f"Pick 3: {draw.pick3.number}{pick3_fireball}"
    pick4_text = f"Pick 4: {draw.pick4.number}{pick4_fireball}"
    return {
        "message": {
            "token": token,
            "notification": {
                "title": f"Florida {draw_type}",
                "body": f"{pick3_text} · {pick4_text}",
            },
            "android": {
                "priority": "HIGH",
                "notification": {
                    "channel_id": "pick3-draw-alerts",
                    "icon": "ic_launcher_foreground",
                    "color": "#58a6ff",
                },
            },
            "data": {
                "drawId": draw.id,
                "drawType": draw.drawType,
                "pick3": draw.pick3.number,
                "pick4": draw.pick4.number,
                "drawDate": draw.drawDate,
                "pick3Fireball": draw.pick3.fireball or "",
                "pick4Fireball": draw.pick4.fireball or "",
            },
        },
    }
