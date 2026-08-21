"""SkillQuest AI service.

Owns the ML/NLP work: goal mapping, roadmap generation, disengagement-risk
scoring, and placement coverage. At M0 this is just the skeleton — a public
health check and a demonstration of the internal-key gateway. The real modules
arrive in later milestones.
"""

from fastapi import Depends, FastAPI

from .security import require_internal_key

app = FastAPI(title="SkillQuest AI Service", version="0.1.0")


@app.get("/health")
def health() -> dict:
    """Public liveness check (used by monitoring; no key required)."""
    return {"status": "ok", "service": "ai"}


@app.get("/internal/ping", dependencies=[Depends(require_internal_key)])
def internal_ping() -> dict:
    """Demonstrates the gateway: only reachable with a valid X-Internal-Key.

    Real internal endpoints (/ai/goal-map, /ai/roadmap, /ai/risk-score,
    /ai/placement-score) will use the same dependency.
    """
    return {"pong": True}
