from __future__ import annotations

import json
import math
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_FORBIDDEN_SETTING_FRAGMENTS = ("password", "secret", "token", "credential", "apikey", "authorization")


def _validate_public_json(value: dict[str, Any], max_bytes: int) -> dict[str, Any]:
    try:
        encoded = json.dumps(value, allow_nan=False, separators=(",", ":"))
    except (TypeError, ValueError) as exc:
        raise ValueError("value must contain finite JSON values") from exc
    if len(encoded.encode("utf-8")) > max_bytes:
        raise ValueError(f"value exceeds the {max_bytes} byte limit")

    def check(item: Any) -> None:
        if isinstance(item, dict):
            for key, child in item.items():
                normalized_key = re.sub(r"[^a-z0-9]", "", key.lower())
                if any(fragment in normalized_key for fragment in _FORBIDDEN_SETTING_FRAGMENTS):
                    raise ValueError("credentials must be configured through server environment variables")
                check(child)
        elif isinstance(item, list):
            for child in item:
                check(child)

    check(value)
    return value


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class LayoutCreate(ApiModel):
    name: str = Field(min_length=1, max_length=100)
    schema_version: Literal[1] = Field(default=1, alias="schemaVersion")
    state: dict[str, Any]

    @field_validator("state")
    @classmethod
    def safe_state(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _validate_public_json(value, 1_000_000)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must contain a non-whitespace character")
        return value


class LayoutUpdate(LayoutCreate):
    pass


class FeatureCollection(ApiModel):
    type: Literal["FeatureCollection"]
    features: list[dict[str, Any]] = Field(max_length=5000)

    @model_validator(mode="after")
    def validate_geojson(self) -> FeatureCollection:
        encoded = json.dumps(self.model_dump(), allow_nan=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > 5_000_000:
            raise ValueError("FeatureCollection exceeds the 5 MB limit")
        for feature in self.features:
            if feature.get("type") != "Feature":
                raise ValueError("every feature must have type 'Feature'")
            geometry = feature.get("geometry")
            if geometry is None:
                continue
            if not isinstance(geometry, dict) or geometry.get("type") not in {
                "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"
            }:
                raise ValueError("unsupported GeoJSON geometry type")
            _validate_coordinates(geometry.get("coordinates"))
            properties = feature.get("properties")
            if properties is not None and not isinstance(properties, dict):
                raise ValueError("feature properties must be an object or null")
        return self


def _validate_coordinates(value: Any) -> None:
    if not isinstance(value, (list, tuple)) or not value:
        raise ValueError("geometry coordinates must be non-empty arrays")
    if len(value) >= 2 and all(isinstance(part, (int, float)) and not isinstance(part, bool) for part in value[:2]):
        lon, lat = value[:2]
        if not math.isfinite(lon) or not math.isfinite(lat) or not -180 <= lon <= 180 or not -90 <= lat <= 90:
            raise ValueError("coordinates must be finite WGS84 longitude/latitude")
        return
    for item in value:
        _validate_coordinates(item)


class DrawingUpdate(ApiModel):
    collection: FeatureCollection


class SettingsUpdate(ApiModel):
    settings: dict[str, Any]

    @field_validator("settings")
    @classmethod
    def safe_settings(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _validate_public_json(value, 100_000)


class ProviderEnvelope(ApiModel):
    source: str
    kind: Literal["observation", "forecast", "model", "composite", "reference", "user"]
    fetched_at: str = Field(alias="fetchedAt")
    data_time: str | None = Field(default=None, alias="dataTime")
    valid_from: str | None = Field(default=None, alias="validFrom")
    valid_to: str | None = Field(default=None, alias="validTo")
    expires_at: str = Field(alias="expiresAt")
    status: Literal["current", "stale", "partial", "unavailable"]
    attribution: str
    documentation_url: str = Field(alias="documentationUrl")
    coverage: dict[str, Any] | None = None
    units: dict[str, str] = Field(default_factory=dict)
    stale_reason: str | None = Field(default=None, alias="staleReason")
    data: Any


class ErrorBody(ApiModel):
    code: str
    message: str
