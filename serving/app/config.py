import os
from dataclasses import dataclass, field
from functools import lru_cache


SERVING_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _env(name, default):
    value = os.getenv(name)
    return value if value not in (None, "") else default


def _bool_env(name, default: bool) -> bool:
    return _env(name, "1" if default else "0").lower() in ("1", "true", "yes")


@dataclass(frozen=True)
class Settings:
    use_4bit: bool = field(default_factory=lambda: _bool_env("THRIVELENS_USE_4BIT", True))
    model_dtype: str = field(default_factory=lambda: _env("THRIVELENS_MODEL_DTYPE", "fp16").lower())
    base_model: str = field(default_factory=lambda: _env("THRIVELENS_BASE_MODEL", "zy12123/Food-R1"))
    adapter_dir: str = field(
        default_factory=lambda: _env(
            "THRIVELENS_ADAPTER_DIR",
            os.path.join(SERVING_ROOT, "models", "thrivelens-foodr1-adapter"),
        )
    )
    adapter_repo: str = field(default_factory=lambda: _env("THRIVELENS_ADAPTER_REPO", ""))
    hf_token: str = field(default_factory=lambda: _env("HF_TOKEN", ""))
    mock: bool = field(default_factory=lambda: _bool_env("THRIVELENS_SERVING_MOCK", False))
    auth_mode: str = field(default_factory=lambda: _env("THRIVELENS_SERVING_AUTH", "dev").lower())
    api_key: str = field(default_factory=lambda: _env("THRIVELENS_SERVING_API_KEY", ""))
    host: str = field(default_factory=lambda: _env("THRIVELENS_SERVING_HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: int(_env("THRIVELENS_SERVING_PORT", "8000")))
    max_image_bytes: int = field(
        default_factory=lambda: int(_env("THRIVELENS_MAX_IMAGE_BYTES", str(5 * 1024 * 1024)))
    )
    max_upload_pixels: int = field(
        default_factory=lambda: int(_env("THRIVELENS_MAX_UPLOAD_PIXELS", "40000000"))
    )
    max_chat_chars: int = field(default_factory=lambda: int(_env("THRIVELENS_MAX_CHAT_CHARS", "4000")))
    rate_limit_requests: int = field(
        default_factory=lambda: int(_env("THRIVELENS_RATE_LIMIT_REQUESTS", "120"))
    )
    rate_limit_window_seconds: int = field(
        default_factory=lambda: int(_env("THRIVELENS_RATE_LIMIT_WINDOW_SECONDS", "60"))
    )
    max_new_tokens: int = field(default_factory=lambda: int(_env("THRIVELENS_MAX_NEW_TOKENS", "192")))
    coach_max_new_tokens: int = field(
        default_factory=lambda: int(_env("THRIVELENS_COACH_MAX_NEW_TOKENS", "384"))
    )
    abstain_confidence: float = field(
        default_factory=lambda: float(_env("THRIVELENS_ABSTAIN_CONFIDENCE", "0.45"))
    )
    image_min_pixels: int = field(
        default_factory=lambda: int(_env("THRIVELENS_IMAGE_MIN_PIXELS", "4096"))
    )
    image_max_pixels: int = field(
        default_factory=lambda: int(_env("THRIVELENS_IMAGE_MAX_PIXELS", "25600"))
    )
    off_enabled: bool = field(default_factory=lambda: _bool_env("THRIVELENS_OFF_ENABLED", False))
    off_api_url: str = field(
        default_factory=lambda: _env(
            "THRIVELENS_OFF_API_URL", "https://world.openfoodfacts.org/api/v2"
        )
    )
    off_user_agent: str = field(
        default_factory=lambda: _env("THRIVELENS_OFF_USER_AGENT", "ThriveLens-2026/0.1")
    )
    off_max_results: int = field(default_factory=lambda: int(_env("THRIVELENS_OFF_MAX_RESULTS", "1")))
    off_timeout_seconds: float = field(
        default_factory=lambda: float(_env("THRIVELENS_OFF_TIMEOUT_SECONDS", "8.0"))
    )
    off_retries: int = field(default_factory=lambda: int(_env("THRIVELENS_OFF_RETRIES", "2")))
    off_cache_ttl_seconds: int = field(
        default_factory=lambda: int(_env("THRIVELENS_OFF_CACHE_TTL_SECONDS", "86400"))
    )
    adapter_sha256: str = field(default_factory=lambda: _env("THRIVELENS_ADAPTER_SHA256", ""))

    def __post_init__(self):
        if self.auth_mode not in ("dev", "token"):
            raise ValueError(
                f"unknown THRIVELENS_SERVING_AUTH={self.auth_mode!r}; "
                "must be 'dev' or 'token' (fail-closed)"
            )
        if self.auth_mode == "token" and not self.api_key:
            raise ValueError(
                "THRIVELENS_SERVING_AUTH=token requires a non-empty "
                "THRIVELENS_SERVING_API_KEY (fail-closed)"
            )
        if not self.mock and self.auth_mode == "dev":
            raise ValueError(
                "real serving (THRIVELENS_SERVING_MOCK=0) requires token auth; "
                "set THRIVELENS_SERVING_AUTH=token and THRIVELENS_SERVING_API_KEY"
            )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()