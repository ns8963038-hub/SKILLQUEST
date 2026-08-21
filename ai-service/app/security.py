"""Gateway authentication.

The AI service never faces the public internet directly — only the Node Web API
calls it, presenting a shared secret in the X-Internal-Key header. Every internal
route depends on `require_internal_key`, so a request without the correct key is
rejected with 401 before any work happens.
"""

from fastapi import Header, HTTPException, status

from .config import settings


def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    # Reject if the key is unset (misconfiguration) or doesn't match.
    if not settings.internal_api_key or x_internal_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing internal key",
        )
