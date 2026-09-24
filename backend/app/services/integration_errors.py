from __future__ import annotations

from typing import Any


class IntegrationError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        retryable: bool = False,
        details: list[dict[str, Any]] | None = None,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retryable = retryable
        self.details = details or []
        self.retry_after = retry_after


def error_payload(
    *,
    code: str,
    message: str,
    request_id: str,
    retryable: bool,
    details: list[dict[str, Any]],
) -> dict[str, object]:
    return {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
            "retryable": retryable,
            "details": details,
        }
    }
