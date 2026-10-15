import pytest

from app.config import load_settings


def test_deployment_mode_defaults_to_private_and_accepts_public(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEO_DEPLOYMENT_MODE", raising=False)
    assert load_settings().deployment_mode == "private"
    monkeypatch.setenv("GEO_DEPLOYMENT_MODE", " Public ")
    assert load_settings().deployment_mode == "public"


def test_invalid_deployment_mode_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEO_DEPLOYMENT_MODE", "shared-ish")
    with pytest.raises(ValueError, match="GEO_DEPLOYMENT_MODE"):
        load_settings()


def test_redis_pubsub_url_is_optional_and_configurable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEO_REDIS_URL", raising=False)
    assert load_settings().redis_url is None
    monkeypatch.setenv("GEO_REDIS_URL", "redis://localhost:6379/3")
    assert load_settings().redis_url == "redis://localhost:6379/3"


def test_aircraft_defaults_private_enabled_public_disabled_and_explicit_opt_in(monkeypatch):
    monkeypatch.delenv("GEO_AIR_TRAFFIC_ENABLED", raising=False)
    monkeypatch.setenv("GEO_DEPLOYMENT_MODE", "private")
    assert load_settings().air_traffic_enabled is True
    monkeypatch.setenv("GEO_DEPLOYMENT_MODE", "public")
    assert load_settings().air_traffic_enabled is False
    monkeypatch.setenv("GEO_AIR_TRAFFIC_ENABLED", "")
    assert load_settings().air_traffic_enabled is False
    monkeypatch.setenv("GEO_AIR_TRAFFIC_ENABLED", "true")
    monkeypatch.setenv("GEO_AIR_TRAFFIC_RADIUS_NM", "999")
    assert load_settings().air_traffic_enabled is True
    assert load_settings().air_traffic_radius_nm == 250
