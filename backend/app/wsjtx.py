from __future__ import annotations

import asyncio
import re
import struct
from collections import OrderedDict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from typing import Final

from . import adif

MAGIC: Final = 0xADBCCBDA
MIN_SCHEMA: Final = 2
MAX_SCHEMA: Final = 3
MAX_DATAGRAM_BYTES: Final = 65_507
MAX_CLIENT_ID_BYTES: Final = 1_024
MAX_TEXT_BYTES: Final = 4_096
MAX_DECODES: Final = 2_000
MAX_STATIONS: Final = 500
MAX_CLIENTS: Final = 16
DEFAULT_RETENTION_SECONDS: Final = 1_800
DOCUMENTATION_URL: Final = "https://wsjt.sourceforge.io/wsjtx-main_en.html"
_CALL = re.compile(r"(?:[A-Z0-9]{1,4}/)?[A-Z0-9]{1,4}\d[A-Z0-9]{0,6}(?:/[A-Z0-9]{1,4})?\Z")
_RESERVED_LOCATORS = {"RR73"}


@dataclass(frozen=True)
class DecodeMessage:
    client_id: str
    new: bool
    time_ms: int
    snr_db: int
    delta_time_seconds: float
    delta_frequency_hz: int
    mode: str
    message: str
    low_confidence: bool
    off_air: bool


@dataclass(frozen=True)
class StatusMessage:
    client_id: str
    frequency_hz: int
    mode: str
    callsign: str
    grid: str


@dataclass(frozen=True)
class ClearMessage:
    client_id: str


Message = DecodeMessage | StatusMessage | ClearMessage


class _Reader:
    def __init__(self, packet: bytes, offset: int = 0) -> None:
        self.packet = packet
        self.offset = offset

    def _take(self, size: int) -> bytes:
        if size < 0 or self.offset + size > len(self.packet):
            raise ValueError("truncated WSJT-X datagram")
        value = self.packet[self.offset:self.offset + size]
        self.offset += size
        return value

    def uint8(self) -> int:
        return self._take(1)[0]

    def boolean(self) -> bool:
        value = self.uint8()
        if value not in (0, 1):
            raise ValueError("invalid WSJT-X boolean")
        return bool(value)

    def uint32(self) -> int:
        return struct.unpack("!I", self._take(4))[0]

    def int32(self) -> int:
        return struct.unpack("!i", self._take(4))[0]

    def uint64(self) -> int:
        return struct.unpack("!Q", self._take(8))[0]

    def double(self) -> float:
        return struct.unpack("!d", self._take(8))[0]

    def text(self, maximum: int = MAX_TEXT_BYTES) -> str:
        length = self.uint32()
        if length == 0xFFFFFFFF:
            return ""
        if length > maximum:
            raise ValueError("oversized WSJT-X text field")
        return self._take(length).decode("utf-8")


def decode_message(packet: bytes) -> Message | None:
    """Decode the documented WSJT-X UDP message subset (schemas 2 and 3)."""
    if not isinstance(packet, bytes) or len(packet) < 16 or len(packet) > MAX_DATAGRAM_BYTES:
        return None
    try:
        magic, schema, message_type = struct.unpack_from("!III", packet)
        if magic != MAGIC or not MIN_SCHEMA <= schema <= MAX_SCHEMA:
            return None
        reader = _Reader(packet, 12)
        client_id = reader.text(MAX_CLIENT_ID_BYTES).strip()
        if not client_id:
            return None
        if message_type == 1:
            frequency_hz = reader.uint64()
            mode = reader.text()
            reader.text()  # DX call
            reader.text()  # report
            reader.text()  # transmit mode
            reader.boolean()  # transmit enabled
            reader.boolean()  # transmitting
            reader.boolean()  # decoding
            reader.int32()  # receive audio offset
            reader.int32()  # transmit audio offset
            callsign = reader.text().strip().upper()
            grid = reader.text().strip().upper()
            return StatusMessage(client_id, frequency_hz, mode, callsign, grid)
        if message_type == 2:
            new = reader.boolean()
            time_ms = reader.uint32()
            snr_db = reader.int32()
            delta_time = reader.double()
            delta_frequency = reader.uint32()
            mode = reader.text().strip().upper()
            message = reader.text().strip()
            low_confidence = reader.boolean()
            off_air = reader.boolean()
            if time_ms >= 86_400_000 or not mode or not message:
                return None
            return DecodeMessage(
                client_id, new, time_ms, snr_db, delta_time, delta_frequency,
                mode, message, low_confidence, off_air,
            )
        if message_type == 3:
            return ClearMessage(client_id)
    except (IndexError, UnicodeDecodeError, ValueError, struct.error):
        return None
    return None


def _callsigns(message: str) -> list[str]:
    result: list[str] = []
    for token in re.findall(r"[A-Z0-9/]+", message.upper()):
        if len(token) >= 3 and token not in _RESERVED_LOCATORS and not adif.parse_locator(token) and _CALL.fullmatch(token) and token not in result:
            result.append(token)
    return result


def is_callsign(value: str) -> bool:
    return 3 <= len(value) <= 16 and bool(_CALL.fullmatch(value.upper()))


def _locator(message: str) -> str | None:
    for token in re.findall(r"[A-Z0-9]+", message.upper()):
        if token not in _RESERVED_LOCATORS and adif.parse_locator(token):
            return token
    return None


