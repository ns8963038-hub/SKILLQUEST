"""Sentence embeddings via fastembed (ONNX).

We use fastembed rather than sentence-transformers because it runs the same
small model with a fraction of the memory (no PyTorch), which matters on the
free hosting tier (TRD sec 2). The model is loaded lazily and cached, so importing
this module is cheap and nothing downloads until the first real embed() call.
"""

from __future__ import annotations

import os
from collections.abc import Sequence
from functools import lru_cache


@lru_cache(maxsize=1)
def _model():
    """Load (once) and cache the embedding model. Imported here so the heavy
    dependency is only needed at runtime, not to import this module."""
    from fastembed import TextEmbedding

    # A small, fast, 384-dimensional English model — plenty for short goal text.
    # FASTEMBED_CACHE_PATH (set on the host) keeps the downloaded model inside
    # the project folder, so it is fetched once at BUILD time (see render.yaml)
    # instead of on every free-tier wake-up. Unset locally = fastembed's default.
    return TextEmbedding(model_name="BAAI/bge-small-en-v1.5", cache_dir=os.environ.get("FASTEMBED_CACHE_PATH") or None)


def embed(texts: Sequence[str]) -> list[list[float]]:
    """Return one embedding vector per input string."""
    # fastembed yields numpy arrays; convert to plain lists for downstream code.
    return [list(map(float, vec)) for vec in _model().embed(list(texts))]


def warm() -> None:
    """Download and load the model now (run once during the deploy build)."""
    embed(["warm up"])


if __name__ == "__main__":
    # `python -m app.embeddings` — used by the build step to pre-download the model.
    warm()
    print("embedding model ready")
