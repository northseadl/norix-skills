"""Document Registry — scan, query, and persist the doc-code mapping.

The registry is the single source of truth for all traceable documents.
Read operations (status, find) are pure views with ZERO side-effects.
Write operations are only triggered by explicit bind/apply commands.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from lib.identity import (
    DocMeta,
    compute_source_hash,
    now_iso,
    read_doc_meta,
)


ENGINE_DIR = ".doc-sentinel"
REGISTRY_FILE = "registry.json"
LAST_SYNC_FILE = "last_sync_commit"
CHANGE_LOG_FILE = "change_log.json"

IGNORE_DIRS = {
    ".git", ".doc-sentinel", ".doc-engine",
    "node_modules", "__pycache__", ".venv",
    ".brainstorm", ".agent-team",
}
IGNORE_FILES = {".DS_Store"}


@dataclass
class DocRegistry:
    """Central registry of all traceable documents."""
    docs: dict[str, DocMeta] = field(default_factory=dict)
    repo_root: Path = field(default_factory=Path)

    # ─── Scanning ────────────────────────────────────────────────

    @classmethod
    def scan(cls, repo_root: Path) -> DocRegistry:
        """Scan repository for all markdown files with traceback frontmatter."""
        registry = cls(repo_root=repo_root.resolve())
        for md_file in _walk_markdown_files(repo_root):
            meta = read_doc_meta(md_file)
            if meta is None:
                continue
            doc = DocMeta.from_dict(meta)
            doc.filepath = str(md_file)
            registry.docs[doc.doc_id] = doc
        return registry

    def all_docs(self) -> list[DocMeta]:
        """All documents sorted by doc_id."""
        return sorted(self.docs.values(), key=lambda d: d.doc_id)

    # ─── Query (pure read, zero side-effects) ────────────────────

    def find_by_source(self, source_path: str) -> list[DocMeta]:
        """Find all documents tracking a given source path.

        Uses boundary-safe matching to prevent 'src' matching 'src10'.
        """
        results = []
        normalized = source_path.rstrip("/")
        for doc in self.docs.values():
            for sp in doc.source_paths:
                sp_norm = sp.rstrip("/")
                if normalized == sp_norm:
                    results.append(doc)
                    break
                if normalized.startswith(sp_norm + "/"):
                    results.append(doc)
                    break
                if sp_norm.startswith(normalized + "/"):
                    results.append(doc)
                    break
        return results

    def find_parent_doc(self, source_path: str) -> DocMeta | None:
        """Find the most specific parent document for a source path."""
        best: DocMeta | None = None
        best_depth = -1
        normalized = source_path.rstrip("/")
        for doc in self.docs.values():
            for sp in doc.source_paths:
                sp_norm = sp.rstrip("/")
                if normalized == sp_norm or normalized.startswith(sp_norm + "/"):
                    depth = sp_norm.count("/")
                    if depth > best_depth:
                        best = doc
                        best_depth = depth
        return best

    def find_by_status(self, status: str) -> list[DocMeta]:
        """Find all documents with a given status."""
        return [d for d in self.docs.values() if d.status == status]

    def get(self, doc_id: str) -> DocMeta | None:
        """Get a document by its doc_id."""
        return self.docs.get(doc_id)

    # ─── Staleness Check (read-only view, NO mutation) ───────────

    def check_staleness(self) -> dict[str, str]:
        """Compute staleness of all documents WITHOUT modifying any state.

        Returns: {doc_id: "synced" | "stale" | "source_missing" | "draft"}
        """
        results: dict[str, str] = {}
        for doc_id, doc in self.docs.items():
            if not doc.source_paths:
                results[doc_id] = "draft"
                continue

            any_exists = any(
                (self.repo_root / sp).exists() for sp in doc.source_paths
            )
            if not any_exists:
                results[doc_id] = "source_missing"
                continue

            current_hash = compute_source_hash(self.repo_root, doc.source_paths)
            results[doc_id] = "synced" if current_hash == doc.source_tree_hash else "stale"

        return results

    # ─── Health Report (read-only) ───────────────────────────────

    def health_report(self) -> dict[str, Any]:
        """Generate a health report. Pure read-only, no side-effects."""
        statuses = self.check_staleness()
        total = len(statuses)
        counts: dict[str, int] = {}
        for s in statuses.values():
            counts[s] = counts.get(s, 0) + 1

        return {
            "total": total,
            "by_status": counts,
            "synced_pct": round(counts.get("synced", 0) / total * 100, 1)
                          if total > 0 else 0,
            "docs": [
                {
                    "doc_id": doc_id,
                    "status": status,
                    "source_paths": self.docs[doc_id].source_paths,
                    "filepath": self.docs[doc_id].filepath,
                }
                for doc_id, status in sorted(statuses.items())
            ],
        }

    # ─── Persistence ─────────────────────────────────────────────

    def save(self, repo_root: Path | None = None) -> Path:
        """Persist registry to .doc-sentinel/registry.json."""
        root = repo_root or self.repo_root
        engine_dir = root / ENGINE_DIR
        engine_dir.mkdir(parents=True, exist_ok=True)

        data = {
            "repo_root": str(root),
            "scan_timestamp": now_iso(),
            "docs": {
                doc_id: doc.to_dict()
                for doc_id, doc in sorted(self.docs.items())
            },
        }

        registry_path = engine_dir / REGISTRY_FILE
        registry_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return registry_path

    @classmethod
    def load(cls, repo_root: Path) -> DocRegistry | None:
        """Load registry from .doc-sentinel/registry.json."""
        registry_path = repo_root / ENGINE_DIR / REGISTRY_FILE
        if not registry_path.is_file():
            return None

        try:
            data = json.loads(registry_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

        registry = cls(repo_root=repo_root.resolve())
        for doc_id, doc_data in data.get("docs", {}).items():
            doc = DocMeta.from_dict(doc_data)
            registry.docs[doc_id] = doc
        return registry

    # ─── Last Sync Commit ─────────────────────────────────────────

    @staticmethod
    def get_last_sync_commit(repo_root: Path) -> str | None:
        """Read the last sync commit SHA."""
        path = repo_root / ENGINE_DIR / LAST_SYNC_FILE
        if path.is_file():
            return path.read_text(encoding="utf-8").strip()
        return None

    @staticmethod
    def save_last_sync_commit(repo_root: Path, commit: str) -> None:
        """Write the last sync commit SHA."""
        engine_dir = repo_root / ENGINE_DIR
        engine_dir.mkdir(parents=True, exist_ok=True)
        (engine_dir / LAST_SYNC_FILE).write_text(commit + "\n", encoding="utf-8")


# ─── Helpers ──────────────────────────────────────────────────────────

def _walk_markdown_files(root: Path) -> list[Path]:
    """Walk repository and collect .md files, respecting ignore rules."""
    results: list[Path] = []
    for entry in sorted(root.iterdir(), key=lambda p: p.name):
        if entry.name in IGNORE_DIRS or entry.name in IGNORE_FILES:
            continue
        if entry.name.startswith(".") and entry.is_dir():
            continue
        if entry.is_file() and entry.suffix == ".md":
            results.append(entry)
        elif entry.is_dir():
            results.extend(_walk_markdown_files(entry))
    return results
