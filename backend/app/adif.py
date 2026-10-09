from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

_FIELD = re.compile(r"^([A-Za-z0-9_]+):(\d+)(?::[A-Za-z])?$")


def parse_locator(value: str | None) -> tuple[float, float] | None:
    """Return the center of a 4, 6, or 8 character Maidenhead locator."""
    if not value:
        return None
    grid = value.strip().upper()
    if len(grid) not in (4, 6, 8):
        return None
    if not ("A" <= grid[0] <= "R" and "A" <= grid[1] <= "R"):
        return None
    if not (grid[2:4].isdigit()):
        return None
    lon = -180.0 + (ord(grid[0]) - ord("A")) * 20.0
    lat = -90.0 + (ord(grid[1]) - ord("A")) * 10.0
    lon_size, lat_size = 20.0, 10.0
    lon += int(grid[2]) * 2.0
    lat += int(grid[3])
    lon_size, lat_size = 2.0, 1.0
    if len(grid) >= 6:
        if not ("A" <= grid[4] <= "X" and "A" <= grid[5] <= "X"):
            return None
        lon_size /= 24.0
        lat_size /= 24.0
        lon += (ord(grid[4]) - ord("A")) * lon_size
        lat += (ord(grid[5]) - ord("A")) * lat_size
    if len(grid) == 8:
        if not grid[6:8].isdigit():
            return None
        lon_size /= 10.0
        lat_size /= 10.0
        lon += int(grid[6]) * lon_size
        lat += int(grid[7]) * lat_size
    return lon + lon_size / 2.0, lat + lat_size / 2.0


def _parse_record_fields(text: str) -> tuple[list[dict[str, str]], str | None]:
    records: list[dict[str, str]] = []
    current: dict[str, str] = {}
    header_call: str | None = None
    in_header = "<EOH>" in text.upper()
    index = 0
    while index < len(text):
        start = text.find("<", index)
        if start < 0:
            break
        close = text.find(">", start + 1)
        if close < 0:
            break
        token = text[start + 1:close].strip()
        upper = token.upper()
        index = close + 1
        if upper == "EOH":
            in_header = False
            continue
        if upper == "EOR":
            if not in_header and current:
                records.append(current)
            current = {}
            continue
        match = _FIELD.match(token)
        if not match:
            continue
        key, raw_length = match.groups()
        length = int(raw_length)
        value = text[index:index + length].strip()
        index += length
        if in_header:
            if key.upper() == "STATION_CALLSIGN":
                header_call = value.upper()
        else:
            current[key.upper()] = value
    return records, header_call


def _qso_time(fields: dict[str, str]) -> str | None:
    date = fields.get("QSO_DATE")
    if not date or not re.fullmatch(r"\d{8}", date):
        return None
    time = fields.get("TIME_ON", "0000").strip()
    if not re.fullmatch(r"\d{4}(\d{2})?", time):
        return None
    time = time.ljust(6, "0")
    try:
        parsed = datetime.strptime(date + time, "%Y%m%d%H%M%S").replace(tzinfo=UTC)
    except ValueError:
        return None
    return parsed.isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_adif(text: str, header_call: str | None = None) -> list[dict[str, Any]]:
    fields_list, parsed_header_call = _parse_record_fields(text)
    station = header_call or parsed_header_call
    contacts: list[dict[str, Any]] = []
    for fields in fields_list:
        callsign = fields.get("CALL", "").strip().upper()
        contacted_at = _qso_time(fields)
        if not callsign or contacted_at is None:
            continue
        remote_grid = fields.get("GRIDSQUARE", "").strip().upper() or None
        local_grid = fields.get("MY_GRIDSQUARE", "").strip().upper() or None
        remote = parse_locator(remote_grid)
        local = parse_locator(local_grid)
        try:
            frequency = float(fields["FREQ"]) if fields.get("FREQ") else None
            if frequency is not None and (frequency <= 0 or frequency > 1000):
                frequency = None
        except ValueError:
            frequency = None
        contacts.append({
            "callsign": callsign,
            "contactedAt": contacted_at,
            "band": fields.get("BAND", "").strip().upper() or None,
            "mode": (fields.get("SUBMODE") or fields.get("MODE", "")).strip().upper() or None,
            "frequencyMhz": frequency,
            "remoteGrid": remote_grid,
            "remoteCoordinates": list(remote) if remote else None,
            "localGrid": local_grid,
            "localCoordinates": list(local) if local else None,
            "stationCallsign": (fields.get("STATION_CALLSIGN") or station or "").strip().upper() or None,
            "record": fields,
        })
    return contacts
