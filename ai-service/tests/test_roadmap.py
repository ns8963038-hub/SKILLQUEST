"""Tests for the roadmap engine — the algorithmic heart, so it's tested hard.

Each test uses a tiny hand-built graph so the expected result is obvious.
"""

import pytest

from app.roadmap import SkillNode, generate_roadmap


def node(sid: str, tags: tuple[str, ...], order: int, minutes: int = 60) -> SkillNode:
    """Helper to build a skill node with sensible defaults."""
    return SkillNode(id=sid, tags=tags, estimated_minutes=minutes, display_order=order)


def order_of(plan) -> list[str]:
    """Flatten a plan (already week/position ordered) to a list of skill ids."""
    return [item.skill_id for item in plan]


def positions(plan) -> dict[str, tuple[int, int]]:
    """Map each skill to its (week_number, position) for assertions."""
    return {i.skill_id: (i.week_number, i.position) for i in plan}


# a -> b -> c ; a -> d   (b,c on one branch; d on another)
BASE_SKILLS = [
    node("a", ("basics",), 1),
    node("b", ("arrays",), 2),
    node("c", ("trees",), 3),
    node("d", ("strings",), 4),
]
BASE_PREREQS = {"a": [], "b": ["a"], "c": ["b"], "d": ["a"]}


def test_prerequisites_always_come_before_dependents():
    plan = generate_roadmap(BASE_SKILLS, BASE_PREREQS, {}, set(), hours_per_week=10)
    seq = order_of(plan)
    # a before b, b before c, a before d.
    assert seq.index("a") < seq.index("b") < seq.index("c")
    assert seq.index("a") < seq.index("d")


def test_goal_changes_the_ordering():
    """PRD acceptance: same graph + hours, differing only in goal -> different order."""
    trees_goal = generate_roadmap(BASE_SKILLS, BASE_PREREQS, {"trees": 2.0}, set(), 10)
    strings_goal = generate_roadmap(BASE_SKILLS, BASE_PREREQS, {"strings": 2.0}, set(), 10)

    # With trees up-weighted, after 'a' the tie between b and d breaks to b
    # (its branch leads to the high-value 'c'); with strings up-weighted, 'd'
    # jumps ahead of 'b'. The two orderings must differ.
    assert order_of(trees_goal) != order_of(strings_goal)
    # Concretely: strings goal puts d before b; trees goal puts b before d.
    assert order_of(strings_goal).index("d") < order_of(strings_goal).index("b")
    assert order_of(trees_goal).index("b") < order_of(trees_goal).index("d")


def test_tested_out_skill_is_dropped():
    # Student tested out of 'b'; it shouldn't appear, and 'c' (which needed it)
    # is now unlocked without it.
    plan = generate_roadmap(BASE_SKILLS, BASE_PREREQS, {}, {"b"}, hours_per_week=10)
    seq = order_of(plan)
    assert "b" not in seq
    assert "c" in seq and "a" in seq


def test_optional_leaf_is_dropped_but_needed_zero_weight_prereq_is_kept():
    # 'opt' is a weight-0 leaf -> dropped. 'base0' is weight-0 but 'top' (kept)
    # depends on it -> must be kept.
    skills = [
        node("base0", ("zero",), 1),
        node("top", ("keepme",), 2),
        node("opt", ("zero",), 3),
    ]
    prereqs = {"base0": [], "top": ["base0"], "opt": []}
    weights = {"zero": 0.0, "keepme": 2.0}
    seq = order_of(generate_roadmap(skills, prereqs, weights, set(), 10))
    assert "opt" not in seq  # optional leaf dropped
    assert "base0" in seq and "top" in seq  # needed zero-weight prereq kept
    assert seq.index("base0") < seq.index("top")


def test_bin_packing_respects_hours_and_week_ordering():
    # capacity = 3h * 60 = 180 min; each node is 60 min -> 3 per week.
    plan = generate_roadmap(BASE_SKILLS, BASE_PREREQS, {}, set(), hours_per_week=3)
    pos = positions(plan)
    # Four 60-min skills -> weeks [1,1,1,2].
    weeks = sorted(w for (w, _) in pos.values())
    assert weeks == [1, 1, 1, 2]
    # Every dependent is scheduled in a week >= each of its prerequisites' week.
    for sid, prereqs in BASE_PREREQS.items():
        for prereq in prereqs:
            assert pos[sid][0] >= pos[prereq][0]


def test_oversized_skill_gets_its_own_week():
    skills = [node("big", ("x",), 1, minutes=300)]  # 300 > 60-min weekly capacity
    plan = generate_roadmap(skills, {"big": []}, {}, set(), hours_per_week=1)
    assert positions(plan)["big"] == (1, 0)  # placed alone, not looping forever


def test_cycle_raises():
    skills = [node("a", (), 1), node("b", (), 2)]
    prereqs = {"a": ["b"], "b": ["a"]}  # a<->b cycle
    with pytest.raises(ValueError, match="cycle"):
        generate_roadmap(skills, prereqs, {}, set(), 10)
