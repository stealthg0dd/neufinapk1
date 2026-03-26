"""
Centralised structlog + stdlib logging configuration for the Neufin backend.

Call configure_logging() exactly once at application startup (in main.py).
Everywhere else, obtain a logger with:

    import structlog
    logger = structlog.get_logger(__name__)
    logger.info("event_name", key="value")

In production (LOG_FORMAT=json, the default) every line is newline-delimited JSON
suitable for Datadog / CloudWatch log ingestion.  In development (LOG_FORMAT=console)
output is colour-rendered for readability.
"""

import logging
import os
import sys

import structlog


def configure_logging() -> None:
    """Configure structlog and the stdlib root logger."""

    log_level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_name, logging.INFO)
    json_logs = os.getenv("LOG_FORMAT", "json").lower() != "console"

    # Processors shared by all log entries
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if json_logs:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processor=renderer,
            foreign_pre_chain=shared_processors,
        )
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    # Silence noisy third-party loggers at WARNING level
    for noisy in (
        "httpx",
        "httpcore",
        "supabase",
        "gotrue",
        "uvicorn.access",
        "hpack",
    ):
        logging.getLogger(noisy).setLevel(logging.WARNING)
