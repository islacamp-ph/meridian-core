"""HTTP client for the MERIDIAN REST API."""

from __future__ import annotations

from typing import Any

import httpx

from meridian.types import (
    AnalyzeRequest,
    AnalyzeResponse,
    BatchAnalyzeRequest,
    BatchAnalyzeResponse,
)


class MeridianClientError(Exception):
    """Raised when the MERIDIAN API returns an error response."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        code: str | None = None,
        hint: str | None = None,
        layer: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.hint = hint
        self.layer = layer


class MeridianClient:
    """Client for the MERIDIAN REST API."""

    def __init__(
        self,
        base_url: str,
        *,
        api_key: str | None = None,
        timeout: float = 60.0,
        client: httpx.Client | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._client = client or httpx.Client(timeout=timeout)
        self._owns_client = client is None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> MeridianClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def health(self) -> dict[str, Any]:
        return self._get("/v1/health")

    def version(self) -> dict[str, Any]:
        return self._get("/v1/version")

    def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
        return self._post("/v1/analyze", request)

    def analyze_batch(self, request: BatchAnalyzeRequest) -> BatchAnalyzeResponse:
        return self._post("/v1/analyze/batch", request)

    def trace(self, tx: str, network: str) -> dict[str, Any]:
        return self._post("/v1/trace", {"tx": tx, "network": network})

    def field(
        self,
        tx: str,
        network: str,
        *,
        ecosystem: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"tx": tx, "network": network}
        if ecosystem is not None:
            body["ecosystem"] = ecosystem
        return self._post("/v1/field", body)

    def gravity(
        self,
        tx: str,
        network: str,
        *,
        ecosystem: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"tx": tx, "network": network}
        if ecosystem is not None:
            body["ecosystem"] = ecosystem
        return self._post("/v1/gravity", body)

    def _headers(self) -> dict[str, str]:
        if not self._api_key:
            return {}
        return {"Authorization": f"Bearer {self._api_key}"}

    def _get(self, path: str) -> dict[str, Any]:
        response = self._client.get(
            f"{self._base_url}{path}",
            headers=self._headers(),
        )
        return self._parse(response)

    def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        response = self._client.post(
            f"{self._base_url}{path}",
            json=body,
            headers=self._headers(),
        )
        return self._parse(response)

    def _parse(self, response: httpx.Response) -> dict[str, Any]:
        try:
            data = response.json()
        except ValueError as exc:
            raise MeridianClientError(
                f"Invalid JSON response ({response.status_code})",
                status_code=response.status_code,
            ) from exc

        if response.is_error:
            raise MeridianClientError(
                data.get("error", f"Request failed with status {response.status_code}"),
                status_code=response.status_code,
                code=data.get("code"),
                hint=data.get("hint"),
                layer=data.get("layer"),
            )

        return data
