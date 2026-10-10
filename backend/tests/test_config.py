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
