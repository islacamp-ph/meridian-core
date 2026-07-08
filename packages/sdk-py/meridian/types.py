"""Shared type aliases for MERIDIAN API requests and responses."""

from __future__ import annotations

from typing import Any, Literal, TypedDict

Network = Literal["mainnet", "testnet"]
Verdict = Literal["CLEAR", "WARN", "ABORT"]


class AnalyzeOptions(TypedDict, total=False):
    skip_field: bool
    skip_gravity: bool
    confidence_threshold: float
    rpc_url: str
    auth_mode: Literal["enforce", "record", "record_allow_nonroot"]
    field_auth_mode: Literal["enforce", "record", "record_allow_nonroot"]
    deep_discovery: bool


class AnalyzeRequest(TypedDict):
    tx: str
    network: Network
    ecosystem: dict[str, Any]
    options: AnalyzeOptions


class BatchAnalyzeItemRequest(TypedDict, total=False):
    id: str
    tx: str
    network: Network
    ecosystem: dict[str, Any]
    options: AnalyzeOptions


class BatchAnalyzeRequest(TypedDict, total=False):
    items: list[BatchAnalyzeItemRequest]
    default_network: Network


class AnalyzeResponse(TypedDict, total=False):
    product: str
    version: str
    verdict: Verdict
    confidence: float
    trace: dict[str, Any]
    field: dict[str, Any]
    gravity: dict[str, Any]
    explainability: dict[str, Any]
    brief: str
    fix_sequence: list[dict[str, Any]]
    warnings: list[str]
    meta: dict[str, Any]


class BatchAnalyzeResponse(TypedDict, total=False):
    product: str
    version: str
    items: list[dict[str, Any]]
    summary: dict[str, Any]
