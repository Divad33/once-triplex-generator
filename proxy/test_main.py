"""Unit tests for the Florida lottery results proxy.

Focused on the new LotteryUSA fast-source HTML parsing and the hot-window
poll-interval logic. We avoid network and FCM in tests.
"""

import os
import sys
from datetime import datetime, timezone

import pytest
from zoneinfo import ZoneInfo

os.environ.setdefault("FIREBASE_SERVICE_ACCOUNT_FILE", "/nonexistent-firebase.json")
sys.path.insert(0, os.path.dirname(__file__))

from main import (  # noqa: E402
    PICK_3_GAME_ID,
    PICK_4_GAME_ID,
    current_poll_interval_seconds,
    in_lotteryusa_hot_window,
    parse_lotteryusa_date,
    parse_lotteryusa_html,
)

ET = ZoneInfo("US/Eastern")

PICK3_EVENING_HTML = """
<tr class="c-results-table__item c-results-table__item--medium c-draw-card">
    <th class="c-draw-card__date" scope="row">
        <div class="c-draw-card__header-col">
            <time class="c-draw-card__draw-date">
                <span class="c-draw-card__draw-date-dow">Saturday,</span>
                <span class="c-draw-card__draw-date-sub">May 16, 2026</span>
            </time>
        </div>
    </th>
    <td class="c-draw-card__result">
        <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
                <ul class="c-result c-draw-card__ball-list">
                    <li class="c-ball c-ball--sm">2</li>
                    <li class="c-ball c-ball--sm">2</li>
                    <li class="c-ball c-ball--sm">3</li>
                    <li class="c-result__bonus">
                        <abbr class="c-result__bonus-abbr" title="Fireball">FB</abbr>
                        <span class="u-hidden-visually">:</span>
                        <span class="c-ball c-ball--fire c-ball--sm">8</span>
                    </li>
                </ul>
            </div>
        </div>
    </td>
</tr>
"""

PICK3_NO_FIREBALL_HTML = """
<tr class="c-draw-card">
    <span class="c-draw-card__draw-date-sub">May 16, 2026</span>
    <ul class="c-result c-draw-card__ball-list">
        <li class="c-ball c-ball--sm">1</li>
        <li class="c-ball c-ball--sm">5</li>
        <li class="c-ball c-ball--sm">9</li>
    </ul>
</tr>
"""

PICK4_HTML = """
<tr class="c-draw-card">
    <span class="c-draw-card__draw-date-sub">May 16, 2026</span>
    <ul class="c-result c-draw-card__ball-list">
        <li class="c-ball c-ball--sm">5</li>
        <li class="c-ball c-ball--sm">0</li>
        <li class="c-ball c-ball--sm">6</li>
        <li class="c-ball c-ball--sm">6</li>
        <li class="c-result__bonus">
            <span class="c-ball c-ball--fire c-ball--sm">8</span>
        </li>
    </ul>
</tr>
"""

MULTIPLE_DRAWS_HTML = """
<tr class="c-draw-card">
    <span class="c-draw-card__draw-date-sub">May 16, 2026</span>
    <ul class="c-result c-draw-card__ball-list">
        <li class="c-ball c-ball--sm">1</li>
        <li class="c-ball c-ball--sm">2</li>
        <li class="c-ball c-ball--sm">3</li>
        <li class="c-result__bonus">
            <span class="c-ball c-ball--fire c-ball--sm">4</span>
        </li>
    </ul>
</tr>
<tr class="c-draw-card">
    <span class="c-draw-card__draw-date-sub">May 15, 2026</span>
    <ul class="c-result c-draw-card__ball-list">
        <li class="c-ball c-ball--sm">9</li>
        <li class="c-ball c-ball--sm">9</li>
        <li class="c-ball c-ball--sm">9</li>
    </ul>
</tr>
"""


def test_parse_date_valid() -> None:
    parsed = parse_lotteryusa_date("May 16, 2026")
    assert parsed == datetime(2026, 5, 16, tzinfo=timezone.utc)


