from __future__ import annotations

import socket
import struct
import time
from dataclasses import replace
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app import db
from app import main as main_module
from app.main import app
from app.wsjtx import HeardStations, decode_message

MAGIC = 0xADBCCBDA
SCHEMA = 3


def byte_array(value: str) -> bytes:
    payload = value.encode("utf-8")
    return struct.pack("!I", len(payload)) + payload


def header(message_type: int, client_id: str = "WSJT-X-test") -> bytes:
    return struct.pack("!III", MAGIC, SCHEMA, message_type) + byte_array(client_id)


def decode_packet(
    message: str,
    *,
    client_id: str = "WSJT-X-test",
    mode: str = "FT8",
    new: bool = True,
    low_confidence: bool = False,
    off_air: bool = False,
    snr: int = -12,
    delta_frequency: int = 1450,
    time_ms: int = 43_210_000,
) -> bytes:
    return (
        header(2, client_id)
        + struct.pack("!?IidI", new, time_ms, snr, 0.2, delta_frequency)
        + byte_array(mode)
        + byte_array(message)
        + struct.pack("!? ?", low_confidence, off_air)
    )


def status_packet(*, client_id: str = "WSJT-X-test", callsign: str = "N0CALL") -> bytes:
    return (
        header(1, client_id)
        + struct.pack("!Q", 14_074_000)
        + byte_array("FT8")
        + byte_array("")
        + byte_array("")
        + byte_array("FT8")
        + struct.pack("!? ? ?ii", True, False, True, 0, 0)
        + byte_array(callsign)
        + byte_array("CN85")
        + byte_array("")
        + struct.pack("!?", False)
        + byte_array("")
        + struct.pack("!?B", False, 0)
    )


def clear_packet(client_id: str = "WSJT-X-test") -> bytes:
    return header(3, client_id)


def test_decodes_wsjt_x_udp_decode_message():
    decoded = decode_message(decode_packet("CQ K1ABC FN42"))
    assert decoded is not None
    assert decoded.client_id == "WSJT-X-test"
    assert decoded.message == "CQ K1ABC FN42"
    assert decoded.mode == "FT8"
    assert decoded.snr_db == -12
    assert decoded.delta_frequency_hz == 1450
    assert decoded.new is True
    assert decoded.low_confidence is False
    assert decoded.off_air is False


def test_projects_recent_heard_callsigns_to_reported_locator_centers():
    now = datetime(2026, 10, 10, 20, 0, tzinfo=UTC)
    heard = HeardStations(retention_seconds=1800)
    heard.ingest(status_packet(), received_at=now)
    heard.ingest(decode_packet("CQ K1ABC FN42"), received_at=now)
    heard.ingest(decode_packet("K1ABC N0CALL -10", snr=-10), received_at=now + timedelta(seconds=15))

    feed = heard.snapshot(station_call="N0CALL", now=now + timedelta(seconds=20))
    features = feed["data"]["features"]
    assert len(features) == 1
    feature = features[0]
    assert feature["geometry"]["coordinates"] == [-71.0, 42.5]
    assert feature["properties"]["callsign"] == "K1ABC"
    assert feature["properties"]["locator"] == "FN42"
    assert feature["properties"]["mode"] == "FT8"
    assert feature["properties"]["snrDb"] == -10
    assert feature["properties"]["frequencyHz"] == 14_075_450
    assert feature["properties"]["decodeCount"] == 2
    assert feed["data"]["unlocatedStations"] == 0


def test_ignores_replays_off_air_and_low_confidence_decodes():
    heard = HeardStations()
    heard.ingest(decode_packet("CQ K1ABC FN42", new=False))
    heard.ingest(decode_packet("CQ K2ABC FN31", off_air=True))
    heard.ingest(decode_packet("CQ K3ABC FN20", low_confidence=True))
    feed = heard.snapshot()
    assert feed["data"]["features"] == []
    assert feed["data"]["heardStations"] == 0
    assert feed["status"] == "waiting"


def test_does_not_interpret_rr73_as_a_grid_locator():
    heard = HeardStations()
    heard.ingest(decode_packet("CQ K1ABC RR73"))
    feed = heard.snapshot()
    assert feed["data"]["features"] == []
    assert feed["data"]["heardStations"] == 1
    assert feed["data"]["unlocatedStations"] == 1


def test_does_not_mistake_a_locator_for_the_second_callsign_in_an_exchange():
    heard = HeardStations()
    heard.ingest(status_packet(callsign="N0CALL"))
    heard.ingest(decode_packet("K1ABC N0CALL FN42"))
    feed = heard.snapshot()
    assert [feature["properties"]["callsign"] for feature in feed["data"]["features"]] == ["K1ABC"]
    assert feed["data"]["features"][0]["properties"]["locator"] == "FN42"


def test_does_not_show_the_receiving_station_when_it_decodes_its_own_cq():
    heard = HeardStations()
    heard.ingest(status_packet(callsign="N0CALL"))
    heard.ingest(decode_packet("CQ N0CALL CN85"))
    assert heard.snapshot()["data"]["heardStations"] == 0


def test_clearing_wsjt_x_band_activity_removes_only_that_client():
    heard = HeardStations()
    heard.ingest(decode_packet("CQ K1ABC FN42", client_id="rig-one"))
    heard.ingest(decode_packet("CQ K2ABC FN31", client_id="rig-two"))
    heard.ingest(clear_packet("rig-one"))
    feed = heard.snapshot()
    assert [feature["properties"]["callsign"] for feature in feed["data"]["features"]] == ["K2ABC"]


def test_expired_decodes_are_removed_from_memory_snapshot():
    now = datetime(2026, 10, 10, 20, 0, tzinfo=UTC)
    heard = HeardStations(retention_seconds=1800)
    heard.ingest(decode_packet("CQ K1ABC FN42"), received_at=now)
    feed = heard.snapshot(now=now + timedelta(minutes=31))
    assert feed["data"]["heardStations"] == 0
    assert feed["status"] == "waiting"


def test_malformed_and_unsupported_datagrams_are_ignored():
    assert decode_message(b"short") is None
    assert decode_message(struct.pack("!III", MAGIC, 99, 2)) is None
    assert decode_message(decode_packet("CQ K1ABC FN42")[:-2]) is None


def test_udp_listener_exposes_recent_local_decodes_as_geojson(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "settings", replace(db.settings, database_path=tmp_path / "wsjtx-api.sqlite3"))
    monkeypatch.setattr(main_module, "settings", replace(main_module.settings, wsjtx_udp_host="127.0.0.1", wsjtx_udp_port=0))
    with TestClient(app) as client:
        host, port = client.app.state.wsjtx_udp_address
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender:
            sender.sendto(status_packet(), (host, port))
            sender.sendto(decode_packet("CQ K1ABC FN42"), (host, port))
        response = None
        for _ in range(50):
            response = client.get("/api/v1/wsjtx/heard?station_call=N0CALL")
            if response.json().get("data", {}).get("features"):
                break
            time.sleep(.01)
        assert response.status_code == 200
        result = response.json()
        assert result["data"]["features"][0]["properties"]["callsign"] == "K1ABC"
        assert result["data"]["features"][0]["properties"]["frequencyHz"] == 14_075_450
