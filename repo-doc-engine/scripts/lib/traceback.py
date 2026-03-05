"""Traceback Identity System — frontmatter R/W + source hash computation.

Manages the doc ↔ code binding via YAML frontmatter embedded in markdown files.
Uses git tree hashes for O(1) directory-level staleness detection.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ─── Frontmatter Parsing ────────────────────────────────────────────

_FM_FENCE = re.compile(r"^---\s*$", re.MULTILINE)


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Extract YAML frontmatter from markdown text.

    Returns (metadata_dict, body_without_frontmatter).
    If no frontmatter found, returns ({}, original_text).
    """
    if not text.startswith("---"):
        return {}, text

    # Find closing fence (skip the opening one)
    matches = list(_FM_FENCE.finditer(text))
    if len(matches) < 2:
        return {}, text

    fm_start = matches[0].end()
    fm_end = matches[1].start()
    body_start = matches[1].end()

    fm_text = text[fm_start:fm_end].strip()
    body = text[body_start:].lstrip("\n")

    # Minimal YAML parser (stdlib only — no PyYAML dependency)
    meta = _parse_simple_yaml(fm_text)
    return meta, body


def _parse_simple_yaml(text: str) -> dict[str, Any]:
    """Parse a flat/shallow YAML structure using only stdlib.

    Supports: strings, integers, lists (inline [...] or block - items),
    nested dicts (one level), null/true/false.
    """
    result: dict[str, Any] = {}
    lines = text.split("\n")
    i = 0
    current_key = None
    current_list: list[str] | None = None

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip empty lines and comments
        if not stripped or stripped.startswith("#"):
            i += 1
            continue

        # Block list item (  - value)
        if stripped.startswith("- ") and current_key is not None:
            if current_list is None:
                current_list = []
            current_list.append(_yaml_value(stripped[2:].strip()))
            result[current_key] = current_list
            i += 1
            continue

        # Key: value pair
        if ":" in stripped and not stripped.startswith("-"):
            # Flush pending list
            if current_list is not None:
                current_list = None

            colon_idx = stripped.index(":")
            key = stripped[:colon_idx].strip()
            raw_val = stripped[colon_idx + 1:].strip()

            current_key = key

            if raw_val == "" or raw_val == "|":
                # Could be block list or nested dict — look ahead
                result[key] = None
                current_list = None
            elif raw_val.startswith("[") and raw_val.endswith("]"):
                # Inline list: [a, b, c]
                items_str = raw_val[1:-1]
                items = [_yaml_value(v.strip().strip('"').strip("'"))
                         for v in items_str.split(",") if v.strip()]
                result[key] = items
                current_list = None
            else:
                result[key] = _yaml_value(raw_val)
                current_list = None

        i += 1

    return result


def _yaml_value(raw: str) -> Any:
    """Convert a raw YAML value string to a Python type."""
    if raw in ("null", "~", ""):
        return None
    if raw in ("true", "True", "yes"):
        return True
    if raw in ("false", "False", "no"):
        return False
    # Quoted string
    if (raw.startswith('"') and raw.endswith('"')) or \
       (raw.startswith("'") and raw.endswith("'")):
        return raw[1:-1]
    # Integer
    try:
        return int(raw)
    except ValueError:
        pass
    return raw


def format_frontmatter(meta: dict[str, Any]) -> str:
    """Serialize metadata dict to YAML frontmatter string."""
    lines = ["---"]
    for key, val in meta.items():
        if val is None:
            lines.append(f"{key}:")
        elif isinstance(val, bool):
            lines.append(f"{key}: {'true' if val else 'false'}")
        elif isinstance(val, int):
            lines.append(f"{key}: {val}")
        elif isinstance(val, list):
            if not val:
                lines.append(f"{key}: []")
            elif all(isinstance(v, str) and len(v) < 60 for v in val):
                # Short items → inline
                items = ", ".join(f'"{v}"' for v in val)
                lines.append(f"{key}: [{items}]")
            else:
                lines.append(f"{key}:")
                for item in val:
                    lines.append(f"  - {item}")
        elif isinstance(val, dict):
            lines.append(f"{key}:")
            for k, v in val.items():
                if isinstance(v, list):
                    lines.append(f"  {k}:")
                    for item in v:
                        lines.append(f"    - {item}")
                elif v is None:
                    lines.append(f"  {k}:")
                else:
                    lines.append(f"  {k}: {v}")
        else:
            # String — quote if contains special chars
            s = str(val)
            if any(c in s for c in ":#{}[]|>&*!%@`"):
                lines.append(f'{key}: "{s}"')
            else:
                lines.append(f"{key}: {s}")
    lines.append("---")
    return "\n".join(lines)


