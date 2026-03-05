"""Hierarchical Retriever — multi-stage search with context enrichment.

Implements the 3-stage retrieval pipeline:
  Stage 1: Coarse filter — L0 summaries to find relevant documents
  Stage 2: Precise search — L1/L2 chunks within candidate documents
  Stage 3: Context enrichment — inject parent summary, sibling chunks, sibling docs
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from lib.chunker import Chunk, SemanticChunker
from lib.registry import DocRegistry
from lib.traceback import DocMeta
from lib.vector_store import (
    SearchResult,
    TFIDFStore,
    VectorStoreBackend,
    create_store,
)


@dataclass
class RetrievalConfig:
    """Configuration for the retrieval pipeline."""
    top_k: int = 5
    coarse_multiplier: int = 3     # Candidate pool = top_k × multiplier
    precise_per_doc: int = 3       # Max chunks per candidate doc
    sibling_window: int = 1        # Adjacent sibling chunks to include
    include_parent: bool = True    # Include parent summary in results
    include_siblings: bool = True  # Include sibling doc IDs


class HierarchicalRetriever:
    """Multi-stage retrieval with hierarchical context."""

    def __init__(self, store: VectorStoreBackend, registry: DocRegistry,
                 config: RetrievalConfig | None = None):
        self.store = store
        self.registry = registry
        self.config = config or RetrievalConfig()

    def search(self, query: str, **kwargs: Any) -> list[SearchResult]:
        """Execute the full 3-stage retrieval pipeline.

        For TF-IDF backend, uses text-based search directly.
        For sqlite-vec backend, requires query embedding.
        """
        config = self.config
        for k, v in kwargs.items():
            if hasattr(config, k):
                setattr(config, k, v)

        if isinstance(self.store, TFIDFStore):
            return self._search_tfidf(query, config)
        else:
            # For vector backends, caller should provide embedding
            # This method provides the TF-IDF path for simplicity
            return self._search_tfidf(query, config)

    def search_with_embedding(self, query: str, query_vector: list[float],
                              config: RetrievalConfig | None = None) -> list[SearchResult]:
        """Execute retrieval with a pre-computed query embedding."""
        cfg = config or self.config

        # Stage 1: Coarse filter — L0 summaries
        candidate_pool = cfg.top_k * cfg.coarse_multiplier
        coarse_results = self.store.search(
            query_vector, top_k=candidate_pool, level=0
        )

        # Stage 2: Precise search within candidate docs
        seen_doc_ids = {chunk.doc_id for chunk, _ in coarse_results}
        precise_results: list[tuple[Chunk, float]] = []

        for doc_id in seen_doc_ids:
            doc_chunks = self.store.search(
                query_vector, top_k=cfg.precise_per_doc, doc_id=doc_id
            )
            precise_results.extend(doc_chunks)

        # Stage 3: Context enrichment
        results = self._enrich_results(precise_results, cfg)

        # Deduplicate and rank
        return self._deduplicate_and_rank(results, cfg.top_k)

    def _search_tfidf(self, query: str,
                      config: RetrievalConfig) -> list[SearchResult]:
        """TF-IDF specific search path."""
        assert isinstance(self.store, TFIDFStore)

        # Stage 1: Coarse — search L0 summaries
        candidate_pool = config.top_k * config.coarse_multiplier
        coarse = self.store.search(
            query_vector=None, top_k=candidate_pool, level=0,
            query_text=query,
        )

        # Collect candidate doc_ids
        candidate_docs = {chunk.doc_id for chunk, _ in coarse}

        # Stage 2: Precise — search L1/L2 within candidates
        precise: list[tuple[Chunk, float]] = []
        for doc_id in candidate_docs:
            for level in [1, 2]:
                hits = self.store.search(
                    query_vector=None, top_k=config.precise_per_doc,
                    level=level, doc_id=doc_id, query_text=query,
                )
                precise.extend(hits)

        if not precise:
            # Fall back to global search across all levels
            precise = self.store.search(
                query_vector=None, top_k=config.top_k * 2,
                query_text=query,
            )

        # Stage 3: Enrich
        results = self._enrich_results(precise, config)
        return self._deduplicate_and_rank(results, config.top_k)

    def _enrich_results(self, results: list[tuple[Chunk, float]],
                        config: RetrievalConfig) -> list[SearchResult]:
        """Add hierarchical context to each result."""
        enriched: list[SearchResult] = []

        for chunk, score in results:
            result = SearchResult(chunk=chunk, score=score)

            # Parent summary
            if config.include_parent and chunk.parent_chunk_id:
                parent = self.store.get_chunk(chunk.parent_chunk_id)
                if parent:
                    result.parent_summary = parent.content[:500]

            # Sibling chunks
            if config.sibling_window > 0:
                siblings = self.store.get_siblings(
                    chunk.chunk_id, window=config.sibling_window
                )
                result.sibling_chunks = siblings

            # Sibling docs (from registry)
            if config.include_siblings:
                doc = self.registry.get(chunk.doc_id)
                if doc and doc.vector and "sibling_docs" in doc.vector:
                    result.sibling_doc_ids = doc.vector["sibling_docs"]

            enriched.append(result)

        return enriched

    def _deduplicate_and_rank(self, results: list[SearchResult],
                              top_k: int) -> list[SearchResult]:
        """Remove duplicate chunks and rank by score."""
        seen: set[str] = set()
        unique: list[SearchResult] = []
        for r in sorted(results, key=lambda x: x.score, reverse=True):
            if r.chunk.chunk_id not in seen:
                seen.add(r.chunk.chunk_id)
                unique.append(r)
        return unique[:top_k]

    def format_results(self, results: list[SearchResult]) -> str:
        """Format results for Agent consumption."""
        if not results:
            return "No results found."

        lines: list[str] = []
        for i, r in enumerate(results, 1):
            lines.append(f"### Result {i} (score: {r.score:.3f})")
            lines.append(f"**Doc**: {r.chunk.doc_id} | **Section**: {r.chunk.heading}")
            lines.append(f"**Level**: L{r.chunk.level}")
            lines.append("")
            lines.append(r.chunk.content)
            lines.append("")

            if r.parent_summary:
                lines.append(f"> **Parent context**: {r.parent_summary[:200]}...")
                lines.append("")

            if r.sibling_doc_ids:
                lines.append(f"**Related docs**: {', '.join(r.sibling_doc_ids)}")
                lines.append("")

            lines.append("---")
            lines.append("")

        return "\n".join(lines)


# ─── Convenience Functions ────────────────────────────────────────────

def embed_repository(repo_root: Path, store: VectorStoreBackend | None = None,
                     registry: DocRegistry | None = None) -> dict[str, Any]:
    """Chunk and embed all traceable documents in a repository.

    Returns statistics about the embedding process.
    """
    from lib.registry import ENGINE_DIR

    if registry is None:
        registry = DocRegistry.load(repo_root) or DocRegistry.scan(repo_root)

    if store is None:
        store = create_store(repo_root / ENGINE_DIR)

    chunker = SemanticChunker()
    stats = {"docs_processed": 0, "chunks_created": 0, "chunks_skipped": 0}

    for doc in registry.all_docs():
        if not doc.filepath:
            continue
        filepath = Path(doc.filepath)
        if not filepath.is_file():
            continue

        content = filepath.read_text(encoding="utf-8")
        chunks = chunker.chunk(doc, content)

        # For TF-IDF, vectors are computed internally
        if isinstance(store, TFIDFStore):
            count = store.upsert(chunks, [])
        else:
            # For sqlite-vec, we'd need an embedding provider
            # For now, fall back to TF-IDF
            count = store.upsert(chunks, [[0.0] * 384] * len(chunks))

        stats["docs_processed"] += 1
        stats["chunks_created"] += count

    return stats
