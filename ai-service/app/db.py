"""Read-only database access for roadmap generation.

Loads the skill graph and goal weights from Postgres with psycopg. Kept separate
from roadmap.py so the algorithm itself stays pure and unit-testable without a
database. Only SELECTs happen here — the AI service never writes the graph.
"""

from __future__ import annotations

import psycopg
from psycopg.rows import dict_row

from .config import settings
from .roadmap import SkillNode


def _connect() -> psycopg.Connection:
    # autocommit: we run only read-only SELECTs, so no transaction is needed.
    # dict_row lets us read columns by name (r["id"]) instead of by position.
    return psycopg.connect(settings.database_url, autocommit=True, row_factory=dict_row)


def load_skill_graph() -> tuple[list[SkillNode], dict[str, list[str]]]:
    """Return (skills, prerequisites) from the database.

    prerequisites maps each skill id to the list of skill ids it depends on;
    every skill is guaranteed a (possibly empty) entry.
    """
    with _connect() as conn, conn.cursor() as cur:
        # The skill nodes.
        cur.execute("SELECT id, tags, estimated_minutes, display_order FROM skills")
        skills = [
            SkillNode(
                id=r["id"],
                tags=tuple(r["tags"]),
                estimated_minutes=r["estimated_minutes"],
                display_order=r["display_order"],
            )
            for r in cur.fetchall()
        ]

        # The prerequisite edges (skill_id depends on prereq_id).
        cur.execute("SELECT skill_id, prereq_id FROM skill_prerequisites")
        prerequisites: dict[str, list[str]] = {}
        for r in cur.fetchall():
            prerequisites.setdefault(r["skill_id"], []).append(r["prereq_id"])

    # Ensure every skill has an entry, even those with no prerequisites.
    for s in skills:
        prerequisites.setdefault(s.id, [])
    return skills, prerequisites


def load_goal_weights(goal_category: str) -> dict[str, float]:
    """Return {skill_tag: weight} for a goal (empty dict => everything neutral)."""
    with _connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT skill_tag, weight FROM goal_profiles WHERE goal_category = %s",
            (goal_category,),
        )
        return {r["skill_tag"]: float(r["weight"]) for r in cur.fetchall()}
