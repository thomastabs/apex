"""AI usage/cost telemetry — powers the Usage settings section.

The sink is registered with src.ai_engine at import time (this module is
always imported once, via backend/app/api/usage.py -> main.py's router
include, mirroring how every other router self-registers on import) so every
AI call anywhere in the backend reports here automatically without ai_engine
needing to know about storage, instances, or projects.
"""

import logging

from backend.app.services.context_service import ContextService
from src import ai_engine

_logger = logging.getLogger("apex.usage_service")


def _sink(event: dict) -> None:
    """Registered with ai_engine.set_usage_sink. Tags the event with whichever
    project is active on the request's ContextVar (None if no project is
    selected — e.g. epic suggestion before a project exists). Never raises:
    the AI call this fires after has already completed, so a bug here must
    not surface as a failure of that call.
    """
    try:
        context = ContextService()
        context.append_usage_event({**event, "project_id": context.active_project_id()})
    except Exception:
        _logger.warning("usage_sink_failed", exc_info=True)


ai_engine.set_usage_sink(_sink)


def _bump(row: dict, event: dict) -> None:
    row["calls"] += 1
    row["cost_usd"] += event.get("cost_usd", 0.0)


class UsageService:
    def __init__(self, *, context: ContextService | None = None) -> None:
        self.context = context or ContextService()

    def configure_request(self, instance_id: str) -> None:
        self.context.set_active_instance(instance_id)

    def summary(self, days: int = 30) -> dict:
        events = self.context.load_usage_events(days)

        by_model: dict[str, dict] = {}
        by_call: dict[str, dict] = {}
        by_day: dict[str, dict] = {}

        for e in events:
            model = e.get("model") or "unknown"
            row = by_model.setdefault(model, {
                "model": model, "provider": e.get("provider", ""), "calls": 0,
                "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0,
            })
            row["calls"] += 1
            row["input_tokens"] += e.get("input_tokens", 0)
            row["output_tokens"] += e.get("output_tokens", 0)
            row["cost_usd"] += e.get("cost_usd", 0.0)

            _bump(by_call.setdefault(e.get("call") or "unknown", {
                "call": e.get("call") or "unknown", "calls": 0, "cost_usd": 0.0,
            }), e)

            day = (e.get("ts") or "")[:10] or "unknown"
            _bump(by_day.setdefault(day, {"date": day, "calls": 0, "cost_usd": 0.0}), e)

        for row in (*by_model.values(), *by_call.values(), *by_day.values()):
            row["cost_usd"] = round(row["cost_usd"], 4)

        return {
            "days": days,
            "total_cost_usd": round(sum(e.get("cost_usd", 0.0) for e in events), 4),
            "total_input_tokens": sum(e.get("input_tokens", 0) for e in events),
            "total_output_tokens": sum(e.get("output_tokens", 0) for e in events),
            "total_cache_read_tokens": sum(e.get("cache_read_tokens", 0) for e in events),
            "total_calls": len(events),
            "by_model": sorted(by_model.values(), key=lambda r: -r["cost_usd"]),
            "by_call": sorted(by_call.values(), key=lambda r: -r["cost_usd"]),
            "by_day": sorted(by_day.values(), key=lambda r: r["date"]),
        }
