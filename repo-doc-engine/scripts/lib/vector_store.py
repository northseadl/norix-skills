"""Vector Store — local embedded vector database with TF-IDF fallback.

Primary: sqlite-vec (PEP 723 inline dep, installed on demand)
Fallback: TF-IDF + cosine similarity (pure stdlib)

Stores chunks with hierarchical metadata for contextual retrieval.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
from abc import ABC, abstractmethod
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from lib.chunker import Chunk


@dataclass
class SearchResult:
    """A single search result with score and context."""
    chunk: Chunk
    score: float
    # Contextual metadata injected during retrieval
    parent_summary: str | None = None
    sibling_chunks: list[Chunk] = field(default_factory=list)
    sibling_doc_ids: list[str] = field(default_factory=list)


class VectorStoreBackend(ABC):
    """Abstract interface for vector storage backends."""

    @abstractmethod
    def upsert(self, chunks: list[Chunk], vectors: list[list[float]]) -> int:
        """Insert or update chunks with their vectors. Returns count."""
        ...

    @abstractmethod
    def search(self, query_vector: list[float], top_k: int = 5,
               level: int | None = None,
               doc_id: str | None = None) -> list[tuple[Chunk, float]]:
        """Search for similar chunks. Returns [(chunk, score)]."""
        ...

    @abstractmethod
    def get_chunk(self, chunk_id: str) -> Chunk | None:
        """Get a specific chunk by ID."""
        ...

    @abstractmethod
    def get_siblings(self, chunk_id: str, window: int = 1) -> list[Chunk]:
        """Get sibling chunks around the given chunk."""
        ...

    @abstractmethod
    def delete_doc(self, doc_id: str) -> int:
        """Delete all chunks for a document. Returns count."""
        ...

    @abstractmethod
    def stats(self) -> dict[str, Any]:
        """Return storage statistics."""
        ...


# ─── TF-IDF Fallback (Pure stdlib) ──────────────────────────────────

class TFIDFStore(VectorStoreBackend):
    """TF-IDF based search using only Python stdlib.

    Good enough for domain-specific repo documentation search.
    No external dependencies required.
    """

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._chunks: dict[str, Chunk] = {}
        self._tfidf_vectors: dict[str, dict[str, float]] = {}
        self._doc_freq: Counter[str] = Counter()
        self._total_docs: int = 0
        self._load()

    def upsert(self, chunks: list[Chunk], vectors: list[list[float]] | None = None) -> int:
        """Insert chunks, computing TF-IDF internally (ignores vectors)."""
        count = 0
        for chunk in chunks:
            self._chunks[chunk.chunk_id] = chunk
            tf = self._compute_tf(chunk.content)
            self._tfidf_vectors[chunk.chunk_id] = tf
            self._doc_freq.update(set(tf.keys()))
            self._total_docs += 1
            count += 1
        self._save()
        return count

    def search(self, query_vector: list[float] | None = None, top_k: int = 5,
               level: int | None = None, doc_id: str | None = None,
               query_text: str = "") -> list[tuple[Chunk, float]]:
        """Search using TF-IDF cosine similarity."""
        if not query_text and query_vector is not None:
            # Can't search with external vectors in TF-IDF mode
            return []

        query_tf = self._compute_tf(query_text)
        query_tfidf = self._to_tfidf(query_tf)

        results: list[tuple[Chunk, float]] = []
        for chunk_id, chunk in self._chunks.items():
            if level is not None and chunk.level != level:
                continue
            if doc_id is not None and chunk.doc_id != doc_id:
                continue

            chunk_tfidf = self._to_tfidf(self._tfidf_vectors.get(chunk_id, {}))
            score = _cosine_similarity(query_tfidf, chunk_tfidf)
            if score > 0:
                results.append((chunk, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

    def get_chunk(self, chunk_id: str) -> Chunk | None:
        return self._chunks.get(chunk_id)

    def get_siblings(self, chunk_id: str, window: int = 1) -> list[Chunk]:
        chunk = self._chunks.get(chunk_id)
        if not chunk or not chunk.sibling_chunk_ids:
            return []
        return [
            self._chunks[sid]
            for sid in chunk.sibling_chunk_ids[:window * 2]
            if sid in self._chunks
        ]

    def delete_doc(self, doc_id: str) -> int:
        to_remove = [cid for cid, c in self._chunks.items() if c.doc_id == doc_id]
        for cid in to_remove:
            del self._chunks[cid]
            if cid in self._tfidf_vectors:
                del self._tfidf_vectors[cid]
        self._save()
        return len(to_remove)

    def stats(self) -> dict[str, Any]:
        doc_ids = {c.doc_id for c in self._chunks.values()}
        levels = Counter(c.level for c in self._chunks.values())
        return {
            "backend": "tfidf",
            "total_chunks": len(self._chunks),
            "total_docs": len(doc_ids),
            "chunks_by_level": dict(levels),
            "vocab_size": len(self._doc_freq),
            "db_path": str(self.db_path),
        }

    # ─── TF-IDF internals ─────────────────────────────────────────

    def _compute_tf(self, text: str) -> dict[str, float]:
        """Term frequency (normalized)."""
        words = _tokenize(text)
        if not words:
            return {}
        counter = Counter(words)
        max_freq = max(counter.values())
        return {word: freq / max_freq for word, freq in counter.items()}

    def _to_tfidf(self, tf: dict[str, float]) -> dict[str, float]:
        """Convert TF to TF-IDF using document frequencies."""
        if self._total_docs == 0:
            return tf
        tfidf = {}
        for word, freq in tf.items():
            df = self._doc_freq.get(word, 0)
            idf = math.log((self._total_docs + 1) / (df + 1)) + 1
            tfidf[word] = freq * idf
        return tfidf

    # ─── Persistence ───────────────────────────────────────────────

    def _save(self):
        """Persist to JSON file."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "chunks": {cid: c.to_dict() for cid, c in self._chunks.items()},
            "tfidf_vectors": self._tfidf_vectors,
            "doc_freq": dict(self._doc_freq),
            "total_docs": self._total_docs,
        }
        self.db_path.write_text(
            json.dumps(data, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    def _load(self):
        """Load from JSON file if exists."""
        if not self.db_path.is_file():
            return
        try:
            data = json.loads(self.db_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return

        for cid, cd in data.get("chunks", {}).items():
            self._chunks[cid] = Chunk(**cd)
        self._tfidf_vectors = data.get("tfidf_vectors", {})
        self._doc_freq = Counter(data.get("doc_freq", {}))
        self._total_docs = data.get("total_docs", 0)


# ─── sqlite-vec Backend (Optional) ──────────────────────────────────

class SqliteVecStore(VectorStoreBackend):
    """sqlite-vec backed vector store.

    Requires: pip install sqlite-vec
    Provides true ANN (approximate nearest neighbor) search.
    """

    def __init__(self, db_path: Path, dimensions: int = 384):
        self.db_path = db_path
        self.dimensions = dimensions
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        import sqlite_vec  # type: ignore

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path))
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)

        conn.executescript("""
            CREATE TABLE IF NOT EXISTS chunks (
                chunk_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                level INTEGER NOT NULL,
                content TEXT NOT NULL,
                heading TEXT NOT NULL,
                parent_chunk_id TEXT,
                sibling_chunk_ids TEXT,
                token_estimate INTEGER,
                content_hash TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_level ON chunks(level);
        """)

        # Create virtual vector table
        conn.execute(f"""
            CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors
            USING vec0(chunk_id TEXT PRIMARY KEY, embedding float[{self.dimensions}])
        """)

        conn.commit()
        return conn

    def upsert(self, chunks: list[Chunk], vectors: list[list[float]]) -> int:
        """Insert or update chunks with their embedding vectors."""
        count = 0
        for chunk, vec in zip(chunks, vectors):
            # Upsert chunk metadata
            self._conn.execute("""
                INSERT OR REPLACE INTO chunks
                (chunk_id, doc_id, level, content, heading,
                 parent_chunk_id, sibling_chunk_ids, token_estimate, content_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                chunk.chunk_id, chunk.doc_id, chunk.level, chunk.content,
                chunk.heading, chunk.parent_chunk_id,
                json.dumps(chunk.sibling_chunk_ids),
                chunk.token_estimate, chunk.content_hash,
            ))

            # Upsert vector (delete + insert for virtual table)
            self._conn.execute(
                "DELETE FROM chunk_vectors WHERE chunk_id = ?",
                (chunk.chunk_id,),
            )
            import struct
            vec_bytes = struct.pack(f"{len(vec)}f", *vec)
            self._conn.execute(
                "INSERT INTO chunk_vectors (chunk_id, embedding) VALUES (?, ?)",
                (chunk.chunk_id, vec_bytes),
            )
            count += 1

        self._conn.commit()
        return count

    def search(self, query_vector: list[float], top_k: int = 5,
               level: int | None = None,
               doc_id: str | None = None) -> list[tuple[Chunk, float]]:
        """ANN search using sqlite-vec."""
        import struct
        vec_bytes = struct.pack(f"{len(query_vector)}f", *query_vector)

        # sqlite-vec KNN query
        rows = self._conn.execute("""
            SELECT chunk_id, distance
            FROM chunk_vectors
            WHERE embedding MATCH ?
            ORDER BY distance
            LIMIT ?
        """, (vec_bytes, top_k * 3)).fetchall()

        results: list[tuple[Chunk, float]] = []
        for chunk_id, distance in rows:
            chunk = self.get_chunk(chunk_id)
            if chunk is None:
                continue
            if level is not None and chunk.level != level:
                continue
            if doc_id is not None and chunk.doc_id != doc_id:
                continue
            # Convert distance to similarity score (0-1)
            score = 1.0 / (1.0 + distance)
            results.append((chunk, score))

        return results[:top_k]

    def get_chunk(self, chunk_id: str) -> Chunk | None:
        row = self._conn.execute(
            "SELECT * FROM chunks WHERE chunk_id = ?", (chunk_id,)
        ).fetchone()
        if not row:
            return None
        return self._row_to_chunk(row)

    def get_siblings(self, chunk_id: str, window: int = 1) -> list[Chunk]:
        chunk = self.get_chunk(chunk_id)
        if not chunk or not chunk.sibling_chunk_ids:
            return []
        placeholders = ",".join("?" * min(len(chunk.sibling_chunk_ids), window * 2))
        rows = self._conn.execute(
            f"SELECT * FROM chunks WHERE chunk_id IN ({placeholders})",
            chunk.sibling_chunk_ids[:window * 2],
        ).fetchall()
        return [self._row_to_chunk(r) for r in rows]

    def delete_doc(self, doc_id: str) -> int:
        chunk_ids = [r[0] for r in self._conn.execute(
            "SELECT chunk_id FROM chunks WHERE doc_id = ?", (doc_id,)
        ).fetchall()]

        if chunk_ids:
            placeholders = ",".join("?" * len(chunk_ids))
            self._conn.execute(
                f"DELETE FROM chunk_vectors WHERE chunk_id IN ({placeholders})",
                chunk_ids,
            )
            self._conn.execute(
                "DELETE FROM chunks WHERE doc_id = ?", (doc_id,),
            )
            self._conn.commit()
        return len(chunk_ids)

    def stats(self) -> dict[str, Any]:
        total = self._conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        docs = self._conn.execute(
            "SELECT COUNT(DISTINCT doc_id) FROM chunks"
        ).fetchone()[0]
        levels = dict(self._conn.execute(
            "SELECT level, COUNT(*) FROM chunks GROUP BY level"
        ).fetchall())
        return {
            "backend": "sqlite-vec",
            "total_chunks": total,
            "total_docs": docs,
            "chunks_by_level": levels,
            "dimensions": self.dimensions,
            "db_path": str(self.db_path),
        }

    def _row_to_chunk(self, row: tuple) -> Chunk:
        return Chunk(
            chunk_id=row[0],
            doc_id=row[1],
            level=row[2],
            content=row[3],
            heading=row[4],
            parent_chunk_id=row[5],
            sibling_chunk_ids=json.loads(row[6]) if row[6] else [],
            token_estimate=row[7],
            content_hash=row[8],
        )


# ─── Store Factory ──────────────────────────────────────────────────

def create_store(db_dir: Path, backend: str = "auto") -> VectorStoreBackend:
    """Create vector store with automatic backend selection.

    backend: "auto" | "sqlite-vec" | "tfidf"
    """
    if backend == "auto":
        try:
            import sqlite_vec  # type: ignore  # noqa: F401
            backend = "sqlite-vec"
        except ImportError:
            backend = "tfidf"

    if backend == "sqlite-vec":
        return SqliteVecStore(db_dir / "vectors.db")
    else:
        return TFIDFStore(db_dir / "tfidf_index.json")


# ─── Text Utilities ──────────────────────────────────────────────────

_WORD_RE = re.compile(r"[a-zA-Z_]\w+|[\u4e00-\u9fff]", re.UNICODE)


def _tokenize(text: str) -> list[str]:
    """Simple tokenizer: extract words and CJK characters."""
    return [w.lower() for w in _WORD_RE.findall(text)]


def _cosine_similarity(a: dict[str, float], b: dict[str, float]) -> float:
    """Cosine similarity between two sparse TF-IDF vectors."""
    common = set(a.keys()) & set(b.keys())
    if not common:
        return 0.0
    dot = sum(a[k] * b[k] for k in common)
    norm_a = math.sqrt(sum(v * v for v in a.values()))
    norm_b = math.sqrt(sum(v * v for v in b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