def inject_frontmatter(content: str, meta: dict[str, Any]) -> str:
    """Replace or inject frontmatter in markdown content."""
    _, body = parse_frontmatter(content)
    return format_frontmatter(meta) + "\n" + body


def read_doc_meta(filepath: Path) -> dict[str, Any] | None:
    """Read traceback frontmatter from a markdown file.

    Returns None if file has no traceback metadata (no doc_id field).
    """
    try:
        text = filepath.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    meta, _ = parse_frontmatter(text)
    if "doc_id" not in meta:
        return None
    meta["_filepath"] = str(filepath)
    return meta


# ─── Source Hash Computation ─────────────────────────────────────────

def compute_source_hash(repo_root: Path, source_paths: list[str],
                        commit: str = "HEAD") -> str:
    """Compute aggregate hash over source_paths using git tree hashes.

    Uses `git ls-tree` for O(1) directory-level hashing.
    Falls back to file content hash for untracked files.
    """
    hashes: list[str] = []

    for sp in sorted(source_paths):
        full_path = repo_root / sp
        result = subprocess.run(
            ["git", "ls-tree", commit, "--", sp],
            capture_output=True, text=True, cwd=repo_root,
        )
        if result.returncode == 0 and result.stdout.strip():
            for line in result.stdout.strip().split("\n"):
                parts = line.split()
                if len(parts) >= 3:
                    hashes.append(parts[2])  # tree/blob hash
        elif full_path.exists():
            # Untracked file/dir — hash content directly
            if full_path.is_file():
                content = full_path.read_bytes()
                hashes.append(hashlib.sha256(content).hexdigest())
            elif full_path.is_dir():
                # Hash directory listing
                entries = sorted(str(p.relative_to(full_path))
                                 for p in full_path.rglob("*") if p.is_file())
                hashes.append(hashlib.sha256(
                    "\n".join(entries).encode()
                ).hexdigest())

    if not hashes:
        return "0" * 12

    combined = ":".join(hashes)
    return hashlib.sha256(combined.encode()).hexdigest()[:12]


def get_head_commit(repo_root: Path) -> str:
    """Return current HEAD commit SHA."""
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True, text=True, cwd=repo_root,
    )
    return result.stdout.strip() if result.returncode == 0 else "unknown"


def now_iso() -> str:
    """ISO 8601 timestamp with timezone."""
    return datetime.now(timezone.utc).astimezone().isoformat()


# ─── Doc Metadata Builder ────────────────────────────────────────────

@dataclass
class DocMeta:
    """Structured representation of a document's traceback metadata."""
    doc_id: str
    source_paths: list[str] = field(default_factory=list)
    source_tree_hash: str = ""
    last_sync_commit: str = ""
    sync_timestamp: str = ""
    doc_version: int = 1
    status: str = "draft"
    filepath: str = ""
    # Optional vector mode fields
    vector: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "doc_id": self.doc_id,
            "source_paths": self.source_paths,
            "source_tree_hash": self.source_tree_hash,
            "last_sync_commit": self.last_sync_commit,
            "sync_timestamp": self.sync_timestamp,
            "doc_version": self.doc_version,
            "status": self.status,
        }
        if self.filepath:
            d["filepath"] = self.filepath
        if self.vector:
            d["vector"] = self.vector
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> DocMeta:
        return cls(
            doc_id=d.get("doc_id", ""),
            source_paths=d.get("source_paths", []),
            source_tree_hash=d.get("source_tree_hash", ""),
            last_sync_commit=d.get("last_sync_commit", ""),
            sync_timestamp=d.get("sync_timestamp", ""),
            doc_version=d.get("doc_version", 1),
            status=d.get("status", "draft"),
            filepath=d.get("filepath", d.get("_filepath", "")),
            vector=d.get("vector"),
        )

    def refresh_hash(self, repo_root: Path) -> bool:
        """Recompute source hash. Returns True if changed."""
        new_hash = compute_source_hash(repo_root, self.source_paths)
        if new_hash != self.source_tree_hash:
            self.source_tree_hash = new_hash
            self.last_sync_commit = get_head_commit(repo_root)
            self.sync_timestamp = now_iso()
            return True
        return False
