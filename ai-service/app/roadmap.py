"""The roadmap generation algorithm (TRD 6.2).

This is the deterministic, explainable core of the product: given the skill
graph and a student's goal + available hours, it produces an ordered,
week-by-week plan. It is written as pure functions over plain data so it can be
unit-tested without a database.

The pipeline, in order:
  1. Drop skills the student tested out of (they already know them).
  2. Weight each remaining skill from its tags, using the goal's weight vector.
  3. Drop "optional" skills — weight 0 AND not needed by any kept skill.
  4. Weighted topological sort: respect prerequisites always; when several
     skills are simultaneously unlocked, do the higher-weighted one first.
  5. Pack the ordered skills into weeks by the student's hours/week.

Because it's deterministic, it's fully explainable in a viva: "the goal changes
the priorities; prerequisites are never violated."
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass


@dataclass(frozen=True)
class SkillNode:
    """One node of the skill graph, with just what the algorithm needs."""

    id: str
    tags: tuple[str, ...]
    estimated_minutes: int
    display_order: int  # stable tie-breaker so equal-weight skills order predictably


@dataclass(frozen=True)
class RoadmapItem:
    """One scheduled skill in the generated plan."""

    skill_id: str
    week_number: int
    position: int  # order within the week


def skill_weight(node: SkillNode, tag_weights: dict[str, float]) -> float:
    """Priority of a skill for the current goal.

    A skill takes the HIGHEST weight among its tags (missing tags default to the
    neutral 1.0). Using the max — rather than a product — keeps the scale sane:
    a skill can't be inflated just for having many tags, and a single strongly
    weighted tag is enough to prioritise it. A skill with no tags is neutral.
    """
    if not node.tags:
        return 1.0
    return max(tag_weights.get(tag, 1.0) for tag in node.tags)


def _required_closure(
    keep: set[str], prerequisites: dict[str, list[str]], present: set[str]
) -> set[str]:
    """Every skill that must stay: the kept skills plus all their ancestors.

    A weight-0 skill can only be dropped if NO kept skill depends on it. So we
    walk prerequisites backwards from the kept set and mark everything reachable
    as required (a kept skill's prerequisite is itself required, even if the
    goal weighted it 0).
    """
    required: set[str] = set()
    stack = list(keep)
    while stack:
        sid = stack.pop()
        if sid in required or sid not in present:
            continue
        required.add(sid)
        # Its prerequisites are required too.
        for prereq in prerequisites.get(sid, []):
            if prereq in present and prereq not in required:
                stack.append(prereq)
    return required


def generate_roadmap(
    skills: list[SkillNode],
    prerequisites: dict[str, list[str]],
    tag_weights: dict[str, float],
    tested_out: set[str],
    hours_per_week: int,
) -> list[RoadmapItem]:
    """Produce the ordered week-by-week plan. See the module docstring."""
    if hours_per_week <= 0:
        raise ValueError("hours_per_week must be positive")

    by_id = {s.id: s for s in skills}

    # --- 1) Drop skills the student tested out of. Their dependents no longer
    #        need them as a prerequisite (the student already knows the concept).
    present = {s.id for s in skills if s.id not in tested_out}

    # --- 2) Weight the remaining skills from the goal's tag weights.
    weight_of = {sid: skill_weight(by_id[sid], tag_weights) for sid in present}

    # --- 3) Drop optional skills: weight 0 and not required by any kept skill.
    kept_positive = {sid for sid in present if weight_of[sid] > 0}
    required = _required_closure(kept_positive, prerequisites, present)
    # If the goal zeroed out everything, fall back to scheduling all present
    # skills (a plan of nothing helps no one).
    scheduled = required if required else present

    # --- 4) Weighted topological sort (Kahn's algorithm with a priority queue).
    #        Count prerequisites that are themselves scheduled.
    indegree: dict[str, int] = {sid: 0 for sid in scheduled}
    children: dict[str, list[str]] = {sid: [] for sid in scheduled}
    for sid in scheduled:
        for prereq in prerequisites.get(sid, []):
            if prereq in scheduled:
                children[prereq].append(sid)
                indegree[sid] += 1

    # A min-heap keyed by (-weight, display_order, id) makes it pop the highest
    # weight first, breaking ties by display order then id for determinism.
    def heap_key(sid: str) -> tuple[float, int, str]:
        return (-weight_of[sid], by_id[sid].display_order, sid)

    ready = [heap_key(sid) for sid in scheduled if indegree[sid] == 0]
    heapq.heapify(ready)

    order: list[str] = []
    while ready:
        _, _, sid = heapq.heappop(ready)
        order.append(sid)
        for child in children[sid]:
            indegree[child] -= 1
            if indegree[child] == 0:
                heapq.heappush(ready, heap_key(child))

    # If we couldn't place every scheduled skill, the graph had a cycle.
    if len(order) != len(scheduled):
        raise ValueError("skill graph has a cycle — cannot generate a roadmap")

    # --- 5) Pack the ordered skills into weeks by capacity (hours/week in mins).
    #        Next-fit preserving order: keep adding to the current week until the
    #        next skill wouldn't fit, then start a new week. Because we never
    #        reorder, a skill's prerequisites always land in an earlier (or the
    #        same, earlier-position) slot.
    capacity = hours_per_week * 60
    plan: list[RoadmapItem] = []
    week = 1
    used = 0
    position = 0
    for sid in order:
        minutes = by_id[sid].estimated_minutes
        # Start a new week if this skill won't fit — unless the current week is
        # empty (a single oversized skill gets its own week rather than looping).
        if used > 0 and used + minutes > capacity:
            week += 1
            used = 0
            position = 0
        plan.append(RoadmapItem(skill_id=sid, week_number=week, position=position))
        used += minutes
        position += 1

    return plan
