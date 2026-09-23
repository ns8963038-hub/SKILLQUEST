"""Goal mapping (NLP module #1, TRD 6.1).

Turns a student's free-text goal ("I want to crack the Infosys interview") into
one of a few goal categories, which then drives the roadmap's weighting.

Method: embed the student's text and a short description of each category, then
pick the category whose description is most similar (cosine). If nothing is
similar enough, fall back to the neutral default — better a balanced plan than a
confidently wrong one.

"Similar enough" is two checks. The small embedding model (bge-small) scores
almost ANY text 0.4-0.55 against every description, so an absolute floor alone
let gibberish through ("banana" -> higher_studies at 0.47). So the text is also
compared with a description of UNRELATED text (NULL_DESCRIPTION), and the best
career category must beat it by NULL_MARGIN. Measured on 17 real goals and 16
junk inputs (2026-09-23): every junk input falls back to the default; three very
terse real goals ("java", "dsa", "I want a job") do too, which only gives them
the neutral plan — the safe direction.

The matching logic here is pure and testable with injected vectors; the actual
embedding model lives in embeddings.py so this file needs no heavy dependency.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

# A one-sentence description of each mappable goal. The student's text is matched
# against these. 'general_placement' is intentionally NOT here — it's the
# fallback when confidence is too low, not something we match against.
CATEGORY_DESCRIPTIONS: dict[str, str] = {
    "service_placement": (
        "Getting a software job in the IT industry through campus placement at a "
        "service company such as TCS, Infosys, Wipro, Accenture, Cognizant or "
        "Capgemini. Aptitude tests, basic coding rounds and interviews on "
        "programming fundamentals. Improving Java basics for placement drives, "
        "and starting a career in the IT or software industry after the degree."
    ),
    "product_placement": (
        "Getting hired by a product-based technology company such as Google, "
        "Amazon, Microsoft, Flipkart or a funded startup, where the interviews "
        "are hard data structures and algorithms problems, competitive "
        "programming and system design."
    ),
    "higher_studies": (
        "Studying further after the degree: the GATE exam, an M.Tech, a master's "
        "degree abroad, research, a PhD or a teaching career. Academic and theory "
        "subjects, entrance exam syllabus, thesis and publications."
    ),
}

# Stable category order — tests rely on it to line up their fake vectors.
CATEGORIES: list[str] = list(CATEGORY_DESCRIPTIONS)

# Used when no category is similar enough (a balanced, neutral roadmap).
DEFAULT_CATEGORY = "general_placement"

# Below this cosine similarity we don't trust the match and use the default.
DEFAULT_THRESHOLD = 0.35

# What text that says nothing about a career looks like. The best category must
# be at least NULL_MARGIN more similar to the goal than this is.
NULL_DESCRIPTION = (
    "Random words, greetings, names, food, sports, films, pets or typing that says "
    "nothing about studies, jobs, placements, programming or a career."
)
NULL_MARGIN = 0.07

# An embedder takes a list of strings and returns one vector per string.
Embedder = Callable[[Sequence[str]], list[Sequence[float]]]


@dataclass(frozen=True)
class GoalMapResult:
    """The chosen category and how confident (cosine similarity) we are."""

    category: str
    confidence: float


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity of two vectors: 1 = identical direction, 0 = unrelated."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def map_goal(
    text: str,
    embed: Embedder,
    threshold: float = DEFAULT_THRESHOLD,
    null_margin: float = NULL_MARGIN,
) -> GoalMapResult:
    """Map free text to a goal category (see module docstring)."""
    # Empty / whitespace input can't be matched — return the neutral default.
    if not text or not text.strip():
        return GoalMapResult(DEFAULT_CATEGORY, 0.0)

    # Embed the text, every category description and the "unrelated text"
    # description in one call (order preserved).
    vectors = embed([text, *CATEGORY_DESCRIPTIONS.values(), NULL_DESCRIPTION])
    text_vec = vectors[0]
    null_similarity = _cosine(text_vec, vectors[-1])

    # Find the most similar category description.
    best_category = DEFAULT_CATEGORY
    best_similarity = -1.0
    for category, desc_vec in zip(CATEGORIES, vectors[1:-1]):
        similarity = _cosine(text_vec, desc_vec)
        if similarity > best_similarity:
            best_similarity, best_category = similarity, category

    # Not confident enough -> neutral default, but report the similarity we saw.
    # Either too dissimilar outright, or no closer to a career than random text is.
    if best_similarity < threshold or best_similarity - null_similarity < null_margin:
        return GoalMapResult(DEFAULT_CATEGORY, best_similarity)
    return GoalMapResult(best_category, best_similarity)
