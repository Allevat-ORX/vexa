"""RED tests for the Composio Google Calendar event normalizer."""
from __future__ import annotations

from datetime import datetime, timezone

from meeting_api.calendar_sync.composio import normalize_events


NOW = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


def event(event_id="evt-1", *, summary="Equipo", start=None, status="confirmed", **extra):
    body = {
        "id": event_id,
        "status": status,
        "summary": summary,
        "start": start or {"dateTime": "2026-09-01T10:00:00-06:00", "timeZone": "America/Mexico_City"},
        "end": {"dateTime": "2026-09-01T11:00:00-06:00", "timeZone": "America/Mexico_City"},
    }
    body.update(extra)
    return body


def test_normalizes_rfc3339_and_hangout_link_to_existing_sync_shape():
    parsed = normalize_events(
        "primary",
        [event(hangoutLink="https://meet.google.com/abc-defg-hij")],
        now=NOW,
    )

    assert parsed["cancelled_uids"] == []
    assert parsed["events"] == [{
        "uid": "composio:primary:evt-1",
        "title": "Equipo",
        "scheduled_at": "2026-09-01T16:00:00+00:00",
        "platform": "google_meet",
        "native_meeting_id": "abc-defg-hij",
        "meeting_url": "https://meet.google.com/abc-defg-hij",
        "attendees": [],
    }]


def test_uses_conference_entry_point_before_other_text():
    parsed = normalize_events(
        "primary",
        [event(
            location="Room 4",
            description="Notes https://example.com/docs",
            conferenceData={"entryPoints": [
                {"entryPointType": "video", "uri": "https://us02web.zoom.us/j/1234567890"},
            ]},
        )],
        now=NOW,
    )
    (item,) = parsed["events"]
    assert item["platform"] == "zoom"
    assert item["native_meeting_id"] == "1234567890"
    assert item["meeting_url"] == "https://us02web.zoom.us/j/1234567890"


def test_imports_linkless_event_without_arming_a_bot():
    parsed = normalize_events("primary", [event(location="Office")], now=NOW)
    (item,) = parsed["events"]
    assert item["platform"] is None
    assert item["native_meeting_id"] is None
    assert item["meeting_url"] is None


def test_all_day_date_uses_calendar_timezone_then_normalizes_to_utc():
    parsed = normalize_events(
        "primary",
        [event(start={"date": "2026-09-02", "timeZone": "America/Mexico_City"})],
        now=NOW,
    )
    assert parsed["events"][0]["scheduled_at"] == "2026-09-02T06:00:00+00:00"


def test_recurring_instance_uid_is_stable_by_series_and_original_start():
    parsed = normalize_events(
        "primary",
        [event(
            event_id="series-1_20260902T160000Z",
            recurringEventId="series-1",
            originalStartTime={"dateTime": "2026-09-02T10:00:00-06:00"},
            hangoutLink="https://meet.google.com/abc-defg-hij",
        )],
        now=NOW,
    )
    assert parsed["events"][0]["uid"] == "composio:primary:series-1:2026-09-02T16:00:00+00:00"


def test_cancelled_event_is_returned_as_cancelled_uid():
    parsed = normalize_events("primary", [event("evt-cancel", status="cancelled")], now=NOW)
    assert parsed["events"] == []
    assert parsed["cancelled_uids"] == ["composio:primary:evt-cancel"]


def test_ignores_past_out_of_horizon_and_malformed_events():
    parsed = normalize_events(
        "primary",
        [
            event("past", start={"dateTime": "2026-08-01T10:00:00-06:00"}),
            event("far", start={"dateTime": "2026-10-01T10:00:00-06:00"}),
            {"id": "bad", "summary": "Malformed", "start": {}},
        ],
        now=NOW,
        horizon_days=14,
    )
    assert parsed == {"events": [], "cancelled_uids": []}
