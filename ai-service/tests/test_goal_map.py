"""Tests for goal mapping — the matching logic, with fake embeddings.

We inject a fake embedder so the tests are fast and deterministic and never need
the real model. Each test hands map_goal exactly the vectors it should compare.
"""

from app.goal_map import CATEGORIES, DEFAULT_CATEGORY, map_goal


def fixed_embedder(vectors):
    """An embedder that ignores its input and returns preset vectors.

    map_goal always calls embed([text, <desc for each category in CATEGORIES>,
    <the "unrelated text" description>]), so `vectors` must be
    [text_vec, *category_vecs, null_vec] in CATEGORIES order.
    """

    def _embed(texts):
        assert len(texts) == len(vectors), "vector count must match inputs"
        return vectors

    return _embed


def test_maps_to_the_closest_category():
    # Give the text the SAME vector as product_placement's description -> cosine 1.
    axis = {cat: [1.0 if i == j else 0.0 for j in range(len(CATEGORIES))] for i, cat in enumerate(CATEGORIES)}
    text_vec = axis["product_placement"]
    null_vec = [0.0] * len(CATEGORIES)  # nothing like the text
    vectors = [text_vec, *[axis[c] for c in CATEGORIES], null_vec]

    result = map_goal("I want to crack product company interviews", fixed_embedder(vectors))
    assert result.category == "product_placement"
    assert result.confidence > 0.99


def test_low_similarity_falls_back_to_default():
    # Category descriptions all point one way; the text points the opposite way,
    # so every similarity is <= 0 (below the threshold) -> neutral default.
    cat_vecs = [[1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]  # one per category
    text_vec = [-1.0, 0.0]  # opposite direction from all of them
    vectors = [text_vec, *cat_vecs, [0.0, 0.0]]

    result = map_goal("something unrelated", fixed_embedder(vectors))
    assert result.category == DEFAULT_CATEGORY


def test_text_no_closer_to_a_career_than_to_random_text_falls_back():
    # The small model scores almost anything ~0.5 against every description. Here
    # the text is 0.8 similar to product_placement — well over the 0.35 floor —
    # but just as similar to the "unrelated text" description, so it's noise.
    axis = {cat: [1.0 if i == j else 0.0 for j in range(len(CATEGORIES) + 1)] for i, cat in enumerate(CATEGORIES)}
    null_vec = [0.0] * len(CATEGORIES) + [1.0]
    text_vec = [0.0] * (len(CATEGORIES) + 1)
    text_vec[CATEGORIES.index("product_placement")] = 1.0
    text_vec[-1] = 1.0  # equally close to "unrelated text"
    vectors = [text_vec, *[axis[c] for c in CATEGORIES], null_vec]

    result = map_goal("banana", fixed_embedder(vectors))
    assert result.category == DEFAULT_CATEGORY


def test_blank_text_returns_default_without_embedding():
    # Empty input shouldn't even call the embedder; it just returns the default.
    def exploding_embedder(_texts):
        raise AssertionError("embedder should not be called for blank text")

    result = map_goal("   ", exploding_embedder)
    assert result.category == DEFAULT_CATEGORY
    assert result.confidence == 0.0
