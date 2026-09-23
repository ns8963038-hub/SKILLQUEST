"""SkillQuest AI service.

Owns the ML/NLP work: goal mapping, roadmap generation, disengagement-risk
scoring, and placement coverage. At M0 this is just the skeleton — a public
health check and a demonstration of the internal-key gateway. The real modules
arrive in later milestones.
"""

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field

from .db import load_goal_weights, load_skill_graph
from .goal_map import map_goal
from .roadmap import generate_roadmap
from .security import require_internal_key

log = logging.getLogger("skillquest.ai")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load the embedding model in the background as the service starts.

    On free hosting the service sleeps when idle; without this the FIRST goal
    mapping after a wake-up paid for the model load (~60 s). Loading it in a
    background thread keeps /health answering immediately, so the host marks the
    service live while the model finishes loading.
    """

    def warm() -> None:
        try:
            from .embeddings import warm as warm_model

            warm_model()
            log.info("embedding model ready")
        except Exception as exc:  # never stop the service because of a warm-up
            log.warning("embedding warm-up failed: %s", exc)

    threading.Thread(target=warm, name="warm-embeddings", daemon=True).start()
    yield


# No public /docs, /redoc or /openapi.json: the service is internal (only the
# Web API calls it), so there is no reason to publish a map of its routes.
app = FastAPI(
    title="SkillQuest AI Service",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/health")
def health() -> dict:
    """Public liveness check (used by monitoring; no key required)."""
    return {"status": "ok", "service": "ai"}


@app.get("/internal/ping", dependencies=[Depends(require_internal_key)])
def internal_ping() -> dict:
    """Demonstrates the gateway: only reachable with a valid X-Internal-Key.

    Real internal endpoints (/ai/goal-map, /ai/roadmap, /ai/risk-score,
    /ai/placement-score) use the same dependency.
    """
    return {"pong": True}


# ----- /ai/roadmap: generate a personalized week-by-week plan (TRD 6.2) -----


class RoadmapRequest(BaseModel):
    """Inputs the Web API sends when a student finishes onboarding."""

    goalCategory: str = "general_placement"  # drives the skill weighting
    hoursPerWeek: int = Field(default=5, ge=1, le=40)  # weekly study budget
    testedOut: list[str] = []  # skill ids the student passed out of via the quiz


class RoadmapItemOut(BaseModel):
    """One scheduled skill in the returned plan."""

    skillId: str
    weekNumber: int
    position: int


@app.post("/ai/roadmap", dependencies=[Depends(require_internal_key)])
def roadmap(req: RoadmapRequest) -> list[RoadmapItemOut]:
    """Load the skill graph + goal weights, then run the deterministic engine."""
    skills, prerequisites = load_skill_graph()
    tag_weights = load_goal_weights(req.goalCategory)
    plan = generate_roadmap(
        skills=skills,
        prerequisites=prerequisites,
        tag_weights=tag_weights,
        tested_out=set(req.testedOut),
        hours_per_week=req.hoursPerWeek,
    )
    # Translate the engine's dataclasses into the JSON response shape.
    return [
        RoadmapItemOut(skillId=i.skill_id, weekNumber=i.week_number, position=i.position)
        for i in plan
    ]


# ----- /ai/goal-map: free-text goal -> goal category (TRD 6.1) -----


class GoalMapRequest(BaseModel):
    """The student's free-text answer to 'describe your career goal'."""

    text: str


class GoalMapResponse(BaseModel):
    goalCategory: str  # feeds straight into the roadmap request
    confidence: float  # cosine similarity of the winning match (0..1)


@app.post("/ai/goal-map", dependencies=[Depends(require_internal_key)])
def goal_map(req: GoalMapRequest) -> GoalMapResponse:
    """Embed the text and pick the closest goal category (neutral default if unsure)."""
    # Imported lazily so the heavy embedding model isn't needed just to import
    # this module (keeps startup and tests light).
    from .embeddings import embed

    result = map_goal(req.text, embed)
    return GoalMapResponse(goalCategory=result.category, confidence=round(result.confidence, 4))


# ----- /ai/risk-score: disengagement risk from a feature row (TRD 6.3) -----


class RiskScoreRequest(BaseModel):
    """The feature row the Web API computed from a student's events log."""

    features: dict


class RiskScoreResponse(BaseModel):
    probability: float
    tier: str  # healthy | watch | atrisk
    modelVersion: str
    featureSetVersion: str
    thresholdVersion: str


@app.post("/ai/risk-score", dependencies=[Depends(require_internal_key)])
def risk_score(req: RiskScoreRequest) -> RiskScoreResponse:
    """Score one feature row (uses the trained model if present, else baseline)."""
    from .risk import score

    return RiskScoreResponse(**score(req.features))
