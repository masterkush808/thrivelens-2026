import time
from collections import deque
from typing import Deque, Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class SlidingWindowLimiter:
    """Per-key sliding-window rate limiter.

    Uses an in-memory deque of event timestamps per key. Safe for a single
    process; production deployments that run multiple workers should move this
    to shared storage (e.g. Redis).
    """

    def __init__(self, limit: int, window_seconds: float):
        if limit < 0:
            raise ValueError("rate limit must be >= 0 (0 disables limiting)")
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: Dict[str, Deque[float]] = {}

    def check(self, key: str) -> Tuple[bool, float]:
        if self.limit <= 0:
            return True, 0.0
        now = time.monotonic()
        window_start = now - self.window_seconds
        hits = self._hits.get(key)
        if hits is None:
            hits = deque()
            self._hits[key] = hits
        while hits and hits[0] <= window_start:
            hits.popleft()
        if len(hits) >= self.limit:
            oldest = hits[0]
            retry_after = max(0.0, self.window_seconds - (now - oldest))
            return False, retry_after
        hits.append(now)
        return True, 0.0

    def clear(self, key: str) -> None:
        self._hits.pop(key, None)


def client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    host = request.client.host if request.client is not None else "unknown"
    return f"{host}:{request.scope.get('method', '')}:{request.scope.get('path', '')}"


def make_rate_limit_middleware(limit: int, window_seconds: float):
    limiter = SlidingWindowLimiter(limit, window_seconds)

    class RateLimitMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            if limit <= 0 or request.scope.get("path") in ("/healthz", "/gradio_api/info"):
                return await call_next(request)
            allowed, retry_after = limiter.check(client_key(request))
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": {
                            "code": "rate_limited",
                            "message": "too many requests, slow down",
                        }
                    },
                    headers={"Retry-After": f"{retry_after:.0f}"},
                )
            return await call_next(request)

    return RateLimitMiddleware