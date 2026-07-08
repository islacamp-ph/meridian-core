import pytest
import httpx

from meridian import MeridianClient, MeridianClientError


def test_analyze_success(httpx_mock):
    httpx_mock.add_response(
        json={"verdict": "CLEAR", "confidence": 0.95},
    )
    client = MeridianClient("https://api.example.com")
    result = client.analyze({"tx": "AAAA", "network": "testnet"})
    assert result["verdict"] == "CLEAR"
    request = httpx_mock.get_request()
    assert request.url.path == "/v1/analyze"


def test_analyze_error(httpx_mock):
    httpx_mock.add_response(
        status_code=400,
        json={
            "error": "Invalid transaction XDR",
            "code": "INVALID_XDR",
            "hint": "Provide base64-encoded XDR",
            "layer": "TRACE",
        },
    )
    client = MeridianClient("https://api.example.com")
    with pytest.raises(MeridianClientError) as exc:
        client.trace("bad", "testnet")
    assert exc.value.status_code == 400
    assert exc.value.code == "INVALID_XDR"


def test_api_key_header(httpx_mock):
    httpx_mock.add_response(json={"status": "ok"})
    client = MeridianClient("https://api.example.com", api_key="secret")
    client.health()
    request = httpx_mock.get_request()
    assert request.headers["authorization"] == "Bearer secret"