def _heard_callsign(message: str, station_call: str | None) -> str | None:
    callsigns = _callsigns(message)
    if not callsigns:
        return None
    tokens = re.findall(r"[A-Z0-9/]+", message.upper())
    own = station_call.strip().upper() if station_call else ""
    if tokens and tokens[0] in {"CQ", "QRZ", "DE"}:
        return None if callsigns[0] == own else callsigns[0]
    other = [call for call in callsigns if call != own]
    if len(other) == 1:
        return other[0]
    if other:
        return other[-1]
    return None


def _utc_decode_time(time_ms: int, received_at: datetime) -> datetime:
    received = received_at.astimezone(UTC)
    decoded = datetime.combine(received.date(), time(), tzinfo=UTC) + timedelta(milliseconds=time_ms)
    if decoded - received > timedelta(hours=12):
        decoded -= timedelta(days=1)
    elif received - decoded > timedelta(hours=12):
        decoded += timedelta(days=1)
    return decoded


class HeardStations:
    """Bounded, process-local rolling view of recent WSJT-X decode messages."""

    def __init__(self, retention_seconds: int = DEFAULT_RETENTION_SECONDS) -> None:
        self.retention_seconds = max(60, retention_seconds)
        self._decodes: deque[tuple[DecodeMessage, datetime]] = deque(maxlen=MAX_DECODES)
        self._clients: dict[str, StatusMessage] = {}
        self.last_packet_at: datetime | None = None

    def ingest(self, packet: bytes, received_at: datetime | None = None) -> None:
        message = decode_message(packet)
        if message is None:
            return
        received = (received_at or datetime.now(UTC)).astimezone(UTC)
        self.last_packet_at = received
        if isinstance(message, StatusMessage):
            self._clients.pop(message.client_id, None)
            self._clients[message.client_id] = message
            while len(self._clients) > MAX_CLIENTS:
                self._clients.pop(next(iter(self._clients)))
        elif isinstance(message, ClearMessage):
            self._clients.pop(message.client_id, None)
            self._decodes = deque(
                ((decode, when) for decode, when in self._decodes if decode.client_id != message.client_id),
                maxlen=MAX_DECODES,
            )
        elif message.new and not message.low_confidence and not message.off_air:
            self._decodes.append((message, received))

    def snapshot(
        self,
        station_call: str | None = None,
        now: datetime | None = None,
        listener_error: bool = False,
        udp_port: int = 2237,
    ) -> dict:
        current = (now or datetime.now(UTC)).astimezone(UTC)
        cutoff = current - timedelta(seconds=self.retention_seconds)
        while self._decodes and self._decodes[0][1] < cutoff:
            self._decodes.popleft()

        heard: OrderedDict[str, dict] = OrderedDict()
        fallback_call = station_call.strip().upper() if station_call else ""
        for decoded, received in self._decodes:
            status = self._clients.get(decoded.client_id)
            own_call = status.callsign if status and status.callsign else fallback_call
            callsign = _heard_callsign(decoded.message, own_call)
            if not callsign:
                continue
            locator = _locator(decoded.message)
            station = heard.get(callsign, {})
            if locator:
                station["locator"] = locator
                station["coordinates"] = adif.parse_locator(locator)
            frequency = status.frequency_hz + decoded.delta_frequency_hz if status and status.frequency_hz else None
            station.update({
                "callsign": callsign,
                "mode": decoded.mode,
                "snrDb": decoded.snr_db,
                "frequencyHz": frequency,
                "audioOffsetHz": decoded.delta_frequency_hz,
                "message": decoded.message,
                "observedAt": _utc_decode_time(decoded.time_ms, received).isoformat(timespec="seconds").replace("+00:00", "Z"),
                "receivedAt": received.isoformat(timespec="seconds").replace("+00:00", "Z"),
                "decodeCount": station.get("decodeCount", 0) + 1,
            })
            heard.pop(callsign, None)
            heard[callsign] = station

        while len(heard) > MAX_STATIONS:
            heard.popitem(last=False)
        features = []
        unlocated = 0
        latest: str | None = None
        for station in heard.values():
            coordinates = station.get("coordinates")
            latest = max(latest, station["observedAt"]) if latest else station["observedAt"]
            if not coordinates:
                unlocated += 1
                continue
            features.append({
                "type": "Feature",
                "id": f"wsjtx:{station['callsign']}",
                "geometry": {"type": "Point", "coordinates": list(coordinates)},
                "properties": {**station, "precision": "reported Maidenhead locator center"},
            })
        status = "unavailable" if listener_error else "current" if heard else "waiting"
        return {
            "source": "wsjtx-local-udp",
            "kind": "observation",
            "fetchedAt": current.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "dataTime": latest,
            "validFrom": None,
            "validTo": None,
            "expiresAt": (current + timedelta(seconds=5)).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "status": status,
            "attribution": "WSJT-X · operator's local decoded messages",
            "documentationUrl": DOCUMENTATION_URL,
            "coverage": "Local receiver only",
            "udpPort": udp_port,
            "units": {"frequency": "Hz", "snr": "dB"},
            "staleReason": None,
            "error": "The local WSJT-X UDP listener could not bind its port." if listener_error else None,
            "data": {
                "type": "FeatureCollection",
                "features": features,
                "heardStations": len(heard),
                "locatedStations": len(features),
                "unlocatedStations": unlocated,
                "lastPacketAt": self.last_packet_at.isoformat(timespec="seconds").replace("+00:00", "Z") if self.last_packet_at else None,
                "retentionSeconds": self.retention_seconds,
            },
        }


class WSJTXProtocol(asyncio.DatagramProtocol):
    def __init__(self, heard: HeardStations) -> None:
        self.heard = heard

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        self.heard.ingest(data)