def test_parse_date_invalid_returns_none() -> None:
    assert parse_lotteryusa_date("not a date") is None


def test_parse_pick3_evening_with_fireball() -> None:
    result = parse_lotteryusa_html(PICK3_EVENING_HTML, PICK_3_GAME_ID, "EVENING")
    assert result is not None
    assert result.gameId == PICK_3_GAME_ID
    assert result.gameName == "Pick 3"
    assert result.number == "223"
    assert result.fireball == "8"
    assert result.drawType == "EVENING"
    assert result.id == "104-2026-05-16-EVENING"
    assert result.drawDate.startswith("2026-05-16T")


def test_parse_pick3_without_fireball() -> None:
    result = parse_lotteryusa_html(PICK3_NO_FIREBALL_HTML, PICK_3_GAME_ID, "MIDDAY")
    assert result is not None
    assert result.number == "159"
    assert result.fireball is None
    assert result.drawType == "MIDDAY"


def test_parse_pick4_with_fireball() -> None:
    result = parse_lotteryusa_html(PICK4_HTML, PICK_4_GAME_ID, "EVENING")
    assert result is not None
    assert result.gameId == PICK_4_GAME_ID
    assert result.gameName == "Pick 4"
    assert result.number == "5066"
    assert result.fireball == "8"


def test_parse_multiple_draws_returns_first() -> None:
    result = parse_lotteryusa_html(MULTIPLE_DRAWS_HTML, PICK_3_GAME_ID, "EVENING")
    assert result is not None
    assert result.number == "123"
    assert result.fireball == "4"
    assert result.id == "104-2026-05-16-EVENING"


def test_parse_empty_html_returns_none() -> None:
    assert parse_lotteryusa_html("", PICK_3_GAME_ID, "EVENING") is None


def test_parse_html_without_card_returns_none() -> None:
    assert parse_lotteryusa_html("<html><body>no draws</body></html>", PICK_3_GAME_ID, "EVENING") is None


def test_parse_html_unsupported_game_returns_none() -> None:
    assert parse_lotteryusa_html(PICK3_EVENING_HTML, 999, "EVENING") is None


def test_parse_html_too_few_digits_returns_none() -> None:
    html = """
    <tr class="c-draw-card">
        <span class="c-draw-card__draw-date-sub">May 16, 2026</span>
        <ul class="c-result c-draw-card__ball-list">
            <li class="c-ball c-ball--sm">1</li>
            <li class="c-ball c-ball--sm">2</li>
        </ul>
    </tr>
    """
    assert parse_lotteryusa_html(html, PICK_3_GAME_ID, "EVENING") is None


@pytest.mark.parametrize(
    "hour,minute,expected",
    [
        (13, 30, True),
        (14, 0, True),
        (13, 25, True),
        (14, 30, True),
        (14, 31, False),
        (13, 24, False),
        (12, 0, False),
        (21, 40, True),
        (21, 45, True),
        (22, 45, True),
        (22, 46, False),
        (3, 0, False),
        (0, 0, False),
    ],
)
def test_hot_window_boundaries(hour: int, minute: int, expected: bool) -> None:
    now_et = datetime(2026, 5, 16, hour, minute, tzinfo=ET)
    assert in_lotteryusa_hot_window(now_et.astimezone(timezone.utc)) is expected


def test_poll_interval_during_hot_window() -> None:
    now_et = datetime(2026, 5, 16, 13, 30, tzinfo=ET)
    assert current_poll_interval_seconds(now_et.astimezone(timezone.utc)) == 30


def test_poll_interval_outside_hot_window() -> None:
    now_et = datetime(2026, 5, 16, 12, 0, tzinfo=ET)
    assert current_poll_interval_seconds(now_et.astimezone(timezone.utc)) == 60


def test_hot_window_handles_naive_datetime_as_utc() -> None:
    midday_in_et = datetime(2026, 5, 16, 13, 30, tzinfo=ET)
    midday_in_utc = midday_in_et.astimezone(timezone.utc).replace(tzinfo=None)
    assert in_lotteryusa_hot_window(midday_in_utc) is True
