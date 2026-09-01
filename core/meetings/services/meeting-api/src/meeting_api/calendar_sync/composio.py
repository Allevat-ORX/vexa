"""Pure Google Calendar/Composio event normalization.

The Composio API returns Google Calendar JSON while the existing calendar-sync service consumes
one small, source-neutral event shape. This module deliberately performs no I/O so its timezone,
recurrence identity, cancellation, and meeting-link behavior can be tested offline.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Iterable, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..collector.meeting_link import find_meeting_link

DEFAULT_HORIZON_DAYS = 14
DEFAULT_LOOKBACK_S = 900
_MAX_ATTENDEES = 100
_MAX_TEXT = 512


def _aware_now(now: datetime) -> datetime:
    return now if now.tzinfo is not None else now.replace(tzinfo=timezone.utc)


def _zone(name: Optional[str]) -> timezone | ZoneInfo:
    if not name:
        return timezone.utc
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return timezone.utc


def _start_value(start: Any, calendar_timezone: Optional[str]) -> Optional[datetime]:
    """Convert a Google ``start`` object to an aware UTC datetime."""
    if not isinstance(start, dict):
        return None
    tz = _zone(start.get("timeZone") or calendar_timezone)
    date_time = start.get("dateTime")
    if isinstance(date_time, str) and date_time.strip():
        raw = date_time.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            value = datetime.fromisoformat(raw)
        except ValueError:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=tz)
        return value.astimezone(timezone.utc)

    all_day = start.get("date")
    if isinstance(all_day, str) and all_day.strip():
        try:
            value = date.fromisoformat(all_day.strip())
        except ValueError:
            return None
        return datetime.combine(value, time(0, 0), tzinfo=tz).astimezone(timezone.utc)
    return None


def _event_uid(calendar_id: str, item: dict[str, Any], start: Optional[datetime] = None) -> Optional[str]:
    event_id = item.get("id")
    if not isinstance(event_id, str) or not event_id.strip():
        return None
    series_id = item.get("recurringEventId")
    original = _start_value(item.get("originalStartTime"), item.get("timeZone"))
    if isinstance(series_id, str) and series_id.strip() and original is not None:
        identity = f"{series_id.strip()}:{original.isoformat()}"
    else:
        identity = event_id.strip()
    return f"composio:{calendar_id}:{identity}"


def _attendees(item: dict[str, Any]) -> list[dict[str, str]]:
    raw = item.get("attendees")
    if not isinstance(raw, list):
        return []
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    for attendee in raw[:_MAX_ATTENDEES]:
        if not isinstance(attendee, dict):
            continue
        email = attendee.get("email")
        if not isinstance(email, str):
            continue
        email = email.strip().lower()
        if "@" not in email or email in seen:
            continue
        seen.add(email)
        entry: dict[str, str] = {"email": email}
        name = attendee.get("displayName")
        if isinstance(name, str) and name.strip() and name.strip().lower() != email:
            entry["name"] = name.strip()[:_MAX_TEXT]
        status = attendee.get("responseStatus")
        if isinstance(status, str) and status.strip():
            entry["partstat"] = status.strip().lower()[:32]
        result.append(entry)
    return result


def _meeting_link(item: dict[str, Any]) -> Optional[tuple[str, str, str]]:
    candidates: list[str] = []
    hangout = item.get("hangoutLink")
    if isinstance(hangout, str):
        candidates.append(hangout)

    conference = item.get("conferenceData")
    if isinstance(conference, dict):
        entry_points = conference.get("entryPoints")
        if isinstance(entry_points, list):
            for entry in entry_points:
                if not isinstance(entry, dict) or entry.get("entryPointType") not in (None, "video"):
                    continue
                uri = entry.get("uri")
                if isinstance(uri, str):
                    candidates.append(uri)

    for key in ("location", "description"):
        value = item.get(key)
        if isinstance(value, str):
            candidates.append(value)

    for value in candidates:
        link = find_meeting_link(value)
        if link:
            return link
    return None


def normalize_events(
    calendar_id: str,
    events: Iterable[dict[str, Any]],
    *,
    now: datetime,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
    lookback_s: float = DEFAULT_LOOKBACK_S,
    calendar_timezone: str = "America/Mexico_City",
) -> dict[str, list[dict[str, Any]] | list[str]]:
    """Map Google Calendar event JSON into the existing ``sync_user`` input shape.

    The caller must request ``singleEvents=true`` from Google Calendar. Therefore each recurring
    instance has its own ``originalStartTime`` and receives a stable series/occurrence UID.
    Malformed non-cancelled events are ignored; malformed responses are handled by the network
    client, not this pure mapper.
    """
    moment = _aware_now(now)
    window_start = moment - timedelta(seconds=max(0.0, lookback_s))
    window_end = moment + timedelta(days=max(0, horizon_days))
    normalized: dict[str, dict[str, Any]] = {}
    cancelled: list[str] = []
    cancelled_seen: set[str] = set()

    for item in events:
        if not isinstance(item, dict):
            continue
        start = _start_value(item.get("start"), calendar_timezone)
        uid = _event_uid(calendar_id, item, start)
        if uid is None:
            continue

        if str(item.get("status", "")).lower() == "cancelled":
            if uid not in cancelled_seen:
                cancelled.append(uid)
                cancelled_seen.add(uid)
            normalized.pop(uid, None)
            continue
        if start is None or not window_start <= start <= window_end:
            continue

        link = _meeting_link(item)
        platform, native_id, meeting_url = link if link else (None, None, None)
        summary = item.get("summary")
        title = summary.strip()[:_MAX_TEXT] if isinstance(summary, str) and summary.strip() else None
        normalized[uid] = {
            "uid": uid,
            "title": title,
            "scheduled_at": start.isoformat(),
            "platform": platform,
            "native_meeting_id": native_id,
            "meeting_url": meeting_url,
            "attendees": _attendees(item),
        }

    return {"events": list(normalized.values()), "cancelled_uids": cancelled}
